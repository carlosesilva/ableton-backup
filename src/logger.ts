import fs from 'fs';
import path from 'path';
import { CONFIG_DIR, ensureConfigDir } from './config';

export const LOG_FILE = path.join(CONFIG_DIR, 'backup.log');

/**
 * Append a timestamped message to the backup log file.
 */
export function appendToLog(message: string): void {
  ensureConfigDir();
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf8');
}
