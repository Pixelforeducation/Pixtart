import { describe, expect, it, vi } from "vitest";

// La sesión cachea el token en memoria: cada caso carga el módulo de cero.
async function sesionNueva() {
  vi.resetModules();
  return import("../api/sesion");
}

describe("sesión persistente", () => {
  it("guarda el token en localStorage (sobrevive a cerrar la pestaña)", async () => {
    const s = await sesionNueva();
    s.guardarToken("abc");
    expect(localStorage.getItem("pixtart.token")).toBe("abc");
    const otra = await sesionNueva();
    expect(otra.obtenerToken()).toBe("abc");
  });

  it("migra un token viejo de sessionStorage a localStorage", async () => {
    sessionStorage.setItem("pixtart.token", "viejo");
    const s = await sesionNueva();
    expect(s.obtenerToken()).toBe("viejo");
    expect(localStorage.getItem("pixtart.token")).toBe("viejo");
    expect(sessionStorage.getItem("pixtart.token")).toBeNull();
  });

  it("cerrar sesión borra el token de ambos almacenes", async () => {
    localStorage.setItem("pixtart.token", "x");
    sessionStorage.setItem("pixtart.token", "y");
    const s = await sesionNueva();
    s.guardarToken(null);
    expect(localStorage.getItem("pixtart.token")).toBeNull();
    expect(sessionStorage.getItem("pixtart.token")).toBeNull();
    expect(s.obtenerToken()).toBeNull();
  });
});
