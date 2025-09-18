import type { PakMetadata } from '../pak/PakManager.js';
import type { Supervisor } from '../supervisor/Supervisor.js';
import type { PakManager } from '../pak/PakManager.js';
import type { ProviderStartResult } from '../supervisor/providers/Provider.js';

export type Verb =
  | 'help'
  | 'up'
  | 'start'
  | 'stop'
  | 'status'
  | 'list'
  | 'show'
  | 'logs'
  | 'backup'
  | 'delete'
  | 'quickstart'
  | 'upgrade'
  | 'migrate'
  | 'clone';

export type Resource = 'server' | 'backup' | 'unknown';

export type OutputFormat = 'table' | 'plain' | 'json' | 'yaml' | 'csv' | 'quiet';

export interface CommandOptions {
  type?: string;
  version?: string;
  memory?: string;
  slot?: string;
  from?: string;
  to?: string;
  force?: boolean;
  follow?: boolean;
  tail?: number;
  shortHelp?: boolean;
  provider?: string;
  json?: boolean;
  yaml?: boolean;
  csv?: boolean;
  quiet?: boolean;
  format?: OutputFormat;
}

export interface ParsedCommand {
  verb: Verb;
  resource: Resource;
  target?: string;
  args: string[];
  options: CommandOptions;
  rawTokens: string[];
  rawFlags: Record<string, string | boolean>;
  format: OutputFormat;
}

export interface ExecutionContext {
  pakManager: PakManager;
  supervisor: Supervisor;
  dataDir: string;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  isTTY: boolean;
  state: CLIStateStore;
}

export interface CLIStateStore {
  read(): Promise<CLIState>;
  write(state: CLIState): Promise<void>;
  update(partial: Partial<CLIState>): Promise<void>;
}

export interface CLIState {
  lastServer?: string;
  recentServers: string[];
}

export interface CommandResult {
  success: boolean;
  message?: string;
  table?: {
    headers: string[];
    rows: Array<(string | number | undefined)[]>;
  };
  list?: string[];
  data?: unknown;
  stream?: string[];
  meta?: Record<string, unknown>;
  updatesContext?: boolean;
  newContextServerId?: string;
}

export interface CommandDefinition {
  verb: Verb;
  run: (command: ParsedCommand, context: ExecutionContext) => Promise<CommandResult>;
  requiresTarget?: boolean;
  allowContextResolution?: boolean;
  preparePrompts?: (command: ParsedCommand, context: ExecutionContext) => Promise<PromptSequence | null>;
  description?: string;
}

export type PromptType = 'text' | 'select' | 'confirm';

export interface PromptPlan {
  id: string;
  type: PromptType;
  message: string;
  choices?: Array<{ label: string; value: string }>;
  defaultValue?: string;
  validate?: (value: string) => string | true;
}

export interface PromptSequence {
  prompts: PromptPlan[];
  apply: (answers: Record<string, string>) => ParsedCommand;
}

export interface UpActionResult extends CommandResult {
  data?: ProviderStartResult & { created?: boolean; metadata?: unknown };
}

export interface ServerSummary {
  meta: PakMetadata;
  status: Awaited<ReturnType<Supervisor['status']>>;
}
