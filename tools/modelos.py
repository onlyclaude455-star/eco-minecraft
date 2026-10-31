"""Modelos 3D y texturas de las entidades de ECO.

Cada modelo se define con huesos y cubos. Las caras de los cubos se empaquetan
en un atlas (UV por cara, 4 px por unidad) y se pintan con funciones
procedurales: piel con ruido, venas, sangre, dientes y la sonrisa.
"""
import math
import random

import numpy as np
from PIL import Image

R = 4  # píxeles de textura por unidad de modelo

SANGRE = (0.50, 0.02, 0.02)
SANGRE_OSCURA = (0.22, 0.0, 0.0)
SANGRE_SECA = (0.32, 0.05, 0.03)
NEGRO = (0.02, 0.01, 0.01)
HUESO = (0.86, 0.80, 0.64)


# ---------------------------------------------------------------- geometría
class Modelo:
    def __init__(self, nombre):
        self.nombre = nombre
        self.huesos = []

    def hueso(self, nombre, pivote, padre=None, rot=None):
        h = {"name": nombre, "pivot": pivote, "cubes": []}
        if padre:
            h["parent"] = padre
        if rot:
            h["rotation"] = rot
        self.huesos.append(h)
        return h

    def cubo(self, hueso, etiqueta, origen, tam, inflar=0.0):
        hueso["cubes"].append({"tag": etiqueta, "origin": origen, "size": tam, "inflate": inflar})

    def caras(self):
        for h in self.huesos:
            for c in h["cubes"]:
                w, hh, d = c["size"]
                for direc, (fw, fh) in (
                    ("north", (w, hh)), ("south", (w, hh)),
                    ("east", (d, hh)), ("west", (d, hh)),
                    ("up", (w, d)), ("down", (w, d)),
                ):
                    yield h, c, direc, max(1, round(fw * R)), max(1, round(fh * R))


def empaquetar(modelo, ancho=256):
    caras = sorted(modelo.caras(), key=lambda f: -f[4])
    x = y = fila = 0
    colocadas = []
    for h, c, direc, w, hh in caras:
        if x + w > ancho:
            x, y, fila = 0, y + fila + 1, 0
        colocadas.append((h, c, direc, x, y, w, hh))
        x += w + 1
        fila = max(fila, hh)
    alto = 1
    while alto < y + fila + 1:
        alto *= 2
    return colocadas, ancho, alto


def geometria(modelo, colocadas, ancho, alto, altura_visible):
    uv = {}
    for h, c, direc, x, y, w, hh in colocadas:
        uv.setdefault(id(c), {})[direc] = {"uv": [x, y], "uv_size": [w, hh]}
    huesos = []
    for h in modelo.huesos:
        b = {k: v for k, v in h.items() if k != "cubes"}
        cubos = []
        for c in h["cubes"]:
            cj = {"origin": c["origin"], "size": c["size"], "uv": uv[id(c)]}
            if c["inflate"]:
                cj["inflate"] = c["inflate"]
            cubos.append(cj)
        if cubos:
            b["cubes"] = cubos
        huesos.append(b)
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": f"geometry.eco.{modelo.nombre}",
                "texture_width": ancho,
                "texture_height": alto,
                "visible_bounds_width": 4,
                "visible_bounds_height": altura_visible,
                "visible_bounds_offset": [0, altura_visible / 2, 0],
            },
            "bones": huesos,
        }],
    }


# ---------------------------------------------------------------- pintura
def ruido(h, w, escala, rng):
    peq = rng.random((max(2, h // escala + 2), max(2, w // escala + 2)))
    img = Image.fromarray((peq * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0


def mezclar(px, mask, color, alpha=1.0):
    m = np.clip(mask * alpha, 0, 1)[..., None]
    px[..., :3] = px[..., :3] * (1 - m) + np.array(color, dtype=np.float32) * m


def elipse(h, w, cx, cy, rx, ry):
    yy, xx = np.mgrid[0:h, 0:w]
    return (((xx + 0.5 - cx) / max(rx, 0.1)) ** 2 + ((yy + 0.5 - cy) / max(ry, 0.1)) ** 2) <= 1.0


def piel(px, base, rng, variacion=0.10, manchas=0.0):
    h, w = px.shape[:2]
    n = ruido(h, w, 3, rng) * 0.6 + ruido(h, w, 1, rng) * 0.4
    for i in range(3):
        px[..., i] = base[i] * (1 - variacion + 2 * variacion * n)
    px[..., 3] = 1.0
    if manchas:
        moretones = ruido(h, w, 6, rng)
        mezclar(px, (moretones > 1 - manchas).astype(np.float32), (base[0] * 0.55, base[1] * 0.45, base[2] * 0.55), 0.6)


def venas(px, rng, cantidad, color=(0.30, 0.18, 0.28)):
    h, w = px.shape[:2]
    for _ in range(cantidad):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        ang = rng.uniform(0, 2 * math.pi)
        for _ in range(int(rng.uniform(4, 14))):
            xi, yi = int(x), int(y)
            if 0 <= xi < w and 0 <= yi < h:
                mezclar(px[yi:yi + 1, xi:xi + 1], np.ones((1, 1)), color, 0.55)
            ang += rng.uniform(-0.7, 0.7)
            x += math.cos(ang)
            y += math.sin(ang)


def goteo(px, rng, x, y0, largo, grosor=1, color=SANGRE):
    h, w = px.shape[:2]
    x = int(x)
    for k in range(int(largo)):
        y = int(y0) + k
        if y >= h:
            break
        g = grosor + (1 if k > largo - 3 else 0)
        for dx in range(g):
            if 0 <= x + dx < w and 0 <= y < h:
                oscuro = 0.75 + 0.25 * (k / max(largo, 1))
                c = tuple(cc * oscuro for cc in color)
                mezclar(px[y:y + 1, x + dx:x + dx + 1], np.ones((1, 1)), c, 0.95)


def salpicadura(px, rng, cantidad, tam=(1, 3), color=SANGRE_SECA, alpha=0.85):
    h, w = px.shape[:2]
    for _ in range(cantidad):
        cx, cy = rng.uniform(0, w), rng.uniform(0, h)
        r = rng.uniform(*tam)
        mezclar(px, elipse(h, w, cx, cy, r, r * rng.uniform(0.6, 1.3)).astype(np.float32), color, alpha)
        for _ in range(int(rng.uniform(0, 4))):
            a = rng.uniform(0, 2 * math.pi)
            d = r + rng.uniform(1, 3)
            mezclar(px, elipse(h, w, cx + math.cos(a) * d, cy + math.sin(a) * d, 0.7, 0.7).astype(np.float32), color, alpha)


def gotas_desde_arriba(px, rng, cantidad, largo=(3, 12), color=SANGRE):
    h, w = px.shape[:2]
    for _ in range(cantidad):
        goteo(px, rng, rng.uniform(0, w - 1), 0, rng.uniform(*largo) * h / 40 + 2, int(rng.uniform(1, 2.6)), color)


def empapar(px, rng, desde, color=SANGRE_OSCURA):
    """Cubre de sangre la parte inferior de la cara (manos, garras)."""
    h, w = px.shape[:2]
    n = ruido(h, w, 2, rng)
    yy = np.mgrid[0:h, 0:w][0] / max(h - 1, 1)
    mask = np.clip((yy - desde) * 4 + (n - 0.5), 0, 1)
    mezclar(px, mask, color, 0.9)
    salpicadura(px, rng, 3, (0.5, 1.5), SANGRE, 0.9)


def brillo(px, mask, color):
    """Píxeles emisivos: con entity_emissive_alpha, el alfa bajo hace que brillen."""
    mezclar(px, mask.astype(np.float32), color, 1.0)
    px[..., 3] = np.where(mask, 0.0, px[..., 3])


def dientes(px, x0, x1, ybase, alto, hacia_abajo, rng, ancho=2):
    h, w = px.shape[:2]
    x = x0
    while x < x1:
        largo = max(1, int(round(alto * rng.uniform(0.6, 1.1))))
        for k in range(largo):
            y = ybase + k if hacia_abajo else ybase - k
            margen = int(k * ancho / (2 * largo))
            for xx in range(int(x) + margen, int(x) + ancho - margen):
                if 0 <= xx < w and 0 <= y < h:
                    sucio = rng.uniform(0.75, 1.0)
                    px[y, xx, :3] = [HUESO[0] * sucio, HUESO[1] * sucio, HUESO[2] * sucio * 0.9]
        x += ancho + (1 if rng.random() < 0.3 else 0)


def sonrisa(px, rng, cx0, cx1, yc, curva, abertura, cortes=True):
    """Sonrisa de oreja a oreja: curva hacia abajo en el centro, llena de dientes."""
    h, w = px.shape[:2]
    puntos = []
    for x in range(int(cx0), int(cx1) + 1):
        t = (x - cx0) / max(cx1 - cx0, 1)
        k = 1 - (2 * t - 1) ** 2
        centro = yc + curva * k
        ab = max(1.0, abertura * math.sqrt(max(k, 0)))
        puntos.append((x, centro, ab))
        y0, y1 = int(round(centro - ab / 2)), int(round(centro + ab / 2))
        for y in range(y0 - 1, y1 + 2):
            if 0 <= x < w and 0 <= y < h:
                px[y, x, :3] = SANGRE_OSCURA if (y == y0 - 1 or y == y1 + 1) else NEGRO
    # dientes arriba y abajo
    for x, centro, ab in puntos[1:-1:2]:
        if ab < 2:
            continue
        y0, y1 = int(round(centro - ab / 2)), int(round(centro + ab / 2))
        largo = max(1, int(ab * 0.45))
        dientes(px, x, x + 2, y0, largo, True, rng, 2)
        dientes(px, x, x + 2, y1, largo, False, rng, 2)
    # sangre que gotea de la boca
    for x, centro, ab in puntos[::3]:
        if rng.random() < 0.55:
            goteo(px, rng, x, centro + ab / 2 + 1, rng.uniform(3, h - centro), 1, SANGRE)
    if cortes:  # cortes en las mejillas que alargan la sonrisa
        for lado in (-1, 1):
            x0 = cx0 if lado < 0 else cx1
            y = yc
            for k in range(int(w * 0.10) + 2):
                xi, yi = int(x0 + lado * k), int(y - k * 0.8)
                if 0 <= xi < w and 0 <= yi < h:
                    px[yi, xi, :3] = SANGRE_OSCURA
                    if k % 2 == 0 and yi + 1 < h:
                        px[yi + 1, xi, :3] = (0.1, 0.05, 0.05)


def ojo_hundido(px, cx, cy, rx, ry, pupila, color_pupila=(1.0, 1.0, 1.0)):
    h, w = px.shape[:2]
    mezclar(px, elipse(h, w, cx, cy + 1, rx + 1.5, ry + 1.5).astype(np.float32), (0.18, 0.12, 0.14), 0.7)
    mezclar(px, elipse(h, w, cx, cy, rx, ry).astype(np.float32), NEGRO, 1.0)
    brillo(px, elipse(h, w, cx, cy, pupila, pupila), color_pupila)


def lagrima(px, rng, cx, cy, largo):
    goteo(px, rng, cx, cy, largo, 1, SANGRE)


def pelo(px, rng, desde_y=0.0, densidad=0.8, largo=1.0):
    h, w = px.shape[:2]
    for x in range(w):
        if rng.random() < densidad:
            fin = int(h * min(1.0, desde_y + rng.uniform(0.3, 1.0) * largo))
            for y in range(fin):
                brillo_pelo = rng.uniform(0.03, 0.09)
                px[y, x, :3] = (brillo_pelo, brillo_pelo, brillo_pelo * 1.1)


def pintar_atlas(colocadas, ancho, alto, pintor, semilla):
    rng = np.random.default_rng(semilla)
    atlas = np.zeros((alto, ancho, 4), dtype=np.float32)
    for h, c, direc, x, y, w, hh in colocadas:
        px = atlas[y:y + hh, x:x + w]
        pintor(px, h["name"], c["tag"], direc, rng)
    return Image.fromarray((np.clip(atlas, 0, 1) * 255).astype(np.uint8), "RGBA")


# ---------------------------------------------------------------- El Testigo
def modelo_testigo():
    m = Modelo("testigo")
    raiz = m.hueso("root", [0, 0, 0])
    cuerpo = m.hueso("body", [0, 27, 0], "root", [12, 0, 0])
    m.cubo(cuerpo, "pelvis", [-4.5, 27, -2.5], [9, 4, 5])
    m.cubo(cuerpo, "torso", [-5, 31, -2.5], [10, 14, 5])
    for i in range(4):
        m.cubo(cuerpo, "columna", [-1, 32 + i * 3.2, 2.5], [2, 2, 1])
    cuello = m.hueso("neck", [0, 45, 0], "body")
    m.cubo(cuello, "cuello", [-1.5, 44, -1.5], [3, 6, 3])
    cabeza = m.hueso("head", [0, 50, 0], "neck")
    m.cubo(cabeza, "cabeza", [-4.5, 50, -5], [9, 11, 9])
    for lado, s in (("left", 1), ("right", -1)):
        hombro = 6 * s
        brazo = m.hueso(f"{lado}Arm", [hombro, 44, 0], "body", [-16, 0, 4 * s])
        m.cubo(brazo, "brazo", [hombro - 1.5, 27, -1.5], [3, 18, 3])
        ante = m.hueso(f"{lado}Forearm", [hombro, 27.5, 0], f"{lado}Arm")
        m.cubo(ante, "antebrazo", [hombro - 1.25, 11, -1.25], [2.5, 17, 2.5])
        m.cubo(ante, "mano", [hombro - 1.75, 6, -1.5], [3.5, 5, 2.5])
        for k in range(3):
            m.cubo(ante, "garra", [hombro - 1.5 + k * 1.1, 0.5, -1.1], [0.75, 5.5, 0.75])
        cadera = 2.5 * s
        pierna = m.hueso(f"{lado}Leg", [cadera, 27, 0], "root")
        m.cubo(pierna, "muslo", [cadera - 1.5, 14, -1.5], [3, 13, 3])
        tibia = m.hueso(f"{lado}Shin", [cadera, 14, 0], f"{lado}Leg")
        m.cubo(tibia, "tibia", [cadera - 1.25, 1.5, -1.25], [2.5, 12.5, 2.5])
        m.cubo(tibia, "pie", [cadera - 1.5, 0, -3.5], [3, 1.5, 4.5])
    return m


def pintor_testigo(px, hueso, tag, direc, rng):
    h, w = px.shape[:2]
    base = (0.80, 0.78, 0.74)  # piel pálida, casi gris
    piel(px, base, rng, 0.10, 0.18)
    venas(px, rng, max(1, w * h // 120))
    if tag == "cabeza":
        if direc == "north":
            # pelo que cae por los lados de la cara
            for x in list(range(0, 4)) + list(range(w - 4, w)):
                fin = int(h * rng.uniform(0.35, 0.9))
                px[:fin, x, :3] = rng.uniform(0.03, 0.08)
            px[:3, :, :3] = 0.05
            ojo_hundido(px, w * 0.30, h * 0.36, 4.0, 5.0, 1.2)
            ojo_hundido(px, w * 0.70, h * 0.36, 4.0, 5.0, 1.2)
            lagrima(px, rng, w * 0.30, h * 0.36 + 5, h * 0.25)
            lagrima(px, rng, w * 0.70 + 1, h * 0.36 + 5, h * 0.18)
            sonrisa(px, rng, w * 0.06, w * 0.94, h * 0.64, h * 0.10, h * 0.13)
        elif direc in ("east", "west", "south", "up"):
            pelo(px, rng, 0.0 if direc != "up" else 1.0, 0.95, 1.0)
        else:
            salpicadura(px, rng, 3, (1, 2.5), SANGRE)
        return
    if tag == "torso" and direc == "north":
        for i in range(4):  # costillas marcadas
            y = int(h * (0.18 + i * 0.13))
            for x in range(w):
                if abs(x - w / 2) > 2 and y < h:
                    curva = int(abs(x - w / 2) * 0.25)
                    if y + curva < h:
                        px[y + curva, x, :3] *= 0.62
        gotas_desde_arriba(px, rng, 7, (10, 30))
        salpicadura(px, rng, 5, (1.5, 3.5), SANGRE)
        return
    if tag in ("mano", "garra"):
        if tag == "garra":
            px[..., :3] = (0.10, 0.07, 0.06)
        empapar(px, rng, 0.0 if tag == "garra" else 0.1)
        return
    if tag == "antebrazo":
        empapar(px, rng, 0.55)
        return
    if tag == "pie":
        mezclar(px, np.ones((h, w)), (0.25, 0.20, 0.18), 0.7)
        return
    if direc != "down":
        if rng.random() < 0.5:
            gotas_desde_arriba(px, rng, int(rng.uniform(1, 4)), (4, 20))
        salpicadura(px, rng, int(rng.uniform(0, 3)), (0.8, 2.5))


# ---------------------------------------------------------------- El Imitador
def modelo_imitador():
    m = Modelo("imitador")
    m.hueso("root", [0, 0, 0])
    cuerpo = m.hueso("body", [0, 24, 0], "root", [22, 0, 0])
    m.cubo(cuerpo, "pelvis", [-5, 22, -3], [10, 5, 6])
    m.cubo(cuerpo, "torso", [-6.5, 27, -3.5], [13, 15, 7])
    m.cubo(cuerpo, "joroba", [-4.5, 33, 3.5], [9, 8, 3])
    for i in range(5):
        m.cubo(cuerpo, "columna", [-1, 28 + i * 3, 6.5], [2, 1.5, 1.2])
    cuello = m.hueso("neck", [0, 41, -1], "body", [-18, 0, 0])
    m.cubo(cuello, "cuello", [-2, 40, -3.5], [4, 5, 4])
    cabeza = m.hueso("head", [0, 45, -1.5], "neck")
    m.cubo(cabeza, "cabeza", [-5, 46, -8], [10, 8, 10])
    mandibula = m.hueso("jaw", [0, 46.5, 1], "head")
    m.cubo(mandibula, "mandibula", [-4.6, 42.5, -7.6], [9.2, 4, 9.2])
    for lado, s in (("left", 1), ("right", -1)):
        hombro = 8 * s
        brazo = m.hueso(f"{lado}Arm", [hombro, 40, -1], "body", [-32, 0, 6 * s])
        m.cubo(brazo, "brazo", [hombro - 2, 25, -3], [4, 16, 4])
        ante = m.hueso(f"{lado}Forearm", [hombro, 26, -1], f"{lado}Arm")
        m.cubo(ante, "antebrazo", [hombro - 1.75, 9, -2.75], [3.5, 17, 3.5])
        m.cubo(ante, "mano", [hombro - 2.25, 3.5, -3.25], [4.5, 6, 2.5])
        for k in range(4):
            m.cubo(ante, "garra", [hombro - 2 + k * 1.15, -2, -2.6], [0.8, 6, 0.8])
        cadera = 3 * s
        pierna = m.hueso(f"{lado}Leg", [cadera, 22, 0], "root")
        m.cubo(pierna, "muslo", [cadera - 2.25, 12, -2.25], [4.5, 10, 4.5])
        tibia = m.hueso(f"{lado}Shin", [cadera, 12, 0], f"{lado}Leg")
        m.cubo(tibia, "tibia", [cadera - 2, 1.5, -2], [4, 10.5, 4])
        m.cubo(tibia, "pie", [cadera - 2.25, 0, -4.5], [4.5, 1.5, 5.5])
    return m


def pintor_imitador(px, hueso, tag, direc, rng):
    h, w = px.shape[:2]
    base = (0.42, 0.37, 0.35)  # piel quemada y grisácea
    piel(px, base, rng, 0.16, 0.30)
    venas(px, rng, max(1, w * h // 90), (0.25, 0.08, 0.08))
    if tag == "cabeza":
        if direc == "north":
            ojo_hundido(px, w * 0.28, h * 0.38, 3.5, 3.0, 1.4, (1.0, 0.08, 0.05))
            ojo_hundido(px, w * 0.72, h * 0.38, 3.5, 3.0, 1.4, (1.0, 0.08, 0.05))
            ojo_hundido(px, w * 0.42, h * 0.12, 1.6, 1.4, 0.8, (1.0, 0.15, 0.05))
            ojo_hundido(px, w * 0.60, h * 0.15, 1.3, 1.1, 0.7, (1.0, 0.15, 0.05))
            lagrima(px, rng, w * 0.28, h * 0.38 + 3, h * 0.3)
            # labio superior retraído: encías y fila de dientes de punta a punta
            y0 = int(h * 0.72)
            px[y0:, :, :3] = (0.45, 0.06, 0.08)
            dientes(px, 0, w, y0 + 1, h - y0, True, rng, 2)
            for lado in (0, w - 1):  # comisuras rasgadas
                for k in range(6):
                    yi = y0 - k
                    xi = lado + (k if lado == 0 else -k)
                    if 0 <= yi < h and 0 <= xi < w:
                        px[yi, xi, :3] = SANGRE_OSCURA
        elif direc == "down":  # paladar, visible con la boca abierta
            px[..., :3] = (0.30, 0.02, 0.04)
            dientes(px, 0, w, 0, 4, True, rng, 2)
        elif direc == "up":
            salpicadura(px, rng, 6, (1, 3), SANGRE_SECA)
        else:
            gotas_desde_arriba(px, rng, 3, (5, 20))
        return
    if tag == "mandibula":
        if direc == "north":
            px[: int(h * 0.45), :, :3] = (0.45, 0.06, 0.08)
            dientes(px, 0, w, int(h * 0.45), int(h * 0.45), False, rng, 2)
            gotas_desde_arriba(px, rng, 8, (15, 40))
        elif direc == "up":  # lengua y fondo de la boca
            px[..., :3] = (0.12, 0.0, 0.01)
            mezclar(px, elipse(h, w, w / 2, h * 0.55, w * 0.22, h * 0.35).astype(np.float32), (0.55, 0.12, 0.14), 1.0)
            dientes(px, 0, w, h - 1, 4, False, rng, 2)
        else:
            empapar(px, rng, 0.2)
        return
    if tag == "torso" and direc == "north":
        # pecho abierto con costillas
        cav = elipse(h, w, w / 2, h * 0.5, w * 0.30, h * 0.36)
        px[cav, :3] = (0.18, 0.0, 0.01)
        for i in range(5):
            y = int(h * (0.22 + i * 0.13))
            for x in range(w):
                if cav[min(y, h - 1), x] and abs(x - w / 2) > 1:
                    px[y:y + 2, x, :3] = (0.80, 0.72, 0.60)
        gotas_desde_arriba(px, rng, 10, (10, 40))
        salpicadura(px, rng, 6, (1.5, 4), SANGRE)
        return
    if tag in ("mano", "garra"):
        if tag == "garra":
            px[..., :3] = (0.12, 0.10, 0.08)
        empapar(px, rng, 0.0)
        return
    if tag == "antebrazo":
        empapar(px, rng, 0.35)
        return
    if direc != "down":
        if rng.random() < 0.65:
            gotas_desde_arriba(px, rng, int(rng.uniform(1, 5)), (4, 24))
        salpicadura(px, rng, int(rng.uniform(1, 4)), (0.8, 3))


MODELOS = {
    "testigo": (modelo_testigo, pintor_testigo, 5),
    "imitador": (modelo_imitador, pintor_imitador, 5),
}


def generar(nombre, semilla=13):
    hacer, pintor, alto_visible = MODELOS[nombre]
    m = hacer()
    colocadas, ancho, alto = empaquetar(m)
    geo = geometria(m, colocadas, ancho, alto, alto_visible)
    img = pintar_atlas(colocadas, ancho, alto, pintor, semilla)
    cara = None
    for h, c, direc, x, y, w, hh in colocadas:
        if c["tag"] == "cabeza" and direc == "north":
            cara = img.crop((x, y, x + w, y + hh))
    return geo, img, cara
