import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';

export interface Config {
  abletonPath: string;
  projectsPath: string;
  destinationPath: string;
  nodePath: string;
  cronFrequency: string;
  active: boolean;
}

export const CONFIG_DIR = path.join(os.homedir(), '.ableton-backup');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');

export const DEFAULT_CONFIG: Config = {
  abletonPath: '/Applications/Ableton Live 12 Suite.app',
  projectsPath: path.join(os.homedir(), 'Music', 'Ableton'),
  destinationPath: path.join(os.homedir(), 'Documents', 'Ableton Backups'),
  nodePath: '~/.local/share/mise/shims/node',
  cronFrequency: '0 * * * *',
  active: false,
};

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

export function loadConfig(): Config {
  if (!configExists()) {
    return { ...DEFAULT_CONFIG };
  }
  const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  const parsed = yaml.load(raw) as Partial<Config>;
  return { ...DEFAULT_CONFIG, ...parsed };
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  const content = yaml.dump(config, { lineWidth: -1 });
  fs.writeFileSync(CONFIG_FILE, content, 'utf8');
}
