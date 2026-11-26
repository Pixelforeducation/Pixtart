import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { guardarToken } from "../api/sesion";
import { biomaDeCurso, Escena } from "../escenas";
import { avanceDeHoy } from "../escenas/metaDiaria";
import { EVENTO_SONIDO } from "../escenas/sonido";
import { Inicio } from "../pages/Inicio";
import { Perfil } from "../pages/Perfil";
import { Tienda } from "../pages/Tienda";
import { renderCon } from "./utils";

afterEach(() => localStorage.clear());

describe("Escena", () => {
  it("pinta las capas del bioma detrás del contenido", () => {
    renderCon(<Escena bioma="bosque"><p>hola</p></Escena>);
    const e = screen.getByTestId("escena");
    expect(e).toHaveAttribute("data-bioma", "bosque");
    expect(e.querySelectorAll(".capa").length).toBe(6);
    expect(screen.getByText("hola")).toBeInTheDocument();
  });
  it("da el mismo mundo al mismo curso", () => {
    expect(biomaDeCurso({ id: 7, tema: "regex" })).toBe(biomaDeCurso({ id: 7, tema: "regex" }));
    expect(biomaDeCurso(null)).toBe("pradera");
  });
});

describe("meta diaria", () => {
  it("cuenta solo lo completado desde el primer vistazo del día", () => {
    expect(avanceDeHoy("1", 2)).toBe(0);
    expect(avanceDeHoy("1", 4)).toBe(2);
    expect(avanceDeHoy("2", 5)).toBe(2);
    expect(avanceDeHoy("2", 6)).toBe(3);
  });
});

describe("Inicio (mapa)", () => {
  it("marca el siguiente nivel, los completados, el cofre cercano y avisa al tocar uno bloqueado", async () => {
    guardarToken("t");
    const sonidos: string[] = [];
    const oye = (e: Event) => sonidos.push((e as CustomEvent<string>).detail);
    window.addEventListener(EVENTO_SONIDO, oye);
    renderCon(<Inicio />, { op: { completados: ["100", "101"] } });
    const u = userEvent.setup();

    const actual = await screen.findByRole("button", { name: "Lección: Balance (siguiente)" });
    expect(actual).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("¡JUGAR!")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /\(completado\)/ })).toHaveLength(2);

    const hoja = screen.getByRole("region", { name: "Sección La hoja" });
    expect(within(hoja).getByRole("progressbar", { name: "Progreso de La hoja" })).toHaveAttribute("aria-valuenow", "2");
    expect(within(hoja).getByText("¡Te falta 1 para el cofre!")).toBeInTheDocument();
    // La sección 2 aún está cerrada: no presume «casi».
    const calvin = screen.getByRole("region", { name: "Sección Ciclo de Calvin" });
    expect(within(calvin).queryByText(/Te falta/)).toBeNull();

    await u.click(within(calvin).getByRole("button", { name: "Lección: RuBisCO (bloqueado)" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Completa «Balance» para desbloquearlo.");
    expect(sonidos).toContain("bloqueado");

    expect(screen.getByRole("region", { name: "Tu día" })).toHaveTextContent("3 días");
    window.removeEventListener(EVENTO_SONIDO, oye);
  });
});

describe("Inicio: nivel final", () => {
  it("cada sección termina en su castillo real (bloqueado hasta completarla) y no hay castillo «próximamente»", async () => {
    guardarToken("t");
    renderCon(<Inicio />, { op: { completados: ["100", "101", "102"] }, ruta: "/", patron: "/" });
    const u = userEvent.setup();
    const hoja = await screen.findByRole("region", { name: "Sección La hoja" });
    const calvin = screen.getByRole("region", { name: "Sección Ciclo de Calvin" });
    expect(screen.queryByText(/próximamente/i)).toBeNull();
    expect(within(calvin).getByRole("button", { name: "Nivel final: Nivel final: Ciclo de Calvin (bloqueado)" })).toBeInTheDocument();
    // La sección siguiente no espera al jefe: su primer nivel es el siguiente.
    expect(within(calvin).getByRole("button", { name: /RuBisCO \(siguiente\)/ })).toBeInTheDocument();

    await u.click(within(calvin).getByRole("button", { name: /Nivel final: Ciclo de Calvin/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Completa la sección para retar al jefe");

    await u.click(within(hoja).getByRole("button", { name: "Nivel final: Nivel final: La hoja (disponible)" }));
    expect(await screen.findByText("otra ruta")).toBeInTheDocument(); // navegó a /final/demo?curso=1
  });
});

describe("Perfil", () => {
  it("muestra el tier, la escalera de evolución y el inventario", async () => {
    guardarToken("t");
    renderCon(<Perfil />);
    expect(await screen.findByText("Aprendiz · tier 2")).toBeInTheDocument();
    const evo = screen.getByRole("list", { name: "Evolución: tier 2 de 6" });
    expect(within(evo).getAllByRole("listitem")).toHaveLength(6);
    expect(within(evo).getAllByText("???")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Equipar" })).toBeInTheDocument();
  });
});

describe("Tienda", () => {
  it("dice cuánto falta y compra lo que alcanza", async () => {
    guardarToken("t");
    renderCon(<Tienda />);
    const u = userEvent.setup();
    const caro = await screen.findByRole("button", { name: "Zorro de brasas: te faltan 5520 monedas" });
    expect(caro).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("region", { name: "Mascotas" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Comprar Comida de mascota por 250 monedas" }));
    await waitFor(() => expect(screen.getAllByRole("status").some((s) => /Buena compra/.test(s.textContent ?? ""))).toBe(true));
  });
});
