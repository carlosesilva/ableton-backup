import fs from 'fs';
import path from 'path';
import os from 'os';

// Use a temp directory to avoid touching real config. Initialize at module level
// so it is available when the jest.mock factory is invoked (factories are hoisted
// but called lazily on first import, after module-level code runs).
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ableton-lock-test-'));

jest.mock('../src/config', () => {
  const actual = jest.requireActual('../src/config') as typeof import('../src/config');
  return {
    ...actual,
    CONFIG_DIR: TMP_DIR,
    ensureConfigDir: () => fs.mkdirSync(TMP_DIR, { recursive: true }),
  };
});

import {
  LOCK_FILE,
  LOCK_EXPIRY_MS,
  getLockPid,
  acquireLock,
  releaseLock,
  isLocked,
} from '../src/lock';

/** Write a lock file with the given pid and acquiredAt timestamp. */
function writeLock(pid: number, acquiredAt: Date): void {
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid, acquiredAt: acquiredAt.toISOString() }), 'utf8');
}

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('lock', () => {
  beforeEach(() => {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  });

  test('LOCK_EXPIRY_MS is 1 day in milliseconds', () => {
    expect(LOCK_EXPIRY_MS).toBe(24 * 60 * 60 * 1000);
  });

  test('getLockPid returns null when no file exists', () => {
    expect(getLockPid()).toBeNull();
  });

  test('getLockPid returns the PID stored in the lock file', () => {
    writeLock(12345, new Date());
    expect(getLockPid()).toBe(12345);
  });

  test('getLockPid returns null for corrupt file content', () => {
    fs.writeFileSync(LOCK_FILE, 'not-json', 'utf8');
    expect(getLockPid()).toBeNull();
  });

  test('acquireLock writes the current PID to the lock file', () => {
    const acquired = acquireLock();
    expect(acquired).toBe(true);
    expect(getLockPid()).toBe(process.pid);
  });

  test('acquireLock returns false when a live, non-expired process holds the lock', () => {
    // Write the current process's own PID with a fresh timestamp – it is definitely alive.
    writeLock(process.pid, new Date());
    const acquired = acquireLock();
    expect(acquired).toBe(false);
  });

  test('acquireLock clears a stale (dead process) lock and acquires successfully', () => {
    // Use a PID that is guaranteed to not be running.
    writeLock(999999999, new Date());
    const acquired = acquireLock();
    expect(acquired).toBe(true);
    expect(getLockPid()).toBe(process.pid);
  });

  test('acquireLock clears an expired lock even when the PID is alive', () => {
    // Lock held by current process but acquired more than LOCK_EXPIRY_MS ago.
    const expired = new Date(Date.now() - LOCK_EXPIRY_MS - 1000);
    writeLock(process.pid, expired);
    const acquired = acquireLock();
    expect(acquired).toBe(true);
    expect(getLockPid()).toBe(process.pid);
  });

  test('acquireLock acquires when no lock file exists', () => {
    expect(acquireLock()).toBe(true);
    expect(fs.existsSync(LOCK_FILE)).toBe(true);
  });

  test('releaseLock removes the lock file when owned by current process', () => {
    acquireLock();
    expect(fs.existsSync(LOCK_FILE)).toBe(true);
    expect(releaseLock()).toBe(true);
    expect(fs.existsSync(LOCK_FILE)).toBe(false);
  });

  test('releaseLock is safe to call when no lock file exists', () => {
    expect(() => releaseLock()).not.toThrow();
    expect(releaseLock()).toBe(false);
  });

  test('releaseLock does not remove lock held by another process', () => {
    writeLock(999999999, new Date());
    expect(releaseLock()).toBe(false);
    expect(fs.existsSync(LOCK_FILE)).toBe(true);
  });

  test('isLocked returns false when no lock file exists', () => {
    expect(isLocked()).toBe(false);
  });

  test('isLocked returns true when the current process holds a fresh lock', () => {
    writeLock(process.pid, new Date());
    expect(isLocked()).toBe(true);
  });

  test('isLocked returns false for a stale (dead process) lock', () => {
    writeLock(999999999, new Date());
    expect(isLocked()).toBe(false);
  });

  test('isLocked returns false for an expired lock', () => {
    const expired = new Date(Date.now() - LOCK_EXPIRY_MS - 1000);
    writeLock(process.pid, expired);
    expect(isLocked()).toBe(false);
  });

  test('isLocked returns false after releaseLock', () => {
    acquireLock();
    releaseLock();
    expect(isLocked()).toBe(false);
  });
});

