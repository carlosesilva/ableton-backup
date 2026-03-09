import fs from 'fs';
import path from 'path';
import os from 'os';
import * as metadataModule from '../src/metadata';
import {
  expandPath,
  buildArchiveName,
  findProjects,
  getDirectoryMtime,
  zipDirectory,
  isAbletonRunning,
  runBackup,
} from '../src/backup';

describe('expandPath', () => {
  test('expands ~ to home directory', () => {
    const result = expandPath('~/Music');
    expect(result).toBe(path.join(os.homedir(), 'Music'));
  });

  test('leaves absolute paths unchanged', () => {
    expect(expandPath('/absolute/path')).toBe('/absolute/path');
  });
});

describe('buildArchiveName', () => {
  test('builds a correctly formatted archive name', () => {
    const date = new Date('2024-03-15T10:30:00.000Z');
    const name = buildArchiveName('My Project', date);
    expect(name).toMatch(/^My Project \(Backup .+\)\.zip$/);
    expect(name).toContain('2024-03-15');
  });

  test('handles special characters in project name', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const name = buildArchiveName('Beat #1', date);
    expect(name).toMatch(/^Beat #1 \(Backup .+\)\.zip$/);
  });

  test('includes computer name when provided', () => {
    const date = new Date('2024-03-15T10:30:00.000Z');
    const name = buildArchiveName('My Project', date, 'MacBook-Pro');
    expect(name).toMatch(/^My Project \(Backup .+ MacBook-Pro\)\.zip$/);
    expect(name).toContain('MacBook-Pro');
  });

  test('omits computer name suffix when not provided', () => {
    const date = new Date('2024-03-15T10:30:00.000Z');
    const name = buildArchiveName('My Project', date);
    expect(name).toBe('My Project (Backup 2024-03-15_10-30-00-000).zip');
  });
});

describe('findProjects', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ableton-find-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty array when directory does not exist', () => {
    expect(findProjects('/nonexistent/path')).toEqual([]);
  });

  test('returns project directory containing .als file', () => {
    const projectDir = path.join(tmpDir, 'My Set');
    fs.mkdirSync(projectDir);
    fs.writeFileSync(path.join(projectDir, 'My Set.als'), '');
    const found = findProjects(tmpDir);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(projectDir);
  });

  test('ignores directories without .als files', () => {
    const dir = path.join(tmpDir, 'Samples');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'kick.wav'), '');
    expect(findProjects(tmpDir)).toEqual([]);
  });

  test('finds multiple projects', () => {
    for (const name of ['Project A', 'Project B']) {
      const d = path.join(tmpDir, name);
      fs.mkdirSync(d);
      fs.writeFileSync(path.join(d, `${name}.als`), '');
    }
    const found = findProjects(tmpDir);
    expect(found).toHaveLength(2);
  });
});

describe('getDirectoryMtime', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ableton-mtime-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns epoch for empty directory', () => {
    const mtime = getDirectoryMtime(tmpDir);
    expect(mtime.getTime()).toBe(0);
  });

  test('ignores non-.als files', () => {
    const filePath = path.join(tmpDir, 'file.txt');
    fs.writeFileSync(filePath, 'hello');
    const mtime = getDirectoryMtime(tmpDir);
    expect(mtime.getTime()).toBe(0);
  });

  test('returns latest mtime across .als files recursively', () => {
    const rootAls = path.join(tmpDir, 'set1.als');
    fs.writeFileSync(rootAls, 'a');

    const nestedDir = path.join(tmpDir, 'Nested');
    fs.mkdirSync(nestedDir);
    const nestedAls = path.join(nestedDir, 'set2.als');
    fs.writeFileSync(nestedAls, 'b');

    const rootStat = fs.statSync(rootAls);
    const nestedStat = fs.statSync(nestedAls);
    const expected = rootStat.mtime > nestedStat.mtime ? rootStat.mtime : nestedStat.mtime;

    const mtime = getDirectoryMtime(tmpDir);
    expect(mtime.getTime()).toBe(expected.getTime());
  });
});

describe('isAbletonRunning', () => {
  test('returns empty array when Ableton is not running', () => {
    // On a CI/test machine, Ableton won't be running
    const result = isAbletonRunning('/Applications/Ableton Live 11 Suite.app');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  test('returns empty array for a non-existent path', () => {
    const result = isAbletonRunning('/nonexistent/path/to/binary');
    expect(result).toEqual([]);
  });
});

describe('zipDirectory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ableton-zip-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates a zip archive', async () => {
    const srcDir = path.join(tmpDir, 'MyProject');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'song.als'), 'ableton data');
    fs.writeFileSync(path.join(srcDir, 'notes.txt'), 'some notes');

    const outputPath = path.join(tmpDir, 'output.zip');
    await zipDirectory(srcDir, outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);
    const stat = fs.statSync(outputPath);
    expect(stat.size).toBeGreaterThan(0);
  });
});

describe('runBackup', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ableton-runbackup-test-'));
    jest.spyOn(metadataModule, 'loadMetadata').mockReturnValue({ projects: {} });
    jest.spyOn(metadataModule, 'saveMetadata').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test('stores backup inside a project-named subdirectory', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    const destDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(projectsDir);
    fs.mkdirSync(destDir);

    const projectName = 'My Song';
    const projectDir = path.join(projectsDir, projectName);
    fs.mkdirSync(projectDir);
    fs.writeFileSync(path.join(projectDir, 'My Song.als'), '');

    const config = {
      abletonPath: '/nonexistent/Ableton.app',
      projectsPath: projectsDir,
      destinationPath: destDir,
      nodePath: '/usr/bin/node',
      cronFrequency: '0 * * * *',
      active: false,
      computerName: '',
    };

    await runBackup(config);

    const projectBackupDir = path.join(destDir, projectName);
    expect(fs.existsSync(projectBackupDir)).toBe(true);
    expect(fs.statSync(projectBackupDir).isDirectory()).toBe(true);

    const files = fs.readdirSync(projectBackupDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(new RegExp(`^${projectName} \\(Backup .+\\)\\.zip$`));

    // Backup should NOT be placed directly in the destination root
    const rootFiles = fs.readdirSync(destDir).filter((f) => f.endsWith('.zip'));
    expect(rootFiles).toHaveLength(0);
  });
});

