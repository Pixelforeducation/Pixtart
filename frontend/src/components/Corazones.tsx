import { Corazon } from "./Iconos";

export function Corazones({ vidas, max = 10 }: { vidas: number; max?: number }) {
  return (
    <span className="corazones" role="img" aria-label={`Vidas: ${vidas} de ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <Corazon key={i} lleno={i < vidas} />
      ))}
    </span>
  );
}
