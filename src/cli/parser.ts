import { DEFAULT_MEMORY, DEFAULT_TYPE, DEFAULT_VERSION, FORMAT_FLAGS, KNOWN_TYPES, MEMORY_PATTERN, RESOURCE_ALIASES, VERB_ALIASES, VERSION_PATTERN } from './constants.js';
import type { CommandOptions, OutputFormat, ParsedCommand, Resource, Verb } from './types.js';

interface SplitArgsResult {
  tokens: string[];
  flags: Record<string, string | boolean>;
}

const SHORT_FLAG_MAP: Record<string, string> = {
  f: 'force',
  q: 'quiet',
  y: 'yes',
  h: 'helpShort'
};

export function parseCommand(argv: string[]): ParsedCommand {
  const { tokens, flags } = splitArgs(argv);
  const rawTokens = [...tokens];
  const rawFlags = { ...flags };

  if (tokens.length === 0) {
    tokens.push('help');
  }

  const verbToken = tokens.shift() ?? 'status';
  const verb = resolveVerb(verbToken);

  let resource: Resource = 'server';
  let target: string | undefined;
  const args: string[] = [];

  if (verb === 'up') {
    const upParse = parseUpTokens(tokens, flags);
    target = upParse.name;
    if (upParse.type) flags.type = upParse.type;
    if (upParse.version) flags.version = upParse.version;
    if (upParse.memory) flags.memory = upParse.memory;
    args.push(...upParse.extras);
  } else {
    if (tokens.length > 0) {
      const candidate = tokens[0]?.toLowerCase();
      if (candidate && candidate in RESOURCE_ALIASES) {
        resource = RESOURCE_ALIASES[candidate];
        tokens.shift();
      }
    }
    if (tokens.length > 0) {
      target = tokens.shift();
    }
    args.push(...tokens);
  }

  const options = buildOptions(flags);
  const format = resolveFormat(flags, options, rawFlags);

  return {
    verb,
    resource,
    target,
    args,
    options,
    rawTokens,
    rawFlags,
    format
  };
}

function resolveVerb(token: string): Verb {
  const key = token.toLowerCase();
  const verb = VERB_ALIASES[key];
  if (!verb) {
    throw new Error(`Unknown command: ${token}`);
  }
  return verb;
}

function splitArgs(argv: string[]): SplitArgsResult {
  const tokens: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let parsingFlags = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (parsingFlags && arg === '--') {
      parsingFlags = false;
      continue;
    }
    if (parsingFlags && arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        flags[key] = value;
      } else {
        const key = arg.slice(2);
        if (key.startsWith('no-')) {
          flags[key.slice(3)] = false;
        } else {
          const next = argv[i + 1];
          if (next !== undefined && !next.startsWith('-')) {
            flags[key] = next;
            i += 1;
          } else {
            flags[key] = true;
          }
        }
      }
    } else if (parsingFlags && arg.startsWith('-') && arg.length > 1) {
      const chars = arg.slice(1).split('');
      for (const ch of chars) {
        const mapped = SHORT_FLAG_MAP[ch] ?? ch;
        flags[mapped] = true;
      }
    } else {
      tokens.push(arg);
    }
  }
  return { tokens, flags };
}

function parseUpTokens(tokens: string[], flags: Record<string, string | boolean>) {
  let name: string | undefined;
  let type = typeof flags.type === 'string' ? String(flags.type).toLowerCase() : undefined;
  let version = typeof flags.version === 'string' ? String(flags.version) : undefined;
  let memory = typeof flags.memory === 'string' ? String(flags.memory) : undefined;
  const extras: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (!type && KNOWN_TYPES.has(lower)) {
      type = lower;
      continue;
    }
    if (!version && VERSION_PATTERN.test(token)) {
      version = token;
      continue;
    }
    if (!memory && MEMORY_PATTERN.test(token)) {
      memory = token.toUpperCase();
      continue;
    }
    if (!name) {
      name = token;
      continue;
    }
    extras.push(token);
  }

  if (!type) type = DEFAULT_TYPE;
  if (!version) version = DEFAULT_VERSION;
  if (!memory) memory = DEFAULT_MEMORY;

  return { name, type, version, memory, extras };
}

function buildOptions(flags: Record<string, string | boolean>): CommandOptions {
  const options: CommandOptions = {};
  if (typeof flags.type === 'string') options.type = flags.type;
  if (typeof flags.version === 'string') options.version = flags.version;
  if (typeof flags.memory === 'string') options.memory = flags.memory;
  if (typeof flags.slot === 'string') options.slot = flags.slot;
  if (typeof flags.from === 'string') options.from = flags.from;
  if (typeof flags.to === 'string') options.to = flags.to;
  if (typeof flags.tail === 'string') options.tail = Number(flags.tail);
  if (typeof flags.provider === 'string') options.provider = flags.provider;
  if (flags.helpShort === true) options.shortHelp = true;
  if (flags.force === true) options.force = true;
  if (flags.follow === true) options.follow = true;
  if (flags.json === true) options.json = true;
  if (flags.yaml === true || flags.yml === true) options.yaml = true;
  if (flags.csv === true) options.csv = true;
  if (flags.quiet === true || flags.q === true) options.quiet = true;
  if (flags.yes === true) options.force = true; // treat -y as force acknowledgement
  return options;
}

function resolveFormat(flags: Record<string, string | boolean>, options: CommandOptions, rawFlags: Record<string, string | boolean>): OutputFormat {
  if (options.quiet) return 'quiet';
  if (options.json) return 'json';
  if (options.yaml) return 'yaml';
  if (options.csv) return 'csv';
  for (const key of Object.keys(rawFlags)) {
    const lower = key.toLowerCase();
    if (lower in FORMAT_FLAGS) {
      return FORMAT_FLAGS[lower];
    }
  }
  return process.stdout.isTTY ? 'table' : 'plain';
}
