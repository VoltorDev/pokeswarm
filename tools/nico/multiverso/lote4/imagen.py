"""Imágenes base de un personaje del cuarto lote (Workers AI, gratis: 10.000 Neurons al día).

    python tools/nico/multiverso/lote4/imagen.py <clave> [--n 4] [--semilla 1] [--modelo flux|lucid|phoenix]
                                                        [--prompt "texto en inglés"] [--extra "lo que se añade al del JSON"]

Usa el `sprite.prompt` de lote4/propuestas/<clave>.json (o --prompt) con un final común que pide lo que necesita la
reconstrucción 3D (de frente, entero, pose relajada con los brazos algo separados del cuerpo, fondo liso del color
`sprite.fondo`, luz pareja, sin texto). Escribe lote4/trabajo/<clave>/cand-<semilla>.png y una hoja con todas las
candidatas de esta tanda (cands-<primera semilla>.png) para elegir mirándolas.

La sesión de Cloudflare es la de wrangler: si devuelve 401, se renueva sola con `npx wrangler whoami` (usa el token de
refresco) y se reintenta una vez; si aun así falla, hace falta `npx wrangler login`, que es interactivo (lo hace Nico).
"""
import base64
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, r'C:\Users\Nico\Desktop\Claude\herramientas\cloudflare-ai')
import ai  # noqa: E402  (token() y llamar() de la herramienta común)

MODELOS = {'flux': '@cf/black-forest-labs/flux-1-schnell', 'lucid': '@cf/leonardo/lucid-origin', 'phoenix': '@cf/leonardo/phoenix-1.0'}
FINAL = (' Full body visible from head to feet, standing upright facing the camera in a relaxed A-pose with the arms held a '
         'little away from the body and the legs slightly apart, front view, centered, the whole character inside the frame '
         'with margin, plain flat solid {fondo} background, even soft studio lighting, no shadow on the ground, 3D render '
         'of a stylized video game character figure, clean readable silhouette, no text, no logo, no frame.')


def opcion(nombre, defecto):
    return type(defecto)(sys.argv[sys.argv.index(nombre) + 1]) if nombre in sys.argv else defecto


def pedir(modelo, payload):
    """Llama a Workers AI; con 401 renueva la sesión de wrangler una vez."""
    try:
        return ai.llamar(modelo, payload)
    except SystemExit:
        subprocess.run('npx --yes wrangler@latest whoami', shell=True, capture_output=True, timeout=180)
        return ai.llamar(modelo, payload)


def una(prompt, modelo, semilla, destino):
    m = MODELOS[modelo]
    payload = {'prompt': prompt}
    if modelo == 'flux':
        payload['steps'] = 8   # FLUX schnell no admite semilla: cada llamada sale distinta
    else:
        payload['seed'] = semilla
        payload.update({'width': 1024, 'height': 1024, 'num_steps': 25 if modelo == 'lucid' else 25})
    ct, raw = pedir(m, payload)
    if 'json' in ct:
        d = json.loads(raw.decode('utf-8'))
        if not d.get('success', True) and not d.get('result'):
            raise RuntimeError(json.dumps(d.get('errors'))[:300])
        res = d.get('result') or d
        b64 = res.get('image') or res.get('b64_json')
        if not b64:
            raise RuntimeError('el modelo no devolvió imagen; claves: %s' % list(res)[:6])
        datos = base64.b64decode(b64)
    else:
        datos = raw
    open(destino, 'wb').write(datos)
    return destino


def main():
    clave = sys.argv[1]
    rp = os.path.join(AQUI, 'propuestas', clave + '.json')
    prop = json.load(open(rp, encoding='utf-8')) if os.path.exists(rp) else {'sprite': {'prompt': '', 'fondo': opcion('--fondo', '#d9d9d9')}}
    n, s0, modelo = opcion('--n', 4), opcion('--semilla', 1), opcion('--modelo', 'flux')
    fondo = prop['sprite'].get('fondo', '#d9d9d9')
    base = opcion('--prompt', prop['sprite']['prompt'])
    extra = opcion('--extra', '')
    prompt = (base + (' ' + extra if extra else '') + FINAL.format(fondo=fondo)).strip()
    dst = os.path.join(AQUI, 'trabajo', clave)
    os.makedirs(dst, exist_ok=True)
    open(os.path.join(dst, 'prompt-%d.txt' % s0), 'w', encoding='utf-8').write('%s\n%s\n' % (MODELOS[modelo], prompt))
    hechas = []
    for k in range(n):
        s = s0 + k
        ruta = os.path.join(dst, 'cand-%d.png' % s)
        try:
            una(prompt, modelo, s, ruta)
            Image.open(ruta).convert('RGB').save(ruta)   # PNG de verdad (Workers AI a veces da JPEG)
            hechas.append((s, ruta))
            print('candidata %d: %s' % (s, ruta))
        except (Exception, SystemExit) as e:   # sigue con las demás
            print('candidata %d: FALLO %s' % (s, e))
    if not hechas:
        sys.exit(1)
    L = 384
    hoja = Image.new('RGB', (L * len(hechas), L + 24), (30, 30, 30))
    dib = ImageDraw.Draw(hoja)
    for i, (s, ruta) in enumerate(hechas):
        hoja.paste(Image.open(ruta).convert('RGB').resize((L, L)), (i * L, 24))
        dib.text((i * L + 6, 5), 'semilla %d' % s, fill=(255, 255, 255))
    hoja.save(os.path.join(dst, 'cands-%d.png' % s0))
    print('hoja: %s' % os.path.join(dst, 'cands-%d.png' % s0))


if __name__ == '__main__':
    main()
