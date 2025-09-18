import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ServerRoutes } from './routes/ServerRoutes.js';
import { Supervisor } from '../supervisor/Supervisor.js';
import { DockerProvider } from '../supervisor/providers/DockerProvider.js';
import { LocalProvider } from '../supervisor/providers/LocalProvider.js';
import type { Provider } from '../supervisor/providers/Provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');

export async function createServer(): Promise<Express> {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const providerName = (process.env.PROVIDER || 'docker').toLowerCase();
  const provider: Provider =
    providerName === 'local'
      ? new LocalProvider({ dataDir: DATA_DIR })
      : new DockerProvider({ dataDir: DATA_DIR });

  const supervisor = new Supervisor({ provider, dataDir: DATA_DIR });

  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  const routes = new ServerRoutes({ supervisor });
  app.use('/api/server', routes.router);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[craftsman] unhandled error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  });

  return app;
}
