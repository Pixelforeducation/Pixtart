import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { crearMock } from "../api/mock";
import { guardarToken } from "../api/sesion";
import { Perfil } from "../pages/Perfil";
import { renderCon } from "./utils";

describe("Catálogo de jefes finales", () => {
  it("muestra desbloqueados a color y los demás en gris con candado", async () => {
    guardarToken("t");
    const api = crearMock();
    vi.spyOn(api, "listarCursos").mockResolvedValue([
      { id: 1, titulo: "Curso", tema: "Biología", estado: "publicado", creado: "2026-01-01" },
    ]);
    vi.spyOn(api, "camino").mockResolvedValue({
      secciones: [
        { id: 1, titulo: "Primera", niveles: [{ id: 11, titulo: "Jefe", tipo: "final", estado: "disponible" }] },
        { id: 2, titulo: "Segunda", niveles: [{ id: 22, titulo: "Jefe", tipo: "final", estado: "actual" }] },
        { id: 3, titulo: "Última", niveles: [{ id: 33, titulo: "Jefe", tipo: "final", estado: "bloqueado" }] },
      ],
    });
    renderCon(<Perfil />, { api, ruta: "/perfil", patron: "/perfil" });

    expect(await screen.findByRole("listitem", { name: "Coloso esqueleto, desbloqueado" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Demonio mayor, desbloqueado" })).toBeInTheDocument();
    const bloqueado = screen.getByRole("listitem", { name: "Caballero negro, bloqueado" });
    expect(bloqueado.querySelector(".perfil-jefe-sprite")).toHaveClass("en-gris");
    expect(bloqueado.querySelector(".perfil-jefe-candado")).toBeInTheDocument();
  });
});
