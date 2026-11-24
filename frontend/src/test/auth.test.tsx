import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Login, Registro } from "../pages/Auth";
import { edad, esMayorDeEdad } from "../lib/validacion";
import { obtenerToken } from "../api/sesion";
import { renderCon } from "./utils";
import { crearMock } from "../api/mock";

const HOY = new Date(2026, 10, 24);

describe("validación de edad", () => {
  it("calcula la edad cumplida", () => {
    expect(edad("2008-11-24", HOY)).toBe(18);
    expect(edad("2008-11-25", HOY)).toBe(17);
    expect(esMayorDeEdad("2008-11-25", HOY)).toBe(false);
    expect(esMayorDeEdad("1990-01-01", HOY)).toBe(true);
    expect(esMayorDeEdad("no-fecha", HOY)).toBe(false);
  });
});

describe("Registro", () => {
  const llenar = async (fecha: string, conf = true) => {
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Correo"), "nueva@pixtart.mx");
    await u.type(screen.getByLabelText(/Contraseña/), "una-contrasena-larga");
    await u.type(screen.getByLabelText("Fecha de nacimiento"), fecha);
    if (conf) await u.click(screen.getByLabelText(/Confirmo que soy mayor/));
    await u.click(screen.getByRole("button", { name: "Crear cuenta" }));
  };

  it("rechaza a menores de 18 sin llamar a la API", async () => {
    const api = crearMock();
    const spy = vi.spyOn(api, "registro");
    renderCon(<Registro hoy={HOY} />, { api });
    await llenar("2010-05-01");
    expect(screen.getByText("Pixtart es solo para mayores de 18 años.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("exige contraseña de 10+ caracteres y la confirmación", async () => {
    renderCon(<Registro hoy={HOY} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/Contraseña/), "corta");
    await u.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(screen.getByText(/al menos 10 caracteres/)).toBeInTheDocument();
    expect(screen.getByText("Confirma que eres mayor de 18 años.")).toBeInTheDocument();
  });

  it("registra a un adulto con su zona horaria y entra", async () => {
    const api = crearMock();
    const spy = vi.spyOn(api, "registro");
    renderCon(<Registro hoy={HOY} />, { api, ruta: "/registro", patron: "/registro" });
    await llenar("1995-03-10");
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ correo: "nueva@pixtart.mx", fecha_nacimiento: "1995-03-10", zona_horaria: expect.any(String) }));
    expect(await screen.findByText("otra ruta")).toBeInTheDocument();
    expect(obtenerToken()).toContain("token-falso");
  });
});

describe("Login", () => {
  it("muestra el error del servidor", async () => {
    renderCon(<Login />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Correo"), "demo@pixtart.mx");
    await u.type(screen.getByLabelText("Contraseña"), "mala-contrasena");
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos.");
  });

  it("guarda el token al entrar", async () => {
    renderCon(<Login />, { ruta: "/entrar", patron: "/entrar" });
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Correo"), "demo@pixtart.mx");
    await u.type(screen.getByLabelText("Contraseña"), "contrasena123");
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("otra ruta")).toBeInTheDocument();
    expect(sessionStorage.getItem("pixtart.token")).toBe("token-falso-demo@pixtart.mx");
  });
});
