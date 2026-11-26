import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { crearMock } from "../api/mock";
import { ItemIcono, nombreItem } from "../components/ItemIcono";
import { EQUIPABLES, HeroeEquipado, capasHeroe, cosmeticosTier, tipoAtaque } from "../components/juego/HeroeEquipado";
import { guardarToken } from "../api/sesion";
import { MascotaVisual } from "../escenas/visuales";
import { Perfil } from "../pages/Perfil";
import { Tienda, claseDe } from "../pages/Tienda";
import { renderCon } from "./utils";

describe("HeroeEquipado", () => {
  it("tipo de ataque por arma", () => {
    expect(tipoAtaque(null)).toBe("punio");
    expect(tipoAtaque("arma_espada")).toBe("tajo");
    expect(tipoAtaque("arma_arco")).toBe("flecha");
    expect(tipoAtaque("arma_baculo")).toBe("orbe");
    expect(tipoAtaque("arma_martillo")).toBe("martillazo");
    expect(tipoAtaque("arma_katana")).toBe("triple");
    expect(tipoAtaque("otra_cosa")).toBe("punio");
  });

  it("el arma va en .heroe-arma con data-arma", () => {
    const { container, rerender } = render(<HeroeEquipado tier={1} alt="Héroe" />);
    expect(container.querySelector(".heroe-arma")?.getAttribute("data-arma")).toBe("ninguna");
    rerender(<HeroeEquipado tier={1} equipo={{ arma: "arma_katana", armadura: "armadura_placas", ropa: "ropa_manto_real" }} alt="Héroe" />);
    expect(container.querySelector(".heroe-arma")?.getAttribute("data-arma")).toBe("arma_katana");
    expect(container.querySelector(".heroe-armadura")).not.toBeNull();
    expect(container.querySelector(".heroe-capa-trasera")).not.toBeNull(); // el manto real trae capa
    expect(screen.getByRole("img", { name: "Héroe" })).toHaveAttribute("data-ropa", "ropa_manto_real");
  });

  it("cosméticos de evolución por tier", () => {
    expect(cosmeticosTier(1)).toEqual({ bandana: false, pelo: false, hombreras: false, casco: false, capa: false, fuerte: false, corona: false });
    expect(cosmeticosTier(2).bandana).toBe(true);
    expect(cosmeticosTier(3)).toMatchObject({ pelo: true, hombreras: true, casco: false });
    expect(cosmeticosTier(4).casco).toBe(true);
    expect(cosmeticosTier(5)).toMatchObject({ capa: true, fuerte: true, corona: false });
    expect(cosmeticosTier(6).corona).toBe(true);
    // tier 1 sin ropa: el atuendo del sprite; desde tier 2 ropa de otro color
    expect(capasHeroe(1).ropa).toHaveLength(0);
    expect(capasHeroe(2).ropa.length).toBeGreaterThan(0);
    const { container } = render(<HeroeEquipado tier={6} alt="" />);
    const acc = [...container.querySelectorAll("[data-acc]")].map((e) => e.getAttribute("data-acc"));
    expect(acc).toEqual(expect.arrayContaining(["pelo", "bandana", "hombreras", "casco", "corona"]));
    expect(container.querySelector(".heroe-fuerte")).not.toBeNull();
  });

  it("la ropa manda en el color pero los accesorios de tier siguen", () => {
    const verde = capasHeroe(3, { arma: null, armadura: null, ropa: "ropa_tunica_verde" });
    const sinRopa = capasHeroe(3);
    expect(verde.ropa.some((p) => p[4] === "#3E8E41")).toBe(true);
    expect(sinRopa.ropa.some((p) => p[4] === "#3E8E41")).toBe(false);
    expect(verde.accesorios.map((a) => a.id)).toEqual(sinRopa.accesorios.map((a) => a.id));
  });

  it("todos los equipables tienen ícono y nombre", () => {
    expect(EQUIPABLES).toHaveLength(12);
    for (const id of EQUIPABLES) {
      const { container, unmount } = render(<ItemIcono id={id} />);
      expect(container.querySelector(`[data-equipable="${id}"] rect`), id).not.toBeNull();
      expect(nombreItem(id)).not.toContain("_");
      unmount();
    }
  });
});

describe("MascotaVisual por etapa", () => {
  it("etapa 1 sin adornos, 3 con corona", () => {
    const { container, rerender } = render(<MascotaVisual especie="ember-fox" alt="Zorro" />);
    expect(container.querySelector(".mascota-evo")).toBeNull();
    rerender(<MascotaVisual especie="ember-fox" alt="Zorro" etapa={2} />);
    expect(container.querySelector(".mascota-evo.etapa-2")).not.toBeNull();
    rerender(<MascotaVisual especie="ember-fox" alt="Zorro" etapa={3} />);
    expect(container.querySelector(".mascota-evo.etapa-3 .mascota-corona")).not.toBeNull();
  });
});

describe("Tienda v0.3", () => {
  it("infiere la clase por prefijo", () => {
    expect(claseDe({ item_id: "arma_arco" })).toBe("arma");
    expect(claseDe({ item_id: "armadura_malla" })).toBe("armadura");
    expect(claseDe({ item_id: "ropa_capa_roja" })).toBe("ropa");
    expect(claseDe({ item_id: "mascota_ember-fox" })).toBe("mascota");
    expect(claseDe({ item_id: "lupa" })).toBe("consumible");
  });

  it("secciones por clase y equipa/quita lo que ya tienes", async () => {
    guardarToken("t");
    const { container } = renderCon(<Tienda />);
    const u = userEvent.setup();
    for (const t of ["Consumibles", "Mascotas", "Armas", "Armaduras", "Ropa"]) expect(await screen.findByRole("region", { name: t })).toBeInTheDocument();
    const armas = screen.getByRole("region", { name: "Armas" });
    await u.click(within(armas).getByRole("button", { name: "Equipar Espada" }));
    await waitFor(() => expect(container.querySelector(".heroe-arma")?.getAttribute("data-arma")).toBe("arma_espada"));
    expect(within(armas).getByText("Equipado")).toBeInTheDocument();
    await u.click(within(armas).getByRole("button", { name: "Quitar Espada" }));
    await waitFor(() => expect(container.querySelector(".heroe-arma")?.getAttribute("data-arma")).toBe("ninguna"));
    // pestañas: filtra a una sola sección
    await u.click(screen.getByRole("tab", { name: "Ropa" }));
    expect(screen.queryByRole("region", { name: "Armas" })).toBeNull();
    expect(screen.getByRole("region", { name: "Ropa" })).toBeInTheDocument();
  });
});

describe("Mock v0.3 (F2)", () => {
  it("no se compra dos veces un equipable y el cofre no repite", async () => {
    const api = crearMock({ estado: { monedas: 100000 } });
    await api.comprar("arma_katana");
    await expect(api.comprar("arma_katana")).rejects.toThrow(/Ya tienes/);
    await expect(api.equipar("armadura_placas")).rejects.toThrow();
    for (let i = 0; i < 8; i++) {
      const c = await api.abrirCofre("1");
      const ids = c.items.map((x) => x.item_id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const inv = (await api.estado()).inventario;
    for (const e of inv) if (/^(arma|armadura|ropa|mascota)_/.test(e.item_id)) expect(e.cantidad, e.item_id).toBe(1);
  });
});

describe("Perfil v0.3", () => {
  it("muestra equipo y la evolución de las mascotas", async () => {
    guardarToken("t");
    renderCon(<Perfil />);
    expect(await screen.findByRole("list", { name: "Equipo puesto" })).toBeInTheDocument();
    const evo = screen.getByRole("list", { name: "Evolución de tus mascotas" });
    expect(within(evo).getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    expect(within(evo).getByText(/Etapa 2\/3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Equipar Espada" })).toBeInTheDocument();
  });
});
