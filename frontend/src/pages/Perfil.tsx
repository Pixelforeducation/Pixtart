import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorApi, type Equipo, type Estado, type EtapaMascota, type Ranura } from "../api";
import { useApi, useEstadoJuego } from "../contexto";
import { Sprite } from "../arte";
import { Candado, Escudo } from "../components/Iconos";
import { nombreItem } from "../components/ItemIcono";
import { BarraEvolucion, Mascota } from "../components/Mascota";
import { esEquipable } from "../components/juego/HeroeEquipado";
import { NOMBRES_TIER } from "../components/Sprite";
import { Escena } from "../escenas";
import { Contador, Llama } from "../escenas/hud";
import { sonar } from "../escenas/sonido";
import { HeroeVisual, IconoUI, ItemVisual, MascotaVisual } from "../escenas/visuales";
import { PALETAS, aplicarPaleta } from "../theme/paleta";
import { mensajeError } from "../lib/validacion";
import { JEFES, JEFE_LEGENDARIO, monstruoPara } from "../nivel-final/sprites";
import { VistaEquipo } from "./Tienda";

const USABLES = new Set(["botiquin", "pocion_resurreccion", "comida", "escudo"]);
const JEFES_FINALES = [...JEFES, JEFE_LEGENDARIO];
const nombreTier = (t: number) => NOMBRES_TIER[Math.max(0, Math.min(5, t - 1))];
const RAREZA_EQUIPABLE: Record<string, "comun" | "rara" | "legendaria"> = {
  arma_baculo: "rara", arma_martillo: "rara", arma_katana: "legendaria",
  armadura_malla: "rara", armadura_placas: "legendaria", ropa_traje_mago: "rara", ropa_manto_real: "legendaria",
};
const rarezaDe = (id: string) =>
  RAREZA_EQUIPABLE[id] ?? (esEquipable(id) ? "comun" : id.startsWith("mascota_") || id === "pocion_resurreccion" ? "rara" : "comun");
const ranuraDe = (id: string): Ranura | null =>
  id.startsWith("armadura_") ? "armadura" : id.startsWith("arma_") ? "arma" : id.startsWith("ropa_") ? "ropa" : null;
const SIN_EQUIPO: Equipo = { arma: null, armadura: null, ropa: null };

/** Evolución de cada mascota poseída (la equipada usa sus datos en vivo de `estado.mascota`). */
function EvolucionMascotas({ estado }: { estado: Estado }) {
  const evo = { ...(estado.evoluciones_mascotas ?? {}) };
  const puestaM = estado.mascota;
  if (puestaM && puestaM.xp !== undefined) evo[`mascota_${puestaM.especie}`] = { xp: puestaM.xp, etapa: puestaM.etapa ?? 1, xp_siguiente: puestaM.xp_siguiente ?? null };
  const ids = Object.keys(evo);
  if (ids.length === 0) return null;
  return (
    <ul className="evo-mascotas" aria-label="Evolución de tus mascotas">
      {ids.map((id) => {
        const e = evo[id];
        const especie = id.replace(/^mascota_/, "");
        const etapa = (e.etapa ?? 1) as EtapaMascota;
        const puesta = puestaM?.especie === especie;
        return (
          <li key={id} className="evo-mascota">
            <span className="retrato"><MascotaVisual especie={especie} etapa={etapa} alt="" /></span>
            <div className="datos">
              <strong>{nombreItem(id).replace(/^Mascota: /, "")}</strong>
              <span className="etapas" aria-hidden="true">{[1, 2, 3].map((n) => <span key={n} className={n <= etapa ? "on" : ""} />)}</span>
              {puesta && <span className="equipado-chip" style={{ marginLeft: 8 }}>Contigo</span>}
              <BarraEvolucion xp={e.xp} etapa={etapa} xpSiguiente={e.xp_siguiente} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Escalera de evolución: los 6 atuendos; los futuros, como silueta con candado. */
function Evolucion({ tier }: { tier: number }) {
  return (
    <ol className="evolucion" aria-label={`Evolución: tier ${tier} de 6`}>
      {NOMBRES_TIER.map((nombre, i) => {
        const t = i + 1;
        const estado = t < tier ? "pasado" : t === tier ? "actual" : "futuro";
        return (
          <li key={nombre} className={`evo ${estado}`} aria-current={t === tier ? "step" : undefined}>
            <span className="evo-retrato"><HeroeVisual tier={t} alt="" /></span>
            <span className="evo-nombre">{t > tier ? "???" : nombre}</span>
            {t > tier && <span className="evo-candado" aria-hidden="true"><Candado tam={14} /></span>}
          </li>
        );
      })}
    </ol>
  );
}

export function Perfil() {
  const api = useApi();
  const { estado, poner, refrescar } = useEstadoJuego();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [jefesDesbloqueados, setJefesDesbloqueados] = useState<Set<string> | null>(null);
  const [errorJefes, setErrorJefes] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const cargarJefes = async () => {
      try {
        const cursos = (await api.listarCursos()).filter((curso) => curso.estado === "publicado");
        const caminos = await Promise.all(cursos.map((curso) => api.camino(curso.id)));
        const desbloqueados = new Set<string>();
        for (const camino of caminos) {
          camino.secciones.forEach((seccion, indice) => {
            const jefeDisponible = seccion.niveles.some(
              (nivel) => nivel.tipo === "final" && nivel.estado !== "bloqueado",
            );
            if (jefeDisponible) {
              const esUltima = indice === camino.secciones.length - 1;
              desbloqueados.add(monstruoPara("jefe", 0, indice, esUltima).id);
            }
          });
        }
        if (vivo) setJefesDesbloqueados(desbloqueados);
      } catch (e) {
        if (vivo) setErrorJefes(mensajeError(e));
      }
    };
    void cargarJefes();
    return () => { vivo = false; };
  }, [api]);

  if (!estado) return <Escena bioma="perfil"><p className="placa">Cargando perfil…</p></Escena>;

  const accion = async (f: () => Promise<Estado>, ok: string) => {
    setError(null); setAviso(null);
    sonar("toque");
    try { poner(await f()); setAviso(ok); } catch (e) { setError(mensajeError(e)); }
  };

  const elegirPaleta = async (id: string) => {
    setError(null);
    sonar("toque");
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
  const xpMax = Math.max(1, ...Object.values(estado.xp_total_por_tema));
  const sigPaleta = [...PALETAS].sort((a, b) => a.xp_color_min - b.xp_color_min).find((p) => p.xp_color_min > estado.xp_color);
  const m = estado.mascota;
  const equipo = estado.equipo ?? SIN_EQUIPO;

  return (
    <Escena bioma="perfil">
      <h1 className="sr-only">Perfil</h1>
      <section className="escenario-heroe aparece" aria-label="Personaje">
        <span className="foco" aria-hidden="true" />
        <div className="grupo">
          <HeroeVisual tier={tierMax} equipo={equipo} alt={`Tu personaje con el atuendo ${nombreTier(tierMax)}`} className="personaje-grande" />
          {m && <MascotaVisual especie={m.especie} etapa={m.etapa} alt="" className={`mascota-lado ${m.viva ? "" : "muerta"}`} />}
        </div>
      </section>
      <p className="nombre-tier"><span className="cinta">{nombreTier(tierMax)} · tier {tierMax}</span></p>

      <section className="panel oscuro" aria-labelledby="h-equipo">
        <h2 id="h-equipo" style={{ marginTop: 0 }}>Equipo</h2>
        <VistaEquipo estado={estado} onQuitar={(r) => accion(() => api.desequipar(r), "Listo, te lo quitaste.")} />
      </section>

      <section className="panel" aria-label="Estadísticas">
        <div className="stats">
          <div className="stat"><IconoUI id="moneda" tam={28} /><div><Contador valor={estado.monedas} className="valor" /><span className="nombre">monedas</span></div></div>
          <div className="stat"><Llama racha={estado.racha} tam={24} /><div><span className="valor">{estado.racha}</span><span className="nombre">días de racha</span></div></div>
          <div className="stat"><IconoUI id="corazon" tam={28} /><div><span className="valor">{estado.vidas}</span><span className="nombre">vidas</span></div></div>
          <div className="stat" title="Los escudos protegen tu XP de color si un día no juegas"><Escudo tam={28} /><div><span className="valor">{estado.escudos}/2</span><span className="nombre">escudos</span></div></div>
        </div>
      </section>

      <section className="panel oscuro" aria-labelledby="h-temas">
        <h2 id="h-temas" style={{ marginTop: 0 }}>Evolución</h2>
        <Evolucion tier={tierMax} />
        {temas.length === 0 ? <p>Juega un curso para empezar a evolucionar.</p> : (
          <div style={{ marginTop: 16 }}>
            {temas.map((t) => {
              const xp = estado.xp_total_por_tema[t] ?? 0;
              const ti = estado.tier_por_tema[t] ?? 1;
              return (
                <div key={t} className="tema-xp">
                  <div className="cab"><strong>{t}</strong><span>{nombreTier(ti)} · {xp} XP</span></div>
                  <div className="barra oro llenar" aria-hidden="true"><span style={{ width: `${Math.max(4, (xp / xpMax) * 100)}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="h-paletas">
        <h2 id="h-paletas" style={{ marginTop: 0 }}>Paleta de color</h2>
        <p>
          XP de color: <strong>{estado.xp_color}</strong>
          {sigPaleta ? <> · te faltan <strong>{sigPaleta.xp_color_min - estado.xp_color}</strong> para «{sigPaleta.nombre}»</> : " · ¡todas desbloqueadas!"}.
          {" "}Baja 50 por cada día sin jugar (los escudos lo evitan).
        </p>
        <div className="barra llenar" aria-hidden="true"><span style={{ width: `${Math.min(100, (estado.xp_color / 3000) * 100)}%` }} /></div>
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
                  {libre ? (activa ? "Activa" : "Desbloqueada") : <><Candado tam={14} /> {p.xp_color_min} XP</>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel oscuro" aria-labelledby="h-mascota">
        <h2 id="h-mascota" style={{ marginTop: 0 }}>Mascota</h2>
        <Mascota mascota={estado.mascota} onRevive={refrescar} />
        <p style={{ fontSize: 15, margin: "10px 0 0" }}>Tus mascotas ganan XP cuando aciertas seguido sin pedir ayuda y sin perder vidas.</p>
        <EvolucionMascotas estado={estado} />
      </section>

      <section className="panel oscuro" aria-labelledby="h-jefes">
        <h2 id="h-jefes" style={{ marginTop: 0 }}>Jefes finales</h2>
        <p>Completa los niveles de cada sección para desbloquear a su jefe final.</p>
        {errorJefes ? (
          <p className="error" role="alert">No se pudieron cargar los jefes finales: {errorJefes}</p>
        ) : jefesDesbloqueados === null ? (
          <p className="placa" role="status">Cargando jefes…</p>
        ) : (
          <ul className="rejilla perfil-jefes" aria-label="Catálogo de jefes finales">
            {JEFES_FINALES.map((jefe) => {
              const desbloqueado = jefesDesbloqueados.has(jefe.id);
              const rareza = jefe.id === JEFE_LEGENDARIO.id ? "legendaria" : "rara";
              return (
                <li key={jefe.id} className={`slot perfil-jefe ${rareza} ${desbloqueado ? "" : "bloqueado"}`}
                  aria-label={`${jefe.nombre}, ${desbloqueado ? "desbloqueado" : "bloqueado"}`}>
                  <span className="perfil-jefe-arte">
                    <Sprite nombre={jefe.contrato} alt={jefe.nombre} escala={3}
                      className={`perfil-jefe-sprite ${desbloqueado ? "" : "en-gris"}`} />
                    {!desbloqueado && <span className="perfil-jefe-candado"><Candado tam={24} /></span>}
                  </span>
                  <strong>{jefe.nombre}</strong>
                  <span className="perfil-jefe-estado">{desbloqueado ? "Desbloqueado" : "Bloqueado"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="h-inv">
        <div className="fila" style={{ justifyContent: "space-between" }}>
          <h2 id="h-inv" style={{ margin: 0 }}>Inventario</h2>
          <Link to="/tienda" className="boton chico secundario">Ir a la tienda</Link>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {aviso && <p className="exito" role="status">{aviso}</p>}
        {estado.inventario.length === 0 ? <p style={{ marginTop: 12 }}>Tu inventario está vacío.</p> : (
          <div className="rejilla inventario" style={{ marginTop: 12 }}>
            {estado.inventario.map((it) => (
              <div key={it.item_id} className={`slot ${rarezaDe(it.item_id)}`}>
                <span className="cantidad">×{it.cantidad}</span>
                <ItemVisual id={it.item_id} />
                <span>{nombreItem(it.item_id)}</span>
                {USABLES.has(it.item_id) && (
                  <button className="boton chico" onClick={() => accion(() => api.usarItem(it.item_id), `Usaste: ${nombreItem(it.item_id)}.`)}>Usar</button>
                )}
                {ranuraDe(it.item_id) && (equipo[ranuraDe(it.item_id)!] === it.item_id ? (
                  <button className="boton chico secundario" aria-label={`Quitar ${nombreItem(it.item_id)}`}
                    onClick={() => accion(() => api.desequipar(ranuraDe(it.item_id)!), `Te quitaste: ${nombreItem(it.item_id)}.`)}>Quitar</button>
                ) : (
                  <button className="boton chico verde" aria-label={`Equipar ${nombreItem(it.item_id)}`}
                    onClick={() => accion(() => api.equipar(it.item_id), `Te pusiste: ${nombreItem(it.item_id)}.`)}>Equipar</button>
                ))}
                {it.item_id.startsWith("mascota_") && (
                  <button className="boton chico verde" onClick={() => accion(() => api.equiparMascota(it.item_id), "Mascota equipada.")}>Equipar</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </Escena>
  );
}
