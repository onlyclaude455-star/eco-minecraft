"""Voces y sonidos de ECO.

Las voces se sintetizan con espeak-ng en español y se procesan con ffmpeg
(tono más grave, susurro, eco y una segunda voz demoníaca por debajo).
El grito, la respiración y el chirrido se generan con numpy.
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 44100

# clave -> (texto hablado, texto del chat)
SUSURROS = {
    "no_estas_solo": ("no estás solo", "no estás solo..."),
    "te_estoy_mirando": ("te estoy mirando", "te estoy mirando"),
    "date_la_vuelta": ("date la vuelta", "date la vuelta"),
    "detras_de_ti": ("detrás de ti", "detrás de ti"),
    "se_donde_duermes": ("ya sé dónde duermes", "ya sé dónde duermes"),
    "no_mires": ("no mires", "no mires..."),
    "sonrie": ("sonríe", "sonríe"),
    "estoy_dentro": ("ya estoy dentro", "ya estoy dentro"),
    "te_encontre": ("te encontré", "te encontré"),
    "por_que_corres": ("por qué corres", "¿por qué corres?"),
    "falta_poco": ("falta poco", "falta poco"),
    "quedate": ("quédate conmigo", "quédate conmigo"),
    "no_apagues": ("no apagues la luz", "no apagues la luz"),
    "cuenta": ("uno... dos... tres...", "uno... dos... tres..."),
    "buscas_algo": ("buscas algo", "¿buscas algo?"),
    "aqui_abajo": ("aquí abajo", "aquí abajo"),
    "ven": ("ven", "ven..."),
    "siempre_estuve": ("siempre estuve aquí", "siempre estuve aquí"),
    "estoy_aqui": ("estoy aquí", "estoy aquí"),
    "mas_cerca": ("más cerca", "más cerca..."),
    "mentiroso": ("mentiroso", "mentiroso"),
    "esta_noche": ("esta noche", "esta noche..."),
    "no_duermas": ("no duermas", "no duermas"),
    "abre_los_ojos": ("abre los ojos", "abre los ojos"),
    "mirame": ("mírame", "mírame"),
    "juguemos": ("juguemos", "juguemos"),
    "la_luna": ("la luna está roja", "la luna está roja"),
}

# voz "normal" (pero rara) con la que el Imitador finge ser alguien
IMITACIONES = {
    "oye_ven": ("oye, ven aquí", "oye, ven aquí"),
    "ayudame": ("ayúdame, por favor", "ayúdame, por favor"),
    "encontre_algo": ("encontré algo, ven a ver", "encontré algo, ven a ver"),
    "donde_estas": ("dónde estás", "¿dónde estás?"),
    "abre": ("ábreme la puerta", "ábreme la puerta"),
    "estoy_afuera": ("estoy aquí afuera", "estoy aquí afuera"),
}


def _ff(entrada, salida, filtro, extra=()):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", entrada, *extra, "-filter_complex", filtro,
         "-ac", "1", "-ar", str(SR), "-c:a", "libvorbis", "-q:a", "4", salida],
        check=True,
    )


def _espeak(texto, voz, wav, velocidad=120, tono=30, amplitud=180):
    subprocess.run(["espeak-ng", "-v", voz, "-s", str(velocidad), "-p", str(tono), "-a", str(amplitud),
                    "-w", wav, texto], check=True)


def susurro(texto, salida):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "v.wav")
        _espeak(texto, "es-419+whisper", wav, 105, 20)
        filtro = (
            "[0]asplit=2[a][b];"
            "[a]asetrate=22050*0.92,aresample=44100,highpass=f=250,volume=2.4[w];"
            "[b]asetrate=22050*0.62,aresample=44100,lowpass=f=1800,volume=0.9[d];"
            "[w][d]amix=inputs=2:normalize=0,aecho=0.8:0.6:70|160:0.35|0.18,"
            "afade=t=in:d=0.08,apad=pad_dur=0.6,alimiter=limit=0.9"
        )
        _ff(wav, salida, filtro)


def imitacion(texto, salida):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "v.wav")
        _espeak(texto, "es-419+m3", wav, 135, 55)
        filtro = (
            "[0]asetrate=22050*0.96,aresample=44100,"
            "vibrato=f=6:d=0.25,highpass=f=300,lowpass=f=3400,"
            "aecho=0.8:0.5:90|210:0.3|0.15,apad=pad_dur=0.6,volume=1.8,alimiter=limit=0.9"
        )
        _ff(wav, salida, filtro)


def risa(salida):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "v.wav")
        _espeak("je je je je je je", "es-419+m7", wav, 150, 70)
        filtro = (
            "[0]asplit=2[a][b];[a]asetrate=22050*0.75,aresample=44100[x];"
            "[b]asetrate=22050*0.5,aresample=44100,volume=0.7[y];"
            "[x][y]amix=inputs=2:normalize=0,tremolo=f=9:d=0.5,"
            "aecho=0.8:0.7:120|260:0.4|0.25,apad=pad_dur=0.8,volume=1.6,alimiter=limit=0.9"
        )
        _ff(wav, salida, filtro)


def _guardar_wav(datos, ruta):
    datos = np.clip(datos, -1, 1)
    with wave.open(ruta, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((datos * 32767).astype(np.int16).tobytes())


def _a_ogg(datos, salida, filtro="anull"):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "s.wav")
        _guardar_wav(datos, wav)
        _ff(wav, salida, f"[0]{filtro}")


def _filtro_paso_banda(x, centro, ancho):
    espectro = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    espectro *= np.exp(-((f - centro) / ancho) ** 2)
    return np.fft.irfft(espectro, len(x))


def grito(salida, rng):
    dur = 1.8
    t = np.arange(int(SR * dur)) / SR
    env = np.minimum(t / 0.03, 1) * np.exp(-np.maximum(t - 0.9, 0) * 3.5)
    voz = np.zeros_like(t)
    for base, det in ((880, 1.0), (620, 1.013), (1240, 0.991)):
        f = base * (1 - 0.45 * t / dur) * (1 + 0.04 * np.sin(2 * np.pi * 7 * t)) * det
        fase = 2 * np.pi * np.cumsum(f) / SR
        voz += ((fase / (2 * np.pi)) % 1.0 * 2 - 1) * 0.3
    ruido = rng.standard_normal(len(t))
    ruido = _filtro_paso_banda(ruido, 2400, 1400) * 3
    x = np.tanh((voz + ruido * 0.5) * 3.5) * env
    x = np.round(x * 24) / 24  # distorsión áspera
    _a_ogg(x * 0.95, salida, "aecho=0.8:0.5:50|110:0.4|0.2,alimiter=limit=0.95")


def respiracion(salida, rng):
    dur = 3.2
    t = np.arange(int(SR * dur)) / SR
    env = np.zeros_like(t)
    for ini, fin, amp in ((0.0, 1.1, 0.8), (1.4, 2.8, 1.0)):
        m = (t >= ini) & (t < fin)
        env[m] = np.sin(np.pi * (t[m] - ini) / (fin - ini)) ** 2 * amp
    ruido = _filtro_paso_banda(rng.standard_normal(len(t)), 700, 600) * 4
    tono = np.sin(2 * np.pi * 95 * t) * 0.15  # gruñido grave
    _a_ogg((ruido + tono) * env * 0.8, salida, "lowpass=f=2500,volume=1.5,alimiter=limit=0.9")


def chirrido(salida, rng):
    """Golpe de violines disonantes: suena cuando algo desaparece al mirarlo."""
    dur = 1.4
    t = np.arange(int(SR * dur)) / SR
    env = np.minimum(t / 0.01, 1) * np.exp(-t * 2.6)
    x = np.zeros_like(t)
    for f in (1760, 1864, 2489, 2637, 3322):
        x += np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * (1 + 0.3 * np.sin(2 * np.pi * 13 * t))
    x += _filtro_paso_banda(rng.standard_normal(len(t)), 3000, 1500) * 2
    _a_ogg(np.tanh(x * 0.5) * env * 0.8, salida, "aecho=0.8:0.6:40|90:0.3|0.2,alimiter=limit=0.9")


def zumbido(salida, rng):
    """Zumbido grave que acompaña a la noche roja y a la persecución."""
    dur = 6.0
    t = np.arange(int(SR * dur)) / SR
    env = np.minimum(t / 1.5, 1) * np.minimum((dur - t) / 1.5, 1)
    x = (np.sin(2 * np.pi * 41 * t) + 0.6 * np.sin(2 * np.pi * 43.5 * t) + 0.3 * np.sin(2 * np.pi * 82 * t))
    x += _filtro_paso_banda(rng.standard_normal(len(t)), 120, 80) * 2
    _a_ogg(x * env * 0.35, salida, "volume=1.4,alimiter=limit=0.9")


def grito_grave(salida, rng):
    """Segundo grito: más grave, largo y con un rugido debajo."""
    dur = 2.6
    t = np.arange(int(SR * dur)) / SR
    env = np.minimum(t / 0.02, 1) * np.exp(-np.maximum(t - 1.4, 0) * 3.0)
    x = np.zeros_like(t)
    for base, det in ((420, 1.0), (300, 1.021), (610, 0.987), (150, 1.0)):
        f = base * (1 + 0.25 * np.sin(2 * np.pi * 0.6 * t)) * (1 + 0.06 * np.sin(2 * np.pi * 11 * t)) * det
        fase = 2 * np.pi * np.cumsum(f) / SR
        x += ((fase / (2 * np.pi)) % 1.0 * 2 - 1) * 0.3
    x += _filtro_paso_banda(rng.standard_normal(len(t)), 900, 700) * 2.5
    x = np.round(np.tanh(x * 4) * 16) / 16 * env
    _a_ogg(x * 0.95, salida, "aecho=0.8:0.6:80|170:0.4|0.25,alimiter=limit=0.95")


def coro(destino, salida):
    """Muchos susurros a la vez, desfasados: suena como si estuvieran por todas partes."""
    claves = ["no_estas_solo", "te_estoy_mirando", "detras_de_ti", "estoy_aqui", "sonrie", "te_encontre", "mas_cerca"]
    entradas, filtros = [], []
    for i, k in enumerate(claves):
        entradas += ["-i", os.path.join(destino, f"s_{k}.ogg")]
        filtros.append(f"[{i}]adelay={int(i * 420)},asetrate=44100*{0.8 + (i % 3) * 0.1:.2f},aresample=44100,"
                       f"volume={0.7 + (i % 2) * 0.3}[a{i}]")
    mezcla = "".join(f"[a{i}]" for i in range(len(claves)))
    filtro = ";".join(filtros) + f";{mezcla}amix=inputs={len(claves)}:normalize=0,volume=0.8,alimiter=limit=0.9"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *entradas, "-filter_complex", filtro,
                    "-ac", "1", "-ar", str(SR), "-c:a", "libvorbis", "-q:a", "4", salida], check=True)


def generar(carpeta_rp):
    """Escribe los .ogg y devuelve el diccionario de sound_definitions."""
    rng = np.random.default_rng(7)
    destino = os.path.join(carpeta_rp, "sounds", "eco")
    os.makedirs(destino, exist_ok=True)
    defs = {}

    def definir(clave, archivo, categoria="hostile", dist=(1, 24), volumen=1.0):
        defs[clave] = {
            "category": categoria,
            "min_distance": dist[0],
            "max_distance": dist[1],
            "sounds": [{"name": f"sounds/eco/{archivo}", "volume": volumen, "load_on_low_memory": True}],
        }

    for clave, (texto, _) in SUSURROS.items():
        susurro(texto, os.path.join(destino, f"s_{clave}.ogg"))
        definir(f"eco.s.{clave}", f"s_{clave}", dist=(0.5, 12))
    for clave, (texto, _) in IMITACIONES.items():
        imitacion(texto, os.path.join(destino, f"v_{clave}.ogg"))
        definir(f"eco.v.{clave}", f"v_{clave}", dist=(2, 48))
    risa(os.path.join(destino, "risa.ogg"))
    definir("eco.risa", "risa", dist=(2, 40))
    grito(os.path.join(destino, "grito.ogg"), rng)
    definir("eco.grito", "grito", dist=(1, 64))
    grito_grave(os.path.join(destino, "grito2.ogg"), rng)
    definir("eco.grito2", "grito2", dist=(1, 64))
    coro(destino, os.path.join(destino, "coro.ogg"))
    definir("eco.coro", "coro", dist=(0.5, 16))
    respiracion(os.path.join(destino, "respiracion.ogg"), rng)
    definir("eco.respiracion", "respiracion", dist=(0.5, 10))
    chirrido(os.path.join(destino, "chirrido.ogg"), rng)
    definir("eco.chirrido", "chirrido", dist=(1, 48))
    zumbido(os.path.join(destino, "zumbido.ogg"), rng)
    definir("eco.zumbido", "zumbido", "ambient", dist=(1, 32))
    return defs
