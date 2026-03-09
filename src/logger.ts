import fs from 'fs';
import path from 'path';
import { CONFIG_DIR } from './config';

export const LOG_FILE = path.join(CONFIG_DIR, 'backup.log');

function getTimestamp(): string {
  return new Date().toISOString();
}

function ensureLogDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Append a timestamped message to the log file.
 */
export function appendLog(message: string): void {
  ensureLogDir();
  fs.appendFileSync(LOG_FILE, `[${getTimestamp()}] ${message}\n`);
}

/**
 * Append a visual separator and a "run started" line to the log file.
 * Call once at the beginning of each backup run.
 */
export function appendRunHeader(): void {
  ensureLogDir();
  const separator = '='.repeat(60);
  fs.appendFileSync(LOG_FILE, `\n${separator}\n[${getTimestamp()}] Backup run started\n`);
}
