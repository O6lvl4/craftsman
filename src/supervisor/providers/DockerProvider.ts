import { promisify } from 'util';
import { exec as execCb } from 'child_process';
import { randomBytes } from 'crypto';
import path from 'path';
import {
  BaseProvider,
  type ProviderLogsOptions,
  type ProviderLogsResult,
  type ProviderRconResult,
  type ProviderStartOptions,
  type ProviderStartResult,
  type ProviderStatus,
  type ProviderStopOptions,
  type ProviderStopResult
} from './Provider.js';

const exec = promisify(execCb);

export class DockerProvider extends BaseProvider {
  private readonly dataDir: string;

  constructor({ dataDir }: { dataDir: string }) {
    super();
    this.dataDir = dataDir;
  }

  async status(name: string): Promise<ProviderStatus> {
    try {
      const { stdout } = await exec(`docker inspect ${name} --format '{{.State.Running}} {{.Config.Env}} {{.Config.Image}} {{.State.StartedAt}}'`);
      const [runningStr, ...rest] = stdout.trim().split(' ');
      const running = runningStr === 'true';
      const startedAt = rest.slice(-1)[0];
      const envJoined = rest.slice(0, -1).join(' ');
      const type = /TYPE=(\w+)/.exec(envJoined)?.[1]?.toLowerCase();
      const version = /VERSION=([\w\.\-]+)/.exec(envJoined)?.[1];
      const level = /LEVEL=([^\s]+)/.exec(envJoined)?.[1];

      let ports: Record<string, number> = { server: 25565 };
      try {
        const { stdout: pjson } = await exec(`docker inspect ${name}`);
        const arr = JSON.parse(pjson)[0];
        const portMap = arr?.NetworkSettings?.Ports || {};
        const portKey = Object.keys(portMap).find((k) => k.startsWith('25565/'));
        const hostPort = portKey ? portMap[portKey]?.[0]?.HostPort : undefined;
        if (hostPort) ports = { server: Number(hostPort) };
      } catch {
        // ignore
      }
      return { running, type, version, ports, startedAt, level };
    } catch {
      return { running: false };
    }
  }

  async start(options: ProviderStartOptions): Promise<ProviderStartResult> {
    const {
      containerName,
      type,
      version,
      memory = '4G',
      eula,
      onlineMode,
      motd,
      rconEnabled,
      rconPassword,
      level,
      mountDataDir
    } = options;

    await exec('docker pull itzg/minecraft-server:latest');

    const env: string[] = [
      `-e EULA=${eula ? 'TRUE' : 'FALSE'}`,
      `-e TYPE=${type.toUpperCase()}`,
      `-e VERSION=${version}`,
      `-e MEMORY=${memory}`,
      `-e ONLINE_MODE=${onlineMode ? 'TRUE' : 'FALSE'}`,
      `-e ENABLE_RCON=${rconEnabled ? 'TRUE' : 'FALSE'}`
    ];

    if (level) env.push(`-e LEVEL=${level}`);

    let rcon: ProviderStartResult['rcon'] = null;
    let rconPortArgs = '';
    if (rconEnabled) {
      const pass = rconPassword || randomBytes(12).toString('hex');
      env.push(`-e RCON_PASSWORD=${pass}`);
      rconPortArgs = '-p 25575:25575';
      rcon = { port: 25575, password: pass };
    }

    if (motd) env.push(`-e MOTD=${JSON.stringify(motd)}`);

    const dataAbs = path.resolve(mountDataDir || this.dataDir);
    const runCmd = [
      'docker run -d',
      `--name ${containerName}`,
      '-p 25565:25565',
      rconPortArgs,
      `-v ${dataAbs}:/data`,
      env.join(' '),
      'itzg/minecraft-server:latest'
    ]
      .filter(Boolean)
      .join(' ');

    const { stdout } = await exec(runCmd);
    const containerId = stdout.trim();
    return { containerId, ports: { server: 25565 }, rcon, startedAt: new Date().toISOString() };
  }

  async stop(name: string, options: ProviderStopOptions = {}): Promise<ProviderStopResult> {
    const { forceKill = false } = options;
    try {
      if (forceKill) {
        await exec(`docker kill ${name}`);
        await exec(`docker rm -f ${name}`);
        return { killed: true };
      }
      await exec(`docker stop -t 10 ${name}`);
      await exec(`docker rm ${name}`);
      return { stopped: true };
    } catch (error) {
      try {
        await exec(`docker rm -f ${name}`);
        return { killed: true };
      } catch (err: unknown) {
        return { killed: false, error: err instanceof Error ? err.message : 'Failed to stop container' };
      }
    }
  }

  async logs(name: string, options: ProviderLogsOptions = {}): Promise<ProviderLogsResult> {
    const { tail = 200 } = options;
    try {
      const { stdout } = await exec(`docker logs --tail=${tail} ${name}`);
      return stdout.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  async rcon(name: string, command: string): Promise<ProviderRconResult> {
    try {
      await exec(`docker exec ${name} rcon-cli ${command}`);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
