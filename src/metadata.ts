import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { CONFIG_DIR, ensureConfigDir } from './config';

export interface ProjectMetadata {
  lastBackup: string; // ISO timestamp
  lastModified: string; // ISO timestamp at last backup
}

export interface Metadata {
  projects: Record<string, ProjectMetadata>;
}

export const METADATA_FILE = path.join(CONFIG_DIR, 'metadata.yaml');

export function loadMetadata(): Metadata {
  if (!fs.existsSync(METADATA_FILE)) {
    return { projects: {} };
  }
  const raw = fs.readFileSync(METADATA_FILE, 'utf8');
  const parsed = yaml.load(raw) as Partial<Metadata>;
  return { projects: {}, ...parsed };
}

export function saveMetadata(metadata: Metadata): void {
  ensureConfigDir();
  const content = yaml.dump(metadata, { lineWidth: -1 });
  fs.writeFileSync(METADATA_FILE, content, 'utf8');
}

export function getProjectMetadata(
  metadata: Metadata,
  projectPath: string
): ProjectMetadata | undefined {
  return metadata.projects[projectPath];
}

export function setProjectMetadata(
  metadata: Metadata,
  projectPath: string,
  meta: ProjectMetadata
): void {
  metadata.projects[projectPath] = meta;
}
