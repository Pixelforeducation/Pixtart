import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { biomaDeNivelRuta, pistaDeRuta } from "../App";
import { BIOMAS, biomaDeCurso } from "../escenas";
import { crearMock } from "../api/mock";
import { guardarToken } from "../api/sesion";
import { compilarMelodia, golpeDe, midi, musica, PISTAS, resolverPista, TEMAS, VOLUMEN_MUSICA_DEF } from "../escenas/musica";
import { musica as musicaFinal } from "../nivel-final/audio";
import { Ajustes } from "../pages/Ajustes";
import { Inicio } from "../pages/Inicio";
import { biomaPara, elegirAnfitrion } from "../pages/Jugar";
import { renderCon } from "./utils";

describe("música de fondo", () => {
  it("activa por defecto y a volumen bajo", () => {
    expect(musica.activa()).toBe(true);
    expect(musica.volumen()).toBe(VOLUMEN_MUSICA_DEF);
    expect(VOLUMEN_MUSICA_DEF).toBeLessThanOrEqual(0.3);
  });

  it("cada pista es un bucle de 8 compases con notas válidas", () => {
    for (const p of TEMAS) {
      const fichas = PISTAS[p].melodia.trim().split(/\s+/);
      expect(fichas, p).toHaveLength(64);
      for (const f of fichas) if (f !== "." && f !== "-") expect(midi(f), `${p}: ${f}`).not.toBeNull();
      expect(PISTAS[p].raices.split(" ").every((r) => midi(r) !== null)).toBe(true);
      expect(PISTAS[p].bajo).toHaveLength(8);
      expect(PISTAS[p].bateria).toHaveLength(8);
    }
    expect(midi("C4")).toBe(60);
    expect(midi("Bb1")).toBe(34);
    expect(compilarMelodia("C5 - - . D5 -")).toEqual([{ n: 72, pasos: 3 }, null, null, null, { n: 74, pasos: 2 }, null]);
  });

  it("guarda interruptor y volumen, y nunca lanza sin Web Audio", () => {
    expect(() => musica.reproducir("nivel")).not.toThrow();
    expect(musica.pista()).toBe("nivel");
    musica.setActiva(false);
    expect(localStorage.getItem("pixtart:musica")).toBe("off");
    musica.setVolumen(3);
    expect(musica.volumen()).toBe(1);
    expect(localStorage.getItem("pixtart:musica:vol")).toBe("1");
    musica.setVolumen(VOLUMEN_MUSICA_DEF);
    musica.setActiva(true);
    musica.detener();
    expect(musica.pista()).toBeNull();
  });

  it("elige la pista por ruta y el nivel final no abre un segundo bucle", () => {
    expect(pistaDeRuta("/")).toBe("mapa");
    expect(pistaDeRuta("/cursos/1/revisar")).toBe("mapa");
    expect(pistaDeRuta("/tienda")).toBe("tienda");
    expect(pistaDeRuta("/perfil")).toBe("perfil");
    expect(pistaDeRuta("/jugar/100")).toBe("nivel");
    expect(pistaDeRuta("/final/demo")).toBe("final");
    const furia = vi.spyOn(musica, "setFuria");
    musicaFinal(true, true);
    expect(furia).toHaveBeenLastCalledWith(true);
    musicaFinal(false);
    expect(furia).toHaveBeenLastCalledWith(false);
    furia.mockRestore();
  });
});

describe("una pista por bioma", () => {
  it("cada bioma (y el jefe) tiene su propia pista, distinta de las demás", () => {
    for (const b of BIOMAS) expect(PISTAS[b], b).toBeDefined();
    expect(TEMAS).toContain("final");
    const firmas = TEMAS.map((t) => `${PISTAS[t].melodia.trim().split(/\s+/).slice(0, 8).join(" ")}|${PISTAS[t].bpm}`);
    expect(new Set(firmas).size).toBe(TEMAS.length);
    expect(new Set(TEMAS.map((t) => PISTAS[t].bpm)).size).toBeGreaterThanOrEqual(7);
    expect(new Set(TEMAS.map((t) => PISTAS[t].raices.split(" ")[0])).size).toBeGreaterThanOrEqual(6);
    expect(PISTAS.cueva.eco?.fb).toBeGreaterThan(0.3); // la cueva resuena
    expect(PISTAS.bosque.timbre.vibrato).toBeGreaterThan(0); // flauta
    expect(PISTAS.bosque.arpegio).toHaveLength(8);
    for (const t of TEMAS) if (PISTAS[t].arpegio) expect(PISTAS[t].arpegio, t).toHaveLength(8);
  });

  it("'mapa' y 'nivel' siguen al bioma fijado; un id de bioma suena tal cual", () => {
    expect(resolverPista("mapa", { mapa: "bosque", nivel: "cueva" })).toEqual({ tema: "bosque", nivel: false });
    expect(resolverPista("nivel", { mapa: "bosque", nivel: "cueva" })).toEqual({ tema: "cueva", nivel: true });
    expect(resolverPista("final")).toEqual({ tema: "final", nivel: false });
    expect(resolverPista("tienda")).toEqual({ tema: "tienda", nivel: false });
    expect(golpeDe("k.h.", 1, false)).toBe(".");
    expect(golpeDe("k.h.", 1, true)).toBe("h");

    musica.setBioma("noche");
    musica.setBioma("biblioteca", "nivel");
    musica.reproducir("mapa");
    expect(musica.tema()).toBe("noche");
    musica.reproducir("nivel");
    expect(musica.pista()).toBe("nivel");
    expect(musica.tema()).toBe("biblioteca");
    musica.setBioma("cueva", "nivel"); // cambia en caliente
    expect(musica.tema()).toBe("cueva");
    musica.reproducirBioma("bosque");
    expect(musica.pista()).toBe("mapa");
    expect(musica.tema()).toBe("bosque");
    musica.reproducir("perfil");
    expect(musica.tema()).toBe("perfil");
    expect(musica.bioma()).toBe("bosque");
    musica.detener();
    expect(musica.tema()).toBeNull();
    musica.setBioma("pradera");
    musica.setBioma("pradera", "nivel");
  });

  it("el bioma del nivel por ruta es el mismo fondo que pinta Jugar", () => {
    for (const id of ["100", "101", "abc", "7"]) expect(biomaDeNivelRuta(`/jugar/${id}`)).toBe(biomaPara(elegirAnfitrion(id), id));
    expect(biomaDeNivelRuta("/tienda")).toBeNull();
  });
});

describe("Inicio: botón de música", () => {
  it("quita y pone la música, sincronizado con Ajustes, y fija el bioma del curso", async () => {
    guardarToken("t");
    const api = crearMock();
    const cursos = await api.listarCursos();
    renderCon(<Inicio />, { api, ruta: "/", patron: "/" });
    const u = userEvent.setup();
    const btn = await screen.findByRole("button", { name: /Música/ });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    await u.click(btn);
    expect(musica.activa()).toBe(false);
    expect(btn).toHaveAttribute("aria-pressed", "false");
    act(() => musica.setActiva(true)); // p. ej. desde Ajustes
    await waitFor(() => expect(btn).toHaveAttribute("aria-pressed", "true"));
    const primero = cursos.find((c) => c.estado === "publicado");
    await waitFor(() => expect(musica.bioma()).toBe(biomaDeCurso(primero ?? null)));
  });
});

describe("Ajustes: música y mínimo para pasar", () => {
  it("muestra los controles de música y guarda el mínimo en el servidor", async () => {
    guardarToken("t");
    const api = crearMock();
    const spy = vi.spyOn(api, "guardarAjustesJuego");
    renderCon(<Ajustes />, { api });
    const u = userEvent.setup();
    expect(screen.getByLabelText(/Música de fondo/)).toBeChecked();
    expect(screen.getByLabelText("Volumen de la música")).toHaveValue("25");

    const sel = screen.getByLabelText("Porcentaje de aciertos");
    await waitFor(() => expect(sel).toBeEnabled());
    expect(sel).toHaveValue("60");
    expect(screen.getAllByRole("option")).toHaveLength(11);
    await u.selectOptions(sel, "80");
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ minimo_aprobar: 80 }));
    expect(await screen.findByText(/necesitas 80 %/)).toBeInTheDocument();
    expect(sel).toHaveValue("80");

    await u.click(screen.getByLabelText(/Música de fondo/));
    expect(musica.activa()).toBe(false);
    expect(screen.getByLabelText("Volumen de la música")).toBeDisabled();
    musica.setActiva(true);
  });
});
