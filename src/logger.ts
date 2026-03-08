import fs from 'fs';
import path from 'path';
import { CONFIG_DIR, ensureConfigDir } from './config';

export const LOG_FILE = path.join(CONFIG_DIR, 'backup.log');

function formatTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/**
 * Append a timestamped log entry to the backup log file.
 */
export function appendLog(
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  date?: Date
): void {
  ensureConfigDir();
  const ts = formatTimestamp(date ?? new Date());
  fs.appendFileSync(LOG_FILE, `[${ts}] [${level}] ${message}\n`, 'utf8');
}

/**
 * Write a separator header to the log file marking the start of a backup run.
 */
export function appendRunHeader(date?: Date): void {
  ensureConfigDir();
  const ts = formatTimestamp(date ?? new Date());
  fs.appendFileSync(
    LOG_FILE,
    `${'='.repeat(80)}\n[${ts}] Backup run started\n`,
    'utf8'
  );
}
