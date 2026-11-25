/** Cortinilla pixel entre niveles: bloques que cubren la pantalla en diagonal y luego se retiran. */
const COLS = 8;
const FILAS = 12;

export type EstadoCortina = "cubrir" | "descubrir" | null;

export function Cortinilla({ estado }: { estado: EstadoCortina }) {
  if (!estado) return null;
  return (
    <div className={`jg-cortina jg-cortina-${estado}`} aria-hidden="true" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
      {Array.from({ length: COLS * FILAS }, (_, i) => {
        const x = i % COLS, y = Math.floor(i / COLS);
        return <span key={i} style={{ ["--d" as string]: `${(x + y) * 18}ms` }} />;
      })}
    </div>
  );
}
