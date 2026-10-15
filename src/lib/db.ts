import Dexie, { type Table } from 'dexie';
import type { Asset, ContentRow, LocalPhoto, LocalSupplier, Profile } from './types';

class FeriaDB extends Dexie {
  suppliers!: Table<LocalSupplier, string>;
  photos!: Table<LocalPhoto, string>;
  profiles!: Table<Profile, string>;
  signed!: Table<{ path: string; url: string; exp: number }, string>;
  content!: Table<ContentRow, string>;
  assets!: Table<Asset, string>;
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
    // v2: fuera los campos de IA (si no, se reenviarían a Supabase al sincronizar).
    this.version(2)
      .stores({ suppliers: 'id, _dirty, created_at' })
      .upgrade((tx) =>
        tx
          .table('suppliers')
          .toCollection()
          .modify((s: Record<string, unknown>) => {
            delete s.ai_status;
            delete s.ai_summary;
          }),
      );
    // v3: contenido privado para usarlo sin red.
    this.version(3).stores({ content: 'key' });
    // v4: `extra` siempre presente.
    this.version(4)
      .stores({ suppliers: 'id, _dirty, created_at' })
      .upgrade((tx) =>
        tx
          .table('suppliers')
          .toCollection()
          .modify((s: Record<string, unknown>) => {
            if (!s.extra || typeof s.extra !== 'object') s.extra = {};
          }),
      );
    // v5: imágenes del contenido en el móvil; fuera borradores y notas de proyecto (la ficha se autoguarda).
    this.version(5).stores({ assets: 'path', drafts: null, notes: null });
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
