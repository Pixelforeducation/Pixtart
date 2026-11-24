import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorApi, type Estado } from "../api";
import { useApi, useEstadoJuego } from "../contexto";
import { Candado, Escudo, Moneda } from "../components/Iconos";
import { ItemIcono, nombreItem } from "../components/ItemIcono";
import { Mascota } from "../components/Mascota";
import { NOMBRES_TIER, Sprite, srcTier } from "../components/Sprite";
import { PALETAS, aplicarPaleta } from "../theme/paleta";
import { mensajeError } from "../lib/validacion";

const USABLES = new Set(["botiquin", "pocion_resurreccion", "comida", "escudo"]);
const nombreTier = (t: number) => NOMBRES_TIER[Math.max(0, Math.min(5, t - 1))];

export function Perfil() {
  const api = useApi();
  const { estado, poner, refrescar } = useEstadoJuego();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!estado) return <p>Cargando perfil…</p>;

  const accion = async (f: () => Promise<Estado>, ok: string) => {
    setError(null); setAviso(null);
    try { poner(await f()); setAviso(ok); } catch (e) { setError(mensajeError(e)); }
  };

  const elegirPaleta = async (id: string) => {
    setError(null);
    try {
      poner(await api.elegirPaleta(id));
    } catch (e) {
      // El contrato v0 aún no define este endpoint: si no existe, aplicamos la paleta solo en este dispositivo.
      if (e instanceof ErrorApi && (e.estado === 404 || e.estado === 405)) {
        poner({ ...estado, paleta_activa: id });
        aplicarPaleta(id);
      } else setError(mensajeError(e));
    }
  };

  const temas = Object.keys({ ...estado.xp_total_por_tema, ...estado.tier_por_tema });
  const tierMax = Math.max(1, ...Object.values(estado.tier_por_tema));

  return (
    <>
      <h1>Perfil</h1>
      <section className="panel centro" aria-label="Personaje">
        <Sprite src="/sprites/ogre-green.svg" alt={`Tu personaje con el atuendo ${nombreTier(tierMax)}`} className="personaje-grande" />
        <div className="fila" style={{ justifyContent: "center" }}>
          <Sprite src={srcTier(tierMax)} alt="" tam={48} />
          <p className="pix-font" style={{ fontSize: 11, margin: 0 }}>Atuendo: {nombreTier(tierMax)} (tier {tierMax})</p>
        </div>
        <div className="fila" style={{ justifyContent: "center", gap: 16 }}>
          <span className="chip"><Moneda /> {estado.monedas}</span>
          <span className="chip" title="Escudos de color"><Escudo /> {estado.escudos}/2</span>
          <span className="chip">Racha {estado.racha} días</span>
        </div>
      </section>

      <section className="panel oscuro" aria-labelledby="h-temas">
        <h2 id="h-temas" style={{ marginTop: 0 }}>Evolución por tema</h2>
        {temas.length === 0 ? <p>Juega un curso para empezar a evolucionar.</p> : (
          <ul>{temas.map((t) => (
            <li key={t}><strong>{t}</strong>: tier {estado.tier_por_tema[t] ?? 1} ({nombreTier(estado.tier_por_tema[t] ?? 1)}) · {estado.xp_total_por_tema[t] ?? 0} XP</li>
          ))}</ul>
        )}
      </section>

      <section className="panel" aria-labelledby="h-paletas">
        <h2 id="h-paletas" style={{ marginTop: 0 }}>Paleta de color</h2>
        <p>XP de color: <strong>{estado.xp_color}</strong> / 3000. Baja 50 por cada día sin jugar (los escudos lo evitan).</p>
        <div className="barra" aria-hidden="true"><span style={{ width: `${(estado.xp_color / 3000) * 100}%` }} /></div>
        <div className="paletas" style={{ marginTop: 12 }}>
          {PALETAS.map((p) => {
            const libre = estado.paletas_desbloqueadas.includes(p.id);
            const activa = estado.paleta_activa === p.id;
            return (
              <button key={p.id} type="button" className="paleta-btn" aria-pressed={activa} disabled={!libre}
                onClick={() => libre && !activa && elegirPaleta(p.id)}
                aria-label={libre ? `Paleta ${p.nombre}${activa ? " (activa)" : ""}` : `Paleta ${p.nombre}, bloqueada: requiere ${p.xp_color_min} de XP de color`}>
                <span className="muestras" aria-hidden="true">
                  {["fondo", "marco", "pasto2", "cielo", "moneda"].map((k) => <span key={k} style={{ background: p.colores[k] }} />)}
                </span>
                {p.nombre}
                <span style={{ display: "block", fontSize: 14 }}>
                  {libre ? (activa ? "Activa" : "Desbloqueada") : <><Candado tam={14} /> Requiere {p.xp_color_min} XP de color</>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel oscuro" aria-labelledby="h-mascota">
        <h2 id="h-mascota" style={{ marginTop: 0 }}>Mascota</h2>
        <Mascota mascota={estado.mascota} onRevive={refrescar} />
      </section>

      <section className="panel" aria-labelledby="h-inv">
        <div className="fila" style={{ justifyContent: "space-between" }}>
          <h2 id="h-inv" style={{ margin: 0 }}>Inventario</h2>
          <Link to="/tienda" className="boton chico secundario">Ir a la tienda</Link>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {aviso && <p className="exito" role="status">{aviso}</p>}
        {estado.inventario.length === 0 ? <p style={{ marginTop: 12 }}>Tu inventario está vacío.</p> : (
          <div className="rejilla" style={{ marginTop: 12 }}>
            {estado.inventario.map((it) => (
              <div key={it.item_id} className="slot">
                <ItemIcono id={it.item_id} />
                <span>{nombreItem(it.item_id)} ×{it.cantidad}</span>
                {USABLES.has(it.item_id) && (
                  <button className="boton chico" onClick={() => accion(() => api.usarItem(it.item_id), `Usaste: ${nombreItem(it.item_id)}.`)}>Usar</button>
                )}
                {it.item_id.startsWith("mascota_") && (
                  <button className="boton chico" onClick={() => accion(() => api.equiparMascota(it.item_id), "Mascota equipada.")}>Equipar</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
