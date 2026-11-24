import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PreguntaJugable } from "../api";
import { Ordenar, PreguntaVista } from "../components/Pregunta";
import { Temporizador } from "../components/Temporizador";
import { Mascota } from "../components/Mascota";

const mc: PreguntaJugable = { id: 1, tipo: "multiple_choice", enunciado: "¿Qué pigmento?", opciones: ["Hemoglobina", "Clorofila", "Melanina"], dificultad: 2, tiempo_s: 30 };

describe("Pregunta de opción múltiple", () => {
  it("responde con el índice elegido", async () => {
    const onR = vi.fn();
    render(<PreguntaVista pregunta={mc} onResponder={onR} />);
    const u = userEvent.setup();
    expect(screen.getByRole("button", { name: "Responder" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: /Clorofila/ }));
    await u.click(screen.getByRole("button", { name: "Responder" }));
    expect(onR).toHaveBeenCalledWith(1);
  });

  it("la ayuda elimina una opción incorrecta", () => {
    render(<PreguntaVista pregunta={mc} onResponder={() => {}} ayudas={[{ tipo_ayuda: "eliminar_opcion", datos: { eliminar_opcion: 2 } }]} />);
    const elim = screen.getByRole("button", { name: /Melanina \(descartada/ });
    expect(elim).toBeDisabled();
    expect(elim).toHaveClass("eliminada");
    expect(screen.getByRole("button", { name: /Clorofila/ })).toBeEnabled();
  });

  it("tras el resultado marca la correcta y bloquea", async () => {
    render(<PreguntaVista pregunta={mc} onResponder={() => {}} resultado={{ correcta: false, respuesta_correcta: 1, explicacion: "", vidas: 9, mascota: null, xp_ganada: 0 }} />);
    expect(screen.getByRole("button", { name: /Clorofila/ })).toHaveClass("correcta");
    expect(screen.queryByRole("button", { name: "Responder" })).not.toBeInTheDocument();
  });
});

describe("Ordenar", () => {
  it("se puede reordenar con teclado (botones y Alt+flechas)", async () => {
    const onR = vi.fn();
    render(<Ordenar opciones={["A", "B", "C"]} fijos={[]} bloqueada={false} semilla="x" onResponder={onR} />);
    const u = userEvent.setup();
    const textos = () => screen.getAllByTestId("paso").map((li) => li.querySelector(".texto")!.textContent);
    const inicial = textos();
    await u.click(screen.getByRole("button", { name: `Bajar «${inicial[0]}»` }));
    expect(textos()).toEqual([inicial[1], inicial[0], inicial[2]]);
    screen.getByRole("button", { name: `Subir «${inicial[0]}»` }).focus();
    await u.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(textos()).toEqual(inicial);
    await u.click(screen.getByRole("button", { name: "Responder" }));
    expect(onR).toHaveBeenCalledWith(expect.any(Array));
  });
});

describe("Temporizador", () => {
  it("cuenta hacia atrás y avisa una sola vez al agotarse", () => {
    vi.useFakeTimers();
    const onA = vi.fn();
    render(<Temporizador segundos={3} onAgotado={onA} clave={1} />);
    expect(screen.getByRole("timer")).toHaveAccessibleName("Tiempo restante 0:03");
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.getByRole("timer")).toHaveAccessibleName("Tiempo restante 0:02");
    act(() => vi.advanceTimersByTime(3000));
    expect(onA).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(3000));
    expect(onA).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("se congela cuando no está activo", () => {
    vi.useFakeTimers();
    const onA = vi.fn();
    render(<Temporizador segundos={2} activo={false} onAgotado={onA} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(onA).not.toHaveBeenCalled();
    expect(screen.getByRole("timer")).toHaveAccessibleName("Tiempo restante 0:02");
    vi.useRealTimers();
  });
});

describe("Mascota", () => {
  it("muerta muestra la cuenta regresiva hasta revive_en y avisa al revivir", () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-11-24T12:00:00Z").getTime();
    vi.setSystemTime(t0);
    const onRevive = vi.fn();
    render(
      <Mascota onRevive={onRevive} onAyuda={() => {}}
        mascota={{ id: 1, especie: "crystal-owl", rareza: "rara", viva: false, revive_en: new Date(t0 + 20 * 60 * 1000).toISOString(), comida: 0, hambrienta: true, ayudas_restantes_nivel: 0 }} />,
    );
    expect(screen.getByRole("timer")).toHaveTextContent("Revive en 20:00");
    expect(screen.queryByRole("button", { name: /Ayuda/ })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(65 * 1000));
    expect(screen.getByRole("timer")).toHaveTextContent("Revive en 18:55");
    act(() => vi.advanceTimersByTime(19 * 60 * 1000));
    expect(onRevive).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("viva muestra el botón de ayuda con las ayudas restantes", async () => {
    const onAyuda = vi.fn();
    render(<Mascota onAyuda={onAyuda} mascota={{ id: 1, especie: "ember-fox", rareza: "legendaria", viva: true, comida: 3, hambrienta: false, ayudas_restantes_nivel: 3 }} />);
    await userEvent.click(screen.getByRole("button", { name: "Ayuda (3)" }));
    expect(onAyuda).toHaveBeenCalled();
  });
});
