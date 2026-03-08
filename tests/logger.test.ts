import os from 'os';
import path from 'path';
import { LOG_FILE } from '../src/logger';

describe('logger', () => {
  test('LOG_FILE is inside ~/.ableton-backup/', () => {
    const expectedDir = path.join(os.homedir(), '.ableton-backup');
    expect(LOG_FILE).toBe(path.join(expectedDir, 'backup.log'));
  });
});
