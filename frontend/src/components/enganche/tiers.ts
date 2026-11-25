/** Tiers de evolución por XP total de un tema (espejo de backend/app/game/experiencia.py · TIERS). */
export const TIERS: readonly { tier: number; nombre: string; minimo: number }[] = [
  { tier: 1, nombre: "Brote", minimo: 0 },
  { tier: 2, nombre: "Explorador", minimo: 300 },
  { tier: 3, nombre: "Aventurero", minimo: 900 },
  { tier: 4, nombre: "Guardián", minimo: 2000 },
  { tier: 5, nombre: "Campeón", minimo: 4000 },
  { tier: 6, nombre: "Leyenda", minimo: 7000 },
];

export function tierPara(xp: number): number {
  let t = 1;
  for (const x of TIERS) if (xp >= x.minimo) t = x.tier;
  return t;
}

export const nombreTier = (tier: number) => TIERS[Math.max(1, Math.min(6, tier)) - 1].nombre;

/** Dónde está `xp` dentro de su tier: límites y fracción 0..1 (1 en el último tier). */
export function progresoTier(xp: number) {
  const tier = tierPara(xp);
  const desde = TIERS[tier - 1].minimo;
  const sig = TIERS[tier];
  const hasta = sig ? sig.minimo : desde;
  const frac = sig ? Math.max(0, Math.min(1, (xp - desde) / (hasta - desde))) : 1;
  return { tier, nombre: nombreTier(tier), desde, hasta, frac, maximo: !sig };
}
