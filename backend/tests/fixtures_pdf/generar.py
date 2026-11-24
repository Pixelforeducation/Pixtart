"""Generador mínimo de PDFs de texto (sin reportlab): una página por elemento de `paginas`.
Una página con texto vacío simula una página escaneada (sin capa de texto)."""


def _escapar(t: str) -> str:
    return t.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def pdf_texto(paginas: list[str]) -> bytes:
    objetos: list[bytes] = []
    n = len(paginas)
    # 1 catálogo, 2 páginas, 3 fuente, luego (página, contenido) por cada página
    kids = " ".join(f"{4 + 2 * i} 0 R" for i in range(n))
    objetos.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objetos.append(f"<< /Type /Pages /Kids [{kids}] /Count {n} >>".encode())
    objetos.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for i, texto in enumerate(paginas):
        lineas = texto.split("\n") if texto else []
        cuerpo = "BT /F1 11 Tf 14 TL 40 800 Td " + " ".join(
            f"({_escapar(linea)}) Tj T*" for linea in lineas
        ) + " ET"
        contenido = cuerpo.encode("latin-1")
        objetos.append(
            (
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
                f"/Resources << /Font << /F1 3 0 R >> >> /Contents {5 + 2 * i} 0 R >>"
            ).encode()
        )
        objetos.append(
            f"<< /Length {len(contenido)} >>\nstream\n".encode() + contenido + b"\nendstream"
        )
    salida = bytearray(b"%PDF-1.4\n")
    offsets = []
    for num, obj in enumerate(objetos, start=1):
        offsets.append(len(salida))
        salida += f"{num} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(salida)
    salida += f"xref\n0 {len(objetos) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        salida += f"{off:010d} 00000 n \n".encode()
    salida += (
        f"trailer\n<< /Size {len(objetos) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(salida)


def apuntes(n_paginas: int = 3) -> bytes:
    """PDF de apuntes con suficiente texto por página (> 50 caracteres)."""
    return pdf_texto(
        [
            f"Capitulo {i}: Expresiones regulares\n"
            f"Un cuantificador como + indica una o mas repeticiones del elemento anterior.\n"
            f"Pagina {i} con contenido de estudio suficiente para extraer texto."
            for i in range(1, n_paginas + 1)
        ]
    )
