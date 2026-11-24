"""División del texto en fragmentos de ~6000 tokens aproximados, respetando páginas.

Cada fragmento pertenece a UN documento (`documento` = su nombre saneado): con varios PDFs se
divide cada uno por separado y las páginas se numeran dentro de su documento."""

from dataclasses import dataclass, field

from app.pipeline.extraccion import Pagina

TOKENS_POR_FRAGMENTO = 6000
CARACTERES_POR_TOKEN = 4  # aproximación para texto en español/inglés


def tokens_aprox(texto: str) -> int:
    return (len(texto) + CARACTERES_POR_TOKEN - 1) // CARACTERES_POR_TOKEN


@dataclass
class Fragmento:
    partes: list[tuple[int, str]] = field(default_factory=list)  # (página, texto)
    documento: str = ""

    @property
    def pagina_inicio(self) -> int:
        return self.partes[0][0]

    @property
    def pagina_fin(self) -> int:
        return self.partes[-1][0]

    @property
    def tokens(self) -> int:
        return sum(tokens_aprox(t) for _, t in self.partes)

    def como_texto(self) -> str:
        return "\n\n".join(f"[página {n}]\n{t}" for n, t in self.partes)


def dividir(
    paginas: list[Pagina], max_tokens: int = TOKENS_POR_FRAGMENTO, documento: str = ""
) -> list[Fragmento]:
    """Agrupa páginas consecutivas (de un mismo documento) sin pasar de `max_tokens`. Una
    página enorme se parte en trozos (cada trozo conserva su número de página). Las páginas
    vacías se omiten."""
    max_chars = max_tokens * CARACTERES_POR_TOKEN
    fragmentos: list[Fragmento] = []
    actual = Fragmento(documento=documento)
    for p in paginas:
        if not p.texto.strip():
            continue
        trozos = [p.texto[i : i + max_chars] for i in range(0, len(p.texto), max_chars)]
        for trozo in trozos:
            if actual.partes and actual.tokens + tokens_aprox(trozo) > max_tokens:
                fragmentos.append(actual)
                actual = Fragmento(documento=documento)
            actual.partes.append((p.numero, trozo))
    if actual.partes:
        fragmentos.append(actual)
    return fragmentos


def fragmentos_en_rango(
    fragmentos: list[Fragmento],
    inicio: int | None,
    fin: int | None,
    max_tokens: int,
    documento: str | None = None,
) -> list[Fragmento]:
    """Fragmentos que tocan [inicio, fin]; si no hay rango o no hay coincidencias, los
    primeros hasta `max_tokens`. Con `documento` (y si existe) solo se mira ese documento."""
    if documento is not None and any(f.documento == documento for f in fragmentos):
        fragmentos = [f for f in fragmentos if f.documento == documento]
    sel = []
    if inicio is not None and fin is not None:
        a, b = min(inicio, fin), max(inicio, fin)
        sel = [f for f in fragmentos if f.pagina_fin >= a and f.pagina_inicio <= b]
    if not sel:
        sel = fragmentos
    salida, total = [], 0
    for f in sel:
        if salida and total + f.tokens > max_tokens:
            break
        salida.append(f)
        total += f.tokens
    return salida
