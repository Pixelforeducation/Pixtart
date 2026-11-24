import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Api } from "../api";
import { ProveedorApi, ProveedorEstado } from "../contexto";
import { crearMock, type OpcionesMock } from "../api/mock";

export function renderCon(ui: ReactElement, { api, ruta = "/", patron = "*", op }: { api?: Api; ruta?: string; patron?: string; op?: OpcionesMock } = {}) {
  const a = api ?? crearMock(op);
  const r = render(
    <MemoryRouter initialEntries={[ruta]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProveedorApi api={a}>
        <ProveedorEstado>
          <Routes>
            <Route path={patron} element={ui} />
            <Route path="*" element={<div>otra ruta</div>} />
          </Routes>
        </ProveedorEstado>
      </ProveedorApi>
    </MemoryRouter>,
  );
  return { ...r, api: a };
}
