import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ServerRoutes } from '../server/routes/ServerRoutes.js';
import { Supervisor } from '../supervisor/Supervisor.js';
import { DockerProvider } from '../supervisor/providers/DockerProvider.js';
import { LocalProvider } from '../supervisor/providers/LocalProvider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');

export async function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const providerName = (process.env.PROVIDER || 'docker').toLowerCase();
  const provider = providerName === 'local'
    ? new LocalProvider({ dataDir: DATA_DIR })
    : new DockerProvider({ dataDir: DATA_DIR });

  const supervisor = new Supervisor({ provider, dataDir: DATA_DIR });

  // Health
  app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Routes
  const routes = new ServerRoutes({ supervisor });
  app.use('/api/server', routes.router);

  // Error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[craftsman] unhandled error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  });

  return app;
}

