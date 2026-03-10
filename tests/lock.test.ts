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
  getLockPid,
  acquireLock,
  releaseLock,
  isLocked,
} from '../src/lock';

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('lock', () => {
  beforeEach(() => {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  });

  test('getLockPid returns null when no file exists', () => {
    expect(getLockPid()).toBeNull();
  });

  test('getLockPid returns the PID written to the lock file', () => {
    fs.writeFileSync(LOCK_FILE, '12345', 'utf8');
    expect(getLockPid()).toBe(12345);
  });

  test('getLockPid returns null for corrupt file content', () => {
    fs.writeFileSync(LOCK_FILE, 'not-a-pid', 'utf8');
    expect(getLockPid()).toBeNull();
  });

  test('acquireLock writes the current PID to the lock file', () => {
    const acquired = acquireLock();
    expect(acquired).toBe(true);
    expect(getLockPid()).toBe(process.pid);
  });

  test('acquireLock returns false when a live process holds the lock', () => {
    // Write the current process's own PID – it is definitely alive.
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
    const acquired = acquireLock();
    expect(acquired).toBe(false);
  });

  test('acquireLock clears a stale lock and acquires successfully', () => {
    // PID 0 is never a valid user-space process, so kill(0, 0) will throw.
    // Use a PID that is guaranteed to not be running: Number.MAX_SAFE_INTEGER.
    const deadPid = 999999999;
    fs.writeFileSync(LOCK_FILE, String(deadPid), 'utf8');
    const acquired = acquireLock();
    expect(acquired).toBe(true);
    expect(getLockPid()).toBe(process.pid);
  });

  test('acquireLock acquires when no lock file exists', () => {
    expect(acquireLock()).toBe(true);
    expect(fs.existsSync(LOCK_FILE)).toBe(true);
  });

  test('releaseLock removes the lock file', () => {
    acquireLock();
    expect(fs.existsSync(LOCK_FILE)).toBe(true);
    releaseLock();
    expect(fs.existsSync(LOCK_FILE)).toBe(false);
  });

  test('releaseLock is safe to call when no lock file exists', () => {
    expect(() => releaseLock()).not.toThrow();
  });

  test('isLocked returns false when no lock file exists', () => {
    expect(isLocked()).toBe(false);
  });

  test('isLocked returns true when the current process holds the lock', () => {
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
    expect(isLocked()).toBe(true);
  });

  test('isLocked returns false for a stale lock', () => {
    fs.writeFileSync(LOCK_FILE, '999999999', 'utf8');
    expect(isLocked()).toBe(false);
  });

  test('isLocked returns false after releaseLock', () => {
    acquireLock();
    releaseLock();
    expect(isLocked()).toBe(false);
  });
});
