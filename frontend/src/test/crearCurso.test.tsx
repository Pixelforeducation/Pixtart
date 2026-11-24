import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { aConfig, CrearCurso, validarCurso, type FormCurso } from "../pages/CrearCurso";
import { crearMock } from "../api/mock";
import { renderCon } from "./utils";

const pdf = () => new File(["%PDF-1.4"], "apuntes.pdf", { type: "application/pdf" });
const base: FormCurso = { titulo: "", num_preguntas: 20, dificultad: 3, tipos: ["multiple_choice"], minutos: {}, repaso: "leitner", instrucciones: "" };

describe("validarCurso / aConfig", () => {
  it("valida PDF, número de preguntas, tipos y repaso", () => {
    expect(validarCurso(null, base).pdf).toBeDefined();
    expect(validarCurso(new File(["x"], "a.txt", { type: "text/plain" }), base).pdf).toMatch(/PDF/);
    expect(validarCurso(pdf(), { ...base, num_preguntas: 3 }).num_preguntas).toBeDefined();
    expect(validarCurso(pdf(), { ...base, tipos: [] }).tipos).toBeDefined();
    expect(validarCurso(pdf(), { ...base, repaso: "" }).repaso).toBeDefined();
    expect(validarCurso(pdf(), base)).toEqual({});
  });
  it("convierte minutos a segundos en tiempos_por_tipo", () => {
    const c = aConfig({ ...base, tipos: ["multiple_choice", "proof"], minutos: { proof: "15", math_problem: "15" } });
    expect(c.tiempos_por_tipo).toEqual({ proof: 900 });
    expect(c).not.toHaveProperty("titulo");
  });
});

describe("CrearCurso", () => {
  it("sin key muestra aviso con enlace a Ajustes y deshabilita crear", async () => {
    renderCon(<CrearCurso />, { op: { conKey: false } });
    expect(await screen.findByRole("link", { name: /Ajustes/ })).toHaveAttribute("href", "/ajustes");
    expect(screen.getByRole("button", { name: "Crear curso" })).toBeDisabled();
  });

  it("pide elegir repaso y envía la config completa", async () => {
    const api = crearMock();
    const spy = vi.spyOn(api, "crearCurso");
    renderCon(<CrearCurso />, { api, ruta: "/crear", patron: "/crear" });
    const u = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear curso" })).toBeEnabled());
    await u.upload(screen.getByLabelText(/PDF \(máx/), pdf());
    await u.click(screen.getByLabelText("Demostración"));
    expect(screen.getByLabelText("Minutos para Demostración")).toHaveValue(15);
    await u.click(screen.getByRole("button", { name: "Crear curso" }));
    expect(screen.getByText("Elige cómo quieres repasar.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    await u.click(screen.getByLabelText(/^FSRS/));
    await u.type(screen.getByLabelText(/Instrucciones/), "Solo capítulo 2");
    await u.click(screen.getByRole("button", { name: "Crear curso" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [archivo, config] = spy.mock.calls[0];
    expect(archivo.name).toBe("apuntes.pdf");
    expect(config).toMatchObject({ num_preguntas: 20, dificultad: 3, repaso: "fsrs", instrucciones: "Solo capítulo 2", tiempos_por_tipo: { proof: 900 } });
    expect(config.tipos).toEqual(["multiple_choice", "true_false", "proof"]);
  });
});
