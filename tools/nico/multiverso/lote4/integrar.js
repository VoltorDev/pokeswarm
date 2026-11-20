/* ============ lote4/integrar.js — mete las propuestas del cuarto lote en el juego ============
 *   node tools/nico/multiverso/lote4/integrar.js [--prueba]                    las 14 (todas tienen que pasar validar.js)
 *   node tools/nico/multiverso/lote4/integrar.js --solo goku[,mario…] [--prueba]  ésas, más las que ya estaban integradas
 *   node tools/nico/multiverso/lote4/integrar.js --disponibles [--prueba]       las que haya en propuestas/ y pasen validar.js
 *
 * Modos (20-11-2026, para meter a Goku antes que los otros 13): el bloque entre marcas se rehace siempre entero y en el
 * orden de roster.json, así que con --solo las ya integradas (las que hay en el bloque de multiverso.js) se conservan, y
 * cuando lleguen las demás, otra pasada (--solo, --disponibles o la de las 14) deja lo mismo que si hubieran entrado
 * juntas. Con --disponibles, las que no pasan validar.js se saltan (y se dice cuáles); una ya integrada que deje de
 * pasarlo para la integración entera, para no quitarla en silencio.
 *
 * Formas («formas» de la propuesta, como Goku -> Goku Kaio-ken -> Goku Super Saiyan): evoluciones de especie que sólo se
 * alcanzan en la partida. Cada una, una entrada más de PERSONAJES tras la base, con `formaDe` (la forma anterior), `nivel`
 * (el real: en partida, ×0,5) y el mismo `pool` y `start` que la base; multiverso.js las deja fuera de G.DEX (ni banner ni
 * colección) y las engancha a G.EVO / G.EVO_NIVEL. Su inglés en lang-en-mod.js, su mención en la tabla de FICHAS.md y su
 * entrada en PJ de montar.py (clave de CLAVE_FORMA, la carpeta de sus fuentes; variocolor por reglas).
 *
 * Lee lote4/propuestas/<clave>.json y escribe, entre marcas <lote4> … </lote4> (así se puede repetir sin duplicar nada):
 *   js/data/multiverso.js       PERSONAJES y ATAQUES (con el comentario de daño nominal frente a un ataque Pokémon de su forma)
 *   js/data/lang-en-mod.js      el inglés: nombres de ataque, descripciones, evoluciones y el nombre si cambia
 *   tools/nico/check.js         la LISTA de §24, los recuentos, los que se llaman igual en inglés y los que flotan
 *   tools/nico/multiverso/FICHAS.md     «# Cuarto lote» con la tabla y las 14 fichas
 *   tools/nico/multiverso/montar.py     su entrada en PJ (dex, cómo se mueve, disparo y variocolor por reglas)
 * Con --prueba no escribe nada: dice lo que haría. CREDITS.md y CLAUDE.md se tocan aparte (llevan texto que se revisa).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ARGS = process.argv.slice(2);
const PRUEBA = ARGS.includes('--prueba');
const DISPONIBLES = ARGS.includes('--disponibles');
const SOLO = ARGS.includes('--solo') ? String(ARGS[ARGS.indexOf('--solo') + 1] || '').split(',').map(x => x.trim()).filter(Boolean) : null;
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const wr = (f, s) => { if (!PRUEBA) fs.writeFileSync(path.join(ROOT, f), s); console.log((PRUEBA ? '(prueba) ' : '') + 'escrito ' + f); };
const ROSTER = JSON.parse(fs.readFileSync(path.join(__dirname, 'roster.json'), 'utf8')).personajes;

// La carpeta de fuentes (y la entrada de PJ en montar.py) de cada forma: la que usa el agente de los sprites
// (lote4/trabajo/goku-kaioken, goku-ssj). Una forma que no esté aquí usa «<clave>-<dex>» (y se avisa).
const CLAVE_FORMA = { 10030: 'goku-kaioken', 10031: 'goku-ssj' };
const claveForma = (p, f) => CLAVE_FORMA[f.dex] || (console.log(`AVISO: forma ${f.dex} sin clave en CLAVE_FORMA: uso ${p.clave}-${f.dex}`), p.clave + '-' + f.dex);

const valida = clave => {
  try { execFileSync(process.execPath, [path.join(__dirname, 'validar.js'), clave], { stdio: 'pipe' }); return { ok: true }; }
  catch (e) { return { ok: false, salida: String(e.stdout || e.message) }; }
};
const existe = clave => fs.existsSync(path.join(__dirname, 'propuestas', clave + '.json'));
// Las ya integradas: los números de las entradas base (las que no llevan formaDe) del bloque <lote4> de multiverso.js.
const YA = (() => {
  const m = /\/\/ <lote4>[\s\S]*?\/\/ <\/lote4>/.exec(rd('js/data/multiverso.js'));
  if (!m) return [];
  const dex = new Set(m[0].split(/\n(?= {4}\{ dex: )/).filter(e => /^ {4}\{ dex: \d+/.test(e) && !/formaDe:/.test(e)).map(e => +/dex: (\d+)/.exec(e)[1]));
  return ROSTER.filter(r => dex.has(r.dex)).map(r => r.clave);
})();
let CLAVES;
if (SOLO) {
  const raras = SOLO.filter(c => !ROSTER.some(r => r.clave === c));
  if (!SOLO.length || raras.length) { console.error('--solo: claves de roster.json separadas por comas' + (raras.length ? ' (desconocidas: ' + raras.join(', ') + ')' : '')); process.exit(1); }
  CLAVES = ROSTER.map(r => r.clave).filter(c => SOLO.includes(c) || YA.includes(c));
  const mal = CLAVES.filter(c => !existe(c) || !valida(c).ok);
  if (mal.length) {
    for (const c of mal) console.error(existe(c) ? valida(c).salida : `== ${c}: falta propuestas/${c}.json`);
    console.error('No pasan validar.js: ' + mal.join(', ') + '. No integro nada.');
    process.exit(1);
  }
} else if (DISPONIBLES) {
  CLAVES = [];
  for (const r of ROSTER) {
    if (!existe(r.clave)) {
      if (YA.includes(r.clave)) { console.error(`${r.clave} está integrada pero falta su propuesta: no integro nada.`); process.exit(1); }
      continue;
    }
    const v = valida(r.clave);
    if (v.ok) CLAVES.push(r.clave);
    else if (YA.includes(r.clave)) { console.error(v.salida + `\n${r.clave} ya está integrada y ahora no pasa validar.js: no integro nada (no la quito en silencio).`); process.exit(1); }
    else console.log(`se salta ${r.clave}: no pasa validar.js (node tools/nico/multiverso/lote4/validar.js ${r.clave})`);
  }
} else {
  try { execFileSync(process.execPath, [path.join(__dirname, 'validar.js'), 'todos'], { stdio: 'pipe' }); }
  catch (e) { console.error(String(e.stdout || '') + '\nHay propuestas que no pasan validar.js: no integro nada (para integrar sólo algunas: --solo <clave> o --disponibles).'); process.exit(1); }
  CLAVES = ROSTER.map(r => r.clave);
}
if (!CLAVES.length) { console.error('Ninguna propuesta que integrar.'); process.exit(1); }
console.log('Integro (orden de roster.json): ' + CLAVES.join(', ') + (YA.length ? ' · ya estaban: ' + YA.join(', ') : ''));
// El variocolor corregido al revisar los sprites (lote4/sprites/<clave>.json, «vario») gana al de la propuesta.
const leerVario = (clave, V) => {
  const sp = path.join(__dirname, 'sprites', clave + '.json');
  if (fs.existsSync(sp)) { const x = JSON.parse(fs.readFileSync(sp, 'utf8')); if (Array.isArray(x.vario) && x.vario.length) V.reglas = x.vario; }
};
// Lo que el agente de los sprites añade a la entrada de PJ («propias», «limpias»…), en lote4/sprites/<clave>.json, «pj».
// Así, volver a pasar integrar.js no lo borra.
const leerPj = clave => {
  const sp = path.join(__dirname, 'sprites', clave + '.json');
  const x = fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : null;
  return x && x.pj && typeof x.pj === 'object' ? x.pj : {};
};
const P = CLAVES.map(clave => {
  const p = JSON.parse(fs.readFileSync(path.join(__dirname, 'propuestas', clave + '.json'), 'utf8'));
  leerVario(clave, p.variocolor);
  p.formas = Array.isArray(p.formas) ? p.formas : [];
  for (const f of p.formas) { f.clave = claveForma(p, f); leerVario(f.clave, f.variocolor); }
  return p;
});

const TIPO_ES = { normal: 'Normal', fire: 'Fuego', water: 'Agua', grass: 'Planta', electric: 'Eléctrico', ice: 'Hielo', fighting: 'Lucha',
  poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón',
  dark: 'Siniestro', steel: 'Acero', fairy: 'Hada' };
const NEED_ES = { hp: 'Vigor', atk: 'Potencia', spd: 'Carrera', cd: 'Reflejos', def: 'Coraza', rgn: 'Síntesis', mag: 'Imán', xp: 'Aprendizaje' };
const KIND_ES = { projectile: 'proyectil', melee: 'golpe', cone: 'abanico', dash: 'embestida', meteor: 'meteoro', orbit: 'orbe', buff: 'potenciador',
  beam: 'rayo', aura: 'aura', boomerang: 'bumerán', mine: 'mina', nova: 'nova', chain: 'cadena', turret: 'torreta', trail: 'rastro' };
const num = x => String(Math.round(x * 10) / 10).replace('.', ',') + (Number.isInteger(Math.round(x * 10) / 10) ? ',0' : '');
const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const lit = v => typeof v === 'string' ? q(v) : Array.isArray(v) ? '[' + v.map(lit).join(', ') + ']'
  : v && typeof v === 'object' ? '{ ' + Object.entries(v).map(([k, x]) => k + ': ' + lit(x)).join(', ') + ' }' : String(v);

// Los ataques Pokémon de upstream, para el comentario de cada ataque (el de su forma con el daño nominal más cercano).
const sin = (() => {
  const c = { console }; c.window = c; c.G = {}; vm.createContext(c);
  for (const f of ['js/core/util.js', 'js/core/mods.js', 'js/data/pokedex.js', 'js/data/sprites-meta.js', 'js/data/evolutions.js', 'js/core/sprites.js', 'js/data/moves.js'])
    vm.runInContext(rd(f), c, { filename: f });
  return c.G;
})();
const nominal = m => m.dmg * (m.count || 1) / m.cd;
function comentario(a) {
  if (a.kind === 'buff') {
    const b = sin.Moves.ALL.find(m => m.kind === 'buff' && m.stat === a.stat && m.amount === a.amount && m.stacks === a.stacks && m.dur === a.dur && m.cd === a.cd);
    return '// los números de ' + (b ? b.name : '?');
  }
  const n = nominal(a);
  const misma = sin.Moves.ALL.filter(m => m.kind === a.kind && isFinite(nominal(m))).sort((x, y) => Math.abs(nominal(x) - n) - Math.abs(nominal(y) - n));
  return '// ' + num(n) + (misma[0] ? ` (${misma[0].name} ${num(nominal(misma[0]))})` : '');
}

// ---------------- multiverso.js ----------------
function bloqueAtaque(a) {
  const cab = `    { id: ${q(a.id)}, name: ${q(a.name)}, type: ${q(a.type)}, kind: ${q(a.kind)},`;
  const nums = Object.entries(a).filter(([k]) => !['id', 'name', 'nameEn', 'type', 'kind', 'desc', 'descEn', 'evo', 'evoEn', 'vis', 'nota', '_medida'].includes(k))
    .map(([k, v]) => k + ': ' + lit(v));
  if (a.vis) nums.push('vis: ' + lit(a.vis));
  const pie = a.evo ? `      ${nums.join(', ')},\n      evo: ${lit(a.evo)} },` : `      ${nums.join(', ')} },`;
  return `${cab.padEnd(88)} ${comentario(a)}\n      desc: ${q(a.desc)},\n${pie}`;
}
function marcar(src, abre, cierra, cuerpo, insertar) {
  const i = src.indexOf(abre), j = src.indexOf(cierra);
  if (i >= 0 && j > i) return src.slice(0, i) + abre + '\n' + cuerpo + cierra + src.slice(j + cierra.length);
  return insertar(src, abre + '\n' + cuerpo + cierra);
}
{
  let s = rd('js/data/multiverso.js');
  const pool = p => lit(p.ataques.map(a => a.id));
  const pers = P.map(p => `    { dex: ${p.dex}, name: ${q(p.nombre)}, types: ${lit(p.types)}, hp: ${p.hp}, spd: ${p.spd}, atk: ${p.atk}, rarity: 2, bst: ${p.bst},\n` +
    `      starter: false, gen: GEN, mv: true, start: ${q(p.ataques[0].id)}, serie: ${q(p.serie)},\n` +
    `      pool: ${pool(p)} },\n` +
    p.formas.map((f, i) => `    // forma de ${p.nombre}: sólo evolucionando en la partida (G.EVO desde aquí); ni banner, ni colección, ni de enemigo\n` +
      `    { dex: ${f.dex}, name: ${q(f.nombre)}, types: ${lit(f.types)}, hp: ${f.hp}, spd: ${f.spd}, atk: ${f.atk}, rarity: ${f.rarity}, bst: ${f.bst},${f.leg ? ' leg: true,' : ''}\n` +
      `      starter: false, gen: GEN, mv: true, start: ${q(p.ataques[0].id)}, serie: ${q(p.serie)}, formaDe: ${i ? p.formas[i - 1].dex : p.dex}, nivel: ${f.nivel},\n` +
      `      pool: ${pool(p)} },\n`).join('')).join('');
  s = marcar(s, '    // <lote4> Cuarto lote (14-11-2026; elegido por Nico; fichas en tools/nico/multiverso/FICHAS.md, datos en tools/nico/multiverso/lote4/)',
    '    // </lote4>', pers, (src, bloque) => {
      const k = src.indexOf('  const ATAQUES = [');
      const fin = src.lastIndexOf('\n  ];', k);
      const antes = src.slice(0, fin).replace(/\s*$/, '');
      return antes + (antes.endsWith(',') ? '' : ',') + '\n' + bloque + src.slice(fin);
    });
  const atq = P.map(p => `    // ---- ${p.nombre} (${p.saga}) ----\n` + p.ataques.map(bloqueAtaque).join('\n') + '\n').join('');
  s = marcar(s, '    // <lote4-ataques> Cuarto lote (14-11-2026)', '    // </lote4-ataques>', atq, (src, bloque) => {
    const k = src.indexOf('  // Geometría de las hojas');
    const fin = src.lastIndexOf('\n  ];', k);
    const antes = src.slice(0, fin).replace(/\s*$/, '');
    return antes + (antes.endsWith(',') ? '' : ',') + '\n' + bloque + src.slice(fin);
  });
  wr('js/data/multiverso.js', s);
}

// ---------------- lang-en-mod.js ----------------
{
  let s = rd('js/data/lang-en-mod.js');
  const fuera = s.replace(/  \/\/ <lote4>[\s\S]*?  \/\/ <\/lote4>\n/, '');
  const pares = [];
  const ya = new Map();
  for (const m of fuera.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)'/gm)) ya.set(m[1].replace(/\\'/g, "'"), m[2].replace(/\\'/g, "'"));
  const conflictos = [];
  const poner = (es, en) => {
    if (!es || !en || es === en) return;
    if (ya.has(es)) { if (ya.get(es) !== en) conflictos.push(`${es}: ya traducido como «${ya.get(es)}», la propuesta dice «${en}»`); return; }
    if (pares.some(([e]) => e === es)) return;
    pares.push([es, en]);
  };
  for (const p of P) {
    poner(p.nombre, p.nombreEn);
    for (const f of p.formas) poner(f.nombre, f.nombreEn);
    for (const a of p.ataques) { poner(a.name, a.nameEn); poner(a.desc, a.descEn); if (a.evo) poner(a.evo[0], a.evoEn); }
  }
  if (conflictos.length) console.log('AVISO: traducciones que ya existen con otro texto (se queda la que había):\n  ' + conflictos.join('\n  '));
  const cuerpo = '  // Cuarto lote (14-11-2026): los nombres propios que son iguales en inglés no se repiten aquí.\n' +
    pares.map(([es, en]) => `  ${q(es)}: ${q(en)},`).join('\n') + '\n';
  s = marcar(s, '  // <lote4>', '  // </lote4>\n', cuerpo, (src, bloque) => {
    const k = src.indexOf('  // Sugerencias y fallos (js/ui/sugerencias.js)');
    return src.slice(0, k) + bloque + src.slice(k);
  });
  wr('js/data/lang-en-mod.js', s);
}

// ---------------- check.js (§24) ----------------
{
  let s = rd('tools/nico/check.js');
  const lista = P.map(p => `      ${p.dex}: [` + p.ataques.map(a => '[' + [a.id, a.name, a.kind, a.type].concat(a.evo ? [a.evo[0], a.evo[1]] : []).map(q).join(', ') + ']').join(',\n        ') + '],\n').join('');
  s = marcar(s, '      // <lote4> Cuarto lote (14-11-2026; tools/nico/multiverso/lote4/): sin hojas aún no se cargan; se miran en MULTIVERSO.PERSONAJES.',
    '      // </lote4>', lista, (src, bloque) => {
      const ancla = "['a-toda-velocidad', '¡A toda velocidad!', 'buff', 'normal']]";
      const k = src.indexOf(ancla);
      if (k < 0) throw new Error('No encuentro el final de LISTA en check.js');
      return src.slice(0, k + ancla.length) + ',\n' + bloque + src.slice(k + ancla.length);
    });
  // Recuentos: 15 personajes con lista + 14; ataques y evoluciones, con los del lote.
  const base = { pers: 15, atq: 116, evo: 101 };
  const n = { pers: base.pers + P.length, atq: base.atq + P.reduce((x, p) => x + p.ataques.length, 0), evo: base.evo + P.reduce((x, p) => x + p.ataques.filter(a => a.evo).length, 0) };
  s = s.replace(/Object\.keys\(LISTA\)\.length === \d+ && MV\.ATAQUES\.length === \d+/, `Object.keys(LISTA).length === ${n.pers} && MV.ATAQUES.length === ${n.atq}`)
    .replace(/nuevos\.length === \d+ && !enPool\.length/, `nuevos.length === ${n.atq} && !enPool.length`)
    .replace(/nuevos\.filter\(id => G\.Moves\.EVO\[id\]\)\.length === \d+ && !evos\.length/, `nuevos.filter(id => G.Moves.EVO[id]).length === ${n.evo} && !evos.length`);
  // Los que se llaman igual en inglés.
  const iguales = [];
  for (const p of P) for (const a of p.ataques) {
    if (a.nameEn === a.name) iguales.push(a.name);
    if (a.evo && a.evoEn === a.evo[0]) iguales.push(a.evo[0]);
    if (a.evo && a.nameEn === a.name && a.evoEn === a.evo[0]) iguales.push(a.name + ' → ' + a.evo[0]);
  }
  const ig = [...new Set(iguales)];
  s = s.replace(/(const IGUALES = new Set\(\[[\s\S]*?)(\]\);)/, (m, a, b) => {
    const sinLote = a.replace(/,\s*\/\* lote4 \*\/[\s\S]*$/, '');
    return sinLote + (ig.length ? ',\n      /* lote4 */ ' + ig.map(q).join(', ') : '') + b;
  });
  // Los que flotan.
  const flotan = P.filter(p => p.mov === 'flota').map(p => p.dex);
  s = s.replace(/const FLOTAN = \[[^\]]*\];[^\n]*/, `const FLOTAN = [10003, 10008, 10010${flotan.length ? ', ' + flotan.join(', ') : ''}];   // el Cacodemonio, Blinky y el Ojo de Cthulhu${flotan.length ? ' y del cuarto lote ' + P.filter(p => p.mov === 'flota').map(p => p.nombre).join(', ') : ''} (Drácula se desliza por el suelo)`);
  wr('tools/nico/check.js', s);
  console.log(`check.js: ${n.pers} personajes con lista, ${n.atq} ataques, ${n.evo} que evolucionan, ${ig.length} nombres iguales en inglés, flotan: ${flotan.join(', ') || 'ninguno'}`);
}

// ---------------- FICHAS.md ----------------
{
  let s = rd('tools/nico/multiverso/FICHAS.md');
  const tabla = '| N.º | Personaje | Saga | Tipos | Vida / velocidad / ataque | Ataque inicial |\n|---|---|---|---|---|---|\n' +
    P.map(p => `| ${p.dex} | ${p.nombre}${p.formas.length ? ' (en la partida evoluciona en ' + p.formas.map(f => `${f.nombre}, ${f.dex}`).join(', y en ') + ')' : ''} | ${p.saga} | ${p.types.map(t => TIPO_ES[t]).join(' / ')} | ${p.hp} / ${p.spd} / ×${String(p.atk).replace('.', ',')} | ${p.ataques[0].name} |`).join('\n');
  const cuerpo = '# Cuarto lote (14-11-2026)\n\n' +
    'Petición de Nico (14-11-2026): «empieza a dejar los 13 personajes preparados», los del punto 21 de PLAN.md, con Scorpion y Sub-Zero los dos (14). ' +
    'Cada ficha la escribió un agente estudiando su saga; otro la verificó buscándole fallos (fidelidad al universo y diseño de juego) y un tercero aplicó lo confirmado; ' +
    'al final, un crítico miró el plantel entero (reparto de tipos, mecánicas repetidas, rivales). Los datos de cada uno están en `lote4/propuestas/<clave>.json` ' +
    '(con su descripción para la imagen y el variocolor), comprobados por `lote4/validar.js` con los mismos rangos que `check.js` §24.\n\n' +
    (P.length < ROSTER.length ? `Integrados en el juego hasta ahora (\`lote4/integrar.js\`): ${P.length} de ${ROSTER.length}, ${P.map(p => p.nombre).join(', ')}.\n\n` : '') + tabla + '\n\n' +
    P.map(p => p.ficha_md.trim() + '\n').join('\n');
  s = marcar(s, '<!-- lote4 -->', '<!-- /lote4 -->\n', cuerpo, (src, bloque) => src.replace(/\s*$/, '\n\n') + bloque);
  wr('tools/nico/multiverso/FICHAS.md', s);
}

// ---------------- montar.py ----------------
{
  let s = rd('tools/nico/multiverso/montar.py');
  const py = v => v === true ? 'True' : v === false ? 'False' : Array.isArray(v) ? '[' + v.map(py).join(', ') + ']'
    : v && typeof v === 'object' ? '{' + Object.entries(v).map(([k, x]) => `'${k}': ${py(x)}`).join(', ') + '}' : typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : String(v);
  const helper = `def vario_reglas(reglas):
    """Variocolor por reglas (cuarto lote, lote4/propuestas/<clave>.json): cada regla dice qué colores cambia (por tono en
    grados, saturación y valor; un tono «desde > hasta» da la vuelta por el 0) y a qué (tono nuevo en grados; saturación y
    valor, multiplicados). Se aplica la primera regla que encaja; si ninguna, el color se queda."""
    def f(c):
        h, s, v = hsv(c)
        for r in reglas:
            si, a = r['si'], r['a']
            if 'h' in si:
                lo, hi = si['h'][0] / 360, si['h'][1] / 360
                if not (lo <= h <= hi if lo <= hi else (h >= lo or h <= hi)):
                    continue
            if 's' in si and not (si['s'][0] <= s <= si['s'][1]):
                continue
            if 'v' in si and not (si['v'][0] <= v <= si['v'][1]):
                continue
            return rgb(a['h'] / 360 if 'h' in a else h, s * a.get('s', 1), v * a.get('v', 1))
        return c
    return f

`;
  if (!s.includes('def vario_reglas(')) s = s.replace('# mov: \'anda\'', helper + '# mov: \'anda\'');
  const extra = clave => Object.entries(leerPj(clave)).map(([k, v]) => `,
                '${k}': ${py(v)}`).join('');
  const entradas = P.map(p => `    '${p.clave}': {'dex': ${p.dex}, 'mov': '${p.mov}', 'sombra': 1, 'disparo': ${p.disparo},   # ${p.nombre}: ${p.variocolor.descripcion.replace(/\n/g, ' ').slice(0, 90)}\n` +
    `                'vario': vario_reglas(${py(p.variocolor.reglas)})${extra(p.clave)}},\n` +
    p.formas.map(f => `    '${f.clave}': {'dex': ${f.dex}, 'mov': '${f.mov}', 'sombra': 1, 'disparo': ${f.disparo},   # ${f.nombre} (forma de ${p.nombre}): ${f.variocolor.descripcion.replace(/\n/g, ' ').slice(0, 70)}\n` +
      `                'vario': vario_reglas(${py(f.variocolor.reglas)})${extra(f.clave)}},\n`).join('')).join('');
  s = marcar(s, '    # <lote4> Cuarto lote (14-11-2026): imagen de FLUX -> TRELLIS.2 -> rotar3d.py -> pixelar.py, pasos de pasos.py', '    # </lote4>', entradas, (src, bloque) => {
    const k = src.indexOf("    'ash':     {'dex': 10013");
    const fin = src.indexOf('\n}', k);
    return src.slice(0, fin) + '\n' + bloque + src.slice(fin);
  });
  wr('tools/nico/multiverso/montar.py', s);
}
console.log('Hecho. Ahora: node tools/build.js --privado && node tools/nico/check.js');
