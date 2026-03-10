import fs from 'fs';
import path from 'path';
import os from 'os';

// Use a temp directory to avoid touching real config. Initialize at module level
// so it is available when the jest.mock factory is invoked (factories are hoisted
// but called lazily on first import, after module-level code runs).
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ableton-throttle-test-'));

jest.mock('../src/config', () => {
  const actual = jest.requireActual('../src/config') as typeof import('../src/config');
  return {
    ...actual,
    CONFIG_DIR: TMP_DIR,
    ensureConfigDir: () => fs.mkdirSync(TMP_DIR, { recursive: true }),
  };
});

import {
  THROTTLE_FILE,
  THROTTLE_WINDOW_MS,
  getLastRun,
  setLastRun,
  checkThrottle,
} from '../src/throttle';

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('throttle', () => {
  beforeEach(() => {
    if (fs.existsSync(THROTTLE_FILE)) fs.unlinkSync(THROTTLE_FILE);
  });

  test('THROTTLE_WINDOW_MS is 10 minutes in milliseconds', () => {
    expect(THROTTLE_WINDOW_MS).toBe(10 * 60 * 1000);
  });

  test('getLastRun returns null when no file exists', () => {
    expect(getLastRun()).toBeNull();
  });

  test('setLastRun and getLastRun round-trip the date', () => {
    const date = new Date('2026-03-10T15:00:00.000Z');
    setLastRun(date);
    const result = getLastRun();
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe(date.toISOString());
  });

  test('getLastRun returns null for corrupt file content', () => {
    fs.writeFileSync(THROTTLE_FILE, 'not-a-date', 'utf8');
    expect(getLastRun()).toBeNull();
  });

  test('checkThrottle returns not throttled when no last-run exists', () => {
    const result = checkThrottle();
    expect(result.throttled).toBe(false);
    expect(result.until).toBeUndefined();
  });

  test('checkThrottle returns throttled when last run was very recent', () => {
    const recent = new Date(Date.now() - 60_000); // 1 minute ago
    setLastRun(recent);
    const result = checkThrottle();
    expect(result.throttled).toBe(true);
    expect(result.until).toBeInstanceOf(Date);
    expect(result.until!.getTime()).toBe(recent.getTime() + THROTTLE_WINDOW_MS);
  });

  test('checkThrottle returns not throttled when last run was long ago', () => {
    const old = new Date(Date.now() - THROTTLE_WINDOW_MS - 60_000); // 11 min ago
    setLastRun(old);
    const result = checkThrottle();
    expect(result.throttled).toBe(false);
    expect(result.until).toBeUndefined();
  });

  test('checkThrottle returns not throttled exactly at the window boundary', () => {
    const atBoundary = new Date(Date.now() - THROTTLE_WINDOW_MS - 1);
    setLastRun(atBoundary);
    const result = checkThrottle();
    expect(result.throttled).toBe(false);
  });
});

