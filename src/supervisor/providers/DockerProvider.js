import { promisify } from 'util';
import { exec as execCb } from 'child_process';
import { randomBytes } from 'crypto';
import path from 'path';
import { Provider } from './Provider.js';

const exec = promisify(execCb);

export class DockerProvider extends Provider {
  constructor({ dataDir }) {
    super();
    this.dataDir = dataDir;
  }

  async status(name) {
    try {
      const { stdout } = await exec(`docker inspect ${name} --format '{{.State.Running}} {{.Config.Env}} {{.Config.Image}} {{.State.StartedAt}}'`);
      const [runningStr, ...rest] = stdout.trim().split(' ');
      const running = runningStr === 'true';
      const startedAt = rest.slice(-1)[0];
      const envJoined = rest.slice(0, -1).join(' ');
      const type = /TYPE=(\w+)/.exec(envJoined)?.[1]?.toLowerCase();
      const version = /VERSION=([\w\.\-]+)/.exec(envJoined)?.[1];
      const level = /LEVEL=([^\s]+)/.exec(envJoined)?.[1];
      // Ports: we can inspect if needed
      let ports = { server: 25565 };
      try {
        const { stdout: pjson } = await exec(`docker inspect ${name}`);
        const arr = JSON.parse(pjson)[0];
        const pmap = arr?.NetworkSettings?.Ports || {};
        const portKey = Object.keys(pmap).find(k => k.startsWith('25565/'));
        const hostPort = pmap[portKey]?.[0]?.HostPort;
        if (hostPort) ports = { server: Number(hostPort) };
      } catch {}
      return { running, type, version, ports, startedAt, level };
    } catch {
      return { running: false };
    }
  }

  async start({ containerName, type, version, memory = '4G', eula = true, onlineMode = true, motd, rconEnabled = true, rconPassword, level, mountDataDir }) {
    // Ensure image
    await exec(`docker pull itzg/minecraft-server:latest`);

    const env = [
      `-e EULA=${eula ? 'TRUE' : 'FALSE'}`,
      `-e TYPE=${type.toUpperCase()}`,
      `-e VERSION=${version}`,
      `-e MEMORY=${memory}`,
      `-e ONLINE_MODE=${onlineMode ? 'TRUE' : 'FALSE'}`,
      `-e ENABLE_RCON=${rconEnabled ? 'TRUE' : 'FALSE'}`
    ];
    if (level) env.push(`-e LEVEL=${level}`);

    let rcon = null;
    if (rconEnabled) {
      const pass = rconPassword || randomBytes(12).toString('hex');
      env.push(`-e RCON_PASSWORD=${pass}`);
      env.push(`-p 25575:25575`);
      rcon = { port: 25575, password: pass };
    }

    if (motd) env.push(`-e MOTD=${JSON.stringify(motd)}`);

    const dataAbs = path.resolve(mountDataDir || this.dataDir);
    const runCmd = [
      'docker run -d',
      `--name ${containerName}`,
      '-p 25565:25565',
      `-v ${dataAbs}:/data`,
      env.join(' '),
      'itzg/minecraft-server:latest'
    ].join(' ');

    const { stdout } = await exec(runCmd);
    const cid = stdout.trim();
    return { containerId: cid, ports: { server: 25565 }, rcon, startedAt: new Date().toISOString() };
  }

  async stop(name, { forceKill = false } = {}) {
    // Graceful stop via docker stop (itzg supports graceful close)
    try {
      if (forceKill) {
        await exec(`docker kill ${name}`);
        await exec(`docker rm -f ${name}`);
        return { killed: true };
      }
      await exec(`docker stop -t 10 ${name}`);
      await exec(`docker rm ${name}`);
      return { stopped: true };
    } catch (e) {
      // try force
      try {
        await exec(`docker rm -f ${name}`);
        return { killed: true };
      } catch (e2) {
        return { killed: false, error: e2.message };
      }
    }
  }

  async logs(name, { tail = 200 } = {}) {
    try {
      const { stdout } = await exec(`docker logs --tail=${tail} ${name}`);
      return stdout.split('\n').filter(Boolean);
    } catch { return []; }
  }
}
