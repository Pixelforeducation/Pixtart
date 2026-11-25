import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ProveedorApi, ProveedorEstado } from "./contexto";
import { instalarPuenteSonido } from "./efectos/puente";
import "./styles.css";

instalarPuenteSonido();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProveedorApi>
        <ProveedorEstado>
          <App />
        </ProveedorEstado>
      </ProveedorApi>
    </BrowserRouter>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
