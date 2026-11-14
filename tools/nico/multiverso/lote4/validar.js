/* ============ lote4/validar.js — comprueba la propuesta de un personaje del cuarto lote ============
 *   node tools/nico/multiverso/lote4/validar.js <clave>          (o «todos»)
 *
 * Lee lote4/propuestas/<clave>.json y comprueba lo mismo que check.js §24 (y algo más, para que la integración no
 * falle): campos, tipos, estadísticas en el rango de los demás personajes, 7-8 ataques con un solo potenciador, el
 * inicial el primero, ids y nombres que no choquen con nada del juego ni de otra propuesta, cada ataque con los campos
 * de su forma y su daño nominal y alcance dentro del rango de los ataques Pokémon de esa forma (rangos.json), el
 * potenciador copiando los números de uno de upstream, `vis` que el juego sabe dibujar, evoluciones con lo que piden,
 * los textos en inglés, el variocolor, la descripción para la imagen y las fuentes. Sale con 1 si hay errores.
 */
'use strict';
const fs = require('fs'), path = require('path');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'rangos.json'), 'utf8'));
const ROSTER = JSON.parse(fs.readFileSync(path.join(__dirname, 'roster.json'), 'utf8'));
const PROP = path.join(__dirname, 'propuestas');
const MOV = ['anda', 'flota', 'contonea', 'desliza'];
const nominal = m => m.dmg * (m.count || 1) / m.cd;
const alcance = m => ['projectile', 'cone', 'nova'].includes(m.kind) ? m.speed * m.life : m.kind === 'turret' ? m.range : m.radius;
const leer = c => { try { return JSON.parse(fs.readFileSync(path.join(PROP, c + '.json'), 'utf8')); } catch (e) { return { __error: String(e.message) }; } };
const COMUNES = ['id', 'name', 'nameEn', 'type', 'kind', 'desc', 'descEn', 'evo', 'evoEn', 'vis', 'nota'];

function validar(clave) {
  const err = [], aviso = [];
  const pj = ROSTER.personajes.find(p => p.clave === clave);
  if (!pj) return { err: ['clave desconocida: ' + clave], aviso };
  const p = leer(clave);
  if (p.__error) return { err: ['no se puede leer propuestas/' + clave + '.json: ' + p.__error], aviso };
  const req = (c, msg) => { if (!c) err.push(msg); };
  req(p.clave === clave && p.dex === pj.dex, `clave y dex deben ser ${clave} y ${pj.dex}`);
  for (const k of ['nombre', 'nombreEn', 'saga', 'serie', 'version']) req(typeof p[k] === 'string' && p[k].trim(), `falta ${k} (texto)`);
  req(Array.isArray(p.types) && p.types.length >= 1 && p.types.length <= 2 && p.types.every(t => R.tipos.includes(t)) && new Set(p.types).size === p.types.length,
    `types: 1 o 2 de ${R.tipos.join(', ')}`);
  req(Number.isInteger(p.hp) && p.hp >= 88 && p.hp <= 128, 'hp: entero entre 88 y 128 (los demás: 92-126)');
  req(Number.isInteger(p.spd) && p.spd >= 90 && p.spd <= 120, 'spd: entero entre 90 y 120 (los demás: 92-118)');
  req(typeof p.atk === 'number' && p.atk >= 1.05 && p.atk <= 1.2, 'atk: entre 1.05 y 1.2 (los demás: 1.07-1.2)');
  req(Number.isInteger(p.bst) && p.bst >= 395 && p.bst <= 435, 'bst: entero entre 395 y 435');
  req(MOV.includes(p.mov), `mov: uno de ${MOV.join(', ')} ('rueda' sólo con animaciones dibujadas a mano)`);
  req(p.disparo === 1 || p.disparo === -1, 'disparo: 1 (se impulsa hacia delante al atacar) o -1 (retrocede, p. ej. un arma de fuego)');
  const A = Array.isArray(p.ataques) ? p.ataques : [];
  req(A.length >= 7 && A.length <= 8, 'ataques: 7 u 8');
  req(A.filter(a => a.kind === 'buff').length === 1, 'exactamente un potenciador (kind buff), como cada personaje del Multiverso');
  req(A.length && A[0].kind !== 'buff', 'el primero (el inicial) no puede ser el potenciador');
  const kinds = {};
  for (const a of A) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
  for (const [k, n] of Object.entries(kinds)) if (n > 2) err.push(`demasiados ataques de la forma ${k} (${n}; como mucho 2)`);
  if (Object.keys(kinds).length < 5) aviso.push(`sólo ${Object.keys(kinds).length} formas distintas: los demás personajes usan 6-7`);
  // ids y nombres: ni del juego ni de otras propuestas
  const otros = ROSTER.personajes.filter(x => x.clave !== clave).map(x => leer(x.clave)).filter(x => !x.__error);
  const idsOtros = new Set(otros.flatMap(o => (o.ataques || []).map(a => a.id)));
  const nomOtros = new Set(otros.flatMap(o => (o.ataques || []).flatMap(a => [a.name, a.evo && a.evo[0]]).filter(Boolean)));
  const usadosId = new Set(R.idsUsados), usadosNom = new Set(R.nombresUsados);
  const vistos = new Set(), vistosN = new Set();
  for (const a of A) {
    const q = `ataque ${a.id || '?'}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.id || '')) { err.push(`${q}: id en minúsculas con guiones`); continue; }
    if (usadosId.has(a.id)) err.push(`${q}: ese id ya existe en el juego`);
    if (idsOtros.has(a.id)) err.push(`${q}: ese id ya lo usa otra propuesta del lote`);
    if (vistos.has(a.id)) err.push(`${q}: repetido`); vistos.add(a.id);
    for (const n of [a.name, a.evo && a.evo[0]].filter(Boolean)) {
      if (usadosNom.has(n)) err.push(`${q}: el nombre «${n}» ya existe en el juego (las traducciones van por texto: tiene que ser único)`);
      if (nomOtros.has(n)) err.push(`${q}: el nombre «${n}» ya lo usa otra propuesta del lote`);
      if (vistosN.has(n)) err.push(`${q}: nombre «${n}» repetido en este personaje`); vistosN.add(n);
    }
    for (const k of ['name', 'nameEn', 'desc', 'descEn']) if (!(typeof a[k] === 'string' && a[k].trim())) err.push(`${q}: falta ${k}`);
    if (a.desc && a.desc.length > 120) aviso.push(`${q}: desc de ${a.desc.length} letras (las demás, hasta ~110)`);
    if (!R.tipos.includes(a.type)) err.push(`${q}: type ${a.type} no es un tipo`);
    if (a.kind === 'buff') {
      const ok = R.buffs.some(b => b.stat === a.stat && b.amount === a.amount && b.stacks === a.stacks && b.dur === a.dur && b.cd === a.cd);
      if (!ok) err.push(`${q}: el potenciador debe copiar stat/amount/stacks/dur/cd de uno de: ${R.buffs.map(b => b.name + ' ' + [b.stat, b.amount, b.stacks, b.dur, b.cd].join('/')).join('; ')}`);
      if (a.evo) err.push(`${q}: un potenciador no evoluciona (sin evo)`);
      if (a.desc && !/^No hace daño: acumula /.test(a.desc)) aviso.push(`${q}: los potenciadores dicen «No hace daño: acumula ATAQUE/VELOCIDAD/DEFENSA… mientras esté activo.»`);
    } else {
      const f = R.formas[a.kind];
      if (!f) { err.push(`${q}: forma ${a.kind} desconocida (${Object.keys(R.formas).join(', ')}, buff)`); continue; }
      const sobran = Object.keys(a).filter(k => !COMUNES.includes(k) && !f.campos.includes(k));
      if (sobran.length) err.push(`${q}: campos que la forma ${a.kind} no usa: ${sobran.join(', ')} (usa: ${f.campos.join(', ')})`);
      const falta = ['cd', 'dmg'].concat(['projectile', 'cone', 'nova'].includes(a.kind) ? ['speed', 'life', 'count'] : a.kind === 'turret' ? ['range'] : ['radius']).filter(k => typeof a[k] !== 'number');
      if (falta.length) err.push(`${q}: faltan números: ${falta.join(', ')}`);
      else {
        const d = nominal(a), r = alcance(a);
        if (!(d >= f.dano[0] - 1e-9 && d <= f.dano[1] + 1e-9)) err.push(`${q}: daño nominal ${d.toFixed(1)} fuera del rango de ${a.kind} (${f.dano[0]}-${f.dano[1]})`);
        if (!(r >= f.alcance[0] - 1e-9 && r <= f.alcance[1] + 1e-9)) err.push(`${q}: alcance ${r.toFixed(1)} fuera del rango de ${a.kind} (${f.alcance[0]}-${f.alcance[1]})`);
        a._medida = `nominal ${d.toFixed(1)} (${f.dano[0]}-${f.dano[1]}), alcance ${r.toFixed(1)} (${f.alcance[0]}-${f.alcance[1]})`;
      }
      if (!(Array.isArray(a.evo) && a.evo.length === 2 && typeof a.evo[0] === 'string' && R.NEED[a.evo[1]])) err.push(`${q}: evo debe ser [nombre, lo que pide] con lo que pide en ${Object.keys(R.NEED).join(', ')}`);
      if (!(typeof a.evoEn === 'string' && a.evoEn.trim())) err.push(`${q}: falta evoEn (el nombre de la evolución en inglés)`);
    }
    if (a.vis !== undefined) {
      if (typeof a.vis !== 'object' || Array.isArray(a.vis)) err.push(`${q}: vis debe ser un objeto`);
      else for (const [k, v] of Object.entries(a.vis)) {
        if (k === 'rise') { if (v !== true) err.push(`${q}: vis.rise sólo puede ser true`); continue; }
        if (!R.VIS[k]) err.push(`${q}: vis.${k} no existe (${Object.keys(R.VIS).join(', ')}, rise)`);
        else if (!R.VIS[k].includes(v)) err.push(`${q}: vis.${k} = ${v} no se dibuja (${R.VIS[k].join(', ')})`);
      }
    }
  }
  // variocolor, imagen, fuentes y ficha
  const V = p.variocolor;
  req(V && typeof V.descripcion === 'string' && Array.isArray(V.reglas) && V.reglas.length >= 1, 'variocolor: { descripcion, reglas: [...] }');
  if (V && Array.isArray(V.reglas)) for (const [i, r] of V.reglas.entries()) {
    const si = r && r.si, a = r && r.a;
    const rango = (x, lo, hi) => Array.isArray(x) && x.length === 2 && x.every(n => typeof n === 'number' && n >= lo && n <= hi);
    if (!si || !a) { err.push(`variocolor.reglas[${i}]: { si: {h?, s?, v?}, a: {h?, s?, v?} }`); continue; }
    if (si.h !== undefined && !rango(si.h, 0, 360)) err.push(`variocolor.reglas[${i}].si.h: [desde, hasta] en grados (0-360; si desde > hasta, da la vuelta por el 0)`);
    for (const k of ['s', 'v']) if (si[k] !== undefined && !rango(si[k], 0, 1)) err.push(`variocolor.reglas[${i}].si.${k}: [mín, máx] entre 0 y 1`);
    if (a.h !== undefined && !(typeof a.h === 'number' && a.h >= 0 && a.h <= 360)) err.push(`variocolor.reglas[${i}].a.h: el tono nuevo en grados`);
    for (const k of ['s', 'v']) if (a[k] !== undefined && !(typeof a[k] === 'number' && a[k] >= 0 && a[k] <= 2)) err.push(`variocolor.reglas[${i}].a.${k}: multiplicador (0-2)`);
  }
  const S = p.sprite;
  req(S && typeof S.prompt === 'string' && S.prompt.length >= 80 && /[a-z]/i.test(S.prompt), 'sprite.prompt: la descripción en inglés para FLUX (80+ letras)');
  req(S && Array.isArray(S.rasgos) && S.rasgos.length >= 4, 'sprite.rasgos: 4+ rasgos que tiene que tener el sprite para reconocerlo (para la revisión)');
  req(S && Array.isArray(S.paleta) && S.paleta.length >= 3 && S.paleta.every(c => /^#[0-9a-fA-F]{6}$/.test(c)), 'sprite.paleta: 3+ colores #rrggbb de su diseño');
  req(Array.isArray(p.fuentes) && p.fuentes.length >= 3 && p.fuentes.every(f => /^https?:\/\//.test(f.url || '') && f.titulo), 'fuentes: 3+ { url, titulo, consulta }');
  req(typeof p.ficha_md === 'string' && p.ficha_md.length >= 2500 && /### Quién es/.test(p.ficha_md) && /### Ataques/.test(p.ficha_md) && /### Fuentes/.test(p.ficha_md),
    'ficha_md: la ficha completa en Markdown (2.500+ letras) con «### Quién es», «### Tipos…», «### Estadísticas…», «### Ataques», «### Variocolor» y «### Fuentes»');
  return { err, aviso, p };
}

const arg = process.argv[2];
const claves = arg === 'todos' ? ROSTER.personajes.map(p => p.clave) : [arg];
let mal = 0;
for (const c of claves) {
  const { err, aviso, p } = validar(c);
  console.log(`== ${c}: ${err.length ? err.length + ' errores' : 'bien'}${aviso.length ? ', ' + aviso.length + ' avisos' : ''}`);
  for (const e of err) console.log('  ERROR ' + e);
  for (const a of aviso) console.log('  aviso ' + a);
  if (p && Array.isArray(p.ataques)) for (const a of p.ataques) if (a._medida) console.log(`  · ${a.id} (${a.kind}): ${a._medida}`);
  if (err.length) mal++;
}
process.exit(mal ? 1 : 0);
