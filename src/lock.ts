import fs from 'fs';
import path from 'path';
import { CONFIG_DIR, ensureConfigDir } from './config';

export const LOCK_FILE = path.join(CONFIG_DIR, 'backup.lock');

/** Maximum age of a lock before it is considered expired (1 day). */
export const LOCK_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface LockData {
  pid: number;
  acquiredAt: string; // ISO 8601 timestamp
}

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
 * Read and parse the lock file.
 * Returns null if the file is missing, unreadable, or contains invalid data.
 */
function readLockData(): LockData | null {
  if (!fs.existsSync(LOCK_FILE)) {
    return null;
  }
  try {
    const content = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    const data = JSON.parse(content) as LockData;
    if (typeof data.pid !== 'number' || typeof data.acquiredAt !== 'string') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Determine whether a lock entry is stale (process dead or lock expired).
 */
function isStale(data: LockData): boolean {
  const age = Date.now() - new Date(data.acquiredAt).getTime();
  if (age >= LOCK_EXPIRY_MS) {
    return true;
  }
  return !isProcessRunning(data.pid);
}

/**
 * Read the PID stored in the lock file, or null if the file is missing or
 * contains an invalid value.
 */
export function getLockPid(): number | null {
  return readLockData()?.pid ?? null;
}

/**
 * Attempt to acquire the backup lock.
 *
 * - Returns `true` if the lock was successfully acquired.
 * - Returns `false` if another instance is already running and the lock has
 *   not yet expired.
 * - Stale locks (from crashed processes or older than LOCK_EXPIRY_MS) are
 *   automatically cleared.
 */
export function acquireLock(): boolean {
  const data = readLockData();
  if (data !== null && !isStale(data)) {
    return false;
  }

  // No active lock (file missing, stale, or expired) – claim it.
  try {
    ensureConfigDir();
    const lockData: LockData = {
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    };
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Release the backup lock only if this process currently owns it.
 *
 * Returns `true` if the lock was released by this process, otherwise `false`.
 */
export function releaseLock(): boolean {
  const data = readLockData();
  if (data === null) {
    return false;
  }

  if (data.pid !== process.pid) {
    return false;
  }

  try {
    fs.unlinkSync(LOCK_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a backup lock is currently held by a live, non-expired process.
 */
export function isLocked(): boolean {
  const data = readLockData();
  return data !== null && !isStale(data);
}
