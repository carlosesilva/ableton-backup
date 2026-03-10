import fs from 'fs';
import path from 'path';
import { CONFIG_DIR, ensureConfigDir } from './config';

export const LOCK_FILE = path.join(CONFIG_DIR, 'backup.lock');

/**
 * Check whether a process with the given PID is currently running.
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the PID stored in the lock file, or null if the file is missing or
 * contains an invalid value.
 */
export function getLockPid(): number | null {
  if (!fs.existsSync(LOCK_FILE)) {
    return null;
  }
  try {
    const content = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Attempt to acquire the backup lock.
 *
 * - Returns `true` if the lock was successfully acquired.
 * - Returns `false` if another instance is already running (lock is held by a
 *   live process).
 * - Stale locks left behind by crashed processes are automatically cleared.
 */
export function acquireLock(): boolean {
  const pid = getLockPid();
  if (pid !== null && isProcessRunning(pid)) {
    return false;
  }

  // No active lock (file missing or stale) – claim it.
  try {
    ensureConfigDir();
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Release the backup lock by removing the lock file.
 * Safe to call even when no lock is held.
 */
export function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    // Ignore errors – best-effort cleanup.
  }
}

/**
 * Check whether a backup lock is currently held by a running process.
 */
export function isLocked(): boolean {
  const pid = getLockPid();
  return pid !== null && isProcessRunning(pid);
}
