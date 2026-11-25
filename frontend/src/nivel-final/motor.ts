/**
 * Vista Phaser 3 del nivel final: side-scroller pixel-art con parallax. Solo pinta y anima; las
 * reglas viven en `logica.ts` y en el servidor. Phaser se carga con `import()` dinámico (chunk
 * aparte) para no inflar el bundle principal.
 */
import type * as PhaserNS from "phaser";
import { ALTO_LOGICO, medidas } from "./logica";
import { COMUNES, FONDO, HEROE, JEFES, JEFE_LEGENDARIO, RAROS, tile, type FichaMonstruo, type Suelo } from "./sprites";

type PhaserMod = typeof PhaserNS;

export interface Vista {
  caminar(ms?: number): Promise<void>;
  aparecer(f: FichaMonstruo, hp: number): Promise<void>;
  /** El héroe golpea (hit-stop, flash, número); si `hpRestante` llega a 0 el monstruo cae. `critico` = golpe de racha. */
  acierto(hpRestante: number, critico?: boolean): Promise<void>;
  /** El monstruo telegrafía (se agacha y parpadea) y embiste: screenshake y el héroe retrocede. */
  fallo(): Promise<void>;
  /** Gimmick del jefe: entra en furia (fase 2). */
  furia(): Promise<void>;
  victoria(): Promise<void>;
  derrota(): Promise<void>;
  redimensionar(anchoCss: number, altoMaxCss?: number): void;
  destruir(): void;
}

export interface OpcionesVista {
  suelo: Suelo;
  reducido: boolean;
  altoMaxCss?: number;
}

const SUELO = 32; // 2 filas de tiles de 16
const TODOS = [...COMUNES, ...RAROS, ...JEFES, JEFE_LEGENDARIO];
const clave = (url: string) => url.replace(/[^a-z0-9]+/gi, "_");

/** Promesa con tope de tiempo: si la pestaña se oculta Phaser se pausa y los tweens no acaban. */
function conTope(p: Promise<void>, ms: number): Promise<void> {
  return Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);
}

export async function crearVista(contenedor: HTMLElement, op: OpcionesVista): Promise<Vista> {
  const mod = (await import("phaser")) as unknown as PhaserMod & { default?: PhaserMod };
  const P: PhaserMod = mod.default ?? mod;
  const { zoom, ancho, alto } = medidas(contenedor.clientWidth || 390, op.altoMaxCss);
  const dur = (ms: number) => (op.reducido ? Math.min(ms, 120) : ms);

  let listo!: (e: Escena) => void;
  const creada = new Promise<Escena>((r) => (listo = r));

  class Escena extends P.Scene {
    fondo!: PhaserNS.GameObjects.TileSprite;
    colinas!: PhaserNS.GameObjects.TileSprite;
    sueloArriba!: PhaserNS.GameObjects.TileSprite;
    sueloAbajo!: PhaserNS.GameObjects.TileSprite;
    heroe!: PhaserNS.GameObjects.Sprite;
    monstruo: PhaserNS.GameObjects.Sprite | null = null;
    ficha: FichaMonstruo | null = null;
    barra!: PhaserNS.GameObjects.Graphics;
    chispas!: PhaserNS.GameObjects.Particles.ParticleEmitter;
    luciernagas: PhaserNS.GameObjects.Particles.ParticleEmitter | null = null;
    hp = 0;
    hpMax = 0;
    fantasma = 0; // barra «fantasma» que baja con retardo tras el golpe
    caminando = false;
    xHeroe = 0;

    constructor() {
      super("nivel-final");
    }

    preload() {
      this.load.svg("fondo", FONDO, { width: 480, height: 180 });
      const arriba = op.suelo === "gris" ? "stone" : "grass";
      const abajo = op.suelo === "gris" ? "stone" : "dirt";
      this.load.svg("suelo-arriba", tile(op.suelo, arriba), { width: 16, height: 16 });
      this.load.svg("suelo-abajo", tile(op.suelo, abajo), { width: 16, height: 16 });
      for (const u of [HEROE.idle, HEROE.ataque, ...HEROE.caminar]) this.load.svg(clave(u), u, { width: 32, height: 32 });
      for (const f of TODOS) {
        this.load.svg(clave(f.idle), f.idle, { width: 32, height: 32 });
        if (f.herido) this.load.svg(clave(f.herido), f.herido, { width: 32, height: 32 });
      }
    }

    create() {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff).fillRect(0, 0, 2, 2).generateTexture("px", 2, 2);
      g.clear();
      // Colinas lejanas (capa media del parallax), dibujadas a mano en píxeles.
      g.fillStyle(0x1e2a30);
      for (let x = 0; x < 128; x++) {
        const h = 10 + Math.round(6 * Math.sin(x / 9) + 4 * Math.sin(x / 4.3));
        g.fillRect(x, 32 - h, 1, h);
      }
      g.generateTexture("colinas", 128, 32);
      g.destroy();

      this.fondo = this.add.tileSprite(0, 0, 10, 10, "fondo").setOrigin(0);
      this.colinas = this.add.tileSprite(0, 0, 10, 32, "colinas").setOrigin(0).setAlpha(0.9);
      this.sueloArriba = this.add.tileSprite(0, 0, 10, 16, "suelo-arriba").setOrigin(0);
      this.sueloAbajo = this.add.tileSprite(0, 0, 10, 16, "suelo-abajo").setOrigin(0);
      this.anims.create({
        key: "caminar",
        frames: HEROE.caminar.map((u) => ({ key: clave(u) })),
        frameRate: 6,
        repeat: -1,
      });
      this.heroe = this.add.sprite(0, 0, clave(HEROE.idle)).setOrigin(0.5, 1);
      this.barra = this.add.graphics();
      this.chispas = this.add.particles(0, 0, "px", {
        speed: { min: 30, max: 90 },
        angle: { min: 200, max: 340 },
        lifespan: 450,
        gravityY: 160,
        scale: { start: 1, end: 0.5 },
        tint: [0xffe27a, 0xf2a81d, 0xffffff],
        emitting: false,
      });
      if (!op.reducido) {
        this.luciernagas = this.add.particles(0, 0, "px", {
          x: { min: 0, max: 400 },
          y: { min: 10, max: 90 },
          lifespan: 4000,
          speedX: { min: -6, max: 6 },
          speedY: { min: -4, max: 2 },
          scale: 0.5,
          alpha: { start: 0, end: 0.9, ease: "Sine.easeInOut" },
          tint: 0xfff1a0,
          frequency: 700,
        });
        this.luciernagas.setDepth(-1);
        this.fondo.setDepth(-2);
        this.colinas.setDepth(-2);
      }
      this.maquetar(this.scale.width, this.scale.height);
      this.scale.on("resize", (s: PhaserNS.Structs.Size) => this.maquetar(s.width, s.height));
      listo(this);
    }

    maquetar(w: number, h: number) {
      const tope = h - SUELO;
      this.fondo.setSize(w, tope);
      this.fondo.tilePositionY = 148 - tope; // alinea el suelo del fondo con el nuestro
      this.colinas.setPosition(0, tope - 28).setSize(w, 32);
      this.sueloArriba.setPosition(0, tope).setSize(w, 16);
      this.sueloAbajo.setPosition(0, tope + 16).setSize(w, 16);
      this.xHeroe = Math.round(w * 0.28);
      this.heroe.setPosition(this.xHeroe, tope + 1);
      if (this.monstruo) {
        this.monstruo.setPosition(this.xMonstruo(), tope + 1);
        this.pintarBarra();
      }
    }

    xMonstruo() {
      return Math.round(this.scale.width * 0.72);
    }

    update(_t: number, dt: number) {
      if (!this.caminando) return;
      const v = (dt / 1000) * 40;
      this.fondo.tilePositionX += v * 0.15;
      this.colinas.tilePositionX += v * 0.4;
      this.sueloArriba.tilePositionX += v;
      this.sueloAbajo.tilePositionX += v;
    }

    tween(cfg: PhaserNS.Types.Tweens.TweenBuilderConfig): Promise<void> {
      return new Promise((r) => {
        this.tweens.add({ ...cfg, onComplete: () => r() });
      });
    }

    pintarBarra() {
      const m = this.monstruo;
      this.barra.clear();
      if (!m || this.hpMax <= 0) return;
      const seg = this.hpMax > 8 ? 3 : 5;
      const anchoTotal = this.hpMax * (seg + 1) - 1;
      const x0 = Math.round(m.x - anchoTotal / 2);
      const y0 = Math.round(m.y - m.displayHeight - 6);
      this.barra.fillStyle(0x0a0b18).fillRect(x0 - 1, y0 - 1, anchoTotal + 2, 5);
      for (let i = 0; i < this.hpMax; i++) {
        const color = i < this.hp ? 0xe04848 : i < this.fantasma ? 0xfff1a0 : 0x4a4a55;
        this.barra.fillStyle(color).fillRect(x0 + i * (seg + 1), y0, seg, 3);
      }
      if (this.hp > 0 && this.hp < this.fantasma) {
        // borde de la parte fantasma: brillo arriba
        this.barra.fillStyle(0xffffff, 0.5).fillRect(x0 + this.hp * (seg + 1), y0, Math.max(1, Math.ceil(this.fantasma - this.hp)) * (seg + 1) - 1, 1);
      }
    }

    /** Hit-stop: congela tweens y animaciones unos ms (atacante y objetivo a la vez). */
    async congelar(ms: number) {
      if (op.reducido || ms <= 0) return;
      this.tweens.timeScale = 0.0001;
      this.anims.globalTimeScale = 0.0001;
      await new Promise((r) => setTimeout(r, ms));
      this.tweens.timeScale = 1;
      this.anims.globalTimeScale = 1;
    }

    /** Texto flotante pixel (números de daño, «¡CRÍTICO!»). */
    flotar(x: number, y: number, txt: string, color: string, grande = false) {
      const t = this.add
        .text(Math.round(x), Math.round(y), txt, {
          fontFamily: '"Press Start 2P", ui-monospace, monospace',
          fontSize: grande ? "10px" : "8px",
          color,
          stroke: "#0a0b18",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(10);
      // Que no se salga por los bordes del canvas (texto grande × escala inicial).
      const medio = (t.width * (grande ? 1.6 : 1.3)) / 2 + 2;
      t.x = Math.round(Math.min(Math.max(t.x, medio), this.scale.width - medio));
      if (op.reducido) {
        this.time.delayedCall(500, () => t.destroy());
        return;
      }
      t.setScale(grande ? 1.6 : 1.3);
      this.tweens.add({ targets: t, scale: 1, duration: 120, ease: "Back.easeOut" });
      this.tweens.add({ targets: t, y: y - 18, alpha: 0, delay: 350, duration: 550, ease: "Quad.easeIn", onComplete: () => t.destroy() });
    }

    bajarFantasma() {
      this.tweens.killTweensOf(this);
      this.tweens.add({ targets: this, fantasma: this.hp, delay: dur(380), duration: dur(320), ease: "Quad.easeIn", onUpdate: () => this.pintarBarra() });
    }

    /** Banner de jefe en el centro. */
    banner(txt: string) {
      const t = this.add
        .text(Math.round(this.scale.width / 2), 34, txt, {
          fontFamily: '"Press Start 2P", ui-monospace, monospace',
          fontSize: "12px",
          color: "#ffe27a",
          stroke: "#8e1f1f",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(10)
        .setAlpha(0);
      this.tweens.chain({
        targets: t,
        tweens: [
          { alpha: 1, scale: { from: 2.2, to: 1 }, duration: dur(220), ease: "Back.easeOut" },
          { alpha: 0, delay: dur(900), duration: dur(250) },
        ],
        onComplete: () => t.destroy(),
      });
    }
  }

  const juego = new P.Game({
    type: P.AUTO,
    parent: contenedor,
    width: ancho,
    height: alto,
    zoom,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: "#151B1F",
    banner: false,
    audio: { noAudio: true },
    scale: { mode: P.Scale.NONE },
    scene: [Escena],
  });

  const esc = await Promise.race([
    creada,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("El motor tardó demasiado en arrancar.")), 10000)),
  ]).catch((e) => {
    juego.destroy(true);
    throw e;
  });

  const quieto = () => {
    esc.caminando = false;
    esc.heroe.stop();
    esc.heroe.setTexture(clave(HEROE.idle));
  };

  const vista: Vista = {
    async caminar(ms = 1100) {
      esc.caminando = true;
      esc.heroe.play("caminar");
      await new Promise((r) => setTimeout(r, op.reducido ? 200 : ms));
      quieto();
    },

    async aparecer(f, hp) {
      esc.monstruo?.destroy();
      esc.ficha = f;
      esc.hp = hp;
      esc.hpMax = hp;
      esc.fantasma = hp;
      const esJefe = f.escala > 1;
      if (esJefe) {
        esc.banner("¡JEFE!");
        if (!op.reducido) esc.cameras.main.shake(700, 0.006);
      }
      const tope = esc.scale.height - SUELO;
      const m = esc.add.sprite(esc.scale.width + 24, tope + 1, clave(f.idle)).setOrigin(0.5, 1).setScale(f.escala);
      if (f.mira === "derecha") m.setFlipX(true);
      esc.monstruo = m;
      esc.caminando = true;
      esc.heroe.play("caminar");
      await conTope(esc.tween({ targets: m, x: esc.xMonstruo(), duration: dur(f.escala > 1 ? 900 : 550), ease: "Quad.easeOut" }), 2000);
      quieto();
      esc.pintarBarra();
      if (!op.reducido) {
        esc.tweens.add({ targets: m, y: m.y - 1, duration: 420, yoyo: true, repeat: -1, ease: "Stepped", easeParams: [2] });
      }
    },

    async acierto(hpRestante, critico = false) {
      const m = esc.monstruo;
      if (!m || !esc.ficha) return;
      const ficha = esc.ficha;
      const h = esc.heroe;
      const remata = hpRestante <= 0;
      h.setTexture(clave(HEROE.ataque));
      const alcance = m.x - m.displayWidth / 2 - 10;
      await conTope(esc.tween({ targets: h, x: alcance, duration: dur(140), ease: "Quad.easeIn" }), 800);
      // Impacto: flash blanco + chispas + número, luego hit-stop.
      m.setTintFill(0xffffff);
      const cx = m.x - m.displayWidth / 4;
      const cy = m.y - m.displayHeight / 2;
      esc.chispas.explode(op.reducido ? 4 : critico ? 26 : 12, cx, cy);
      const golpe = Math.max(0, esc.hp - Math.max(0, hpRestante));
      esc.hp = Math.max(0, hpRestante);
      esc.pintarBarra();
      esc.flotar(m.x, m.y - m.displayHeight - 8, `-${Math.max(1, golpe)}`, critico ? "#ffe27a" : "#ffffff", critico);
      if (critico) esc.flotar(m.x, m.y - m.displayHeight - 26, "¡CRÍTICO!", "#ff8a8a", true);
      if (!op.reducido && (critico || remata)) esc.cameras.main.shake(140, critico ? 0.01 : 0.006);
      await esc.congelar(critico || remata ? 110 : 70);
      if (ficha.herido) {
        m.clearTint();
        m.setTexture(clave(ficha.herido));
      }
      esc.bajarFantasma();
      await conTope(
        Promise.all([
          esc.tween({ targets: h, x: esc.xHeroe, duration: dur(200), ease: "Quad.easeOut" }),
          op.reducido ? Promise.resolve() : esc.tween({ targets: m, x: m.x + (critico ? 8 : 4), duration: 80, yoyo: true }),
        ]).then(() => undefined),
        900,
      );
      h.setTexture(clave(HEROE.idle));
      m.clearTint();
      if (!remata) {
        m.setTexture(clave(ficha.idle));
        if (m.getData("furia")) m.setTint(0xff7070);
        return;
      }
      // Derrota del monstruo: zoom breve, cae y se deshace en partículas.
      esc.tweens.killTweensOf(m);
      esc.barra.clear();
      const cam = esc.cameras.main;
      if (!op.reducido) {
        cam.zoomTo(ficha.escala > 1 ? 1.25 : 1.1, 160, "Quad.easeOut");
        esc.time.delayedCall(420, () => cam.zoomTo(1, 260, "Quad.easeInOut"));
      }
      esc.chispas.explode(op.reducido ? 8 : ficha.escala > 1 ? 70 : 40, m.x, m.y - m.displayHeight / 2);
      await conTope(esc.tween({ targets: m, alpha: 0, y: m.y + 4, angle: op.reducido ? 0 : 20, duration: dur(450) }), 1200);
      m.destroy();
      esc.monstruo = null;
      esc.ficha = null;
      if (!op.reducido) cam.setZoom(1);
    },

    async fallo() {
      const m = esc.monstruo;
      const h = esc.heroe;
      if (m) {
        const x0 = m.x;
        // Telegrafía: se agacha y parpadea en rojo antes de embestir (anticipación → ataque).
        if (!op.reducido) {
          const sy = m.scaleY;
          m.setTintFill(0xff4040);
          await conTope(esc.tween({ targets: m, scaleY: sy * 0.85, x: x0 + 6, duration: 160, ease: "Quad.easeOut" }), 500);
          m.clearTint();
          if (m.getData("furia")) m.setTint(0xff7070);
          m.setScale(m.scaleX, sy);
        }
        await conTope(esc.tween({ targets: m, x: h.x + h.displayWidth / 2 + m.displayWidth / 2 - 4, duration: dur(150), ease: "Quad.easeIn" }), 800);
        if (!op.reducido) esc.cameras.main.shake(200, 0.014);
        h.setTintFill(0xff4040);
        esc.flotar(h.x, h.y - h.displayHeight - 4, "-1", "#ff8a8a");
        await esc.congelar(60);
        h.setTint(0xff6060);
        await conTope(
          Promise.all([
            esc.tween({ targets: m, x: x0, duration: dur(220) }),
            esc.tween({ targets: h, x: esc.xHeroe - (op.reducido ? 0 : 8), duration: dur(120), yoyo: true }),
          ]).then(() => undefined),
          900,
        );
        if (m.getData("furia")) m.setTint(0xff7070);
      }
      h.clearTint();
      h.x = esc.xHeroe;
    },

    async furia() {
      const m = esc.monstruo;
      if (!m) return;
      m.setData("furia", true);
      m.setTint(0xff7070);
      if (!op.reducido) esc.cameras.main.flash(250, 160, 30, 30);
      const s = m.scale;
      await conTope(esc.tween({ targets: m, scale: s * 1.25, duration: dur(160), yoyo: true, repeat: op.reducido ? 0 : 1 }), 1200);
      m.setScale(s);
    },

    async victoria() {
      quieto();
      esc.banner("¡VICTORIA!");
      if (!op.reducido) {
        esc.chispas.explode(40, esc.heroe.x, esc.heroe.y - 40);
        const confeti = esc.add.particles(0, -4, "px", {
          x: { min: 0, max: esc.scale.width },
          speedY: { min: 30, max: 70 },
          speedX: { min: -20, max: 20 },
          rotate: { min: 0, max: 360 },
          lifespan: 2600,
          scaleX: { min: 1, max: 2 },
          tint: [0xffe27a, 0xf2a81d, 0x58c94a, 0x5fa8e8, 0xe04848, 0xffffff],
          quantity: 3,
          frequency: 40,
        });
        confeti.setDepth(9);
        esc.time.delayedCall(1600, () => confeti.stop());
      }
      await conTope(esc.tween({ targets: esc.heroe, y: esc.heroe.y - 10, duration: dur(180), yoyo: true, repeat: op.reducido ? 0 : 2 }), 2000);
    },

    async derrota() {
      quieto();
      esc.heroe.setTint(0x8080a0);
      await conTope(esc.tween({ targets: esc.heroe, angle: -90, y: esc.heroe.y - 4, duration: dur(400) }), 1200);
    },

    redimensionar(anchoCss, altoMaxCss) {
      const n = medidas(anchoCss, altoMaxCss ?? op.altoMaxCss);
      if (n.ancho === juego.scale.width && n.zoom === juego.scale.zoom) return;
      juego.scale.setZoom(n.zoom);
      juego.scale.resize(n.ancho, ALTO_LOGICO);
    },

    destruir() {
      juego.destroy(true);
    },
  };
  return vista;
}
