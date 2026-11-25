import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PATRONES, bonusRacha, esCasi, esHitoRacha, estrellasNivel, frecuenciaTic, lanzar, nivelCombo, notasAcierto,
  ponerSonido, ponerVibracion, ponerVolumen, siguienteRacha, sonidoActivo, tocar, vibrar, volumen,
} from "../efectos";
import { BarraXP, MetaDiaria, RachaLlama, progresoTier, tamLlama, tierPara } from "../components/enganche";
import { Combo } from "../components/juego/Hud";
import { Cofre } from "../components/juego/Cofre";
import type { CofreAbierto } from "../api";
import { useState } from "react";
import userEvent from "@testing-library/user-event";

afterEach(() => {
  ponerSonido(true);
  ponerVolumen(0.7);
  ponerVibracion(true);
  localStorage.clear();
});

describe("combo y racha", () => {
  it("el multiplicador sube en 3, 5 y 8 aciertos seguidos", () => {
    expect([0, 1, 2, 3, 4, 5, 7, 8, 20].map(nivelCombo)).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it("la racha sube con el acierto y vuelve a 0 con el error", () => {
    let r = 0;
    for (const ok of [true, true, true]) r = siguienteRacha(r, ok);
    expect(r).toBe(3);
    expect(siguienteRacha(r, false)).toBe(0);
  });
  it("celebra los hitos (cuando sube el multiplicador y cada 10)", () => {
    expect([1, 2, 3, 4, 5, 8, 9, 10, 20].filter(esHitoRacha)).toEqual([3, 5, 8, 10, 20]);
  });
  it("el bonus de racha sigue el PLAN: 5 × min(racha, 10)", () => {
    expect(bonusRacha(0)).toBe(0);
    expect(bonusRacha(4)).toBe(20);
    expect(bonusRacha(25)).toBe(50);
  });
  it("estrellas: perfecto 3, ≥60 % 2 y terminar siempre da al menos 1", () => {
    expect(estrellasNivel(5, 5, true)).toBe(3);
    expect(estrellasNivel(3, 5, false)).toBe(2);
    expect(estrellasNivel(0, 5, false)).toBe(1);
  });
  it("el HUD muestra la racha desde 2 y el multiplicador desde ×2", () => {
    const { rerender, container } = render(<Combo racha={1} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<Combo racha={2} />);
    expect(screen.getByRole("img", { name: "Racha de 2 aciertos seguidos" })).not.toHaveTextContent("×");
    rerender(<Combo racha={5} />);
    expect(screen.getByRole("img", { name: "Racha de 5 aciertos seguidos" })).toHaveTextContent("×3");
  });
});

describe("«casi» en el error", () => {
  it("numérica: cerca en porcentaje o por uno en números chicos", () => {
    expect(esCasi("numeric", 7, 6, 0)).toBe(true);
    expect(esCasi("numeric", 9, 6, 0)).toBe(false);
    expect(esCasi("numeric", 7150, 7200, 0)).toBe(true);
    expect(esCasi("numeric", 6, 6, 0)).toBe(false);
  });
  it("texto: una o dos letras de diferencia, sin importar acentos ni mayúsculas", () => {
    expect(esCasi("fill_text", "cloroplsto", ["cloroplasto"])).toBe(true);
    expect(esCasi("fill_text", "Mitocondria", ["cloroplasto"])).toBe(false);
    expect(esCasi("fill_text", "fotosintesís", ["Fotosíntesis"])).toBe(false); // idéntica sin acentos: no es error "casi"
  });
  it("ordenar: solo un par intercambiado", () => {
    expect(esCasi("ordering", [1, 0, 2], [0, 1, 2])).toBe(true);
    expect(esCasi("ordering", [2, 0, 1], [0, 1, 2])).toBe(false);
  });
  it("opción múltiple y tiempo agotado nunca son «casi»", () => {
    expect(esCasi("multiple_choice", 2, 1)).toBe(false);
    expect(esCasi("numeric", null, 6)).toBe(false);
  });
});

describe("sonido", () => {
  it("el tono del acierto sube con la racha y se topa", () => {
    const tonos = [1, 2, 3, 9, 50].map((r) => notasAcierto(r)[0]);
    expect(tonos[1]).toBeGreaterThan(tonos[0]);
    expect(tonos[2]).toBeGreaterThan(tonos[1]);
    expect(tonos[4]).toBe(tonos[3]);
  });
  it("el tic se vuelve más agudo en los últimos segundos", () => {
    expect(frecuenciaTic(1)).toBeGreaterThan(frecuenciaTic(5));
  });
  it("silencio y volumen persisten y se recortan al rango", () => {
    ponerSonido(false);
    expect(sonidoActivo()).toBe(false);
    expect(localStorage.getItem("pixtart:sonido")).toBe("off");
    ponerVolumen(3);
    expect(volumen()).toBe(1);
    ponerVolumen(-1);
    expect(volumen()).toBe(0);
    expect(localStorage.getItem("pixtart:volumen")).toBe("0");
  });
  it("nunca lanza aunque no haya Web Audio ni almacenamiento", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(() => ponerSonido(true)).not.toThrow();
    expect(() => tocar("acierto", 4)).not.toThrow();
    set.mockRestore();
  });
});

describe("vibración y partículas", () => {
  it("vibra con el patrón del momento y respeta el apagado", () => {
    const v = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: v, configurable: true });
    vibrar("acierto");
    expect(v).toHaveBeenCalledWith(PATRONES.acierto);
    ponerVibracion(false);
    vibrar("error");
    expect(v).toHaveBeenCalledTimes(1);
  });
  it("sin capa de partículas, los callbacks de llegada se cumplen igual (los contadores cuadran)", () => {
    const llega = vi.fn();
    lanzar({ tipo: "moneda", desde: { x: 0, y: 0 }, hacia: { x: 10, y: 10 }, cantidad: 5, alLlegar: llega });
    expect(llega).toHaveBeenCalledTimes(5);
  });
});

describe("componentes de enganche", () => {
  it("tiers según la tabla de reglas", () => {
    expect(tierPara(0)).toBe(1);
    expect(tierPara(899)).toBe(2);
    expect(tierPara(900)).toBe(3);
    expect(tierPara(99999)).toBe(6);
    expect(progresoTier(600)).toMatchObject({ tier: 2, desde: 300, hasta: 900, frac: 0.5 });
    expect(progresoTier(8000)).toMatchObject({ tier: 6, maximo: true, frac: 1 });
  });
  it("la llama crece con los días y avisa sin regañar si hoy falta jugar", () => {
    expect([1, 7, 30, 100].map(tamLlama)).toEqual([1, 2, 3, 4]);
    render(<RachaLlama dias={5} jugadoHoy={false} escudos={1} />);
    expect(screen.getByRole("img", { name: "Racha de 5 días, juega hoy para mantenerla, 1 escudo" })).toBeInTheDocument();
  });
  it("la meta diaria anuncia su progreso y avisa una vez al cumplirse", () => {
    const ok = vi.fn();
    const { rerender } = render(<MetaDiaria hechos={1} meta={3} celebrar={false} onCompletar={ok} />);
    expect(screen.getByRole("progressbar", { name: "Meta diaria" })).toHaveAttribute("aria-valuetext", "1 de 3 niveles hoy");
    rerender(<MetaDiaria hechos={3} meta={3} celebrar={false} onCompletar={ok} />);
    rerender(<MetaDiaria hechos={4} meta={3} celebrar={false} onCompletar={ok} />);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(screen.getByText("¡Extra! 4 niveles")).toBeInTheDocument();
  });
  it("la barra de XP sube animada hasta el valor final y avisa al cruzar de tier", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const sube = vi.fn();
    render(<BarraXP xp={950} desde={850} retraso={10} onSubeNivel={sube} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "850");
    const avanzar = (ms: number) => { for (let t = 0; t < ms; t += 20) act(() => vi.advanceTimersByTime(20)); };
    avanzar(200);
    const aMedias = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
    expect(aMedias).toBeGreaterThan(850);
    expect(aMedias).toBeLessThan(950);
    avanzar(3000);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "950");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "950 de 2000 XP para el siguiente tier");
    expect(sube).toHaveBeenCalledWith(3, 2);
    vi.useRealTimers();
  });
});

describe("cofre", () => {
  function ConCofre({ tipo }: { tipo: "normal" | "legendario" }) {
    const [c, setC] = useState<CofreAbierto | null>(null);
    return <Cofre tipo={tipo} contenido={c} onAbrir={() => setC({ monedas: 60, items: [{ item_id: "pocion_resurreccion", nombre: "Poción de resurrección", rareza: "rara" }] })} />;
  }
  it.each(["normal", "legendario"] as const)("el cofre %s se sacude, se abre por frames y muestra el botín con su rareza", async (tipo) => {
    render(<ConCofre tipo={tipo} />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir cofre" }));
    expect(screen.getByText(/se mueve dentro/)).toBeInTheDocument();
    expect(await screen.findByText(/El cofre tenía \+60 monedas y Poción de resurrección/, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("Rara")).toBeInTheDocument();
  });
});
