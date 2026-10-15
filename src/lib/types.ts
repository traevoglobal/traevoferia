export interface PhotoRef {
  path: string;
  kind?: string;
}

export interface AudioRef {
  path: string;
  secs: number;
}

/** Datos de la ficha que no tienen columna propia (jsonb `extra`). */
export interface SupplierExtra {
  audios?: AudioRef[];
  /** "Otra oportunidad": descripción en una línea (si existe, la ficha no es de un proyecto). */
  otra?: string;
  /** Campos clave del proyecto, por su nombre ("MOQ": "500"). */
  campos?: Record<string, string>;
  /** Preguntas del proyecto marcadas, por id. */
  preguntas?: Record<string, boolean>;
  [key: string]: unknown;
}

/** Columnas de texto de la tabla suppliers (el stand va en `booth`). */
export const TEXT_FIELDS = [
  'company', 'company_zh', 'contact', 'role', 'wechat', 'phone', 'email', 'web', 'booth', 'city', 'kind',
  'products', 'price', 'moq', 'incoterm', 'lead_time', 'samples', 'agreement', 'next_step',
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export type Supplier = Record<TextField, string> & {
  id: string;
  project_ids: string[];
  tags: string[];
  rating: number;
  photos: PhotoRef[];
  event: string;
  note: string;
  extra: SupplierExtra;
  deleted: boolean;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type LocalSupplier = Supplier & { _dirty: 0 | 1 };

export interface LocalPhoto {
  path: string;
  supplier_id: string;
  blob: Blob;
  thumb?: Blob;
  uploaded: 0 | 1;
}

export interface Profile {
  id: string;
  name: string;
  color: string;
}

/** Fila de contenido privado (Supabase feria_content → Dexie): proyectos, comun, itinerario, tarjeta. */
export interface ContentRow {
  key: string;
  data: unknown;
  updated_at: string;
}

/** Imagen del contenido privado (bucket photos, content/img/…) guardada en el móvil. */
export interface Asset {
  path: string;
  blob: Blob;
  stamp: string;
}

/* ---------- Contenido privado (private/data/*.js) ---------- */
export type Linea = 'access' | 'sourcing';

export interface Slide {
  titulo_es: string;
  titulo_zh: string;
  bullets_es: string[];
  bullets_zh: string[];
  imagen?: string;
}

export interface Pregunta {
  id: string;
  es: string;
  zh: string;
}

export interface Proyecto {
  id: string;
  linea: Linea;
  nombre_es: string;
  nombre_zh: string;
  resumen_es: string;
  resumen_zh: string;
  slides: Slide[];
  preguntas: Pregunta[];
  campos_clave: string[];
}

export interface Comun {
  lineas: Partial<Record<Linea, { desc_es: string; desc_zh: string }>>;
  slides: Slide[];
}

export interface Bloque {
  id: string;
  dia: string;
  inicio: string;
  fin?: string;
  /** "javi", "rafa" o "" (los dos). */
  quien?: string;
  lugar: string;
  proyecto?: string;
  objetivo: string;
  vigilar?: string[];
}

export interface Persona {
  quien: string;
  nombre: string;
  wechat_id: string;
  wechat_qr?: string;
  alipay_qr?: string;
}

export interface Tarjeta {
  empresa_en: string;
  empresa_zh: string;
  personas: Persona[];
}
