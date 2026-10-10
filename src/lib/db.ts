import Dexie, { type Table } from 'dexie';
import type { Draft, LocalNote, LocalPhoto, LocalSupplier, Profile } from './types';

class FeriaDB extends Dexie {
  suppliers!: Table<LocalSupplier, string>;
  photos!: Table<LocalPhoto, string>;
  notes!: Table<LocalNote, string>;
  profiles!: Table<Profile, string>;
  signed!: Table<{ path: string; url: string; exp: number }, string>;
  drafts!: Table<Draft, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('traevo-feria');
    this.version(1).stores({
      suppliers: 'id, _dirty, created_at',
      photos: 'path, supplier_id',
      notes: 'project_slug, _dirty',
      profiles: 'id',
      signed: 'path',
      drafts: 'id',
      meta: 'key',
    });
  }
}

export const db = new FeriaDB();

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const r = await db.meta.get(key);
  return (r?.value as T) ?? fallback;
}

export function setMeta(key: string, value: unknown) {
  return db.meta.put({ key, value });
}
