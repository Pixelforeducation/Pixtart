import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Jugar, restaurarProgreso } from "../pages/Jugar";
import { guardarToken } from "../api/sesion";
import { crearMock } from "../api/mock";
import type { Api, PreguntaJugable } from "../api";
import { ProveedorApi, ProveedorEstado } from "../contexto";
import { atacante } from "../components/juego/EscenaNivel";
import NivelFinal from "../nivel-final";
import { crearApiDemo, type ApiFinal } from "../nivel-final/demo";
import { renderCon } from "./utils";

const RUTA = { ruta: "/jugar/100?curso=1", patron: "/jugar/:nivelId" };

function montar(api: Api) {
  return render(
    <MemoryRouter initialEntries={[RUTA.ruta]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProveedorApi api={api}>
        <ProveedorEstado>
          <Routes>
            <Route path={RUTA.patron} element={<Jugar />} />
            <Route path="*" element={<div>otra ruta</div>} />
          </Routes>
        </ProveedorEstado>
      </ProveedorApi>
    </MemoryRouter>,
  );
}

async function responderClorofila(u: ReturnType<typeof userEvent.setup>) {
  await u.click(await screen.findByRole("button", { name: /Clorofila/ }));
  await u.click(screen.getByRole("button", { name: "Responder" }));
  expect(await screen.findByText("¡Correcto!")).toBeInTheDocument();
}

describe("restaurarProgreso", () => {
  const qs = [{ id: 1 }, { id: 2 }, { id: 3 }] as PreguntaJugable[];
  it("vuelve a la primera sin responder con marcas, aciertos y XP", () => {
    const r = restaurarProgreso(qs, { respondidas: [{ pregunta_id: 1, correcta: true, xp_ganada: 10 }, { pregunta_id: 2, correcta: false, xp_ganada: 0 }], restante_s: 12, xp_ganada: 10 });
    expect(r).toEqual({ marcas: ["bien", "mal", null], idx: 2, completo: false, aciertos: 1, xp: 10, restante: 12 });
  });
  it("marca completo si ya no queda ninguna", () => {
    const r = restaurarProgreso(qs.slice(0, 1), { respondidas: [{ pregunta_id: 1, correcta: true, xp_ganada: 10 }], restante_s: 0, xp_ganada: 10 });
    expect(r.completo).toBe(true);
    expect(r.idx).toBe(0);
  });
});

describe("atacante", () => {
  it("el héroe ataca al acertar, el anfitrión al fallar y nadie con animaciones apagadas", () => {
    expect(atacante("acierto", 1)).toBe("heroe");
    expect(atacante("error", 0.5)).toBe("anfitrion");
    expect(atacante("pregunta", 1)).toBeNull();
    expect(atacante("acierto", 0)).toBeNull();
  });
});

describe("Mock v0.3: pausa y reanudación", () => {
  it("congela el reloj al pausar y lo devuelve al retomar el mismo nivel", async () => {
    let t = 1_000_000;
    const api = crearMock({ ahora: () => t });
    const a = await api.iniciarNivel(100);
    await api.responder(a.intento_id, { pregunta_id: 1, respuesta: 1, tiempo_ms: 1000 });
    t += 10_000; // 10 s en la pregunta 2
    await api.pausar(a.intento_id);
    t += 600_000; // fuera 10 min: no cuenta
    const b = await api.iniciarNivel(100);
    expect(b.reanudado).toBe(true);
    expect(b.intento_id).toBe(a.intento_id);
    expect(b.progreso?.respondidas).toEqual([{ pregunta_id: 1, correcta: true, xp_ganada: 10 }]);
    expect(b.progreso?.restante_s).toBe(35); // 45 − 10
  });

  it("no aprueba bajo el mínimo y el siguiente intento es un reintento", async () => {
    const api = crearMock();
    const a = await api.iniciarNivel(101);
    for (const q of a.preguntas) await api.responder(a.intento_id, { pregunta_id: q.id, respuesta: null, tiempo_ms: 1 });
    const f = await api.terminar(a.intento_id);
    expect(f).toMatchObject({ aprobado: false, porcentaje: 0, minimo: 60, cofre: null, drop: null });
    const camino = await api.camino(1);
    expect(camino.secciones[0].niveles.find((n) => n.id === 101)?.estado).not.toBe("completado");
    const b = await api.iniciarNivel(101);
    expect(b.reintento).toBe(true);
    expect(b.reanudado).toBeFalsy();
  });

  it("la mascota gana XP con aciertos sin ayuda", async () => {
    const api = crearMock();
    const a = await api.iniciarNivel(100);
    const r = await api.responder(a.intento_id, { pregunta_id: 1, respuesta: 1, tiempo_ms: 1 });
    expect(r.mascota_evento).toEqual({ xp_ganada: 2, evoluciono: false, etapa: 1 });
    expect(r.mascota?.xp).toBe(2);
  });
});

describe("Jugar v0.3", () => {
  it("al salir con ✕ pausa la partida y al volver la retoma en la misma pregunta", async () => {
    guardarToken("t");
    const api = crearMock();
    const pausar = vi.spyOn(api, "pausar");
    const u = userEvent.setup();
    const primero = montar(api);
    await responderClorofila(u);
    // El héroe ataca al anfitrión al acertar.
    expect(document.querySelector(".jg-actores")?.getAttribute("data-ataque")).toBe("heroe");
    expect(screen.getByText(/\+2 XP mascota/)).toBeInTheDocument();
    await u.click(screen.getByRole("link", { name: "Salir al camino" }));
    expect(await screen.findByText("otra ruta")).toBeInTheDocument();
    expect(pausar).toHaveBeenCalledTimes(1);
    primero.unmount();

    montar(api);
    expect(await screen.findByText("Partida retomada")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText("La fotosíntesis libera oxígeno.", { selector: ".sr-only" })).toBeInTheDocument();
  });

  it("no alcanzar el mínimo muestra la pantalla de reintento y reinicia el nivel", async () => {
    guardarToken("t");
    // Los calentamientos no exigen mínimo: aquí el nivel 100 se trata como lección.
    const api = crearMock() as ReturnType<typeof crearMock> & { _datos: { cursos: Map<string, import("../api").Curso> } };
    api._datos.cursos.get("1")!.secciones[0].niveles[0].es_calentamiento = false;
    renderCon(<Jugar />, { ...RUTA, api });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: /Hemoglobina/ }));
    await u.click(screen.getByRole("button", { name: "Responder" }));
    expect(await screen.findByText("Incorrecto")).toBeInTheDocument();
    expect(document.querySelector(".jg-actores")?.getAttribute("data-ataque")).toBe("anfitrion");
    await u.click(screen.getByRole("button", { name: "Entendido" }));
    await u.click(await screen.findByRole("button", { name: /Falso/ }));
    await u.click(screen.getByRole("button", { name: "Responder" }));
    await u.click(await screen.findByRole("button", { name: "Entendido · Terminar nivel" }));
    expect(await screen.findByText("No alcanzaste el mínimo")).toBeInTheDocument();
    expect(screen.getByText(/0% de 60% necesario/)).toBeInTheDocument();
    expect(screen.queryByText(/Nivel completado/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Siguiente nivel/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al camino" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /Reintentar nivel/ }));
    expect(await screen.findByText("Reintento: preguntas nuevas de la misma dificultad.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1/2")).toBeInTheDocument());
  });
});

describe("NivelFinal v0.3: pausa y reanudación", () => {
  it("retoma en la primera pregunta sin responder y pausa al salir", async () => {
    const demo = crearApiDemo();
    const base = await demo.iniciarNivel("demo");
    const pausar = vi.fn(() => Promise.resolve());
    const api: ApiFinal & { pausar: typeof pausar } = {
      ...demo,
      pausar,
      iniciarNivel: async () => ({
        ...base,
        final: undefined,
        reanudado: true,
        progreso: { respondidas: [{ pregunta_id: base.preguntas[0].id, correcta: true, xp_ganada: 10 }], restante_s: 7, xp_ganada: 10 },
      }),
    };
    const u = userEvent.setup();
    const r = renderCon(<NivelFinal modoInicial="sin-canvas" api={api} />, { ruta: "/final/7", patron: "/final/:nivelId" });
    expect(await screen.findByText(/Partida retomada: sigues en la pregunta 2/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "¡A la aventura!" }));
    expect(await screen.findByRole("timer")).toHaveAccessibleName("Tiempo restante 0:07");
    r.unmount();
    expect(pausar).toHaveBeenCalledTimes(1);
  });
});
