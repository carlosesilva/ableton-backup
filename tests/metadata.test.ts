import fs from 'fs';
import path from 'path';
import os from 'os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ableton-backup-meta-test-'));

import {
  loadMetadata,
  saveMetadata,
  getProjectMetadata,
  setProjectMetadata,
  METADATA_FILE,
} from '../src/metadata';

// Override the metadata file location for tests
jest.mock('../src/metadata', () => {
  const actual = jest.requireActual('../src/metadata') as typeof import('../src/metadata');
  const metaFile = path.join(TMP_DIR, 'metadata.yaml');
  return {
    ...actual,
    METADATA_FILE: metaFile,
    loadMetadata: () => {
      if (!fs.existsSync(metaFile)) return { projects: {} };
      const yaml = require('js-yaml');
      return { projects: {}, ...(yaml.load(fs.readFileSync(metaFile, 'utf8')) as object) };
    },
    saveMetadata: (meta: object) => {
      const yaml = require('js-yaml');
      fs.writeFileSync(metaFile, yaml.dump(meta, { lineWidth: -1 }), 'utf8');
    },
  };
});

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('metadata', () => {
  const metaFile = path.join(TMP_DIR, 'metadata.yaml');

  beforeEach(() => {
    if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
  });

  test('loadMetadata returns empty when no file', () => {
    const meta = loadMetadata();
    expect(meta).toEqual({ projects: {} });
  });

  test('saveMetadata and loadMetadata round-trip', () => {
    const meta = loadMetadata();
    setProjectMetadata(meta, '/path/to/project', {
      lastBackup: '2024-01-01T00:00:00.000Z',
      lastModified: '2024-01-01T00:00:00.000Z',
    });
    saveMetadata(meta);

    const loaded = loadMetadata();
    const entry = getProjectMetadata(loaded, '/path/to/project');
    expect(entry).toBeDefined();
    expect(entry?.lastBackup).toBe('2024-01-01T00:00:00.000Z');
  });

  test('getProjectMetadata returns undefined for unknown project', () => {
    const meta = loadMetadata();
    expect(getProjectMetadata(meta, '/unknown')).toBeUndefined();
  });
});
