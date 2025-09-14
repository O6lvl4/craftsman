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
      const s = await supervisor.status();
      return out(s);
    }
    case 'start': {
      const type = (opts.type || 'paper').toLowerCase();
      const version = opts.version || '1.21.8';
      const memory = opts.memory || '4G';
      const eula = String(opts.eula ?? 'true').toLowerCase() !== 'false';
      const onlineMode = String(opts.onlineMode ?? 'true').toLowerCase() !== 'false';
      const motd = opts.motd;
      const rconEnabled = String(opts.rconEnabled ?? 'true').toLowerCase() !== 'false';
      const rconPassword = opts.rconPassword;
      const res = await supervisor.start({ type, version, memory, eula, onlineMode, motd, rconEnabled, rconPassword });
      return out({ message: 'started', ...res });
    }
    case 'stop': {
      const forceKill = !!(opts.force || opts.forceKill);
      const res = await supervisor.stop({ forceKill });
      return out({ message: forceKill ? 'force killed' : 'stopped', ...res });
    }
    case 'logs': {
      const tail = parseInt(opts.tail || '200', 10) || 200;
      if (opts.follow && provider instanceof DockerProvider) {
        // Stream docker logs -f for live output
        const name = 'mc-default';
        const p = spawn('bash', ['-lc', `docker logs -f --tail=${tail} ${name}`], { stdio: 'inherit' });
        p.on('exit', (code) => process.exit(code ?? 0));
        return;
      }
      const lines = await supervisor.logs({ tail });
      if (json) return out({ lines });
      lines.forEach(l => console.log(l));
      return;
    }
  }
}

run().catch((e) => {
  console.error('[craftsman] Error:', e.message || e);
  process.exit(1);
});

