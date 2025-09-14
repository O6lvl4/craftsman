import { ModrinthStore } from './stores/Modrinth.js';
import { HangarStore } from './stores/Hangar.js';
import { CurseForgeStore } from './stores/CurseForge.js';

export class ExtensionStore {
  constructor() {
    this.stores = {
      modrinth: new ModrinthStore(),
      hangar: new HangarStore(),
      curseforge: new CurseForgeStore({})
    };
  }
  require(store) {
    const s = this.stores[store];
    if (!s) throw new Error(`Unsupported store: ${store}`);
    return s;
  }
}
