import path from 'path';
import { createLogger, format, transports } from 'winston';
import { CONFIG_DIR } from './config';

export const LOG_FILE = path.join(CONFIG_DIR, 'backup.log');

const logger = createLogger({
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
  ),
  transports: [new transports.Console()],
});

export default logger;
