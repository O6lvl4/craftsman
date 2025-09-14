// Base Provider (interface-like)
export class Provider {
  async status(name) { throw new Error('Not implemented'); }
  async start(opts) { throw new Error('Not implemented'); }
  async stop(name, { forceKill } = {}) { throw new Error('Not implemented'); }
  async logs(name, { tail } = {}) { throw new Error('Not implemented'); }
}

