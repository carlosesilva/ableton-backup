import os from 'os';
import path from 'path';
import { transports as winstonTransports, format as winstonFormat } from 'winston';
import { LOG_FILE, formatTimestampET, getETDateString, toETDateString, getETHour } from '../src/logger';
import logger from '../src/logger';
import { CONFIG_DIR } from '../src/config';

// logform (used by Winston) stores the final formatted string under MESSAGE = Symbol.for('message').
// This is the documented contract for custom transports and printf formats.
const MESSAGE = Symbol.for('message') as symbol;

describe('logger', () => {
  test('LOG_FILE is inside ~/.ableton-backup/', () => {
    const expectedDir = path.join(os.homedir(), '.ableton-backup');
    expect(LOG_FILE).toBe(path.join(expectedDir, 'backup.log'));
  });

  test('logger exposes standard Winston logging methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  test('logger has a Console transport', () => {
    const hasConsole = logger.transports.some((t) => t instanceof winstonTransports.Console);
    expect(hasConsole).toBe(true);
  });

  test('logger has a File transport for daily logging', () => {
    const hasFile = logger.transports.some((t) => t instanceof winstonTransports.File);
    expect(hasFile).toBe(true);
  });

  test('daily log file is inside CONFIG_DIR/logs/ with a YYYY-MM-DD name', () => {
    const fileTransport = logger.transports.find(
      (t) => t instanceof winstonTransports.File
    ) as winstonTransports.FileTransportInstance;
    const logsDir = path.join(CONFIG_DIR, 'logs');
    expect(fileTransport.dirname).toBe(logsDir);
    expect(fileTransport.filename).toMatch(/^\d{4}-\d{2}-\d{2}\.log$/);
  });

  test('logger format prepends a timestamp to every message', () => {
    // Verify the logger's combined format by running a sample info object through it.
    // printf stores its output in info[MESSAGE] (the logform MESSAGE symbol).
    const info = winstonFormat.combine(
      // Use a function (as in the logger) to supply a fixed timestamp.
      winstonFormat.timestamp({ format: () => '2024-01-15 10:30:00' }),
      winstonFormat.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
    ).transform({ level: 'info', message: 'hello', [Symbol.for('level')]: 'info' }, {});

    expect(info).not.toBe(false);
    const output = (info as Record<symbol, string>)[MESSAGE];
    // Should match "YYYY-MM-DD HH:mm:ss info: hello"
    expect(output).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} info: hello/);
  });

  test('formatTimestampET returns a string matching YYYY-MM-DD HH:mm:ss', () => {
    const ts = formatTimestampET();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test('getETDateString returns a string matching YYYY-MM-DD', () => {
    const d = getETDateString();
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('getETDateString matches the date in America/New_York timezone', () => {
    const expected = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    expect(getETDateString()).toBe(expected);
  });

  test('toETDateString formats any Date as YYYY-MM-DD in ET', () => {
    const d = new Date('2024-06-15T04:00:00.000Z'); // midnight ET
    const result = toETDateString(d);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  });

  test('toETDateString is consistent with getETDateString for current time', () => {
    const now = new Date();
    expect(toETDateString(now)).toBe(getETDateString());
  });

  test('getETHour returns a number between 0 and 23', () => {
    const hour = getETHour();
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });

  test('getETHour returns the correct hour for a known UTC time', () => {
    // 2024-06-15 03:00:00 UTC = 2024-06-14 23:00:00 ET (EDT = UTC-4)
    const date = new Date('2024-06-15T03:00:00.000Z');
    expect(getETHour(date)).toBe(23);
  });

  test('getETHour returns 0 for midnight ET', () => {
    // 2024-01-15 05:00:00 UTC = 2024-01-15 00:00:00 ET (EST = UTC-5)
    const date = new Date('2024-01-15T05:00:00.000Z');
    expect(getETHour(date)).toBe(0);
  });
});
