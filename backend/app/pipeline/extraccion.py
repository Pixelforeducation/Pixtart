"""Validación del PDF y extracción de texto por página (pypdf), con OCR opcional."""

import io
import logging
import re
import shutil
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass

from pypdf import PdfReader
from pypdf.errors import PdfReadError

log = logging.getLogger(__name__)

MAX_BYTES = 25 * 1024 * 1024  # por archivo
MAX_BYTES_TOTAL = 100 * 1024 * 1024  # suma de todos los archivos de una petición
MAX_ARCHIVOS = 10
MAX_PAGINAS_TOTAL = 600  # suma de páginas de todos los archivos (un solo PDF incluido)
MAX_NOMBRE = 120
MIN_CARACTERES_PAGINA = 50  # menos que esto → probablemente escaneada


class PDFInvalido(ValueError):
    """El archivo no es aceptable. El mensaje es para el usuario."""


class OCRNoDisponible(RuntimeError):
    pass


@dataclass
class Pagina:
    numero: int  # 1-based
    texto: str
    ocr: bool = False


# (datos_pdf, numeros_de_pagina) -> {numero: texto}
ExtractorOCR = Callable[[bytes, list[int]], dict[int, str]]


def _lector(datos: bytes) -> PdfReader:
    try:
        lector = PdfReader(io.BytesIO(datos))
    except (PdfReadError, ValueError, OSError, KeyError, TypeError) as e:
        raise PDFInvalido("No se pudo leer el PDF: el archivo está dañado.") from e
    if lector.is_encrypted:
        raise PDFInvalido("El PDF está protegido con contraseña; súbelo sin cifrar.")
    return lector


def sanear_nombre(nombre: str | None) -> str:
    """Nombre de archivo apto para mostrar y para ir en el prompt: sin ruta, sin caracteres de
    control ni de marcado (`<>"'&` y similares), espacios colapsados, acotado y con `.pdf`."""
    base = re.split(r"[\\/]", nombre or "")[-1]
    base = unicodedata.normalize("NFC", base)
    base = "".join(
        " " if unicodedata.category(c)[0] in "CZ" else c for c in base
    )
    base = re.sub(r"[<>\"'`&{}\[\]|;$]", "_", base)
    base = re.sub(r"\s+", " ", base).strip(" .")
    if not base:
        return "documento.pdf"
    raiz, ext = (base[:-4], base[-4:]) if base.lower().endswith(".pdf") else (base, ".pdf")
    raiz = raiz.strip(" .")[: MAX_NOMBRE - 4] or "documento"
    return raiz + ext


def validar_pdf(datos: bytes) -> int:
    """Comprueba tamaño, firma y número de páginas de UN archivo. Devuelve sus páginas.
    Los límites del conjunto (total de bytes y de páginas) los comprueba el router."""
    if len(datos) > MAX_BYTES:
        raise PDFInvalido("El PDF supera el máximo de 25 MB.")
    if not datos.startswith(b"%PDF-"):
        raise PDFInvalido("El archivo no es un PDF.")
    lector = _lector(datos)
    try:
        n = len(lector.pages)
    except (PdfReadError, ValueError, KeyError, TypeError) as e:
        raise PDFInvalido("No se pudo leer el PDF: el archivo está dañado.") from e
    if n == 0:
        raise PDFInvalido("El PDF no tiene páginas.")
    if n > MAX_PAGINAS_TOTAL:
        raise PDFInvalido(f"El PDF tiene {n} páginas; el máximo es {MAX_PAGINAS_TOTAL}.")
    return n


def extraer_texto(datos: bytes) -> list[Pagina]:
    lector = _lector(datos)
    paginas = []
    for i, p in enumerate(lector.pages, start=1):
        try:
            texto = p.extract_text() or ""
        except Exception:  # noqa: BLE001 - una página rota no tumba todo el PDF
            log.warning("no se pudo extraer texto de la página %d", i)
            texto = ""
        paginas.append(Pagina(i, texto.strip()))
    return paginas


def paginas_escaneadas(paginas: list[Pagina]) -> list[int]:
    return [p.numero for p in paginas if len(p.texto) < MIN_CARACTERES_PAGINA]


def ocr_disponible() -> bool:
    try:
        import pdf2image  # noqa: F401
        import pytesseract  # noqa: F401
    except ImportError:
        return False
    return bool(shutil.which("tesseract") and shutil.which("pdftoppm"))


def ocr_tesseract(datos: bytes, numeros: list[int]) -> dict[int, str]:
    """OCR con tesseract (spa+eng). Requiere los binarios tesseract y poppler (en Docker)."""
    if not ocr_disponible():
        raise OCRNoDisponible("tesseract no está instalado")
    import pytesseract
    from pdf2image import convert_from_bytes

    resultado = {}
    for n in numeros:
        imagenes = convert_from_bytes(datos, dpi=200, first_page=n, last_page=n)
        resultado[n] = "\n".join(
            pytesseract.image_to_string(img, lang="spa+eng") for img in imagenes
        ).strip()
    return resultado


def aplicar_ocr(
    datos: bytes, paginas: list[Pagina], extractor: ExtractorOCR | None
) -> list[str]:
    """Pasa por OCR las páginas con poco texto. Devuelve avisos para el usuario."""
    pendientes = paginas_escaneadas(paginas)
    if not pendientes:
        return []
    if extractor is None:
        return [
            f"{len(pendientes)} página(s) parecen escaneadas y no hay OCR disponible; "
            "se omitió su contenido."
        ]
    try:
        textos = extractor(datos, pendientes)
    except OCRNoDisponible:
        return [
            f"{len(pendientes)} página(s) parecen escaneadas y no hay OCR disponible; "
            "se omitió su contenido."
        ]
    por_numero = {p.numero: p for p in paginas}
    for n, t in textos.items():
        if t and len(t.strip()) > len(por_numero[n].texto):
            por_numero[n].texto = t.strip()
            por_numero[n].ocr = True
    return []
