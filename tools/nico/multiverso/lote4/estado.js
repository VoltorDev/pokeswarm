/* ============ lote4/estado.js — apunta el progreso de un personaje (lo que enseña el tablero en directo) ============
 *   node tools/nico/multiverso/lote4/estado.js <clave> <etapa> <estado> ["nota"] [--img ruta.png] [--dato clave=valor ...]
 *
 * etapa:  ficha | datos | imagen | modelo | rotaciones | andar | hojas | revision
 * estado: pendiente | en-curso | hecho | problema
 * --img:  una imagen para la tarjeta (PNG o JPG): una hoja de contacto a tamaño de juego, la imagen base… Si pesa más de
 *         140 KB o mide más de 768 px, se reduce (con Pillow; vecino más cercano si es pixel art pequeño).
 * --dato: campos sueltos para la tarjeta, p. ej. --dato tipos="Fuego / Normal" --dato inicial="Bola de Fuego".
 *
 * Escribe lote4/estado/<clave>.json (un contador `n` que sube en cada llamada, el estado de cada etapa, la última nota y
 * la imagen más reciente); lote4/vigia.js lo ve y lo deja listo para el tablero. Cada personaje lo escribe un solo
 * agente a la vez.
 */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const DIR = path.join(__dirname, 'estado');
const ROSTER = JSON.parse(fs.readFileSync(path.join(__dirname, 'roster.json'), 'utf8'));
const ETAPAS = ROSTER.etapas.map(e => e.id);
const ESTADOS = ['pendiente', 'en-curso', 'hecho', 'problema'];

const args = process.argv.slice(2);
const flags = { img: null, dato: [] };
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--img') flags.img = args[++i];
  else if (args[i] === '--dato') flags.dato.push(args[++i]);
  else pos.push(args[i]);
}
const [clave, etapa, estado, nota = ''] = pos;
const pj = ROSTER.personajes.find(p => p.clave === clave);
if (!pj || !ETAPAS.includes(etapa) || !ESTADOS.includes(estado)) {
  console.error(`Uso: estado.js <clave> <etapa> <estado> ["nota"] [--img x.png] [--dato k=v]\n  clave: ${ROSTER.personajes.map(p => p.clave).join(' ')}\n  etapa: ${ETAPAS.join(' ')}\n  estado: ${ESTADOS.join(' ')}`);
  process.exit(2);
}
fs.mkdirSync(path.join(DIR, 'img'), { recursive: true });
const f = path.join(DIR, clave + '.json');
let s = { clave, dex: pj.dex, nombre: pj.nombre, saga: pj.saga, n: 0, etapas: {}, datos: {}, nota: '', imgId: null, img: null, imgEtapa: null };
try { s = Object.assign(s, JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) { /* primera vez */ }
s.n += 1;
s.etapas[etapa] = { estado, nota, t: new Date().toISOString() };
s.nota = nota;
s.ultimaEtapa = etapa;
s.actualizado = new Date().toISOString();
for (const d of flags.dato) {
  const i = d.indexOf('=');
  if (i > 0) s.datos[d.slice(0, i)] = d.slice(i + 1);
}
if (flags.img) {
  if (!fs.existsSync(flags.img)) { console.error('No existe la imagen ' + flags.img); process.exit(2); }
  const gif = /\.gif$/i.test(flags.img);
  const id = `${clave}-${s.n}`, dst = path.join(DIR, 'img', id + (gif ? '.gif' : '.png'));
  // Reduce lo grande: el tablero guarda cada imagen en un documento de 256 KB como mucho.
  const py = `
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
import os
grande = os.path.getsize(src) > 140 * 1024 or max(im.size) > 768
if grande:
    f = 768 / max(im.size)
    if f < 1:
        nuevo = (max(1, int(im.width * f)), max(1, int(im.height * f)))
        im = im.resize(nuevo, Image.NEAREST if max(im.size) <= 1024 and len(im.getcolors(1 << 16) or []) < 256 else Image.LANCZOS)
im.save(dst, optimize=True)
if os.path.getsize(dst) > 170 * 1024:
    im.convert('RGB').resize((im.width * 2 // 3, im.height * 2 // 3), Image.LANCZOS).save(dst, optimize=True)
`;
  if (gif) fs.copyFileSync(flags.img, dst);   // un GIF animado (el andar) se copia tal cual
  else {
    try { execFileSync('python', ['-c', py, flags.img, dst], { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (e) { fs.copyFileSync(flags.img, dst); }
  }
  s.imgId = id;
  s.img = dst;
  s.imgEtapa = etapa;
}
const tmp = f + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(s, null, 1));
fs.renameSync(tmp, f);
console.log(`apuntado: ${clave} · ${etapa} = ${estado}${nota ? ' · ' + nota : ''}${flags.img ? ' · con imagen' : ''} (n ${s.n})`);
