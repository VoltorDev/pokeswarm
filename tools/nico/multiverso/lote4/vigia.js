/* ============ lote4/vigia.js — vigila el progreso y prepara lo que se manda al tablero ============
 *   node tools/nico/multiverso/lote4/vigia.js [segundos entre envíos, 20 por defecto]
 *
 * Mira lote4/estado/*.json cada segundo. Cuando el contador `n` de un personaje cambia (y lleva 2 s quieto, para juntar
 * varias llamadas seguidas), deja en lote4/estado/enviar/:
 *   ev-<clave>-<n>.json   el avance (ligero: etapas, notas, datos e imgId), colección `eventos`, documento <clave>-<n>;
 *   img-<imgId>.json      si la imagen es nueva: { clave, n, etapa, src: data URI }, colección `imagenes`, documento <imgId>.
 * Cada `segundos`, si hay algo nuevo, saca UNA línea por la salida estándar con todo lo pendiente (como mucho 50):
 *   LOTE <k> <colección>/<documento>=<ruta> ...
 * Cada línea es un aviso del Monitor de Claude Code, que lo sube con un solo `batch` de ArtifactData (documentos nuevos:
 * así no hace falta conocer versiones). Lo ya preparado se apunta en estado/enviados.json.
 */
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'estado'), OUT = path.join(DIR, 'enviar');
const CADA = Math.max(5, +(process.argv[2] || 20)) * 1000;
fs.mkdirSync(OUT, { recursive: true });
const REG = path.join(DIR, 'enviados.json');
let reg = { n: {}, img: {} };
try { reg = Object.assign(reg, JSON.parse(fs.readFileSync(REG, 'utf8'))); } catch (e) { /* nada */ }
const visto = {};   // clave -> { n, desde }
let pendientes = [];   // [coleccion/documento, ruta]
let ultimoEnvio = 0;

function mirar() {
  let ficheros = [];
  try { ficheros = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'enviados.json'); } catch (e) { return; }
  const ahora = Date.now();
  for (const f of ficheros) {
    let s;
    try { s = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { continue; }
    if (!s || !s.clave || !(s.n > 0)) continue;
    if ((reg.n[s.clave] || 0) >= s.n) continue;
    const v = visto[s.clave];
    if (!v || v.n !== s.n) { visto[s.clave] = { n: s.n, desde: ahora }; continue; }
    if (ahora - v.desde < 2000) continue;
    const ev = { clave: s.clave, dex: s.dex, nombre: s.nombre, saga: s.saga, n: s.n, etapas: s.etapas, datos: s.datos || {},
      nota: s.nota || '', ultimaEtapa: s.ultimaEtapa || '', actualizado: s.actualizado || '', imgId: s.imgId || null, imgEtapa: s.imgEtapa || null };
    if (s.imgId && !reg.img[s.imgId] && s.img && fs.existsSync(s.img)) {
      const b = fs.readFileSync(s.img);
      if (b.length <= 180 * 1024) {
        const rutaImg = path.join(OUT, `img-${s.imgId}.json`);
        const mime = b.slice(0, 3).toString('ascii') === 'GIF' ? 'image/gif' : 'image/png';
        fs.writeFileSync(rutaImg, JSON.stringify({ clave: s.clave, n: s.n, etapa: s.imgEtapa || '', src: `data:${mime};base64,` + b.toString('base64') }));
        reg.img[s.imgId] = true;
        pendientes.push(['imagenes/' + s.imgId, rutaImg]);
      } else { ev.nota += ' (imagen demasiado grande: no se manda)'; ev.imgId = null; }
    }
    const ruta = path.join(OUT, `ev-${s.clave}-${s.n}.json`);
    fs.writeFileSync(ruta, JSON.stringify(ev));
    pendientes.push([`eventos/${s.clave}-${s.n}`, ruta]);
    reg.n[s.clave] = s.n;
    fs.writeFileSync(REG, JSON.stringify(reg));
  }
  if (pendientes.length && ahora - ultimoEnvio >= CADA) {
    // Las imágenes primero: el avance que las nombra llega detrás.
    pendientes.sort((a, b) => (a[0].startsWith('imagenes/') ? 0 : 1) - (b[0].startsWith('imagenes/') ? 0 : 1));
    const lote = pendientes.slice(0, 50);
    pendientes = pendientes.slice(50);
    ultimoEnvio = ahora;
    // Corto (la ruta se deduce: eventos/<id> -> enviar/ev-<id>.json, imagenes/<id> -> enviar/img-<id>.json).
    const ev = lote.filter(([d]) => d.startsWith('eventos/')).map(([d]) => d.slice(8));
    const im = lote.filter(([d]) => d.startsWith('imagenes/')).map(([d]) => d.slice(9));
    process.stdout.write(`LOTE ${lote.length}: eventos ${ev.join(' ')}${im.length ? ' | imagenes ' + im.join(' ') : ''}\n`);
  }
}
setInterval(mirar, 1000);
mirar();
