import { CRON_MARKER, buildCronLine } from '../src/cron';

// Re-export private helpers for testing by reimplementing them here
// (they aren't exported from cron.ts; test the public API instead)

describe('cron marker', () => {
  test('CRON_MARKER is defined and non-empty', () => {
    expect(CRON_MARKER).toBeTruthy();
    expect(typeof CRON_MARKER).toBe('string');
  });
});

describe('buildCronLine', () => {
  test('includes the frequency, bin path and marker', () => {
    const line = buildCronLine('0 * * * *', '/usr/local/bin/ableton-backup');
    expect(line).toContain('0 * * * *');
    expect(line).toContain('/usr/local/bin/ableton-backup');
    expect(line).toContain(CRON_MARKER);
  });
});
