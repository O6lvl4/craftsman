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
        if (!next || next.startsWith('--')) opts[key] = true; else { opts[key] = next; i++; }
      }
    }
  }
  return { cmd, opts };
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
  const out = (o) => { json ? console.log(JSON.stringify(o, null, 2)) : console.log(o); };

  switch (cmd) {
    case 'help':
    default:
      console.log(`Craftsman CLI

Usage:
  craftsman start [--type paper|fabric|neoforge] [--version 1.21.8] [--memory 8G] [--eula true]
  craftsman stop [--force]
  craftsman status [--json]
  craftsman logs [--tail 200] [--follow]

Options:
  --provider docker|local   Provider backend (default docker)
  --json                    JSON output for status/logs
`);
      process.exit(0);

    case 'status': {
      const hasArg = process.argv.includes('--cartridge');
      if (hasArg) {
        const cartridgeId = opts.cartridge || process.argv[process.argv.indexOf('--cartridge')+1];
        if (!cartridgeId) { console.error('Error: --cartridge requires a value'); process.exit(1); }
        const s = await supervisor.status({ cartridgeId });
        return out(s);
      }
      // 省略時は全カセットのステータス一覧
      const list = await supervisor.statuses();
      return out(list);
    }
    case 'start': {
      const cartridgeId = opts.cartridge || process.argv[process.argv.indexOf('--cartridge')+1];
      if (!cartridgeId) { console.error('Error: --cartridge is required'); process.exit(1); }
      const type = (opts.type || '').toLowerCase();
      const version = opts.version || '';
      const memory = opts.memory || '4G';
      const eula = String(opts.eula ?? 'true').toLowerCase() !== 'false';
      const onlineMode = String(opts.onlineMode ?? 'true').toLowerCase() !== 'false';
      const motd = opts.motd;
      const rconEnabled = String(opts.rconEnabled ?? 'true').toLowerCase() !== 'false';
      const rconPassword = opts.rconPassword;
      const slot = opts.slot || (process.argv.includes('--slot') ? process.argv[process.argv.indexOf('--slot')+1] : undefined);
      const res = await supervisor.start({ cartridgeId, slot, type, version, memory, eula, onlineMode, motd, rconEnabled, rconPassword });
      return out({ message: 'started', ...res });
    }
    case 'stop': {
      const cartridgeId = opts.cartridge || process.argv[process.argv.indexOf('--cartridge')+1];
      if (!cartridgeId) { console.error('Error: --cartridge is required'); process.exit(1); }
      const forceKill = !!(opts.force || opts.forceKill);
      const res = await supervisor.stop({ cartridgeId, forceKill });
      return out({ message: forceKill ? 'force killed' : 'stopped', ...res });
    }
    case 'logs': {
      const cartridgeId = opts.cartridge || process.argv[process.argv.indexOf('--cartridge')+1];
      if (!cartridgeId) { console.error('Error: --cartridge is required'); process.exit(1); }
      const tail = parseInt(opts.tail || '200', 10) || 200;
      if (opts.follow && provider instanceof DockerProvider) {
        // Stream docker logs -f for live output
        const name = `mc-${cartridgeId}`;
        const p = spawn('bash', ['-lc', `docker logs -f --tail=${tail} ${name}`], { stdio: 'inherit' });
        p.on('exit', (code) => process.exit(code ?? 0));
        return;
      }
      const lines = await supervisor.logs({ cartridgeId, tail });
      if (json) return out({ lines });
      lines.forEach(l => console.log(l));
      return;
    }
    case 'backup': {
      const cartridgeId = opts.cartridge || process.argv[process.argv.indexOf('--cartridge')+1];
      if (!cartridgeId) { console.error('Error: --cartridge is required'); process.exit(1); }
      const name = opts.name || (process.argv.includes('--name') ? process.argv[process.argv.indexOf('--name')+1] : undefined);
      const res = await supervisor.backup({ cartridgeId, name });
      return out({ message: 'backup created', ...res });
    }
    case 'backups': {
      const sub = (opts._sub = process.argv[3]);
      if (sub !== 'list') { console.error('Usage: craftsman backups list --cartridge <id> [--json]'); process.exit(1); }
      const cartridgeId = opts.cartridge || process.argv[process.argv.indexOf('--cartridge')+1];
      if (!cartridgeId) { console.error('Error: --cartridge is required'); process.exit(1); }
      const list = await supervisor.listBackups({ cartridgeId });
      return out(list);
    }
    case 'restore': {
      const cartridgeId = opts.cartridge || process.argv[process.argv.indexOf('--cartridge')+1];
      const file = opts.file || (process.argv.includes('--file') ? process.argv[process.argv.indexOf('--file')+1] : undefined);
      const keepCurrent = !!(opts.keepCurrent || process.argv.includes('--keep-current'));
      if (!cartridgeId || !file) { console.error('Usage: craftsman restore --cartridge <id> --file <path> [--keep-current]'); process.exit(1); }
      const res = await supervisor.restore({ cartridgeId, file, keepCurrent });
      return out({ message: 'restored', ...res });
    }
    case 'cartridge': {
      const sub = (opts._sub = process.argv[3]);
      const { CartridgeManager } = await import('../src/cartridge/CartridgeManager.js');
      const cm = new CartridgeManager({ dataDir: DATA_DIR });
      const jout = (o) => json ? console.log(JSON.stringify(o, null, 2)) : console.log(o);
      if (!sub || sub === 'help') {
        console.log(`Craftsman Cartridge

Usage:
  craftsman cartridge create --id <id> --type paper|fabric|neoforge --version <ver> [--name NAME]
  craftsman cartridge remove --id <id>
  craftsman cartridge list [--json]
  craftsman cartridge save --id <id> --slot <slot>
  craftsman cartridge set-active --id <id> --slot <slot>
  craftsman cartridge insert --id <id> [--slot <slot>] [--force]
  craftsman cartridge extension <list|add|update|remove> [...]
`);
        return;
      }
      if (sub === 'extension') {
        const action = (process.argv[4] || '').toLowerCase();
        const id = opts.id || (process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id')+1] : undefined);
        if (!id) { console.error('Error: --id <cartridgeId> is required'); process.exit(1); }
        if (action === 'list') {
          const deps = await cm.listExtensions({ id });
          return jout(deps);
        }
        if (action === 'add') {
          const store = opts.store || process.argv[process.argv.indexOf('--store')+1];
          const projectId = opts.project || process.argv[process.argv.indexOf('--project')+1];
          const versionId = opts.version || process.argv[process.argv.indexOf('--version')+1];
          const filename = opts.filename || process.argv[process.argv.indexOf('--filename')+1];
          const deps = await cm.addExtension({ id, store, projectId, versionId, filename });
          return jout({ added: true, extensions: deps });
        }
        if (action === 'update') {
          const store = opts.store || process.argv[process.argv.indexOf('--store')+1];
          const projectId = opts.project || process.argv[process.argv.indexOf('--project')+1];
          const versionId = opts.version || process.argv[process.argv.indexOf('--version')+1];
          const filename = opts.filename || process.argv[process.argv.indexOf('--filename')+1];
          const e = await cm.updateExtension({ id, store, projectId, versionId, filename });
          return jout({ updated: true, extension: e });
        }
        if (action === 'remove') {
          const store = opts.store || process.argv[process.argv.indexOf('--store')+1];
          const projectId = opts.project || process.argv[process.argv.indexOf('--project')+1];
          const r = await cm.removeExtension({ id, store, projectId });
          return jout({ removed: r.removed });
        }
        console.log(`Usage:\n  craftsman cartridge extension list --id <id>\n  craftsman cartridge extension add --id <id> --store <...> --project <projectId> --version <versionId> --filename <filename>\n  craftsman cartridge extension update --id <id> --store <...> --project <projectId> --version <versionId> --filename <filename>\n  craftsman cartridge extension remove --id <id> --store <...> --project <projectId>`);
        process.exit(1);
      }
      if (sub === 'create') {
        const id = opts.id || process.argv[process.argv.indexOf('--id')+1];
        const type = opts.type || process.argv[process.argv.indexOf('--type')+1];
        const version = opts.version || process.argv[process.argv.indexOf('--version')+1];
        const name = opts.name;
        const meta = await cm.create({ id, type, version, name });
        return jout({ created: meta.id, type: type, version: version });
      }
      if (sub === 'remove') {
        const id = opts.id || process.argv[process.argv.indexOf('--id')+1];
        if (!id) { console.error('Error: --id is required'); process.exit(1); }
        const res = await cm.remove({ id });
        return jout(res);
      }
      if (sub === 'list') {
        const list = await cm.list();
        return jout(list);
      }
      if (sub === 'save') {
        const id = opts.id || process.argv[process.argv.indexOf('--id')+1];
        const slot = opts.slot || process.argv[process.argv.indexOf('--slot')+1];
        const r = await cm.saveFromCurrent({ id, slot });
        return jout({ saved: r });
      }
      if (sub === 'set-active') {
        const id = opts.id || process.argv[process.argv.indexOf('--id')+1];
        const slot = opts.slot || process.argv[process.argv.indexOf('--slot')+1];
        const meta = await cm.setActive({ id, slot });
        return jout({ id, activeSlot: meta.activeSlot });
      }
      if (sub === 'insert') {
        const id = opts.id || process.argv[process.argv.indexOf('--id')+1];
        const slot = opts.slot || (process.argv.includes('--slot') ? process.argv[process.argv.indexOf('--slot')+1] : undefined);
        const force = !!(opts.force || process.argv.includes('--force'));
        // If running and force, stop first
        const s = await supervisor.status({ cartridgeId: id });
        if (s.running && force) {
          await supervisor.stop({ cartridgeId: id, forceKill: false }).catch(()=>{});
        } else if (s.running && !force) {
          console.error('Server is running. Use --force to stop before insert.');
          process.exit(1);
        }
        const applied = await cm.insert({ id, slot, force });
        return jout({ inserted: true, id, slot: applied.spec?.slot || slot || null });
      }
      console.error('Unknown cartridge subcommand');
      process.exit(1);
    }
    case 'extension': {
      const section = (process.argv[3] || '').toLowerCase();
      if (section !== 'store') {
        console.log(`Usage:\n  craftsman extension store <search|versions|download> ...`);
        process.exit(1);
      }
      const action = (process.argv[4] || '').toLowerCase();
      const { ExtensionManager } = await import('../src/extensions/ExtensionManager.js');
      const em = new ExtensionManager({});
      await em.init();
      if (action === 'search') {
        const store = opts.store || process.argv[process.argv.indexOf('--store')+1];
        const query = opts.query || process.argv[process.argv.indexOf('--query')+1];
        const platform = opts.platform || (process.argv.includes('--platform') ? process.argv[process.argv.indexOf('--platform')+1] : undefined);
        if (!store || !query) { console.error('Usage: craftsman extension store search --store <modrinth|curseforge|hangar> --query <text> [--platform paper|fabric|neoforge]'); process.exit(1); }
        const res = await em.search({ store, query, platform });
        return out(res);
      }
      if (action === 'versions') {
        const store = opts.store || process.argv[process.argv.indexOf('--store')+1];
        const projectId = opts.project || process.argv[process.argv.indexOf('--project')+1];
        if (!store || !projectId) { console.error('Usage: craftsman extension store versions --store <...> --project <projectId>'); process.exit(1); }
        const res = await em.versions({ store, projectId });
        return out(res);
      }
      if (action === 'download') {
        const store = opts.store || process.argv[process.argv.indexOf('--store')+1];
        const projectId = opts.project || process.argv[process.argv.indexOf('--project')+1];
        const versionId = opts.version || process.argv[process.argv.indexOf('--version')+1];
        if (!store || !projectId || !versionId) { console.error('Usage: craftsman extension store download --store <...> --project <projectId> --version <versionId>'); process.exit(1); }
        const res = await em.download({ store, projectId, versionId });
        return out({ downloaded: true, ...res });
      }
      console.error('Unknown subcommand. Use: craftsman extension store <search|versions|download>');
      process.exit(1);
    }
    case 'cartridge-ext': {
      const sub = (process.argv[3] || '').toLowerCase();
      const { CartridgeManager } = await import('../src/cartridge/CartridgeManager.js');
      const cm = new CartridgeManager({ dataDir: DATA_DIR });
      if (sub === 'add') {
        const id = opts.id || process.argv[process.argv.indexOf('--id')+1];
        const store = opts.store || process.argv[process.argv.indexOf('--store')+1];
        const projectId = opts.project || process.argv[process.argv.indexOf('--project')+1];
        const versionId = opts.version || process.argv[process.argv.indexOf('--version')+1];
        const filename = opts.filename || process.argv[process.argv.indexOf('--filename')+1];
        if (!id || !store || !projectId || !versionId || !filename) {
          console.error('Usage: craftsman cartridge-ext add --id <cartridgeId> --store <...> --project <projectId> --version <versionId> --filename <filename>');
          process.exit(1);
        }
        const deps = await cm.addExtension({ id, store, projectId, versionId, filename });
        return out({ added: true, extensions: deps });
      }
      if (sub === 'list') {
        const id = opts.id || process.argv[process.argv.indexOf('--id')+1];
        if (!id) { console.error('Usage: craftsman cartridge-ext list --id <cartridgeId>'); process.exit(1); }
        const deps = await cm.listExtensions({ id });
        return out(deps);
      }
      console.log(`Usage:\n  craftsman cartridge-ext add --id <id> --store <...> --project <projectId> --version <versionId> --filename <filename>\n  craftsman cartridge-ext list --id <id>`);
      process.exit(1);
    }
  }
}

run().catch((e) => {
  console.error('[craftsman] Error:', e.message || e);
  process.exit(1);
});
