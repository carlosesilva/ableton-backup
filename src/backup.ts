import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import archiver from 'archiver';
import {
  Config,
  loadConfig,
} from './config';
import {
  loadMetadata,
  saveMetadata,
  getProjectMetadata,
  setProjectMetadata,
} from './metadata';
import logger, { getETDateString, toETDateString, getETHour, toETTimestampString } from './logger';
import { checkThrottle, setLastRun } from './throttle';
import { acquireLock, releaseLock } from './lock';

/**
 * Expand a path that may start with "~" to the user's home directory.
 */
export function expandPath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Check whether Ableton Live is currently running.
 * Assumes `abletonPath` is an absolute Ableton `.app` path and matches it
 * against the full process command line.
 */
export interface MatchedProcess {
  pid: number;
  user: string;
  command: string;
}

export interface RunBackupOptions {
  dryRun?: boolean;
}
// The buffer time is used to skip backing up projects that were modified very recently, which likely means the user is still working on them.
export const BUFFER_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

// Backups are preferred at or after this hour in ET (23 = 11 PM).
export const NIGHT_HOUR = 23;

// How often (in ms) to emit a heartbeat log while a zip archive is being created.
export const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds

export function isAbletonRunning(abletonPath: string): MatchedProcess[] {
  try {
    // Includes helper processes under the same app bundle path.
    const pidsOutput = execFileSync('pgrep', ['-f', abletonPath], {
      encoding: 'utf8',
    }).trim();

    if (!pidsOutput) {
      return [];
    }

    const pids = pidsOutput
      .split(/\s+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (pids.length === 0) {
      return [];
    }

    const details = execFileSync(
      'ps',
      ['-p', pids.join(','), '-o', 'pid=,user=,command='],
      { encoding: 'utf8' }
    )
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const matched: MatchedProcess[] = [];
    for (const line of details) {
      const match = line.match(/^(\d+)\s+(\S+)\s+(.+)$/);
      if (!match) {
        continue;
      }
      const [, pid, user, command] = match;
      matched.push({
        pid: Number(pid),
        user,
        command,
      });
    }

    return matched;
  } catch {
    return [];
  }
}

/**
 * Get the latest modification time (mtime) of any `.als` file inside a
 * directory, recursively.
 */
export function getDirectoryMtime(dirPath: string): Date {
  let latest = new Date(0);

  const walk = (current: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.als')) {
        const stat = fs.statSync(full);
        if (stat.mtime > latest) {
          latest = stat.mtime;
        }
      }
    }
  };

  walk(dirPath);
  return latest;
}

/**
 * Create a zip archive of the given source directory at the given output path.
 * Returns a Promise that resolves when the archive is complete.
 * Periodically emits a heartbeat log so the caller knows archiving is still in progress.
 */
export function zipDirectory(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    const heartbeat = setInterval(() => {
      logger.info('\tStill archiving...');
    }, HEARTBEAT_INTERVAL_MS);

    output.on('close', () => {
      clearInterval(heartbeat);
      resolve();
    });

    archive.on('error', (err) => {
      clearInterval(heartbeat);
      reject(err);
    });

    archive.pipe(output);
    archive.directory(sourceDir, path.basename(sourceDir));
    archive.finalize();
  });
}

/**
 * Build the archive file name: `<project name> (Backup <timestamp> <computerName>).zip`
 */
export function buildArchiveName(projectName: string, timestamp: Date, computerName?: string): string {
  const ts = timestamp
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '');
  const suffix = computerName ? ` ${computerName}` : '';
  return `${projectName} (Backup ${ts}${suffix}).zip`;
}

/**
 * Discover all Ableton Live project directories inside `projectsPath`.
 * A project directory is identified by containing an `.als` file.
 */
export function findProjects(projectsPath: string): string[] {
  const expanded = expandPath(projectsPath);
  if (!fs.existsSync(expanded)) {
    return [];
  }

  const projects: string[] = [];
  const entries = fs.readdirSync(expanded, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(expanded, entry.name);
    const files = fs.readdirSync(dir);
    const hasAls = files.some((f) => f.endsWith('.als'));
    if (hasAls) {
      projects.push(dir);
    }
  }
  return projects;
}

/**
 * Run a full backup cycle:
 *  1. Skip if Ableton is running.
 *  2. Find all projects.
 *  3. For each project, check if it has been modified since the last backup.
 *  4. If modified (or never backed up), zip it to the destination.
 *  5. Update metadata.
 *
 * Returns a summary of actions taken.
 */
export async function runBackup(
  config?: Config,
  options?: RunBackupOptions
): Promise<void> {
  const cfg = config ?? loadConfig();
  const dryRun = options?.dryRun ?? false;

  // Ensure only one backup instance runs at a time.
  if (!acquireLock()) {
    logger.debug('Another backup instance is already running. Skipping.');
    return;
  }
  logger.debug('Acquired backup lock.');

  try {
    // Throttle non-dry-run executions to once per THROTTLE_WINDOW_MS.
    if (!dryRun) {
      const throttleState = checkThrottle();
      if (throttleState.throttled && throttleState.until) {
        logger.debug(`Backup run throttled until ${toETTimestampString(throttleState.until)}`);
        return;
      }
    }

    if (!dryRun) {
      setLastRun(new Date());
    }

    logger.info(`Starting backup cycle${dryRun ? ' (dry run)' : ''}...`);

    const matchedProcesses = isAbletonRunning(cfg.abletonPath);
    if (matchedProcesses.length > 0) {
      for (const process of matchedProcesses) {
        logger.info(
          `Matched Ableton process: pid=${process.pid} user=${process.user} command=${process.command}`
        );
      }

      return;
    }

    logger.info('Ableton is not running. Proceeding with backup.');

    const destination = expandPath(cfg.destinationPath);
    if (!dryRun && !fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const metadata = loadMetadata();
    const projects = findProjects(cfg.projectsPath);
    logger.info(`Found ${projects.length} project(s) in ${cfg.projectsPath}.`);

    const skipped: string[] = [];
    const backed: string[] = [];

    for (const projectPath of projects) {
      const projectName = path.basename(projectPath);
      logger.info(`Checking project: ${projectName}`);

      const mtime = getDirectoryMtime(projectPath);
      const existing = getProjectMetadata(metadata, projectPath);

      if (existing) {
        const lastModified = new Date(existing.lastModified);
        if (mtime <= lastModified) {
          logger.info(`\tSkipping: no changes since last backup.`);
          skipped.push(projectName);
          continue;
        }
      }

      const now = new Date();
      if (now.getTime() - mtime.getTime() < BUFFER_MS) {
        logger.info(`\tSkipping: updated less than 30 minutes ago.`);
        skipped.push(projectName);
        continue;
      }

      // Skip if already backed up today (once-per-day limit).
      const todayET = getETDateString();
      if (existing && toETDateString(new Date(existing.lastBackup)) === todayET) {
        logger.info(`\tSkipping: already backed up today.`);
        skipped.push(projectName);
        continue;
      }

      // If the project was last modified today, wait until 11 PM ET before backing up.
      if (toETDateString(mtime) === todayET && getETHour(now) < NIGHT_HOUR) {
        logger.info(`\tSkipping: modified today, waiting until 11 PM ET to back up.`);
        skipped.push(projectName);
        continue;
      }

      const archiveName = buildArchiveName(projectName, now, cfg.computerName);
      const projectBackupDir = path.join(destination, projectName);
      const outputPath = path.join(projectBackupDir, archiveName);

      if (dryRun) {
        logger.info(`\t[Dry run] Would back up ${projectName} to ${outputPath}`);
        backed.push(projectName);
        continue;
      }

      logger.info(`\tBacking up...`);

      if (!fs.existsSync(projectBackupDir)) {
        fs.mkdirSync(projectBackupDir, { recursive: true });
      }

      // Archive to a local temp file first to avoid writing directly to a
      // potentially slow destination (e.g. Google Drive), then move it over.
      // Prefix with the process PID to avoid collisions if multiple instances run.
      const tmpOutputPath = path.join(os.tmpdir(), `${process.pid}-${archiveName}`);
      await zipDirectory(projectPath, tmpOutputPath);
      try {
        fs.renameSync(tmpOutputPath, outputPath);
      } catch (renameErr) {
        if ((renameErr as NodeJS.ErrnoException).code === 'EXDEV') {
          // renameSync cannot cross filesystem boundaries; fall back to copy + delete.
          fs.copyFileSync(tmpOutputPath, outputPath);
          fs.unlinkSync(tmpOutputPath);
        } else {
          fs.unlinkSync(tmpOutputPath);
          throw renameErr;
        }
      }
      logger.info(`\tBacked up to ${outputPath}`);

      setProjectMetadata(metadata, projectPath, {
        lastBackup: now.toISOString(),
        lastModified: mtime.toISOString(),
      });

      backed.push(projectName);
    }

    if (!dryRun) {
      saveMetadata(metadata);
    }

    logger.info(
      `Backup complete. Backed up: ${backed.length}, Skipped: ${skipped.length}.`
    );

    return;

  } finally {
    releaseLock();
  }
}
