export class Events {
  constructor() { this.m = new Map(); }
  on(n, f) { if (!this.m.has(n)) this.m.set(n, new Set()); this.m.get(n).add(f); return () => this.m.get(n).delete(f); }
  emit(n, ...a) { const s = this.m.get(n); if (s) for (const f of [...s]) f(...a); }
}
export const bus = new Events();
