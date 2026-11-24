import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useEstadoJuego, useSesion } from "./contexto";
import { Engrane, IconoNav, Moneda } from "./components/Iconos";
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
  { a: "/arena", nombre: "arena", txt: "Arena" },
  { a: "/taller", nombre: "taller", txt: "Taller" },
  { a: "/tienda", nombre: "tienda", txt: "Tienda" },
  { a: "/perfil", nombre: "perfil", txt: "Perfil" },
] as const;

function Proximamente({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="panel centro">
      <h1>{titulo}</h1>
      <p className="pix-font" style={{ fontSize: 12 }}>Próximamente</p>
      <p>{texto}</p>
      <Link to="/" className="boton secundario">Volver a Inicio</Link>
    </div>
  );
}

function Marco() {
  const { token } = useSesion();
  const { estado } = useEstadoJuego();
  const loc = useLocation();
  useEffect(() => { document.getElementById("contenido")?.focus({ preventScroll: true }); }, [loc.pathname]);
  if (!token) return <Navigate to="/entrar" replace />;
  return (
    <div className="app">
      <a href="#contenido" className="saltar">Saltar al contenido</a>
      <header className="cabecera">
        <Link to="/" className="logo">PIXTART</Link>
        {estado && <span className="monedas" aria-label={`${estado.monedas} monedas`}><Moneda /> {estado.monedas}</span>}
        <Link to="/ajustes" aria-label="Ajustes" className="boton chico secundario" style={{ padding: 6 }}><Engrane /></Link>
      </header>
      <main id="contenido" className="principal" tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="navbar" aria-label="Principal">
        {DESTINOS.map((d) => (
          <NavLink key={d.a} to={d.a} end={d.a === "/"}>
            <span className="icono" aria-hidden="true"><IconoNav nombre={d.nombre} /></span>
            {d.txt}
          </NavLink>
        ))}
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
        <Route path="perfil" element={<Perfil />} />
        <Route path="tienda" element={<Tienda />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="arena" element={<Proximamente titulo="Arena" texto="Duelos en salas privadas con tus amigos. Llega en una próxima ronda." />} />
        <Route path="taller" element={<Proximamente titulo="Taller" texto="Aquí podrás fabricar y personalizar objetos. Llega en una próxima ronda." />} />
        <Route path="*" element={<Proximamente titulo="No encontrado" texto="Esta página no existe." />} />
      </Route>
    </Routes>
  );
}
