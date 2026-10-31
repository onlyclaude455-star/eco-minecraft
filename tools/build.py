"""Construye ECO.mcaddon (paquete de comportamiento + paquete de recursos).

Uso:  python3 tools/build.py
Salida: build/ECO_BP, build/ECO_RP y dist/ECO.mcaddon
"""
import json
import math
import os
import shutil
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import modelos  # noqa: E402
import sonidos  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(RAIZ, "build")
DIST = os.path.join(RAIZ, "dist")
BP = os.path.join(BUILD, "ECO_BP")
RP = os.path.join(BUILD, "ECO_RP")

VERSION = [2, 2, 0]
MIN_MOTOR = [1, 21, 50]
API_SERVER = "1.16.0"
API_UI = "1.3.0"
UUID = {
    "bp": "6f3c2a1e-8b4d-4f7a-9c2e-1d5b7a9e3f01",
    "bp_datos": "a2e4c6b8-1f3d-4a5b-8c7d-9e0f1a2b3c02",
    "bp_script": "c8d0e2f4-6a7b-4c9d-8e1f-2a3b4c5d6e03",
    "rp": "e1f3a5c7-9b2d-4e6f-8a0b-c2d4e6f8a004",
    "rp_recursos": "b7d9f1a3-5c7e-4a9b-8d0f-e2a4c6e8b005",
}

ENTIDADES = {
    # id: (nombre visible, color huevo base, color huevo motas, velocidad caza)
    "testigo": ("El Testigo", "#d6d0c4", "#6e0000", 0.34),
    "imitador": ("El Imitador", "#4a403c", "#a00000", 0.38),
}


def escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        if isinstance(datos, str):
            f.write(datos)
        else:
            json.dump(datos, f, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------- comportamiento
def entidad_bp(ident, velocidad):
    jugador = {"test": "is_family", "subject": "other", "value": "player"}
    return {
        "format_version": "1.20.80",
        "minecraft:entity": {
            "description": {
                "identifier": f"eco:{ident}",
                "is_spawnable": True,
                "is_summonable": True,
                "is_experimental": False,
                "properties": {
                    "eco:estado": {"type": "int", "range": [0, 3], "default": 0, "client_sync": True},
                    "eco:altura": {"type": "int", "range": [0, 4], "default": 0, "client_sync": True},
                    # 0 de pie, 1 agachado (techo bajo), 2 asomado a su izquierda, 3 asomado a su derecha
                    "eco:pose": {"type": "int", "range": [0, 3], "default": 0, "client_sync": True},
                },
            },
            "component_groups": {
                "eco:quieto": {
                    "minecraft:movement": {"value": 0.0},
                    "minecraft:behavior.look_at_player": {
                        "priority": 0, "look_distance": 96, "probability": 1.0,
                        "angle_of_view_horizontal": 360, "angle_of_view_vertical": 180,
                    },
                },
                "eco:cazar": {
                    "minecraft:movement": {"value": velocidad},
                    "minecraft:behavior.nearest_attackable_target": {
                        "priority": 1, "must_see": False, "reselect_targets": True,
                        "within_radius": 64,
                        "entity_types": [{"filters": jugador, "max_dist": 64}],
                    },
                    "minecraft:behavior.melee_attack": {
                        "priority": 2, "speed_multiplier": 1.25, "track_target": True,
                        "require_complete_path": False,
                    },
                    "minecraft:behavior.open_door": {"priority": 3, "close_door_after": False},
                },
                "eco:desaparecer": {"minecraft:instant_despawn": {}},
            },
            "components": {
                "minecraft:type_family": {"family": ["eco", ident, "mob"]},
                "minecraft:collision_box": {"width": 0.8, "height": 1.95},
                "minecraft:health": {"value": 200, "max": 200},
                "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": False}]},
                "minecraft:attack": {"damage": [3, 5]},
                "minecraft:follow_range": {"value": 64, "max": 64},
                "minecraft:movement.basic": {},
                "minecraft:jump.static": {},
                "minecraft:navigation.walk": {
                    "can_path_over_water": True, "avoid_damage_blocks": True,
                    "can_open_doors": True, "can_pass_doors": True, "can_walk": True,
                },
                "minecraft:physics": {},
                "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
                "minecraft:knockback_resistance": {"value": 1.0},
                "minecraft:fire_immune": True,
                "minecraft:breathable": {"total_supply": 15, "suffocate_time": 0, "breathes_water": True},
                "minecraft:nameable": {"always_show": False, "allow_name_tag_renaming": False},
                "minecraft:despawn": {"despawn_from_distance": {"min_distance": 80, "max_distance": 128}},
                "minecraft:conditional_bandwidth_optimization": {},
            },
            "events": {
                "minecraft:entity_spawned": {"add": {"component_groups": ["eco:quieto"]}},
                "eco:quieto": {"remove": {"component_groups": ["eco:cazar"]},
                               "add": {"component_groups": ["eco:quieto"]}},
                "eco:cazar": {"remove": {"component_groups": ["eco:quieto"]},
                              "add": {"component_groups": ["eco:cazar"]}},
                "eco:desaparecer": {"add": {"component_groups": ["eco:desaparecer"]}},
            },
        },
    }


# ---------------------------------------------------------------- recursos
ANIMACIONES = {
    "format_version": "1.8.0",
    "animations": {
        "animation.eco.respirar": {
            "loop": True,
            "bones": {
                "body": {"rotation": ["math.sin(query.life_time * 80) * 1.5", 0, 0]},
                "head": {"rotation": [
                    "math.sin(query.life_time * 23) * 4",
                    "math.sin(query.life_time * 31) * 7",
                    "14 + math.pow(math.sin(query.life_time * 57), 40) * 30 - math.pow(math.sin(query.life_time * 41), 60) * 45",
                ]},
                "leftArm": {"rotation": ["math.sin(query.life_time * 60) * 3", 0, "-3 - math.sin(query.life_time * 45) * 2"]},
                "rightArm": {"rotation": ["math.sin(query.life_time * 60 + 90) * 3", 0, "3 + math.sin(query.life_time * 45) * 2"]},
                "leftForearm": {"rotation": ["-8 + math.pow(math.sin(query.life_time * 70), 30) * -20", 0, 0]},
                "rightForearm": {"rotation": ["-8 + math.pow(math.sin(query.life_time * 66), 30) * -20", 0, 0]},
            },
        },
        "animation.eco.mirar": {
            "loop": True,
            "bones": {"head": {"rotation": ["query.target_x_rotation", "query.target_y_rotation", 0]}},
        },
        "animation.eco.caminar": {
            "loop": True,
            "bones": {
                "leftLeg": {"rotation": ["math.cos(query.modified_distance_moved * 22) * 34 * query.modified_move_speed", 0, 0]},
                "rightLeg": {"rotation": ["-math.cos(query.modified_distance_moved * 22) * 34 * query.modified_move_speed", 0, 0]},
                "leftShin": {"rotation": ["math.max(0, math.sin(query.modified_distance_moved * 22)) * 40 * query.modified_move_speed", 0, 0]},
                "rightShin": {"rotation": ["math.max(0, -math.sin(query.modified_distance_moved * 22)) * 40 * query.modified_move_speed", 0, 0]},
                "leftArm": {"rotation": ["-math.cos(query.modified_distance_moved * 22) * 22 * query.modified_move_speed", 0, 0]},
                "rightArm": {"rotation": ["math.cos(query.modified_distance_moved * 22) * 22 * query.modified_move_speed", 0, 0]},
                "body": {"rotation": ["math.abs(math.sin(query.modified_distance_moved * 22)) * 4", 0, "math.sin(query.modified_distance_moved * 11) * 3"]},
            },
        },
        "animation.eco.cazar": {
            "loop": True,
            "bones": {
                "body": {"rotation": [10, 0, 0]},
                "leftArm": {"rotation": ["-115 + math.sin(query.life_time * 500) * 7", -12, "-6"]},
                "rightArm": {"rotation": ["-115 + math.sin(query.life_time * 500 + 70) * 7", 12, "6"]},
                "leftForearm": {"rotation": ["-20 + math.sin(query.life_time * 700) * 10", 0, 0]},
                "rightForearm": {"rotation": ["-20 + math.sin(query.life_time * 650) * 10", 0, 0]},
            },
        },
        "animation.eco.revelar": {
            "loop": True,
            "bones": {
                "jaw": {"rotation": ["38 + math.sin(query.life_time * 900) * 6", 0, 0]},
                "head": {"rotation": ["-10", "math.sin(query.life_time * 1400) * 8", "math.sin(query.life_time * 1100) * 10"]},
            },
        },
        "animation.eco.agachado": {
            "loop": True,
            "bones": {
                "root": {"position": [0, -12, 0]},
                "body": {"rotation": [55, 0, 0]},
                "neck": {"rotation": [-38, 0, 0]},
                "head": {"rotation": [-30, 0, 0]},
                "leftLeg": {"rotation": [-72, -8, 0]},
                "rightLeg": {"rotation": [-72, 8, 0]},
                "leftShin": {"rotation": [105, 0, 0]},
                "rightShin": {"rotation": [105, 0, 0]},
                "leftArm": {"rotation": [-20, 0, -8]},
                "rightArm": {"rotation": [-20, 0, 8]},
            },
        },
        "animation.eco.asomar_izq": {
            "loop": True,
            "bones": {
                "root": {"rotation": [0, 0, -30]},
                "head": {"rotation": [0, 0, "48 + math.sin(query.life_time * 200) * 3"]},
                "leftArm": {"rotation": [-60, 0, -40]},
                "leftForearm": {"rotation": [-50, 0, 0]},
            },
        },
        "animation.eco.asomar_der": {
            "loop": True,
            "bones": {
                "root": {"rotation": [0, 0, 30]},
                "head": {"rotation": [0, 0, "-48 + math.sin(query.life_time * 200) * 3"]},
                "rightArm": {"rotation": [-60, 0, 40]},
                "rightForearm": {"rotation": [-50, 0, 0]},
            },
        },
        "animation.eco.ataque": {
            "loop": True,
            "bones": {
                "leftArm": {"rotation": ["-math.sin(variable.attack_time * 180) * 70", 0, 0]},
                "rightArm": {"rotation": ["-math.sin(variable.attack_time * 180) * 90", 0, 0]},
                "jaw": {"rotation": ["math.sin(variable.attack_time * 180) * 40", 0, 0]},
            },
        },
    },
}


def entidad_rp(ident, nombre, color_base, color_motas):
    return {
        "format_version": "1.10.0",
        "minecraft:client_entity": {
            "description": {
                "identifier": f"eco:{ident}",
                "materials": {"default": "entity_emissive_alpha"},
                "textures": {"default": f"textures/entity/eco/{ident}"},
                "geometry": {"default": f"geometry.eco.{ident}"},
                "animations": {
                    "respirar": "animation.eco.respirar",
                    "mirar": "animation.eco.mirar",
                    "caminar": "animation.eco.caminar",
                    "cazar": "animation.eco.cazar",
                    "revelar": "animation.eco.revelar",
                    "ataque": "animation.eco.ataque",
                    "agachado": "animation.eco.agachado",
                    "asomar_izq": "animation.eco.asomar_izq",
                    "asomar_der": "animation.eco.asomar_der",
                },
                "scripts": {
                    "scale": "1.0 + query.property('eco:altura') * 0.08",
                    "animate": [
                        "respirar",
                        "mirar",
                        {"caminar": "query.modified_move_speed > 0.01 && query.property('eco:pose') == 0"},
                        {"cazar": "query.property('eco:estado') >= 2"},
                        {"revelar": "query.property('eco:estado') == 3"},
                        {"ataque": "variable.attack_time > 0"},
                        {"agachado": "query.property('eco:pose') >= 1"},
                        {"asomar_izq": "query.property('eco:pose') == 2"},
                        {"asomar_der": "query.property('eco:pose') == 3"},
                    ],
                },
                "render_controllers": ["controller.render.eco"],
                "spawn_egg": {"base_color": color_base, "overlay_color": color_motas},
                "enable_attachables": False,
            }
        },
    }


def particula(ident, textura, componentes, material="particles_blend"):
    return {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": f"eco:{ident}",
                "basic_render_parameters": {"material": material, "texture": f"textures/particle/eco_{textura}"},
            },
            "components": componentes,
        },
    }


def billboard(tam, tw, th):
    return {
        "size": tam,
        "facing_camera_mode": "rotate_xyz",
        "uv": {"texture_width": tw, "texture_height": th, "uv": [0, 0], "uv_size": [tw, th]},
    }


PARTICULAS = {
    "ojos": particula("ojos", "ojos", {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 3.5},
        "minecraft:particle_appearance_billboard": billboard([0.42, 0.12], 32, 8),
        "minecraft:particle_appearance_tinting": {
            "color": [1, 1, 1, "math.min(variable.particle_age * 3, 1) * (1 - math.pow(variable.particle_age / variable.particle_lifetime, 6))"]},
    }),
    "sangre": particula("sangre", "gota", {
        "minecraft:emitter_rate_instant": {"num_particles": "math.random_integer(3, 7)"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_sphere": {"radius": 0.25, "direction": "outwards"},
        "minecraft:particle_initial_speed": 0.3,
        "minecraft:particle_lifetime_expression": {"max_lifetime": 1.6},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -12, 0], "linear_drag_coefficient": 0.5},
        "minecraft:particle_motion_collision": {"collision_radius": 0.04, "coefficient_of_restitution": 0, "collision_drag": 10},
        "minecraft:particle_appearance_billboard": billboard([0.05, 0.08], 4, 4),
        "minecraft:particle_appearance_lighting": {},
    }, "particles_alpha"),
    "humo": particula("humo", "humo", {
        "minecraft:emitter_rate_instant": {"num_particles": 18},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_box": {"half_dimensions": [0.4, 1.6, 0.4], "direction": "outwards"},
        "minecraft:particle_initial_speed": 0.6,
        "minecraft:particle_lifetime_expression": {"max_lifetime": "1.2 + math.random(0, 0.8)"},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.8, 0], "linear_drag_coefficient": 2},
        "minecraft:particle_appearance_billboard": billboard(
            ["0.25 + variable.particle_age * 0.6", "0.25 + variable.particle_age * 0.6"], 16, 16),
        "minecraft:particle_appearance_tinting": {
            "color": [0.05, 0.02, 0.02, "0.9 * (1 - variable.particle_age / variable.particle_lifetime)"]},
    }),
    "lluvia_sangre": particula("lluvia_sangre", "gota", {
        "minecraft:emitter_rate_instant": {"num_particles": 40},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_box": {"half_dimensions": [10, 0.5, 10]},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_lifetime_expression": {"max_lifetime": 1.4},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -20, 0]},
        "minecraft:particle_motion_collision": {"collision_radius": 0.05, "coefficient_of_restitution": 0,
                                                "collision_drag": 10, "expire_on_contact": True},
        "minecraft:particle_appearance_billboard": {
            "size": [0.03, 0.35], "facing_camera_mode": "lookat_y",
            "uv": {"texture_width": 4, "texture_height": 4, "uv": [0, 0], "uv_size": [4, 4]}},
        "minecraft:particle_appearance_lighting": {},
    }, "particles_alpha"),
    "ceniza": particula("ceniza", "ceniza", {
        "minecraft:emitter_rate_instant": {"num_particles": 30},
        "minecraft:emitter_lifetime_once": {"active_time": 0.1},
        "minecraft:emitter_shape_box": {"half_dimensions": [12, 4, 12]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 5},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {
            "linear_acceleration": ["math.sin(variable.particle_age * 90) * 0.4", -0.6, "math.cos(variable.particle_age * 70) * 0.4"],
            "linear_drag_coefficient": 1},
        "minecraft:particle_appearance_billboard": billboard([0.06, 0.06], 4, 4),
        "minecraft:particle_appearance_tinting": {
            "color": ["0.35 + variable.particle_random_1 * 0.3", 0.12, 0.1, "1 - variable.particle_age / variable.particle_lifetime"]},
    }),
}


def nieblas():
    def niebla(ident, color, inicio, fin):
        cfg = {"fog_start": inicio, "fog_end": fin, "fog_color": color, "render_distance_type": "fixed"}
        return {
            "format_version": "1.16.100",
            "minecraft:fog_settings": {
                "description": {"identifier": f"eco:{ident}"},
                "distance": {"air": cfg, "weather": cfg},
            },
        }
    return {
        "niebla": niebla("niebla", "#0b0b0e", 6, 42),
        "niebla_roja": niebla("niebla_roja", "#3d0000", 3, 30),
        # todas las noches: cielo rojo oscuro
        "noche_sangre": niebla("noche_sangre", "#4a0606", 10, 64),
        # de día: bruma gris y enfermiza
        "dia_gris": niebla("dia_gris", "#7d716b", 24, 120),
    }


def texturas_entorno():
    """Cielo de ECO: luna roja con cara, sol eclipsado, nubes de sangre y lluvia roja."""
    d = os.path.join(RP, "textures", "environment")
    os.makedirs(d, exist_ok=True)
    rng = np.random.default_rng(66)
    yy, xx = np.mgrid[0:128, 0:128]

    # luna: 8 fases (4x2) siempre llena y roja; la sonrisa crece en cada fase.
    # La luna se dibuja en modo aditivo: lo negro se ve como un agujero al cielo.
    luna = np.zeros((256, 512, 3), np.float32)
    for fase in range(8):
        r = np.hypot(xx - 64, yy - 64)
        disco = np.clip((54 - r) / 2.0, 0, 1)
        sombra = np.clip(1 - (r / 54) ** 3 * 0.55, 0, 1)  # borde más oscuro, como una esfera
        manchas = modelos.ruido(128, 128, 10, rng)
        grano = modelos.ruido(128, 128, 2, rng)
        crateres = np.ones((128, 128), np.float32)
        for _ in range(14):
            cx, cy, cr = rng.uniform(20, 108), rng.uniform(20, 108), rng.uniform(3, 9)
            dc = np.hypot(xx - cx, yy - cy)
            crateres *= 1 - 0.35 * np.clip(1 - dc / cr, 0, 1)
        base = (0.45 + manchas * 0.4 + grano * 0.15) * crateres * sombra * disco
        img = np.stack([base, base * 0.06, base * 0.05], axis=-1)
        img[..., 0] += np.clip(1 - (r - 54) / 9, 0, 1) * (r > 54) * 0.28  # halo rojo
        cara = np.ones((128, 128), np.float32)
        # cuencas hundidas, desiguales, con una pupila diminuta
        for ex, ey, rx, ry in ((43, 49, 10, 13), (86, 46, 11, 14)):
            e = ((xx - ex) / rx) ** 2 + ((yy - ey) / ry) ** 2
            cara = np.where(e <= 1, 0.02, np.where(e <= 1.9, cara * 0.45, cara))
        # sonrisa torcida: más larga y más alta del lado derecho
        abertura = 5 + fase * 2.0
        for x in range(22, 112):
            t = (x - 22) / 89
            k = max(0.0, 1 - (2 * t - 1) ** 2)
            centro = 80 + 11 * k - 9 * t ** 3
            ab = max(1.2, abertura * math.sqrt(k))
            y0, y1 = int(round(centro - ab / 2)), int(round(centro + ab / 2))
            cara[y0:y1 + 1, x] = 0.02
            if ab > 3:
                largo = int(ab * rng.uniform(0.25, 0.45))
                if x % 3 == 0:  # dientes desiguales y separados
                    cara[y0:y0 + largo, x] = 0.85
                if x % 3 == 1:
                    cara[y1 - largo + 1:y1 + 1, x] = 0.85
        img *= cara[..., None]
        # sangre que cae de los ojos y de la boca
        for x0, y0, largo in ((43, 62, 14 + fase * 3), (88, 60, 10 + fase * 3), (60, 92, 8 + fase * 2), (95, 82, 6 + fase * 2)):
            for k in range(largo):
                y = y0 + k
                if y < 128 and disco[y, x0] > 0.5:
                    img[y, x0:x0 + (2 if k > largo - 3 else 1)] = [0.9, 0.0, 0.0]
        fy, fx = divmod(fase, 4)
        luna[fy * 128:(fy + 1) * 128, fx * 128:(fx + 1) * 128] = img
    Image.fromarray((np.clip(luna, 0, 1) * 255).astype(np.uint8), "RGB").save(os.path.join(d, "moon_phases.png"))

    # sol: eclipse, aro rojo con el centro negro
    r = np.hypot(xx - 64, yy - 64)
    aro = np.clip(1 - np.abs(r - 34) / 6, 0, 1) + np.clip(1 - (r - 34) / 22, 0, 1) * (r > 34) * 0.4
    sol = np.zeros((128, 128, 3), np.float32)
    sol[..., 0] = aro * 0.95
    sol[..., 1] = aro * 0.12
    sol[..., 2] = aro * 0.05
    Image.fromarray((np.clip(sol, 0, 1) * 255).astype(np.uint8), "RGB").save(os.path.join(d, "sun.png"))

    # nubes: manchas oscuras de color sangre seca
    n = modelos.ruido(256, 256, 16, rng) * 0.7 + modelos.ruido(256, 256, 5, rng) * 0.3
    mascara = n > 0.52
    nubes = np.zeros((256, 256, 4), np.uint8)
    nubes[..., 0] = 70
    nubes[..., 1] = 18
    nubes[..., 2] = 20
    nubes[..., 3] = np.where(mascara, 255, 0)
    Image.fromarray(nubes, "RGBA").save(os.path.join(d, "clouds.png"))

    # lluvia: gotas rojas
    lluvia = np.zeros((256, 64, 4), np.uint8)
    for _ in range(140):
        x, y, largo = rng.integers(0, 64), rng.integers(0, 256), rng.integers(6, 18)
        for k in range(largo):
            lluvia[(y + k) % 256, x] = [150 + rng.integers(0, 60), 0, 0, 150 + k * 5]
    Image.fromarray(lluvia, "RGBA").save(os.path.join(d, "rain.png"))


def texturas_particulas():
    d = os.path.join(RP, "textures", "particle")
    os.makedirs(d, exist_ok=True)
    ojos = Image.new("RGBA", (32, 8), (0, 0, 0, 0))
    dr = ImageDraw.Draw(ojos)
    for cx in (6, 25):
        dr.ellipse((cx - 5, 1, cx + 5, 6), fill=(140, 0, 0, 160))
        dr.ellipse((cx - 3, 2, cx + 3, 5), fill=(255, 30, 20, 255))
        dr.point((cx, 3), fill=(255, 230, 200, 255))
    ojos.save(os.path.join(d, "eco_ojos.png"))
    gota = Image.new("RGBA", (4, 4), (0, 0, 0, 0))
    ImageDraw.Draw(gota).ellipse((0, 0, 3, 3), fill=(120, 0, 0, 255))
    gota.save(os.path.join(d, "eco_gota.png"))
    humo = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    a = np.zeros((16, 16, 4), np.uint8)
    yy, xx = np.mgrid[0:16, 0:16]
    r = np.hypot(xx - 7.5, yy - 7.5) / 8
    a[..., :3] = 255
    a[..., 3] = (np.clip(1 - r, 0, 1) ** 1.5 * 255).astype(np.uint8)
    Image.fromarray(a, "RGBA").save(os.path.join(d, "eco_humo.png"))
    Image.new("RGBA", (4, 4), (255, 255, 255, 255)).save(os.path.join(d, "eco_ceniza.png"))


def icono(cara, ruta):
    img = Image.new("RGBA", (256, 256), (6, 0, 0, 255))
    c = cara.convert("RGBA")
    arr = np.array(c)
    arr[..., 3] = 255  # el icono no usa brillo emisivo
    c = Image.fromarray(arr).resize((int(256 * cara.width / cara.height), 256), Image.NEAREST)
    img.paste(c, ((256 - c.width) // 2, 0))
    img.save(ruta)


# ---------------------------------------------------------------- ensamblado
def manifiestos():
    escribir(os.path.join(BP, "manifest.json"), {
        "format_version": 2,
        "header": {
            "name": "ECO §4Comportamiento",
            "description": "No estás solo. v2.2.0",
            "uuid": UUID["bp"], "version": VERSION, "min_engine_version": MIN_MOTOR,
        },
        "modules": [
            {"type": "data", "uuid": UUID["bp_datos"], "version": VERSION},
            {"type": "script", "language": "javascript", "uuid": UUID["bp_script"], "version": VERSION,
             "entry": "scripts/main.js"},
        ],
        "dependencies": [
            {"uuid": UUID["rp"], "version": VERSION},
            {"module_name": "@minecraft/server", "version": API_SERVER},
            {"module_name": "@minecraft/server-ui", "version": API_UI},
        ],
    })
    escribir(os.path.join(RP, "manifest.json"), {
        "format_version": 2,
        "header": {
            "name": "ECO §4Recursos",
            "description": "Modelos, sonidos y niebla de ECO. v2.2.0",
            "uuid": UUID["rp"], "version": VERSION, "min_engine_version": MIN_MOTOR,
        },
        "modules": [{"type": "resources", "uuid": UUID["rp_recursos"], "version": VERSION}],
    })


def textos():
    lineas = []
    for ident, (nombre, *_r) in ENTIDADES.items():
        lineas.append(f"entity.eco:{ident}.name={nombre}")
        lineas.append(f"item.spawn_egg.entity.eco:{ident}.name=Generar {nombre}")
    contenido = "\n".join(lineas) + "\n"
    for idioma in ("es_ES", "es_MX", "en_US"):
        escribir(os.path.join(RP, "texts", f"{idioma}.lang"), contenido)
    escribir(os.path.join(RP, "texts", "languages.json"), ["es_ES", "es_MX", "en_US"])


def comprimir(carpeta, zf, prefijo):
    for base, _, archivos in os.walk(carpeta):
        for a in sorted(archivos):
            ruta = os.path.join(base, a)
            zf.write(ruta, os.path.join(prefijo, os.path.relpath(ruta, carpeta)))


def main():
    shutil.rmtree(BUILD, ignore_errors=True)
    os.makedirs(DIST, exist_ok=True)

    cara_icono = None
    for ident, (nombre, c1, c2, vel) in ENTIDADES.items():
        geo, tex, cara = modelos.generar(ident)
        escribir(os.path.join(RP, "models", "entity", f"eco_{ident}.geo.json"), geo)
        os.makedirs(os.path.join(RP, "textures", "entity", "eco"), exist_ok=True)
        tex.save(os.path.join(RP, "textures", "entity", "eco", f"{ident}.png"))
        escribir(os.path.join(RP, "entity", f"eco_{ident}.entity.json"), entidad_rp(ident, nombre, c1, c2))
        escribir(os.path.join(BP, "entities", f"eco_{ident}.json"), entidad_bp(ident, vel))
        if ident == "testigo":
            cara_icono = cara

    escribir(os.path.join(RP, "animations", "eco.animation.json"), ANIMACIONES)
    escribir(os.path.join(RP, "render_controllers", "eco.render_controllers.json"), {
        "format_version": "1.8.0",
        "render_controllers": {"controller.render.eco": {
            "geometry": "Geometry.default",
            "materials": [{"*": "Material.default"}],
            "textures": ["Texture.default"],
        }},
    })
    for ident, p in PARTICULAS.items():
        escribir(os.path.join(RP, "particles", f"eco_{ident}.json"), p)
    texturas_particulas()
    texturas_entorno()
    for ident, n in nieblas().items():
        escribir(os.path.join(RP, "fogs", f"eco_{ident}.json"), n)
    escribir(os.path.join(RP, "sounds", "sound_definitions.json"), {
        "format_version": "1.20.20", "sound_definitions": sonidos.generar(RP)})
    textos()
    manifiestos()
    os.makedirs(os.path.join(BP, "scripts"), exist_ok=True)
    shutil.copy(os.path.join(RAIZ, "src", "main.js"), os.path.join(BP, "scripts", "main.js"))
    icono(cara_icono, os.path.join(BP, "pack_icon.png"))
    icono(cara_icono, os.path.join(RP, "pack_icon.png"))

    salida = os.path.join(DIST, "ECO.mcaddon")
    with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as zf:
        comprimir(BP, zf, "ECO_BP")
        comprimir(RP, zf, "ECO_RP")
    for nombre, carpeta in (("ECO_BP.mcpack", BP), ("ECO_RP.mcpack", RP)):
        with zipfile.ZipFile(os.path.join(DIST, nombre), "w", zipfile.ZIP_DEFLATED) as zf:
            comprimir(carpeta, zf, "")
    print("Listo:", salida, f"{os.path.getsize(salida) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
