import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Pregunta } from "../api";
import { EditorPregunta } from "../components/EditorPregunta";
import { Revision } from "../pages/Revision";
import { renderCon } from "./utils";

const q: Pregunta = {
  id: 7, tipo: "multiple_choice", enunciado: "¿2+2?", opciones: ["3", "4", "5"], respuesta: 9,
  explicacion: "Suma básica", pista: null, dificultad: 1, tiempo_s: 30, valida: false, problemas: ["La respuesta correcta no está entre las opciones."],
};

describe("EditorPregunta", () => {
  it("resalta preguntas inválidas con sus problemas", () => {
    render(<EditorPregunta pregunta={q} onGuardar={vi.fn()} onBorrar={vi.fn()} onRegenerar={vi.fn()} />);
    expect(screen.getByRole("article")).toHaveClass("invalida");
    expect(screen.getByText("La respuesta correcta no está entre las opciones.")).toBeInTheDocument();
  });

  it("edita enunciado, opción correcta y tiempo", async () => {
    const onGuardar = vi.fn().mockResolvedValue(undefined);
    render(<EditorPregunta pregunta={q} onGuardar={onGuardar} onBorrar={vi.fn()} onRegenerar={vi.fn()} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Editar" }));
    const enun = screen.getByLabelText("Enunciado");
    await u.clear(enun);
    await u.type(enun, "¿Cuánto es 2+2?");
    await u.click(screen.getByLabelText("Opción 2 es la correcta"));
    const t = screen.getByLabelText("Tiempo (segundos)");
    await u.clear(t);
    await u.type(t, "45");
    await u.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ enunciado: "¿Cuánto es 2+2?", opciones: ["3", "4", "5"], respuesta: 1, tiempo_s: 45 }));
  });

  it("no guarda si falta el enunciado", async () => {
    const onGuardar = vi.fn();
    render(<EditorPregunta pregunta={q} onGuardar={onGuardar} onBorrar={vi.fn()} onRegenerar={vi.fn()} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Editar" }));
    await u.clear(screen.getByLabelText("Enunciado"));
    await u.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("El enunciado no puede quedar vacío.");
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it("borra solo tras confirmar y regenera con instrucción", async () => {
    const onBorrar = vi.fn().mockResolvedValue(undefined);
    const onRegenerar = vi.fn().mockResolvedValue(undefined);
    render(<EditorPregunta pregunta={q} onGuardar={vi.fn()} onBorrar={onBorrar} onRegenerar={onRegenerar} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Borrar" }));
    expect(onBorrar).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Sí, borrar" }));
    expect(onBorrar).toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Regenerar" }));
    await u.type(screen.getByLabelText(/Instrucción para regenerar/), "más difícil");
    await u.click(screen.getByRole("button", { name: "Regenerar" }));
    expect(onRegenerar).toHaveBeenCalledWith("más difícil");
  });
});

describe("Revision", () => {
  it("deshabilita Publicar con preguntas inválidas y explica por qué; al corregir se habilita", async () => {
    renderCon(<Revision />, { ruta: "/cursos/2/revisar", patron: "/cursos/:id/revisar" });
    const publicar = await screen.findByRole("button", { name: "Publicar" });
    expect(publicar).toBeDisabled();
    expect(screen.getByText(/No puedes publicar todavía: 1 pregunta no pasa/)).toBeInTheDocument();
    const u = userEvent.setup();
    const articulo = screen.getAllByRole("article").find((a) => a.classList.contains("invalida"))!;
    await u.click(articulo.querySelector("button")!.closest("article")!.querySelector<HTMLButtonElement>("button.boton.chico")!);
    await u.click(screen.getByLabelText("Opción 2 es la correcta"));
    await u.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: "Publicar" }));
    expect(await screen.findByText(/Curso publicado/)).toBeInTheDocument();
  });
});
