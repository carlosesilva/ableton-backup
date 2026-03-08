import { execSync } from 'child_process';
import path from 'path';
import { LOG_FILE } from './logger';

export const CRON_MARKER = '# ableton-backup';

/**
 * Build the cron job line for the given frequency.
 * The line runs the ableton-backup binary (resolved via `which`) with the `run` command.
 */
export function buildCronLine(frequency: string, binPath: string): string {
  return `${frequency} ${binPath} run >> "${LOG_FILE}" 2>&1 ${CRON_MARKER}`;
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
 * Resolve the absolute path to the `ableton-backup` binary.
 * Prefers the globally installed binary; falls back to the local dist version.
 */
export function resolveBinPath(): string {
  try {
    return execSync('which ableton-backup', { encoding: 'utf8' }).trim();
  } catch {
    return path.resolve(__dirname, '..', 'dist', 'cli.js');
  }
}

/**
 * Install or update the cron job with the given frequency.
 * Removes any previously installed ableton-backup cron line before adding the new one.
 */
export function installCron(frequency: string): void {
  const binPath = resolveBinPath();
  const cronLine = buildCronLine(frequency, binPath);
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
