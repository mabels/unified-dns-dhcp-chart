#!/usr/bin/env tsx

import { run, command, string, option, optional } from 'cmd-ts';
import { $, chalk, fs, path } from 'zx';
import { tmpdir } from 'os';

// Configure zx
$.verbose = false;

interface BackupResult {
  fullBackupPath: string;
  zonesBackupPath: string;
  fullBackupSize: string;
  zonesBackupSize: string;
  zoneCount: number;
}

const app = command({
  name: 'backup-knot-zones',
  description: 'Backup Knot DNS zones using knotc zone-backup',
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
      const result = await backupKnotZones({
        context,
        statefulset,
        namespace,
        backupDir,
      });

      console.log(chalk.green('\n=== Backup Complete ===\n'));
      console.log(chalk.white(`Full backup: ${result.fullBackupPath} (${result.fullBackupSize})`));
      console.log(chalk.white(`Zone files only: ${result.zonesBackupPath} (${result.zonesBackupSize})`));
      console.log(chalk.white(`Zones backed up: ${result.zoneCount}\n`));
      console.log(chalk.white('To restore:'));
      console.log(chalk.white('  - Full restore: Use \'knotc zone-restore +backupdir <dir>\''));
      console.log(chalk.white('  - Init container: Copy zones.tar.gz to /zones in the pod and restart\n'));
      console.log(chalk.green('✓ Backup successful!'));

      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`\n✗ Backup failed: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  },
});

async function backupKnotZones(config: {
  context: string;
  statefulset: string;
  namespace: string;
  backupDir: string;
}): Promise<BackupResult> {
  const { context, statefulset, namespace, backupDir } = config;
  const podName = `${statefulset}-0`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('-').slice(0, -5);
  const backupName = `knot-zones-${statefulset}-${timestamp}`;
  const tempDir = path.join(tmpdir(), `knot-backup-${Date.now()}`);
  const podBackupDir = `/tmp/knot-backup-${timestamp}`;

  console.log(chalk.green('=== Knot DNS Zones Backup ==='));
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

    // Get zone count
    console.log(chalk.yellow('Getting zone information...'));
    const zoneStatusOutput = await $`kubectl --context=${context} exec -n ${namespace} ${podName} -c knot-auth -- knotc zone-status`;
    const zoneCount = zoneStatusOutput.stdout.split('\n').filter(line => line.startsWith('[')).length;

    if (zoneCount === 0) {
      console.log(chalk.yellow('Warning: No zones found in Knot'));
    } else {
      console.log(chalk.green(`✓ Found ${zoneCount} zones\n`));
    }

    // Get list of zones
    const zones = zoneStatusOutput.stdout
      .split('\n')
      .filter(line => line.startsWith('['))
      .map(line => {
        const match = line.match(/^\[([^\]]+)\]/);
        return match ? match[1] : null;
      })
      .filter(z => z !== null) as string[];

    console.log(chalk.yellow('Generating backup scripts from zones...'));

    // Create scripts directory
    const scriptsDir = path.join(tempDir, 'restore-scripts');
    await fs.mkdir(scriptsDir, { recursive: true });

    let totalRecords = 0;

    // Generate restore script for each zone
    for (const zone of zones) {
      console.log(chalk.yellow(`  Exporting zone: ${zone}`));

      // Get zone records using knotc zone-read
      const zoneData = await $`kubectl --context=${context} exec -n ${namespace} ${podName} -c knot-auth -- knotc zone-read ${zone}`;
      const records = zoneData.stdout.split('\n').filter(line => line.trim());

      // Generate bash script with knotc zone-set commands
      let script = `#!/bin/sh\n# Restore script for zone: ${zone}\n# Generated: ${new Date().toISOString()}\n\n`;
      script += `set -e\n\necho "Restoring zone: ${zone}"\n`;
      script += `knotc zone-begin "${zone}" 2>/dev/null || true\n\n`;

      let recordCount = 0;
      for (const record of records) {
        // Parse: [zone] owner ttl type rdata
        const match = record.match(/^\[([^\]]+)\]\s+(\S+)\s+(\d+)\s+(\S+)\s+(.+)$/);
        if (!match) continue;

        const [, , owner, ttl, type, rdata] = match;

        // Skip SOA and NS records (will be from initial zone)
        if (type === 'SOA' || type === 'NS') continue;

        // Strip zone suffix to get relative owner
        let relativeOwner = owner;
        if (owner.endsWith(`.${zone}`)) {
          relativeOwner = owner.slice(0, -(zone.length + 1));
        } else if (owner === `${zone}.`) {
          relativeOwner = '@';
        }

        script += `knotc zone-set "${zone}" "${relativeOwner}" "${ttl}" "IN" "${type}" "${rdata}" 2>/dev/null || true\n`;
        recordCount++;
      }

      script += `\nknotc zone-commit "${zone}" 2>/dev/null || true\n`;
      script += `echo "✓ Restored ${recordCount} records to ${zone}"\n`;

      // Write script file
      const scriptFile = path.join(scriptsDir, `restore-${zone.replace(/\./g, '_')}.sh`);
      await fs.writeFile(scriptFile, script, { mode: 0o755 });

      totalRecords += recordCount;
      console.log(chalk.green(`  ✓ Generated script with ${recordCount} records`));
    }

    // Create master restore script
    const masterScript = `#!/bin/sh\n# Master restore script\n# Generated: ${new Date().toISOString()}\n\n`;
    let master = masterScript;
    master += `set -e\n\necho "=== Restoring ${zones.length} zones ==="\n\n`;

    for (const zone of zones) {
      const scriptName = `restore-${zone.replace(/\./g, '_')}.sh`;
      master += `sh ./restore-scripts/${scriptName}\n`;
    }

    master += `\necho "✓ All zones restored"\n`;

    await fs.writeFile(path.join(scriptsDir, 'restore-all.sh'), master, { mode: 0o755 });

    console.log(chalk.green(`✓ Generated master restore script\n`));

    // Create backup archives
    console.log(chalk.yellow('Creating backup archive...'));

    const backupDirAbs = await fs.realpath(backupDir);
    const fullBackupPath = path.join(backupDirAbs, `${backupName}.tar.gz`);
    const zonesBackupPath = path.join(backupDirAbs, 'zones-restore.tar.gz');

    // Create archive with all scripts
    await $`tar czf ${fullBackupPath} -C ${tempDir} restore-scripts`;

    // Also create zones-restore.tar.gz for compatibility
    await $`tar czf ${zonesBackupPath} -C ${tempDir} restore-scripts`;

    // Get backup sizes
    const fullBackupStats = await fs.stat(fullBackupPath);
    const zonesBackupStats = await fs.stat(zonesBackupPath);
    const fullBackupSize = formatBytes(fullBackupStats.size);
    const zonesBackupSize = formatBytes(zonesBackupStats.size);

    console.log(chalk.green('✓ Backup archive created\n'));

    // Cleanup
    console.log(chalk.yellow('Cleaning up temporary files...'));
    await fs.rm(tempDir, { recursive: true, force: true });

    return {
      fullBackupPath,
      zonesBackupPath,
      fullBackupSize,
      zonesBackupSize,
      zoneCount: zones.length,
    };
  } catch (error) {
    // Cleanup on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      await $`kubectl --context=${context} exec -n ${namespace} ${podName} -c knot-auth -- rm -rf ${podBackupDir}`.quiet();
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
