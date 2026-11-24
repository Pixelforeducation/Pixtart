const MASCOTAS: Record<string, string> = {
  "crystal-owl": "pet-crystal-owl",
  "ember-fox": "pet-ember-fox",
  "mini-golem": "pet-mini-golem",
};
const NOMBRES: Record<string, string> = {
  "crystal-owl": "Búho de cristal",
  "ember-fox": "Zorro de brasas",
  "mini-golem": "Mini gólem",
  ogro: "Ogro verde",
};

export const nombreEspecie = (e: string) => NOMBRES[e] ?? e.replace(/[-_]/g, " ");
export const srcMascota = (especie: string) => `/sprites/${MASCOTAS[especie] ?? "ogre-green"}.svg`;

const ITEMS: Record<string, string> = { botiquin: "item-medkit", lupa: "item-magnifier", pocion_tiempo: "item-time-potion-5" };
export function srcItem(itemId: string): string | null {
  if (itemId.startsWith("mascota_")) return srcMascota(itemId.slice(8));
  return ITEMS[itemId] ? `/sprites/${ITEMS[itemId]}.svg` : null;
}

const TIERS = ["outfit-tier1-brote", "outfit-tier1-brote", "outfit-tier3-aventurero", "outfit-tier3-aventurero", "outfit-tier6-leyenda", "outfit-tier6-leyenda"];
export const srcTier = (tier: number) => `/sprites/${TIERS[Math.max(0, Math.min(5, tier - 1))]}.svg`;
export const NOMBRES_TIER = ["Brote", "Aprendiz", "Aventurero", "Veterano", "Maestro", "Leyenda"];

export function Sprite({ src, alt, className, tam }: { src: string; alt: string; className?: string; tam?: number }) {
  return <img className={`sprite ${className ?? ""}`} src={src} alt={alt} width={tam} height={tam} draggable={false} />;
}
