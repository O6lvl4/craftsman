import express, { type NextFunction, type Request, type Response } from 'express';
import type { Supervisor } from '../../supervisor/Supervisor.js';

interface ServerRoutesOptions {
  supervisor: Supervisor;
}

export class ServerRoutes {
  readonly router = express.Router();

  private readonly supervisor: Supervisor;

  constructor({ supervisor }: ServerRoutesOptions) {
    this.supervisor = supervisor;
    this.register();
  }

  private register(): void {
    this.router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const status = await this.supervisor.statuses();
        res.json({ success: true, data: status });
      } catch (error) {
        next(error);
      }
    });

    this.router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { pakId, slot, type, version, memory, eula, onlineMode, motd, rconEnabled, rconPassword } = req.body || {};
        if (!pakId) {
          return res.status(400).json({ success: false, error: 'pakId is required' });
        }
        const result = await this.supervisor.start({
          pakId,
          slot,
          type,
          version,
          memory,
          eula,
          onlineMode,
          motd,
          rconEnabled,
          rconPassword
        });
        res.json({ success: true, data: result });
      } catch (error) {
        if ((error as Error & { code?: string }).code === 'ALREADY_RUNNING') {
          return res.status(409).json({ success: false, error: (error as Error).message });
        }
        next(error);
      }
    });

    this.router.post('/stop', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { pakId, forceKill = false } = req.body || {};
        if (!pakId) {
          return res.status(400).json({ success: false, error: 'pakId is required' });
        }
        const result = await this.supervisor.stop({ pakId, forceKill });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    });

    this.router.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const pakId = String(req.query.pakId || '');
        if (!pakId) {
          return res.status(400).json({ success: false, error: 'pakId is required' });
        }
        const tail = Math.min(Math.max(parseInt(String(req.query.tail ?? '200'), 10) || 200, 50), 2000);
        const logs = await this.supervisor.logs({ pakId, tail });
        res.json({ success: true, data: { lines: logs } });
      } catch (error) {
        next(error);
      }
    });
  }
}
