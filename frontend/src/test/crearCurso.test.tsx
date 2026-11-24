import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { aConfig, CrearCurso, validarCurso, type FormCurso } from "../pages/CrearCurso";
import { crearMock } from "../api/mock";
import { agregarPdfs, MAX_PDF } from "../lib/pdfs";
import { renderCon } from "./utils";

const pdf = (nombre = "apuntes.pdf", contenido = "%PDF-1.4") => new File([contenido], nombre, { type: "application/pdf" });
/** PDF que dice pesar `bytes` sin reservar esa memoria. */
const pdfDe = (nombre: string, bytes: number) => {
  const f = pdf(nombre);
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};
const zona = () => screen.getByLabelText(/^PDFs \(hasta 10/);
const base: FormCurso = { titulo: "", num_preguntas: 20, dificultad: 3, tipos: ["multiple_choice"], minutos: {}, repaso: "leitner", instrucciones: "" };

describe("validarCurso / aConfig", () => {
  it("valida PDF, número de preguntas, tipos y repaso", () => {
    expect(validarCurso([], base).pdf).toBe("Elige al menos un PDF.");
    expect(validarCurso([new File(["x"], "a.txt", { type: "text/plain" })], base).pdf).toMatch(/no es un PDF/);
    expect(validarCurso([pdf()], { ...base, num_preguntas: 3 }).num_preguntas).toBeDefined();
    expect(validarCurso([pdf()], { ...base, tipos: [] }).tipos).toBeDefined();
    expect(validarCurso([pdf()], { ...base, repaso: "" }).repaso).toBeDefined();
    expect(validarCurso([pdf()], base)).toEqual({});
    expect(validarCurso([pdf("a.pdf"), pdf("b.pdf")], base)).toEqual({});
    const muchos = Array.from({ length: 11 }, (_, i) => pdf(`p${i}.pdf`));
    expect(validarCurso(muchos, base).pdf).toMatch(/máximo 10/);
    expect(validarCurso([pdfDe("a.pdf", 24e6), pdfDe("b.pdf", 24e6), pdfDe("c.pdf", 24e6), pdfDe("d.pdf", 24e6), pdfDe("e.pdf", 24e6)], base).pdf).toMatch(/100 MB/);
  });
  it("agregarPdfs aplica los límites y explica cada rechazo", () => {
    const a = pdf("a.pdf");
    const r = agregarPdfs([a], [a, pdfDe("grande.pdf", MAX_PDF + 1), new File(["x"], "nota.txt"), pdf("b.pdf")]);
    expect(r.archivos.map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(r.rechazos).toEqual([
      "«a.pdf» ya está en la lista.",
      "«grande.pdf» pesa más de 25 MB (25.0 MB), el máximo por archivo.",
      "«nota.txt» no es un PDF.",
    ]);
    const diez = Array.from({ length: 10 }, (_, i) => pdf(`p${i}.pdf`));
    expect(agregarPdfs(diez, [pdf("once.pdf")]).rechazos[0]).toMatch(/máximo es 10/);
    const casi = [pdfDe("a.pdf", 24e6), pdfDe("b.pdf", 24e6), pdfDe("c.pdf", 24e6), pdfDe("d.pdf", 24e6)];
    expect(agregarPdfs(casi, [pdfDe("e.pdf", 20e6)]).rechazos[0]).toMatch(/100 MB/);
  });
  it("convierte minutos a segundos en tiempos_por_tipo", () => {
    const c = aConfig({ ...base, tipos: ["multiple_choice", "proof"], minutos: { proof: "15", math_problem: "15" } });
    expect(c.tiempos_por_tipo).toEqual({ proof: 900 });
    expect(c).not.toHaveProperty("titulo");
  });
});

describe("CrearCurso", () => {
  it("sin key muestra aviso con enlace a Ajustes y deshabilita crear", async () => {
    renderCon(<CrearCurso />, { op: { conKey: false } });
    expect(await screen.findByRole("link", { name: /Ajustes/ })).toHaveAttribute("href", "/ajustes");
    expect(screen.getByRole("button", { name: "Crear curso" })).toBeDisabled();
  });

  it("pide elegir repaso y envía la config completa", async () => {
    const api = crearMock();
    const spy = vi.spyOn(api, "crearCurso");
    renderCon(<CrearCurso />, { api, ruta: "/crear", patron: "/crear" });
    const u = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear curso" })).toBeEnabled());
    await u.upload(zona(), pdf());
    await u.click(screen.getByLabelText("Demostración"));
    expect(screen.getByLabelText("Minutos para Demostración")).toHaveValue(15);
    await u.click(screen.getByRole("button", { name: "Crear curso" }));
    expect(screen.getByText("Elige cómo quieres repasar.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    await u.click(screen.getByLabelText(/^FSRS/));
    await u.type(screen.getByLabelText(/Instrucciones/), "Solo capítulo 2");
    await u.click(screen.getByRole("button", { name: "Crear curso" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [archivos, config] = spy.mock.calls[0];
    expect(archivos.map((a) => a.name)).toEqual(["apuntes.pdf"]);
    expect(config).toMatchObject({ num_preguntas: 20, dificultad: 3, repaso: "fsrs", instrucciones: "Solo capítulo 2", tiempos_por_tipo: { proof: 900 } });
    expect(config.tipos).toEqual(["multiple_choice", "true_false", "proof"]);
  });

  it("agrega y quita varios PDFs, rechaza uno demasiado grande y envía todos", async () => {
    const api = crearMock();
    const spy = vi.spyOn(api, "crearCurso");
    renderCon(<CrearCurso />, { api, ruta: "/crear", patron: "/crear" });
    const u = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear curso" })).toBeEnabled());

    await u.upload(zona(), [pdf("algebra.pdf"), pdf("regex.pdf", "%PDF-1.4 regex"), pdf("grafos.pdf")]);
    const lista = screen.getByRole("list", { name: "PDFs elegidos" });
    expect(within(lista).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("algebra.pdf"), expect.stringContaining("regex.pdf"), expect.stringContaining("grafos.pdf"),
    ]);
    expect(within(lista).getByText("regex.pdf").parentElement).toHaveTextContent("(1 KB)");
    expect(screen.getByText(/3 PDFs elegidos/)).toBeInTheDocument();

    // uno demasiado grande: se rechaza con un mensaje que lo nombra; los demás se quedan
    await u.upload(zona(), pdfDe("enorme.pdf", 30 * 1024 * 1024));
    expect(screen.getByRole("alert")).toHaveTextContent("«enorme.pdf» pesa más de 25 MB (30.0 MB), el máximo por archivo.");
    expect(within(lista).queryByText("enorme.pdf")).not.toBeInTheDocument();

    // quitar con teclado: el foco vuelve al botón de añadir
    within(lista).getByRole("button", { name: "Quitar grafos.pdf" }).focus();
    await u.keyboard("{Enter}");
    expect(screen.queryByText("grafos.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir más PDFs" })).toHaveFocus();
    expect(screen.getByText(/2 PDFs elegidos/)).toBeInTheDocument();

    await u.click(screen.getByLabelText(/^Leitner/));
    await u.click(screen.getByRole("button", { name: "Crear curso" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0].map((f) => f.name)).toEqual(["algebra.pdf", "regex.pdf"]);
  });

  it("quitar todos vuelve a pedir un PDF", async () => {
    renderCon(<CrearCurso />, { ruta: "/crear", patron: "/crear" });
    const u = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear curso" })).toBeEnabled());
    await u.upload(zona(), [pdf("a.pdf")]);
    await u.click(screen.getByRole("button", { name: "Quitar a.pdf" }));
    await u.click(screen.getByLabelText(/^Leitner/));
    await u.click(screen.getByRole("button", { name: "Crear curso" }));
    expect(screen.getByText("Elige al menos un PDF.")).toBeInTheDocument();
  });
});

describe("cliente HTTP", () => {
  it("envía cada PDF con el campo pdf repetido", async () => {
    const { apiHttp } = await import("../api/cliente");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ curso_id: 1, trabajo_id: 2 }), { status: 202 }),
    );
    await apiHttp.crearCurso([pdf("a.pdf"), pdf("b.pdf", "otro")], aConfig(base));
    const fd = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(fd.getAll("pdf").map((f) => (f as File).name)).toEqual(["a.pdf", "b.pdf"]);
    expect(JSON.parse(fd.get("config") as string)).toMatchObject({ repaso: "leitner" });
    fetchSpy.mockRestore();
  });
});
