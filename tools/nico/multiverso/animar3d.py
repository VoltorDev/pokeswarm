"""Animaciones de un personaje del Multiverso a partir de su modelo 3D, por piezas rígidas (0 generaciones, sin rig).

    blender --background --python tools/nico/multiverso/animar3d.py -- <modelo.glb> <carpeta> [perfil.json]

Escribe en <carpeta>:
  render-<dirección>.png           las 8 rotaciones quieto (como rotar3d.py, con la misma malla y luz que lo animado)
  andar-<dirección>-<f>.png        4 fotogramas de andar (piernas que se alternan, brazos al revés, un bote)
  ataque-<dirección>-<f>.png       7 fotogramas de ataque (preparar, golpear, acompañar y volver; con un paso adelante)
  disparo-<dirección>-<f>.png      5 fotogramas de disparo (el brazo apunta al frente; con retroceso si el perfil lo dice)
  esqueleto.json                   lo que ha detectado (alturas, pivotes, si tiene piernas y brazos separados)
para las direcciones sur, sureste, este, noreste y norte (las del oeste son su espejo en montar.py). `pixelar.py`
los baja a 32 px con el marco y la paleta de las rotaciones.

Cómo: la malla (TRELLIS.2, una sola pieza) se reduce a ~120.000 vértices y se mira desde delante (mirando a -Y, como en
rotar3d.py; `giro` lo corrige). Se buscan las piernas (dos columnas separadas abajo: la entrepierna es la altura más alta
con hueco en medio) y los brazos (a la altura del pecho, una columna a cada lado separada del tronco). Cada vértice pesa
entre el cuerpo y su pierna o su brazo con una transición suave (para que no se rompa la malla en la unión), y cada
pieza gira alrededor de su articulación (cadera u hombro) sobre el eje X. Si no encuentra piernas separadas (túnica,
cuadrúpedo, caparazón) o brazos separados, esa pieza no se mueve y el cuerpo entero hace el gesto (bote, inclinación,
embestida). El perfil (JSON, opcional) puede forzar todo:
  {"giro": 0, "cadera": 0.45, "hombro": 0.78, "brazo_x": 0.16, "arma": "derecha"|"izquierda"|"ambas",
   "ataque": "tajo"|"puñetazo"|"embestida", "disparo": "brazo"|"boca", "retroceso": true, "zancada": 22,
   "elevacion": 30 (grados de la cámara sobre el horizonte; 20-25 enseña más la cara bajo una gorra o un casco)}
"""
import json
import math
import os
import sys

import bpy
import numpy as np

ELEVACION = 30
LADO = 256
AMBIENTE = 0.32
SOL = 4.2
GIRO_SOL = -50
DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
ANIM_DIRS = ['south', 'south-east', 'east', 'north-east', 'north']
OBJ_VERT = 120000


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def rot_x(p, piv, ang):
    """Gira los puntos p (N,3) alrededor del eje X que pasa por piv."""
    c, s = math.cos(ang), math.sin(ang)
    q = p - piv
    y = q[:, 1] * c - q[:, 2] * s
    z = q[:, 1] * s + q[:, 2] * c
    return np.stack([q[:, 0], y, z], 1) + piv


def rot_z(p, piv, ang):
    c, s = math.cos(ang), math.sin(ang)
    q = p - piv
    x = q[:, 0] * c - q[:, 1] * s
    y = q[:, 0] * s + q[:, 1] * c
    return np.stack([x, y, q[:, 2]], 1) + piv


def huecos(xs, lo, hi, nb=100, minimo=2):
    """Huecos INTERIORES de xs entre lo y hi (sin vértices, con cuerpo a los dos lados): [(a, b), ...] de al menos
    `minimo` casillas. El vacío de fuera (más allá del primer o del último trozo ocupado) no cuenta."""
    h, bordes = np.histogram(xs, bins=nb, range=(lo, hi))
    vacio = h <= max(1, len(xs) * 0.0005)
    ocup = np.where(~vacio)[0]
    if len(ocup) < 2:
        return []
    out, i = [], ocup[0]
    while i < ocup[-1]:
        if vacio[i]:
            j = i
            while j < nb and vacio[j]:
                j += 1
            if j - i >= minimo:
                out.append((bordes[i], bordes[j]))
            i = j
        else:
            i += 1
    return out


def esqueleto(co, perfil):
    """Busca entrepierna, hombros y brazos en la malla (de pie, mirando a -Y, pies en z=0)."""
    H = co[:, 2].max()
    W = co[:, 0].max() - co[:, 0].min()
    x0, x1 = co[:, 0].min(), co[:, 0].max()
    sk = {'alto': float(H), 'ancho': float(W)}
    # Piernas: la altura más alta (desde abajo, sin cortes) con un hueco cerca del centro.
    cadera = None
    for zr in np.arange(0.04, 0.62, 0.01):
        z = zr * H
        sl = co[np.abs(co[:, 2] - z) < 0.012 * H]
        if len(sl) < 30:
            continue
        hs = [g for g in huecos(sl[:, 0], x0, x1) if g[0] < 0.08 * W and g[1] > -0.08 * W and (g[1] - g[0]) > 0.015 * W]
        if hs:
            cadera = z
        elif cadera is not None and z > cadera + 0.03 * H:
            break
    if 'cadera' in perfil:
        cadera = perfil['cadera'] * H if perfil['cadera'] else None
    sk['piernas'] = bool(cadera is not None and cadera > 0.06 * H)
    sk['cadera'] = float(cadera + 0.02 * H) if sk['piernas'] else float(0.4 * H)
    # Brazos: subiendo desde la cadera, el tramo SEGUIDO de alturas con un hueco a cada lado del tronco (entre el brazo
    # y el costado); el hombro es donde se cierra (la axila) y un poco más. Se toma el hueco más cercano al centro.
    lados, empezado, fallos = [], False, 0
    for zr in np.arange(sk['cadera'] / H + 0.03, 0.92, 0.01):
        z = zr * H
        sl = co[np.abs(co[:, 2] - z) < 0.012 * H]
        if len(sl) < 30:
            continue
        hs = huecos(sl[:, 0], x0, x1)
        izq = [g for g in hs if g[1] < -0.05 * W]
        der = [g for g in hs if g[0] > 0.05 * W]
        if izq and der:
            lados.append((z, max(g[1] for g in izq), min(g[0] for g in der)))
            empezado, fallos = True, 0
        elif empezado:
            fallos += 1
            if fallos >= 3:
                break
    sk['brazos'] = bool(len(lados) >= 3)
    if sk['brazos']:
        zs = [l[0] for l in lados]
        sk['hombro'] = float(max(zs) + 0.06 * H)
        sk['brazo_izq_x'] = float(np.median([l[1] for l in lados]))
        sk['brazo_der_x'] = float(np.median([l[2] for l in lados]))
    else:
        sk['hombro'] = float(0.75 * H)
        sk['brazo_izq_x'] = float(-0.2 * W)
        sk['brazo_der_x'] = float(0.2 * W)
    if 'hombro' in perfil:
        sk['hombro'] = perfil['hombro'] * H
    if 'brazo_x' in perfil:
        sk['brazo_izq_x'], sk['brazo_der_x'] = -perfil['brazo_x'] * W, perfil['brazo_x'] * W
        sk['brazos'] = True
    return sk


def pesos(co, sk):
    H, W = sk['alto'], sk['ancho']
    z, x = co[:, 2], co[:, 0]
    w = {}
    if sk['piernas']:
        baja = 1 - smooth(sk['cadera'] - 0.04 * H, sk['cadera'] + 0.03 * H, z)
        w['pierna_izq'] = baja * (1 - smooth(-0.025 * W, 0.025 * W, x))
        w['pierna_der'] = baja * smooth(-0.025 * W, 0.025 * W, x)
    if sk['brazos']:
        alto_ok = smooth(sk['cadera'], sk['cadera'] + 0.06 * H, z) * (1 - smooth(sk['hombro'] - 0.02 * H, sk['hombro'] + 0.05 * H, z))
        w['brazo_izq'] = alto_ok * (1 - smooth(sk['brazo_izq_x'] - 0.03 * W, sk['brazo_izq_x'] + 0.01 * W, x))
        w['brazo_der'] = alto_ok * smooth(sk['brazo_der_x'] - 0.01 * W, sk['brazo_der_x'] + 0.03 * W, x)
    # Lo que gira con el tronco (todo lo que no es pierna), para la torsión del ataque.
    w['tronco'] = smooth(sk['cadera'] - 0.02 * H, sk['cadera'] + 0.08 * H, z)
    return w


def pose(co, sk, w, piernas=(0, 0), brazos=(0, 0), giro_tronco=0.0, avance=0.0, bote=0.0, inclina=0.0):
    """Ángulos en grados: positivo = hacia delante (hacia -Y). piernas/brazos = (izquierda, derecha)."""
    H = sk['alto']
    p = co.copy()
    for nombre, ang, piv in (('pierna_izq', piernas[0], (sk['brazo_izq_x'] * 0.45, 0, sk['cadera'])),
                             ('pierna_der', piernas[1], (sk['brazo_der_x'] * 0.45, 0, sk['cadera'])),
                             ('brazo_izq', brazos[0], (sk['brazo_izq_x'], 0, sk['hombro'] - 0.04 * H)),
                             ('brazo_der', brazos[1], (sk['brazo_der_x'], 0, sk['hombro'] - 0.04 * H))):
        if nombre in w and ang:
            # Hacia delante es hacia -Y: girar alrededor de X con ángulo negativo lleva lo de abajo hacia -Y.
            r = rot_x(co, np.array(piv), math.radians(-ang))
            p += (r - co) * w[nombre][:, None]
    if giro_tronco:
        r = rot_z(p, np.array((0, 0, 0)), math.radians(giro_tronco))
        p += (r - p) * w['tronco'][:, None]
    if inclina:
        r = rot_x(p, np.array((0, 0, sk['cadera'])), math.radians(-inclina))
        p += (r - p) * w['tronco'][:, None]
    p[:, 1] -= avance * H
    p[:, 2] += bote * H
    return p


def diagnostico(co, sk, w, ruta):
    """esqueleto.png: los vértices vistos de frente (x, z) y de lado (y, z), coloreados por pieza (piernas azul y cian,
    brazos rojo y naranja, cuerpo gris), con la cadera (cian) y el hombro (naranja) marcados. Sirve para ajustar el
    perfil a ojo. Se dibuja con numpy y se guarda con la API de imágenes de Blender (su Python no trae Pillow)."""
    H = sk['alto']
    S = 360
    A, B = S * 2 + 30, S + 20
    lienzo = np.zeros((B, A, 4), np.float32)
    lienzo[:, :] = (0.09, 0.12, 0.13, 1)
    col = np.tile(np.array([0.6, 0.6, 0.6], np.float32), (len(co), 1))
    for nombre, c in (('pierna_izq', (0.24, 0.43, 1)), ('pierna_der', (0.24, 0.9, 1)), ('brazo_izq', (1, 0.27, 0.24)), ('brazo_der', (1, 0.67, 0.16))):
        if nombre in w:
            col = col * (1 - w[nombre][:, None]) + np.array(c, np.float32) * w[nombre][:, None]
    m = max(H, np.ptp(co[:, 0]), np.ptp(co[:, 1])) * 1.05
    for k, eje in enumerate((0, 1)):
        ox = 10 + k * (S + 10)
        px = (ox + S / 2 + co[:, eje] / m * S).astype(int)
        py = (10 + S - co[:, 2] / m * S).astype(int)
        ok = (px >= 0) & (px < A) & (py >= 0) & (py < B)
        lienzo[py[ok], px[ok], :3] = col[ok]
        for z, c in ((sk['cadera'], (0.24, 0.9, 1)), (sk['hombro'], (1, 0.67, 0.16))):
            y = int(10 + S - z / m * S)
            if 0 <= y < B:
                lienzo[y, ox:ox + S, :3] = c
        if eje == 0:
            for x in (sk['brazo_izq_x'], sk['brazo_der_x']):
                xx = int(ox + S / 2 + x / m * S)
                if 0 <= xx < A:
                    lienzo[10:10 + S, xx, :3] = (1, 0.27, 0.24)
    im = bpy.data.images.new('esqueleto', A, B, alpha=True)
    im.pixels.foreach_set(np.flipud(lienzo).ravel())
    im.filepath_raw = ruta
    im.file_format = 'PNG'
    im.save()


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    modelo, carpeta = os.path.abspath(args[0]), os.path.abspath(args[1])   # Blender resuelve mal las relativas
    perfil = json.load(open(args[2], encoding='utf-8')) if len(args) > 2 and os.path.exists(args[2]) else {}
    os.makedirs(carpeta, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=modelo)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    n = len(ob.data.vertices)
    if n > OBJ_VERT:
        dm = ob.modifiers.new('reducir', 'DECIMATE')
        dm.ratio = OBJ_VERT / n
        bpy.ops.object.modifier_apply(modifier=dm.name)
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3, np.float64)
    me.vertices.foreach_get('co', co)
    co = co.reshape(n, 3)
    giro = float(perfil.get('giro', args[3] if len(args) > 3 else 0))
    if giro:
        co = rot_z(co, np.zeros(3), math.radians(giro))
    co[:, 0] -= (co[:, 0].min() + co[:, 0].max()) / 2
    co[:, 1] -= (co[:, 1].min() + co[:, 1].max()) / 2
    co[:, 2] -= co[:, 2].min()
    sk = esqueleto(co, perfil)
    w = pesos(co, sk)
    json.dump({k: (bool(v) if isinstance(v, (bool, np.bool_)) else float(v)) for k, v in sk.items()},
              open(os.path.join(carpeta, 'esqueleto.json'), 'w'), indent=1)
    diagnostico(co, sk, w, os.path.join(carpeta, 'esqueleto.png'))
    print('animar3d: esqueleto', sk)
    alto = sk['alto']

    escena = bpy.context.scene
    motores = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    escena.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in motores else 'BLENDER_EEVEE'
    escena.render.resolution_x = escena.render.resolution_y = LADO
    escena.render.film_transparent = True
    escena.view_settings.view_transform = 'Standard'
    mundo = bpy.data.worlds.new('mundo')
    mundo.use_nodes = True
    mundo.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
    mundo.node_tree.nodes['Background'].inputs[1].default_value = AMBIENTE
    escena.world = mundo
    sol = bpy.data.objects.new('sol', bpy.data.lights.new('sol', 'SUN'))
    sol.data.energy = SOL
    sol.data.color = (1.0, 0.96, 0.9)
    escena.collection.objects.link(sol)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = alto * 1.18
    escena.collection.objects.link(cam)
    escena.camera = cam
    el = math.radians(float(perfil.get('elevacion', ELEVACION)))   # más baja = se ve más la cara (gorras, cascos)
    dist = alto * 6
    centro_z = alto * 0.5

    def camara(d):
        i = DIRS.index(d)
        az = math.radians(-90 + 45 * i)
        x, y = dist * math.cos(el) * math.cos(az), dist * math.cos(el) * math.sin(az)
        cam.location = (x, y, centro_z + dist * math.sin(el))
        dx, dy, dz = -x, -y, centro_z - cam.location.z
        cam.rotation_euler = (math.atan2(math.hypot(dx, dy), -dz), 0, math.atan2(dy, dx) - math.pi / 2)
        sol.rotation_euler = (math.radians(35), 0, cam.rotation_euler[2] + math.radians(GIRO_SOL))

    def poner(p):
        me.vertices.foreach_set('co', p.astype(np.float32).ravel())
        me.update()

    def render(nombre):
        escena.render.filepath = os.path.join(carpeta, nombre + '.png')
        bpy.ops.render.render(write_still=True)

    # Quieto, 8 direcciones.
    poner(co)
    for d in DIRS:
        camara(d)
        render('render-' + d)

    A = float(perfil.get('zancada', 22))
    arma = perfil.get('arma', 'derecha')
    ataque = perfil.get('ataque', 'tajo')
    andar = [dict(piernas=(A, -A), brazos=(-A * 0.7, A * 0.7), bote=-0.012),
             dict(piernas=(0, 0), brazos=(0, 0), bote=0.012),
             dict(piernas=(-A, A), brazos=(A * 0.7, -A * 0.7), bote=-0.012),
             dict(piernas=(0, 0), brazos=(0, 0), bote=0.012)]
    if not sk['piernas']:   # sin piernas separadas: se mece adelante y atrás con un bote
        andar = [dict(inclina=6, bote=0.0), dict(inclina=0, bote=0.02), dict(inclina=-4, bote=0.0), dict(inclina=0, bote=0.02)]

    def brazo(ang):
        if arma == 'izquierda':
            return (ang, 0)
        if arma == 'ambas':
            return (ang, ang)
        return (0, ang)
    if ataque == 'embestida' or not sk['brazos']:
        golpe = [dict(), dict(inclina=-8, avance=-0.02), dict(inclina=-10, avance=-0.03), dict(inclina=18, avance=0.07),
                 dict(inclina=14, avance=0.08), dict(inclina=6, avance=0.04), dict()]
    elif ataque == 'puñetazo':
        golpe = [dict(), dict(brazos=brazo(-25), giro_tronco=-10), dict(brazos=brazo(-35), giro_tronco=-14),
                 dict(brazos=brazo(95), giro_tronco=14, avance=0.05), dict(brazos=brazo(90), giro_tronco=12, avance=0.05),
                 dict(brazos=brazo(40), giro_tronco=5, avance=0.02), dict()]
    else:   # tajo: el brazo arriba y atrás, y baja por delante
        golpe = [dict(), dict(brazos=brazo(-70), giro_tronco=-12, inclina=-3), dict(brazos=brazo(-110), giro_tronco=-16, inclina=-4),
                 dict(brazos=brazo(60), giro_tronco=14, inclina=6, avance=0.05), dict(brazos=brazo(95), giro_tronco=16, inclina=8, avance=0.06),
                 dict(brazos=brazo(45), giro_tronco=6, inclina=3, avance=0.03), dict()]
    retro = 0.03 if perfil.get('retroceso') else 0.0
    if perfil.get('disparo') == 'boca' or not sk['brazos']:
        tiro = [dict(), dict(inclina=-5), dict(inclina=10, avance=0.02 - retro), dict(inclina=6, avance=0.01 - retro * 0.5), dict()]
    else:
        tiro = [dict(), dict(brazos=brazo(60)), dict(brazos=brazo(88), avance=-retro), dict(brazos=brazo(85), avance=-retro * 0.5), dict(brazos=brazo(40))]
    for nombre, cuadros in (('andar', andar), ('ataque', golpe), ('disparo', tiro)):
        for f, kw in enumerate(cuadros):
            poner(pose(co, sk, w, **kw))
            for d in ANIM_DIRS:
                camara(d)
                render('%s-%s-%d' % (nombre, d, f))
    poner(co)
    print('animar3d: hecho en', carpeta)


main()
