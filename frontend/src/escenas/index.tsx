/**
 * CONTRATO DE ESCENAS (dueño: agente `escenas`). Fondos animados por capas (parallax),
 * detrás del contenido. Los demás agentes solo IMPORTAN de aquí.
 * Implementación mínima: el agente `escenas` la reemplaza manteniendo estas firmas.
 */
import type { ReactNode } from "react";

export type Bioma =
  | "pradera" // inicio y camino
  | "bosque"
  | "biblioteca" // aula / revisión
  | "cueva"
  | "castillo" // nivel final
  | "noche"
  | "tienda"
  | "perfil";

export interface EscenaProps {
  bioma: Bioma;
  /** 0..1: intensidad de animación (viento, partículas). 0 respeta reduced-motion. */
  intensidad?: number;
  children?: ReactNode;
  className?: string;
}

export function Escena({ bioma, children, className }: EscenaProps) {
  return (
    <div className={`escena escena-${bioma} ${className ?? ""}`} data-bioma={bioma}>
      <div className="escena-contenido">{children}</div>
    </div>
  );
}
