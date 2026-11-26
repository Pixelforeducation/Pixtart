import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Temporizador } from "../components/Temporizador";

describe("Temporizador", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("tras agotarse una pregunta, la siguiente no se da por perdida al instante", () => {
    const agotado = vi.fn();
    const { rerender } = render(<Temporizador segundos={2} clave="a" onAgotado={agotado} />);
    act(() => { vi.advanceTimersByTime(2500); });
    expect(agotado).toHaveBeenCalledTimes(1);
    // Feedback de la respuesta: el reloj se congela; luego llega la siguiente pregunta.
    rerender(<Temporizador segundos={2} clave="a" activo={false} onAgotado={agotado} />);
    // Siguiente pregunta (mismo componente, otra clave): no debe disparar onAgotado al montar.
    rerender(<Temporizador segundos={30} clave="b" onAgotado={agotado} />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(agotado).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(agotado).toHaveBeenCalledTimes(2);
  });

  it("la barra usa el total cuando se retoma con menos tiempo", () => {
    const { container } = render(<Temporizador segundos={10} total={40} clave="x" activo={false} onAgotado={() => {}} />);
    const barra = container.querySelector(".jg-reloj-barra > span") as HTMLElement;
    expect(barra.style.width).toBe("25%");
  });
});
