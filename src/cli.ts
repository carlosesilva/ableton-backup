#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import {
  loadConfig,
  saveConfig,
  configExists,
  CONFIG_FILE,
  DEFAULT_CONFIG,
  Config,
} from './config';
import { installCron, removeCron, isCronInstalled } from './cron';
import { runBackup } from './backup';
import logger from './logger';

const program = new Command();

program
  .name('ableton-backup')
  .description('Automatically backup Ableton Live projects')
  .version('1.0.0');

// ─── setup ───────────────────────────────────────────────────────────────────

program
  .command('setup')
  .description('Interactively configure ableton-backup settings')
  .action(async () => {
    const existing = configExists() ? loadConfig() : { ...DEFAULT_CONFIG };

    logger.info('\nAbleton Backup - Setup\n');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'abletonPath',
        message: 'Path to Ableton Live application:',
        default: existing.abletonPath,
      },
      {
        type: 'input',
        name: 'projectsPath',
        message: 'Path to your Ableton Live Projects folder:',
        default: existing.projectsPath,
      },
      {
        type: 'input',
        name: 'destinationPath',
        message: 'Backup destination path:',
        default: existing.destinationPath,
      },
      {
        type: 'input',
        name: 'nodePath',
        message: 'Path to Node.js binary used by cron:',
        default: existing.nodePath,
      },
      {
        type: 'input',
        name: 'cronFrequency',
        message: 'Cron frequency (cron expression):',
        default: existing.cronFrequency,
      },
      {
        type: 'input',
        name: 'computerName',
        message: 'Computer name (added to backup zip filename):',
        default: existing.computerName,
      },
      {
        type: 'confirm',
        name: 'active',
        message: 'Activate automatic backups now?',
        default: existing.active,
      },
    ]);

    const config: Config = {
      abletonPath: answers.abletonPath as string,
      projectsPath: answers.projectsPath as string,
      destinationPath: answers.destinationPath as string,
      nodePath: answers.nodePath as string,
      cronFrequency: answers.cronFrequency as string,
      computerName: answers.computerName as string,
      active: answers.active as boolean,
    };

    saveConfig(config);
    logger.info(`\nConfiguration saved to ${CONFIG_FILE}`);

    if (config.active) {
      installCron(config.cronFrequency, config.nodePath);
      logger.info(`Cron job installed (${config.cronFrequency})`);
    } else {
      removeCron();
      logger.warn('Automatic backups are disabled.');
    }
  });

// ─── config ──────────────────────────────────────────────────────────────────

program
  .command('config')
  .description('Show or update configuration')
  .option('--ableton-path <path>', 'Set Ableton Live application path')
  .option('--projects-path <path>', 'Set Ableton Live Projects folder path')
  .option('--destination-path <path>', 'Set backup destination path')
  .option('--node-path <path>', 'Set Node.js binary path used by cron')
  .option('--cron-frequency <expr>', 'Set cron frequency expression')
  .option('--computer-name <name>', 'Set the computer name added to zip filenames')
  .option('--active <bool>', 'Enable or disable automatic backups (true/false)')
  .action((options) => {
    const config = loadConfig();
    let changed = false;

    if (options.abletonPath) {
      config.abletonPath = options.abletonPath as string;
      changed = true;
    }
    if (options.projectsPath) {
      config.projectsPath = options.projectsPath as string;
      changed = true;
    }
    if (options.destinationPath) {
      config.destinationPath = options.destinationPath as string;
      changed = true;
    }
    if (options.nodePath) {
      config.nodePath = options.nodePath as string;
      changed = true;
    }
    if (options.cronFrequency) {
      config.cronFrequency = options.cronFrequency as string;
      changed = true;
    }
    if (options.computerName) {
      config.computerName = options.computerName as string;
      changed = true;
    }
    if (options.active !== undefined) {
      config.active = options.active === 'true';
      changed = true;
    }

    if (changed) {
      saveConfig(config);
      logger.info(`Configuration updated (${CONFIG_FILE})`);

      if (config.active) {
        installCron(config.cronFrequency, config.nodePath);
        logger.info(`Cron job updated (${config.cronFrequency})`);
      } else {
        removeCron();
        logger.warn('Automatic backups disabled.');
      }
    } else {
      // Print current config
      logger.info('\nCurrent configuration:\n');
      const entries: [string, string][] = [
        ['Ableton path', config.abletonPath],
        ['Projects path', config.projectsPath],
        ['Destination path', config.destinationPath],
        ['Node path', config.nodePath],
        ['Cron frequency', config.cronFrequency],
        ['Computer name', config.computerName],
        ['Active', String(config.active)],
        ['Config file', CONFIG_FILE],
      ];
      for (const [key, value] of entries) {
        logger.info(`  ${key.padEnd(20)} ${value}`);
      }
      logger.info('');
    }
  });

// ─── run ─────────────────────────────────────────────────────────────────────

program
  .command('run')
  .description('Run a backup cycle immediately')
  .option('--dry-run', 'Show which projects would be backed up without writing files')
  .action(async (options: { dryRun?: boolean }) => {
    const config = loadConfig();
    logger.info('Running backup cycle...');
    const dryRun = options.dryRun ?? false;
    const result = await runBackup(config, { dryRun });

    if (result.error) {
      logger.warn(`${result.error}`);
      process.exit(0);
    }

    if (result.backed.length === 0 && result.skipped.length === 0) {
      logger.warn('No Ableton projects found.');
    } else {
      for (const name of result.backed) {
        if (dryRun) {
          logger.info(`  Would back up: ${name}`);
        } else {
          logger.info(`  Backed up: ${name}`);
        }
      }
      for (const name of result.skipped) {
        logger.info(`  No changes: ${name}`);
      }
    }
  });

// ─── start ───────────────────────────────────────────────────────────────────

program
  .command('start')
  .description('Activate automatic backups (install cron job)')
  .action(() => {
    const config = loadConfig();
    config.active = true;
    saveConfig(config);
    installCron(config.cronFrequency, config.nodePath);
    logger.info(`Automatic backups activated (${config.cronFrequency})`);
  });

// ─── stop ────────────────────────────────────────────────────────────────────

program
  .command('stop')
  .description('Deactivate automatic backups (remove cron job)')
  .action(() => {
    const config = loadConfig();
    config.active = false;
    saveConfig(config);
    removeCron();
    logger.warn('Automatic backups deactivated.');
  });

// ─── status ──────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show the current status of ableton-backup')
  .action(() => {
    const config = loadConfig();
    const cronInstalled = isCronInstalled();

    logger.info('\nAbleton Backup - Status\n');
    logger.info(`  Config active flag : ${config.active ? 'enabled' : 'disabled'}`);
    logger.info(`  Cron job installed : ${cronInstalled ? 'yes' : 'no'}`);
    logger.info(`  Cron frequency     : ${config.cronFrequency}`);
    logger.info(`  Ableton path       : ${config.abletonPath}`);
    logger.info(`  Projects path      : ${config.projectsPath}`);
    logger.info(`  Destination path   : ${config.destinationPath}`);
    logger.info(`  Computer name      : ${config.computerName}`);
    logger.info(`  Node path          : ${config.nodePath}`);
    logger.info('');
  });

program.parse(process.argv);
