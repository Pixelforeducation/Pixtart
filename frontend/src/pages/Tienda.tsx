import { useEffect, useState } from "react";
import type { ArticuloTienda } from "../api";
import { useApi, useEstadoJuego } from "../contexto";
import { Escena } from "../escenas";
import { Contador } from "../escenas/hud";
import { sonar } from "../escenas/sonido";
import { AnfitrionVisual, IconoUI, ItemVisual } from "../escenas/visuales";
import { mensajeError } from "../lib/validacion";

const RAREZA = { comun: "Común", rara: "Rara", legendaria: "Legendaria" } as const;

function Articulo({ a, monedas, recien, onComprar }: { a: ArticuloTienda; monedas: number; recien: boolean; onComprar: () => void }) {
  const falta = a.precio - monedas;
  return (
    <div className={`slot articulo ${a.rareza} ${recien ? "comprado" : ""}`}>
      <span className="rareza">{RAREZA[a.rareza]}</span>
      <ItemVisual id={a.item_id} />
      <strong>{a.nombre}</strong>
      <span className="precio"><IconoUI id="moneda" tam={20} /> {a.precio.toLocaleString("es-MX")}</span>
      {falta > 0 && (
        <>
          <div className="barra" aria-hidden="true"><span style={{ width: `${Math.max(3, (monedas / a.precio) * 100)}%` }} /></div>
          <span className="falta">Te faltan {falta.toLocaleString("es-MX")}</span>
        </>
      )}
      <button className={`boton chico ${falta > 0 ? "secundario" : "verde"}`} aria-disabled={falta > 0}
        onClick={() => (falta > 0 ? sonar("sin-dinero") : onComprar())}
        aria-label={falta > 0 ? `${a.nombre}: te faltan ${falta} monedas` : `Comprar ${a.nombre} por ${a.precio} monedas`}>
        {falta > 0 ? "Ahorra" : "Comprar"}
      </button>
      {recien && <span className="monedas-vuelan" aria-hidden="true">−{a.precio}</span>}
    </div>
  );
}

export function Tienda() {
  const api = useApi();
  const { estado, poner } = useEstadoJuego();
  const [articulos, setArticulos] = useState<ArticuloTienda[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recien, setRecien] = useState<{ id: string; n: number } | null>(null);

  useEffect(() => { api.tienda().then(setArticulos).catch((e) => setError(mensajeError(e))); }, [api]);

  const comprar = async (a: ArticuloTienda) => {
    setError(null); setAviso(null);
    try {
      const r = await api.comprar(a.item_id);
      if (estado) poner({ ...estado, monedas: r.monedas, inventario: r.inventario, escudos: a.item_id === "escudo" ? Math.min(2, estado.escudos + 1) : estado.escudos });
      sonar("compra");
      setRecien((x) => ({ id: a.item_id, n: (x?.n ?? 0) + 1 }));
      setAviso(`Compraste: ${a.nombre}.`);
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const monedas = estado?.monedas ?? 0;
  const lista = articulos ?? [];
  const estantes = [
    { titulo: "Consumibles", items: lista.filter((a) => !a.item_id.startsWith("mascota_")) },
    { titulo: "Mascotas", items: lista.filter((a) => a.item_id.startsWith("mascota_")) },
  ].filter((e) => e.items.length > 0);
  const alcanza = lista.filter((a) => a.precio <= monedas).length;
  const masBarato = lista.filter((a) => a.precio > monedas).sort((x, y) => x.precio - y.precio)[0];
  const dice = aviso ? "¡Buena compra! Vuelve cuando quieras."
    : !articulos ? "Un momento, acomodo los estantes…"
    : alcanza > 0 ? `¡Bienvenido! Te alcanza para ${alcanza} ${alcanza === 1 ? "cosa" : "cosas"}.`
    : masBarato ? `Te faltan ${masBarato.precio - monedas} monedas para «${masBarato.nombre}». ¡Juega un nivel!`
    : "¡Bienvenido!";

  return (
    <Escena bioma="tienda">
      <div className="titulo-pantalla">
        <h1>Tienda</h1>
        <span className="hud-chip oro grande-chip" aria-label={`${monedas} monedas`}><IconoUI id="moneda" /> <Contador valor={monedas} /></span>
      </div>
      <div className="mostrador">
        <AnfitrionVisual id="alchemist" alt="Tendera" className="tendero" />
        <p className="globo" role="status">{dice}</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!articulos ? <p className="placa">Cargando…</p> : estantes.map((e) => (
        <section key={e.titulo} className="estante" aria-label={e.titulo}>
          <h2>{e.titulo}</h2>
          <div className="rejilla">
            {e.items.map((a) => (
              <Articulo key={a.item_id + (recien?.id === a.item_id ? recien.n : "")} a={a} monedas={monedas}
                recien={recien?.id === a.item_id} onComprar={() => comprar(a)} />
            ))}
          </div>
        </section>
      ))}
      <p className="placa nota-tienda">Los precios son altos a propósito: gana monedas jugando niveles y abriendo cofres.</p>
    </Escena>
  );
}
