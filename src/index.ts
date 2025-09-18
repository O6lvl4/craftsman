import { createServer } from './server/app.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3100;

async function main(): Promise<void> {
  const app = await createServer();
  app.listen(PORT, () => {
    console.log(`[craftsman] API listening on http://localhost:${PORT}`);
  });
}

void main();
