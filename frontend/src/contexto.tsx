import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { apiPorDefecto, type Api, type Estado } from "./api";
import { alCambiarToken, guardarToken, obtenerToken } from "./api/sesion";
import { aplicarPaleta } from "./theme/paleta";
import { limpiarPartidaActiva } from "./lib/partidaActiva";

const ApiCtx = createContext<Api>(apiPorDefecto);
export const useApi = () => useContext(ApiCtx);

export function ProveedorApi({ api, children }: { api?: Api; children: ReactNode }) {
  return <ApiCtx.Provider value={api ?? apiPorDefecto}>{children}</ApiCtx.Provider>;
}

export function useSesion() {
  const token = useSyncExternalStore(alCambiarToken, obtenerToken, obtenerToken);
  return {
    token,
    entrar: (t: string) => { limpiarPartidaActiva(); guardarToken(t); },
    salir: () => { limpiarPartidaActiva(); guardarToken(null); },
  };
}

interface CtxEstado {
  estado: Estado | null;
  refrescar: () => Promise<void>;
  poner: (e: Estado) => void;
}
const EstadoCtx = createContext<CtxEstado>({ estado: null, refrescar: async () => {}, poner: () => {} });
export const useEstadoJuego = () => useContext(EstadoCtx);

export function ProveedorEstado({ children }: { children: ReactNode }) {
  const api = useApi();
  const { token } = useSesion();
  const [estado, setEstado] = useState<Estado | null>(null);
  const refrescar = useCallback(async () => {
    try {
      setEstado(await api.estado());
    } catch {
      /* sin estado (p. ej. backend aún sin juego): la UI sigue funcionando */
    }
  }, [api]);
  useEffect(() => {
    if (token) void refrescar();
    else setEstado(null);
  }, [token, refrescar]);
  useEffect(() => {
    aplicarPaleta(estado?.paleta_activa ?? "pradera");
  }, [estado?.paleta_activa]);
  return <EstadoCtx.Provider value={{ estado, refrescar, poner: setEstado }}>{children}</EstadoCtx.Provider>;
}
