import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import NivelFinal from "./nivel-final";
import { useEffect } from "react";
import { useEstadoJuego, useSesion } from "./contexto";
import { Candado } from "./components/Iconos";
import { nombreEspecie } from "./components/Sprite";
import { Escena, type Bioma } from "./escenas";
import { IconoUI, MascotaVisual } from "./escenas/visuales";
import { Contador, Llama } from "./escenas/hud";
import { sonar } from "./escenas/sonido";
import { PALETAS } from "./theme/paleta";
import { Login, Registro } from "./pages/Auth";
import { Ajustes } from "./pages/Ajustes";
import { CrearCurso, ProgresoTrabajo } from "./pages/CrearCurso";
import { Revision } from "./pages/Revision";
import { Inicio } from "./pages/Inicio";
import { Jugar } from "./pages/Jugar";
import { Perfil } from "./pages/Perfil";
import { Tienda } from "./pages/Tienda";

const DESTINOS = [
  { a: "/", nombre: "inicio", txt: "Inicio" },
  { a: "/arena", nombre: "arena", txt: "Arena", pronto: true },
  { a: "/taller", nombre: "taller", txt: "Taller", pronto: true },
  { a: "/tienda", nombre: "tienda", txt: "Tienda" },
  { a: "/perfil", nombre: "perfil", txt: "Perfil" },
] as const;

function Proximamente({ titulo, texto, bioma = "noche" }: { titulo: string; texto: string; bioma?: Bioma }) {
  return (
    <Escena bioma={bioma}>
      <div className="panel centro aparece" style={{ maxWidth: 520, margin: "8vh auto 0" }}>
        <div aria-hidden="true" style={{ marginBottom: 8 }}><Candado tam={48} /></div>
        <h1>{titulo}</h1>
        {bioma !== "cueva" && <p className="cinta">Próximamente</p>}
        <p>{texto}</p>
        <Link to="/" className="boton secundario">Volver a Inicio</Link>
      </div>
    </Escena>
  );
}

/** Progreso de XP de color hacia la siguiente paleta (0..1) y su nombre. */
function progresoColor(xp: number) {
  const orden = [...PALETAS].sort((a, b) => a.xp_color_min - b.xp_color_min);
  const sig = orden.find((p) => p.xp_color_min > xp);
  const prev = [...orden].reverse().find((p) => p.xp_color_min <= xp);
  const desde = prev?.xp_color_min ?? 0;
  const hasta = sig?.xp_color_min ?? 3000;
  return { f: sig ? Math.max(0, Math.min(1, (xp - desde) / Math.max(1, hasta - desde))) : 1, sig };
}

function Hud() {
  const { estado } = useEstadoJuego();
  if (!estado) return null;
  const { f, sig } = progresoColor(estado.xp_color);
  const m = estado.mascota;
  return (
    <>
      <div className="hud-chips">
        <span className="hud-chip vidas" aria-label={`${estado.vidas} vidas`} title="Vidas">
          <IconoUI id="corazon" /> <Contador valor={estado.vidas} />
        </span>
        <Link to="/tienda" className="hud-chip oro" aria-label={`${estado.monedas} monedas`} title="Monedas" onClick={() => sonar("toque")}>
          <IconoUI id="moneda" /> <Contador valor={estado.monedas} />
        </Link>
        <span className={`hud-chip racha ${estado.racha > 0 ? "encendida" : ""}`} aria-label={`Racha de ${estado.racha} días`} title="Racha">
          <Llama racha={estado.racha} tam={18} /> <Contador valor={estado.racha} />
        </span>
        {m && (
          <Link to="/perfil" className={`hud-chip mascota-mini solo-ancho ${m.viva ? "" : "muerta"}`} aria-label={`Mascota: ${nombreEspecie(m.especie)}${m.viva ? "" : " (descansando)"}`} title="Mascota">
            <MascotaVisual especie={m.especie} alt="" />
          </Link>
        )}
        <Link to="/ajustes" aria-label="Ajustes" className="hud-chip boton-icono" title="Ajustes" onClick={() => sonar("toque")}><IconoUI id="ajustes" /></Link>
      </div>
      <div className="barra-color" role="progressbar" aria-label={sig ? `XP de color: ${estado.xp_color}; siguiente paleta ${sig.nombre} en ${sig.xp_color_min}` : `XP de color: ${estado.xp_color}`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)}>
        <span style={{ transform: `scaleX(${f})` }} />
      </div>
    </>
  );
}

function Marco() {
  const { token } = useSesion();
  const loc = useLocation();
  useEffect(() => { document.getElementById("contenido")?.focus({ preventScroll: true }); }, [loc.pathname]);
  if (!token) return <Navigate to="/entrar" replace />;
  return (
    <div className="app">
      <a href="#contenido" className="saltar">Saltar al contenido</a>
      <header className="cabecera">
        <Link to="/" className="logo" aria-label="Pixtart, ir a Inicio"><IconoUI id="moneda" tam={22} /><span className="logo-txt">PIXTART</span></Link>
        <Hud />
      </header>
      <main id="contenido" className="principal" tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="navbar" aria-label="Principal">
        {DESTINOS.map((d) => {
          const pronto = "pronto" in d && d.pronto;
          return (
            <NavLink key={d.a} to={d.a} end={d.a === "/"} className={pronto ? "pronto" : undefined} onClick={() => sonar("toque")}
              aria-label={pronto ? `${d.txt} (próximamente)` : undefined}>
              <span className="icono" aria-hidden="true">
                <IconoUI id={d.nombre} tam={32} />
                {pronto && <span className="candado-nav"><Candado tam={16} /></span>}
              </span>
              {d.txt}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

function SoloInvitado({ children }: { children: JSX.Element }) {
  const { token } = useSesion();
  return token ? <Navigate to="/" replace /> : children;
}

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<SoloInvitado><Login /></SoloInvitado>} />
      <Route path="/registro" element={<SoloInvitado><Registro /></SoloInvitado>} />
      <Route element={<Marco />}>
        <Route index element={<Inicio />} />
        <Route path="crear" element={<CrearCurso />} />
        <Route path="crear/progreso/:id" element={<ProgresoTrabajo />} />
        <Route path="cursos/:id/revisar" element={<Revision />} />
        <Route path="jugar/:nivelId" element={<Jugar />} />
        <Route path="final/:nivelId" element={<NivelFinal />} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="tienda" element={<Tienda />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="arena" element={<Proximamente titulo="Arena" texto="Duelos en salas privadas con tus amigos. Llega en una próxima ronda." />} />
        <Route path="taller" element={<Proximamente titulo="Taller" texto="Aquí podrás fabricar y personalizar objetos. Llega en una próxima ronda." />} />
        <Route path="*" element={<Proximamente titulo="No encontrado" texto="Esta página no existe." bioma="cueva" />} />
      </Route>
    </Routes>
  );
}
