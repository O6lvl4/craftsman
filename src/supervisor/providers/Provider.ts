export interface ProviderStatus {
  running: boolean;
  type?: string;
  version?: string;
  ports?: Record<string, number>;
  startedAt?: string;
  level?: string;
}

export interface ProviderStartOptions {
  containerName: string;
  type: string;
  version: string;
  memory: string;
  eula: boolean;
  onlineMode: boolean;
  motd?: string;
  rconEnabled: boolean;
  rconPassword?: string;
  level?: string;
  mountDataDir: string;
}

export interface ProviderStartResult {
  containerId?: string;
  ports?: Record<string, number>;
  rcon?: {
    port: number;
    password: string;
  } | null;
  startedAt: string;
}

export interface ProviderStopOptions {
  forceKill?: boolean;
}

export interface ProviderStopResult {
  stopped?: boolean;
  killed?: boolean;
  error?: string;
}

export interface ProviderLogsOptions {
  tail?: number;
}

export interface ProviderLogsResult extends Array<string> {}

export interface ProviderRconResult {
  ok: boolean;
  error?: string;
}

export interface Provider {
  status(name: string): Promise<ProviderStatus>;
  start(options: ProviderStartOptions): Promise<ProviderStartResult>;
  stop(name: string, options?: ProviderStopOptions): Promise<ProviderStopResult>;
  logs(name: string, options?: ProviderLogsOptions): Promise<ProviderLogsResult>;
  rcon(name: string, command: string): Promise<ProviderRconResult>;
}

export abstract class BaseProvider implements Provider {
  abstract status(name: string): Promise<ProviderStatus>;

  abstract start(options: ProviderStartOptions): Promise<ProviderStartResult>;

  abstract stop(name: string, options?: ProviderStopOptions): Promise<ProviderStopResult>;

  abstract logs(name: string, options?: ProviderLogsOptions): Promise<ProviderLogsResult>;

  abstract rcon(name: string, command: string): Promise<ProviderRconResult>;
}
