import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi, useSesion } from "../contexto";
import { correoValido, esMayorDeEdad, mensajeError, zonaHoraria } from "../lib/validacion";
import { Sprite } from "../components/Sprite";

function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main id="contenido" className="principal" style={{ maxWidth: 480, paddingBottom: 32 }}>
      <div className="centro"><Sprite src="/sprites/ogre-green.svg" alt="" tam={96} /></div>
      <h1 className="centro">{titulo}</h1>
      <div className="panel">{children}</div>
    </main>
  );
}

export function Login() {
  const api = useApi();
  const { entrar } = useSesion();
  const nav = useNavigate();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!correoValido(correo) || !contrasena) return setError("Escribe tu correo y tu contraseña.");
    setEnviando(true);
    try {
      const r = await api.login({ correo: correo.trim(), contrasena });
      entrar(r.token);
      nav("/", { replace: true });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Marco titulo="Entrar a Pixtart">
      <form onSubmit={enviar} noValidate>
        <div className="campo">
          <label htmlFor="correo">Correo</label>
          <input id="correo" type="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="contrasena">Contraseña</label>
          <input id="contrasena" type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="boton" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
      </form>
      <p style={{ marginTop: 16 }}>¿No tienes cuenta? <Link to="/registro">Crea una</Link></p>
    </Marco>
  );
}

export function Registro({ hoy }: { hoy?: Date }) {
  const api = useApi();
  const { entrar } = useSesion();
  const nav = useNavigate();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [fecha, setFecha] = useState("");
  const [mayor, setMayor] = useState(false);
  const [zona] = useState(zonaHoraria);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const validar = () => {
    const e: Record<string, string> = {};
    if (!correoValido(correo)) e.correo = "Escribe un correo válido.";
    if (contrasena.length < 10) e.contrasena = "La contraseña debe tener al menos 10 caracteres.";
    if (!fecha) e.fecha = "Escribe tu fecha de nacimiento.";
    else if (!esMayorDeEdad(fecha, hoy)) e.fecha = "Pixtart es solo para mayores de 18 años.";
    if (!mayor) e.mayor = "Confirma que eres mayor de 18 años.";
    return e;
  };

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setErrorGeneral(null);
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      await api.registro({ correo: correo.trim(), contrasena, fecha_nacimiento: fecha, zona_horaria: zona });
      const r = await api.login({ correo: correo.trim(), contrasena });
      entrar(r.token);
      nav("/", { replace: true });
    } catch (err) {
      setErrorGeneral(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const err = (k: string) => errores[k] && <p className="error" id={`err-${k}`}>{errores[k]}</p>;
  const inv = (k: string) => ({ "aria-invalid": !!errores[k], "aria-describedby": errores[k] ? `err-${k}` : undefined });

  return (
    <Marco titulo="Crear cuenta">
      <form onSubmit={enviar} noValidate>
        <div className="campo">
          <label htmlFor="r-correo">Correo</label>
          <input id="r-correo" type="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} {...inv("correo")} />
          {err("correo")}
        </div>
        <div className="campo">
          <label htmlFor="r-contrasena">Contraseña (mínimo 10 caracteres)</label>
          <input id="r-contrasena" type="password" autoComplete="new-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} {...inv("contrasena")} />
          {err("contrasena")}
        </div>
        <div className="campo">
          <label htmlFor="r-fecha">Fecha de nacimiento</label>
          <input id="r-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} {...inv("fecha")} />
          {err("fecha")}
        </div>
        <div className="campo">
          <label className="casilla" htmlFor="r-mayor">
            <input id="r-mayor" type="checkbox" checked={mayor} onChange={(e) => setMayor(e.target.checked)} {...inv("mayor")} />
            Confirmo que soy mayor de 18 años
          </label>
          {err("mayor")}
        </div>
        <p className="ayuda-campo">Zona horaria detectada: <strong>{zona}</strong> (tu día de juego se corta a las 04:00 de esa zona).</p>
        {errorGeneral && <p className="error" role="alert">{errorGeneral}</p>}
        <p style={{ marginTop: 16 }}><button className="boton" disabled={enviando}>{enviando ? "Creando…" : "Crear cuenta"}</button></p>
      </form>
      <p style={{ marginTop: 16 }}>¿Ya tienes cuenta? <Link to="/entrar">Entra</Link></p>
    </Marco>
  );
}
