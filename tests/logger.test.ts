import fs from 'fs';
import os from 'os';
import path from 'path';
import { LOG_FILE, appendLog, appendRunHeader } from '../src/logger';

describe('logger', () => {
  test('LOG_FILE is inside ~/.ableton-backup/', () => {
    const expectedDir = path.join(os.homedir(), '.ableton-backup');
    expect(LOG_FILE).toBe(path.join(expectedDir, 'backup.log'));
  });

  describe('appendLog', () => {
    let appendFileSyncSpy: jest.SpyInstance;
    let existsSyncSpy: jest.SpyInstance;

    beforeEach(() => {
      existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      appendFileSyncSpy = jest.spyOn(fs, 'appendFileSync').mockImplementation(() => undefined as never);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('writes a timestamped message to the log file', () => {
      appendLog('hello world');
      expect(appendFileSyncSpy).toHaveBeenCalledTimes(1);
      const [file, content] = appendFileSyncSpy.mock.calls[0] as [string, string];
      expect(file).toBe(LOG_FILE);
      expect(content).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] hello world\n$/);
    });

    test('creates the log directory if it does not exist', () => {
      existsSyncSpy.mockReturnValue(false);
      const mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
      appendLog('test');
      expect(mkdirSyncSpy).toHaveBeenCalledWith(path.dirname(LOG_FILE), { recursive: true });
    });
  });

  describe('appendRunHeader', () => {
    let appendFileSyncSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      appendFileSyncSpy = jest.spyOn(fs, 'appendFileSync').mockImplementation(() => undefined as never);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('writes a separator and a "Backup run started" line to the log file', () => {
      appendRunHeader();
      expect(appendFileSyncSpy).toHaveBeenCalledTimes(1);
      const [file, content] = appendFileSyncSpy.mock.calls[0] as [string, string];
      expect(file).toBe(LOG_FILE);
      expect(content).toMatch(/={60}/);
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] Backup run started\n$/);
    });

    test('starts with a blank line for visual separation between runs', () => {
      appendRunHeader();
      const [, content] = appendFileSyncSpy.mock.calls[0] as [string, string];
      expect(content).toMatch(/^\n/);
    });
  });
});
