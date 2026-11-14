/* ============ lote4/espia.js — lo que hace cada agente, en su tarjeta del tablero ============
 *   node tools/nico/multiverso/lote4/espia.js [segundos, 60 por defecto]
 *
 * Los agentes de los workflows del lote sólo apuntan su estado al empezar y al acabar cada paso, y un estudio de la saga
 * dura una hora: el tablero parecía parado. Esto mira cada minuto las transcripciones de los workflows de esta sesión
 * (subagents/workflows/wf_* de Claude Code), y por cada agente vivo («diseño:mario», «imagen:sonic»…) apunta con
 * estado.js lo último que ha hecho («Buscando en la web: «…»», «Comprobando los números»…) y cuántas búsquedas y
 * lecturas lleva. Sólo si cambia, y como mucho una vez por minuto por personaje. No apunta nada de un agente que ya ha
 * terminado (su último mensaje no pide herramientas).
 */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const WF = 'C:/Users/Nico/.claude/projects/C--Users-Nico-Desktop-Claude-pokeswarm/a74b40c3-f37b-447d-b949-008c40e844c7/subagents/workflows';
const CADA = Math.max(20, +(process.argv[2] || 60)) * 1000;
const ROSTER = JSON.parse(fs.readFileSync(path.join(__dirname, 'roster.json'), 'utf8')).personajes.map(p => p.clave);
const FASE = {   // etiqueta del agente -> [etapa del tablero, cómo se dice]
  'diseño': ['ficha', 'Diseño'], 'verifica': ['ficha', 'Verificación'], 'corrige': ['ficha', 'Corrección'], 'ajuste': ['ficha', 'Ajuste del plantel'],
  'imagen': ['imagen', 'Imagen base'], 'modelo': ['modelo', 'Modelo 3D'], 'sprites': ['rotaciones', 'Sprites'], 'juez': ['hojas', 'Revisión de sprites'],
  'revision': ['revision', 'Revisión'], 'revisa': ['revision', 'Revisión'], 'arregla': ['revision', 'Arreglos'] };
const ultimo = {};   // clave -> { texto, t }

function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'una web'; } }
function corto(s, n = 70) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function describir(b) {
  const i = b.input || {};
  if (b.name === 'WebSearch') return `Buscando en la web: «${corto(i.query, 60)}»`;
  if (b.name === 'WebFetch') return `Leyendo ${host(i.url)}`;
  if (b.name === 'Write' || b.name === 'Edit') return /propuestas/.test(i.file_path || '') ? 'Escribiendo la propuesta' : `Escribiendo ${path.basename(i.file_path || '')}`;
  if (b.name === 'Read') {
    const f = i.file_path || '';
    if (/\.(png|gif|jpe?g)$/i.test(f)) return `Mirando ${path.basename(f)}`;
    if (/FICHAS/.test(f)) return 'Leyendo las fichas de los personajes anteriores';
    if (/RANGOS/.test(f)) return 'Leyendo los rangos de equilibrio';
    if (/multiverso\.js/.test(f)) return 'Leyendo los datos de los otros personajes';
    return `Leyendo ${path.basename(f)}`;
  }
  const c = String(i.command || '');
  if (/validar\.js/.test(c)) return 'Comprobando los números con validar.js';
  if (/estado\.js/.test(c)) return null;
  if (/imagen\.py/.test(c)) return 'Generando imágenes base (Workers AI)';
  if (/fondo\.py/.test(c)) return 'Quitando el fondo';
  if (/malla\.ps1|3dgen/.test(c)) return 'Haciendo el modelo 3D (TRELLIS.2)';
  if (/animar3d|blender/i.test(c)) return 'Animando y renderizando en Blender';
  if (/pixelar\.py/.test(c)) return 'Bajando a pixel art';
  if (/montar\.py/.test(c)) return 'Montando la hoja de contacto';
  if (/playwright|e2e/i.test(c)) return 'Probándolo en el juego';
  if (b.name === 'Bash' || b.name === 'PowerShell') return 'Calculando y comprobando datos';
  if (b.name === 'Grep' || b.name === 'Glob') return 'Buscando en el código del juego';
  return null;
}

function mirar() {
  let wfs = [];
  try { wfs = fs.readdirSync(WF).filter(d => d.startsWith('wf_')).map(d => path.join(WF, d)); } catch (e) { return; }
  const ahora = Date.now();
  const porClave = {};
  for (const d of wfs) {
    let fich = [];
    try { fich = fs.readdirSync(d).filter(f => f.endsWith('.meta.json')); } catch (e) { continue; }
    for (const m of fich) {
      let meta;
      try { meta = JSON.parse(fs.readFileSync(path.join(d, m), 'utf8')); } catch (e) { continue; }
      const [fase, clave] = String(meta.description || '').split(':');
      if (!FASE[fase] || !ROSTER.includes(clave)) continue;
      const jl = path.join(d, m.replace('.meta.json', '.jsonl'));
      let st;
      try { st = fs.statSync(jl); } catch (e) { continue; }
      if (ahora - st.mtimeMs > 10 * 60 * 1000) continue;   // parado hace más de 10 min: terminado o muerto
      const lineas = fs.readFileSync(jl, 'utf8').trim().split('\n');
      let ult = null, vivo = false, busquedas = 0, lecturas = 0;
      for (let k = lineas.length - 1; k >= 0; k--) {
        let o; try { o = JSON.parse(lineas[k]); } catch (e) { continue; }
        const c = o.message && o.message.content;
        if (o.type !== 'assistant' || !Array.isArray(c)) continue;
        const usos = c.filter(b => b.type === 'tool_use');
        if (ult === null) { vivo = usos.length > 0; ult = usos; }
        for (const b of usos) { if (b.name === 'WebSearch') busquedas++; else if (b.name === 'WebFetch') lecturas++; }
      }
      if (!vivo || !ult) continue;
      let texto = null;
      for (const b of ult) { texto = describir(b) || texto; }
      if (!texto) continue;
      const cifras = busquedas + lecturas ? ` (${busquedas} búsquedas y ${lecturas} páginas leídas)` : '';
      const prev = porClave[clave];
      if (!prev || st.mtimeMs > prev.t) porClave[clave] = { etapa: FASE[fase][0], texto: `${FASE[fase][1]} · ${texto}${cifras}`, t: st.mtimeMs };
    }
  }
  for (const [clave, x] of Object.entries(porClave)) {
    const u = ultimo[clave];
    if (u && (u.texto === x.texto || ahora - u.t < 55 * 1000)) continue;
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'estado.js'), clave, x.etapa, 'en-curso', x.texto], { stdio: 'ignore' });
      ultimo[clave] = { texto: x.texto, t: ahora };
    } catch (e) { /* lo intentará en la siguiente vuelta */ }
  }
}
setInterval(mirar, CADA);
mirar();
