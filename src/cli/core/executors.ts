import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import figlet from 'figlet';
import { DEFAULT_MEMORY, DEFAULT_TYPE, DEFAULT_VERSION, KNOWN_TYPES } from '../constants.js';
import type {
  CommandDefinition,
  CommandResult,
  ExecutionContext,
  ParsedCommand,
  PromptPlan,
  PromptSequence,
  ServerSummary,
  UpActionResult
} from '../types.js';
import { formatDuration, formatIsoDate, formatPlainTable, humanFileSize } from '../utils/formatters.js';
import { assertTarget, resolveContextTarget } from '../utils/targets.js';
import { PakManager, type PakMetadata } from '../../pak/PakManager.js';
import type { SupervisorStatus } from '../../supervisor/Supervisor.js';

const definitions = new Map<string, CommandDefinition>();

const CRAFTSMAN_ASCII = figlet.textSync('CRAFTSMAN', { font: 'Block' });

addCommand({
  verb: 'help',
  description: 'Show Craftsman overview and command summary',
  run: helpCommand
});

addCommand({
  verb: 'status',
  description: 'Show server status summary',
  run: statusCommand
});

addCommand({
  verb: 'list',
  description: 'List servers',
  run: statusCommand
});

addCommand({
  verb: 'show',
  description: 'Show detailed server information',
  requiresTarget: true,
  allowContextResolution: true,
  preparePrompts: prepareTargetPrompt,
  run: showCommand
});

addCommand({
  verb: 'start',
  description: 'Start a server',
  requiresTarget: true,
  allowContextResolution: true,
  preparePrompts: prepareTargetPrompt,
  run: startCommand
});

addCommand({
  verb: 'stop',
  description: 'Stop a server',
  requiresTarget: true,
  allowContextResolution: true,
  preparePrompts: prepareTargetPrompt,
  run: stopCommand
});

addCommand({
  verb: 'logs',
  description: 'Show recent logs',
  requiresTarget: false,
  allowContextResolution: true,
  preparePrompts: prepareTargetPrompt,
  run: logsCommand
});

addCommand({
  verb: 'backup',
  description: 'Create a backup',
  requiresTarget: false,
  allowContextResolution: true,
  preparePrompts: prepareTargetPrompt,
  run: backupCommand
});

addCommand({
  verb: 'up',
  description: 'Create or start a server',
  run: upCommand,
  preparePrompts: prepareUpPrompts
});

addCommand({
  verb: 'delete',
  description: 'Delete a server and its data',
  requiresTarget: true,
  allowContextResolution: true,
  preparePrompts: prepareDeletePrompts,
  run: deleteCommand
});

addCommand({
  verb: 'quickstart',
  description: 'Create, start, and expose a server with sensible defaults',
  run: quickstartCommand
});

addCommand({
  verb: 'upgrade',
  description: 'Upgrade server version with backup and rollback support',
  requiresTarget: true,
  allowContextResolution: true,
  preparePrompts: prepareUpgradePrompts,
  run: upgradeCommand
});

addCommand({
  verb: 'migrate',
  description: 'Migrate server between engine types',
  requiresTarget: true,
  allowContextResolution: true,
  preparePrompts: prepareMigratePrompts,
  run: migrateCommand
});

addCommand({
  verb: 'clone',
  description: 'Clone a server into a new instance',
  requiresTarget: true,
  allowContextResolution: true,
  preparePrompts: prepareClonePrompts,
  run: cloneCommand
});

export function getCommandDefinition(verb: string): CommandDefinition | undefined {
  return definitions.get(verb);
}

function addCommand(definition: CommandDefinition): void {
  definitions.set(definition.verb, definition);
}

async function helpCommand(command: ParsedCommand): Promise<CommandResult> {
  const commands = Array.from(definitions.values()).filter((def) => def.verb !== 'help');
  const rows = commands.map((def) => [def.verb, def.description ?? '']);
  const lines: string[] = [];
  if (!command.options.shortHelp) {
    lines.push(CRAFTSMAN_ASCII, 'CRAFTSMAN', '');
  }
  lines.push(
    'Craftsman 2.0 – Zero-config, Fail-safe, Stream-first',
    '',
    'Usage:',
    '  craftsman <verb> [resource] [target] [options]',
    '',
    'Core verbs:'
  );
  const message = lines.join('\n');
  return {
    success: true,
    message,
    table: {
      headers: ['verb', 'description'],
      rows
    },
    data: { commands: rows }
  };
}

async function statusCommand(_command: ParsedCommand, context: ExecutionContext): Promise<CommandResult> {
  const statuses = await context.supervisor.statuses();
  const rows = await Promise.all(
    statuses.map(async (status) => {
      const meta = await safeReadMeta(context.pakManager, status.id);
      const uptime = status.startedAt ? formatDuration(status.startedAt) : '-';
      const indicator = status.running ? '● up' : '○ down';
      const type = status.type || meta?.engine?.serverType || '-';
      const version = status.version || meta?.engine?.version || '-';
      const slot = status.level || meta?.activeSlot || '-';
      return [status.id, type, version, indicator, slot, uptime];
    })
  );

  return {
    success: true,
    table: {
      headers: ['SERVER', 'TYPE', 'VERSION', 'STATUS', 'SLOT', 'UPTIME'],
      rows
    },
    data: statuses
  };
}

async function showCommand(command: ParsedCommand, context: ExecutionContext): Promise<CommandResult> {
  const target = await assertTarget(command, context);
  const meta = await context.pakManager.readMetadata(target);
  const status = await context.supervisor.status({ pakId: target });
  const rows: Array<[string, string]> = [
    ['Server', meta.name || meta.id],
    ['Type', meta.engine.serverType],
    ['Version', meta.engine.version],
    ['Active Slot', meta.activeSlot || '-'],
    ['Status', status.running ? '● up' : '○ down'],
    ['Started', status.startedAt ? formatIsoDate(status.startedAt) : '-'],
    ['Ports', status.ports ? Object.entries(status.ports).map(([k, v]) => `${k}:${v}`).join(', ') : '-'],
    ['Extensions', String(meta.extensions?.length ?? 0)],
    ['Saved Slots', String(meta.saves?.slots?.length ?? 0)],
    ['Created', formatIsoDate(meta.createdAt)]
  ];
  return {
    success: true,
    message: formatPlainTable(rows),
    data: { meta, status }
  };
}

async function startCommand(command: ParsedCommand, context: ExecutionContext): Promise<CommandResult> {
  const target = await assertTarget(command, context, { allowContext: true });
  const meta = await context.pakManager.readMetadata(target);
  const result = await context.supervisor.start({ pakId: target });
  await context.state.update({ lastServer: target });
  return {
    success: true,
    message: `Started ${target} (${meta.engine.serverType} ${meta.engine.version})`,
    data: result,
    updatesContext: true,
    newContextServerId: target
  };
}

async function stopCommand(command: ParsedCommand, context: ExecutionContext): Promise<CommandResult> {
  const target = await assertTarget(command, context, { allowContext: true });
  const result = await context.supervisor.stop({ pakId: target, forceKill: command.options.force });
  return {
    success: true,
    message: result.killed ? `Force killed ${target}` : `Stopped ${target}`,
    data: result
  };
}

async function logsCommand(command: ParsedCommand, context: ExecutionContext): Promise<CommandResult> {
  const target = await assertTarget(command, context, { allowContext: true });
  const tail = command.options.tail && command.options.tail > 0 ? command.options.tail : 200;
  const lines = await context.supervisor.logs({ pakId: target, tail });
  return {
    success: true,
    stream: lines,
    data: { target, lines }
  };
}

async function backupCommand(command: ParsedCommand, context: ExecutionContext): Promise<CommandResult> {
  const target = await assertTarget(command, context, { allowContext: true });
  const result = await context.supervisor.backup({ pakId: target, name: command.options.to });
  return {
    success: true,
    message: `Backup created for ${target}: ${path.basename(result.file)} (${humanFileSize(result.size)})`,
    data: result
  };
}

async function upCommand(command: ParsedCommand, context: ExecutionContext): Promise<UpActionResult> {
  let name = command.target;
  if (!name) {
    throw new Error('Server name is required');
  }
  name = sanitizeName(name);
  let meta: PakMetadata | null = null;
  try {
    meta = await context.pakManager.readMetadata(name);
  } catch {
    meta = null;
  }

  const type = command.options.type ? command.options.type.toLowerCase() : DEFAULT_TYPE;
  const version = command.options.version || DEFAULT_VERSION;
  const memory = command.options.memory || DEFAULT_MEMORY;

  if (meta) {
    const result = await context.supervisor.start({ pakId: name, type, version, memory });
    await context.state.update({ lastServer: name });
    return {
      success: true,
      message: `Started existing server ${name}`,
      data: { ...result, created: false },
      updatesContext: true,
      newContextServerId: name
    };
  }

  const created = await context.pakManager.create({ id: name, type, version, name });
  const result = await context.supervisor.start({ pakId: name, type, version, memory });
  await context.state.update({ lastServer: name });
  return {
    success: true,
    message: `Created and started ${name}`,
    data: { ...result, created: true, metadata: created },
    updatesContext: true,
    newContextServerId: name
  };
}

async function deleteCommand(command: ParsedCommand, context: ExecutionContext): Promise<CommandResult> {
  if (!command.options.force && !process.stdout.isTTY) {
    throw new Error('Refusing to delete without --force in non-interactive mode');
  }
  const target = await assertTarget(command, context, { allowContext: true });
  const meta = await context.pakManager.readMetadata(target);
  const backups = await context.supervisor.listBackups({ pakId: target });
  const dataPath = path.join(context.dataDir, 'paks', target);
  await context.supervisor.stop({ pakId: target }).catch(() => null);
  await context.pakManager.remove({ id: target });
  await fs.rm(dataPath, { recursive: true, force: true });
  await context.state.update({ lastServer: undefined });
  return {
    success: true,
    message: `Deleted ${target} (${meta.engine.serverType} ${meta.engine.version}) and removed ${backups.length} backups`,
    data: { meta, backups }
  };
}

async function quickstartCommand(_command: ParsedCommand, context: ExecutionContext): Promise<CommandResult> {
  const name = `craft-${randomUUID().slice(0, 5)}`;
  const result = await upCommand(
    {
      verb: 'up',
      resource: 'server',
      target: name,
      args: [],
      options: { type: DEFAULT_TYPE, version: DEFAULT_VERSION, memory: DEFAULT_MEMORY },
      rawTokens: [],
      rawFlags: {},
      format: 'table'
    },
    context
  );
  return {
    success: true,
    message: `Quickstarted server ${name}. Connect via minecraft://localhost:25565`,
    data: result.data,
    updatesContext: true,
    newContextServerId: name
  };
}

async function upgradeCommand(command: ParsedCommand, context: ExecutionContext): Promise<CommandResult> {
  const target = await assertTarget(command, context, { allowContext: true });
  const meta = await context.pakManager.readMetadata(target);
  const currentVersion = meta.engine.version;
  const nextVersion = command.options.to || command.options.version || DEFAULT_VERSION;

  if (nextVersion === currentVersion) {
    return {
      success: true,
      message: `${target} already on ${currentVersion}`
    };
  }

  const backup = await context.supervisor.backup({ pakId: target });
  try {
    meta.engine.version = nextVersion;
    await writeMetadata(context.pakManager, target, meta);
    await context.supervisor.stop({ pakId: target }).catch(() => null);
    const startResult = await context.supervisor.start({ pakId: target, version: nextVersion });
    return {
      success: true,
      message: `Upgraded ${target} to ${nextVersion}. Backup saved as ${path.basename(backup.file)}`,
      data: { backup, startResult }
    };
  } catch (error) {
    await writeMetadata(context.pakManager, target, { ...meta, engine: { ...meta.engine, version: currentVersion } });
    await context.supervisor.restore({ pakId: target, file: backup.file, keepCurrent: false });
    throw new Error(`Upgrade failed: ${(error as Error).message}. Rolled back to ${currentVersion}`);
  }
}

async function migrateCommand(command: ParsedCommand, context: ExecutionContext): Promise<CommandResult> {
  const target = await assertTarget(command, context, { allowContext: true });
  const from = (command.options.from || DEFAULT_TYPE).toLowerCase();
  const to = (command.options.to || command.options.type || DEFAULT_TYPE).toLowerCase();
  if (!KNOWN_TYPES.has(to)) {
    throw new Error(`Unsupported target type: ${to}`);
  }
  const meta = await context.pakManager.readMetadata(target);
  if (meta.engine.serverType.toLowerCase() !== from) {
    throw new Error(`Server currently ${meta.engine.serverType}. Use --from to confirm migration source.`);
  }
  const backup = await context.supervisor.backup({ pakId: target });
  meta.engine.serverType = to;
  await writeMetadata(context.pakManager, target, meta);
  await context.supervisor.stop({ pakId: target }).catch(() => null);
  const result = await context.supervisor.start({ pakId: target, type: to });
  return {
    success: true,
    message: `Migrated ${target} from ${from} to ${to}. Backup: ${path.basename(backup.file)}`,
    data: { backup, result }
  };
}

async function cloneCommand(command: ParsedCommand, context: ExecutionContext): Promise<CommandResult> {
  const source = await assertTarget(command, context, { allowContext: true });
  const destination = sanitizeName(command.args[0] || command.options.to || command.options.version || '');
  if (!destination) throw new Error('Clone target name is required (e.g. craftsman clone alpha beta)');
  if (source === destination) throw new Error('Source and destination must differ');
  let destMeta: PakMetadata | null = null;
  try {
    destMeta = await context.pakManager.readMetadata(destination);
  } catch {
    destMeta = null;
  }
  if (destMeta) throw new Error(`Server ${destination} already exists`);

  const sourceDir = path.join(context.dataDir, 'paks', source);
  const destDir = path.join(context.dataDir, 'paks', destination);
  await fs.mkdir(path.dirname(destDir), { recursive: true });
  await fs.cp(sourceDir, destDir, { recursive: true });
  const meta = await context.pakManager.readMetadata(source);
  const cloned: PakMetadata = {
    ...meta,
    id: destination,
    name: destination,
    createdAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(destDir, 'pak.json'), JSON.stringify(cloned, null, 2));
  return {
    success: true,
    message: `Cloned ${source} → ${destination}. Adjust ports before starting if needed.`,
    data: { source: meta, clone: cloned }
  };
}

async function prepareTargetPrompt(command: ParsedCommand, context: ExecutionContext): Promise<PromptSequence | null> {
  if (command.target) return null;
  const servers = await context.pakManager.list();
  if (servers.length === 0) return null;
  const prompts: PromptPlan[] = [
    {
      id: 'target',
      type: 'select',
      message: 'Select server',
      choices: servers.map((s) => ({ label: `${s.id} (${s.engine.serverType} ${s.engine.version})`, value: s.id }))
    }
  ];
  return {
    prompts,
    apply: (answers) => ({ ...command, target: answers.target })
  };
}

async function prepareUpPrompts(command: ParsedCommand, context: ExecutionContext): Promise<PromptSequence | null> {
  if (command.target) return null;
  const prompts: PromptPlan[] = [
    {
      id: 'name',
      type: 'text',
      message: 'Server name',
      validate: (value) => (value ? true : 'Name is required')
    },
    {
      id: 'type',
      type: 'select',
      message: 'Type',
      choices: Array.from(KNOWN_TYPES).map((t) => ({ label: t, value: t })),
      defaultValue: DEFAULT_TYPE
    },
    {
      id: 'version',
      type: 'text',
      message: `Version (current latest ${DEFAULT_VERSION})`,
      defaultValue: DEFAULT_VERSION
    },
    {
      id: 'memory',
      type: 'text',
      message: 'Memory allocation',
      defaultValue: DEFAULT_MEMORY
    }
  ];
  return {
    prompts,
    apply: (answers) => ({
      ...command,
      target: answers.name,
      options: {
        ...command.options,
        type: answers.type,
        version: answers.version,
        memory: answers.memory
      }
    })
  };
}

async function prepareDeletePrompts(command: ParsedCommand, context: ExecutionContext): Promise<PromptSequence | null> {
  const targetPrompt = await prepareTargetPrompt(command, context);
  const prompts: PromptPlan[] = targetPrompt ? [...targetPrompt.prompts] : [];
  prompts.push({
    id: 'confirm',
    type: 'confirm',
    message: 'Are you sure?'
  });
  return {
    prompts,
    apply: (answers) => {
      if (answers.confirm !== 'yes') {
        throw new Error('Operation cancelled');
      }
      const updated = targetPrompt ? targetPrompt.apply(answers) : command;
      return { ...updated, options: { ...updated.options, force: true } };
    }
  };
}

async function prepareUpgradePrompts(command: ParsedCommand, context: ExecutionContext): Promise<PromptSequence | null> {
  const targetPrompt = await prepareTargetPrompt(command, context);
  const prompts: PromptPlan[] = targetPrompt ? [...targetPrompt.prompts] : [];
  prompts.push({
    id: 'version',
    type: 'text',
    message: 'Upgrade to version',
    defaultValue: DEFAULT_VERSION
  });
  return {
    prompts,
    apply: (answers) => {
      const updated = targetPrompt ? targetPrompt.apply(answers) : command;
      return { ...updated, options: { ...updated.options, version: answers.version, to: answers.version } };
    }
  };
}

async function prepareMigratePrompts(command: ParsedCommand, context: ExecutionContext): Promise<PromptSequence | null> {
  const targetPrompt = await prepareTargetPrompt(command, context);
  const prompts: PromptPlan[] = targetPrompt ? [...targetPrompt.prompts] : [];
  prompts.push({
    id: 'to',
    type: 'select',
    message: 'Target type',
    choices: Array.from(KNOWN_TYPES).map((t) => ({ label: t, value: t })),
    defaultValue: DEFAULT_TYPE
  });
  return {
    prompts,
    apply: (answers) => {
      const updated = targetPrompt ? targetPrompt.apply(answers) : command;
      return { ...updated, options: { ...updated.options, to: answers.to } };
    }
  };
}

async function prepareClonePrompts(command: ParsedCommand, context: ExecutionContext): Promise<PromptSequence | null> {
  const targetPrompt = await prepareTargetPrompt(command, context);
  const prompts: PromptPlan[] = targetPrompt ? [...targetPrompt.prompts] : [];
  prompts.push({
    id: 'name',
    type: 'text',
    message: 'Clone as',
    validate: (value) => (value ? true : 'Destination name required')
  });
  return {
    prompts,
    apply: (answers) => {
      const updated = targetPrompt ? targetPrompt.apply(answers) : command;
      return { ...updated, args: [answers.name] };
    }
  };
}

async function safeReadMeta(pakManager: PakManager, id: string): Promise<PakMetadata | null> {
  try {
    return await pakManager.readMetadata(id);
  } catch {
    return null;
  }
}

async function writeMetadata(pakManager: PakManager, id: string, meta: PakMetadata): Promise<void> {
  await pakManager.writeMetadata(id, meta);
}

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

export async function summarizeServer(context: ExecutionContext, id: string): Promise<ServerSummary> {
  const meta = await context.pakManager.readMetadata(id);
  const status = await context.supervisor.status({ pakId: id });
  return { meta, status };
}
