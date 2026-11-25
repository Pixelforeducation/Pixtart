import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANFITRIONES,
  ENEMIGOS,
  HEROES,
  MASCOTAS,
  Sprite,
  existeSprite,
  fichaMascota,
  framesDe,
  resolverSprite,
  spriteCofre,
  spriteHeroe,
  spriteIcono,
  spriteItem,
  spriteMascota,
  spriteUrl,
} from "../arte";
import catalogo from "../arte/catalogo.json";
import manifiesto from "../arte/manifiesto.json";

// Solo las rutas (carga perezosa: no se importa ningún SVG).
const EN_DISCO = new Set(
  Object.keys(import.meta.glob("../../public/sprites/**/*.svg")).map((k) => k.replace("../../public", "")),
);

describe("contrato de arte", () => {
  it("cada archivo del manifiesto existe en public/sprites", () => {
    const faltan: string[] = [];
    for (const [nombre, info] of Object.entries(manifiesto.sprites)) {
      const anims = info.anims as Record<string, { frames: number }>;
      const rutas = [`/sprites/${nombre}.svg`];
      for (const [a, { frames }] of Object.entries(anims))
        for (let f = 1; f <= frames; f++) rutas.push(`/sprites/${nombre}-${a}-f${f}.svg`);
      for (const r of rutas) if (!EN_DISCO.has(r)) faltan.push(r);
    }
    expect(EN_DISCO.size).toBeGreaterThan(100);
    expect(faltan).toEqual([]);
  });

  it("todo ítem y mascota del catálogo del backend tiene sprite (con alias)", () => {
    for (const it of catalogo.items) expect(existeSprite(spriteItem(it.item_id)), it.item_id).toBe(true);
    for (const id of ["botiquin", "comida", "escudo", "pocion_resurreccion", "pocion_tiempo", "lupa", "mascota_mini-golem"])
      expect(existeSprite(spriteItem(id)), id).toBe(true);
    for (const e of ["imp-small", "ember-fox", "crystal-owl", "black-knight", "mini-golem"])
      expect(fichaMascota(e)?.rol).toBe("mascota");
  });

  it("resuelve frames, respaldos y desconocidos", () => {
    expect(spriteUrl(spriteHeroe(9))).toBe("/sprites/heroe/tier6-idle-f1.svg");
    expect(spriteUrl("heroe/tier1", "caminar", 2)).toBe("/sprites/heroe/tier1-caminar-f2.svg");
    expect(spriteUrl("mascota/crystal-owl", "hablar")).toBe("/sprites/mascota/crystal-owl-idle-f1.svg");
    expect(spriteUrl(spriteItem("botiquin"))).toBe("/sprites/item/botiquin.svg");
    expect(spriteUrl(spriteIcono("arena"))).toBe("/sprites/icono/arena.svg");
    expect(resolverSprite("mascota/no-existe")).toBe("efecto/falta");
    expect(framesDe(spriteCofre("legendario"), "abrir").bucle).toBe(false);
    expect(resolverSprite(spriteMascota("ember-fox"))).toBe("mascota/ember-fox");
  });

  it("catálogo de personajes completo", () => {
    expect(HEROES).toHaveLength(6);
    const r = (x: string) => MASCOTAS.filter((m) => m.rareza === x).length;
    expect([r("comun"), r("rara"), r("legendaria")]).toEqual([3, 2, 3]);
    expect(MASCOTAS.map((m) => m.id)).toEqual(
      expect.arrayContaining(["mascota/ember-fox", "mascota/crystal-owl", "mascota/mini-golem"]),
    );
    expect(ANFITRIONES.map((a) => a.id)).toContain("anfitrion/owl-librarian");
    expect(ENEMIGOS.find((e) => e.id === "enemigo/black-knight")?.jefe).toBe(true);
  });
});

describe("<Sprite>", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("anima los frames y respeta el tamaño", () => {
    render(<Sprite nombre="heroe/tier2" alt="Héroe" escala={2} />);
    const img = screen.getByAltText("Héroe");
    expect(img).toHaveAttribute("width", "64");
    expect(img.getAttribute("src")).toBe("/sprites/heroe/tier2-idle-f1.svg");
    act(() => void vi.advanceTimersByTime(framesDe("heroe/tier2").ms));
    expect(img.getAttribute("src")).toBe("/sprites/heroe/tier2-idle-f2.svg");
  });

  it("una anim sin bucle se queda en el último frame y avisa", () => {
    const onFin = vi.fn();
    render(<Sprite nombre="cofre/normal" anim="abrir" alt="Cofre" onFin={onFin} />);
    const { urls, ms } = framesDe("cofre/normal", "abrir");
    act(() => void vi.advanceTimersByTime(ms * (urls.length + 2)));
    expect(screen.getByAltText("Cofre").getAttribute("src")).toBe(urls[urls.length - 1]);
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it("con prefers-reduced-motion no anima", () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      render(<Sprite nombre="heroe/tier3" alt="H" />);
      act(() => void vi.advanceTimersByTime(5000));
      expect(screen.getByAltText("H").getAttribute("src")).toBe("/sprites/heroe/tier3-idle-f1.svg");
    } finally {
      window.matchMedia = original;
    }
  });
});
