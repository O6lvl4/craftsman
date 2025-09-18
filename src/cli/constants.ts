import type { OutputFormat, Resource, Verb } from './types.js';

export const DEFAULT_MEMORY = '8G';
export const DEFAULT_VERSION = 'latest';
export const DEFAULT_TYPE = 'paper';

export const KNOWN_TYPES = new Set(['paper', 'fabric', 'neoforge']);

export const VERB_ALIASES: Record<string, Verb> = {
  help: 'help',
  up: 'up',
  start: 'start',
  stop: 'stop',
  st: 'status',
  status: 'status',
  ls: 'list',
  list: 'list',
  show: 'show',
  info: 'show',
  logs: 'logs',
  log: 'logs',
  backup: 'backup',
  bk: 'backup',
  delete: 'delete',
  remove: 'delete',
  rm: 'delete',
  quickstart: 'quickstart',
  upgrade: 'upgrade',
  migrate: 'migrate',
  clone: 'clone'
};

export const RESOURCE_ALIASES: Record<string, Resource> = {
  server: 'server',
  servers: 'server',
  pak: 'server',
  paks: 'server',
  cartridge: 'server',
  cartridges: 'server',
  backup: 'backup',
  backups: 'backup'
};

export const FORMAT_FLAGS: Record<string, OutputFormat> = {
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  csv: 'csv',
  quiet: 'quiet',
  q: 'quiet'
};

export const MEMORY_PATTERN = /^\d+(?:[GM]|GB|MB)$/i;
export const VERSION_PATTERN = /^(latest|\d+(?:\.\d+){0,2}(?:-\w+)?)$/i;

export const CONTEXT_FILE = '.craftsman-cli.json';
