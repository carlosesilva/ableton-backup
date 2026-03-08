import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, execFileSync } from 'child_process';
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
 * On macOS, the Ableton binary is named "Live" (inside the .app bundle).
 * We use `pgrep -x` for an exact process-name match.
 * Falls back to matching on the full binary path if a custom non-standard path
 * is provided (i.e. not a .app bundle).
 */
export function isAbletonRunning(abletonPath: string): boolean {
  try {
    if (abletonPath.endsWith('.app')) {
      // Standard macOS .app bundle: binary is named "Live"
      execFileSync('pgrep', ['-x', 'Live'], { stdio: 'ignore' });
    } else {
      // Non-standard binary path – match by exact full path
      execFileSync('pgrep', ['-fx', abletonPath], { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the latest modification time (mtime) of any file inside a directory,
 * recursively.
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
      } else {
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
 */
export function zipDirectory(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, path.basename(sourceDir));
    archive.finalize();
  });
}

/**
 * Build the archive file name: `<project name> (Backup <timestamp>).zip`
 */
export function buildArchiveName(projectName: string, timestamp: Date): string {
  const ts = timestamp
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '');
  return `${projectName} (Backup ${ts}).zip`;
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
  config?: Config
): Promise<{ skipped: string[]; backed: string[]; error?: string }> {
  const cfg = config ?? loadConfig();

  if (isAbletonRunning(cfg.abletonPath)) {
    return {
      skipped: [],
      backed: [],
      error: 'Ableton Live is currently running. Skipping backup.',
    };
  }

  const destination = expandPath(cfg.destinationPath);
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  const metadata = loadMetadata();
  const projects = findProjects(cfg.projectsPath);
  const skipped: string[] = [];
  const backed: string[] = [];

  for (const projectPath of projects) {
    const projectName = path.basename(projectPath);
    const mtime = getDirectoryMtime(projectPath);
    const existing = getProjectMetadata(metadata, projectPath);

    if (existing) {
      const lastModified = new Date(existing.lastModified);
      if (mtime <= lastModified) {
        skipped.push(projectName);
        continue;
      }
    }

    const now = new Date();
    const archiveName = buildArchiveName(projectName, now);
    const outputPath = path.join(destination, archiveName);

    await zipDirectory(projectPath, outputPath);

    setProjectMetadata(metadata, projectPath, {
      lastBackup: now.toISOString(),
      lastModified: mtime.toISOString(),
    });

    backed.push(projectName);
  }

  saveMetadata(metadata);
  return { skipped, backed };
}
