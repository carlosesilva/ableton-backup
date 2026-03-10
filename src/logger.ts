import path from 'path';
import { mkdirSync } from 'fs';
import { createLogger, format, transports } from 'winston';
import { CONFIG_DIR } from './config';

export const LOG_FILE = path.join(CONFIG_DIR, 'backup.log');

const logsDir = path.join(CONFIG_DIR, 'logs');
mkdirSync(logsDir, { recursive: true });

// The filename is computed once when this module is first loaded.
// Since each cron invocation starts a fresh process, the date is always current.
const todayLog = path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);

const logger = createLogger({
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
  ),
  transports: [new transports.Console(), new transports.File({ filename: todayLog })],
});

export default logger;
