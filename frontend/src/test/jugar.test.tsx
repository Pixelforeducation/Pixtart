import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Jugar, ayudaPermitida } from "../pages/Jugar";
import { guardarToken } from "../api/sesion";
import { renderCon } from "./utils";

describe("ayudaPermitida", () => {
  const m = (rareza: "comun" | "rara" | "legendaria") => ({ id: 1, especie: "x", rareza, viva: true, comida: 1, hambrienta: false, ayudas_restantes_nivel: 1 });
  it("sigue las reglas por rareza", () => {
    expect(ayudaPermitida(m("comun"), "multiple_choice")).toBe(true);
    expect(ayudaPermitida(m("comun"), "numeric")).toBe(false);
    expect(ayudaPermitida(m("rara"), "ordering")).toBe(true);
    expect(ayudaPermitida(m("rara"), "open")).toBe(false);
    expect(ayudaPermitida(m("legendaria"), "proof")).toBe(true);
    expect(ayudaPermitida(null, "multiple_choice")).toBe(false);
  });
});

describe("Jugar (con mock)", () => {
  it("usa la ayuda de la mascota, responde, ve feedback y termina el nivel", async () => {
    guardarToken("t");
    renderCon(<Jugar />, { ruta: "/jugar/100?curso=1", patron: "/jugar/:nivelId" });
    const u = userEvent.setup();
    expect(await screen.findByText("¿Qué pigmento capta la luz en las plantas?")).toBeInTheDocument();
    await u.click(await screen.findByRole("button", { name: /Ayuda de .* \(2 restantes\)/ }));
    expect(await screen.findByRole("button", { name: /Hemoglobina \(descartada/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Ayuda de .* \(1 restantes\)/ })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /Clorofila/ }));
    await u.click(screen.getByRole("button", { name: "Responder" }));
    expect(await screen.findByText("¡Correcto!")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Siguiente" }));
    await u.click(await screen.findByRole("button", { name: /Falso/ }));
    await u.click(screen.getByRole("button", { name: "Responder" }));
    expect(await screen.findByText("Incorrecto")).toBeInTheDocument();
    expect(screen.getByText(/La respuesta correcta es:/)).toHaveTextContent("Verdadero");
    // Tras el error se enseña la explicación y se continúa con «Entendido».
    expect(screen.getByText("¿Por qué?")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Entendido · Terminar nivel" }));
    await waitFor(() => expect(screen.getByText(/Nivel completado/)).toBeInTheDocument());
    expect(screen.getByText(/\+\d+ XP/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Siguiente nivel/ })).toBeInTheDocument();
  });
});
