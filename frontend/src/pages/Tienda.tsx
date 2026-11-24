import { useEffect, useState } from "react";
import type { ArticuloTienda } from "../api";
import { useApi, useEstadoJuego } from "../contexto";
import { Moneda } from "../components/Iconos";
import { ItemIcono } from "../components/ItemIcono";
import { mensajeError } from "../lib/validacion";

const RAREZA = { comun: "Común", rara: "Rara", legendaria: "Legendaria" } as const;

export function Tienda() {
  const api = useApi();
  const { estado, poner } = useEstadoJuego();
  const [articulos, setArticulos] = useState<ArticuloTienda[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => { api.tienda().then(setArticulos).catch((e) => setError(mensajeError(e))); }, [api]);

  const comprar = async (a: ArticuloTienda) => {
    setError(null); setAviso(null);
    try {
      const r = await api.comprar(a.item_id);
      if (estado) poner({ ...estado, monedas: r.monedas, inventario: r.inventario, escudos: a.item_id === "escudo" ? Math.min(2, estado.escudos + 1) : estado.escudos });
      setAviso(`Compraste: ${a.nombre}.`);
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const monedas = estado?.monedas ?? 0;
  return (
    <>
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Tienda</h1>
        <span className="chip"><Moneda /> {monedas}</span>
      </div>
      <p style={{ marginTop: 12 }}>Los precios son altos a propósito: gana monedas jugando niveles y abriendo cofres.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="exito" role="status">{aviso}</p>}
      {!articulos ? <p>Cargando…</p> : (
        <div className="rejilla">
          {articulos.map((a) => {
            const falta = a.precio - monedas;
            return (
              <div key={a.item_id} className={`slot ${a.rareza}`}>
                <ItemIcono id={a.item_id} />
                <strong>{a.nombre}</strong>
                <span style={{ fontSize: 16 }}>{RAREZA[a.rareza]}</span>
                <span className="chip"><Moneda /> {a.precio}</span>
                <button className="boton chico" disabled={falta > 0} onClick={() => comprar(a)}
                  aria-label={falta > 0 ? `${a.nombre}: te faltan ${falta} monedas` : `Comprar ${a.nombre} por ${a.precio} monedas`}>
                  {falta > 0 ? `Faltan ${falta}` : "Comprar"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
