# Craftsman

Craftsman is a minimal, robust Minecraft server manager with a clean REST API and a battle‑tested Docker provider (based on itzg/minecraft-server).

## Quick Start (Docker)

Prereqs: Docker available on PATH

1) Start API

   node src/index.js

2) Start a Paper server

   curl -X POST http://localhost:3100/api/server/start \
     -H 'Content-Type: application/json' \
     -d '{"type":"paper","version":"1.21.8","memory":"8G","eula":true}'

3) Status / Logs / Stop

   curl http://localhost:3100/api/server/status
   curl http://localhost:3100/api/server/logs?tail=200
   curl -X POST http://localhost:3100/api/server/stop -H 'Content-Type: application/json' -d '{}'
   # force
   curl -X POST http://localhost:3100/api/server/stop -H 'Content-Type: application/json' -d '{"forceKill":true}'

## API

- GET  /health
- GET  /api/server/status
- POST /api/server/start   { type, version, memory?, eula?, onlineMode?, motd?, rconEnabled?, rconPassword? }
- POST /api/server/stop    { forceKill? }
- GET  /api/server/logs?tail=200

## Data

- data/ → mapped to container /data
- data/runtime.json → container id, ports, rcon
- data/server.pid → optional for local provider

## CLI (no API required)

Run via npm script or directly with node.

Start/Status/Logs/Stop:

  # Start Paper 1.21.8 with 8G (Docker provider)
  npm run cli -- start --type paper --version 1.21.8 --memory 8G

  # Status (JSON output)
  npm run cli -- status --json

  # Logs (last 200)
  npm run cli -- logs --tail 200

  # Follow logs (Docker provider only)
  npm run cli -- logs --tail 200 --follow

  # Stop (graceful → force)
  npm run cli -- stop
  npm run cli -- stop --force

Use local provider for development:

  npm run cli -- status --provider local
  npm run cli -- start --provider local --type paper --version 1.21.8
