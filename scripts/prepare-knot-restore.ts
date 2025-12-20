#!/usr/bin/env tsx

import { run, command, string, option, optional, positional } from 'cmd-ts';
import { $, chalk, fs, path } from 'zx';
import { tmpdir } from 'os';

// Configure zx
$.verbose = false;

const app = command({
  name: 'prepare-knot-restore',
  description: 'Prepare a pod for Knot DNS zone restore by copying zones.tar.gz from a backup',
  args: {
    backupFile: positional({
      type: string,
      displayName: 'backup-file',
      description: 'Backup file path (full knot backup or zones.tar.gz)',
    }),
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
  },
  handler: async ({ backupFile, context, statefulset, namespace }) => {
    try {
      await prepareKnotRestore({
        backupFile,
        context,
        statefulset,
        namespace,
      });

      console.log(chalk.green('\n=== Preparation Complete ===\n'));
      console.log(chalk.white('The backup has been copied to the pod at:'));
      console.log(chalk.white('  /var/lib/knot/zones/zones.tar.gz\n'));
      console.log(chalk.white('To restore the zones:'));
      console.log(chalk.white(`  1. Restart the pod: kubectl --context=${context} delete pod ${statefulset}-0 -n ${namespace}`));
      console.log(chalk.white('  2. The postStart hook will restore zones and merge static records'));
      console.log(chalk.white(`  3. Check logs: kubectl --context=${context} logs ${statefulset}-0 -n ${namespace} -c knot-auth\n`));
      console.log(chalk.green('✓ Ready for restore!'));

      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`\n✗ Preparation failed: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  },
});

async function prepareKnotRestore(config: {
  backupFile: string;
  context: string;
  statefulset: string;
  namespace: string;
}): Promise<void> {
  const { backupFile, context, statefulset, namespace } = config;
  const podName = `${statefulset}-0`;
  const tempDir = path.join(tmpdir(), `prepare-restore-${Date.now()}`);

  console.log(chalk.green('=== Prepare Knot DNS Zone Restore ==='));
  console.log(chalk.white(`Backup file: ${backupFile}`));
  console.log(chalk.white(`Context: ${context}`));
  console.log(chalk.white(`StatefulSet: ${statefulset}`));
  console.log(chalk.white(`Namespace: ${namespace}`));
  console.log(chalk.white(`Pod: ${podName}\n`));

  try {
    // Check if backup file exists
    if (!await fs.pathExists(backupFile)) {
      throw new Error(`Backup file not found: ${backupFile}`);
    }

    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

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

    // Extract backup
    console.log(chalk.yellow('Extracting zones from backup...'));

    // Check backup format
    const tarList = await $`tar tzf ${backupFile}`;
    const backupContents = tarList.stdout;

    let zonesTarPath: string;

    if (backupContents.includes('restore-scripts/')) {
      // New script-based backup format
      zonesTarPath = backupFile;
      console.log(chalk.green('✓ Using script-based backup format\n'));
    } else if (backupContents.includes('knot-backup/')) {
      // Old full knot backup - extract and create zones.tar.gz
      await $`tar xzf ${backupFile} -C ${tempDir}`;
      const knotBackupDir = path.join(tempDir, 'knot-backup');
      zonesTarPath = path.join(tempDir, 'zones.tar.gz');
      await $`tar czf ${zonesTarPath} -C ${knotBackupDir} zonefiles`;
      console.log(chalk.green('✓ Extracted zones from full backup\n'));
    } else if (backupContents.includes('zonefiles/')) {
      // Old zone files format
      zonesTarPath = backupFile;
      console.log(chalk.green('✓ Using zones backup directly\n'));
    } else {
      throw new Error('Backup format not recognized (expected restore-scripts/, knot-backup/, or zonefiles/)');
    }

    // Show what's in the backup
    console.log(chalk.yellow('Contents in backup:'));
    const zonesList = await $`tar tzf ${zonesTarPath}`;
    const items = zonesList.stdout
      .split('\n')
      .filter(line => line.endsWith('.zone') || line.endsWith('.sh'))
      .map(line => line.replace('zonefiles/', '').replace('restore-scripts/', ''));

    items.forEach(item => {
      if (item) console.log(chalk.white(`  - ${item}`));
    });
    console.log('');

    // Copy zones.tar.gz to pod
    console.log(chalk.yellow('Copying zones.tar.gz to pod...'));
    await $`kubectl --context=${context} cp ${zonesTarPath} ${namespace}/${podName}:/var/lib/knot/zones/zones.tar.gz -c knot-auth`;
    console.log(chalk.green('✓ Backup copied to pod\n'));

    // Verify the file exists in the pod
    console.log(chalk.yellow('Verifying backup file in pod...'));
    const lsResult = await $`kubectl --context=${context} exec -n ${namespace} ${podName} -c knot-auth -- ls -lh /var/lib/knot/zones/zones.tar.gz`;
    const size = lsResult.stdout.split(/\s+/)[4];
    console.log(chalk.green(`✓ Backup file present in pod (${size})\n`));

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

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

// Run the CLI
run(app, process.argv.slice(2));
