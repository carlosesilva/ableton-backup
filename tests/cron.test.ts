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
  test('includes the frequency, node path, cli path and marker', () => {
    const line = buildCronLine('0 * * * *', '/usr/local/bin/node', '/tmp/dist/cli.js');
    expect(line).toContain('0 * * * *');
    expect(line).toContain('"/usr/local/bin/node"');
    expect(line).toContain('"/tmp/dist/cli.js" run');
    expect(line).toContain(CRON_MARKER);
  });

  test('does not redirect stdout or stderr', () => {
    const line = buildCronLine('0 * * * *', '/usr/local/bin/node', '/tmp/dist/cli.js');
    expect(line).not.toContain('>>');
    expect(line).not.toContain('2>&1');
  });

  test('expands ~ in node path before writing the line', () => {
    const line = buildCronLine('0 * * * *', '~/.local/share/mise/shims/node', '/tmp/dist/cli.js');
    expect(line).not.toContain('"~/.local/share/mise/shims/node"');
  });
});
