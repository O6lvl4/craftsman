import express from 'express';

export class ServerRoutes {
  constructor({ supervisor }) {
    this.supervisor = supervisor;
    this.router = express.Router();
    this.register();
  }

  register() {
    this.router.get('/status', async (req, res, next) => {
      try {
        const status = await this.supervisor.status();
        res.json({ success: true, data: status });
      } catch (e) { next(e); }
    });

    this.router.post('/start', async (req, res, next) => {
      try {
        const { type = 'paper', version = '1.21.8', memory = '4G', eula = true, onlineMode = true, motd, rconEnabled = true, rconPassword } = req.body || {};
        const result = await this.supervisor.start({ type, version, memory, eula, onlineMode, motd, rconEnabled, rconPassword });
        res.json({ success: true, data: result });
      } catch (e) {
        if (e.code === 'ALREADY_RUNNING') return res.status(409).json({ success: false, error: e.message });
        next(e);
      }
    });

    this.router.post('/stop', async (req, res, next) => {
      try {
        const { forceKill = false } = req.body || {};
        const result = await this.supervisor.stop({ forceKill });
        res.json({ success: true, data: result });
      } catch (e) { next(e); }
    });

    this.router.get('/logs', async (req, res, next) => {
      try {
        const tail = Math.min(Math.max(parseInt(req.query.tail || '200', 10) || 200, 50), 2000);
        const logs = await this.supervisor.logs({ tail });
        res.json({ success: true, data: { lines: logs } });
      } catch (e) { next(e); }
    });
  }
}

