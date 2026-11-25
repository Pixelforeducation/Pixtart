/**
 * Componentes de enganche reutilizables (para Inicio, Perfil, fin de nivel…). Importa este módulo
 * y ya trae sus estilos (prefijo `eg-`). Monta <CapaParticulas /> de src/efectos en la pantalla para
 * ver el confeti/estrellas de MetaDiaria y ModalSubeNivel.
 *
 *   <RachaLlama dias={estado.racha} jugadoHoy escudos={estado.escudos} />
 *   <MetaDiaria hechos={nivelesHoy} meta={3} unidad="niveles" />
 *   <BarraXP xp={xpTema} desde={xpAntes} etiqueta="Biología" onSubeNivel={(t, a) => …} />
 *   {subio && <ModalSubeNivel tier={t} tierAnterior={a} tema="Biología" onCerrar={…} />}
 *
 * Utilidades: TIERS, tierPara(xp), nombreTier(t), progresoTier(xp), tamLlama(dias).
 */
import "./enganche.css";

export { RachaLlama, tamLlama } from "./RachaLlama";
export { MetaDiaria } from "./MetaDiaria";
export { BarraXP } from "./BarraXP";
export { ModalSubeNivel } from "./ModalSubeNivel";
export { TIERS, tierPara, nombreTier, progresoTier } from "./tiers";
