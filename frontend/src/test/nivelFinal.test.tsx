import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import NivelFinal from "../nivel-final";
import { crearApiDemo } from "../nivel-final/demo";
import { aplicarRespuesta, calcularProgreso, encuentroDe, enFuria, medidas, planEncuentros, requeridas } from "../nivel-final/logica";
import { monstruoPara, sueloPara, JEFE_LEGENDARIO } from "../nivel-final/sprites";
import { renderCon } from "./utils";

describe("lógica del nivel final", () => {
  it("requeridas = ceil(N·g/100)", () => {
    expect(requeridas(10, 70)).toBe(7);
    expect(requeridas(8, 70)).toBe(6);
    expect(requeridas(3, 100)).toBe(3);
  });

  it("reparte guardias y jefe con fase 2", () => {
    const plan = planEncuentros(10);
    const jefe = plan[plan.length - 1];
    expect(jefe.tipo).toBe("jefe");
    expect(jefe.cuantas).toBe(4);
    expect(jefe.fase2_desde).toBe(8);
    expect(plan.reduce((s, e) => s + e.cuantas, 0)).toBe(10);
    expect(plan.some((e) => e.tipo === "raro")).toBe(true);
    expect(encuentroDe(plan, 7).encuentro.tipo).toBe("jefe");
    expect(enFuria(plan, 7)).toBe(false);
    expect(enFuria(plan, 9)).toBe(true);
  });

  it("victoria temprana y derrota cuando el aprobado es imposible", () => {
    expect(calcularProgreso(10, 7, 7, 0).resultado).toBe("victoria");
    expect(calcularProgreso(10, 7, 2, 4).resultado).toBe("derrota");
    const p = calcularProgreso(10, 7, 0, 0);
    expect(p.corazones).toBe(3);
    const q = aplicarRespuesta(p, { correcta: false, respuesta_correcta: 0, explicacion: "", vidas: 1, mascota: null, xp_ganada: 0 } as never);
    expect(q.corazones).toBe(2);
  });

  it("escala entera del canvas y jefe legendario en la última sección", () => {
    expect(medidas(390).zoom).toBe(2);
    expect(medidas(390, 200).zoom).toBe(1);
    expect(medidas(350).zoom).toBe(2);
    expect(monstruoPara("jefe", 0, 2, true)).toBe(JEFE_LEGENDARIO);
    expect(monstruoPara("jefe", 0, 0, false)).not.toBe(JEFE_LEGENDARIO);
    expect(sueloPara("Expresiones regulares")).toBe("gris");
    expect(sueloPara("Agentes de IA")).toBe("aurora");
  });
});

describe("NivelFinal (demo, sin canvas)", () => {
  const ruta = { ruta: "/final/demo", patron: "/final/:nivelId" };

  async function responderMC(u: ReturnType<typeof userEvent.setup>, opcion: RegExp) {
    await u.click(await screen.findByRole("button", { name: opcion }));
    await u.click(screen.getByRole("button", { name: "Responder" }));
    await u.click(await screen.findByRole("button", { name: "Continuar" }));
  }

  it("se juega de principio a fin: combo crítico, victoria temprana y cofre legendario", async () => {
    renderCon(<NivelFinal modoInicial="sin-canvas" api={crearApiDemo()} />, ruta);
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "¡A la aventura!" }));
    await responderMC(u, /Verdadero/);
    await responderMC(u, /Cualquier carácter/);
    // tercer acierto seguido = golpe crítico
    await u.click(await screen.findByRole("button", { name: /Una o más/ }));
    await u.click(screen.getByRole("button", { name: "Responder" }));
    expect(await screen.findByText(/GOLPE CRÍTICO/)).toBeInTheDocument();
    expect(screen.getByLabelText("Racha de 3 aciertos")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Continuar" }));
    await responderMC(u, /Falso/);
    await responderMC(u, /^A\s*color$/);
    await u.type(await screen.findByLabelText("Tu respuesta"), "{{3}");
    await u.click(screen.getByRole("button", { name: "Responder" }));
    await u.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("¡Meta alcanzada!")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Reclamar recompensa" }));
    expect(await screen.findByText("¡Aprobaste el nivel final!")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Abrir cofre legendario" }));
    expect(await screen.findByText("Búho de cristal (demo)", {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("un error muestra la respuesta correcta y la explicación", async () => {
    renderCon(<NivelFinal modoInicial="sin-canvas" api={crearApiDemo()} />, ruta);
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "¡A la aventura!" }));
    await u.click(await screen.findByRole("button", { name: /Falso/ }));
    await u.click(screen.getByRole("button", { name: "Responder" }));
    expect(await screen.findByText("¡El monstruo te golpea!")).toBeInTheDocument();
    expect(screen.getByText(/Respuesta correcta:/)).toHaveTextContent("Verdadero");
    expect(screen.getByText("Una regex describe un conjunto de cadenas.")).toBeInTheDocument();
  });

  it("pierde cuando ya no puede aprobar", async () => {
    renderCon(<NivelFinal modoInicial="sin-canvas" api={crearApiDemo()} />, ruta);
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "¡A la aventura!" }));
    // margen = 8 - 6 = 2 → al tercer fallo termina
    await responderMC(u, /Falso/);
    await responderMC(u, /Solo un punto/);
    await u.click(await screen.findByRole("button", { name: /Cero o más/ }));
    await u.click(screen.getByRole("button", { name: "Responder" }));
    await u.click(await screen.findByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByText("Esta vez no")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
