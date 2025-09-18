#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCommand } from './parser.js';
import { getCommandDefinition } from './core/executors.js';
import { FileStateStore } from './core/contextStore.js';
import { App } from './App.js';
import { formatResult } from './output.js';
import type { CommandResult, ExecutionContext, ParsedCommand } from './types.js';
import { PakManager } from '../pak/PakManager.js';
import { Supervisor } from '../supervisor/Supervisor.js';
import { DockerProvider } from '../supervisor/providers/DockerProvider.js';
import { LocalProvider } from '../supervisor/providers/LocalProvider.js';
import type { Provider } from '../supervisor/providers/Provider.js';

(async () => {
  try {
    const argv = process.argv.slice(2);
    const command = parseCommand(argv);
    const definition = getCommandDefinition(command.verb);
    if (!definition) {
      throw new Error(`Unknown command: ${command.verb}`);
    }

    const context = await createExecutionContext(command);

    if (!process.stdout.isTTY || ['json', 'yaml', 'csv', 'quiet', 'plain'].includes(command.format)) {
      const result = await definition.run(command, context);
      const output = formatResult(result, command);
      if (output) {
        process.stdout.write(output + '\n');
      }
      if (result.message && command.format !== 'table') {
        process.stderr.write(result.message + '\n');
      }
      process.exit(result.success ? 0 : 1);
    }

    render(<App initialCommand={command} definition={definition} context={context} />);
  } catch (error) {
    process.stderr.write(`[craftsman] Error: ${(error as Error).message}\n`);
    process.exit(1);
  }
})();

async function createExecutionContext(command: ParsedCommand): Promise<ExecutionContext> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const ROOT = path.join(__dirname, '..', '..');
  const dataDir = process.env.CRAFTSMAN_DATA_DIR || path.join(ROOT, 'data');
  await ensureDir(dataDir);

  const providerName = (command.options.provider || process.env.CRAFTSMAN_PROVIDER || process.env.PROVIDER || 'docker').toLowerCase();
  const provider: Provider = providerName === 'local'
    ? new LocalProvider({ dataDir })
    : new DockerProvider({ dataDir });

  const pakManager = new PakManager({ dataDir });
  const supervisor = new Supervisor({ provider, dataDir });
  const state = new FileStateStore({ dataDir });

  return {
    pakManager,
    supervisor,
    dataDir,
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    isTTY: process.stdout.isTTY ?? false,
    state
  };
}

async function ensureDir(dir: string): Promise<void> {
  await fsPromises.mkdir(dir, { recursive: true });
}

import { promises as fsPromises } from 'fs';
