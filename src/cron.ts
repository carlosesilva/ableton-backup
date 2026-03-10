import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { DEBUG_LOG_LEVEL, LOG_LEVEL_ENV_VAR } from './logger';

export const CRON_MARKER = '# ableton-backup';

/**
 * Expand a path that starts with `~` to the current user's home directory.
 */
function expandHomePath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Quote a value for POSIX shell usage in a cron command.
 */
function quoteShell(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

/**
 * Resolve the absolute path to the CLI entrypoint inside this package.
 */
export function resolveCliPath(): string {
  return path.resolve(__dirname, '..', 'dist', 'cli.js');
}

/**
 * Build the cron job line for the given frequency.
 * The line invokes Node directly with the package CLI file.
 */
export function buildCronLine(
  frequency: string,
  nodePath: string,
  cliPath: string,
  debugMode = false
): string {
  const expandedNodePath = expandHomePath(nodePath);
  const envPrefix = debugMode ? `${LOG_LEVEL_ENV_VAR}=${DEBUG_LOG_LEVEL} ` : '';
  return `${frequency} ${envPrefix}${quoteShell(expandedNodePath)} ${quoteShell(cliPath)} run ${CRON_MARKER}`;
}

/**
 * Get the current user's crontab as a string.
 * Returns an empty string if no crontab exists.
 */
export function getCrontab(): string {
  try {
    return execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
  } catch {
    // No existing crontab
    return '';
  }
}

/**
 * Write a string to the user's crontab.
 */
export function setCrontab(content: string): void {
  const { execFileSync } = require('child_process');
  const { writeFileSync, unlinkSync } = require('fs');
  const tmpFile = `/tmp/ableton-backup-cron-${Date.now()}`;
  try {
    writeFileSync(tmpFile, content, 'utf8');
    execFileSync('crontab', [tmpFile]);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Install or update the cron job with the given frequency.
 * Removes any previously installed ableton-backup cron line before adding the new one.
 */
export function installCron(frequency: string, nodePath: string, debugMode = false): void {
  const cliPath = resolveCliPath();
  const cronLine = buildCronLine(frequency, nodePath, cliPath, debugMode);
  const existing = getCrontab();
  const filtered = existing
    .split('\n')
    .filter((line) => !line.includes(CRON_MARKER))
    .join('\n')
    .trimEnd();
  const newCrontab = filtered ? `${filtered}\n${cronLine}\n` : `${cronLine}\n`;
  setCrontab(newCrontab);
}

/**
 * Remove the ableton-backup cron job from the user's crontab.
 */
export function removeCron(): void {
  const existing = getCrontab();
  const filtered = existing
    .split('\n')
    .filter((line) => !line.includes(CRON_MARKER))
    .join('\n')
    .trimEnd();
  const newCrontab = filtered ? `${filtered}\n` : '';
  setCrontab(newCrontab);
}

/**
 * Check whether a cron job for ableton-backup is currently installed.
 */
export function isCronInstalled(): boolean {
  const existing = getCrontab();
  return existing.includes(CRON_MARKER);
}
