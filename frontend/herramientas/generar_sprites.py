#!/usr/bin/env python3
"""Generador determinista del arte de Pixtart (sprites, frames de animación, ítems e íconos).

Solo Python estándar. Correrlo dos veces da exactamente los mismos archivos.
Todo es pixel-art SVG con <rect> y shape-rendering="crispEdges":
  - personajes en rejilla 32×32 (héroe, mascotas, anfitriones, enemigos, cofres, efectos)
  - ítems e íconos en rejilla 16×16

Fuentes (arte del autor, copiadas tal cual en `herramientas/fuentes/`, solo se LEEN):
  - fuentes/final/    ← Picstart design/mockups/03-final-level/sprites (= assets/nivel-final/sprites de la página)
  - fuentes/elenco/   ← cristoredentor.github.io/assets/personajes/juego (elenco 32×32)
  - fuentes/mascotas/ ← cristoredentor.github.io/assets/mascotas (zorro, búho y gólem)
  - fuentes/ui/       ← cristoredentor.github.io/assets/ui/chest-*-hoja.svg (cofres con frames de apertura)
  Ítems, íconos, efectos, el dragoncito y los atuendos del héroe se dibujan aquí (ASCII/geometría).

Salida (relativa a la raíz del repo):
  frontend/public/sprites/<grupo>/<id>.svg                 (frame estático)
  frontend/public/sprites/<grupo>/<id>-<anim>-f<N>.svg     (frames de animación)
  frontend/public/sprites/galeria.html                     (muestra de todo, animado; abrir en /sprites/galeria.html)
  frontend/src/arte/manifiesto.json                        (qué sprites/anims/frames existen + fichas)
  frontend/src/arte/catalogo.json                          (espejo del CATALOGO del backend)

Uso (desde la raíz del repo):
  python3 frontend/herramientas/generar_sprites.py
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

AQUI = Path(__file__).resolve().parent
FUENTES = AQUI / "fuentes"  # copia (solo lectura) del arte del autor, ver fuentes/LEEME.txt
FINAL = FUENTES / "final"
ELENCO = FUENTES / "elenco"
MASCOTAS_SITIO = FUENTES / "mascotas"
UI_SITIO = FUENTES / "ui"

Px = tuple[str, float]

# ======================================================================================
# Rejilla de píxeles
# ======================================================================================


class G:
    def __init__(self, w: int, h: int, d: list[list[Px | None]] | None = None):
        self.w, self.h = w, h
        self.d = d if d is not None else [[None] * w for _ in range(h)]

    def copia(self) -> G:
        return G(self.w, self.h, [r[:] for r in self.d])

    def get(self, x: int, y: int) -> Px | None:
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.d[y][x]
        return None

    def set(self, x: int, y: int, c: str | None, a: float = 1.0) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.d[y][x] = None if c is None else (c.upper(), a)

    def bbox(self) -> tuple[int, int, int, int]:
        xs = [x for y in range(self.h) for x in range(self.w) if self.d[y][x]]
        ys = [y for y in range(self.h) for x in range(self.w) if self.d[y][x]]
        if not xs:
            return 0, 0, 0, 0
        return min(xs), min(ys), max(xs), max(ys)

    def pixeles(self):
        for y in range(self.h):
            for x in range(self.w):
                if self.d[y][x]:
                    yield x, y, self.d[y][x]


def vacia(w: int = 32, h: int = 32) -> G:
    return G(w, h)


def cargar_svg(ruta: Path) -> G:
    """Lee un SVG de <rect> en unidades de píxel (viewBox) a una rejilla."""
    raiz = ET.parse(ruta).getroot()
    x0, y0, w, h = (float(v) for v in raiz.get("viewBox").split())
    g = G(int(w), int(h))

    def recorre(e, dx, dy, op):
        tr = e.get("transform") or ""
        m = re.search(r"translate\(([-\d.]+)[ ,]+([-\d.]+)\)", tr)
        if m:
            dx += float(m.group(1))
            dy += float(m.group(2))
        op *= float(e.get("opacity", 1)) * float(e.get("fill-opacity", 1))
        if e.tag.split("}")[-1] == "rect":
            fill = e.get("fill")
            if fill and fill != "none":
                rx, ry = float(e.get("x", 0)) + dx - x0, float(e.get("y", 0)) + dy - y0
                for yy in range(int(ry), int(ry + float(e.get("height")))):
                    for xx in range(int(rx), int(rx + float(e.get("width")))):
                        g.set(xx, yy, fill, round(op, 2))
        for c in e:
            recorre(c, dx, dy, op)

    recorre(raiz, 0, 0, 1.0)
    return g


def recorte(g: G, x: int, y: int, w: int, h: int) -> G:
    out = G(w, h)
    for yy in range(h):
        for xx in range(w):
            out.d[yy][xx] = g.get(x + xx, y + yy)
    return out


def ascii_(filas: list[str], ley: dict[str, str]) -> G:
    w = max(len(f) for f in filas)
    g = G(w, len(filas))
    for y, f in enumerate(filas):
        for x, ch in enumerate(f):
            if ch in ley:
                g.set(x, y, ley[ch])
    return g


def pega(base: G, arriba: G, x: int = 0, y: int = 0, detras: bool = False) -> G:
    out = base.copia()
    for xx, yy, p in arriba.pixeles():
        X, Y = xx + x, yy + y
        if 0 <= X < out.w and 0 <= Y < out.h:
            if detras and out.d[Y][X]:
                continue
            out.d[Y][X] = p
    return out


def mueve(g: G, dx: int, dy: int) -> G:
    out = G(g.w, g.h)
    for x, y, p in g.pixeles():
        if 0 <= x + dx < g.w and 0 <= y + dy < g.h:
            out.d[y + dy][x + dx] = p
    return out


def rebote(g: G, dy: int = 1, corte: int | None = None) -> G:
    """Desplaza en vertical todo lo que está por encima de `corte` (los pies se quedan)."""
    if corte is None:
        corte = g.bbox()[3] - 2
    out = G(g.w, g.h)
    for x, y, p in g.pixeles():
        if y >= corte:
            out.d[y][x] = p
    for x, y, p in g.pixeles():
        if y < corte and 0 <= y + dy < g.h:
            out.d[y + dy][x] = p
    return out


def espejo(g: G) -> G:
    out = G(g.w, g.h)
    for x, y, p in g.pixeles():
        out.d[y][g.w - 1 - x] = p
    return out


def _hex(c: str) -> tuple[int, int, int]:
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)


def _col(r: float, g: float, b: float) -> str:
    return "#%02X%02X%02X" % tuple(max(0, min(255, round(v))) for v in (r, g, b))


def mezcla(c1: str, c2: str, t: float) -> str:
    a, b = _hex(c1), _hex(c2)
    return _col(*(a[i] + (b[i] - a[i]) * t for i in range(3)))


def recolor(g: G, mapa: dict[str, str]) -> G:
    m = {k.upper(): v.upper() for k, v in mapa.items()}
    out = G(g.w, g.h)
    for x, y, (c, a) in g.pixeles():
        out.d[y][x] = (m.get(c, c), a)
    return out


def tinte(g: G, color: str, t: float, excepto: tuple[str, ...] = ()) -> G:
    out = G(g.w, g.h)
    ex = {e.upper() for e in excepto}
    for x, y, (c, a) in g.pixeles():
        out.d[y][x] = (c if c in ex else mezcla(c, color, t), a)
    return out


def luminancia(c: str) -> float:
    r, g, b = _hex(c)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255


def alfa(g: G, a: float) -> G:
    out = G(g.w, g.h)
    for x, y, (c, aa) in g.pixeles():
        out.d[y][x] = (c, round(aa * a, 2))
    return out


def contorno(g: G, color: str = "#1B1F3B") -> G:
    """Añade un contorno de 1 px (4 vecinos) alrededor de la silueta."""
    out = g.copia()
    for y in range(g.h):
        for x in range(g.w):
            if g.d[y][x] is None and any(g.get(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out.d[y][x] = (color.upper(), 1.0)
    return out


def aura(g: G, color: str, alfas: tuple[float, ...] = (0.55, 0.25)) -> G:
    """Brillo alrededor de la silueta: anillos semitransparentes detrás del sprite."""
    out = g.copia()
    actual = g
    for a in alfas:
        anillo = G(g.w, g.h)
        for y in range(g.h):
            for x in range(g.w):
                if actual.d[y][x] is None and any(
                    actual.get(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                ):
                    anillo.d[y][x] = (color.upper(), a)
        out = pega(out, anillo, detras=True)
        actual = pega(actual, anillo)
    return out


def scale2x(g: G) -> G:
    """EPX/Scale2x: duplica la resolución suavizando diagonales (algoritmo clásico de pixel-art)."""
    out = G(g.w * 2, g.h * 2)
    for y in range(g.h):
        for x in range(g.w):
            P = g.get(x, y)
            A, B, C, D = g.get(x, y - 1), g.get(x + 1, y), g.get(x - 1, y), g.get(x, y + 1)
            e0 = e1 = e2 = e3 = P
            if C == A and C != D and A != B:
                e0 = A
            if A == B and A != C and B != D:
                e1 = B
            if D == C and D != B and C != A:
                e2 = C
            if B == D and B != A and D != C:
                e3 = D
            out.d[2 * y][2 * x], out.d[2 * y][2 * x + 1] = e0, e1
            out.d[2 * y + 1][2 * x], out.d[2 * y + 1][2 * x + 1] = e2, e3
    return out


def coloca(g: G, w: int = 32, h: int = 32, abajo: int = 1) -> tuple[G, int, int]:
    """Recorta a la silueta y la centra en horizontal, apoyada abajo. Devuelve (rejilla, dx, dy)."""
    x0, y0, x1, y1 = g.bbox()
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    dx = (w - bw) // 2 - x0
    dy = h - abajo - bh - y0
    out = G(w, h)
    for x, y, p in g.pixeles():
        out.set(x + dx, y + dy, p[0], p[1])
    return out, dx, dy


# ======================================================================================
# Partículas y adornos (dibujos originales pequeños)
# ======================================================================================

P_CORAZON = ascii_([".a.a.", "abaaa", "aaaaa", ".aaa.", "..a.."], {"a": "#E04848", "b": "#FF8A8A"})
P_CORAZON_C = ascii_(["a.a", "aaa", ".a."], {"a": "#FF6A8A"})
P_DESTELLO = ascii_([".a.", "aba", ".a."], {"a": "#FFE27A", "b": "#FFFFFF"})
P_DESTELLO_G = ascii_(["..a..", "..a..", "aabaa", "..a..", "..a.."], {"a": "#FFE27A", "b": "#FFFFFF"})
P_PUNTO = ascii_(["a"], {"a": "#FFFFFF"})
P_LAGRIMA = ascii_(["a", "b"], {"a": "#8CC8F0", "b": "#5FA8E8"})
P_SUDOR = ascii_([".a", "ab", "bb"], {"a": "#CFE8F5", "b": "#5FA8E8"})
P_FOCO = ascii_(
    [".aaa.", "abbba", "abcba", "abbba", ".aba.", ".ddd.", "..d.."],
    {"a": "#C8941A", "b": "#FFF1A0", "c": "#FFFFFF", "d": "#7A7A86"},
)
P_RAYOS_FOCO = ascii_(["a...a", ".....", ".....", "a...a"], {"a": "#FFE27A"})
P_CHECK = ascii_(["....a", "...ab", "a.ab.", "bab..", ".b..."], {"a": "#58C94A", "b": "#2C5E2E"})
P_EXCLAMA = ascii_(["a", "a", "a", ".", "a"], {"a": "#F2C230"})
P_GOLPE = ascii_(["a...a", ".aba.", ".bcb.", ".aba.", "a...a"], {"a": "#FFE27A", "b": "#FFFFFF", "c": "#E04848"})
P_HALO = ascii_([".aaaaaa.", "a......a", ".aaaaaa."], {"a": "#FFE27A"})
P_NOTA = ascii_(["..aa", "..a.", "..a.", "aaa.", "aa.."], {"a": "#FFF6D8"})
P_HUMO = ascii_([".aa.", "abba", "abba", ".aa."], {"a": "#A3A3AE", "b": "#D8DEE8"})
P_ESTRELLITA = ascii_(["a"], {"a": "#FFE27A"})


def particulas(g: G, lista: list[tuple[G, int, int]], alfa_: float = 1.0) -> G:
    out = g
    for p, x, y in lista:
        out = pega(out, alfa(p, alfa_) if alfa_ < 1 else p, x, y)
    return out


def rayas_velocidad(g: G, lado: str, y0: int, y1: int, color: str = "#FFF6D8") -> G:
    """Líneas de movimiento detrás de un personaje que embiste."""
    out = g.copia()
    x0, _, x1, _ = g.bbox()
    for i, y in enumerate(range(y0, y1, 3)):
        largo = 3 + (i % 2) * 2
        for k in range(largo):
            x = (x1 + 2 + k) if lado == "der" else (x0 - 2 - k)
            if out.get(x, y) is None:
                out.set(x, y, color, 0.8 - 0.12 * k)
    return out


# ======================================================================================
# Expresiones (ojos y boca) a partir de la configuración de cada personaje
# ======================================================================================


def ojos_cerrados(g: G, cfg: dict) -> G:
    out = g.copia()
    for x, y, w, h in cfg.get("ojos", []):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if out.get(xx, yy):
                    out.set(xx, yy, cfg["piel"])
        for xx in range(x, x + w):
            out.set(xx, y + h // 2 if h > 1 else y, cfg.get("linea", "#1B1F3B"))
    return out


def ojos_felices(g: G, cfg: dict) -> G:
    """Ojos en arco (^ ^)."""
    out = g.copia()
    for i, (x, y, w, h) in enumerate(cfg.get("ojos", [])):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if out.get(xx, yy):
                    out.set(xx, yy, cfg["piel"])
        base = y + max(0, h - 1) if h > 1 else y
        linea = cfg.get("linea", "#1B1F3B")
        if w == 1:
            out.set(x, base - (1 if h > 1 else 0), linea)
            continue
        for k in range(w):
            alto = base - (1 if 0 < k < w - 1 or w == 2 and k == (1 - i % 2) else 0)
            out.set(x + k, alto if h > 1 else y, linea)
    return out


def ojos_tristes(g: G, cfg: dict, fase: int = 0) -> G:
    """Párpado caído (fila superior del ojo) y una lágrima que cae."""
    out = g.copia()
    ojos = cfg.get("ojos", [])
    for x, y, w, h in ojos:
        if h > 1:
            for xx in range(x, x + w):
                out.set(xx, y, cfg["piel"])
    if ojos:
        x, y, w, h = ojos[0]
        out = pega(out, P_LAGRIMA, x, y + h + fase)
    return out


def boca_abierta(g: G, cfg: dict) -> G:
    out = g.copia()
    b = cfg.get("boca")
    if b:
        x, y, w = b
        for xx in range(x, x + w):
            out.set(xx, y, "#2A1A0E")
        if len(b) > 3:
            pass
    return out


def asiente(g: G, cfg: dict) -> G:
    """Cabeza baja 1 px (asentir)."""
    cuello = cfg.get("cuello", 14)
    out = G(g.w, g.h)
    for x, y, p in g.pixeles():
        if y >= cuello:
            out.d[y][x] = p
    for x, y, p in g.pixeles():
        if y < cuello and y + 1 < g.h:
            out.d[y + 1][x] = p
    return out


def fantasma(g: G, cfg: dict, fase: int) -> G:
    """Versión 'fantasmita' (mascota muerta 20 min): pálida, translúcida, ojos cerrados, halo, cola ondulada."""
    base = ojos_cerrados(g, cfg) if cfg.get("ojos") else g
    paleta = ["#4E5F96", "#8FA6D8", "#C9DAF2", "#F2F8FF"]
    out = G(g.w, g.h)
    x0, y0, x1, y1 = base.bbox()
    for x, y, (c, a) in base.pixeles():
        l = luminancia(c)
        col = paleta[0 if l < 0.22 else 1 if l < 0.45 else 2 if l < 0.7 else 3]
        out.d[y][x] = (col, 0.78)
    # cola ondulada: las 3 filas de abajo se recortan en zigzag
    for y in range(y1 - 2, y1 + 1):
        prof = y - (y1 - 2)
        for x in range(x0, x1 + 1):
            if ((x + fase) // 2 + prof) % 3 == 0 and prof > 0:
                out.d[y][x] = None
    out = mueve(out, 0, -1 - fase)
    xh = (x0 + x1) // 2 - 3
    yh = max(0, y0 - 4 - fase)
    out = pega(out, alfa(P_HALO, 0.9), xh, yh)
    return out


# ======================================================================================
# Escritura SVG
# ======================================================================================


def a_svg(g: G, titulo: str, escala: int = 4) -> str:
    lineas = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {g.w} {g.h}" '
        f'width="{g.w * escala}" height="{g.h * escala}" shape-rendering="crispEdges">',
        f"<title>{titulo}</title>",
    ]
    for y in range(g.h):
        x = 0
        while x < g.w:
            p = g.d[y][x]
            if p is None:
                x += 1
                continue
            x0 = x
            while x < g.w and g.d[y][x] == p:
                x += 1
            op = f' fill-opacity="{p[1]:g}"' if p[1] < 1 else ""
            lineas.append(f'<rect x="{x0}" y="{y}" width="{x - x0}" height="1" fill="{p[0]}"{op}/>')
    lineas.append("</svg>")
    return "\n".join(lineas) + "\n"


class Salida:
    def __init__(self, sprites: Path):
        self.dir = sprites
        self.manifiesto: dict[str, dict] = {}

    def escribe(self, ruta: str, g: G, titulo: str) -> None:
        p = self.dir / ruta
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(a_svg(g, titulo), encoding="utf-8")

    def sprite(self, nombre: str, base: G, titulo: str, anims: dict[str, tuple[list[G], int]] | None = None,
               lado: int = 32, bucle: dict[str, bool] | None = None) -> None:
        self.escribe(f"{nombre}.svg", base, titulo)
        info: dict = {"titulo": titulo, "lado": lado, "anims": {}}
        for anim, (frames, ms) in (anims or {}).items():
            for i, fr in enumerate(frames, 1):
                self.escribe(f"{nombre}-{anim}-f{i}.svg", fr, f"{titulo} — {anim} {i}/{len(frames)}")
            info["anims"][anim] = {"frames": len(frames), "ms": ms}
            if bucle and anim in bucle:
                info["anims"][anim]["bucle"] = bucle[anim]
        self.manifiesto[nombre] = info


MS = {"idle": 520, "feliz": 150, "triste": 520, "herido": 120, "ataque": 120, "caminar": 180,
      "hablar": 150, "muerta": 600, "ayudando": 260, "abrir": 170}


# ======================================================================================
# Animaciones genéricas
# ======================================================================================


def anims_basicas(g: G, cfg: dict) -> dict[str, list[G]]:
    """idle, feliz, triste, herido para cualquier personaje con config de ojos opcional."""
    con_ojos = bool(cfg.get("ojos"))
    x0, y0, x1, y1 = g.bbox()
    cx = (x0 + x1) // 2
    idle = [g, rebote(g, 1)]
    alto = min(3, y0)
    feliz_ojos = ojos_felices(g, cfg) if con_ojos else g
    feliz = [
        rebote(feliz_ojos, 1),
        particulas(mueve(feliz_ojos, 0, -alto), [(P_CORAZON, x1 - 2, max(0, y0 - alto)), (P_DESTELLO, x0 - 1, y0 + 2)]),
        particulas(feliz_ojos, [(P_CORAZON_C, x1, max(0, y0 - 3)), (P_DESTELLO, x0 + 1, max(0, y0 - 2)),
                                (P_ESTRELLITA, x1 + 1, y0 + 6)]),
    ]
    triste_base = tinte(g, "#2B2F55", 0.18)
    triste = [
        rebote(ojos_tristes(triste_base, cfg, 0) if con_ojos else triste_base, 1),
        rebote(ojos_tristes(triste_base, cfg, 2) if con_ojos else triste_base, 1),
    ]
    if not con_ojos:
        triste = [particulas(t, [(P_SUDOR, x1, y0 + 2 + i)]) for i, t in enumerate(triste)]
    cerr = ojos_cerrados(g, cfg) if con_ojos else g
    herido = [
        particulas(mueve(tinte(cerr, "#FFFFFF", 0.65), -1, 0), [(P_GOLPE, cx - 2, y0 + 4)]),
        mueve(tinte(cerr, "#E04848", 0.35), 1, 0),
    ]
    return {"idle": idle, "feliz": feliz, "triste": triste, "herido": herido}


# ======================================================================================
# HÉROE (humano aventurero) — 6 tiers de atuendo
# ======================================================================================

BANDANA = ("#2F9C95", "#1F6E69")
BUFANDA = "#E07A2A"
TUNICA = ("#3F6FC0", "#2B4C8A")
PANTALON = "#4A4A55"

TIERS = [
    # nombre, bandana, bufanda, túnica, pantalón, capa (claro, oscuro, ribete) o None, largo capa
    dict(id="tier1", nombre="Brote", bandana=("#6BBF59", "#3E8E41"), bufanda="#D8D0B8",
         tunica=("#A86F3C", "#8B5A2B"), pantalon="#5C3A1A", capa=None),
    dict(id="tier2", nombre="Aprendiz", bandana=BANDANA, bufanda=BUFANDA, tunica=TUNICA, pantalon=PANTALON, capa=None),
    dict(id="tier3", nombre="Aventurero", bandana=("#E04848", "#8E1F1F"), bufanda="#F2C230",
         tunica=("#3E8E41", "#2C5E2E"), pantalon=PANTALON, capa=("#E04848", "#8E1F1F", "#8E1F1F"), largo=8),
    dict(id="tier4", nombre="Veterano", bandana=("#A3A3AE", "#7A7A86"), bufanda="#E04848",
         tunica=("#A3A3AE", "#7A7A86"), pantalon="#2B2F55", capa=("#3F6FC0", "#2B4C8A", "#2B4C8A"), largo=12,
         hombreras=("#D8DEE8", "#7A7A86")),
    dict(id="tier5", nombre="Maestro", bandana=("#F2C230", "#C8941A"), bufanda="#F2C230",
         tunica=("#5B3FA8", "#3A2670"), pantalon="#2B2F55", capa=("#5B3FA8", "#3A2670", "#F2C230"), largo=12,
         hombreras=("#F2C230", "#C8941A"), aura="#C9B8FF"),
    dict(id="tier6", nombre="Leyenda", bandana=("#FFF1A0", "#F2C230"), bufanda="#FFF6D8",
         tunica=("#F2C230", "#C8941A"), pantalon="#D8D0B8", capa=("#FFF6D8", "#D8D0B8", "#F2C230"), largo=13,
         hombreras=("#FFF6D8", "#F2C230"), aura="#FFE27A", corona=True),
]


def ancla_heroe(g: G) -> tuple[int, int]:
    """(fila superior de la cabeza, fila de la bufanda) de un frame del jugador."""
    top = g.bbox()[1]
    buf = next(y for y in range(g.h) for x in range(g.w) if g.d[y][x] and g.d[y][x][0] == BUFANDA)
    return top, buf


def capa(t: dict, buf: int, fase: int) -> G:
    claro, oscuro, ribete = t["capa"]
    L = t["largo"]
    c = G(32, 32)
    for i in range(L):
        y = buf + i
        abre = (i * 3) // L
        xa, xb = 10 - abre, 21 + abre
        if i >= L - 3 and fase:
            xa, xb = xa + 1, xb + 1  # ondea
        for x in range(xa, xb + 1):
            col = oscuro if x in (xa + 1, xb - 1) or (x - xa) % 5 == 0 else claro
            if i == L - 1:
                col = ribete
            c.set(x, y, col)
        c.set(xa - 1, y, "#1B1F3B")
        c.set(xb + 1, y, "#1B1F3B")
    xa, xb = 10 - 2 + (1 if fase else 0), 21 + 2 + (1 if fase else 0)
    for x in range(xa - 1, xb + 2):
        c.set(x, buf + L, "#1B1F3B")
    return c


def viste(g: G, t: dict, fase: int = 0) -> G:
    top, buf = ancla_heroe(g)
    out = recolor(g, {
        BANDANA[0]: t["bandana"][0], BANDANA[1]: t["bandana"][1], BUFANDA: t["bufanda"],
        TUNICA[0]: t["tunica"][0], TUNICA[1]: t["tunica"][1], PANTALON: t["pantalon"],
    })
    if t.get("capa"):
        out = pega(out, capa(t, buf, fase), detras=True)
    if t.get("hombreras"):
        cl, os_ = t["hombreras"]
        for x0 in (9, 20):
            for dx in range(3):
                if out.get(x0 + dx, buf + 1):
                    out.set(x0 + dx, buf + 1, cl if dx == 1 else os_)
            if out.get(x0 + 1, buf + 2):
                out.set(x0 + 1, buf + 2, os_)
    if t["id"] == "tier1":  # brote en la cabeza
        out = pega(out, ascii_(["ll.LL", ".lsL.", "..s.."], {"l": "#6BBF59", "L": "#3E8E41", "s": "#2C5E2E"}),
                   14, top - 3)
    if t["id"] == "tier5":  # gema en la diadema
        out.set(16, top + 3, "#E04848")
        out.set(15, top + 3, "#FF8A8A")
    if t.get("corona"):
        out = pega(out, ascii_(["g..gg..g", "gGgrrgGg", "GGGGGGGG"],
                               {"g": "#FFE27A", "G": "#F2C230", "r": "#E04848"}), 12, top - 2)
    if t.get("aura"):
        out = aura(out, t["aura"], (0.6, 0.28) if fase == 0 else (0.42, 0.18))
        chispas = [(P_DESTELLO, 4, 8), (P_ESTRELLITA, 27, 14), (P_DESTELLO, 25, 4), (P_ESTRELLITA, 6, 22)]
        if fase:
            chispas = [(P_ESTRELLITA, 5, 9), (P_DESTELLO, 26, 13), (P_ESTRELLITA, 26, 5), (P_DESTELLO, 4, 21)]
        out = particulas(out, chispas)
    return out


def cfg_heroe(g: G) -> dict:
    top, _ = ancla_heroe(g)
    return {"ojos": [(13, top + 6, 2, 2), (17, top + 6, 2, 2)], "piel": "#F0C08A", "linea": "#1B1F3B",
            "boca": (15, top + 9, 2), "cuello": top + 11}


def genera_heroe(out: Salida) -> None:
    idle = cargar_svg(FINAL / "player-idle.svg")
    walk = [cargar_svg(FINAL / f"player-walk-f{i}.svg") for i in (1, 2)]
    ataque = cargar_svg(FINAL / "player-attack.svg")
    cfg = cfg_heroe(idle)
    x0, y0, x1, y1 = idle.bbox()
    for t in TIERS:
        v = lambda g, f=0: viste(g, t, f)  # noqa: E731
        feliz_base = ojos_felices(idle, cfg)
        feliz_base = pega(feliz_base, ascii_(["hh", "hh"], {"h": "#8E1F1F"}), 15, cfg["boca"][1])
        corte = y1 - 6
        salto = mueve(feliz_base, 0, -3)
        triste0 = ojos_tristes(rebote(idle, 1, corte), {**cfg, "ojos": [(a, b + 1, c, d) for a, b, c, d in cfg["ojos"]]}, 0)
        triste1 = ojos_tristes(rebote(idle, 1, corte), {**cfg, "ojos": [(a, b + 1, c, d) for a, b, c, d in cfg["ojos"]]}, 2)
        cerr = ojos_cerrados(idle, cfg)
        corte_arco = ascii_(["....aa", ".....ab", "......b", ".....ab", "....aa."], {"a": "#FFFFFF", "b": "#8CC8F0"})
        anims = {
            "idle": ([v(idle, 0), v(rebote(idle, 1, corte), 1)], MS["idle"]),
            "feliz": ([
                v(rebote(feliz_base, 1, corte), 0),
                particulas(v(salto, 1), [(P_CORAZON, 24, 1), (P_DESTELLO, 4, 6), (P_DESTELLO_G, 25, 12)]),
                particulas(v(feliz_base, 0), [(P_CORAZON_C, 6, 2), (P_DESTELLO, 26, 6), (P_ESTRELLITA, 3, 14)]),
            ], MS["feliz"]),
            "triste": ([tinte(v(triste0, 0), "#2B2F55", 0.15), tinte(v(triste1, 1), "#2B2F55", 0.15)], MS["triste"]),
            "herido": ([
                particulas(mueve(tinte(v(cerr), "#FFFFFF", 0.65), -1, 0), [(P_GOLPE, 20, 10)]),
                mueve(tinte(v(cerr), "#E04848", 0.3), 1, 0),
            ], MS["herido"]),
            "ataque": ([
                v(mueve(rebote(idle, 1, corte), -1, 0), 0),
                particulas(v(ataque, 1), [(corte_arco, 24, 11)]),
                v(ataque, 0),
            ], MS["ataque"]),
            "caminar": ([v(walk[0], 0), v(walk[1], 1)], MS["caminar"]),
        }
        out.sprite(f"heroe/{t['id']}", v(idle, 0), f"Héroe — atuendo {t['nombre']}", anims)


# ======================================================================================
# MASCOTAS
# ======================================================================================

DRAGON = [
    "................",
    "...g.......g....",
    "...ga.....ag....",
    "...aaaaaaaaa....",
    "..abbcccccbba...",
    ".abcccccccccba..",
    ".abceeccceecba..",
    ".abceaccceacba..",
    ".abccccaccccba..",
    "..abcpdddpcba...",
    ".aa.abddddba.aa.",
    "awwaabddddbaawwa",
    ".awwabddddbawwa.",
    "..aabbddddbbaa..",
    "...abbbddbbba.aa",
    "....aaa..aaa.aca",
]
LEY_DRAGON = {"a": "#14102A", "b": "#2B2F55", "c": "#3A2670", "d": "#C9B8FF", "e": "#FFFFFF",
              "p": "#FF8A8A", "g": "#F2C230", "w": "#5B3FA8"}


def mascota_escalada(fuente: G, ojos16: list[tuple[int, int, int, int]], piel: str) -> tuple[G, dict]:
    g2 = scale2x(fuente)
    g, dx, dy = coloca(g2, abajo=1)
    ojos = [(x * 2 + dx, y * 2 + dy, w * 2, h * 2) for x, y, w, h in ojos16]
    return g, {"ojos": ojos, "piel": piel}


def fuente_buho() -> G:
    g = cargar_svg(MASCOTAS_SITIO / "crystal-owl.svg")
    for x, y in ((2, 6), (9, 6)):  # pupilas (eran huecos transparentes)
        g.set(x, y, "#14102A")
    for x, y in ((5, 6), (6, 6), (5, 7), (6, 7), (5, 8)):  # pico
        g.set(x, y, "#F2C230")
    return g


def mascotas() -> list[dict]:
    """Ficha + sprite base + config de cada mascota (3 comunes, 2 raras, 3 legendarias)."""
    lista = []

    def elenco(id_, nombre, rareza, ojos, piel, desc):
        g, _, _ = coloca(cargar_svg(ELENCO / f"{id_}.svg"), abajo=0)
        lista.append(dict(id=id_, nombre=nombre, rareza=rareza, g=g, cfg={"ojos": ojos, "piel": piel}, desc=desc))

    def esc(id_, nombre, rareza, fuente, ojos16, piel, desc):
        g, cfg = mascota_escalada(fuente, ojos16, piel)
        lista.append(dict(id=id_, nombre=nombre, rareza=rareza, g=g, cfg=cfg, desc=desc))

    # (las coordenadas de ojos son las del sprite ya colocado; coloca(abajo=0) no mueve estos)
    elenco("mushroom-sprout", "Seti", "comun", [(12, 19, 2, 3), (18, 19, 2, 3)], "#FFF6D8",
           "Hongo tímido y tierno; crece un poquito con cada acierto.")
    elenco("windup-robot", "Tictac", "comun", [(11, 8, 3, 3), (18, 8, 3, 3)], "#A3A3AE",
           "Robot de cuerda puntual; cuenta los segundos en voz alta.")
    elenco("inkwell", "Borrón", "comun", [(11, 19, 3, 3), (18, 19, 3, 3)], "#2B2F55",
           "Tintero despistado y creativo; salpica cuando se emociona.")
    esc("mini-golem", "Musgo", "rara", cargar_svg(MASCOTAS_SITIO / "mini-golem.svg"),
        [(5, 4, 2, 1), (9, 4, 2, 1)], "#A3A3AE", "Gólem de piedra con musgo; firme y paciente.")
    elenco("book-golem", "Tomo", "rara", [(13, 5, 2, 2), (17, 5, 2, 2)], "#E04848",
           "Gólem de libros, lento y gentil; recuerda todo lo que leíste.")
    esc("ember-fox", "Brasa", "legendaria", cargar_svg(MASCOTAS_SITIO / "ember-fox.svg"),
        [(2, 5, 2, 2), (9, 5, 2, 2)], "#F07A2A", "Zorro de brasas veloz; su cola chisporrotea al acertar.")
    esc("crystal-owl", "Cristal", "legendaria", fuente_buho(),
        [(1, 5, 3, 2), (8, 5, 3, 2)], "#8FD8F0", "Búho de cristal que ve las respuestas a través de la niebla.")
    esc("onyx-dragon", "Nox", "legendaria", ascii_(DRAGON, LEY_DRAGON),
        [(4, 6, 2, 2), (9, 6, 2, 2)], "#3A2670", "Dragoncito nocturno; protege a su dueño con sus alitas.")
    return lista


def corrige_ojos_elenco(m: dict) -> None:
    """Los sprites del elenco ya ocupan la rejilla; coloca(abajo=0) puede haberlos movido."""


def genera_mascotas(out: Salida) -> list[dict]:
    fichas = []
    for m in mascotas():
        g, cfg = m["g"], m["cfg"]
        # el sprite del elenco se colocó con coloca(): recalculamos ojos según el desplazamiento real
        if "dx" in cfg:
            pass
        x0, y0, x1, y1 = g.bbox()
        a = anims_basicas(g, cfg)
        cx = (x0 + x1) // 2
        a["muerta"] = [fantasma(g, cfg, 0), fantasma(g, cfg, 1)]
        foco_y = max(0, y0 - 6)
        brillo = aura(g, "#FFF1A0", (0.5,))
        a["ayudando"] = [
            particulas(brillo, [(P_FOCO, x1 - 3, foco_y), (P_DESTELLO, x0 - 1, y0 + 3)]),
            particulas(rebote(g, -1), [(P_FOCO, x1 - 3, max(0, foco_y - 1)), (P_RAYOS_FOCO, x1 - 3, max(0, foco_y - 1)),
                                       (P_ESTRELLITA, cx, max(0, y0 - 2))]),
        ]
        anims = {k: (v, MS[k]) for k, v in a.items()}
        out.sprite(f"mascota/{m['id']}", g, f"Mascota {m['nombre']} ({m['rareza']})", anims)
        fichas.append({"id": f"mascota/{m['id']}", "especie": m["id"], "nombre": m["nombre"], "rol": "mascota",
                       "rareza": m["rareza"], "descripcion": m["desc"]})
    return fichas


# ======================================================================================
# ANFITRIONES (hacen las preguntas)
# ======================================================================================

ANF = [
    ("owl-librarian", "Ulula, búho bibliotecario", "rara", "Maestra principal: severa pero justa; pide silencio y luego te sopla la respuesta a medias.",
     {"ojos": [(11, 10, 3, 3), (18, 10, 3, 3)], "piel": "#8B5A2B", "linea": "#2A1A0E", "boca": (15, 14, 2), "cuello": 15}),
    ("mage", "Orlo, el mago", "rara", "Mago distraído que convierte cada pista en un truco de luz.",
     {"ojos": [(10, 12, 1, 2), (21, 12, 1, 2)], "piel": "#A8C8E0", "linea": "#1B1F3B", "boca": (15, 14, 2), "cuello": 16}),
    ("alchemist", "Retorta, la alquimista", "rara", "Impulsiva y curiosa; todo error es «un resultado interesante».",
     {"ojos": [], "piel": "#7A7A86", "boca": (15, 14, 2), "cuello": 15}),
    ("astronomer", "Zenit, el astrónomo", "legendaria", "Soñadora y precisa; mide el tiempo en órbitas.",
     {"ojos": [(13, 11, 1, 2), (18, 11, 1, 2)], "piel": "#C08A4A", "linea": "#2A1A0E", "boca": (15, 15, 2), "cuello": 16}),
    ("bard", "Solfa, el bardo", "comun", "Alegre y fanfarrón; convierte cada racha en una canción.",
     {"ojos": [(13, 11, 1, 2), (18, 11, 1, 2)], "piel": "#C08A4A", "linea": "#1B1F3B", "boca": (15, 15, 2), "cuello": 15}),
    ("druid", "Brezo, el druida", "rara", "Sereno y pausado; habla con refranes del bosque.",
     {"ojos": [(13, 11, 1, 2), (18, 11, 1, 2)], "piel": "#C08A4A", "linea": "#1B1F3B", "boca": (15, 16, 2), "cuello": 18}),
    ("pirate-cartographer", "Marea, la cartógrafa pirata", "rara", "Audaz y ordenada; nunca se pierde y no deja que te pierdas.",
     {"ojos": [(13, 11, 1, 2), (18, 11, 1, 2)], "piel": "#A86F3C", "linea": "#1B1F3B", "boca": (15, 15, 2), "cuello": 15}),
]
SKINS_ANF = {"owl-librarian": ["escriba", "invernal"], "bard": ["juglar", "tambor"]}


def anims_anfitrion(g: G, cfg: dict) -> dict[str, tuple[list[G], int]]:
    x0, y0, x1, y1 = g.bbox()
    con_ojos = bool(cfg.get("ojos"))
    hab = boca_abierta(g, cfg)
    bocadillo = ascii_(["aaaaaaa", "abbbbba", "abcbcba", "abbbbba", "aaaaaaa", ".a....."],
                       {"a": "#2A1A0E", "b": "#FFF6D8", "c": "#2A1A0E"})
    bx = min(25, x1 - 1)
    hablar = [
        g,
        particulas(hab, [(bocadillo, bx, 0)]),
        particulas(g, [(bocadillo, bx, 0)]),
        particulas(rebote(hab, 1), [(bocadillo, bx, 0)]),
    ]
    feliz_ojos = ojos_felices(g, cfg) if con_ojos else g
    feliz = [
        particulas(asiente(feliz_ojos, cfg), [(P_CHECK, min(27, x1), 2)]),
        particulas(feliz_ojos, [(P_CHECK, min(27, x1), 1), (P_DESTELLO, max(0, x0 - 1), 4)]),
    ]
    tri = ojos_tristes(g, cfg, 0) if con_ojos else g
    triste = [
        particulas(tri, [(P_SUDOR, min(29, x1), y0 + 4), (P_EXCLAMA, max(1, x0 - 2), 1)]),
        particulas(mueve(tri, 1, 0), [(P_SUDOR, min(29, x1), y0 + 6), (P_EXCLAMA, max(1, x0 - 2), 1)]),
    ]
    basicas = anims_basicas(g, cfg)
    return {"idle": (basicas["idle"], MS["idle"]), "hablar": (hablar, MS["hablar"]),
            "feliz": (feliz, 260), "triste": (triste, 300)}


def genera_anfitriones(out: Salida) -> list[dict]:
    fichas = []
    for id_, nombre, rareza, desc, cfg in ANF:
        g = cargar_svg(ELENCO / f"{id_}.svg")
        out.sprite(f"anfitrion/{id_}", g, nombre, anims_anfitrion(g, cfg))
        fichas.append({"id": f"anfitrion/{id_}", "nombre": nombre, "rol": "anfitrion", "rareza": rareza, "descripcion": desc})
        for skin in SKINS_ANF.get(id_, []):
            gs = cargar_svg(ELENCO / f"{id_}--skin-{skin}.svg")
            sid = f"{id_}-{skin}"
            out.sprite(f"anfitrion/{sid}", gs, f"{nombre} (skin {skin})", anims_anfitrion(gs, cfg))
            fichas.append({"id": f"anfitrion/{sid}", "nombre": f"{nombre.split(',')[0]} {skin}", "rol": "anfitrion",
                           "rareza": rareza, "descripcion": f"Skin «{skin}» de {nombre}.", "variante_de": f"anfitrion/{id_}"})
    return fichas


# ======================================================================================
# ENEMIGOS (nivel final)
# ======================================================================================

ENE = [
    # id, nombre, rareza, fuente idle, fuente herido (o None), extra
    ("ogre-green", "Ogro verde", "comun", FINAL / "ogre-green-idle.svg", FINAL / "ogre-green-hurt.svg", {}),
    ("ogre-erudito", "Ogro erudito", "comun", ELENCO / "ogre-green--skin-erudito.svg", None, {}),
    ("ogre-explorador", "Ogro explorador", "comun", ELENCO / "ogre-green--skin-explorador.svg", None, {}),
    ("imp-small", "Diablillo", "comun", FINAL / "imp-small-idle.svg", FINAL / "imp-small-hurt.svg", {}),
    ("skeleton-small", "Esqueleto", "comun", FINAL / "skeleton-small-idle.svg", FINAL / "skeleton-small-hurt.svg", {}),
    ("zombie", "Zombi", "comun", FINAL / "zombie-idle.svg", FINAL / "zombie-hurt.svg", {}),
    ("ghost", "Fantasma", "rara", ELENCO / "ghost.svg", None, {}),
    ("skeleton-big", "Esqueleto grande", "rara", ELENCO / "skeleton-big.svg", None, {}),
    ("demon-big", "Demonio grande", "rara", ELENCO / "demon-big.svg", None, {}),
    ("ogre-jefe", "Ogro jefe", "rara", FINAL / "ogre-green-idle.svg", None, {"jefe": "ogro"}),
    ("black-knight", "Ónix, el caballero negro", "legendaria", ELENCO / "black-knight.svg", None, {"jefe": "caballero"}),
]
OGRO_JEFE = {"#6BBF59": "#D8704A", "#3E8E41": "#A84A2A", "#1E3A1F": "#3A1410", "#2C5E2E": "#7A2A1A"}


def genera_enemigos(out: Salida) -> list[dict]:
    fichas = []
    for id_, nombre, rareza, fuente, f_herido, extra in ENE:
        g = cargar_svg(fuente)
        jefe = extra.get("jefe")
        if jefe == "ogro":
            g = recolor(g, OGRO_JEFE)
            _, y0, _, _ = g.bbox()
            corona = ascii_(["g..g..g", "gGgrgGg", "GGGGGGG"], {"g": "#FFE27A", "G": "#F2C230", "r": "#5FA8E8"})
            x0b, _, x1b, _ = g.bbox()
            g = pega(g, corona, (x0b + x1b) // 2 - 3, max(0, y0 - 3))
        x0, y0, x1, y1 = g.bbox()
        cx = (x0 + x1) // 2
        color_aura = {"ogro": "#E04848", "caballero": "#8F5FE0"}.get(jefe or "")

        def deco(fr: G, fase: int = 0) -> G:
            if not color_aura:
                return fr
            return aura(fr, color_aura, (0.5, 0.22) if fase == 0 else (0.35, 0.14))

        if f_herido:
            hg = cargar_svg(f_herido)
            herido = [particulas(mueve(tinte(hg, "#FFFFFF", 0.5), 1, 0), [(P_GOLPE, cx - 2, y0 + 5)]), hg]
        else:
            herido = [particulas(mueve(tinte(g, "#FFFFFF", 0.65), 1, 0), [(P_GOLPE, cx - 2, y0 + 5)]),
                      mueve(tinte(g, "#E04848", 0.35), 1, 0)]
        ataque = [
            mueve(rebote(g, 1), 2, 0),
            rayas_velocidad(mueve(tinte(g, "#FFF6D8", 0.12), -3, 0), "der", y0 + 6, y1 - 2),
            mueve(g, -1, 0),
        ]
        muerta = [
            tinte(g, "#FFFFFF", 0.8),
            particulas(alfa(tinte(rebote(g, 2), "#7A7A86", 0.6), 0.55), [(P_HUMO, cx - 6, y0 + 6), (P_HUMO, cx + 3, y0 + 10)]),
            particulas(G(32, 32), [(P_HUMO, cx - 5, y0 + 4), (P_HUMO, cx + 2, y0 + 8), (P_DESTELLO, cx, y0 + 2),
                                   (P_ESTRELLITA, cx - 8, y0 + 12)]),
        ]
        anims = {
            "idle": ([deco(g, 0), deco(rebote(g, 1), 1)], MS["idle"]),
            "herido": ([deco(h) for h in herido], MS["herido"]),
            "ataque": ([deco(a) for a in ataque], MS["ataque"]),
            "caminar": ([deco(mueve(g, 0, 0)), deco(rebote(mueve(g, -1, 0), 1), 1)], 220),
            "muerta": (muerta, 200),
        }
        out.sprite(f"enemigo/{id_}", deco(g), nombre, anims, bucle={"muerta": False})
        ficha = {"id": f"enemigo/{id_}", "nombre": nombre, "rol": "enemigo", "rareza": rareza}
        if jefe:
            ficha["jefe"] = True
        if id_.startswith("ogre-") and id_ != "ogre-green":
            ficha["variante_de"] = "enemigo/ogre-green"
        fichas.append(ficha)
    return fichas


# ======================================================================================
# ÍTEMS (16×16)
# ======================================================================================

A = "#2A1A0E"
ITEMS_ASCII: dict[str, tuple[str, list[str], dict[str, str]]] = {
    "botiquin": ("Botiquín", [
        "................",
        "................",
        ".....bbbbbb.....",
        "....bccccccb....",
        "....bcbbbbcb....",
        ".bbbbbbbbbbbbbb.",
        ".bddddddddddddb.",
        ".bdeeeeffeeeegb.",
        ".bdeeeeffeeeegb.",
        ".bdeeffffffeegb.",
        ".bdeeffffffeegb.",
        ".bdeeeeffeeeegb.",
        ".bdeeeeffeeeegb.",
        ".bggggggggggggb.",
        ".bbbbbbbbbbbbbb.",
        "................",
    ], {"b": A, "c": "#A3A3AE", "d": "#FF8A8A", "e": "#E04848", "f": "#FFF6D8", "g": "#8E1F1F"}),
    "lupa": ("Lupa", [
        "................",
        "....bbbbbb......",
        "...bccccccb.....",
        "..bcddddddcb....",
        ".bcdeedddddcb...",
        ".bcdeddddddcb...",
        ".bcddddddddcb...",
        ".bcddddddddcb...",
        ".bcdddddddfcb...",
        ".bcddddddffcb...",
        "..bcddddffcb....",
        "...bcccccccb....",
        "....bbbbbbbggb..",
        "..........bgggb.",
        "...........bggb.",
        "............bb..",
    ], {"b": A, "c": "#C08A4A", "d": "#8CC8F0", "e": "#FFFFFF", "f": "#5FA8E8", "g": "#8B5A2B"}),
    "moneda": ("Moneda", [
        "................",
        ".....bbbbbb.....",
        "...bbccccddbb...",
        "..bccdddddddeb..",
        "..bcddddddddeb..",
        ".bcddddeeddddeb.",
        ".bcdddeccedddeb.",
        ".bcddecdddeddeb.",
        ".bcddeddddeddeb.",
        ".bddddeddedddeb.",
        ".bdddddeeddddeb.",
        "..bdddddddddeeb.",
        "..bddddddddeeeb.",
        "...bbeeeeeeebb..",
        ".....bbbbbb.....",
        "................",
    ], {"b": "#7A5410", "c": "#FFF1A0", "d": "#F2C230", "e": "#C8941A"}),
    "pocion_tiempo": ("Poción de tiempo", [
        "................",
        "......bbbb......",
        "......bccb......",
        "......bccb......",
        ".....bbddbb.....",
        "......bddb......",
        ".....bddddb.....",
        "....bdeffffb....",
        "...bdeffefffb...",
        "...bfefffffgb...",
        "...bfffhhffgb...",
        "...bgffhfffgb...",
        "...bgfffffggb...",
        "....bggggggb....",
        ".....bbbbbb.....",
        "................",
    ], {"b": "#1B1F3B", "c": "#8B5A2B", "d": "#CFE8F5", "e": "#FFFFFF", "f": "#3FD0E0", "g": "#1F8FB0",
        "h": "#FFF6D8"}),
    "pocion_resurreccion": ("Poción de resurrección", [
        "................",
        "......aaaa......",
        "......abba......",
        "......aaaa......",
        "......agga......",
        ".....aaggaa.....",
        "ww..aPPpppPa..ww",
        "wWw.aPhhphhpa.Ww",
        ".wWaPhhhhhhhpaW.",
        "..waPphhhhhppaw.",
        "...apPphhhpppa..",
        "...apppphpppqa..",
        "...aqppppppqqa..",
        "....aqqqqqqqa...",
        ".....aaaaaaa....",
        "................",
    ], {"a": A, "b": "#A86F3C", "g": "#CFE8F5", "p": "#E04870", "P": "#FF8AB0", "q": "#A0284A",
        "h": "#FFF6D8", "w": "#FFF6D8", "W": "#F2C230"}),
    "comida": ("Comida de mascota", [
        "................",
        "......aa.aa.....",
        ".....ahhahha....",
        ".....ahhhhha....",
        "......ahhha.....",
        ".......aha......",
        "....aakkkkkaa...",
        "..aakkKkkKkkkaa.",
        ".akKkkkkKkkkKkka",
        ".aRRRRRRRRRRRRRa",
        ".aRWWWWWWWWWWWRa",
        ".aRRRRRRRRRRRRRa",
        "..arrrrrrrrrrra.",
        "...aaaaaaaaaaa..",
        "................",
        "................",
    ], {"a": A, "h": "#FF8A8A", "k": "#A86F3C", "K": "#5C3A1A", "R": "#E04848", "W": "#FFF6D8", "r": "#8E1F1F"}),
    "escudo": ("Escudo de color", [
        "................",
        "..aaaaaaaaaaaa..",
        "..agggggggggga..",
        "..agWRYYGGBBga..",
        "..agRRYYGGBBga..",
        "..agRRYYGGBBga..",
        "..agRRYYGGBBga..",
        "..agRRYYGGBBga..",
        "...agRYYGGBga...",
        "...agRYYGGBga...",
        "....agYYGGga....",
        ".....agYGga.....",
        "......agga......",
        ".......aa.......",
        "................",
        "................",
    ], {"a": A, "g": "#F2C230", "W": "#FFFFFF", "R": "#E04848", "Y": "#F2C230", "G": "#58C94A", "B": "#3F7FE0"}),
    "gema": ("Gema", [
        "................",
        "................",
        ".....aaaaaa.....",
        "....aWccCCda....",
        "...aWcccCCCda...",
        "..aaaaaaaaaaaa..",
        "..aWccCCCCCdda..",
        "...acCCCCCdda...",
        "....acCCCCda....",
        ".....acCCda.....",
        "......aCda......",
        ".......aa.......",
        "................",
        "................",
        "................",
        "................",
    ], {"a": "#14102A", "W": "#FFFFFF", "c": "#8FD8F0", "C": "#4AA8D0", "d": "#2A6FA0"}),
}


def genera_items(out: Salida) -> None:
    for id_, (nombre, filas, ley) in ITEMS_ASCII.items():
        assert all(len(f) == 16 for f in filas) and len(filas) == 16, id_
        g = ascii_(filas, ley)
        out.sprite(f"item/{id_}", g, nombre, lado=16)


# ======================================================================================
# ÍCONOS (16×16)
# ======================================================================================


def corazon(relleno: str, sombra: str, brillo: str) -> G:
    g = G(16, 16)
    for y in range(16):
        for x in range(16):
            X = (x + 0.5 - 8) / 6.6
            Y = (7.2 - y - 0.5) / 6.2
            if (X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 <= 0:
                g.set(x, y, sombra if Y < -0.45 or X > 0.55 else relleno)
    g.set(4, 4, brillo)
    g.set(4, 5, brillo)
    g.set(5, 4, brillo)
    return contorno(g, "#2A1A0E")


def engrane() -> G:
    g = G(16, 16)
    for y in range(16):
        for x in range(16):
            dx, dy = x + 0.5 - 8, y + 0.5 - 8
            d = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)
            diente = math.cos(8 * ang) > 0.25
            if (d <= 5 or (d <= 6.8 and diente)) and d > 2.1:
                g.set(x, y, "#7A7A86" if dy > 1 else "#A3A3AE")
    return contorno(g, "#2A1A0E")


def circulo(r: float, color: str) -> G:
    g = G(16, 16)
    for y in range(16):
        for x in range(16):
            if math.hypot(x + 0.5 - 8, y + 0.5 - 8) <= r:
                g.set(x, y, color)
    return g


def espadas() -> G:
    g = G(16, 16)
    for t in range(1, 10):
        g.set(t, t, "#FFFFFF")
        g.set(t + 1, t, "#A3A3AE")
    for x, y in ((9, 11), (10, 10), (11, 9)):
        g.set(x, y, "#F2C230")
    g.set(11, 11, "#8B5A2B")
    g.set(12, 12, "#8B5A2B")
    g.set(13, 13, "#F2C230")
    g = pega(g, espejo(g))
    return contorno(g, "#2A1A0E")


def martillo() -> G:
    g = G(16, 16)
    for t in range(5, 14):
        g.set(t, t, "#A86F3C")
        g.set(t + 1, t, "#8B5A2B")
    cabeza = ascii_(["..ab....", ".aabb...", "aaabbb..", ".aaabbb.", "..aaabb.", "...aab..", "....b..."],
                    {"a": "#A3A3AE", "b": "#7A7A86"})
    g = pega(g, cabeza, 1, 1)
    return contorno(g, "#2A1A0E")


def estrella(c1: str, c2: str) -> G:
    pts = []
    for i in range(10):
        r = 7.4 if i % 2 == 0 else 3.2
        ang = -math.pi / 2 + i * math.pi / 5
        pts.append((8 + r * math.cos(ang), 8.6 + r * math.sin(ang)))

    def dentro(px, py):
        c = False
        j = len(pts) - 1
        for i in range(len(pts)):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                c = not c
            j = i
        return c

    g = G(16, 16)
    for y in range(16):
        for x in range(16):
            if dentro(x + 0.5, y + 0.5):
                g.set(x, y, c2 if y > 9 else c1)
    g.set(7, 5, "#FFFFFF")
    return contorno(g, "#14102A")


def reloj() -> G:
    g = pega(circulo(7, "#C8941A"), circulo(5.6, "#FFF6D8"))
    for y in range(4, 9):
        g.set(8, y, "#2A1A0E")
    for x in range(8, 12):
        g.set(x, 8, "#2A1A0E")
    g.set(8, 8, "#E04848")
    for x, y in ((8, 2), (13, 8), (8, 13), (2, 8)):
        g.set(x, y, "#8B5A2B")
    return contorno(g, "#2A1A0E")


def ayuda() -> G:
    g = circulo(7, "#3F7FE0")
    for y in range(16):
        for x in range(16):
            if g.get(x, y) and y < 6 and x < 8:
                g.set(x, y, "#5FA8E8")
    q = ascii_(["..WWWW..", ".WW..WW.", ".....WW.", "....WW..", "...WW...", "...WW...", "........", "...WW..."],
               {"W": "#FFFFFF"})
    g = pega(g, q, 4, 4)
    return contorno(g, "#14102A")


def cabeza_heroe() -> G:
    idle = viste(cargar_svg(FINAL / "player-idle.svg"), TIERS[1])
    top, _ = ancla_heroe(idle)
    c = recorte(idle, 8, top, 16, 16)
    for y in range(12, 16):
        for x in range(16):
            c.d[y][x] = None if y > 12 else c.d[y][x]
    g, _, _ = coloca(c, 16, 16, abajo=1)
    return g


ICONOS_ASCII = {
    "inicio": ("Inicio", [
        "................",
        ".......aa.......",
        "......aRRa......",
        ".....aRRRRa.....",
        "....aRRRRRRa....",
        "...aRRRRRRRRa...",
        "..aRrRRRRRRrRa..",
        ".aaaaaaaaaaaaaa.",
        "..aWWWWWWWWWWa..",
        "..aWBBWWWWddWa..",
        "..aWBBWWWWddWa..",
        "..aWWWWWWWddWa..",
        "..aWWWWWWWddWa..",
        "..aaaaaaaaaaaa..",
        "................",
        "................",
    ], {"a": A, "R": "#E04848", "r": "#8E1F1F", "W": "#C08A4A", "B": "#8CC8F0", "d": "#5C3A1A"}),
    "tienda": ("Tienda", [
        "................",
        ".aaaaaaaaaaaaaa.",
        ".aRWRWRWRWRWRWa.",
        ".aRWRWRWRWRWRWa.",
        ".aaaaaaaaaaaaaa.",
        "..a.a.a.a.a.a...",
        "..a..........a..",
        "..a..mm..gg..a..",
        "..a.mMMm.gG..a..",
        ".aaaaaaaaaaaaaa.",
        ".aWWWWWWWWWWWWa.",
        ".aWddWWWWWWddWa.",
        ".aWWWWWWWWWWWWa.",
        ".aaaaaaaaaaaaaa.",
        "................",
        "................",
    ], {"a": A, "R": "#E04848", "W": "#FFF6D8", "m": "#F2C230", "M": "#C8941A", "g": "#8FD8F0", "G": "#4AA8D0",
        "d": "#8B5A2B"}),
    "rayo": ("Racha", [
        "................",
        ".........YYY....",
        "........yYY.....",
        ".......yYY......",
        "......yYY.......",
        ".....yYYYYYY....",
        "....yYYYYYY.....",
        ".......YYY......",
        "......YYY.......",
        ".....YYY........",
        "....YY..........",
        "...Y............",
        "................",
        "................",
        "................",
        "................",
    ], {"Y": "#F2C230", "y": "#FFF1A0"}),
    "candado": ("Bloqueado", [
        "................",
        "................",
        ".....SSSSSS.....",
        "....SS....SS....",
        "....SS....SS....",
        "....SS....SS....",
        "...GGGGGGGGGG...",
        "...GyGGGGGGGG...",
        "...GGGGkkGGGG...",
        "...GGGGkkGGGG...",
        "...ggggkkgggg...",
        "...gggggggggg...",
        "...gggggggggg...",
        "................",
        "................",
        "................",
    ], {"S": "#A3A3AE", "G": "#F2C230", "y": "#FFF1A0", "g": "#C8941A", "k": "#2A1A0E"}),
    "flecha": ("Siguiente", [
        "................",
        "................",
        "................",
        "........A.......",
        "........AA......",
        "........AAA.....",
        "..yyyyyyAAAA....",
        "..AAAAAAAAAAA...",
        "..AAAAAAAAAAA...",
        "..aaaaaaaAAA....",
        "........aAA.....",
        "........aA......",
        "........a.......",
        "................",
        "................",
        "................",
    ], {"A": "#F2C230", "y": "#FFF1A0", "a": "#C8941A"}),
}


def genera_iconos(out: Salida) -> None:
    for id_, (nombre, filas, ley) in ICONOS_ASCII.items():
        assert all(len(f) == 16 for f in filas) and len(filas) == 16, id_
        g = ascii_(filas, ley)
        if id_ in ("rayo", "candado", "flecha"):
            g = contorno(g, "#2A1A0E")
        out.sprite(f"icono/{id_}", g, nombre, lado=16)
    extras = {
        "arena": ("Arena", espadas()),
        "taller": ("Taller", martillo()),
        "perfil": ("Perfil", cabeza_heroe()),
        "ajustes": ("Ajustes", engrane()),
        "corazon": ("Vida", corazon("#E04848", "#8E1F1F", "#FFFFFF")),
        "corazon-vacio": ("Vida perdida", corazon("#4A4A55", "#2B2F55", "#7A7A86")),
        "xp": ("Experiencia", estrella("#8FB8FF", "#3F7FE0")),
        "reloj": ("Tiempo", reloj()),
        "ayuda": ("Ayuda", ayuda()),
    }
    for id_, (nombre, g) in extras.items():
        out.sprite(f"icono/{id_}", g, nombre, lado=16)
    # íconos que son el mismo dibujo que un ítem
    for id_, item in (("moneda", "moneda"), ("gema", "gema"), ("escudo", "escudo"), ("comida", "comida"),
                      ("pocion", "pocion_resurreccion"), ("lupa", "lupa"), ("botiquin", "botiquin")):
        nombre, filas, ley = ITEMS_ASCII[item]
        out.sprite(f"icono/{id_}", ascii_(filas, ley), nombre, lado=16)


# ======================================================================================
# COFRES (de la hoja de apertura del autor) y EFECTOS
# ======================================================================================


def genera_cofres(out: Salida) -> None:
    for id_, fuente, nombre in (("normal", "chest-normal", "Cofre normal"), ("legendario", "chest-legendary", "Cofre legendario")):
        hoja = cargar_svg(UI_SITIO / f"{fuente}-hoja.svg")
        frames = [recorte(hoja, 32 * i, 0, 32, 32) for i in range(4)]
        cerrado = frames[0]
        leg = id_ == "legendario"
        brillo = "#FFE27A" if leg else "#FFF6D8"
        x0, y0, x1, y1 = cerrado.bbox()
        idle = [cerrado, particulas(mueve(cerrado, 0, -1) if not leg else cerrado,
                                    [(P_DESTELLO, x1 - 3, y0 + 1)] + ([(P_ESTRELLITA, x0 + 2, y0 - 1)] if leg else []))]
        tiembla = [mueve(cerrado, -1, 0), mueve(cerrado, 1, 0)]
        final = frames[3]
        rafaga = [(P_DESTELLO_G, 5, 2), (P_DESTELLO, 24, 1), (P_ESTRELLITA, 15, 0), (P_DESTELLO, 2, 12),
                  (P_DESTELLO_G, 25, 9)]
        abrir = tiembla + frames[1:] + [particulas(aura(final, brillo, (0.6, 0.3)) if leg else final, rafaga)]
        out.sprite(f"cofre/{id_}", cerrado, nombre,
                   {"idle": (idle, 700), "abrir": (abrir, MS["abrir"])}, bucle={"abrir": False})


def genera_efectos(out: Salida) -> None:
    falta = ascii_([
        "................................",
        "................................",
        "................................",
        "................................",
        "....aa.aa.aa.aa.aa.aa.aa.aa.....",
        "....a......................a....",
        "...........................a....",
        "....a.......................a...",
        "....a........bbbbbb.........a...",
        ".............bbbbbbbb...........",
        "............bbb....bbb......a...",
        "....a..............bbb......a...",
        "....a.............bbb...........",
        "................bbbb............",
        "...............bbb..........a...",
        "....a..........bbb..........a...",
        "....a...........................",
        "...............bbb..............",
        "...............bbb..........a...",
        "....a.......................a...",
        "....a...........................",
        "................................",
        "....aa.aa.aa.aa.aa.aa.aa.aa.....",
    ], {"a": "#A3A3AE", "b": "#F2C230"})
    falta = contorno(falta, "#2A1A0E")
    out.sprite("efecto/falta", mueve(falta, 0, 4), "Sprite no encontrado")
    destellos = [particulas(G(32, 32), [(P_DESTELLO_G, 4 + 9 * i % 22, 3 + 7 * ((i + f) % 4)) for i in range(4)] +
                            [(P_DESTELLO, (13 + 11 * i + 5 * f) % 28, (6 + 9 * i + 4 * f) % 28) for i in range(3)])
                 for f in range(3)]
    out.sprite("efecto/destellos", destellos[0], "Destellos", {"idle": (destellos, 160)})
    colores = ["#E04848", "#F2C230", "#58C94A", "#3F7FE0", "#C9B8FF", "#FF8AB0"]
    confeti = []
    for f in range(4):
        g = G(32, 32)
        for i in range(22):
            x = (i * 7 + 3) % 30 + (1 if (i + f) % 2 else 0)
            y = (i * 5 + f * 6) % 30
            g.set(x, y, colores[i % len(colores)])
            if i % 3 == 0:
                g.set(x + 1, y, colores[i % len(colores)])
        confeti.append(g)
    out.sprite("efecto/confeti", confeti[0], "Confeti", {"idle": (confeti, 140)})
    corazones = [particulas(G(32, 32), [(P_CORAZON, 6, 20 - 6 * f), (P_CORAZON_C, 20, 24 - 5 * f), (P_CORAZON, 14, 12 - 4 * f)])
                 for f in range(3)]
    out.sprite("efecto/corazones", corazones[0], "Corazones", {"idle": (corazones, 220)})
    genera_efectos_extra(out)


def genera_efectos_extra(out: Salida) -> None:
    """Destello único, estrella, chispa, moneda girando y +XP (16×16 o 32×32, sin bucle salvo la moneda)."""
    # destello: crece, brilla y se apaga (32×32)
    tam = [(1, 0.9), (3, 1.0), (5, 1.0), (3, 0.7), (1, 0.4)]
    frames = []
    for r, a in tam:
        g = G(32, 32)
        for k in range(-r * 2, r * 2 + 1):
            g.set(16 + k, 16, "#FFE27A", round(a * (1 - abs(k) / (r * 2 + 1)), 2))
            g.set(16, 16 + k, "#FFE27A", round(a * (1 - abs(k) / (r * 2 + 1)), 2))
        for k in range(-r, r + 1):
            g.set(16 + k, 16 + k, "#FFF1A0", round(a * 0.6, 2))
            g.set(16 + k, 16 - k, "#FFF1A0", round(a * 0.6, 2))
        g.set(16, 16, "#FFFFFF", a)
        frames.append(g)
    out.sprite("efecto/destello", frames[2], "Destello", {"idle": (frames, 70)}, bucle={"idle": False})
    # estrella que gira (pulsa) 16×16
    e1 = estrella("#FFE27A", "#F2C230")
    e2 = pega(G(16, 16), recorte(estrella("#FFF1A0", "#FFE27A"), 0, 0, 16, 16))
    e3 = aura(e1, "#FFF1A0", (0.5,))
    out.sprite("efecto/estrella", e1, "Estrella", {"idle": ([e1, e3, e2, e3], 120)}, lado=16)
    # chispa: 4 partículas que salen del centro (16×16)
    chispa = []
    for f in range(4):
        g = G(16, 16)
        d = 1 + f * 2
        a = round(1 - f * 0.22, 2)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            g.set(8 + dx * d, 8 + dy * d, "#FFF1A0", a)
            g.set(8 + dx * (d - 1), 8 + dy * (d - 1), "#F2C230", round(a * 0.7, 2))
        for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            g.set(8 + dx * (d // 2 + 1), 8 + dy * (d // 2 + 1), "#FF9A3A", round(a * 0.8, 2))
        if f == 0:
            g.set(8, 8, "#FFFFFF")
        chispa.append(g)
    out.sprite("efecto/chispa", chispa[0], "Chispa", {"idle": (chispa, 80)}, lado=16, bucle={"idle": False})
    # moneda girando (6 frames, 16×16): se estrecha y se ensancha
    nombre, filas, ley = ITEMS_ASCII["moneda"]
    base = ascii_(filas, ley)
    giro = []
    for ancho in (14, 10, 4, 2, 4, 10):
        g = G(16, 16)
        for y in range(16):
            for x in range(16):
                sx = round(8 + (x + 0.5 - 8) * 14 / ancho - 0.5)
                if abs(x + 0.5 - 8) <= ancho / 2 + 0.01:
                    p = base.get(sx, y)
                    if p:
                        g.d[y][x] = p
        if ancho <= 2:
            for y in range(2, 14):
                g.set(7, y, "#C8941A")
                g.set(8, y, "#7A5410")
        giro.append(g)
    out.sprite("efecto/moneda", giro[0], "Moneda girando", {"idle": (giro, 90)}, lado=16)
    # +XP que sube y se desvanece (32×32)
    texto = ascii_([
        "..a..aa...aa.aaaa.",
        "..a...aa.aa..a..aa",
        "aaaaa..aaa...a..aa",
        "..a...aa.aa..aaaa.",
        "..a..aa...aa.a....",
    ], {"a": "#8FB8FF"})
    texto = contorno(texto, "#14102A")
    xp = []
    for f, (dy, a) in enumerate(((22, 1.0), (18, 1.0), (14, 1.0), (11, 0.7), (9, 0.35))):
        g = pega(G(32, 32), alfa(texto, a) if a < 1 else texto, 6, dy - 3)
        if f in (1, 2):
            g = particulas(g, [(P_ESTRELLITA, 4, dy - 4), (P_ESTRELLITA, 27, dy + 2)])
        xp.append(g)
    out.sprite("efecto/xp", xp[2], "+XP", {"idle": (xp, 110)}, bucle={"idle": False})


# ======================================================================================
# Catálogo del backend (espejo) y galería
# ======================================================================================


def catalogo_backend(repo: Path) -> list[dict]:
    """Lee CATALOGO de backend/app/game/recompensas.py sin importarlo (solo regex)."""
    src = (repo / "backend" / "app" / "game" / "recompensas.py").read_text(encoding="utf-8")
    bloque = src.split("CATALOGO:")[1].split(")\n)")[0]
    items = []
    renombres = {"comida_mascota": "comida", "escudo_color": "escudo"}  # = app/play/ids.py
    for m in re.finditer(r'ItemDef\("([^"]+)",\s*"([^"]+)",\s*R\.(\w+)(?:,\s*(\w+))?(?:,\s*"([^"]+)")?\)', bloque):
        id_, nombre, rareza, clase, especie = m.groups()
        es_mascota = clase == "M"
        items.append({
            "id": id_,
            "item_id": f"mascota_{especie}" if es_mascota else renombres.get(id_, id_),
            "nombre": nombre,
            "rareza": {"COMUN": "comun", "RARA": "rara", "LEGENDARIA": "legendaria"}[rareza],
            "clase": "mascota" if es_mascota else "consumible",
            "especie": especie,
        })
    return items


def galeria(out: Salida, fichas: list[dict]) -> str:
    nombres = {f["id"]: f["nombre"] for f in fichas}
    rarezas = {f["id"]: f.get("rareza", "") for f in fichas}
    grupos: dict[str, list[str]] = {}
    for n in out.manifiesto:
        grupos.setdefault(n.split("/")[0], []).append(n)
    titulos = {"heroe": "Héroe (6 atuendos)", "mascota": "Mascotas", "anfitrion": "Anfitriones",
               "enemigo": "Enemigos del nivel final", "cofre": "Cofres", "item": "Ítems", "icono": "Íconos",
               "efecto": "Efectos"}
    tiers = {f"heroe/{t['id']}": t["nombre"] for t in TIERS}
    datos = json.dumps(out.manifiesto, ensure_ascii=False, separators=(",", ":"))
    secciones = []
    for g in ("heroe", "mascota", "anfitrion", "enemigo", "cofre", "item", "icono", "efecto"):
        tarjetas = []
        for n in grupos.get(g, []):
            info = out.manifiesto[n]
            etiqueta = nombres.get(n) or tiers.get(n) or info.get("titulo") or n.split("/")[1]
            anims = list(info["anims"]) or ["(estático)"]
            celdas = "".join(
                f'<figure><img data-s="{n}" data-a="{a}" alt="{etiqueta} {a}"><figcaption>{a}</figcaption></figure>'
                for a in anims)
            clase = f'tarjeta {rarezas.get(n, "")}{" s16" if info["lado"] == 16 else ""}'
            tarjetas.append(f'<div class="{clase}"><h3>{etiqueta}<small>{n}</small></h3><div class="fila">{celdas}</div></div>')
        envoltura = ' class="rejilla"' if g in ("item", "icono") else ""
        secciones.append(f'<section id="{g}"><h2>{titulos[g]}</h2><div{envoltura}>{"".join(tarjetas)}</div></section>')
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Galería de arte</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{{--noche:#1E2529;--pizarra:#2D373C;--acero:#3D4A51;--piedra:#566972;--niebla:#BDC8CD;--texto:#EEF2F3;
--oro:#D9A93A;--oro-c:#F2D27A;--oro-s:#A87A1E;--comun:#B8B8B8;--rara:#3F7FE0;--legendaria:#F2A81D}}
body.claro{{--pizarra:#BDC8CD;--acero:#EEF2F3;--noche:#8196A0;--texto:#1E2529;--niebla:#3D4A51}}
*{{box-sizing:border-box}}
body{{margin:0;padding:16px;background:var(--pizarra);color:var(--texto);font:16px/1.5 "Pixelify Sans",ui-monospace,monospace}}
header{{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}}
h1{{font-size:24px;margin:0;color:var(--oro-c);text-shadow:2px 2px 0 var(--noche);flex-basis:100%}}
h2{{font-size:20px;margin:24px 0 8px;padding-bottom:4px;border-bottom:4px solid var(--oro);color:var(--texto)}}
h3{{font-size:16px;margin:0 0 4px;display:flex;flex-wrap:wrap;gap:0 8px;align-items:baseline}}
h3 small{{color:var(--niebla);font-size:13px;font-weight:400}}
h3 small{{overflow-wrap:anywhere}} body.claro h1{{color:#4A3510;text-shadow:none}}
.tarjeta{{background:var(--acero);border:4px solid var(--noche);box-shadow:inset 0 -4px 0 rgba(0,0,0,.2);padding:8px;margin:8px 0}}
.tarjeta.rara{{border-color:var(--rara)}} .tarjeta.legendaria{{border-color:var(--legendaria)}}
.fila{{display:flex;flex-wrap:wrap;gap:4px}}
figure{{margin:0;text-align:center}} figcaption{{color:var(--niebla);font-size:13px}}
img{{width:96px;height:96px;image-rendering:pixelated;display:block}}
.s16 img{{width:64px;height:64px}}
.rejilla{{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}}
.rejilla .tarjeta{{margin:0}}
button{{font:inherit;padding:4px 12px;background:var(--oro);color:#1E2529;border:4px solid #4A3510;box-shadow:inset -3px -3px 0 var(--oro-s),inset 3px 3px 0 var(--oro-c);cursor:pointer}}
button:focus-visible{{outline:3px solid var(--oro-c);outline-offset:2px}}
.nota{{color:var(--niebla);font-size:13px;flex-basis:100%}}
</style></head>
<body>
<header><h1>Pixtart · galería de arte</h1>
<button id="tema">Fondo claro/oscuro</button><button id="pausa">Pausar</button>
<span class="nota">Generado por frontend/herramientas/generar_sprites.py · filtra con ?solo=mascota (o heroe, anfitrion, enemigo, cofre, item, icono, efecto) y ?claro</span></header>
{"".join(secciones)}
<script>
const M={datos};
let pausa=matchMedia('(prefers-reduced-motion: reduce)').matches,t=0;
const imgs=[...document.querySelectorAll('img[data-s]')];
function src(n,a,f){{const i=M[n].anims[a];return i?`${{n}}-${{a}}-f${{f+1}}.svg`:`${{n}}.svg`;}}
function pinta(){{for(const im of imgs){{const n=im.dataset.s,a=im.dataset.a,i=M[n].anims[a];
 let f=0;if(i){{const k=Math.floor(t/i.ms);f=i.bucle===false?Math.min(k%(i.frames+6),i.frames-1):k%i.frames;}}
 const s=src(n,a,f);if(im.getAttribute('src')!==s)im.setAttribute('src',s);}}}}
pinta();setInterval(()=>{{if(!pausa){{t+=40;pinta();}}}},40);
document.getElementById('tema').onclick=()=>document.body.classList.toggle('claro');
document.getElementById('pausa').onclick=()=>pausa=!pausa;
const Q=new URLSearchParams(location.search);if(Q.has('claro'))document.body.classList.add('claro');
const solo=Q.get('solo');if(solo)for(const sec of document.querySelectorAll('section'))if(sec.id!==solo)sec.hidden=true;
</script></body></html>
"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", type=Path, default=AQUI.parents[1], help="raíz del repo de Pixtart")
    args = ap.parse_args()
    repo = args.repo.resolve()
    sprites = repo / "frontend" / "public" / "sprites"
    for sub in ("heroe", "mascota", "anfitrion", "enemigo", "item", "icono", "cofre", "efecto"):
        shutil.rmtree(sprites / sub, ignore_errors=True)
    out = Salida(sprites)
    genera_heroe(out)
    fichas = genera_mascotas(out)
    fichas += genera_anfitriones(out)
    fichas += genera_enemigos(out)
    genera_items(out)
    genera_iconos(out)
    genera_cofres(out)
    genera_efectos(out)
    heroes = [{"id": f"heroe/{t['id']}", "nombre": t["nombre"], "rol": "heroe", "tier": i + 1} for i, t in enumerate(TIERS)]
    arte = repo / "frontend" / "src" / "arte"
    manif = {"$comentario": "GENERADO por frontend/herramientas/generar_sprites.py — no editar a mano.",
             "sprites": dict(sorted(out.manifiesto.items())), "fichas": heroes + fichas}
    (arte / "manifiesto.json").write_text(json.dumps(manif, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    cat = {"$comentario": "Espejo de backend/app/game/recompensas.py CATALOGO (GENERADO; src/test/arte.test.tsx comprueba que cada ítem tenga sprite).",
           "items": catalogo_backend(repo)}
    (arte / "catalogo.json").write_text(json.dumps(cat, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (sprites / "galeria.html").write_text(galeria(out, heroes + fichas), encoding="utf-8")
    n = sum(1 + sum(a["frames"] for a in i["anims"].values()) for i in out.manifiesto.values())
    print(f"{len(out.manifiesto)} sprites, {n} archivos SVG en {sprites}")


if __name__ == "__main__":
    main()
