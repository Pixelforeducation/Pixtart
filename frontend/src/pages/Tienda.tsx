import { useEffect, useState } from "react";
import type { ArticuloTienda, ClaseArticulo, Equipo, Estado, Ranura } from "../api";
import { nombreItem } from "../components/ItemIcono";
import { IconoEquipable } from "../components/juego/HeroeEquipado";
import { useApi, useEstadoJuego } from "../contexto";
import { Escena } from "../escenas";
import { Contador } from "../escenas/hud";
import { sonar } from "../escenas/sonido";
import { AnfitrionVisual, HeroeVisual, IconoUI, ItemVisual } from "../escenas/visuales";
import { mensajeError } from "../lib/validacion";

const RAREZA = { comun: "Común", rara: "Rara", legendaria: "Legendaria" } as const;

/** Clase del artículo: la que manda la API o, si falta, inferida por el prefijo del id. */
export function claseDe(a: Pick<ArticuloTienda, "item_id" | "clase">): ClaseArticulo {
  if (a.clase) return a.clase;
  const id = a.item_id;
  if (id.startsWith("mascota_")) return "mascota";
  if (id.startsWith("armadura_")) return "armadura";
  if (id.startsWith("arma_")) return "arma";
  if (id.startsWith("ropa_")) return "ropa";
  return "consumible";
}
const ES_EQUIPABLE = (c: ClaseArticulo): c is Ranura => c === "arma" || c === "armadura" || c === "ropa";
const SECCIONES: { clase: ClaseArticulo; titulo: string }[] = [
  { clase: "consumible", titulo: "Consumibles" },
  { clase: "mascota", titulo: "Mascotas" },
  { clase: "arma", titulo: "Armas" },
  { clase: "armadura", titulo: "Armaduras" },
  { clase: "ropa", titulo: "Ropa" },
];
const SIN_EQUIPO: Equipo = { arma: null, armadura: null, ropa: null };
const RANURAS: { r: Ranura; titulo: string }[] = [{ r: "arma", titulo: "Arma" }, { r: "armadura", titulo: "Armadura" }, { r: "ropa", titulo: "Ropa" }];

/** Héroe con lo equipado y sus tres ranuras (Tienda y Perfil). */
export function VistaEquipo({ estado, onQuitar }: { estado: Estado; onQuitar?: (r: Ranura) => void }) {
  const equipo = estado.equipo ?? SIN_EQUIPO;
  const tier = Math.max(1, ...Object.values(estado.tier_por_tema));
  return (
    <div className="vista-heroe">
      <HeroeVisual tier={tier} equipo={equipo} alt="Vista previa de tu héroe con lo equipado" escala={4} />
      <div className="slots-equipo" role="list" aria-label="Equipo puesto">
        {RANURAS.map(({ r, titulo }) => {
          const id = equipo[r];
          return (
            <div key={r} role="listitem" className={`slot-equipo ${id ? "" : "vacio"}`}>
              <span className="ranura">{titulo}</span>
              {id ? <IconoEquipable id={id} tam={40} /> : <span aria-hidden="true" style={{ height: 40 }} />}
              <span>{id ? nombreItem(id) : "Nada"}</span>
              {id && onQuitar && <button type="button" className="boton chico secundario" onClick={() => onQuitar(r)} aria-label={`Quitar ${nombreItem(id)}`}>Quitar</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Articulo({ a, monedas, recien, onComprar, posee, equipado, onEquipar, onQuitar }: {
  a: ArticuloTienda; monedas: number; recien: boolean; onComprar: () => void;
  posee?: boolean; equipado?: boolean; onEquipar?: () => void; onQuitar?: () => void;
}) {
  const falta = a.precio - monedas;
  if (posee) {
    return (
      <div className={`slot articulo ${a.rareza} ${recien ? "comprado" : ""}`}>
        <span className="rareza">{RAREZA[a.rareza]}</span>
        <ItemVisual id={a.item_id} />
        <strong>{a.nombre}</strong>
        {equipado ? <span className="equipado-chip">Equipado</span> : <span className="precio">Ya lo tienes</span>}
        {onEquipar && (equipado
          ? <button className="boton chico secundario" onClick={onQuitar} aria-label={`Quitar ${a.nombre}`}>Quitar</button>
          : <button className="boton chico verde" onClick={onEquipar} aria-label={`Equipar ${a.nombre}`}>Equipar</button>)}
      </div>
    );
  }
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
  const [filtro, setFiltro] = useState<ClaseArticulo | "todo">("todo");

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

  const cambiarEquipo = async (f: () => Promise<Estado>, ok: string) => {
    setError(null); setAviso(null);
    try {
      poner(await f());
      sonar("toque");
      setAviso(ok);
    } catch (e) {
      setError(mensajeError(e));
    }
  };
  const equipar = (a: ArticuloTienda) => cambiarEquipo(() => api.equipar(a.item_id), `Te pusiste: ${a.nombre}.`);
  const quitar = (r: Ranura, nombre?: string) => cambiarEquipo(() => api.desequipar(r), nombre ? `Te quitaste: ${nombre}.` : "Listo.");
  const poseidos = new Set((estado?.inventario ?? []).filter((i) => i.cantidad > 0).map((i) => i.item_id));
  if (estado?.mascota) poseidos.add(`mascota_${estado.mascota.especie}`);
  const equipo = estado?.equipo ?? SIN_EQUIPO;

  const monedas = estado?.monedas ?? 0;
  const lista = articulos ?? [];
  const esUnico = (a: ArticuloTienda) => claseDe(a) !== "consumible";
  const tiene = (a: ArticuloTienda) => esUnico(a) && poseidos.has(a.item_id);
  const todos = SECCIONES.map((s) => ({ ...s, items: lista.filter((a) => claseDe(a) === s.clase) })).filter((e) => e.items.length > 0);
  const estantes = todos.filter((e) => filtro === "todo" || e.clase === filtro);
  const comprables = lista.filter((a) => !tiene(a));
  const alcanza = comprables.filter((a) => a.precio <= monedas).length;
  const masBarato = comprables.filter((a) => a.precio > monedas).sort((x, y) => x.precio - y.precio)[0];
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
      {estado && (
        <section className="estante" aria-label="Tu equipo">
          <h2>Tu equipo</h2>
          <VistaEquipo estado={estado} onQuitar={(r) => quitar(r, equipo[r] ? nombreItem(equipo[r]!) : undefined)} />
          <p style={{ margin: "10px 0 0", fontSize: 15 }}>La armadura y la ropa son de adorno; cada arma tiene su propio ataque.</p>
        </section>
      )}
      {articulos && todos.length > 1 && (
        <nav className="pestanas-tienda" role="tablist" aria-label="Secciones de la tienda">
          {[{ clase: "todo" as const, titulo: "Todo" }, ...todos].map((s) => (
            <button key={s.clase} type="button" role="tab" aria-selected={filtro === s.clase}
              className={`boton chico ${filtro === s.clase ? "" : "secundario"}`} onClick={() => setFiltro(s.clase)}>
              {s.titulo}
            </button>
          ))}
        </nav>
      )}
      {!articulos ? <p className="placa">Cargando…</p> : estantes.map((e) => (
        <section key={e.titulo} className="estante" aria-label={e.titulo}>
          <h2>{e.titulo}</h2>
          <div className="rejilla">
            {e.items.map((a) => {
              const clase = claseDe(a);
              const eq = ES_EQUIPABLE(clase);
              return (
                <Articulo key={a.item_id + (recien?.id === a.item_id ? recien.n : "")} a={a} monedas={monedas}
                  recien={recien?.id === a.item_id} onComprar={() => comprar(a)}
                  posee={tiene(a)} equipado={eq && equipo[clase] === a.item_id}
                  onEquipar={eq ? () => equipar(a) : undefined} onQuitar={eq ? () => quitar(clase, a.nombre) : undefined} />
              );
            })}
          </div>
        </section>
      ))}
      <p className="placa nota-tienda">Los precios son altos a propósito: gana monedas jugando niveles y abriendo cofres.</p>
    </Escena>
  );
}
