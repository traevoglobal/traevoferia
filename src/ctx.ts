import { createContext, useContext } from 'react';
import type { Profile } from './lib/types';
import type { Route } from './lib/nav';

export type { Route };

export interface AppCtx {
  myId: string;
  me?: Profile;
  profiles: Map<string, Profile>;
  push: (r: Route) => void;
  back: () => void;
  openCapture: () => void;
  /** Captura precargada con la etiqueta de una franja del Horario. */
  openCaptureTag: (tag: string) => void;
  openPresent: (slug: string) => void;
  openViewer: (paths: string[], index: number) => void;
  openProfile: () => void;
}

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);
