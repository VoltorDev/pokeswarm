"""Quita el fondo de la imagen base de un personaje (para TRELLIS.2, que necesita alfa).

    C:/Users/Nico/Desktop/Claude/herramientas/3d-gen/.venv-rembg/Scripts/python.exe tools/nico/multiverso/lote4/fondo.py
        <entrada.png> <salida.png> [--modelo isnet-general-use|birefnet-general|u2net] [--margen 0.06]

Segmentación con rembg (MIT; modelos ONNX de su repositorio, sin código remoto), no por color: el fondo puede parecerse
al personaje (la gorra roja de Mario sobre un fondo rojo). Después: alfa limpio (sin semitransparencias sueltas: < 0.5
fuera, el resto opaco), sólo la pieza más grande (fuera manchas sueltas), recorte al personaje con `margen` a cada lado,
cuadrado de 1024 y una vista de comprobación sobre tablero (<salida>-ver.png). Dice si el personaje toca un borde de la
imagen original (entonces le falta algo: hay que generar otra).
El entorno .venv-rembg de herramientas/3d-gen se creó el 14-11-2026 para esto (rembg 2.0.80); se quita borrando la carpeta.
"""
import sys

import numpy as np
from PIL import Image


def opcion(nombre, defecto):
    return type(defecto)(sys.argv[sys.argv.index(nombre) + 1]) if nombre in sys.argv else defecto


def mayor_pieza(m):
    """La componente conexa más grande de una máscara booleana (4 vecinos), sin scipy."""
    H, W = m.shape
    etiqueta = np.zeros((H, W), np.int32)
    tam = [0]
    k = 0
    for y0 in range(H):
        fila = m[y0]
        for x0 in np.where(fila & (etiqueta[y0] == 0))[0]:
            if etiqueta[y0, x0]:
                continue
            k += 1
            pila = [(y0, x0)]
            etiqueta[y0, x0] = k
            n = 0
            while pila:
                y, x = pila.pop()
                n += 1
                for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not etiqueta[yy, xx]:
                        etiqueta[yy, xx] = k
                        pila.append((yy, xx))
            tam.append(n)
    if k == 0:
        return m
    return etiqueta == int(np.argmax(tam))


def main():
    from rembg import new_session, remove
    ent, sal = sys.argv[1], sys.argv[2]
    modelo, margen = opcion('--modelo', 'isnet-general-use'), opcion('--margen', 0.06)
    img = Image.open(ent).convert('RGB')
    rgba = remove(img, session=new_session(modelo))
    a = np.array(rgba)
    alfa = a[:, :, 3] >= 128
    # Sólo la pieza más grande, a resolución reducida para que sea rápido, y vuelta al tamaño original.
    f = max(1, max(alfa.shape) // 512)
    peque = alfa[::f, ::f]
    grande = mayor_pieza(peque)
    alfa &= np.kron(grande, np.ones((f, f), bool))[:alfa.shape[0], :alfa.shape[1]]
    ys, xs = np.where(alfa)
    if not len(ys):
        sys.exit('No queda nada tras quitar el fondo: prueba otro modelo (--modelo u2net) u otra imagen.')
    H, W = alfa.shape
    toca = [n for n, v in (('arriba', ys.min() <= 2), ('abajo', ys.max() >= H - 3), ('izquierda', xs.min() <= 2), ('derecha', xs.max() >= W - 3)) if v]
    a[:, :, 3] = np.where(alfa, 255, 0).astype(np.uint8)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    lado = int(max(x1 - x0, y1 - y0) * (1 + 2 * margen))
    lienzo = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    recorte = Image.fromarray(a).crop((x0, y0, x1 + 1, y1 + 1))
    lienzo.alpha_composite(recorte, ((lado - recorte.width) // 2, (lado - recorte.height) // 2))
    lienzo = lienzo.resize((1024, 1024), Image.LANCZOS)
    lienzo.save(sal)
    tablero = Image.new('RGBA', (1024, 1024))
    t = np.indices((1024, 1024)).sum(0) // 32 % 2
    tablero = Image.fromarray(np.where(t[:, :, None] == 1, [200, 70, 200, 255], [40, 160, 70, 255]).astype(np.uint8))
    tablero.alpha_composite(lienzo)
    tablero.convert('RGB').resize((512, 512)).save(sal.replace('.png', '-ver.png'))
    print('fondo: %s (%d%% del cuadro es personaje)%s' % (sal, round(100 * alfa.mean()), ' · OJO: toca el borde ' + ', '.join(toca) if toca else ''))


if __name__ == '__main__':
    main()
