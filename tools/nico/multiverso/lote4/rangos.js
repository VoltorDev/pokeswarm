/* ============ lote4/rangos.js — lo que necesita saber quien diseña los ataques del cuarto lote ============
 *   node tools/nico/multiverso/lote4/rangos.js        escribe lote4/rangos.json y lote4/RANGOS.md
 *
 * Carga los ficheros reales del juego en node:vm (como check.js §24) y saca:
 * - por cada forma (kind) de los ataques Pokémon de upstream: el rango de daño nominal (dmg × count ÷ cd) y de alcance
 *   (speed × life en projectile, cone y nova; range en turret; radius en las demás), con los campos que usa la forma
 *   y un ejemplo real; check.js §24 exige que cada ataque del Multiverso caiga dentro de esos rangos;
 * - los potenciadores (buff) de upstream: un potenciador del Multiverso debe copiar los números de uno de ellos;
 * - los valores de `vis` que el juego ya sabe dibujar (vfx.js), los códigos de lo que pide una evolución (NEED_NAME);
 * - los ids y nombres de ataque ya usados (de Pokémon y del Multiverso: no se pueden repetir) y los tipos de los
 *   personajes del Multiverso que ya hay.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const BASE = ['js/core/util.js', 'js/core/mods.js', 'js/data/pokedex.js', 'js/data/sprites-meta.js', 'js/data/evolutions.js', 'js/core/sprites.js', 'js/data/moves.js'];

function montar(con) {
  const c = { console }; c.window = c; c.G = {}; vm.createContext(c);
  // Sin lo que integrar.js ya metió del cuarto lote (entre <lote4> y </lote4>, <lote4-ataques> y </lote4-ataques>): si no,
  // tras integrar, sus ids y nombres saldrían como «ya usados» y validar.js rechazaría repetir la integración.
  const sinLote = s => s.replace(/ *\/\/ <lote4(-ataques)?>[\s\S]*?\/\/ <\/lote4(-ataques)?>\n?/g, '');
  for (const f of [...BASE, ...(con ? ['js/data/multiverso.js'] : [])]) vm.runInContext(f === 'js/data/multiverso.js' ? sinLote(rd(f)) : rd(f), c, { filename: f });
  return c.G;
}

const sin = montar(false), con = montar(true);
const nominal = m => m.dmg * (m.count || 1) / m.cd;
const alcance = m => ['projectile', 'cone', 'nova'].includes(m.kind) ? m.speed * m.life : m.kind === 'turret' ? m.range : m.radius;
const r1 = x => Math.round(x * 10) / 10;

const formas = {};
for (const m of sin.Moves.ALL) {
  if (!m.kind || m.kind === 'buff') continue;
  const f = formas[m.kind] = formas[m.kind] || { kind: m.kind, n: 0, dano: [Infinity, -Infinity], alcance: [Infinity, -Infinity], campos: new Set(), ejemplos: [] };
  f.n++;
  const d = nominal(m), a = alcance(m);
  if (isFinite(d)) { f.dano[0] = Math.min(f.dano[0], d); f.dano[1] = Math.max(f.dano[1], d); }
  if (isFinite(a)) { f.alcance[0] = Math.min(f.alcance[0], a); f.alcance[1] = Math.max(f.alcance[1], a); }
  for (const k of Object.keys(m)) if (!['id', 'name', 'type', 'kind', 'desc', 'ups', 'maxLvl', 'evo'].includes(k)) f.campos.add(k);
  if (f.ejemplos.length < 4) {
    const e = {}; for (const [k, v] of Object.entries(m)) if (!['ups', 'maxLvl', 'desc'].includes(k)) e[k] = v;
    f.ejemplos.push(Object.assign(e, { _nominal: r1(d), _alcance: r1(a) }));
  }
}
for (const f of Object.values(formas)) { f.campos = [...f.campos].sort(); f.dano = f.dano.map(r1); f.alcance = f.alcance.map(r1); }

const buffs = sin.Moves.ALL.filter(m => m.kind === 'buff').map(m => ({ id: m.id, name: m.name, stat: m.stat, amount: m.amount, stacks: m.stacks, dur: m.dur, cd: m.cd }));
const firmas = [...new Map(buffs.map(b => [[b.stat, b.amount, b.stacks, b.dur, b.cd].join('|'), b])).values()];

// Los `vis` que ya se dibujan: las formas de proyectil (SHAPES de vfx.js) y lo que ya usan MOVE de vfx.js y el Multiverso.
const vfx = rd('js/entities/vfx.js');
const shapes = (() => {
  const i = vfx.indexOf('const SHAPES = {'), cuerpo = vfx.slice(i, vfx.indexOf('\n  };', i));
  return [...cuerpo.matchAll(/^    ([a-z]+): \{/gm)].map(x => x[1]);
})();
const vis = { proj: new Set(shapes), melee: new Set(), beam: new Set(), aura: new Set(), trail: new Set(), buff: new Set(), pal: new Set(Object.keys(sin.Moves.POOL || {})) };
for (const txt of [vfx, rd('js/data/multiverso.js')]) {
  for (const k of ['melee', 'beam', 'aura', 'trail', 'buff', 'pal']) for (const x of txt.matchAll(new RegExp(k + ": '([a-z]+)'", 'g'))) vis[k].add(x[1]);
}
const tipos = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
vis.pal = new Set([...vis.pal].filter(p => tipos.includes(p)).concat(tipos));
const VIS = Object.fromEntries(Object.entries(vis).map(([k, s]) => [k, [...s].sort()]));

const usados = con.Moves.ALL.map(m => ({ id: m.id, name: m.name }));
const evoNombres = Object.values(con.Moves.EVO).map(e => e[0]);
const mv = con.MULTIVERSO.PERSONAJES.map(p => ({ dex: p.dex, name: p.name, types: p.types, hp: p.hp, spd: p.spd, atk: p.atk, serie: p.serie }));

const salida = { generado: 'node tools/nico/multiverso/lote4/rangos.js', formas, buffs: firmas, VIS, NEED: con.Moves.NEED_NAME, tipos,
  idsUsados: usados.map(u => u.id), nombresUsados: [...new Set(usados.map(u => u.name).concat(evoNombres))], multiverso: mv };
fs.writeFileSync(path.join(__dirname, 'rangos.json'), JSON.stringify(salida, null, 1) + '\n');

let md = '# Rangos del cuarto lote (generado por `node tools/nico/multiverso/lote4/rangos.js`)\n\n';
md += 'Daño nominal = dmg × count ÷ cd. Alcance = speed × life (projectile, cone, nova), range (turret) o radius (el resto).\n';
md += 'Cada ataque debe caer DENTRO de ambos rangos de su forma (check.js §24). Los cuerpo a cuerpo de los Pokémon ya llevan el +20 % de daño y +25 % de alcance.\n\n';
md += '| Forma | Ataques | Daño nominal | Alcance | Campos que usa |\n|---|---|---|---|---|\n';
for (const f of Object.values(formas).sort((a, b) => a.kind.localeCompare(b.kind))) md += `| ${f.kind} | ${f.n} | ${f.dano[0]}–${f.dano[1]} | ${f.alcance[0]}–${f.alcance[1]} | ${f.campos.join(', ')} |\n`;
md += '\n## Potenciadores (buff): copia exacta de uno de estos (stat, amount, stacks, dur, cd)\n\n| Como | stat | amount | stacks | dur | cd |\n|---|---|---|---|---|---|\n';
for (const b of firmas) md += `| ${b.name} | ${b.stat} | ${b.amount} | ${b.stacks} | ${b.dur} | ${b.cd} |\n`;
md += '\n## `vis` que el juego ya dibuja\n\n' + Object.entries(VIS).map(([k, v]) => `- **${k}**: ${v.join(', ')}`).join('\n') + '\n';
md += '\n## Lo que pide una evolución (segundo elemento de `evo`)\n\n' + Object.entries(con.Moves.NEED_NAME).map(([k, v]) => `- \`${k}\` = ${v}`).join('\n') + '\n';
md += '\n## Personajes del Multiverso que ya hay\n\n| N.º | Nombre | Tipos | Vida / velocidad / ataque |\n|---|---|---|---|\n';
for (const p of mv) md += `| ${p.dex} | ${p.name} | ${p.types.join(' / ')} | ${p.hp} / ${p.spd} / ×${p.atk} |\n`;
md += '\n## Ejemplos reales por forma (de upstream, con su nominal y alcance)\n\n';
for (const f of Object.values(formas).sort((a, b) => a.kind.localeCompare(b.kind))) md += `### ${f.kind}\n\n` + f.ejemplos.map(e => '- `' + JSON.stringify(e) + '`').join('\n') + '\n\n';
fs.writeFileSync(path.join(__dirname, 'RANGOS.md'), md);
console.log(`rangos.json y RANGOS.md: ${Object.keys(formas).length} formas, ${firmas.length} potenciadores, ${usados.length} ataques ya usados`);
