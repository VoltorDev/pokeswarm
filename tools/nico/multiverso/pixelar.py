"""Baja los renders de rotar3d.py a las rotaciones de 32x32 con el aspecto de las de PixelLab (0 generaciones).

    python tools/nico/multiverso/pixelar.py <carpeta_renders> <clave> [--alto 30] [--colores 20] [--anim] [--detalle 0.25]

Escribe tools/nico/multiverso/fuentes/<clave>/rot-<dirección>.png, como `montar.py traer`:
  1. recorta el personaje con el MISMO marco en las 8 (el de la más alta y la más ancha), para que no cambie de tamaño
     al girar, y le sube la saturación y el contraste (PixelLab pinta con colores planos y vivos);
  2. reduce los colores a una paleta común de `colores` para las 8 (k-medias), a resolución alta;
  3. baja a `alto` píxeles (el Jefe Maestro de PixelLab mide 30 de 32) quedándose en cada píxel con el color que más
     se repite en su bloque, sin promediar: así no se emborrona y lo fino (grietas, ruido de la textura) desaparece;
  4. sin píxeles sueltos (ruido de la textura) y contorno de 1 px oscuro por fuera, como el de PixelLab, y los pies en la fila 31.
Con --anim (renders de animar3d.py en la misma carpeta) baja también sus fotogramas con el MISMO marco, escala y paleta
que las rotaciones, en celdas de 48x48 con la de 32 en (8, 8) (lo que puede salir del cuerpo, un brazo o un arma, cabe):
  andar-<dirección>.png (4 fotogramas), Attack-<dirección>.png (7) y Shoot-<dirección>.png (5), para sur, sureste, este,
  noreste y norte; montar.py hace el espejo del oeste y los usa en vez de los de código.
"""
import os
import sys

import numpy as np
from PIL import Image

DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
FUENTES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fuentes')
LADO = 32
CELDA_ANIM = 48
ANIM_DIRS = ['south', 'south-east', 'east', 'north-east', 'north']
DETALLE = 0.0   # con --detalle F (p. ej. 0.25), conserva lo oscuro que ocupe al menos F de un bloque (main lo pone)
CONTORNO = (26, 18, 32, 255)
SATURACION = 1.35
CONTRASTE = 1.0
BRILLO = 0.86       # baja los blancos para que se vea la sombra (la piel de Kratos es casi blanca en la textura)


def opcion(nombre, defecto):
    return type(defecto)(sys.argv[sys.argv.index(nombre) + 1]) if nombre in sys.argv else defecto


def kmedias(px, k, vueltas=20, semilla=1):
    rnd = np.random.default_rng(semilla)
    c = px[rnd.choice(len(px), k, replace=False)].astype(float)
    for _ in range(vueltas):
        d = ((px[:, None, :] - c[None]) ** 2).sum(2)
        e = d.argmin(1)
        for j in range(k):
            if (e == j).any():
                c[j] = px[e == j].mean(0)
    return c


def limpiar(l):
    out = l.copy()
    H, W = l.shape[:2]
    for y in range(H):
        for x in range(W):
            if l[y, x, 3] == 0:
                continue
            vec = [tuple(l[yy, xx]) for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1))
                   if 0 <= yy < H and 0 <= xx < W and l[yy, xx, 3] > 0]
            if len(vec) >= 3 and tuple(l[y, x]) not in vec:
                out[y, x] = max(set(vec), key=vec.count)
    return out


def realce(r):
    r = r.astype(float)
    rgb = r[:, :, :3] / 255
    gris = rgb.mean(2, keepdims=True)
    rgb = np.clip(gris + (rgb - gris) * SATURACION, 0, 1)
    rgb = np.clip(((rgb - 0.5) * CONTRASTE + 0.5) * BRILLO, 0, 1)
    r[:, :, :3] = rgb * 255
    return r


def bajar(a, marco, pal, lado, margen):
    """Un render (256x256 RGBA) a un lienzo de lado x lado: la caja (x0, y0)-(x1, y1) del render ocupa ww x alto píxeles con
    su esquina en la de la celda de 32 (desplazada `margen` dentro del lienzo, y con los pies en su fila 31); lo de fuera de
    la caja (un brazo estirado) se baja con la misma escala. Cada píxel, el color de la paleta que más se repite en su
    bloque si el bloque es casi todo opaco; sin píxeles sueltos y con contorno."""
    x0, y0, x1, y1, alto, ww = marco
    W, H = x1 - x0 + 1, y1 - y0 + 1
    bx, by = W / ww, H / alto
    r = realce(a)
    RH, RW = r.shape[:2]
    idx = ((r[:, :, :3].reshape(-1, 3)[:, None, :] - pal[None]) ** 2).sum(2).argmin(1).reshape(RH, RW)
    opq = r[:, :, 3] >= 128
    lienzo = np.zeros((lado, lado, 4), np.uint8)
    ox, oy = margen + (LADO - ww) // 2, margen + LADO - 1 - alto
    for ty in range(lado):
        for tx in range(lado):
            u, v = tx - ox, ty - oy
            xa, ya = x0 + u * bx, y0 + v * by
            xa_i, ya_i = int(np.floor(xa)), int(np.floor(ya))
            xb_i, yb_i = max(int(np.floor(xa + bx)), xa_i + 1), max(int(np.floor(ya + by)), ya_i + 1)
            if xb_i <= 0 or yb_i <= 0 or xa_i >= RW or ya_i >= RH:
                continue
            xa_i, ya_i, xb_i, yb_i = max(0, xa_i), max(0, ya_i), min(RW, xb_i), min(RH, yb_i)
            bo = opq[ya_i:yb_i, xa_i:xb_i]
            if bo.size == 0 or bo.mean() < 0.45:
                continue
            cuenta = np.bincount(idx[ya_i:yb_i, xa_i:xb_i][bo], minlength=len(pal))
            k = cuenta.argmax()
            if DETALLE:
                # Lo oscuro y pequeño (ojos, cejas, bigote, contornos de la textura) no se pierde: si un color mucho más
                # oscuro que el mayoritario ocupa al menos DETALLE del bloque, gana él.
                lum = pal @ np.array([0.299, 0.587, 0.114])
                for j in np.argsort(lum):
                    if lum[j] < lum[k] - 55 and cuenta[j] >= DETALLE * cuenta.sum():
                        k = j
                        break
            lienzo[ty, tx] = (*pal[k].astype(np.uint8), 255)
    lienzo = limpiar(lienzo)
    a2 = lienzo[:, :, 3] > 0
    borde = np.zeros_like(a2)
    borde[1:] |= a2[:-1]; borde[:-1] |= a2[1:]; borde[:, 1:] |= a2[:, :-1]; borde[:, :-1] |= a2[:, 1:]
    borde &= ~a2
    lienzo[borde] = CONTORNO
    return lienzo


def main():
    global DETALLE
    carpeta, clave = sys.argv[1], sys.argv[2]
    DETALLE = opcion('--detalle', 0.0)
    alto, ncol = opcion('--alto', 30), opcion('--colores', 20)
    ims = [np.array(Image.open(os.path.join(carpeta, 'render-%s.png' % d)).convert('RGBA')) for d in DIRS]
    # Marco común: la caja que contiene a todos.
    cajas = []
    for a in ims:
        ys, xs = np.where(a[:, :, 3] > 40)
        cajas.append((xs.min(), ys.min(), xs.max(), ys.max()))
    x0 = min(c[0] for c in cajas); y0 = min(c[1] for c in cajas); x1 = max(c[2] for c in cajas); y1 = max(c[3] for c in cajas)
    esc = alto / (y1 - y0 + 1)
    w = int(round((x1 - x0 + 1) * esc))
    # 1. Recorte común y realce: más saturación y contraste, como el pixel art de PixelLab (colores planos y vivos).
    recs = []
    for a in ims:
        r = a[y0:y1 + 1, x0:x1 + 1].astype(float)
        rgb = r[:, :, :3] / 255
        gris = rgb.mean(2, keepdims=True)
        rgb = np.clip(gris + (rgb - gris) * SATURACION, 0, 1)
        rgb = np.clip(((rgb - 0.5) * CONTRASTE + 0.5) * BRILLO, 0, 1)
        r[:, :, :3] = rgb * 255
        recs.append(r)
    # 2. Paleta común a resolución alta (k-medias sobre los opacos de las 8).
    todos = np.concatenate([r[r[:, :, 3] >= 128][:, :3] for r in recs])
    muestra = todos[np.random.default_rng(2).choice(len(todos), min(8000, len(todos)), replace=False)]
    pal = kmedias(muestra, ncol)
    os.makedirs(os.path.join(FUENTES, clave), exist_ok=True)
    ww = min(w, LADO - 2)
    marco = (x0, y0, x1, y1, alto, ww)
    for d, a in zip(DIRS, ims):
        Image.fromarray(bajar(a, marco, pal, LADO, 0)).save(os.path.join(FUENTES, clave, 'rot-%s.png' % d), optimize=True)
    if '--anim' in sys.argv:
        for nombre, n, salida in (('andar', 4, 'andar'), ('ataque', 7, 'Attack'), ('disparo', 5, 'Shoot')):
            for d in ANIM_DIRS:
                rutas = [os.path.join(carpeta, '%s-%s-%d.png' % (nombre, d, f)) for f in range(n)]
                if not all(os.path.exists(r) for r in rutas):
                    continue
                tira = np.zeros((CELDA_ANIM, CELDA_ANIM * n, 4), np.uint8)
                for f, r in enumerate(rutas):
                    a = np.array(Image.open(r).convert('RGBA'))
                    tira[:, f * CELDA_ANIM:(f + 1) * CELDA_ANIM] = bajar(a, marco, pal, CELDA_ANIM, (CELDA_ANIM - LADO) // 2)
                Image.fromarray(tira).save(os.path.join(FUENTES, clave, '%s-%s.png' % (salida, d)), optimize=True)
        print('pixelar: animaciones (andar, Attack, Shoot) en celdas de %d en fuentes/%s' % (CELDA_ANIM, clave))
    print('pixelar: 8 rotaciones de %dx%d (personaje de %d px de alto, %d colores) en fuentes/%s' % (LADO, LADO, alto, ncol, clave))


if __name__ == '__main__':
    main()
