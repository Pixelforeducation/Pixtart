/**
 * Capas de cada bioma (generadas por design/herramientas/generar_fondos.py en public/fondos/<bioma>/).
 * `d` = profundidad para el parallax (0 = no se mueve, 8 = primer plano).
 * `viva` = la capa trae clases animadas (.arbol, .nube, .flama…) y se inserta EN LÍNEA para que el CSS
 * las mueva; las demás se pintan como <img> (más baratas).
 * `particulas` = la capa es decorativa pura y se atenúa con `intensidad`.
 */
export interface Capa {
  archivo: string;
  d: number;
  viva?: boolean;
  particulas?: boolean;
}

export const CAPAS = {
  pradera: [
    { archivo: "1-cielo.svg", d: 1 },
    { archivo: "2-sol-nubes.svg", d: 2, viva: true },
    { archivo: "3-montanas.svg", d: 3 },
    { archivo: "4-colinas.svg", d: 4 },
    { archivo: "5-arboles.svg", d: 5, viva: true },
    { archivo: "6-pasto.svg", d: 7, viva: true },
    { archivo: "7-viento.svg", d: 8, viva: true, particulas: true },
  ],
  bosque: [
    { archivo: "1-cielo.svg", d: 1 },
    { archivo: "2-rayos.svg", d: 1, viva: true, particulas: true },
    { archivo: "3-troncos.svg", d: 3 },
    { archivo: "4-pinos.svg", d: 5, viva: true },
    { archivo: "5-suelo.svg", d: 7, viva: true },
    { archivo: "6-luciernagas.svg", d: 8, viva: true, particulas: true },
  ],
  biblioteca: [
    { archivo: "1-pared.svg", d: 1 },
    { archivo: "2-ventana.svg", d: 1, viva: true },
    { archivo: "3-estantes.svg", d: 3 },
    { archivo: "4-velas.svg", d: 3, viva: true },
    { archivo: "5-suelo.svg", d: 5 },
    { archivo: "6-polvo.svg", d: 7, viva: true, particulas: true },
  ],
  cueva: [
    { archivo: "1-fondo.svg", d: 0 },
    { archivo: "2-rocas.svg", d: 2 },
    { archivo: "3-cristales.svg", d: 4, viva: true },
    { archivo: "4-suelo.svg", d: 6, viva: true },
    { archivo: "5-gotas.svg", d: 7, viva: true, particulas: true },
  ],
  castillo: [
    { archivo: "1-cielo.svg", d: 0 },
    { archivo: "2-estrellas.svg", d: 1, viva: true },
    { archivo: "3-nubes.svg", d: 2, viva: true },
    { archivo: "4-castillo.svg", d: 4, viva: true },
    { archivo: "5-murcielagos.svg", d: 5, viva: true, particulas: true },
    { archivo: "6-antorchas.svg", d: 7, viva: true },
  ],
  noche: [
    { archivo: "1-cielo.svg", d: 0 },
    { archivo: "2-estrellas.svg", d: 1, viva: true },
    { archivo: "3-aurora.svg", d: 2, viva: true, particulas: true },
    { archivo: "4-montanas.svg", d: 3 },
    { archivo: "5-colinas.svg", d: 5, viva: true },
    { archivo: "6-luciernagas.svg", d: 8, viva: true, particulas: true },
  ],
  tienda: [
    { archivo: "1-pared.svg", d: 1 },
    { archivo: "2-estantes.svg", d: 3 },
    { archivo: "3-faroles.svg", d: 3, viva: true },
    { archivo: "4-mostrador.svg", d: 6 },
    { archivo: "5-destellos.svg", d: 7, viva: true, particulas: true },
  ],
  perfil: [
    { archivo: "1-cielo.svg", d: 1 },
    { archivo: "2-nubes.svg", d: 2, viva: true },
    { archivo: "3-montanas.svg", d: 3 },
    { archivo: "4-colina.svg", d: 5, viva: true },
    { archivo: "5-chispas.svg", d: 7, viva: true, particulas: true },
  ],
} satisfies Record<string, Capa[]>;
