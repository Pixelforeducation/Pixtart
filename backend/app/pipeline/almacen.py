"""Almacén de PDFs. En producción MinIO/S3 (boto3); en tests, en memoria.

El PDF solo vive aquí mientras se procesa: la tarea lo borra al terminar (éxito o error).
"""

from typing import Protocol

from app.core.config import get_settings


class Almacen(Protocol):
    def guardar(self, clave: str, datos: bytes) -> None: ...
    def leer(self, clave: str) -> bytes: ...
    def borrar(self, clave: str) -> None: ...
    def existe(self, clave: str) -> bool: ...


class AlmacenMemoria:
    def __init__(self) -> None:
        self.objetos: dict[str, bytes] = {}

    def guardar(self, clave: str, datos: bytes) -> None:
        self.objetos[clave] = datos

    def leer(self, clave: str) -> bytes:
        try:
            return self.objetos[clave]
        except KeyError as e:
            raise FileNotFoundError(clave) from e

    def borrar(self, clave: str) -> None:
        self.objetos.pop(clave, None)

    def existe(self, clave: str) -> bool:
        return clave in self.objetos


class AlmacenDisco:
    """PDFs en una carpeta compartida (volumen Docker entre api y worker)."""

    def __init__(self, raiz: str | None = None) -> None:
        from pathlib import Path

        self.raiz = Path(raiz or get_settings().almacen_dir)
        self.raiz.mkdir(parents=True, exist_ok=True)

    def _ruta(self, clave: str):
        import re

        if not re.fullmatch(r"[A-Za-z0-9._/-]+", clave) or ".." in clave:
            raise ValueError("clave de almacén inválida")
        return self.raiz / clave

    def guardar(self, clave: str, datos: bytes) -> None:
        ruta = self._ruta(clave)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        tmp = ruta.with_suffix(ruta.suffix + ".tmp")
        tmp.write_bytes(datos)
        tmp.replace(ruta)

    def leer(self, clave: str) -> bytes:
        return self._ruta(clave).read_bytes()

    def borrar(self, clave: str) -> None:
        self._ruta(clave).unlink(missing_ok=True)

    def existe(self, clave: str) -> bool:
        return self._ruta(clave).is_file()


class AlmacenS3:
    def __init__(self) -> None:
        import boto3

        s = get_settings()
        self.bucket = s.s3_bucket
        self._s3 = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint,
            aws_access_key_id=s.s3_access_key,
            aws_secret_access_key=s.s3_secret_key,
        )
        self._bucket_listo = False

    def _asegurar_bucket(self) -> None:
        if self._bucket_listo:
            return
        from botocore.exceptions import ClientError

        try:
            self._s3.head_bucket(Bucket=self.bucket)
        except ClientError:
            self._s3.create_bucket(Bucket=self.bucket)
        self._bucket_listo = True

    def guardar(self, clave: str, datos: bytes) -> None:
        self._asegurar_bucket()
        self._s3.put_object(
            Bucket=self.bucket, Key=clave, Body=datos, ContentType="application/pdf"
        )

    def leer(self, clave: str) -> bytes:
        from botocore.exceptions import ClientError

        try:
            return self._s3.get_object(Bucket=self.bucket, Key=clave)["Body"].read()
        except ClientError as e:
            raise FileNotFoundError(clave) from e

    def borrar(self, clave: str) -> None:
        self._s3.delete_object(Bucket=self.bucket, Key=clave)

    def existe(self, clave: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._s3.head_object(Bucket=self.bucket, Key=clave)
            return True
        except ClientError:
            return False
