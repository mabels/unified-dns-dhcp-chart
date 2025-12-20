#!/usr/bin/env tsx

import { run, command, string, option, optional } from 'cmd-ts';
import { $, chalk, fs, path } from 'zx';
import { tmpdir } from 'os';

// Configure zx
$.verbose = false;

interface LeaseBackupResult {
  fullBackupPath: string;
  leasesBackupPath: string;
  fullBackupSize: string;
  leasesBackupSize: string;
  leaseCount: number;
}

const app = command({
  name: 'backup-kea-leases',
  description: 'Backup Kea DHCP leases using HTTP API and generate restore scripts',
  args: {
    context: option({
      type: optional(string),
      long: 'context',
      short: 'c',
      description: 'Kubernetes context',
      defaultValue: () => 'my-cluster',
    }),
    statefulset: option({
      type: optional(string),
      long: 'statefulset',
      short: 's',
      description: 'StatefulSet name',
      defaultValue: () => 'unified-dns-dhcp',
    }),
    namespace: option({
      type: optional(string),
      long: 'namespace',
      short: 'n',
      description: 'Kubernetes namespace',
      defaultValue: () => 'dns-dhcp',
    }),
    backupDir: option({
      type: optional(string),
      long: 'backup-dir',
      short: 'b',
      description: 'Backup directory',
      defaultValue: () => './backups',
    }),
  },
  handler: async ({ context, statefulset, namespace, backupDir }) => {
    try {
      const result = await backupKeaLeases({
        context,
        statefulset,
        namespace,
        backupDir,
      });

      console.log(chalk.green('\n=== Backup Complete ===\n'));
      console.log(chalk.white(`Full backup: ${result.fullBackupPath} (${result.fullBackupSize})`));
      console.log(chalk.white(`Leases only: ${result.leasesBackupPath} (${result.leasesBackupSize})`));
      console.log(chalk.white(`Leases backed up: ${result.leaseCount}\n`));
      console.log(chalk.white('To restore:'));
      console.log(chalk.white('  - Copy kea-leases.tar.gz to pod and extract'));
      console.log(chalk.white('  - Run: sh ./restore-scripts/restore-all.sh\n'));
      console.log(chalk.green('✓ Backup successful!'));

      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`\n✗ Backup failed: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  },
});

async function backupKeaLeases(config: {
  context: string;
  statefulset: string;
  namespace: string;
  backupDir: string;
}): Promise<LeaseBackupResult> {
  const { context, statefulset, namespace, backupDir } = config;
  const podName = `${statefulset}-0`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('-').slice(0, -5);
  const backupName = `kea-leases-${statefulset}-${timestamp}`;
  const tempDir = path.join(tmpdir(), `kea-backup-${Date.now()}`);

  console.log(chalk.green('=== Kea DHCP Leases Backup ==='));
  console.log(chalk.white(`Context: ${context}`));
  console.log(chalk.white(`StatefulSet: ${statefulset}`));
  console.log(chalk.white(`Namespace: ${namespace}`));
  console.log(chalk.white(`Pod: ${podName}`));
  console.log(chalk.white(`Backup Directory: ${backupDir}\n`));

  try {
    // Create temp and backup directories
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(backupDir, { recursive: true });

    // Check if pod exists and is running
    console.log(chalk.yellow('Checking if pod exists...'));
    try {
      await $`kubectl --context=${context} get pod ${podName} -n ${namespace}`;
    } catch {
      throw new Error(`Pod ${podName} not found`);
    }

    const podStatus = await $`kubectl --context=${context} get pod ${podName} -n ${namespace} -o jsonpath='{.status.phase}'`;
    if (podStatus.stdout.trim() !== 'Running') {
      throw new Error(`Pod ${podName} is not running (status: ${podStatus.stdout.trim()})`);
    }
    console.log(chalk.green('✓ Pod is running\n'));

    // Get all leases via kubectl exec
    console.log(chalk.yellow('Fetching leases from Kea...'));
    const getAllCmd = JSON.stringify({ command: 'lease4-get-all', service: ['dhcp4'] });
    const leasesResponse = await $`kubectl --context=${context} exec -n ${namespace} ${podName} -c kea-dhcp4 -- wget -q -O - --post-data=${getAllCmd} --header='Content-Type: application/json' http://127.0.0.1:8000/`;

    const leasesData = JSON.parse(leasesResponse.stdout);

    if (leasesData[0]?.result !== 0) {
      throw new Error(`Failed to get leases: ${leasesData[0]?.text || 'Unknown error'}`);
    }

    const leases = leasesData[0]?.arguments?.leases || [];

    if (leases.length === 0) {
      console.log(chalk.yellow('⚠ No leases found - creating empty backup\n'));
    } else {
      console.log(chalk.green(`✓ Found ${leases.length} leases\n`));
    }

    // Generate restore script
    console.log(chalk.yellow('Generating restore scripts...'));

    const scriptsDir = path.join(tempDir, 'restore-scripts');
    await fs.mkdir(scriptsDir, { recursive: true });

    // Create restore script
    let script = `#!/bin/sh\n# Restore script for Kea DHCP leases\n`;
    script += `# Generated: ${new Date().toISOString()}\n\n`;
    script += `set -e\n\n`;
    script += `echo "=== Restoring Kea DHCP Leases ==="\n`;
    script += `echo "Total leases to restore: ${leases.length}"\n\n`;

    let restoredCount = 0;
    for (const lease of leases) {
      // Generate lease4-add command
      const leaseData: any = {
        command: 'lease4-add',
        service: ['dhcp4'],
        arguments: {
          'ip-address': lease['ip-address'],
          'hw-address': lease['hw-address'],
          'subnet-id': Number(lease['subnet-id']),
          'valid-lft': Number(lease['valid-lft']),
          'cltt': Number(lease['cltt']),
          'fqdn-fwd': lease['fqdn-fwd'] || false,
          'fqdn-rev': lease['fqdn-rev'] || false,
          'hostname': lease['hostname'] || '',
          'state': Number(lease['state'] || 0),
        },
      };

      // Add client-id if present
      if (lease['client-id']) {
        leaseData.arguments['client-id'] = lease['client-id'];
      }

      const jsonData = JSON.stringify(leaseData).replace(/'/g, "'\\''");
      const wgetCmd = `wget -q -O /dev/null --post-data='${jsonData}' --header='Content-Type: application/json' http://127.0.0.1:8000/ 2>/dev/null || echo "  Warning: Failed to add lease ${lease['ip-address']}"`;
      script += `${wgetCmd}\n`;
      restoredCount++;

      // Add progress indicator every 10 leases
      if (restoredCount % 10 === 0) {
        script += `echo "  Restored ${restoredCount}/${leases.length} leases..."\n`;
      }
    }

    script += `\necho "✓ Restored ${leases.length} leases"\n`;

    const scriptFile = path.join(scriptsDir, 'restore-leases.sh');
    await fs.writeFile(scriptFile, script, { mode: 0o755 });

    console.log(chalk.green(`✓ Generated restore script with ${leases.length} leases\n`));

    // Create master restore script
    const masterScript = `#!/bin/sh\n# Master restore script for Kea leases\n# Generated: ${new Date().toISOString()}\n\nset -e\n\necho "=== Restoring Kea DHCP Leases ==="\n\nsh ./restore-scripts/restore-leases.sh\n\necho "✓ All leases restored"\n`;
    await fs.writeFile(path.join(scriptsDir, 'restore-all.sh'), masterScript, { mode: 0o755 });

    console.log(chalk.green('✓ Generated master restore script\n'));

    // Create backup archives
    console.log(chalk.yellow('Creating backup archive...'));

    const backupDirAbs = await fs.realpath(backupDir);
    const fullBackupPath = path.join(backupDirAbs, `${backupName}.tar.gz`);
    const leasesBackupPath = path.join(backupDirAbs, 'kea-leases.tar.gz');

    await $`tar czf ${fullBackupPath} -C ${tempDir} restore-scripts`;
    await $`tar czf ${leasesBackupPath} -C ${tempDir} restore-scripts`;

    // Get backup sizes
    const fullBackupStats = await fs.stat(fullBackupPath);
    const leasesBackupStats = await fs.stat(leasesBackupPath);
    const fullBackupSize = formatBytes(fullBackupStats.size);
    const leasesBackupSize = formatBytes(leasesBackupStats.size);

    console.log(chalk.green('✓ Backup archive created\n'));

    // Cleanup temp directory
    console.log(chalk.yellow('Cleaning up temporary files...'));
    await fs.rm(tempDir, { recursive: true, force: true });

    return {
      fullBackupPath,
      leasesBackupPath,
      fullBackupSize,
      leasesBackupSize,
      leaseCount: leases.length,
    };
  } catch (error) {
    // Cleanup on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Run the CLI
run(app, process.argv.slice(2));
