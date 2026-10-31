// ECO v2.1.0 — terror para Minecraft Bedrock
// Dos entidades (El Testigo y El Imitador) acosan al jugador todas las noches.
// Un "director" decide qué pasa y cuándo; la tensión sube noche tras noche
// hasta la luna roja, la peor noche de todas.
import { world, system, BlockPermutation, EntityDamageCause, DyeColor, WeatherType, ItemStack } from "@minecraft/server";
import { MessageFormData } from "@minecraft/server-ui";

const VERSION = "2.1.1";
let ultimoError = ""; // último fallo al invocar, para el comando de prueba

// ------------------------------------------------------------------ textos
// Las claves coinciden con los sonidos generados (eco.s.<clave> y eco.v.<clave>).
const SUSURROS = {
  no_estas_solo: "no estás solo...",
  te_estoy_mirando: "te estoy mirando",
  date_la_vuelta: "date la vuelta",
  detras_de_ti: "detrás de ti",
  se_donde_duermes: "ya sé dónde duermes",
  no_mires: "no mires...",
  sonrie: "sonríe",
  estoy_dentro: "ya estoy dentro",
  te_encontre: "te encontré",
  por_que_corres: "¿por qué corres?",
  falta_poco: "falta poco",
  quedate: "quédate conmigo",
  no_apagues: "no apagues la luz",
  cuenta: "uno... dos... tres...",
  buscas_algo: "¿buscas algo?",
  aqui_abajo: "aquí abajo",
  ven: "ven...",
  siempre_estuve: "siempre estuve aquí",
  estoy_aqui: "estoy aquí",
  mas_cerca: "más cerca...",
  mentiroso: "mentiroso",
  esta_noche: "esta noche...",
  no_duermas: "no duermas",
  abre_los_ojos: "abre los ojos",
  mirame: "mírame",
  juguemos: "juguemos",
  la_luna: "la luna está roja",
};

const IMITACIONES = {
  oye_ven: "oye, ven aquí",
  ayudame: "ayúdame, por favor",
  encontre_algo: "encontré algo, ven a ver",
  donde_estas: "¿dónde estás?",
  abre: "ábreme la puerta",
  estoy_afuera: "estoy aquí afuera",
};

const CARTELES = [
  "TE VI\nDORMIR", "NO ESTÁS\nSOLO", "SONRÍE", "DETRÁS\nDE TI", "YA ESTOY\nDENTRO",
  "NO APAGUES\nLA LUZ", "{n}\nQUÉDATE", "AQUÍ\nESTUVE", "SIGUE LA\nSANGRE", "ESTA NOCHE\nTAMBIÉN",
  "¿POR QUÉ\nCORRES?", "CUENTA LAS\nPUERTAS", "NUNCA\nESTUVISTE\nSOLO", "MIRA\nARRIBA",
  "TE CONOZCO\n{n}", "3\n2\n1", "NO MIRES\nATRÁS", "ÉL TAMBIÉN\nSONRÍE", "ÁBREME\nLA PUERTA", "YA CASI",
];
const CARTELES_MANANA = ["ANOCHE\nESTUVE AQUÍ", "TE VI\nDORMIR", "¿DORMISTE\nBIEN {n}?", "VOLVERÉ\nESTA NOCHE"];
const AUTO_CHAT = ["no estoy solo", "hay alguien en mi casa", "no me dejen solo", "ya viene", "está detrás de mí",
  "no puedo dejar de sonreír", "ábranle la puerta", "jajajajaja"];

// ------------------------------------------------------------------ utilidades
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const mezclar = (arr) => arr.sort(() => Math.random() - 0.5);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const dist = (a, b) => len(sub(a, b));
const piso = (a) => ({ x: Math.floor(a.x), y: Math.floor(a.y), z: Math.floor(a.z) });
const centro = (b) => ({ x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 });

function safe(fn) {
  try {
    return fn();
  } catch (e) {
    return undefined;
  }
}
const valido = (x) => !!x && safe(() => x.isValid()) === true;
const tick = () => system.currentTick;
const despues = (ticks, fn) => system.runTimeout(() => safe(fn), ticks);

function dirHorizontal(p) {
  const v = p.getViewDirection();
  const l = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / l, y: 0, z: v.z / l };
}
function girar(v, grados) {
  const r = (grados * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: v.x * c - v.z * s, y: 0, z: v.x * s + v.z * c };
}

// ------------------------------------------------------------------ bloques
const PASABLES = new Set([
  "minecraft:short_grass", "minecraft:tall_grass", "minecraft:grass", "minecraft:fern", "minecraft:large_fern",
  "minecraft:snow_layer", "minecraft:dandelion", "minecraft:poppy", "minecraft:red_flower", "minecraft:yellow_flower",
  "minecraft:deadbush", "minecraft:dead_bush", "minecraft:redstone_wire", "minecraft:sweet_berry_bush",
  "minecraft:double_plant", "minecraft:vine", "minecraft:leaf_litter",
]);
const LUCES = new Set([
  "minecraft:torch", "minecraft:wall_torch", "minecraft:soul_torch", "minecraft:lantern", "minecraft:soul_lantern",
  "minecraft:redstone_torch", "minecraft:copper_torch",
]);
const esPuerta = (id) =>
  id.endsWith("_door") || id === "minecraft:wooden_door" || id.includes("trapdoor") || id.includes("fence_gate");
const pasable = (b) => !!b && (b.isAir || PASABLES.has(b.typeId));
const solido = (b) =>
  !!b && !b.isAir && !b.isLiquid && !PASABLES.has(b.typeId) &&
  !/sign|torch|lantern|door|fence|wall|carpet|slab|button|lever|pressure_plate|rail|ladder|bed/.test(b.typeId);

/** Busca suelo firme con dos bloques libres encima, cerca de (x, z). */
function suelo(dim, x, yRef, z, arriba = 5, abajo = 8) {
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let y = Math.floor(yRef) + arriba; y >= Math.floor(yRef) - abajo; y--) {
    const b = safe(() => dim.getBlock({ x: bx, y, z: bz }));
    if (!b) continue;
    if (solido(b) && pasable(safe(() => dim.getBlock({ x: bx, y: y + 1, z: bz }))) &&
        pasable(safe(() => dim.getBlock({ x: bx, y: y + 2, z: bz })))) {
      return { x: bx + 0.5, y: y + 1, z: bz + 0.5 };
    }
  }
  return undefined;
}

/** Punto en el suelo a cierta distancia y ángulo respecto a donde mira el jugador (0 = delante, 180 = detrás). */
function puntoRelativo(p, angulo, distancia, intentos = 8) {
  const base = dirHorizontal(p);
  for (let i = 0; i < intentos; i++) {
    const d = girar(base, angulo + rnd(-25, 25) * (i / intentos));
    const r = distancia + rnd(-1.5, 1.5) * (i / intentos);
    const pos = suelo(p.dimension, p.location.x + d.x * r, p.location.y, p.location.z + d.z * r);
    if (pos) return pos;
  }
  return undefined;
}

function buscarBloques(dim, c0, radio, alto, filtro, max = 40) {
  const res = [];
  const c = piso(c0);
  for (let dx = -radio; dx <= radio; dx++)
    for (let dz = -radio; dz <= radio; dz++)
      for (let dy = -alto; dy <= alto + 1; dy++) {
        const b = safe(() => dim.getBlock({ x: c.x + dx, y: c.y + dy, z: c.z + dz }));
        if (b && filtro(b.typeId)) {
          res.push(b);
          if (res.length >= max) return res;
        }
      }
  return res;
}

/** Puertas sin duplicar (solo la mitad de abajo). */
function buscarPuertas(dim, pos, radio) {
  const vistas = new Set();
  const res = [];
  for (const b of buscarBloques(dim, pos, radio, 2, esPuerta, 60)) {
    let blk = b;
    if (safe(() => b.permutation.getState("upper_block_bit"))) blk = safe(() => dim.getBlock({ x: b.x, y: b.y - 1, z: b.z }));
    if (!blk) continue;
    const k = `${blk.x},${blk.y},${blk.z}`;
    if (!vistas.has(k)) vistas.add(k), res.push(blk);
  }
  return res;
}

function alternarPuerta(p, blk, abrir) {
  const abierta = safe(() => blk.permutation.getState("open_bit"));
  const nuevo = abrir ?? !abierta;
  if (nuevo === abierta) return;
  safe(() => blk.setPermutation(blk.permutation.withState("open_bit", nuevo)));
  sonido(p, nuevo ? "random.door_open" : "random.door_close", centro(blk), 1, rnd(0.6, 0.85));
}

function ponerRedstone(dim, pos) {
  const p = piso(pos);
  const b = safe(() => dim.getBlock(p));
  const debajo = safe(() => dim.getBlock({ x: p.x, y: p.y - 1, z: p.z }));
  if (b && b.isAir && solido(debajo)) safe(() => b.setType("minecraft:redstone_wire"));
}

function ponerCartel(dim, pos, mirarA, texto) {
  const p = piso(pos);
  const b = safe(() => dim.getBlock(p));
  const debajo = safe(() => dim.getBlock({ x: p.x, y: p.y - 1, z: p.z }));
  if (!b || !pasable(b) || !solido(debajo)) return false;
  const d = sub(mirarA, pos);
  const dir = (Math.round(((Math.atan2(-d.x, d.z) * 180) / Math.PI) / 22.5) + 16) % 16;
  let ok = false;
  for (const tipo of ["minecraft:crimson_standing_sign", "minecraft:standing_sign"]) {
    ok = safe(() => {
      b.setPermutation(BlockPermutation.resolve(tipo, { ground_sign_direction: dir }));
      return true;
    });
    if (ok) break;
  }
  if (!ok) return false;
  const cartel = safe(() => b.getComponent("minecraft:sign"));
  if (cartel) {
    safe(() => cartel.setText(texto));
    safe(() => cartel.setTextDyeColor(DyeColor.Red));
    safe(() => cartel.setWaxed(true));
  }
  for (let i = 0; i < rint(1, 3); i++) ponerRedstone(dim, add(pos, { x: rint(-1, 1), y: 0, z: rint(-1, 1) }));
  safe(() => dim.spawnParticle("eco:sangre", add(pos, { x: 0, y: 1.2, z: 0 })));
  return true;
}

const textoCartel = (p, lista = CARTELES) => pick(lista).replace("{n}", p.name.toUpperCase().slice(0, 14));

function visibleDesde(dim, ojo, punto) {
  const d = sub(punto, ojo);
  const l = len(d);
  if (l < 0.4) return true;
  return !safe(() => dim.getBlockFromRay(ojo, mul(d, 1 / l), {
    maxDistance: l - 0.3, includeLiquidBlocks: false, includePassableBlocks: false,
  }));
}

/** ¿Hay techo a menos de 4 bloques? (la entidad tiene que agacharse) */
function techoBajo(dim, pos) {
  for (let dy = 2; dy <= 4; dy++) {
    if (solido(safe(() => dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y) + dy, z: Math.floor(pos.z) })))) return true;
  }
  return false;
}

/** ¿El jugador está dentro de una casa o cueva? (techo y paredes alrededor) */
function interior(p) {
  const dim = p.dimension;
  const ojo = p.getHeadLocation();
  const opt = { maxDistance: 10, includePassableBlocks: false, includeLiquidBlocks: false };
  if (!safe(() => dim.getBlockFromRay(ojo, { x: 0, y: 1, z: 0 }, opt))) return false;
  let paredes = 0;
  for (const d of [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }]) {
    if (safe(() => dim.getBlockFromRay(ojo, d, { ...opt, maxDistance: 8 }))) paredes++;
  }
  return paredes >= 3;
}

// ------------------------------------------------------------------ estado
const monstruos = new Map(); // id de entidad -> control
const jugadores = new Map(); // id de jugador -> estado
let nocheActiva = false;
let lunaRoja = false;
let forzarLuna = false;

function prop(clave, porDefecto) {
  const v = safe(() => world.getDynamicProperty(clave));
  return v === undefined ? porDefecto : v;
}
const setProp = (clave, v) => safe(() => world.setDynamicProperty(clave, v));
const noches = () => Number(prop("eco:noches", 0));

function fase() {
  const forzada = Number(prop("eco:fase_forzada", 0));
  if (forzada > 0) return forzada;
  return Math.min(4, Math.max(1, noches()));
}

const segundosDeNoche = () => (((world.getTimeOfDay() - 12800) % 24000) + 24000) % 24000 / 20;
const indiceNoche = () => Math.floor((world.getAbsoluteTime() - 12800) / 24000);
const indiceDia = () => Math.floor(world.getAbsoluteTime() / 24000);
const esNoche = () => {
  const t = world.getTimeOfDay();
  return t >= 12800 && t < 23200;
};
/** La luna roja cae siempre en la noche 5 y luego al azar (y siempre cada 10 noches). */
const tocaLuna = (n) => n === 5 || (n > 5 && (n % 10 === 0 || Math.random() < 0.2));

function estado(p) {
  let e = jugadores.get(p.id);
  if (!e) {
    const seg = segundosDeNoche();
    let guion = 0;
    while (guion < GUION.length && GUION[guion][0] < seg - 5) guion++;
    e = {
      guion, proximo: tick() + 20 * 8, proxDia: tick() + 20 * rint(90, 180),
      bloqueado: false, ultimo: "", ultimoSusto: -99999,
    };
    jugadores.set(p.id, e);
  }
  return e;
}

const monstruoDe = (p, tipo) => {
  for (const c of monstruos.values()) if (c.jugador.id === p.id && (!tipo || c.tipo === tipo)) return c;
  return undefined;
};

// ------------------------------------------------------------------ efectos básicos
function sonido(p, id, pos, volumen = 1, tono = 1) {
  safe(() => p.playSound(id, { location: pos ?? p.location, volume: volumen, pitch: tono }));
}
function sonidoMundo(dim, id, pos, volumen = 1, tono = 1) {
  safe(() => dim.playSound(id, pos, { volume: volumen, pitch: tono }));
}
function comando(p, cmd) {
  safe(() => p.runCommand(cmd));
}
function sacudir(p, fuerza = 0.5, segundos = 0.8) {
  comando(p, `camerashake add @s ${fuerza} ${segundos} positional`);
}
function efecto(p, id, ticks, nivel = 0) {
  safe(() => p.addEffect(id, ticks, { amplifier: nivel, showParticles: false }));
}
function fundido(p, entrada, mantener, salida, rojo = 0) {
  safe(() => p.camera.fade({
    fadeTime: { fadeInTime: entrada, holdTime: mantener, fadeOutTime: salida },
    fadeColor: { red: rojo, green: 0, blue: 0 },
  }));
}
function bloquear(p, si) {
  safe(() => {
    p.inputPermissions.movementEnabled = !si;
    p.inputPermissions.cameraEnabled = !si;
  });
  const e = jugadores.get(p.id);
  if (e) e.bloqueado = si;
}
/** Obliga al jugador a mirar un punto. */
function mirarA(p, punto) {
  safe(() => p.teleport(p.location, { facingLocation: punto }));
}

function susurro(p, clave, pos) {
  clave = clave ?? pick(Object.keys(SUSURROS));
  const lugar = pos ?? add(p.getHeadLocation(), mul(dirHorizontal(p), -0.8));
  sonido(p, `eco.s.${clave}`, lugar, 1);
  p.sendMessage(`§8§o${SUSURROS[clave]}`);
  return true;
}

function golpear(p, desde, dano) {
  const fuente = desde?.location ?? add(p.location, girar(dirHorizontal(p), rnd(120, 240)));
  const d = sub(p.location, fuente);
  const l = Math.hypot(d.x, d.z) || 1;
  const cantidad = dano ?? rint(2, 4);
  safe(() => p.applyDamage(cantidad, valido(desde)
    ? { cause: EntityDamageCause.entityAttack, damagingEntity: desde }
    : { cause: EntityDamageCause.entityAttack }));
  safe(() => p.applyKnockback(d.x / l, d.z / l, 1.1, 0.35));
  sacudir(p, 0.6, 0.6);
  safe(() => p.dimension.spawnParticle("eco:sangre", add(p.location, { x: 0, y: 1.2, z: 0 })));
}

// ------------------------------------------------------------------ niebla y luna roja
function aplicarNiebla(p) {
  comando(p, "fog @s remove eco_niebla");
  comando(p, "fog @s remove eco_roja");
  if (!nocheActiva) return;
  if (lunaRoja) comando(p, "fog @s push eco:niebla_roja eco_roja");
  else if (fase() >= 2) comando(p, "fog @s push eco:niebla eco_niebla");
}

function iniciarLunaRoja() {
  if (lunaRoja) return;
  lunaRoja = true;
  const dim = world.getDimension("overworld");
  safe(() => dim.setWeather(WeatherType.Thunder, 12000));
  for (const p of world.getAllPlayers()) {
    aplicarNiebla(p);
    sonido(p, "ambient.weather.thunder", p.location, 1, 0.5);
    sonido(p, "eco.zumbido", p.location, 1, 0.7);
    fundido(p, 0.5, 1.5, 3, 0.35);
    safe(() => p.onScreenDisplay.setTitle("§4LA LUNA ROJA", {
      subtitle: "§7ya no se esconden", fadeInDuration: 30, stayDuration: 80, fadeOutDuration: 40,
    }));
    despues(60, () => sonido(p, "eco.coro", p.getHeadLocation(), 1));
    despues(140, () => p.sendMessage("§eEl Testigo se ha unido a la partida"));
    despues(190, () => p.sendMessage("§eEl Imitador se ha unido a la partida"));
    despues(260, () => susurro(p, "la_luna"));
    // se apagan las luces de alrededor y se abren las puertas
    despues(320, () => {
      buscarBloques(p.dimension, p.location, 10, 3, (id) => LUCES.has(id), 30).forEach((b, i) =>
        despues(i * 5, () => apagarLuz(p, b)));
      buscarPuertas(p.dimension, p.location, 10).forEach((b, i) => despues(i * 6, () => alternarPuerta(p, b, true)));
    });
    const e = estado(p);
    e.proximo = tick() + 20 * 25;
  }
}

function apagarLuz(p, b) {
  if (!LUCES.has(safe(() => b.typeId))) return;
  const pos = centro(b);
  safe(() => b.setType("minecraft:air"));
  sonido(p, "random.fizz", pos, 1, 0.6);
  safe(() => p.dimension.spawnParticle("eco:humo", pos));
}

// ------------------------------------------------------------------ entidades
function alturaCara(ent) {
  const alt = safe(() => ent.getProperty("eco:altura")) ?? 0;
  const pose = safe(() => ent.getProperty("eco:pose")) ?? 0;
  return (ent.typeId === "eco:testigo" ? 3.45 : 3.0) * (1 + alt * 0.08) * (pose >= 1 ? 0.72 : 1);
}

function invocar(tipo, pos, p, pose) {
  let ent;
  try {
    ent = p.dimension.spawnEntity(`eco:${tipo}`, pos);
  } catch (e) {
    ultimoError = `no se pudo crear eco:${tipo}: ${e}`;
    console.warn(`[ECO] ${ultimoError}`);
    return undefined;
  }
  safe(() => ent.setProperty("eco:altura", rint(0, 4)));
  safe(() => ent.setProperty("eco:estado", 0));
  safe(() => ent.setProperty("eco:pose", pose ?? (techoBajo(p.dimension, pos) ? 1 : 0)));
  safe(() => ent.triggerEvent("eco:quieto"));
  safe(() => ent.teleport(pos, { facingLocation: p.getHeadLocation() }));
  return ent;
}

function registrar(ent, tipo, modo, p, datos = {}) {
  const c = { ent, id: ent.id, tipo, modo, jugador: p, t: 0, visto: 0, datos };
  monstruos.set(ent.id, c);
  return c;
}

/** ¿El jugador está mirando a la entidad (y no hay paredes en medio)? */
function loVe(p, ent) {
  const ojo = p.getHeadLocation();
  const v = p.getViewDirection();
  const L = ent.location;
  const h = alturaCara(ent);
  for (const f of [0.3, 0.6, 0.95]) {
    const punto = { x: L.x, y: L.y + h * f, z: L.z };
    const d = sub(punto, ojo);
    const l = len(d);
    if (l < 0.6) return true;
    const umbral = l < 5 ? 0.72 : l < 15 ? 0.87 : 0.94;
    if (dot(v, d) / l > umbral && visibleDesde(p.dimension, ojo, punto)) return true;
  }
  return false;
}

function desaparecer(c, efectos = true, rastro = true) {
  monstruos.delete(c.id);
  const ent = c.ent;
  if (!valido(ent)) return;
  const L = ent.location;
  const dim = ent.dimension;
  if (efectos) safe(() => dim.spawnParticle("eco:humo", add(L, { x: 0, y: 1.5, z: 0 })));
  if (rastro && Math.random() < 0.6) {
    ponerRedstone(dim, L);
    if (Math.random() < 0.25 && valido(c.jugador)) ponerCartel(dim, L, c.jugador.location, textoCartel(c.jugador));
  }
  safe(() => ent.remove());
}

function cazar(c, duracionTicks, revelado = false) {
  c.modo = "caza";
  c.datos.fin = c.t + duracionTicks;
  safe(() => (c.ent.nameTag = ""));
  safe(() => c.ent.setProperty("eco:pose", 0));
  safe(() => c.ent.setProperty("eco:estado", revelado ? 3 : 2));
  safe(() => c.ent.triggerEvent("eco:cazar"));
  sonido(c.jugador, "eco.zumbido", c.jugador.location, 0.8);
}

function revelar(c) {
  const p = c.jugador;
  cazar(c, 20 * 30, true);
  sonidoMundo(c.ent.dimension, "eco.grito", c.ent.location, 1.5, 0.8);
  p.sendMessage(`§4<§k${c.datos.nombre ?? "????"}§r§4> TE ENCONTRÉ`);
  sacudir(p, 0.7, 1.2);
  efecto(p, "darkness", 80);
}

/** Susto: la entidad aparece delante, te obliga a mirarla y grita. */
function susto(p, c) {
  const e = estado(p);
  if (e.bloqueado) return false;
  e.ultimoSusto = tick();
  const tipo = c?.tipo ?? (fase() >= 3 && Math.random() < 0.5 ? "imitador" : "testigo");
  const dir = dirHorizontal(p);
  const L = p.location;
  const frente = { x: L.x + dir.x * 1.8, y: L.y, z: L.z + dir.z * 1.8 };
  const pos = suelo(p.dimension, frente.x, L.y, frente.z, 2, 3) ?? frente;
  let ent = c?.ent;
  if (c) monstruos.delete(c.id);
  if (valido(ent)) {
    safe(() => ent.teleport(pos, { facingLocation: p.getHeadLocation() }));
    safe(() => ent.setProperty("eco:pose", techoBajo(p.dimension, pos) ? 1 : 0));
  } else ent = invocar(tipo, pos, p);
  if (!ent) return false;
  safe(() => ent.setProperty("eco:estado", 3));
  mirarA(p, { x: pos.x, y: pos.y + alturaCara(ent) * 0.92, z: pos.z });
  bloquear(p, true);
  const grito = Math.random() < 0.5 ? "eco.grito" : "eco.grito2";
  sonido(p, grito, p.getHeadLocation(), 1.6);
  sonido(p, "mob.ghast.scream", p.getHeadLocation(), 0.6, 0.5);
  sacudir(p, 1.0, 1.4);
  despues(22, () => fundido(p, 0.1, 0.8, 1.5, 0.25));
  despues(30, () => {
    if (valido(ent)) {
      ponerRedstone(ent.dimension, ent.location);
      ent.remove();
    }
    golpear(p);
    bloquear(p, false);
    efecto(p, "darkness", 120);
  });
  despues(90, () => susurro(p, pick(["te_encontre", "sonrie", "mas_cerca"])));
  despues(100, () => bloquear(p, false)); // por si acaso
  return true;
}

// ------------------------------------------------------------------ comportamientos por modo
const MODOS = {
  // A lo lejos, mirándote. Desaparece si lo miras fijamente o te acercas.
  lejos(c) {
    const p = c.jugador;
    const d = dist(p.location, c.ent.location);
    c.visto = loVe(p, c.ent) ? c.visto + 2 : Math.max(0, c.visto - 1);
    if (c.visto >= 26 || d < 10) {
      sonido(p, "eco.chirrido", p.location, 0.9);
      efecto(p, "darkness", 50);
      desaparecer(c, true, true);
    } else if (c.t > (c.datos.max ?? 600)) desaparecer(c, false, true);
  },

  // Se acerca cuando no lo miras. Si lo miras, se congela.
  acecho(c) {
    const p = c.jugador;
    const d = dist(p.location, c.ent.location);
    if (loVe(p, c.ent)) {
      c.visto += 2;
      if (c.visto >= (c.datos.aguante ?? 70)) {
        sonidoMundo(c.ent.dimension, "eco.risa", c.ent.location, 1);
        desaparecer(c, true, true);
      }
      return;
    }
    c.visto = 0;
    if (d < 2.8) {
      const asusta = c.datos.final === "susto" || Math.random() < 0.4;
      if (!(asusta && susto(p, c))) {
        golpear(p, c.ent);
        sonidoMundo(c.ent.dimension, "eco.risa", c.ent.location, 1);
        desaparecer(c, true, true);
      }
      return;
    }
    if (c.t % (c.datos.ritmo ?? 14) === 0) acercar(c, Math.min(2.4, d - 1.5));
    if (c.t > (c.datos.max ?? 1400)) desaparecer(c, false, true);
  },

  // Justo detrás del jugador. Si te giras, lo ves un instante. Si no, te golpea.
  detras(c) {
    const p = c.jugador;
    if (c.t === 2) {
      sonido(p, "eco.respiracion", c.ent.location, 1);
      if (c.datos.voz) despues(30, () => susurro(p, c.datos.voz));
    }
    if (loVe(p, c.ent)) {
      if (c.datos.susto && susto(p, c)) return;
      c.visto += 2;
      if (c.visto >= 6) {
        sonido(p, "eco.chirrido", p.location, 1);
        efecto(p, "darkness", 40);
        desaparecer(c, true, true);
      }
      return;
    }
    if (dist(p.location, c.ent.location) > 4.5 && c.t % 10 === 0) {
      const pos = puntoRelativo(p, 180, 2.2, 4);
      if (pos) safe(() => c.ent.teleport(pos, { facingLocation: p.getHeadLocation() }));
    }
    if (c.t >= (c.datos.espera ?? 140)) {
      golpear(p, c.ent);
      sonidoMundo(c.ent.dimension, "eco.risa", c.ent.location, 1);
      desaparecer(c, true, true);
    }
  },

  // Se asoma desde una esquina, una puerta o una ventana. Al verlo, se esconde... o se lanza.
  asomar(c) {
    const p = c.jugador;
    if (loVe(p, c.ent)) {
      c.visto += 2;
      if (c.visto === 2) sonido(p, "eco.chirrido", p.location, 0.6, 0.8);
      if (c.visto >= (c.datos.aguante ?? 16)) {
        if (c.datos.embestir && susto(p, c)) return;
        if (c.datos.vidrio) {
          safe(() => c.datos.vidrio.setType("minecraft:air"));
          sonido(p, "random.glass", centro(c.datos.vidrio), 1, 0.7);
          despues(20, () => susurro(p, "estoy_dentro"));
        }
        desaparecer(c, false, true);
      }
      return;
    }
    if (c.visto > 0) { // lo viste y apartaste la mirada: ya no está
      desaparecer(c, false, true);
      despues(30, () => susurro(p, pick(["estoy_aqui", "te_estoy_mirando", "mirame"])));
      return;
    }
    if (c.t > (c.datos.max ?? 300)) desaparecer(c, false, true);
  },

  // Quieto: lo controla otro evento (giro de cámara, relámpago...).
  quieto(c) {
    if (c.t > (c.datos.max ?? 400)) desaparecer(c, false, false);
  },

  // Persecución.
  caza(c) {
    const p = c.jugador;
    const d = dist(p.location, c.ent.location);
    if (c.t % 20 === 0) {
      const vol = Math.max(0.2, 1 - d / 30);
      sonido(p, "mob.warden.heartbeat", p.location, vol, 1 + Math.max(0, 1 - d / 15) * 0.6);
    }
    if (c.t % 30 === 0) ponerRedstone(c.ent.dimension, c.ent.location);
    if (c.t % 100 === 0 && d > 20 && !loVe(p, c.ent)) {
      const pos = puntoRelativo(p, 180, 12, 4);
      if (pos) safe(() => c.ent.teleport(pos, { facingLocation: p.getHeadLocation() }));
    }
    if (c.t > c.datos.fin || d > 60 || (!nocheActiva && !c.datos.forzado)) {
      sonidoMundo(c.ent.dimension, "eco.risa", c.ent.location, 1);
      desaparecer(c, true, true);
    }
  },

  // El Imitador finge ser alguien: habla por el chat y hace ruidos de jugador.
  imitar(c) {
    const p = c.jugador;
    const d = dist(p.location, c.ent.location);
    if (c.t === 2) safe(() => (c.ent.nameTag = c.datos.nombre));
    if (c.t >= (c.datos.prox ?? 40)) {
      c.datos.prox = c.t + rint(100, 180);
      if (Math.random() < 0.6) {
        const clave = pick(Object.keys(IMITACIONES));
        p.sendMessage(`<${c.datos.nombre}> ${IMITACIONES[clave]}`);
        sonido(p, `eco.v.${clave}`, c.ent.location, 1.2);
      } else {
        sonido(p, pick(["random.door_open", "random.chestopen", "dig.stone", "random.eat", "step.wood"]), c.ent.location, 1);
      }
    }
    if (d < 9 || c.t > (c.datos.max ?? 900)) revelar(c);
  },
};

function acercar(c, paso) {
  const p = c.jugador;
  const L = c.ent.location;
  const d = sub(p.location, L);
  const l = Math.hypot(d.x, d.z) || 1;
  const destino = suelo(c.ent.dimension, L.x + (d.x / l) * paso, L.y, L.z + (d.z / l) * paso, 3, 4);
  if (!destino) return;
  if (Math.random() < 0.35) ponerRedstone(c.ent.dimension, L);
  safe(() => c.ent.teleport(destino, { facingLocation: p.getHeadLocation() }));
  safe(() => c.ent.setProperty("eco:pose", techoBajo(c.ent.dimension, destino) ? 1 : 0));
  sonido(p, pisada(c.ent.dimension, destino), destino, 1, 0.6);
}

function pisada(dim, pos) {
  const b = safe(() => dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y) - 1, z: Math.floor(pos.z) }));
  const id = b?.typeId ?? "";
  if (/grass|dirt|podzol|mycelium|moss/.test(id)) return "step.grass";
  if (/planks|log|wood/.test(id)) return "step.wood";
  if (/sand/.test(id)) return "step.sand";
  if (/gravel/.test(id)) return "step.gravel";
  return "step.stone";
}

// ------------------------------------------------------------------ eventos con entidades
function testigo(p, modo, opciones = {}) {
  if (monstruoDe(p, "testigo")) return false;
  const conf = {
    lejos: [rnd(-55, 55), opciones.distancia ?? rnd(18, 28)],
    acecho: [rnd(140, 220), rnd(12, 16)],
    detras: [180, 2.2],
    caza: [rnd(150, 210), rnd(10, 14)],
  }[modo];
  const pos = puntoRelativo(p, conf[0], conf[1]) ?? (opciones.forzado ? suelo(p.dimension, p.location.x + 3, p.location.y, p.location.z, 4, 6) : undefined);
  if (!pos) {
    ultimoError = "no encontré suelo libre alrededor";
    return false;
  }
  const ent = invocar("testigo", pos, p);
  if (!ent) return false;
  const c = registrar(ent, "testigo", modo === "caza" ? "lejos" : modo, p, opciones);
  if (modo === "caza") cazar(c, opciones.dur ?? 20 * 20);
  return true;
}

function imitador(p, opciones = {}) {
  if (monstruoDe(p, "imitador")) return false;
  const pos = puntoRelativo(p, rnd(100, 260), rnd(20, 28)) ?? (opciones.forzado ? suelo(p.dimension, p.location.x + 3, p.location.y, p.location.z, 4, 6) : undefined);
  if (!pos) {
    ultimoError = "no encontré suelo libre alrededor";
    return false;
  }
  const ent = invocar("imitador", pos, p);
  if (!ent) return false;
  const otros = world.getAllPlayers().filter((o) => o.id !== p.id);
  const nombre = otros.length ? pick(otros).name : p.name;
  registrar(ent, "imitador", "imitar", p, { nombre, ...opciones });
  return true;
}

/** Busca un sitio donde la entidad quede tapada por una pared pero pueda asomar la cabeza. */
function buscarEsquina(p) {
  const dim = p.dimension;
  const ojo = p.getHeadLocation();
  const base = dirHorizontal(p);
  for (let i = 0; i < 45; i++) {
    const d = girar(base, rnd(-65, 65));
    const r = rnd(3.5, 10);
    const P = suelo(dim, p.location.x + d.x * r, p.location.y, p.location.z + d.z * r, 2, 3);
    if (!P || visibleDesde(dim, ojo, { x: P.x, y: P.y + 0.9, z: P.z })) continue;
    const f = sub(ojo, P);
    const fl = Math.hypot(f.x, f.z) || 1;
    const fx = f.x / fl, fz = f.z / fl;
    const alto = techoBajo(dim, P) ? 1.8 : 2.5;
    // pose 2: se inclina hacia su izquierda; pose 3: hacia su derecha
    for (const [pose, s] of [[2, { x: fz, z: -fx }], [3, { x: -fz, z: fx }]]) {
      if (visibleDesde(dim, ojo, { x: P.x + s.x * 1.3, y: P.y + alto, z: P.z + s.z * 1.3 })) return { pos: P, pose };
    }
  }
  return undefined;
}

function asomarse(p, opciones = {}) {
  if (monstruoDe(p, "testigo") && monstruoDe(p, "imitador")) return false;
  const tipo = monstruoDe(p, "testigo") ? "imitador" : (fase() >= 3 && Math.random() < 0.4 ? "imitador" : "testigo");
  let sitio = buscarEsquina(p);
  if (!sitio) {
    // sin esquinas: aparece agachado en el borde de tu visión
    const pos = puntoRelativo(p, pick([-1, 1]) * rnd(95, 130), rnd(4, 8), 6);
    if (!pos) return false;
    sitio = { pos, pose: 1 };
  }
  const ent = invocar(tipo, sitio.pos, p, sitio.pose);
  if (!ent) return false;
  registrar(ent, tipo, "asomar", p, { embestir: Math.random() < 0.3, ...opciones });
  return true;
}

/** La cámara del jugador gira sola, despacio, hasta encontrarse con la entidad que tiene detrás. */
function camaraGiro(p) {
  const e = estado(p);
  if (e.bloqueado || monstruoDe(p, "testigo")) return false;
  const P = puntoRelativo(p, 180, rnd(2.5, 3.5), 6);
  if (!P) return false;
  const ent = invocar("testigo", P, p);
  if (!ent) return false;
  const c = registrar(ent, "testigo", "quieto", p, { max: 200 });
  e.ultimoSusto = tick();
  bloquear(p, true);
  const ojo = p.getHeadLocation();
  const v = dirHorizontal(p);
  const cara = { x: P.x, y: P.y + alturaCara(ent) * 0.9, z: P.z };
  const t = sub(cara, ojo);
  const yaw0 = Math.atan2(v.z, v.x);
  let dy = Math.atan2(t.z, t.x) - yaw0;
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  const pitch1 = Math.atan2(t.y, Math.hypot(t.x, t.z));
  const pasos = 24;
  sonido(p, "eco.respiracion", P, 1);
  for (let i = 1; i <= pasos; i++) {
    despues(i * 2, () => {
      const k = i / pasos;
      const s = k * k * (3 - 2 * k);
      const yaw = yaw0 + dy * s;
      const pitch = pitch1 * s;
      const o = p.getHeadLocation();
      mirarA(p, add(o, { x: Math.cos(yaw) * Math.cos(pitch) * 5, y: Math.sin(pitch) * 5, z: Math.sin(yaw) * Math.cos(pitch) * 5 }));
    });
  }
  despues(pasos * 2 + 20, () => {
    bloquear(p, false);
    if (Math.random() < 0.6) susto(p, c);
    else {
      sonido(p, "eco.chirrido", p.location, 1);
      efecto(p, "darkness", 60);
      desaparecer(c, false, true);
      despues(25, () => susurro(p, "sonrie"));
    }
  });
  despues(pasos * 2 + 80, () => bloquear(p, false));
  return true;
}

/** Aparece pegado a tu cara un instante (0,3 s) y se va. Sin aviso. */
function parpadeo(p) {
  const dir = dirHorizontal(p);
  const L = p.location;
  const frente = { x: L.x + dir.x * 1.5, y: L.y, z: L.z + dir.z * 1.5 };
  const pos = suelo(p.dimension, frente.x, L.y, frente.z, 2, 3) ?? frente;
  const ent = invocar(fase() >= 3 && Math.random() < 0.5 ? "imitador" : "testigo", pos, p);
  if (!ent) return false;
  safe(() => ent.setProperty("eco:estado", 3));
  despues(6, () => ent.remove());
  despues(6, () => fundido(p, 0, 0.1, 0.4, 0));
  despues(40, () => {
    if (Math.random() < 0.5) sonido(p, "eco.risa", add(p.getHeadLocation(), mul(dir, -2)), 0.6);
  });
  return true;
}

/** Las luces se apagan una a una, de la más lejana a la más cercana, y algo susurra "estoy aquí". */
function apagon(p) {
  const e = estado(p);
  if (e.bloqueado) return false;
  e.ultimoSusto = tick();
  const luces = buscarBloques(p.dimension, p.location, 12, 4, (id) => LUCES.has(id), 60)
    .sort((a, b) => dist(centro(b), p.location) - dist(centro(a), p.location))
    .slice(0, 8);
  const paso = 26;
  let fin;
  if (luces.length) {
    luces.forEach((b, i) => despues(i * paso, () => {
      const pos = centro(b);
      apagarLuz(p, b);
      sonido(p, i === luces.length - 1 ? "eco.s.mas_cerca" : "eco.s.estoy_aqui", pos, 1.2);
      if (i === 0 || i === luces.length - 1) p.sendMessage(`§8§o${i === 0 ? "estoy aquí" : "más cerca..."}`);
    }));
    fin = luces.length * paso + 20;
  } else {
    // sin luces: la voz se acerca en la oscuridad
    for (let i = 0; i < 4; i++) {
      despues(i * 30, () => {
        const pos = add(p.getHeadLocation(), mul(girar(dirHorizontal(p), rnd(100, 260)), 10 - i * 2.5));
        sonido(p, "eco.s.estoy_aqui", pos, 1.2);
      });
    }
    p.sendMessage("§8§oestoy aquí");
    fin = 140;
  }
  despues(fin, () => {
    efecto(p, "darkness", 200);
    efecto(p, "blindness", 50);
    sonido(p, "eco.coro", p.getHeadLocation(), 0.9);
  });
  // silencio... y entonces
  despues(fin + 70, () => {
    if (interior(p) && Math.random() < 0.45) asomarse(p, { embestir: true, aguante: 10 });
    else if (!susto(p)) testigo(p, "detras", { susto: true, espera: 160 });
  });
  return true;
}

/** Una cara en la ventana mirándote desde fuera. A veces rompe el vidrio. */
function ventana(p) {
  const ojo = p.getHeadLocation();
  const v = p.getViewDirection();
  const vidrios = mezclar(buscarBloques(p.dimension, p.location, 8, 2, (id) => id.includes("glass"), 80)
    .filter((b) => {
      const d = sub(centro(b), ojo);
      return len(d) > 2.5 && dot(v, d) / len(d) > 0.2;
    }));
  for (const b of vidrios.slice(0, 12)) {
    const c0 = centro(b);
    const fuera = sub(c0, p.location);
    const l = Math.hypot(fuera.x, fuera.z) || 1;
    const P = suelo(p.dimension, c0.x + (fuera.x / l) * 1.6, b.y, c0.z + (fuera.z / l) * 1.6, 2, 4);
    if (!P) continue;
    const tipo = monstruoDe(p, "testigo") ? "imitador" : "testigo";
    if (monstruoDe(p, tipo)) return false;
    const ent = invocar(tipo, P, p, 0);
    if (!ent) return false;
    registrar(ent, tipo, "asomar", p, { aguante: 24, vidrio: Math.random() < 0.3 ? b : undefined, max: 400 });
    if (Math.random() < 0.5) despues(20, () => sonido(p, "dig.glass", c0, 1, 0.5));
    return true;
  }
  return false;
}

/** Tocan a la puerta. Luego más fuerte. Luego la puerta se abre sola. */
function golpesPuerta(p) {
  const puertas = buscarPuertas(p.dimension, p.location, 10)
    .filter((b) => b.typeId.endsWith("_door") || b.typeId === "minecraft:wooden_door")
    .sort((a, b) => dist(centro(a), p.location) - dist(centro(b), p.location));
  const b = puertas[0];
  if (!b) return false;
  const pos = centro(b);
  alternarPuerta(p, b, false);
  for (let i = 0; i < 3; i++) despues(i * 9, () => sonido(p, "dig.wood", pos, 1, 0.55));
  for (let i = 0; i < 6; i++) despues(80 + i * 5, () => sonido(p, "dig.wood", pos, 1.5, 0.45));
  despues(100, () => sacudir(p, 0.15, 0.4));
  despues(130, () => p.sendMessage("§8§oábreme"));
  despues(200, () => {
    alternarPuerta(p, b, true);
    const fuera = sub(pos, p.location);
    const l = Math.hypot(fuera.x, fuera.z) || 1;
    const P = suelo(p.dimension, pos.x + (fuera.x / l) * 1.6, b.y, pos.z + (fuera.z / l) * 1.6, 2, 3);
    if (!P) return;
    const tipo = monstruoDe(p, "testigo") ? "imitador" : "testigo";
    if (monstruoDe(p, tipo)) return;
    const ent = invocar(tipo, P, p, 1);
    if (ent) registrar(ent, tipo, "asomar", p, { aguante: 14, embestir: Math.random() < 0.4, max: 400 });
  });
  return true;
}

/** Una ventana emergente pregunta algo. Cualquier respuesta es la equivocada. */
function formulario(p) {
  const pregunta = pick(["§c¿Estás solo?", "§c¿Puedo entrar?", "§c¿Me ves?", "§c¿Sabes dónde estoy?"]);
  const f = new MessageFormData().title("§4. . .").body(pregunta).button1("§fNo").button2("§fSí");
  despues(1, () => {
    f.show(p).then((r) => {
      if (r.canceled) {
        susurro(p, "mirame");
        return;
      }
      susurro(p, "mentiroso");
      despues(30, () => {
        if (!testigo(p, "detras", { susto: true, espera: 200 })) susto(p);
      });
    }).catch(() => {});
  });
  return true;
}

/** Relámpago: con el destello se ve una figura que no estaba ahí. */
function rayo(p) {
  const pos = puntoRelativo(p, rnd(-35, 35), rnd(10, 16), 6);
  if (!pos) return false;
  safe(() => p.dimension.spawnEntity("minecraft:lightning_bolt", add(pos, { x: rnd(-3, 3), y: 0, z: rnd(-3, 3) })));
  const ent = invocar(fase() >= 3 && Math.random() < 0.5 ? "imitador" : "testigo", pos, p);
  if (!ent) return true;
  safe(() => ent.setProperty("eco:estado", 3));
  despues(10, () => ent.remove());
  despues(16, () => sonido(p, "eco.risa", pos, 1));
  return true;
}

/** Luna roja: un círculo de Testigos alrededor del jugador. Solo se mueven cuando no los miras. */
function circulo(p) {
  const n = rint(4, 6);
  let hechos = 0;
  for (let i = 0; i < n; i++) {
    const ang = (i * 360) / n + rnd(-12, 12);
    const d = girar({ x: 1, y: 0, z: 0 }, ang);
    const r = rnd(11, 15);
    const P = suelo(p.dimension, p.location.x + d.x * r, p.location.y, p.location.z + d.z * r);
    if (!P) continue;
    const ent = invocar("testigo", P, p);
    if (!ent) continue;
    registrar(ent, "testigo", "acecho", p, { max: 20 * 60, aguante: 40, ritmo: 18, final: hechos === 0 ? "susto" : undefined });
    hechos++;
  }
  if (!hechos) return false;
  safe(() => p.onScreenDisplay.setActionBar("§4no parpadees"));
  despues(20, () => susurro(p, "juguemos"));
  return true;
}

// ------------------------------------------------------------------ eventos (todos)
const ANIMALES = new Set(["minecraft:cow", "minecraft:pig", "minecraft:sheep", "minecraft:chicken", "minecraft:goat", "minecraft:rabbit"]);
const REGALOS = [
  ["minecraft:rotten_flesh", "§4Tu corazón", ["§7Todavía latía."]],
  ["minecraft:bone", "§fTus dedos", ["§7Te faltan, ¿no?"]],
  ["minecraft:poppy", "§cPara ti", ["§7Te miré dormir toda la noche."]],
  ["minecraft:redstone", "§4Mi sangre", ["§7Ahora es tuya."]],
  ["minecraft:paper", "§fPágina arrancada", ["§7Día 3: ya no está solo.", "§7Día 4: yo tampoco."]],
  ["minecraft:name_tag", "§f{n}", ["§7Lo encontré en tu tumba."]],
];

const EVENTOS = {
  susurro: (p) => susurro(p),
  pasos(p) {
    const atras = mul(dirHorizontal(p), -1);
    for (let i = 0; i < 6; i++) {
      despues(i * 9, () => {
        const pos = add(p.location, mul(atras, 9 - i * 1.4));
        sonido(p, pisada(p.dimension, pos), pos, 1, 0.75);
      });
    }
    despues(60, () => sonido(p, "eco.respiracion", add(p.getHeadLocation(), mul(atras, 1.2)), 0.9));
    return true;
  },
  respiracion(p) {
    sonido(p, "eco.respiracion", add(p.getHeadLocation(), mul(dirHorizontal(p), -1)), 1);
    return true;
  },
  ojos(p) {
    let n = 0;
    for (let i = 0; i < rint(1, 3); i++) {
      const pos = puntoRelativo(p, rnd(-50, 50), rnd(10, 18), 4);
      if (!pos) continue;
      const ojo = add(pos, { x: 0, y: rnd(2.9, 3.6), z: 0 });
      safe(() => p.dimension.spawnParticle("eco:ojos", ojo));
      despues(60, () => p.dimension.spawnParticle("eco:ojos", ojo));
      n++;
    }
    return n > 0;
  },
  sombra: (p) => testigo(p, "lejos"),
  testigo_lejos: (p) => testigo(p, "lejos"),
  testigo_acecho: (p) => testigo(p, "acecho"),
  testigo_detras: (p) => testigo(p, "detras", { voz: pick(["date_la_vuelta", "detras_de_ti", "no_mires", "sonrie"]) }),
  testigo_susto: (p) => testigo(p, "detras", { susto: true, voz: "date_la_vuelta", espera: 200 }),
  testigo_caza: (p) => testigo(p, "caza"),
  imitador: (p) => imitador(p),
  susto: (p) => susto(p),
  asomarse: (p) => asomarse(p),
  camara_giro: (p) => camaraGiro(p),
  parpadeo: (p) => parpadeo(p),
  apagon: (p) => apagon(p),
  ventana: (p) => ventana(p),
  golpes_puerta: (p) => golpesPuerta(p),
  formulario: (p) => formulario(p),
  rayo: (p) => rayo(p),
  circulo: (p) => circulo(p),
  risa(p) {
    const pos = puntoRelativo(p, rnd(0, 360), rnd(10, 18), 4) ?? p.location;
    sonido(p, "eco.risa", pos, 1);
    return true;
  },
  golpe(p) {
    golpear(p);
    despues(15, () => sonido(p, "eco.risa", add(p.location, mul(dirHorizontal(p), -3)), 0.8));
    return true;
  },
  voz_falsa(p) {
    const otros = world.getAllPlayers().filter((o) => o.id !== p.id);
    const nombre = otros.length ? pick(otros).name : p.name;
    const clave = pick(Object.keys(IMITACIONES));
    const pos = puntoRelativo(p, rnd(90, 270), rnd(14, 22), 4) ?? p.location;
    p.sendMessage(`<${nombre}> ${IMITACIONES[clave]}`);
    sonido(p, `eco.v.${clave}`, pos, 1.2);
    return true;
  },
  // mensajes falsos del sistema
  mensaje_sistema(p) {
    const otros = world.getAllPlayers().filter((o) => o.id !== p.id);
    if (otros.length && Math.random() < 0.5) {
      const n = pick(otros).name;
      p.sendMessage(`§e${n} ha abandonado la partida`);
      despues(240, () => p.sendMessage(`§e${n} se ha unido a la partida`));
      despues(300, () => p.sendMessage(`<${n}> ¿me extrañaste?`));
    } else {
      p.sendMessage(`§e${pick(["El Testigo", "El Imitador"])} se ha unido a la partida`);
      despues(100, () => susurro(p, "juguemos"));
    }
    return true;
  },
  // el jugador "escribe" algo en el chat que no escribió (lo ven todos)
  auto_chat(p) {
    world.sendMessage(`<${p.name}> ${pick(AUTO_CHAT)}`);
    return true;
  },
  sonidos_falsos(p) {
    const s = pick(["random.door_open", "random.chestopen", "dig.stone", "random.eat", "random.door_close"]);
    const pos = puntoRelativo(p, rnd(0, 360), rnd(6, 12), 4) ?? p.location;
    for (let i = 0; i < 3; i++) despues(i * rint(15, 30), () => sonido(p, s, pos, 1));
    return true;
  },
  puertas(p) {
    const puertas = buscarPuertas(p.dimension, p.location, 8);
    if (!puertas.length) return EVENTOS.sonidos_falsos(p);
    mezclar(puertas).slice(0, rint(1, 3)).forEach((b, i) => despues(i * 12, () => alternarPuerta(p, b)));
    return true;
  },
  // luna roja: todas las puertas se abren y se cierran de golpe, una y otra vez
  portazos(p) {
    const puertas = buscarPuertas(p.dimension, p.location, 12);
    if (!puertas.length) return false;
    for (let r = 0; r < 4; r++) puertas.forEach((b, i) => despues(r * 16 + i * 2, () => alternarPuerta(p, b, r % 2 === 0)));
    despues(70, () => susurro(p, "estoy_dentro"));
    return true;
  },
  antorchas(p) {
    const luces = buscarBloques(p.dimension, p.location, 9, 3, (id) => LUCES.has(id));
    if (!luces.length) return false;
    mezclar(luces).slice(0, rint(2, 4)).forEach((b, i) => despues(i * 14, () => apagarLuz(p, b)));
    despues(70, () => susurro(p, "no_apagues"));
    return true;
  },
  cofre(p) {
    const cofres = buscarBloques(p.dimension, p.location, 9, 2,
      (id) => id === "minecraft:chest" || id === "minecraft:barrel" || id === "minecraft:trapped_chest", 10);
    for (const b of mezclar(cofres)) {
      const cont = safe(() => b.getComponent("minecraft:inventory").container);
      if (!cont) continue;
      const llenos = [];
      for (let i = 0; i < cont.size; i++) if (cont.getItem(i)) llenos.push(i);
      if (!llenos.length) continue;
      const slot = pick(llenos);
      const item = cont.getItem(slot);
      cont.setItem(slot, undefined);
      const pos = suelo(p.dimension, b.x + rint(-2, 2), b.y, b.z + rint(-2, 2), 2, 3) ?? { x: b.x + 0.5, y: b.y + 1.2, z: b.z + 0.5 };
      sonido(p, "random.chestopen", b.location, 1, 0.8);
      despues(25, () => {
        p.dimension.spawnItem(item, pos);
        sonido(p, "random.chestclosed", b.location, 1, 0.8);
        ponerRedstone(p.dimension, pos);
      });
      return true;
    }
    return false;
  },
  inventario(p) {
    const cont = safe(() => p.getComponent("minecraft:inventory").container);
    if (!cont) return false;
    const a = rint(0, 8);
    let b = rint(0, 8);
    if (a === b) b = (b + rint(1, 8)) % 9;
    if (!cont.getItem(a) && !cont.getItem(b)) return false;
    cont.swapItems(a, b, cont);
    despues(10, () => susurro(p, "buscas_algo"));
    return true;
  },
  cartel(p) {
    const pos = puntoRelativo(p, rnd(150, 210), rnd(3, 5), 6);
    if (!pos || !ponerCartel(p.dimension, pos, p.location, textoCartel(p))) return false;
    if (Math.random() < 0.5) despues(40, () => susurro(p, "detras_de_ti"));
    return true;
  },
  rastro(p) {
    const inicio = puntoRelativo(p, rnd(0, 360), rnd(8, 12), 6);
    if (!inicio) return false;
    const fin = p.location;
    const pasos = Math.floor(dist(inicio, fin)) - 2;
    for (let i = 0; i < pasos; i++) {
      const k = i / Math.max(pasos, 1);
      const x = inicio.x + (fin.x - inicio.x) * k + rnd(-0.6, 0.6);
      const z = inicio.z + (fin.z - inicio.z) * k + rnd(-0.6, 0.6);
      const pos = suelo(p.dimension, x, inicio.y + (fin.y - inicio.y) * k, z, 3, 4);
      if (pos && Math.random() < 0.75) ponerRedstone(p.dimension, pos);
    }
    ponerCartel(p.dimension, inicio, p.location, pick(["SIGUE LA\nSANGRE", "AQUÍ\nESTUVE", textoCartel(p)]));
    return true;
  },
  // de día: un objeto con nombre aparece detrás de ti
  regalo(p) {
    const [id, nombre, lore] = pick(REGALOS);
    const item = safe(() => new ItemStack(id, 1));
    if (!item) return false;
    safe(() => (item.nameTag = nombre.replace("{n}", p.name)));
    safe(() => item.setLore(lore));
    const pos = puntoRelativo(p, 180, 2, 4) ?? p.location;
    safe(() => p.dimension.spawnItem(item, add(pos, { x: 0, y: 0.3, z: 0 })));
    ponerRedstone(p.dimension, pos);
    return true;
  },
  // de día: un animal de la granja aparece muerto, con un cartel
  animal_muerto(p) {
    const animales = (safe(() => p.dimension.getEntities({ location: p.location, maxDistance: 40 })) ?? [])
      .filter((e) => ANIMALES.has(e.typeId) && !safe(() => e.getComponent("minecraft:is_tamed")) && !loVe(p, e));
    const a = pick(animales);
    if (!a) return false;
    const L = a.location;
    safe(() => a.kill());
    for (let i = 0; i < 3; i++) despues(i * 5, () => p.dimension.spawnParticle("eco:sangre", add(L, { x: 0, y: 0.6, z: 0 })));
    for (let i = 0; i < 4; i++) ponerRedstone(p.dimension, add(L, { x: rint(-1, 1), y: 0, z: rint(-1, 1) }));
    const sitio = suelo(p.dimension, L.x + rint(-1, 1), L.y, L.z + rint(-1, 1), 2, 3);
    if (sitio) ponerCartel(p.dimension, sitio, p.location, pick(["ERES EL\nSIGUIENTE", "{n}\nTE TOCA", "SONRÍE"]).replace("{n}", p.name.toUpperCase().slice(0, 14)));
    return true;
  },
  luna_roja() {
    if (!nocheActiva) {
      forzarLuna = true;
      world.setTimeOfDay(13000);
    } else iniciarLunaRoja();
    return true;
  },
};
EVENTOS.noche_roja = EVENTOS.luna_roja;

const SUSTOS = new Set(["susto", "camara_giro", "apagon", "testigo_susto", "parpadeo", "circulo", "golpes_puerta", "formulario"]);

// guion de la primera noche (segundos desde que oscurece)
const GUION = [
  [8, "no_estas_solo"], [25, "pasos"], [45, "ojos"], [70, "testigo_lejos"], [100, "puertas"],
  [125, "parpadeo"], [150, "cartel"], [175, "testigo_detras"], [220, "apagon"], [280, "asomarse"],
  [320, "voz_falsa"], [345, "testigo_acecho"], [395, "rastro"], [420, "camara_giro"], [470, "testigo_caza"],
];

// [evento, peso, fase mínima, lugar ("i" interior, "e" exterior, "" cualquiera)]
const BOLSA = [
  ["susurro", 3, 1, ""], ["pasos", 3, 1, ""], ["respiracion", 2, 1, ""], ["ojos", 2, 1, "e"],
  ["testigo_lejos", 3, 1, "e"], ["puertas", 2, 1, ""], ["cartel", 2, 1, ""], ["rastro", 1, 1, "e"],
  ["parpadeo", 2, 1, ""], ["asomarse", 4, 1, "i"], ["ventana", 3, 1, "i"],
  ["testigo_detras", 3, 2, ""], ["testigo_acecho", 3, 2, "e"], ["apagon", 3, 2, ""], ["golpes_puerta", 3, 2, "i"],
  ["camara_giro", 2, 2, ""], ["antorchas", 1, 2, ""], ["cofre", 2, 2, "i"], ["inventario", 1, 2, ""],
  ["golpe", 2, 2, ""], ["testigo_caza", 1, 2, "e"], ["risa", 1, 2, ""], ["susto", 1, 2, ""], ["formulario", 1, 2, ""],
  ["imitador", 4, 3, "e"], ["voz_falsa", 3, 3, ""], ["sonidos_falsos", 2, 3, ""], ["mensaje_sistema", 1, 3, ""],
  ["rayo", 1, 3, "e"], ["auto_chat", 1, 3, ""],
  ["testigo_caza", 2, 4, "e"], ["susto", 2, 4, ""], ["imitador", 2, 4, "e"], ["asomarse", 2, 4, ""],
];

// luna roja: lo peor de lo peor
const BOLSA_LUNA = [
  ["circulo", 3, 1, "e"], ["rayo", 3, 1, "e"], ["apagon", 3, 1, ""], ["camara_giro", 3, 1, ""], ["susto", 2, 1, ""],
  ["asomarse", 3, 1, ""], ["parpadeo", 3, 1, ""], ["testigo_caza", 2, 1, "e"], ["imitador", 2, 1, "e"],
  ["portazos", 3, 1, "i"], ["golpes_puerta", 2, 1, "i"], ["ventana", 2, 1, "i"], ["auto_chat", 2, 1, ""],
  ["golpe", 2, 1, ""], ["formulario", 1, 1, ""], ["mensaje_sistema", 1, 1, ""], ["voz_falsa", 2, 1, ""],
];

// de día: cosas pequeñas que no deberían estar ahí
const BOLSA_DIA = [
  ["testigo_lejos", 3, 1, "e"], ["cartel", 2, 1, ""], ["regalo", 2, 1, ""], ["animal_muerto", 2, 2, "e"],
  ["risa", 1, 1, ""], ["pasos", 1, 1, "i"], ["voz_falsa", 1, 2, ""], ["puertas", 1, 1, "i"], ["inventario", 1, 2, ""],
  ["ventana", 1, 2, "i"], ["mensaje_sistema", 1, 3, ""], ["susurro", 1, 2, ""],
];

function ejecutar(p, nombre) {
  if (nombre === "no_estas_solo") return susurro(p, "no_estas_solo");
  const fn = EVENTOS[nombre];
  return fn ? safe(() => fn(p)) === true : false;
}

function eventoAleatorio(p, bolsa) {
  const e = estado(p);
  const f = fase();
  const dentro = interior(p);
  const pausaSustos = lunaRoja ? 20 * 25 : 20 * 75;
  const opciones = bolsa.filter(([n, , min, lugar]) =>
    min <= f && n !== e.ultimo && (!lugar || (lugar === "i") === dentro) &&
    !(SUSTOS.has(n) && tick() - e.ultimoSusto < pausaSustos));
  for (let intento = 0; intento < 6 && opciones.length; intento++) {
    const total = opciones.reduce((s, o) => s + o[1], 0);
    let r = Math.random() * total;
    const elegido = opciones.find((o) => (r -= o[1]) < 0) ?? opciones[0];
    if (ejecutar(p, elegido[0])) {
      e.ultimo = elegido[0];
      if (SUSTOS.has(elegido[0])) e.ultimoSusto = tick();
      return elegido[0];
    }
  }
  return susurro(p) && "susurro";
}

// ------------------------------------------------------------------ ciclo de noches
function empezarNoche() {
  nocheActiva = true;
  const luna = forzarLuna || tocaLunaManana(); // se decide antes de contar la noche
  const idx = indiceNoche();
  if (prop("eco:ultima_noche", -999) !== idx) {
    setProp("eco:ultima_noche", idx);
    setProp("eco:noches", noches() + 1);
  }
  jugadores.clear();
  lunaRoja = false;
  if (luna) {
    forzarLuna = false;
    despues(20 * 12, iniciarLunaRoja);
  }
  for (const p of world.getAllPlayers()) aplicarNiebla(p);
}

function terminarNoche() {
  nocheActiva = false;
  const eraLuna = lunaRoja;
  if (lunaRoja) safe(() => world.getDimension("overworld").setWeather(WeatherType.Clear, 6000));
  lunaRoja = false;
  for (const c of [...monstruos.values()]) if (!c.datos.forzado) desaparecer(c, true, true);
  for (const p of world.getAllPlayers()) {
    aplicarNiebla(p);
    if (p.dimension.id !== "minecraft:overworld") continue;
    if (eraLuna) {
      safe(() => p.onScreenDisplay.setTitle("§7Sobreviviste", {
        subtitle: "§8...por ahora", fadeInDuration: 40, stayDuration: 80, fadeOutDuration: 40,
      }));
      // amanece rodeado de carteles
      for (let i = 0; i < 6; i++) {
        const d = girar({ x: 1, y: 0, z: 0 }, i * 60);
        const pos = suelo(p.dimension, p.location.x + d.x * 4, p.location.y, p.location.z + d.z * 4, 3, 4);
        if (pos) ponerCartel(p.dimension, pos, p.location, pick(["TE VI", "TE VI", "OTRA VEZ", "PRONTO"]));
      }
    } else if (Math.random() < 0.75) {
      // por la mañana encuentras algo que dejó anoche
      const pos = puntoRelativo(p, rnd(-40, 40), rnd(3, 5), 6);
      if (pos) ponerCartel(p.dimension, pos, p.location, textoCartel(p, CARTELES_MANANA));
    }
  }
  jugadores.clear();
}

/** El día antes de la luna roja hay avisos. */
function avisoLuna(p) {
  susurro(p, "esta_noche");
  safe(() => p.onScreenDisplay.setActionBar("§4El cielo tiene un color extraño..."));
  for (let i = 0; i < 3; i++) {
    const pos = puntoRelativo(p, rnd(0, 360), rnd(4, 9), 6);
    if (pos) ponerCartel(p.dimension, pos, p.location, pick(["ESTA\nNOCHE", "LA LUNA\nSALE ROJA", "NO\nDUERMAS"]));
  }
}

function cicloSegundo() {
  const noche = esNoche();
  if (noche && !nocheActiva) empezarNoche();
  else if (!noche && nocheActiva) terminarNoche();

  const f = fase();
  const t = world.getTimeOfDay();
  const seg = Math.floor(tick() / 20);
  for (const p of world.getAllPlayers()) {
    if (p.dimension.id !== "minecraft:overworld") continue;
    const e = estado(p);
    if (e.bloqueado) continue;

    if (!nocheActiva) {
      if (noches() < 1) continue; // el primer día es tranquilo
      if (t >= 9000 && tocaLunaManana() && prop("eco:aviso_luna", -1) !== indiceDia()) {
        setProp("eco:aviso_luna", indiceDia());
        for (const q of world.getAllPlayers()) avisoLuna(q);
      }
      if (tick() >= e.proxDia) {
        e.proxDia = tick() + 20 * rint(100, 200);
        if (Math.random() < 0.7) eventoAleatorio(p, BOLSA_DIA);
      }
      continue;
    }

    if (lunaRoja) {
      safe(() => p.dimension.spawnParticle("eco:ceniza", add(p.location, { x: 0, y: 5, z: 0 })));
      if (!interior(p)) safe(() => p.dimension.spawnParticle("eco:lluvia_sangre", add(p.location, { x: 0, y: 9, z: 0 })));
      if (seg % 4 === 0) sonido(p, "mob.warden.heartbeat", p.location, 0.5, 0.8);
      if (seg % 12 === 0 && Math.random() < 0.3) sonido(p, "eco.coro", add(p.getHeadLocation(), mul(dirHorizontal(p), -2)), 0.5);
      if (tick() >= e.proximo) {
        eventoAleatorio(p, BOLSA_LUNA);
        e.proximo = tick() + 20 * rint(9, 16);
      }
      continue;
    }

    if (f === 1 && e.guion < GUION.length) {
      if (segundosDeNoche() >= GUION[e.guion][0]) {
        ejecutar(p, GUION[e.guion][1]);
        e.guion++;
      }
      continue;
    }
    if (tick() >= e.proximo) {
      eventoAleatorio(p, BOLSA);
      const [a, b] = { 1: [35, 60], 2: [25, 45], 3: [20, 38], 4: [15, 30] }[f] ?? [30, 50];
      e.proximo = tick() + 20 * rint(a, b);
    }
  }
}

/** ¿La próxima noche es luna roja? Se decide una vez por día y se guarda. */
function tocaLunaManana() {
  const dia = indiceDia();
  if (prop("eco:luna_dia", -1) !== dia) {
    setProp("eco:luna_dia", dia);
    setProp("eco:luna_prox", tocaLuna(noches() + 1));
  }
  return prop("eco:luna_prox", false) === true;
}

function cicloMonstruos() {
  for (const [id, c] of monstruos) {
    if (!valido(c.ent) || !valido(c.jugador) || c.jugador.dimension.id !== c.ent.dimension.id) {
      monstruos.delete(id);
      safe(() => c.ent.remove());
      continue;
    }
    c.t += 2;
    try {
      MODOS[c.modo]?.(c);
    } catch (e) {
      console.warn(`[ECO] ${c.tipo}/${c.modo}: ${e}`);
    }
    if (c.t % 10 === 0 && valido(c.ent)) {
      const L = c.ent.location;
      safe(() => c.ent.dimension.spawnParticle("eco:sangre", { x: L.x + rnd(-0.4, 0.4), y: L.y + rnd(1, 2.5), z: L.z + rnd(-0.4, 0.4) }));
    }
  }
}

/** Entidades sin control (huevos de prueba o restos de otra sesión): las adopta el jugador más cercano. */
function adoptarHuerfanos() {
  const dim = world.getDimension("overworld");
  for (const ent of safe(() => dim.getEntities({ families: ["eco"] })) ?? []) {
    if (monstruos.has(ent.id)) continue;
    let cerca, mejor = 64;
    for (const p of world.getAllPlayers()) {
      if (p.dimension.id !== dim.id) continue;
      const d = dist(p.location, ent.location);
      if (d < mejor) (mejor = d), (cerca = p);
    }
    if (!cerca) {
      safe(() => ent.remove());
      continue;
    }
    safe(() => ent.setProperty("eco:altura", rint(0, 4)));
    if (ent.typeId === "eco:imitador") registrar(ent, "imitador", "imitar", cerca, { nombre: cerca.name, forzado: true });
    else registrar(ent, "testigo", "acecho", cerca, { max: 20 * 120, forzado: true });
  }
}

// ------------------------------------------------------------------ comandos (/scriptevent eco:...)
const AYUDA = [
  "§4ECO§7 — comandos de prueba (/scriptevent eco:<comando>)",
  "§7estado · ayuda · susto · testigo [lejos|acecho|detras|caza] · imitador · luna",
  "§7fase <0-4> (0 = automática) · noche [roja] · dia · limpiar · reiniciar",
  "§7evento <nombre>: " + Object.keys(EVENTOS).join(", "),
];

function ejecutarComando(id, arg, p) {
  const [a1] = arg.split(/\s+/);
  switch (id) {
    case "estado": {
      const ms = [...monstruos.values()].map((c) => `${c.tipo}:${c.modo}`).join(", ") || "ninguna";
      p.sendMessage(`§4ECO v${VERSION}§7 · noches: ${noches()} · fase: ${fase()}` +
        `${prop("eco:fase_forzada", 0) ? " (forzada)" : ""} · noche: ${nocheActiva ? (lunaRoja ? "§4LUNA ROJA§7" : "sí") : "no"}` +
        ` · interior: ${interior(p) ? "sí" : "no"} · entidades: ${ms}`);
      return;
    }
    case "ayuda":
      AYUDA.forEach((l) => p.sendMessage(l));
      return;
    case "susto":
      susto(p);
      return;
    case "testigo": {
      const modo = ["lejos", "acecho", "detras", "caza"].includes(a1) ? a1 : "detras";
      const c = monstruoDe(p, "testigo");
      if (c) desaparecer(c, false, false);
      if (!testigo(p, modo, { forzado: true, dur: 20 * 30 })) p.sendMessage(`§cEl Testigo no pudo aparecer: §7${ultimoError}`);
      return;
    }
    case "imitador": {
      const c = monstruoDe(p, "imitador");
      if (c) desaparecer(c, false, false);
      if (!imitador(p, { forzado: true })) p.sendMessage(`§cEl Imitador no pudo aparecer: §7${ultimoError}`);
      return;
    }
    case "fase": {
      const n = Math.max(0, Math.min(4, parseInt(a1) || 0));
      setProp("eco:fase_forzada", n);
      p.sendMessage(`§7Fase ${n === 0 ? "automática" : n}.`);
      for (const q of world.getAllPlayers()) aplicarNiebla(q);
      return;
    }
    case "evento": {
      if (!EVENTOS[a1] && a1 !== "no_estas_solo") {
        p.sendMessage("§7Eventos: " + Object.keys(EVENTOS).join(", "));
        return;
      }
      if (!ejecutar(p, a1)) p.sendMessage(`§7El evento ${a1} no encontró dónde ocurrir aquí.`);
      return;
    }
    case "luna":
      EVENTOS.luna_roja(p);
      return;
    case "noche":
      if (a1 === "roja" || a1 === "luna") EVENTOS.luna_roja(p);
      else world.setTimeOfDay(13000);
      return;
    case "dia":
      world.setTimeOfDay(1000);
      return;
    case "limpiar":
      for (const c of [...monstruos.values()]) desaparecer(c, false, false);
      bloquear(p, false);
      return;
    case "reiniciar":
      setProp("eco:noches", 0);
      setProp("eco:fase_forzada", 0);
      setProp("eco:ultima_noche", -999);
      setProp("eco:luna_dia", -1);
      jugadores.clear();
      p.sendMessage("§7ECO reiniciado: la próxima noche será la primera.");
      return;
    case "pagina":
      p.sendMessage("§7El diario no está en esta versión.");
      return;
    default:
      p.sendMessage("§7Comando desconocido. Usa /scriptevent eco:ayuda");
  }
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (!ev.id.startsWith("eco:")) return;
  const fuente = ev.sourceEntity;
  const p = fuente?.typeId === "minecraft:player" ? fuente : world.getAllPlayers()[0];
  if (!p) return;
  try {
    ejecutarComando(ev.id.slice(4), (ev.message ?? "").trim().toLowerCase(), p);
  } catch (e) {
    p.sendMessage(`§c[ECO] Error: ${e}`);
  }
});

// ------------------------------------------------------------------ reacciones
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player") return;
  const c = monstruos.get(hitEntity?.id);
  if (!c) return;
  const p = damagingEntity;
  if (c.tipo === "imitador") {
    if (c.modo !== "caza") revelar(c);
    return;
  }
  // golpear al Testigo solo lo enfada: se va... y vuelve detrás de ti
  sonidoMundo(c.ent.dimension, "eco.risa", c.ent.location, 1.2);
  desaparecer(c, true, true);
  despues(60, () => testigo(p, "detras", { voz: "por_que_corres", espera: 80 }));
});

// intentar dormir de noche es mala idea
world.afterEvents.playerInteractWithBlock.subscribe(({ player, block }) => {
  if (!nocheActiva || !block?.typeId?.includes("bed")) return;
  const prob = lunaRoja ? 1 : fase() >= 2 ? 0.5 : 0.25;
  if (Math.random() > prob) return;
  const cama = centro(block);
  despues(60, () => {
    if (!safe(() => player.isSleeping)) return;
    const pos = suelo(player.dimension, cama.x + rint(-1, 1), cama.y, cama.z + rint(-1, 1), 2, 2)
      ?? suelo(player.dimension, cama.x, cama.y, cama.z, 2, 2);
    if (pos) safe(() => player.teleport(pos)); // te despierta
    sonido(player, "eco.s.abre_los_ojos", player.getHeadLocation(), 1.4);
    despues(8, () => {
      if (!susto(player)) golpear(player);
    });
    despues(60, () => {
      const sitio = suelo(player.dimension, cama.x + rint(-2, 2), cama.y, cama.z + rint(-2, 2), 2, 2);
      if (sitio) ponerCartel(player.dimension, sitio, cama, pick(["NO\nDUERMAS", "TE VI\nDORMIR", "ABRE LOS\nOJOS"]));
      susurro(player, "no_duermas");
    });
  });
});

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity?.typeId !== "minecraft:player") return;
  for (const c of [...monstruos.values()]) if (c.jugador.id === deadEntity.id) desaparecer(c, false, true);
  bloquear(deadEntity, false);
  const pos = deadEntity.location;
  const nombre = deadEntity.name;
  // donde caíste queda un cartel con tu nombre
  despues(20, () => ponerCartel(deadEntity.dimension, pos, add(pos, { x: 0, y: 0, z: 1 }), `${nombre.toUpperCase().slice(0, 14)}\nAQUÍ`));
  safe(() => deadEntity.sendMessage("§4§oTe encontró."));
});

world.afterEvents.playerSpawn.subscribe(({ player }) => {
  bloquear(player, false);
  aplicarNiebla(player);
});

// ------------------------------------------------------------------ arranque
system.run(() => {
  const protegido = (nombre, fn) => () => {
    try {
      fn();
    } catch (e) {
      console.warn(`[ECO] ${nombre}: ${e}`);
    }
  };
  system.runInterval(protegido("director", cicloSegundo), 20);
  system.runInterval(protegido("entidades", cicloMonstruos), 2);
  system.runInterval(protegido("huerfanos", adoptarHuerfanos), 100);
  console.warn(`[ECO] v${VERSION} cargado`);
});
