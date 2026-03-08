import fs from 'fs';
import path from 'path';
import os from 'os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ableton-backup-log-test-'));

// Override CONFIG_DIR so the logger writes to a temp directory during tests
jest.mock('../src/config', () => {
  const actual = jest.requireActual('../src/config') as typeof import('../src/config');
  return {
    ...actual,
    CONFIG_DIR: TMP_DIR,
    ensureConfigDir: () => fs.mkdirSync(TMP_DIR, { recursive: true }),
  };
});

import { appendLog, appendRunHeader, LOG_FILE } from '../src/logger';

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('logger', () => {
  beforeEach(() => {
    if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
  });

  test('appendLog writes a timestamped INFO entry to the log file', () => {
    const date = new Date('2024-03-15T10:30:00.000Z');
    appendLog('INFO', 'Test message', date);

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    expect(content).toContain('[2024-03-15 10:30:00] [INFO] Test message');
  });

  test('appendLog writes WARN and ERROR entries', () => {
    const date = new Date('2024-03-15T10:30:00.000Z');
    appendLog('WARN', 'Warning message', date);
    appendLog('ERROR', 'Error message', date);

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    expect(content).toContain('[WARN] Warning message');
    expect(content).toContain('[ERROR] Error message');
  });

  test('appendLog appends to an existing file', () => {
    const date = new Date('2024-03-15T10:30:00.000Z');
    appendLog('INFO', 'First message', date);
    appendLog('INFO', 'Second message', date);

    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('First message');
    expect(lines[1]).toContain('Second message');
  });

  test('appendRunHeader writes a separator and start message', () => {
    const date = new Date('2024-03-15T10:30:00.000Z');
    appendRunHeader(date);

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    expect(content).toContain('='.repeat(80));
    expect(content).toContain('[2024-03-15 10:30:00] Backup run started');
  });

  test('LOG_FILE is located inside CONFIG_DIR', () => {
    expect(LOG_FILE).toBe(path.join(TMP_DIR, 'backup.log'));
  });
});
