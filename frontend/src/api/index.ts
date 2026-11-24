import { apiHttp, type Api } from "./cliente";
import { crearMock } from "./mock";

export * from "./tipos";
export { ErrorApi, type Api } from "./cliente";

/** API activa: el mock si VITE_MOCK=1, si no la HTTP real. */
export const apiPorDefecto: Api = import.meta.env.VITE_MOCK === "1" ? crearMock() : apiHttp;
