import fs from 'fs';
import path from 'path';
import { CONFIG_DIR, ensureConfigDir } from './config';

export const THROTTLE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const THROTTLE_FILE = path.join(CONFIG_DIR, 'last-run');

/**
 * Read the timestamp of the last backup run from disk.
 * Returns null if no record exists or the file is unreadable.
 */
export function getLastRun(): Date | null {
  if (!fs.existsSync(THROTTLE_FILE)) {
    return null;
  }
  try {
    const content = fs.readFileSync(THROTTLE_FILE, 'utf8').trim();
    const date = new Date(content);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Persist the timestamp of the most recent backup run.
 */
export function setLastRun(date: Date): void {
  ensureConfigDir();
  fs.writeFileSync(THROTTLE_FILE, date.toISOString(), 'utf8');
}

/**
 * Check whether a backup run should be throttled.
 * Returns `{ throttled: true, until }` if a run was recorded within the last
 * THROTTLE_WINDOW_MS milliseconds, or `{ throttled: false }` otherwise.
 */
export function checkThrottle(): { throttled: boolean; until?: Date } {
  const lastRun = getLastRun();
  if (!lastRun) {
    return { throttled: false };
  }
  const until = new Date(lastRun.getTime() + THROTTLE_WINDOW_MS);
  if (Date.now() < until.getTime()) {
    return { throttled: true, until };
  }
  return { throttled: false };
}
