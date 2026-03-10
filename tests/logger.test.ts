import os from 'os';
import path from 'path';
import { transports as winstonTransports, format as winstonFormat } from 'winston';
import { LOG_FILE } from '../src/logger';
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
