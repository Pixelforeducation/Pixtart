import { apiHttp, type Api } from "./cliente";
import { crearMock } from "./mock";

export * from "./tipos";
export { ErrorApi, type Api } from "./cliente";

/** Con el mock, `?demo=avance` arranca con niveles ya completados (capturas y pruebas visuales). */
const opcionesDemo = () =>
  typeof location !== "undefined" && /[?&]demo=avance\b/.test(location.search) ? { completados: ["100", "101"] } : {};

/** API activa: el mock si VITE_MOCK=1, si no la HTTP real. */
export const apiPorDefecto: Api = import.meta.env.VITE_MOCK === "1" ? crearMock(opcionesDemo()) : apiHttp;
