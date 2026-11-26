import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { pistaDeRuta } from "../App";
import { crearMock } from "../api/mock";
import { guardarToken } from "../api/sesion";
import { compilarMelodia, midi, musica, PISTAS, VOLUMEN_MUSICA_DEF, type Pista } from "../escenas/musica";
import { musica as musicaFinal } from "../nivel-final/audio";
import { Ajustes } from "../pages/Ajustes";
import { renderCon } from "./utils";

describe("música de fondo", () => {
  it("activa por defecto y a volumen bajo", () => {
    expect(musica.activa()).toBe(true);
    expect(musica.volumen()).toBe(VOLUMEN_MUSICA_DEF);
    expect(VOLUMEN_MUSICA_DEF).toBeLessThanOrEqual(0.3);
  });

  it("cada pista es un bucle de 8 compases con notas válidas", () => {
    for (const p of Object.keys(PISTAS) as Pista[]) {
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
    expect(pistaDeRuta("/tienda")).toBe("mapa");
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
