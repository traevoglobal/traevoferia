export interface PhotoRef {
  path: string;
}

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

export interface ProjectNote {
  project_slug: string;
  target: string;
  competition: string;
  conclusions: string;
  updated_by: string;
  updated_at: string;
}
export type LocalNote = ProjectNote & { _dirty: 0 | 1 };

export interface Profile {
  id: string;
  name: string;
  color: string;
}

export interface DraftPhoto {
  id: string;
  blob: Blob;
  thumb: Blob;
}

export interface Draft {
  id: 'current';
  photos: DraftPhoto[];
  note: string;
  project_ids: string[];
  event: string;
}

export interface ProjectText {
  title: string;
  summary: string;
  needs: string[];
  requirements: string[];
  questions: string[];
}

export interface Project {
  slug: string;
  group: 'traevo' | 'clientes';
  name: string;
  client: string;
  color: string;
  order: number;
  es: ProjectText;
  zh: ProjectText;
  photos: string[];
}

export interface TeamMember {
  slug: string;
  name: string;
  wechat: string;
  wechatQr: string;
  whatsapp: string;
  email: string;
}
