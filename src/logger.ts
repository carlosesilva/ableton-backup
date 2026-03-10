import path from 'path';
import { mkdirSync } from 'fs';
import { createLogger, format, transports } from 'winston';
import { CONFIG_DIR } from './config';

export const LOG_FILE = path.join(CONFIG_DIR, 'backup.log');

const TZ = 'America/New_York';

/** Returns the current date/time formatted as 'YYYY-MM-DD HH:mm:ss' in ET. */
export function formatTimestampET(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl.DateTimeFormat did not produce a '${type}' part`);
    return part.value;
  };
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Returns a date formatted as 'YYYY-MM-DD' in ET for any given Date. */
export function toETDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl.DateTimeFormat did not produce a '${type}' part`);
    return part.value;
  };
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Returns the current date formatted as 'YYYY-MM-DD' in ET. */
export function getETDateString(): string {
  return toETDateString(new Date());
}

/** Returns the hour (0-23) of the given date (or now) in ET. */
export function getETHour(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const part = parts.find((p) => p.type === 'hour');
  if (!part) throw new Error(`Intl.DateTimeFormat did not produce an 'hour' part`);
  const hour = Number(part.value);
  return hour === 24 ? 0 : hour; // some engines report midnight as 24
}

const logsDir = path.join(CONFIG_DIR, 'logs');
mkdirSync(logsDir, { recursive: true });

// The filename is computed once when this module is first loaded.
// Since each cron invocation starts a fresh process, the date is always current.
const todayLog = path.join(logsDir, `${getETDateString()}.log`);

const logger = createLogger({
  format: format.combine(
    format.timestamp({ format: formatTimestampET }),
    format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
  ),
  transports: [new transports.Console(), new transports.File({ filename: todayLog })],
});

export default logger;
