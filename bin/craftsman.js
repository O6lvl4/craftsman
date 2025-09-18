#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import { Supervisor } from '../src/supervisor/Supervisor.js';
import { DockerProvider } from '../src/supervisor/providers/DockerProvider.js';
import { LocalProvider } from '../src/supervisor/providers/LocalProvider.js';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0] || 'help';
  const opts = {};
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [k, v] = a.replace(/^--/, '').split('=');
      const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (v !== undefined) opts[key] = v;
      else {
        const next = args[i + 1];
        if (!next || next.startsWith('--')) opts[key] = true;
        else {
          opts[key] = next;
          i++;
        }
      }
    }
  }
  return { cmd, opts };
}

function flagKey(flag) {
  return flag.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function hasFlag(flag) {
  return process.argv.includes(flag) || process.argv.some(arg => arg.startsWith(`${flag}=`));
}

function getFlagValue(flag, opts) {
  const key = flagKey(flag);
  const optVal = opts[key];
  if (typeof optVal === 'string' && optVal.length > 0) return optVal;
  if (typeof optVal === 'number') return String(optVal);
  const eqArg = process.argv.find(arg => arg.startsWith(`${flag}=`));
  if (eqArg) {
    const val = eqArg.slice(flag.length + 1);
    return val || undefined;
  }
  const idx = process.argv.indexOf(flag);
  if (idx !== -1) {
    const next = process.argv[idx + 1];
    if (next && !next.startsWith('--')) return next;
    return undefined;
  }
  return undefined;
}

function requireFlag(flag, opts, message) {
  const value = getFlagValue(flag, opts);
  if (!value) {
    console.error(message);
    process.exit(1);
  }
  return value;
}

function getBooleanFlag(flag, opts, fallback = false) {
  const key = flagKey(flag);
  const optVal = opts[key];
  if (typeof optVal === 'boolean') return optVal;
  if (typeof optVal === 'string') {
    const lower = optVal.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lower)) return true;
    if (['false', '0', 'no', 'off'].includes(lower)) return false;
  }
  return hasFlag(flag) ? true : fallback;
}

function providerFrom(opts) {
  const name = (opts.provider || process.env.PROVIDER || 'docker').toLowerCase();
  if (name === 'local') return new LocalProvider({ dataDir: DATA_DIR });
  return new DockerProvider({ dataDir: DATA_DIR });
}

async function run() {
  const { cmd, opts } = parseArgs(process.argv);
  const provider = providerFrom(opts);
  const supervisor = new Supervisor({ provider, dataDir: DATA_DIR });

  const json = !!opts.json;
  const out = (o) => {
    if (json) console.log(JSON.stringify(o, null, 2));
    else console.log(o);
  };

  switch (cmd) {
    case 'help':
    default:
      console.log(`Craftsman CLI

Usage:
  craftsman start --pak <id> [--slot <slot>] [--type paper|fabric|neoforge] [--version 1.21.8] [--memory 8G] [--eula true]
  craftsman stop --pak <id> [--force]
  craftsman status [--pak <id>] [--json]
  craftsman logs --pak <id> [--tail 200] [--follow]

Options:
  --provider docker|local   Provider backend (default docker)
  --json                    JSON output for status/logs
`);
      process.exit(0);

    case 'status': {
      const hasPak = hasFlag('--pak');
      if (hasPak) {
        const pakId = getFlagValue('--pak', opts);
        if (!pakId) {
          console.error('Error: --pak requires a value');
          process.exit(1);
        }
        const s = await supervisor.status({ pakId });
        return out(s);
      }
      const list = await supervisor.statuses();
      return out(list);
    }
    case 'start': {
      const pakId = requireFlag('--pak', opts, 'Error: --pak is required');
      const type = (getFlagValue('--type', opts) || '').toLowerCase();
      const version = getFlagValue('--version', opts) || '';
      const memory = getFlagValue('--memory', opts) || '4G';
      const eula = !['false', '0', 'no', 'off'].includes(String(getFlagValue('--eula', opts) ?? opts.eula ?? 'true').toLowerCase());
      const onlineMode = !['false', '0', 'no', 'off'].includes(String(getFlagValue('--onlineMode', opts) ?? opts.onlineMode ?? 'true').toLowerCase());
      const motd = getFlagValue('--motd', opts);
      const rconEnabled = !['false', '0', 'no', 'off'].includes(String(getFlagValue('--rconEnabled', opts) ?? opts.rconEnabled ?? 'true').toLowerCase());
      const rconPassword = getFlagValue('--rconPassword', opts);
      const slot = getFlagValue('--slot', opts);
      const res = await supervisor.start({ pakId, slot, type, version, memory, eula, onlineMode, motd, rconEnabled, rconPassword });
      return out({ message: 'started', ...res });
    }
    case 'stop': {
      const pakId = requireFlag('--pak', opts, 'Error: --pak is required');
      const forceKill = getBooleanFlag('--force', opts) || getBooleanFlag('--force-kill', opts) || !!opts.forceKill;
      const res = await supervisor.stop({ pakId, forceKill });
      return out({ message: forceKill ? 'force killed' : 'stopped', ...res });
    }
    case 'logs': {
      const pakId = requireFlag('--pak', opts, 'Error: --pak is required');
      const tail = parseInt(getFlagValue('--tail', opts) || opts.tail || '200', 10) || 200;
      if (getBooleanFlag('--follow', opts) && provider instanceof DockerProvider) {
        const name = `mc-${pakId}`;
        const p = spawn('bash', ['-lc', `docker logs -f --tail=${tail} ${name}`], { stdio: 'inherit' });
        p.on('exit', (code) => process.exit(code ?? 0));
        return;
      }
      const lines = await supervisor.logs({ pakId, tail });
      if (json) return out({ lines });
      lines.forEach(l => console.log(l));
      return;
    }
    case 'backup': {
      const pakId = requireFlag('--pak', opts, 'Error: --pak is required');
      const name = getFlagValue('--name', opts);
      const res = await supervisor.backup({ pakId, name });
      return out({ message: 'backup created', ...res });
    }
    case 'backups': {
      const sub = (process.argv[3] || '').toLowerCase();
      if (sub !== 'list') {
        console.error('Usage: craftsman backups list --pak <id> [--json]');
        process.exit(1);
      }
      const pakId = requireFlag('--pak', opts, 'Error: --pak is required');
      const list = await supervisor.listBackups({ pakId });
      return out(list);
    }
    case 'restore': {
      const pakId = requireFlag('--pak', opts, 'Error: --pak is required');
      const file = requireFlag('--file', opts, 'Usage: craftsman restore --pak <id> --file <path> [--keep-current]');
      const keepCurrent = getBooleanFlag('--keep-current', opts, false) || !!opts.keepCurrent;
      const res = await supervisor.restore({ pakId, file, keepCurrent });
      return out({ message: 'restored', ...res });
    }
    case 'pak': {
      const sub = (process.argv[3] || '').toLowerCase();
      const { PakManager } = await import('../src/pak/PakManager.js');
      const cm = new PakManager({ dataDir: DATA_DIR });
      const jout = (o) => {
        if (json) console.log(JSON.stringify(o, null, 2));
        else console.log(o);
      };
      if (!sub || sub === 'help') {
        console.log(`Craftsman Pak

Usage:
  craftsman pak create --id <id> --type paper|fabric|neoforge --version <ver> [--name NAME]
  craftsman pak remove --id <id>
  craftsman pak list [--json]
  craftsman pak save --id <id> --slot <slot>
  craftsman pak set-active --id <id> --slot <slot>
  craftsman pak insert --id <id> [--slot <slot>] [--force]
  craftsman pak extension <list|add|update|remove> [...]
`);
        return;
      }
      const extensionUsage = `Usage:\n  craftsman pak extension list --id <id>\n  craftsman pak extension add --id <id> --store <...> --project <projectId> --version <versionId> --filename <filename>\n  craftsman pak extension update --id <id> --store <...> --project <projectId> --version <versionId> --filename <filename>\n  craftsman pak extension remove --id <id> --store <...> --project <projectId>`;
      if (sub === 'extension') {
        const action = (process.argv[4] || '').toLowerCase();
        if (!action) {
          console.log(extensionUsage);
          process.exit(1);
        }
        if (action === 'list') {
          const id = requireFlag('--id', opts, 'Error: --id <pakId> is required');
          const deps = await cm.listExtensions({ id });
          return jout(deps);
        }
        if (action === 'add' || action === 'update' || action === 'remove') {
          const id = getFlagValue('--id', opts);
          const store = getFlagValue('--store', opts);
          const projectId = getFlagValue('--project', opts);
          if (!id || !store || !projectId) {
            console.log(extensionUsage);
            process.exit(1);
          }
          if (action === 'remove') {
            const r = await cm.removeExtension({ id, store, projectId });
            return jout({ removed: r.removed });
          }
          const versionId = getFlagValue('--version', opts);
          const filename = getFlagValue('--filename', opts);
          if (!versionId || !filename) {
            console.log(extensionUsage);
            process.exit(1);
          }
          if (action === 'add') {
            const deps = await cm.addExtension({ id, store, projectId, versionId, filename });
            return jout({ added: true, extensions: deps });
          }
          const e = await cm.updateExtension({ id, store, projectId, versionId, filename });
          return jout({ updated: true, extension: e });
        }
        console.log(extensionUsage);
        process.exit(1);
      }
      if (sub === 'create') {
        const id = requireFlag('--id', opts, 'Error: --id is required');
        const type = requireFlag('--type', opts, 'Error: --type is required');
        const version = requireFlag('--version', opts, 'Error: --version is required');
        const name = getFlagValue('--name', opts);
        const meta = await cm.create({ id, type, version, name });
        return jout({ created: meta.id, type, version });
      }
      if (sub === 'remove') {
        const id = requireFlag('--id', opts, 'Error: --id is required');
        const res = await cm.remove({ id });
        return jout(res);
      }
      if (sub === 'list') {
        const list = await cm.list();
        return jout(list);
      }
      if (sub === 'save') {
        const id = requireFlag('--id', opts, 'Error: --id is required');
        const slot = requireFlag('--slot', opts, 'Error: --slot is required');
        const r = await cm.saveFromCurrent({ id, slot });
        return jout({ saved: r });
      }
      if (sub === 'set-active') {
        const id = requireFlag('--id', opts, 'Error: --id is required');
        const slot = requireFlag('--slot', opts, 'Error: --slot is required');
        const meta = await cm.setActive({ id, slot });
        return jout({ id, activeSlot: meta.activeSlot });
      }
      if (sub === 'insert') {
        const id = requireFlag('--id', opts, 'Error: --id is required');
        const slot = getFlagValue('--slot', opts);
        const force = getBooleanFlag('--force', opts);
        const s = await supervisor.status({ pakId: id }).catch(() => ({ running: false }));
        if (s.running && force) {
          await supervisor.stop({ pakId: id, forceKill: false }).catch(() => {});
        } else if (s.running && !force) {
          console.error('Server is running. Use --force to stop before insert.');
          process.exit(1);
        }
        const applied = await cm.insert({ id, slot, force });
        return jout({ inserted: true, id, slot: applied.spec?.slot || slot || null });
      }
      console.error('Unknown pak subcommand');
      process.exit(1);
    }
    case 'extension': {
      const section = (process.argv[3] || '').toLowerCase();
      if (section !== 'store') {
        console.log('Usage:\n  craftsman extension store <search|versions|download> ...');
        process.exit(1);
      }
      const action = (process.argv[4] || '').toLowerCase();
      const { ExtensionManager } = await import('../src/extensions/ExtensionManager.js');
      const em = new ExtensionManager({});
      await em.init();
      if (action === 'search') {
        const store = requireFlag('--store', opts, 'Usage: craftsman extension store search --store <modrinth|curseforge|hangar> --query <text> [--platform paper|fabric|neoforge]');
        const query = requireFlag('--query', opts, 'Usage: craftsman extension store search --store <modrinth|curseforge|hangar> --query <text> [--platform paper|fabric|neoforge]');
        const platform = getFlagValue('--platform', opts);
        const res = await em.search({ store, query, platform });
        return out(res);
      }
      if (action === 'versions') {
        const store = requireFlag('--store', opts, 'Usage: craftsman extension store versions --store <...> --project <projectId>');
        const projectId = requireFlag('--project', opts, 'Usage: craftsman extension store versions --store <...> --project <projectId>');
        const res = await em.versions({ store, projectId });
        return out(res);
      }
      if (action === 'download') {
        const store = requireFlag('--store', opts, 'Usage: craftsman extension store download --store <...> --project <projectId> --version <versionId>');
        const projectId = requireFlag('--project', opts, 'Usage: craftsman extension store download --store <...> --project <projectId> --version <versionId>');
        const versionId = requireFlag('--version', opts, 'Usage: craftsman extension store download --store <...> --project <projectId> --version <versionId>');
        const res = await em.download({ store, projectId, versionId });
        return out({ downloaded: true, ...res });
      }
      console.error('Unknown subcommand. Use: craftsman extension store <search|versions|download>');
      process.exit(1);
    }
    case 'pak-ext': {
      const sub = (process.argv[3] || '').toLowerCase();
      const { PakManager } = await import('../src/pak/PakManager.js');
      const cm = new PakManager({ dataDir: DATA_DIR });
      if (sub === 'add') {
        const id = requireFlag('--id', opts, 'Usage: craftsman pak-ext add --id <pakId> --store <...> --project <projectId> --version <versionId> --filename <filename>');
        const store = requireFlag('--store', opts, 'Usage: craftsman pak-ext add --id <pakId> --store <...> --project <projectId> --version <versionId> --filename <filename>');
        const projectId = requireFlag('--project', opts, 'Usage: craftsman pak-ext add --id <pakId> --store <...> --project <projectId> --version <versionId> --filename <filename>');
        const versionId = requireFlag('--version', opts, 'Usage: craftsman pak-ext add --id <pakId> --store <...> --project <projectId> --version <versionId> --filename <filename>');
        const filename = requireFlag('--filename', opts, 'Usage: craftsman pak-ext add --id <pakId> --store <...> --project <projectId> --version <versionId> --filename <filename>');
        const deps = await cm.addExtension({ id, store, projectId, versionId, filename });
        return out({ added: true, extensions: deps });
      }
      if (sub === 'list') {
        const id = requireFlag('--id', opts, 'Usage: craftsman pak-ext list --id <pakId>');
        const deps = await cm.listExtensions({ id });
        return out(deps);
      }
      console.log('Usage:\n  craftsman pak-ext add --id <id> --store <...> --project <projectId> --version <versionId> --filename <filename>\n  craftsman pak-ext list --id <id>');
      process.exit(1);
    }
  }
}

run().catch((e) => {
  console.error('[craftsman] Error:', e.message || e);
  process.exit(1);
});
