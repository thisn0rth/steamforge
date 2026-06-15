import fs from 'node:fs';
import path from 'node:path';

/**
 * A tiny synchronous JSON-file collection store. Each collection is a single
 * `<name>.json` file holding an array of records keyed by `id`. Writes are
 * atomic (write temp + rename) to avoid corruption on crash.
 */
export class JsonCollection<T extends { id: string }> {
  private readonly file: string;
  private items: T[] = [];

  constructor(dir: string, name: string) {
    this.file = path.join(dir, `${name}.json`);
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.items = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.items = [];
    }
  }

  private persist(): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.items, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  all(): T[] {
    return [...this.items];
  }

  get(id: string): T | undefined {
    return this.items.find((i) => i.id === id);
  }

  upsert(item: T): T {
    const idx = this.items.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      this.items[idx] = item;
    } else {
      this.items.push(item);
    }
    this.persist();
    return item;
  }

  remove(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    const changed = this.items.length !== before;
    if (changed) this.persist();
    return changed;
  }

  replaceAll(items: T[]): void {
    this.items = items;
    this.persist();
  }
}
