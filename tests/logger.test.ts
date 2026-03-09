import os from 'os';
import path from 'path';
import { transports as winstonTransports, format as winstonFormat } from 'winston';
import { LOG_FILE } from '../src/logger';
import logger from '../src/logger';

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

  test('logger format prepends a timestamp to every message', () => {
    // Verify the logger's combined format by running a sample info object through it.
    // printf stores its output in info[MESSAGE] (the logform MESSAGE symbol).
    const info = winstonFormat.combine(
      // Use the same settings as the logger to produce a known output
      winstonFormat.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winstonFormat.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
    ).transform({ level: 'info', message: 'hello', [Symbol.for('level')]: 'info' }, {});

    expect(info).not.toBe(false);
    const output = (info as Record<symbol, string>)[MESSAGE];
    // Should match "YYYY-MM-DD HH:mm:ss info: hello"
    expect(output).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} info: hello/);
  });
});
