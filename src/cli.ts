#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
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

    console.log(chalk.cyan('\n🎛  Ableton Backup – Setup\n'));

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
        name: 'cronFrequency',
        message: 'Cron frequency (cron expression):',
        default: existing.cronFrequency,
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
      cronFrequency: answers.cronFrequency as string,
      active: answers.active as boolean,
    };

    saveConfig(config);
    console.log(chalk.green(`\n✅  Configuration saved to ${CONFIG_FILE}`));

    if (config.active) {
      installCron(config.cronFrequency);
      console.log(chalk.green(`✅  Cron job installed (${config.cronFrequency})`));
    } else {
      removeCron();
      console.log(chalk.yellow('⚠️   Automatic backups are disabled.'));
    }
  });

// ─── config ──────────────────────────────────────────────────────────────────

program
  .command('config')
  .description('Show or update configuration')
  .option('--ableton-path <path>', 'Set Ableton Live application path')
  .option('--projects-path <path>', 'Set Ableton Live Projects folder path')
  .option('--destination-path <path>', 'Set backup destination path')
  .option('--cron-frequency <expr>', 'Set cron frequency expression')
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
    if (options.cronFrequency) {
      config.cronFrequency = options.cronFrequency as string;
      changed = true;
    }
    if (options.active !== undefined) {
      config.active = options.active === 'true';
      changed = true;
    }

    if (changed) {
      saveConfig(config);
      console.log(chalk.green(`✅  Configuration updated (${CONFIG_FILE})`));

      if (config.active) {
        installCron(config.cronFrequency);
        console.log(chalk.green(`✅  Cron job updated (${config.cronFrequency})`));
      } else {
        removeCron();
        console.log(chalk.yellow('⚠️   Automatic backups disabled.'));
      }
    } else {
      // Print current config
      console.log(chalk.cyan('\n📋  Current configuration:\n'));
      const entries: [string, string][] = [
        ['Ableton path', config.abletonPath],
        ['Projects path', config.projectsPath],
        ['Destination path', config.destinationPath],
        ['Cron frequency', config.cronFrequency],
        ['Active', String(config.active)],
        ['Config file', CONFIG_FILE],
      ];
      for (const [key, value] of entries) {
        console.log(`  ${chalk.bold(key.padEnd(20))} ${value}`);
      }
      console.log();
    }
  });

// ─── run ─────────────────────────────────────────────────────────────────────

program
  .command('run')
  .description('Run a backup cycle immediately')
  .action(async () => {
    const config = loadConfig();
    console.log(chalk.cyan('🔄  Running backup cycle…'));
    const result = await runBackup(config);

    if (result.error) {
      console.log(chalk.yellow(`⚠️   ${result.error}`));
      process.exit(0);
    }

    if (result.backed.length === 0 && result.skipped.length === 0) {
      console.log(chalk.yellow('ℹ️   No Ableton projects found.'));
    } else {
      for (const name of result.backed) {
        console.log(chalk.green(`  ✅  Backed up: ${name}`));
      }
      for (const name of result.skipped) {
        console.log(chalk.gray(`  –  No changes: ${name}`));
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
    installCron(config.cronFrequency);
    console.log(chalk.green(`✅  Automatic backups activated (${config.cronFrequency})`));
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
    console.log(chalk.yellow('⚠️   Automatic backups deactivated.'));
  });

// ─── status ──────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show the current status of ableton-backup')
  .action(() => {
    const config = loadConfig();
    const cronInstalled = isCronInstalled();

    console.log(chalk.cyan('\n📊  Ableton Backup – Status\n'));
    console.log(`  Config active flag : ${config.active ? chalk.green('enabled') : chalk.red('disabled')}`);
    console.log(`  Cron job installed : ${cronInstalled ? chalk.green('yes') : chalk.red('no')}`);
    console.log(`  Cron frequency     : ${config.cronFrequency}`);
    console.log(`  Ableton path       : ${config.abletonPath}`);
    console.log(`  Projects path      : ${config.projectsPath}`);
    console.log(`  Destination path   : ${config.destinationPath}`);
    console.log();
  });

program.parse(process.argv);
