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
  /** Ficha nueva (opcionalmente con un proyecto) o existente si se pasa `id`. */
  openFicha: (opts?: { id?: string; proyecto?: string }) => void;
  openPresent: (id: string) => void;
  openViewer: (paths: string[], index: number) => void;
  openProfile: () => void;
}

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);
