import type { ExecutionContext, ParsedCommand } from '../types.js';

interface TargetOptions {
  allowContext?: boolean;
}

export async function assertTarget(command: ParsedCommand, context: ExecutionContext, options: TargetOptions = {}): Promise<string> {
  if (command.target) return command.target;
  if (options.allowContext) {
    const resolved = await resolveContextTarget(context);
    if (resolved) return resolved;
  }
  throw new Error('Server target is required');
}

export async function resolveContextTarget(context: ExecutionContext): Promise<string | undefined> {
  const state = await context.state.read();
  if (state.lastServer) return state.lastServer;
  const statuses = await context.supervisor.statuses();
  const running = statuses.filter((status) => status.running);
  if (running.length === 1) return running[0].id;
  return undefined;
}
