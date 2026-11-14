/* ============ tools/nico/votacion-reglas.js — reglas de la votación del siguiente personaje contra el emulador ============
 *   node tools/nico/votacion-reglas.js
 *
 * Arranca sólo el emulador de Firestore (puerto 8085, proyecto demo-ps, el JDK de ~/.cache/temurin-21, como
 * buzon-reglas.js) con firestore.rules tal cual y, por REST con tokens sin firmar, comprueba votaciones/{vid} y
 * votaciones/{vid}/votos/{uid} con las escrituras que hace js/ui/votacion.js (el voto y el contador juntos):
 * - una cuenta vota (también la primera, sin contador aún) y otras suman a la misma opción o a otra;
 * - no se puede votar dos veces, ni a nombre de otro, ni subir el contador sin voto, ni el voto sin contador, ni subir
 *   2, ni tocar otra opción, ni que el voto y el contador no coincidan, ni una opción con forma rara, ni la hora del
 *   cliente, ni campos de más, ni un invitado;
 * - el recuento lo lee cualquier cuenta (no un invitado); el voto, sólo su dueño; nadie lo cambia ni lo borra.
 * Y que las opciones de G.MODS.votacion tienen la forma que piden las reglas. Unos 20 s. Sale con 1 si algo falla.
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net'), vm = require('vm');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8085, PROJ = 'demo-ps';
const OUT = path.join(__dirname, 'out', 'votacion');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = [];
const t = (name, ok, det) => { res.push({ name, ok: !!ok }); console.log(`[${ok ? 'OK' : 'FALLO'}] ${name}${ok ? '' : ' :: ' + JSON.stringify(det).slice(0, 600)}`); };
const A = 'voto-prueba-a', B = 'voto-prueba-b', C = 'voto-prueba-c', D = 'voto-prueba-d';
const VID = 'prueba-1';

function findJdk() {
  if (process.env.PS_JDK) return process.env.PS_JDK;
  const base = path.join(os.homedir(), '.cache', 'temurin-21');
  const java = d => path.join(d, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (fs.existsSync(java(base))) return base;
  const sub = fs.existsSync(base) ? fs.readdirSync(base).map(n => path.join(base, n)).find(d => fs.existsSync(java(d))) : null;
  if (!sub) throw new Error('No encuentro el JDK 21 en ' + base + ' (o define PS_JDK).');
  return sub;
}
const portOpen = port => new Promise(r => {
  const s = net.connect({ host: '127.0.0.1', port });
  s.once('connect', () => { s.destroy(); r(true); });
  s.once('error', () => r(false));
  s.setTimeout(800, () => { s.destroy(); r(false); });
});
async function arrancar(dir) {
  if (await portOpen(PORT)) throw new Error(`El puerto ${PORT} está ocupado.`);
  const jdk = findJdk();
  const env = Object.assign({}, process.env, { JAVA_HOME: jdk, PATH: path.join(jdk, 'bin') + path.delimiter + process.env.PATH });
  const cli = require.resolve('firebase-tools/lib/bin/firebase.js');
  const child = spawn(process.execPath, [cli, 'emulators:start', '--project', PROJ, '--only', 'firestore', '--config', path.join(dir, 'firebase.json')],
    { cwd: OUT, env, windowsHide: true });
  let text = '', exited = null;
  child.stdout.on('data', d => { text += d; });
  child.stderr.on('data', d => { text += d; });
  child.on('exit', c => { exited = c; });
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (exited !== null) throw new Error('El emulador se cerró: ' + text.slice(-1500));
    if (/All emulators ready/i.test(text) && await portOpen(PORT)) return child;
    await sleep(400);
  }
  throw new Error('El emulador no arrancó: ' + text.slice(-1500));
}
function parar(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGINT');
  } catch (e) { /* ya cerrado */ }
}

// ---------------- REST ----------------
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(uid) {
  if (!uid) return null;
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ iss: 'https://securetoken.google.com/' + PROJ, aud: PROJ, auth_time: now, user_id: uid, sub: uid,
    iat: now, exp: now + 3600, firebase: { sign_in_provider: 'password', identities: {} } }) + '.';
}
const BASE = `http://127.0.0.1:${PORT}/v1/projects/${PROJ}/databases/(default)/documents`;
async function rest(metodo, url, uid, cuerpo) {
  const h = { 'Content-Type': 'application/json' };
  const tk = token(uid);
  if (tk) h.Authorization = 'Bearer ' + tk;
  const r = await fetch(url, { method: metodo, headers: h, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { /* vacío */ }
  return { status: r.status, j };
}

const DOCS = `projects/${PROJ}/databases/(default)/documents`;
const nombreRecuento = vid => `${DOCS}/votaciones/${vid}`;
const nombreVoto = (vid, uid) => `${DOCS}/votaciones/${vid}/votos/${uid}`;
const campo = k => /^[a-z_][a-z0-9_]*$/i.test(k) ? k : '`' + k + '`';
/** Lo que manda el SDK en la transacción de votacion.js: set({ c: { p: n } }, { merge: true }) en el recuento. */
const wRecuento = (vid, p, n, extra = {}) => ({ update: { name: nombreRecuento(vid),
  fields: Object.assign({ c: { mapValue: { fields: { [p]: { integerValue: String(n) } } } } }, extra) },
  updateMask: { fieldPaths: ['c.' + campo(p)].concat(Object.keys(extra)) } });
/** ...y set({ p, at: serverTimestamp() }) en el voto. */
function wVoto(vid, uid, p, { horaCliente = false, extra = {} } = {}) {
  const fields = Object.assign({ p: { stringValue: p } }, extra);
  if (horaCliente) fields.at = { timestampValue: new Date().toISOString() };
  const w = { update: { name: nombreVoto(vid, uid), fields } };
  if (!horaCliente) w.updateTransforms = [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }];
  return w;
}
const commit = (uid, writes) => rest('POST', `${BASE}:commit`, uid, { writes });
async function recuento() {
  const r = await rest('GET', `${BASE}/votaciones/${VID}`, A);
  const f = (r.j && r.j.fields && r.j.fields.c && r.j.fields.c.mapValue.fields) || {};
  return JSON.stringify(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, +v.integerValue]).sort()));
}

(async () => {
  // Las opciones del juego tienen la forma que piden las reglas.
  const c = { console }; c.window = c; c.G = {}; vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'core', 'mods.js'), 'utf8'), c);
  const v = c.G.MODS.votacion;
  t('G.MODS.votacion: id y opciones con la forma de firestore.rules, sin repetir', v && /^[a-z0-9-]{2,40}$/.test(v.id) && v.opciones.length >= 2
    && v.opciones.every(o => /^[a-z0-9-]{2,24}$/.test(o.id) && o.nombre && o.saga) && new Set(v.opciones.map(o => o.id)).size === v.opciones.length, v);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-voto-'));
  fs.copyFileSync(path.join(ROOT, 'firestore.rules'), path.join(dir, 'firestore.rules'));
  fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({ firestore: { rules: 'firestore.rules' },
    emulators: { firestore: { port: PORT }, ui: { enabled: false }, singleProjectMode: true } }));
  let emu = null;
  try {
    emu = await arrancar(dir);
    const ok = r => r.status === 200, no = r => r.status === 403;

    let r = await commit(A, [wRecuento(VID, 'mario', 1), wVoto(VID, A, 'mario')]);
    t('la primera cuenta vota (sin recuento aún: lo crea)', ok(r), r);
    t('el recuento queda en { mario: 1 }', await recuento() === '{"mario":1}', await recuento());
    r = await commit(A, [wRecuento(VID, 'sonic', 1), wVoto(VID, A, 'sonic')]);
    t('no se vota dos veces (otra opción)', no(r), r.status);
    r = await commit(A, [wRecuento(VID, 'mario', 2), wVoto(VID, A, 'mario')]);
    t('no se vota dos veces (la misma)', no(r), r.status);
    r = await commit(B, [wRecuento(VID, 'mario', 2), wVoto(VID, B, 'mario')]);
    t('otra cuenta suma a la misma opción', ok(r), r);
    r = await commit(C, [wRecuento(VID, 'sub-zero', 1), wVoto(VID, C, 'sub-zero')]);
    t('otra cuenta vota a otra opción (con guion)', ok(r), r);
    const esperado = '{"mario":2,"sub-zero":1}';
    t('el recuento queda en { mario: 2, sub-zero: 1 }', await recuento() === esperado, await recuento());

    const malas = [
      ['el contador sin voto', D, [wRecuento(VID, 'sonic', 1)]],
      ['el voto sin contador', D, [wVoto(VID, D, 'sonic')]],
      ['subir 2', D, [wRecuento(VID, 'sonic', 2), wVoto(VID, D, 'sonic')]],
      ['tocar otra opción a la vez', D, [{ update: { name: nombreRecuento(VID), fields: { c: { mapValue: { fields: { sonic: { integerValue: '1' }, mario: { integerValue: '0' } } } } } },
        updateMask: { fieldPaths: ['c.sonic', 'c.mario'] } }, wVoto(VID, D, 'sonic')]],
      ['voto y contador no coinciden', D, [wRecuento(VID, 'mario', 3), wVoto(VID, D, 'sonic')]],
      ['votar a nombre de otro', D, [wRecuento(VID, 'sonic', 1), wVoto(VID, 'voto-prueba-e', 'sonic')]],
      ['una opción con forma rara', D, [wRecuento(VID, 'Mario!', 1), wVoto(VID, D, 'Mario!')]],
      ['la hora del cliente', D, [wRecuento(VID, 'sonic', 1), wVoto(VID, D, 'sonic', { horaCliente: true })]],
      ['un campo de más en el voto', D, [wRecuento(VID, 'sonic', 1), wVoto(VID, D, 'sonic', { extra: { x: { stringValue: 'y' } } })]],
      ['un campo de más en el recuento', D, [wRecuento(VID, 'sonic', 1, { x: { stringValue: 'y' } }), wVoto(VID, D, 'sonic')]],
      ['un invitado', null, [wRecuento(VID, 'sonic', 1), wVoto(VID, 'x', 'sonic')]],
      ['otra votación con id raro', D, [wRecuento('Raro_1', 'sonic', 1), wVoto('Raro_1', D, 'sonic')]]
    ];
    for (const [nom, uid, ws] of malas) { const x = await commit(uid, ws); t(`se rechaza: ${nom}`, no(x), x.status); }
    t('tras los rechazos, el recuento no ha cambiado', await recuento() === esperado, await recuento());
    r = await commit(D, [wRecuento('otra-2', 'sonic', 1), wVoto('otra-2', D, 'sonic')]);
    t('otra votación (otro id) no necesita cambiar las reglas', ok(r), r.status);

    // Leer.
    t('cualquier cuenta lee el recuento (también una que no ha votado)', ok(await rest('GET', `${BASE}/votaciones/${VID}`, 'voto-prueba-sin')), null);
    t('un invitado no lee el recuento', no(await rest('GET', `${BASE}/votaciones/${VID}`, null)), null);
    t('cada uno lee su voto (y el suyo que aún no existe, para saber si ha votado)', ok(await rest('GET', `${BASE}/votaciones/${VID}/votos/${A}`, A))
      && (await rest('GET', `${BASE}/votaciones/${VID}/votos/voto-prueba-sin`, 'voto-prueba-sin')).status === 404, null);
    t('nadie lee el voto de otro ni los lista', no(await rest('GET', `${BASE}/votaciones/${VID}/votos/${A}`, B)) && no(await rest('GET', `${BASE}/votaciones/${VID}/votos`, B)), null);
    // Cambiar o borrar.
    r = await rest('PATCH', `${BASE}/votaciones/${VID}/votos/${A}?updateMask.fieldPaths=p`, A, { fields: { p: { stringValue: 'goku' } } });
    t('nadie cambia su voto', no(r), r.status);
    t('nadie borra su voto ni el recuento', no(await rest('DELETE', `${BASE}/votaciones/${VID}/votos/${A}`, A)) && no(await rest('DELETE', `${BASE}/votaciones/${VID}`, A)), null);
    t('lo demás sigue cerrado (una cuenta no lee saves/ de otra)', no(await rest('GET', `${BASE}/saves/${B}`, A)), null);
  } catch (e) {
    t('sin excepciones', false, String(e && e.stack || e));
  } finally {
    parar(emu);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
  }
  const mal = res.filter(x => !x.ok);
  console.log(`\n${res.length - mal.length} OK, ${mal.length} fallos`);
  process.exit(mal.length ? 1 : 0);
})();
