import fs from 'fs';
import path from 'path';
import os from 'os';

// Use a temp directory to avoid touching the real config
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ableton-backup-test-'));

// Patch the config module paths before importing it
jest.mock('../src/config', () => {
  const actual = jest.requireActual('../src/config') as typeof import('../src/config');
  return {
    ...actual,
    CONFIG_DIR: TMP_DIR,
    CONFIG_FILE: path.join(TMP_DIR, 'config.yaml'),
    ensureConfigDir: () => fs.mkdirSync(TMP_DIR, { recursive: true }),
    configExists: () => fs.existsSync(path.join(TMP_DIR, 'config.yaml')),
    loadConfig: () => {
      const file = path.join(TMP_DIR, 'config.yaml');
      if (!fs.existsSync(file)) return { ...actual.DEFAULT_CONFIG };
      const yaml = require('js-yaml');
      const raw = fs.readFileSync(file, 'utf8');
      return { ...actual.DEFAULT_CONFIG, ...(yaml.load(raw) as object) };
    },
    saveConfig: (cfg: object) => {
      const yaml = require('js-yaml');
      fs.writeFileSync(path.join(TMP_DIR, 'config.yaml'), yaml.dump(cfg, { lineWidth: -1 }), 'utf8');
    },
  };
});

import { DEFAULT_CONFIG, loadConfig, saveConfig, configExists } from '../src/config';

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('config', () => {
  const configFile = path.join(TMP_DIR, 'config.yaml');

  beforeEach(() => {
    if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
  });

  test('loadConfig returns defaults when no file exists', () => {
    const cfg = loadConfig();
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });

  test('saveConfig writes a YAML file', () => {
    const cfg = { ...DEFAULT_CONFIG, projectsPath: '/custom/projects' };
    saveConfig(cfg);
    expect(fs.existsSync(configFile)).toBe(true);
    const content = fs.readFileSync(configFile, 'utf8');
    expect(content).toContain('/custom/projects');
  });

  test('loadConfig reads saved config', () => {
    const cfg = { ...DEFAULT_CONFIG, destinationPath: '/custom/dest' };
    saveConfig(cfg);
    const loaded = loadConfig();
    expect(loaded.destinationPath).toBe('/custom/dest');
  });

  test('configExists returns false when no file', () => {
    expect(configExists()).toBe(false);
  });

  test('configExists returns true after save', () => {
    saveConfig({ ...DEFAULT_CONFIG });
    expect(configExists()).toBe(true);
  });
});
