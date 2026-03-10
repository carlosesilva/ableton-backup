import fs from 'fs';
import path from 'path';
import os from 'os';
import * as metadataModule from '../src/metadata';
import * as loggerModule from '../src/logger';
import * as throttleModule from '../src/throttle';
import logger from '../src/logger';
import {
  expandPath,
  buildArchiveName,
  findProjects,
  getDirectoryMtime,
  zipDirectory,
  isAbletonRunning,
  runBackup,
  BUFFER_MS,
  NIGHT_HOUR,
  HEARTBEAT_INTERVAL_MS,
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

  test('logs heartbeat messages while archiving', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const logSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    const srcDir = path.join(tmpDir, 'MyProject');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'song.als'), 'ableton data');

    const outputPath = path.join(tmpDir, 'output.zip');

    // Start archiving, then advance fake timers past one heartbeat interval.
    const zipPromise = zipDirectory(srcDir, outputPath);
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    await zipPromise;

    expect(logSpy).toHaveBeenCalledWith('\tStill archiving...');

    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('logs multiple heartbeat messages when archiving takes multiple intervals', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const logSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    const srcDir = path.join(tmpDir, 'MyProject');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'song.als'), 'ableton data');

    const outputPath = path.join(tmpDir, 'output.zip');

    // Start archiving and advance fake timers past two heartbeat intervals.
    const zipPromise = zipDirectory(srcDir, outputPath);
    jest.advanceTimersByTime(2 * HEARTBEAT_INTERVAL_MS);
    await zipPromise;

    const heartbeatCalls = logSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0] === '\tStill archiving...'
    );
    expect(heartbeatCalls.length).toBe(2);

    jest.useRealTimers();
    jest.restoreAllMocks();
  });
});

describe('runBackup', () => {
  let tmpDir: string;
  let logSpy: jest.SpyInstance;
  const ONE_MINUTE_MS = 60_000;
  // Use a time more than 24 hours ago so the mtime date is "yesterday" in ET,
  // which bypasses the "modified today, wait for 11 PM" check.
  const YESTERDAY_MS = 25 * 60 * 60 * 1000;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ableton-runbackup-test-'));
    jest.spyOn(metadataModule, 'loadMetadata').mockReturnValue({ projects: {} });
    jest.spyOn(metadataModule, 'saveMetadata').mockImplementation(() => {});
    jest.spyOn(throttleModule, 'checkThrottle').mockReturnValue({ throttled: false });
    jest.spyOn(throttleModule, 'setLastRun').mockImplementation(() => {});
    logSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  function findLogCall(spy: jest.SpyInstance, prefix: string): unknown[] | undefined {
    return spy.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).startsWith(prefix)
    );
  }

  function makeConfig(overrides: Record<string, unknown> = {}) {
    return {
      abletonPath: '/nonexistent/Ableton.app',
      projectsPath: path.join(tmpDir, 'projects'),
      destinationPath: path.join(tmpDir, 'backups'),
      nodePath: '/usr/bin/node',
      cronFrequency: '0 * * * *',
      active: false,
      computerName: '',
      ...overrides,
    } as Parameters<typeof runBackup>[0];
  }

  test('stores backup inside a project-named subdirectory', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    const destDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(projectsDir);
    fs.mkdirSync(destDir);

    const projectName = 'My Song';
    const projectDir = path.join(projectsDir, projectName);
    fs.mkdirSync(projectDir);
    const alsFile = path.join(projectDir, 'My Song.als');
    fs.writeFileSync(alsFile, '');
    const oldTime = new Date(Date.now() - YESTERDAY_MS);
    fs.utimesSync(alsFile, oldTime, oldTime);

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

  test('logs "Starting backup cycle..." at the beginning', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir);

    await runBackup(makeConfig({ projectsPath: projectsDir }));

    expect(logSpy).toHaveBeenCalledWith('Starting backup cycle...');
  });

  test('logs "Starting backup cycle (dry run)..." for dry runs', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir);

    await runBackup(makeConfig({ projectsPath: projectsDir }), { dryRun: true });

    expect(logSpy).toHaveBeenCalledWith('Starting backup cycle (dry run)...');
  });

  test('logs that Ableton is not running before proceeding', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir);

    await runBackup(makeConfig({ projectsPath: projectsDir }));

    expect(logSpy).toHaveBeenCalledWith('Ableton is not running. Proceeding with backup.');
  });

  test('logs project count after scanning', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir);
    const projectDir = path.join(projectsDir, 'My Song');
    fs.mkdirSync(projectDir);
    fs.writeFileSync(path.join(projectDir, 'My Song.als'), '');

    await runBackup(makeConfig({ projectsPath: projectsDir }), { dryRun: true });

    expect(logSpy).toHaveBeenCalledWith(`Found 1 project(s) in ${projectsDir}.`);
  });

  test('logs each project being checked', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir);
    const projectDir = path.join(projectsDir, 'My Song');
    fs.mkdirSync(projectDir);
    fs.writeFileSync(path.join(projectDir, 'My Song.als'), '');

    await runBackup(makeConfig({ projectsPath: projectsDir }), { dryRun: true });

    expect(logSpy).toHaveBeenCalledWith('Checking project: My Song');
  });

  test('logs skip message when project has not changed', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    const destDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(projectsDir);
    fs.mkdirSync(destDir);

    const projectDir = path.join(projectsDir, 'My Song');
    fs.mkdirSync(projectDir);
    fs.writeFileSync(path.join(projectDir, 'My Song.als'), '');

    const futureDate = new Date(Date.now() + ONE_MINUTE_MS).toISOString();
    jest.spyOn(metadataModule, 'getProjectMetadata').mockReturnValue({
      lastBackup: futureDate,
      lastModified: futureDate,
    });

    await runBackup(makeConfig({ projectsPath: projectsDir, destinationPath: destDir }));

    expect(logSpy).toHaveBeenCalledWith('\tSkipping: no changes since last backup.');
  });

  test('logs backing up and backed up messages for a modified project', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    const destDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(projectsDir);
    fs.mkdirSync(destDir);

    const projectDir = path.join(projectsDir, 'My Song');
    fs.mkdirSync(projectDir);
    const alsFile = path.join(projectDir, 'My Song.als');
    fs.writeFileSync(alsFile, '');
    const oldTime = new Date(Date.now() - YESTERDAY_MS);
    fs.utimesSync(alsFile, oldTime, oldTime);

    await runBackup(makeConfig({ projectsPath: projectsDir, destinationPath: destDir }));

    const backingUpCall = findLogCall(logSpy, '\tBacking up to ');
    expect(backingUpCall).toBeDefined();
    const backedUpCall = findLogCall(logSpy, '\tBacked up to ');
    expect(backedUpCall).toBeDefined();
  });

  test('logs dry-run would-back-up message instead of real backup messages', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir);

    const projectDir = path.join(projectsDir, 'My Song');
    fs.mkdirSync(projectDir);
    const alsFile = path.join(projectDir, 'My Song.als');
    fs.writeFileSync(alsFile, '');
    const oldTime = new Date(Date.now() - YESTERDAY_MS);
    fs.utimesSync(alsFile, oldTime, oldTime);

    await runBackup(makeConfig({ projectsPath: projectsDir }), { dryRun: true });

    const dryRunCall = findLogCall(logSpy, '\t[Dry run] Would back up My Song to ');
    expect(dryRunCall).toBeDefined();
    expect(logSpy).not.toHaveBeenCalledWith('\tBacking up...');
  });

  test('logs final summary with backed and skipped counts', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir);

    await runBackup(makeConfig({ projectsPath: projectsDir }));

    expect(logSpy).toHaveBeenCalledWith('Backup complete. Backed up: 0, Skipped: 0.');
  });

  test('skips project updated less than 30 minutes ago', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    const destDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(projectsDir);
    fs.mkdirSync(destDir);

    const projectDir = path.join(projectsDir, 'My Song');
    fs.mkdirSync(projectDir);
    const alsFile = path.join(projectDir, 'My Song.als');
    fs.writeFileSync(alsFile, '');
    // mtime is very recent (< 30 min ago) -- leave the file as-is

    const result = await runBackup(makeConfig({ projectsPath: projectsDir, destinationPath: destDir }));

    expect(result.skipped).toContain('My Song');
    expect(result.backed).not.toContain('My Song');
    expect(logSpy).toHaveBeenCalledWith('\tSkipping: updated less than 30 minutes ago.');
  });

  test('backs up project updated more than 30 minutes ago', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    const destDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(projectsDir);
    fs.mkdirSync(destDir);

    const projectDir = path.join(projectsDir, 'My Song');
    fs.mkdirSync(projectDir);
    const alsFile = path.join(projectDir, 'My Song.als');
    fs.writeFileSync(alsFile, '');
    const oldTime = new Date(Date.now() - YESTERDAY_MS);
    fs.utimesSync(alsFile, oldTime, oldTime);

    const result = await runBackup(makeConfig({ projectsPath: projectsDir, destinationPath: destDir }));

    expect(result.backed).toContain('My Song');
    expect(result.skipped).not.toContain('My Song');
    expect(logSpy).not.toHaveBeenCalledWith('\tSkipping: updated less than 30 minutes ago.');
  });

  test('skips project already backed up today', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    const destDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(projectsDir);
    fs.mkdirSync(destDir);

    const projectDir = path.join(projectsDir, 'My Song');
    fs.mkdirSync(projectDir);
    const alsFile = path.join(projectDir, 'My Song.als');
    fs.writeFileSync(alsFile, '');
    // mtime is old enough (> 30 min) so the buffer check is not the reason to skip
    const oldTime = new Date(Date.now() - BUFFER_MS - ONE_MINUTE_MS);
    fs.utimesSync(alsFile, oldTime, oldTime);

    // lastBackup is today (in ET); lastModified is before the current mtime to ensure it looks changed.
    // Anchor the timestamp to noon UTC so ET date stays stable regardless of when the test runs.
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const todayNoonISO = new Date(`${todayET}T17:00:00.000Z`).toISOString(); // 12 or 1 PM ET
    const beforeMtime = new Date(oldTime.getTime() - ONE_MINUTE_MS).toISOString();
    jest.spyOn(metadataModule, 'getProjectMetadata').mockReturnValue({
      lastBackup: todayNoonISO,
      lastModified: beforeMtime,
    });

    const result = await runBackup(makeConfig({ projectsPath: projectsDir, destinationPath: destDir }));

    expect(result.skipped).toContain('My Song');
    expect(result.backed).not.toContain('My Song');
    expect(logSpy).toHaveBeenCalledWith('\tSkipping: already backed up today.');
  });

  test('skips project modified today when hour is before NIGHT_HOUR', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    const destDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(projectsDir);
    fs.mkdirSync(destDir);

    const projectDir = path.join(projectsDir, 'My Song');
    fs.mkdirSync(projectDir);
    const alsFile = path.join(projectDir, 'My Song.als');
    fs.writeFileSync(alsFile, '');
    // mtime is old enough to pass the buffer check but still "today"
    const oldTime = new Date(Date.now() - BUFFER_MS - ONE_MINUTE_MS);
    fs.utimesSync(alsFile, oldTime, oldTime);

    // Simulate current ET hour being before NIGHT_HOUR and mtime date == today ET date
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    jest.spyOn(loggerModule, 'getETDateString').mockReturnValue(today);
    jest.spyOn(loggerModule, 'toETDateString').mockReturnValue(today);
    jest.spyOn(loggerModule, 'getETHour').mockReturnValue(NIGHT_HOUR - 1);

    const result = await runBackup(makeConfig({ projectsPath: projectsDir, destinationPath: destDir }));

    expect(result.skipped).toContain('My Song');
    expect(result.backed).not.toContain('My Song');
    expect(logSpy).toHaveBeenCalledWith(
      '\tSkipping: modified today, waiting until 11 PM ET to back up.'
    );
  });

  test('backs up project modified today when hour is at or after NIGHT_HOUR', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    const destDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(projectsDir);
    fs.mkdirSync(destDir);

    const projectDir = path.join(projectsDir, 'My Song');
    fs.mkdirSync(projectDir);
    const alsFile = path.join(projectDir, 'My Song.als');
    fs.writeFileSync(alsFile, '');
    const oldTime = new Date(Date.now() - BUFFER_MS - ONE_MINUTE_MS);
    fs.utimesSync(alsFile, oldTime, oldTime);

    // Simulate current ET hour being at NIGHT_HOUR and mtime date == today ET date
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    jest.spyOn(loggerModule, 'getETDateString').mockReturnValue(today);
    jest.spyOn(loggerModule, 'toETDateString').mockReturnValue(today);
    jest.spyOn(loggerModule, 'getETHour').mockReturnValue(NIGHT_HOUR);

    const result = await runBackup(makeConfig({ projectsPath: projectsDir, destinationPath: destDir }), { dryRun: true });

    expect(result.backed).toContain('My Song');
    expect(result.skipped).not.toContain('My Song');
    expect(logSpy).not.toHaveBeenCalledWith(
      '\tSkipping: modified today, waiting until 11 PM ET to back up.'
    );
  });

  test('backs up project modified on a previous day regardless of current hour', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    const destDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(projectsDir);
    fs.mkdirSync(destDir);

    const projectDir = path.join(projectsDir, 'My Song');
    fs.mkdirSync(projectDir);
    const alsFile = path.join(projectDir, 'My Song.als');
    fs.writeFileSync(alsFile, '');
    const oldTime = new Date(Date.now() - BUFFER_MS - ONE_MINUTE_MS);
    fs.utimesSync(alsFile, oldTime, oldTime);

    // Simulate mtime date being yesterday (not today) and current hour being early morning
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
    });
    jest.spyOn(loggerModule, 'getETDateString').mockReturnValue(today);
    jest.spyOn(loggerModule, 'toETDateString').mockReturnValue(yesterday);
    jest.spyOn(loggerModule, 'getETHour').mockReturnValue(NIGHT_HOUR - 10); // early morning

    const result = await runBackup(makeConfig({ projectsPath: projectsDir, destinationPath: destDir }), { dryRun: true });

    expect(result.backed).toContain('My Song');
    expect(result.skipped).not.toContain('My Song');
  });

  test('returns early and logs throttle message when throttled', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir);

    const until = new Date('2026-03-10T19:04:12.000Z'); // fixed date for determinism
    jest.spyOn(throttleModule, 'checkThrottle').mockReturnValue({ throttled: true, until });

    const result = await runBackup(makeConfig({ projectsPath: projectsDir }));

    expect(result.skipped).toEqual([]);
    expect(result.backed).toEqual([]);
    expect(result.throttled).toBe(true);
    expect(result.error).toBeUndefined();
    // Only the throttle message should be logged
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [msg] = logSpy.mock.calls[0] as [string];
    expect(msg).toMatch(/^Backup run throttled until /);
  });

  test('does not throttle dry runs', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir);

    const until = new Date(Date.now() + 5 * 60 * 1000);
    jest.spyOn(throttleModule, 'checkThrottle').mockReturnValue({ throttled: true, until });

    await runBackup(makeConfig({ projectsPath: projectsDir }), { dryRun: true });

    expect(logSpy).toHaveBeenCalledWith('Starting backup cycle (dry run)...');
  });

  test('records run time via setLastRun when not throttled', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir);

    await runBackup(makeConfig({ projectsPath: projectsDir }));

    expect(throttleModule.setLastRun).toHaveBeenCalledTimes(1);
  });

  test('does not call setLastRun for dry runs', async () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir);

    await runBackup(makeConfig({ projectsPath: projectsDir }), { dryRun: true });

    expect(throttleModule.setLastRun).not.toHaveBeenCalled();
  });
});

