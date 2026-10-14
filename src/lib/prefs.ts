/* Preferencias de este móvil, compartidas entre pantallas. */
import { storedValue } from './util';

/** Pabellón en el que estoy ("Estoy en: …"). Toda ficha nueva lo hereda. */
export const HALL = storedValue<string>('feria.hall', '');
/** Última vía usada: se preselecciona en Captar. */
export const LAST_VIA = storedValue<string>('feria.lastVia', '');
/** Último sector usado por vía. */
export const LAST_SECTOR = storedValue<Record<string, string>>('feria.lastSector', {});
/** Proyectos de la última ficha (se preseleccionan) y orden por uso reciente. */
export const LAST_PROJECTS = storedValue<string[]>('feria.lastProjects', []);
export const RECENT_PROJECTS = storedValue<string[]>('feria.recentProjects', []);
/** Tema elegido a mano; '' sigue al sistema. */
export const THEME = storedValue<'' | 'light' | 'dark'>('feria.theme', '');
/** Última exportación de respaldo (ms). */
export const LAST_EXPORT = storedValue<number>('feria.lastExport', 0);

export function applyTheme(t = THEME.get()) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

/** Recuerda proyectos usados: los de esta ficha primero. */
export function rememberProjects(ids: string[]) {
  LAST_PROJECTS.set(ids);
  RECENT_PROJECTS.set([...new Set([...ids, ...RECENT_PROJECTS.get()])].slice(0, 30));
}
