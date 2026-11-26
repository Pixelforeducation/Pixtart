import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EfectoAtaque } from "../components/juego/EscenaNivel";
import { ARMAS, HeroeEquipado, VB_ARMA, cajaArma, capasArma, dibujoPx, tipoAtaque, type TipoAtaque } from "../components/juego/HeroeEquipado";

const CONTORNO = "#1B1F3B";

describe("Armas equipadas (capa propia, grande y con contorno)", () => {
  it("cada arma se dibuja en un SVG mayor que el cuerpo, con su tipo de ataque", () => {
    for (const id of Object.keys(ARMAS)) {
      const { container, unmount } = render(<HeroeEquipado tier={3} equipo={{ arma: id, armadura: null, ropa: null }} alt="Héroe" />);
      const svg = container.querySelector("svg.heroe-arma")!;
      expect(svg, id).not.toBeNull();
      expect(svg.getAttribute("data-arma")).toBe(id);
      expect(svg.getAttribute("viewBox")).toBe(`${VB_ARMA.x} ${VB_ARMA.y} ${VB_ARMA.lado} ${VB_ARMA.lado}`);
      expect(svg.getAttribute("shape-rendering")).toBe("crispEdges");
      expect(svg.classList.contains(`ataque-${tipoAtaque(id)}`)).toBe(true);
      expect(svg.querySelector('[data-capa="mano"] rect'), id).not.toBeNull();
      unmount();
    }
  });

  it("las armas sobresalen del cuadro de 32×32 y llevan contorno oscuro", () => {
    for (const id of Object.keys(ARMAS)) {
      const capas = capasArma(id);
      const [x, y, w, h] = cajaArma(capas);
      expect(y < 0 || x + w > 32, id).toBe(true); // sale de la silueta
      expect(Math.max(w, h), id).toBeGreaterThanOrEqual(20); // grande
      expect(capas[0].px.some((p) => p[4] === CONTORNO), id).toBe(true);
    }
  });

  it("el puño es guantelete con armadura de placas", () => {
    const piel = capasArma("arma_espada").find((c) => c.id === "mano")!;
    const acero = capasArma("arma_espada", { guante: true }).find((c) => c.id === "mano")!;
    expect(piel.px.some((p) => p[4] === "#F0C08A")).toBe(true);
    expect(acero.px.some((p) => p[4] === "#F0C08A")).toBe(false);
  });

  it("sub-capas animables: cuerda tensa del arco y brillo de la gema (ocultas en reposo)", () => {
    const arco = capasArma("arma_arco");
    expect(arco.filter((c) => c.oculta).map((c) => c.id)).toEqual(["cuerda-tensa", "flecha-tensa"]);
    expect(arco.map((c) => c.id)).toEqual(expect.arrayContaining(["cuerda-suelta", "flecha-cargada"]));
    expect(capasArma("arma_baculo").find((c) => c.id === "gema-brillo")?.oculta).toBe(true);
    // el ícono no incluye el puño ni lo oculto
    expect(capasArma("arma_arco", { mano: false }).some((c) => c.id === "mano")).toBe(false);
  });

  it("dibujoPx pone contorno alrededor del dibujo", () => {
    const px = dibujoPx(["X"], { X: "#FFFFFF" });
    expect(px.filter((p) => p[4] === "#FFFFFF")).toHaveLength(1);
    expect(px.filter((p) => p[4] === CONTORNO).reduce((n, p) => n + p[2] * p[3], 0)).toBe(8);
  });
});

describe("Efectos de ataque por arma", () => {
  const esperado: Record<TipoAtaque, string[]> = {
    punio: [".jg-fx-puno", ".jg-fx-onda"],
    tajo: [".jg-fx-tajo"],
    flecha: [".jg-fx-proyectil"],
    orbe: [".jg-fx-proyectil", ".jg-fx-chispa"],
    martillazo: [".jg-fx-polvo", ".jg-fx-grieta"],
    triple: [".jg-fx-corte1", ".jg-fx-corte2", ".jg-fx-corte3", ".jg-fx-chispa"],
  };
  it("cada tipo pinta sus propias piezas (y todos el impacto)", () => {
    for (const [tipo, sel] of Object.entries(esperado) as [TipoAtaque, string[]][]) {
      const { container, unmount } = render(<EfectoAtaque tipo={tipo} />);
      const fx = container.querySelector(`.jg-fx-${tipo}`)!;
      expect(fx, tipo).not.toBeNull();
      expect(fx.getAttribute("aria-hidden")).toBe("true");
      for (const s of sel) expect(fx.querySelector(s), `${tipo} ${s}`).not.toBeNull();
      expect(fx.querySelector(".jg-fx-impacto")).not.toBeNull();
      unmount();
    }
    // piezas exclusivas: la flecha no trae polvo ni el martillo trae cortes
    const { container } = render(<EfectoAtaque tipo="flecha" />);
    expect(container.querySelector(".jg-fx-polvo, .jg-fx-corte, .jg-fx-onda")).toBeNull();
  });
});
