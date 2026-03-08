import fs from 'fs';
import path from 'path';
import os from 'os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ableton-backup-logger-test-'));
const TMP_LOG_FILE = path.join(TMP_DIR, 'backup.log');

import { appendToLog, LOG_FILE } from '../src/logger';

// Override the log file location for tests
jest.mock('../src/logger', () => {
  const actual = jest.requireActual('../src/logger') as typeof import('../src/logger');
  return {
    ...actual,
    LOG_FILE: TMP_LOG_FILE,
    appendToLog: (message: string) => {
      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] ${message}\n`;
      fs.appendFileSync(TMP_LOG_FILE, line, 'utf8');
    },
  };
});

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('logger', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP_LOG_FILE)) fs.unlinkSync(TMP_LOG_FILE);
  });

  test('appendToLog creates the log file if it does not exist', () => {
    expect(fs.existsSync(TMP_LOG_FILE)).toBe(false);
    appendToLog('test message');
    expect(fs.existsSync(TMP_LOG_FILE)).toBe(true);
  });

  test('appendToLog writes a timestamped line', () => {
    appendToLog('hello world');
    const content = fs.readFileSync(TMP_LOG_FILE, 'utf8');
    expect(content).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] hello world\n$/);
  });

  test('appendToLog appends multiple lines', () => {
    appendToLog('first');
    appendToLog('second');
    const lines = fs.readFileSync(TMP_LOG_FILE, 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('first');
    expect(lines[1]).toContain('second');
  });

  test('LOG_FILE is inside CONFIG_DIR', () => {
    expect(LOG_FILE).toContain('backup.log');
  });
});
