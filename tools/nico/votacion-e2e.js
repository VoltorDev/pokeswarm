/* ============ tools/nico/votacion-e2e.js — la votación del siguiente personaje de punta a punta (Playwright + emulador) ============
 *   node tools/nico/votacion-e2e.js [--puerto 8097]
 *
 * Con el emulador de Firebase (auth, firestore y database, proyecto demo-ps, las reglas de firestore.rules tal cual, como
 * buzon-e2e.js) y el juego en index.html?emu (js/ui/votacion.js):
 * - un invitado no ve la ventana y Ajustes > Cuenta le dice que inicie sesión;
 * - una cuenta la ve al llegar al menú; «Ahora no» la cierra en esa sesión y vuelve a salir en otra; vota y ve el recuento,
 *   que queda en Firestore;
 * - otra cuenta, en un móvil (844x390), vota y la ventana abierta de la primera se actualiza sola;
 * - la que ya votó no vuelve a verla en otro navegador, abre el recuento desde Ajustes y no puede votar dos veces;
 * - la cuenta de Nico (su huella en G.MODS.devHuellas) ve el recuento sin votar; y el inglés.
 * Cabe sin desplazar en 1440x900 y 844x390. Consola sin errores y nada pedido a producción. Capturas en out/votacion/.
 * Un par de minutos. No va en npm test.
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net'), crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { startServer } = require('./serve.js');
const ROOT = path.resolve(__dirname, '..', '..');
const ip = process.argv.indexOf('--puerto');
const PORT = ip > 0 ? +process.argv[ip + 1] : 8097;
const OUT = path.join(__dirname, 'out', 'votacion');
fs.mkdirSync(OUT, { recursive: true });
const EMU_PORTS = [9099, 8080, 9000];
const BASE = `http://127.0.0.1:${PORT}/index.html?emu`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = [];
const t = (name, ok, det) => { res.push({ name, ok: !!ok }); console.log(`[${ok ? 'OK' : 'FALLO'}] ${name}${ok ? '' : ' :: ' + JSON.stringify(det).slice(0, 700)}`); };
const huella = uid => crypto.createHash('sha256').update('pokeswarm/dev/1\0' + uid).digest('hex');
const PROD = /^https?:\/\/(firestore|identitytoolkit|securetoken|firebaseinstallations|firebase)\.googleapis\.com|firebaseio\.com|firebasedatabase\.app|web3forms/i;

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
async function arrancarEmulador() {
  const ocupados = EMU_PORTS.filter((p, i) => false);
  for (const p of EMU_PORTS) if (await portOpen(p)) ocupados.push(p);
  if (ocupados.length) throw new Error('Puertos del emulador ocupados: ' + ocupados.join(', '));
  const jdk = findJdk();
  const env = Object.assign({}, process.env, { JAVA_HOME: jdk, PATH: path.join(jdk, 'bin') + path.delimiter + process.env.PATH });
  const cli = require.resolve('firebase-tools/lib/bin/firebase.js');
  const child = spawn(process.execPath, [cli, 'emulators:start', '--project', 'demo-ps', '--only', 'auth,firestore,database',
    '--config', path.join(ROOT, 'firebase.json')], { cwd: OUT, env, windowsHide: true });
  let text = '', exited = null;
  child.stdout.on('data', d => { text += d; });
  child.stderr.on('data', d => { text += d; });
  child.on('exit', c => { exited = c; });
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    if (exited !== null) throw new Error('El emulador se cerró: ' + text.slice(-1500));
    if (/All emulators ready/i.test(text) && (await Promise.all(EMU_PORTS.map(portOpen))).every(Boolean)) return child;
    await sleep(500);
  }
  throw new Error('El emulador no arrancó: ' + text.slice(-1500));
}
function pararEmulador(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGINT');
  } catch (e) { /* ya cerrado */ }
}
async function jugador(browser, tag, v = { w: 1440, h: 900, dpr: 1 }) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, hasTouch: !!v.tactil, isMobile: !!v.tactil,
    serviceWorkers: 'block', locale: 'es-ES' });
  // El aviso de novedad tiene su prueba (sugerencias-e2e.js): aquí, dado por visto.
  await ctx.addInitScript(() => { try { localStorage.setItem('ps.aviso.sugerencias-1', '1'); } catch (e) { /* nada */ } });
  if (v.lang) await ctx.addInitScript(l => { try { localStorage.setItem('ps.lang', l); } catch (e) { /* nada */ } }, v.lang);
  const page = await ctx.newPage();
  const P = { ctx, page, tag, errores: [], prod: [] };
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) P.errores.push(m.text()); });
  page.on('pageerror', e => P.errores.push('pageerror: ' + e.message));
  page.on('request', r => { if (PROD.test(r.url())) P.prod.push(r.url()); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot') && document.getElementById('boot').classList.contains('hidden'), null, { timeout: 30000 });
  await sleep(300);
  if (await page.locator('#tap-start').isVisible().catch(() => false)) await page.click('#tap-start');
  await page.locator('#scr-login').waitFor({ state: 'visible', timeout: 20000 });
  const modo = await page.evaluate(() => ({ mode: G.DB.mode, emu: !!(G.FIREBASE_CONFIG || {}).emulator }));
  if (modo.mode !== 'cloud' || !modo.emu) throw new Error(tag + ': no está contra el emulador');
  return P;
}
async function companero(page) {
  await page.waitForFunction(() => ['scr-starters', 'scr-test', 'scr-menu'].some(id => !document.getElementById(id).classList.contains('hidden')), null, { timeout: 20000 });
  if (await page.locator('#scr-starters.sin-test').isVisible().catch(() => false)) {
    await page.locator('#starter-grid .ec-celda').nth(4).click();
    await page.click('#ec-ok');
  }
  await page.locator('#scr-menu').waitFor({ state: 'visible', timeout: 20000 });
}
async function registrar(P, nombre, antesDelMenu) {
  const { page } = P;
  await page.click('#scr-login .tab[data-tab="register"]');
  await page.fill('#f-user', nombre);
  await page.fill('#f-pass', 'prueba-voto-1');
  await page.click('#btn-auth');
  await page.waitForFunction(() => ['scr-starters', 'scr-test', 'scr-menu'].some(id => !document.getElementById(id).classList.contains('hidden'))
    || (document.getElementById('login-err').textContent || '').length > 0, null, { timeout: 20000 });
  const err = (await page.textContent('#login-err')).trim();
  if (err) throw new Error(P.tag + ': crear cuenta: ' + err);
  const uid = await page.evaluate(() => G.DB.fb.uid);
  if (antesDelMenu) await antesDelMenu(uid);
  await companero(page);
  return uid;
}

async function entrar(P, nombre) {
  const { page } = P;
  await page.fill('#f-user', nombre);
  await page.fill('#f-pass', 'prueba-voto-1');
  await page.click('#btn-auth');
  await page.waitForFunction(() => ['scr-starters', 'scr-menu'].some(id => !document.getElementById(id).classList.contains('hidden')) || (document.getElementById('login-err').textContent || '').length > 0, null, { timeout: 20000 })
    .catch(async e => { await page.screenshot({ path: path.join(OUT, 'fallo-entrar-' + P.tag + '.png') });
      throw new Error(P.tag + ': entrar: ' + JSON.stringify(await page.evaluate(() => ({ visibles: [...document.querySelectorAll('section.scr:not(.hidden)')].map(x => x.id), db: [G.DB.mode, G.DB.user, G.DB.guest] })))); });
  const err = (await page.textContent('#login-err')).trim();
  if (err) throw new Error(P.tag + ': entrar: ' + err);
  await companero(page);   // si la primera sesión aún no había subido su compañero, lo vuelve a pedir
}
const ventana = page => page.locator('#scr-votacion').isVisible().catch(() => false);
const esperaVentana = (page, ms = 12000) => page.locator('#scr-votacion').waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const filas = page => page.evaluate(() => [...document.querySelectorAll('#scr-votacion .vot-fila')].map(f => ({
  nombre: f.querySelector('.vot-nombre b').textContent, votos: +f.dataset.votos, mio: f.classList.contains('mio') })));
const servidor = page => page.evaluate(id => G.DB.fb.fs.collection('votaciones').doc(id).get({ source: 'server' }).then(s => (s.data() || {}).c || {}), VOTACION);
/** ¿Cabe la ventana sin desplazar, con el botón principal entero y de 40 px o más? */
const cabe = (page, boton) => page.evaluate(b => {
  const c = document.querySelector('.vot-caja'), r = c.getBoundingClientRect(), x = document.getElementById(b).getBoundingClientRect();
  return { ok: r.top >= 0 && r.bottom <= innerHeight + 0.5 && c.scrollHeight <= c.clientHeight + 1 && x.bottom <= innerHeight && x.height >= 40, caja: [r.top, r.bottom, c.scrollHeight, c.clientHeight], boton: [x.top, x.bottom, x.height], alto: innerHeight };
}, boton);
let VOTACION = '';
const foto = (page, n) => page.screenshot({ path: path.join(OUT, n + '.png') });

(async () => {
  let emu = null, srv = null, browser = null;
  const t0 = Date.now();
  try {
    emu = await arrancarEmulador();
    srv = await startServer(ROOT, PORT);
    browser = await chromium.launch();

    // 1. Un invitado: ni ventana ni botón (el voto va con el uid de una cuenta).
    const I = await jugador(browser, 'invitado');
    VOTACION = await I.page.evaluate(() => G.MODS.votacion.id);
    await I.page.click('#btn-guest');
    await companero(I.page);
    t('un invitado no ve la ventana de votar', !(await esperaVentana(I.page, 4000)));
    await I.page.evaluate(() => G.SettingsUI.open('acc'));
    await sleep(500);
    t('…y en Ajustes > Cuenta se le dice que inicie sesión, sin botón', /Inicia sesión con una cuenta para votar/.test(await I.page.textContent('#vot-ajustes')) && await I.page.locator('#vot-abrir').count() === 0);

    // 2. Una cuenta nueva: la ventana sale al llegar al menú; «Ahora no» la cierra en esta sesión.
    const A = await jugador(browser, 'cuenta-a');
    await registrar(A, 'Votante');
    t('una cuenta ve la ventana de votar al llegar al menú', await esperaVentana(A.page));
    const ops = await A.page.locator('#scr-votacion [data-op]').count();
    const nOps = await A.page.evaluate(() => G.MODS.votacion.opciones.length);
    t('…con todas las opciones y «Votar» desactivado hasta elegir', ops === nOps && await A.page.isDisabled('#vot-votar'), { ops, nOps });
    const c1 = await cabe(A.page, 'vot-votar');
    t('…y cabe sin desplazar a 1440x900', c1.ok, c1);
    await sleep(400);
    await foto(A.page, 'votar-1440');
    await A.page.click('#vot-cerrar');
    t('«Ahora no» la cierra', !(await ventana(A.page)));
    await A.page.evaluate(() => G.SettingsUI.open('acc'));
    await sleep(400);
    await A.page.evaluate(() => G.SettingsUI.close());
    t('…y no vuelve a salir en esta sesión al volver al menú', !(await esperaVentana(A.page, 4000)));

    // 3. La misma cuenta en otra sesión: vuelve a salir; vota.
    const A2 = await jugador(browser, 'cuenta-a-2');
    await entrar(A2, 'Votante');
    t('en otra sesión, sin haber votado, vuelve a salir', await esperaVentana(A2.page));
    await A2.page.click('#scr-votacion [data-op="goku"]');
    t('al elegir, el botón dice «Votar a Goku»', (await A2.page.textContent('#vot-votar')).trim() === 'Votar a Goku' && !(await A2.page.isDisabled('#vot-votar')));
    await A2.page.click('#vot-votar');
    await A2.page.locator('#scr-votacion .vot-fila').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    let f = await filas(A2.page);
    t('tras votar ve el recuento: Goku 1, el primero y marcado como su voto', f.length === nOps && f[0].nombre === 'Goku' && f[0].votos === 1 && f[0].mio && f.slice(1).every(x => x.votos === 0 && !x.mio), f.slice(0, 3));
    t('…y en Firestore queda { goku: 1 }', JSON.stringify(await servidor(A2.page)) === '{"goku":1}', await servidor(A2.page));
    await sleep(400);
    await foto(A2.page, 'recuento-1440');

    // 4. Otra cuenta en un móvil (844x390): la ventana cabe; su voto llega al momento a la ventana abierta de A2.
    const B = await jugador(browser, 'cuenta-b', { w: 844, h: 390, dpr: 3, tactil: true });
    await registrar(B, 'Movil');
    t('en un móvil (844x390) sale la ventana', await esperaVentana(B.page));
    await B.page.click('#scr-votacion [data-op="mario"]');
    const c2 = await cabe(B.page, 'vot-votar');
    t('…y cabe sin desplazar, con «Votar» entero y de 40 px o más', c2.ok, c2);
    await sleep(400);
    await foto(B.page, 'votar-movil');
    await B.page.click('#vot-votar');
    await B.page.locator('#scr-votacion .vot-fila').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const c3 = await cabe(B.page, 'vot-cerrar');
    t('el recuento también cabe en el móvil', c3.ok, c3);
    await sleep(400);
    await foto(B.page, 'recuento-movil');
    await A2.page.waitForFunction(() => /2 votos/.test(document.getElementById('vot-sub').textContent), null, { timeout: 10000 }).catch(() => {});
    f = await filas(A2.page);
    t('la ventana abierta de la otra cuenta se actualiza sola: 2 votos, Goku (el suyo) y Mario con 1', /2 votos/.test(await A2.page.textContent('#vot-sub'))
      && f.slice(0, 2).map(x => x.nombre + x.votos).sort().join() === 'Goku1,Mario1' && f.find(x => x.nombre === 'Goku').mio && !f.find(x => x.nombre === 'Mario').mio
      && f[0].nombre === 'Mario', f.slice(0, 2));   // a igualdad, el orden de la lista (Mario va antes)

    // 5. La que ya votó, en otra sesión (sin nada en el navegador): no vuelve a salir; Ajustes enseña el recuento.
    const A3 = await jugador(browser, 'cuenta-a-3');
    await entrar(A3, 'Votante');
    t('una cuenta que ya votó no vuelve a ver la ventana (aunque sea otro navegador)', !(await esperaVentana(A3.page, 5000)));
    await A3.page.evaluate(() => G.SettingsUI.open('acc'));
    await A3.page.locator('#vot-abrir').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await A3.page.click('#vot-abrir');
    await A3.page.locator('#scr-votacion .vot-fila').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    f = await filas(A3.page);
    t('desde Ajustes > Cuenta abre el recuento, con su voto marcado', f.length && f.find(x => x.nombre === 'Goku').mio && f.filter(x => x.mio).length === 1 && f.reduce((s, x) => s + x.votos, 0) === 2, f.slice(0, 2));
    await A3.page.keyboard.press('Escape');
    t('Esc cierra la ventana', !(await ventana(A3.page)));
    const doble = await A3.page.evaluate(() => G.Votacion.votar('mario').then(() => 'votó', e => (e && e.ya !== undefined) ? 'ya:' + e.ya : 'error'));
    t('votar otra vez desde la consola no suma: la transacción ve el voto ya hecho', doble === 'ya:goku' && JSON.stringify(await servidor(A3.page)) === '{"goku":1,"mario":1}', doble);

    // 6. La cuenta de Nico (devHuellas): ve el recuento desde Ajustes sin haber votado.
    const N = await jugador(browser, 'nico');
    await registrar(N, 'Nicoprueba', async uid => { await N.page.evaluate(h => { G.MODS.devHuellas = [h]; }, huella(uid)); });
    if (await esperaVentana(N.page, 8000)) await N.page.click('#vot-cerrar');
    await N.page.evaluate(() => G.SettingsUI.open('acc'));
    await N.page.locator('#vot-abrir').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await N.page.click('#vot-abrir');
    await N.page.locator('#scr-votacion .vot-fila').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    f = await filas(N.page);
    t('la cuenta de Nico ve el recuento desde Ajustes sin votar (2 votos, ninguno suyo)', f.length === nOps && f.reduce((s, x) => s + x.votos, 0) === 2 && f.every(x => !x.mio)
      && await N.page.locator('#vot-votar').isHidden(), f.slice(0, 2));
    await sleep(400);
    await foto(N.page, 'recuento-nico');

    // 7. Inglés (la que ya votó, con el juego en inglés).
    const E = await jugador(browser, 'ingles', { w: 1440, h: 900, dpr: 1, lang: 'en' });
    await entrar(E, 'Votante');
    await E.page.evaluate(() => G.Votacion.abrir());
    await E.page.locator('#scr-votacion .vot-fila').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const en = { titulo: await E.page.textContent('#vot-titulo'), sub: await E.page.textContent('#vot-sub'), cerrar: await E.page.textContent('#vot-cerrar') };
    t('en inglés: título, recuento y botón', en.titulo === 'How the vote is going' && /^2 votes · updates live$/.test(en.sub) && /Close/.test(en.cerrar), en);

    for (const P of [I, A, A2, B, A3, N, E]) {
      t(`${P.tag}: consola sin errores`, P.errores.length === 0, P.errores);
      t(`${P.tag}: nada pedido a la infraestructura de producción`, P.prod.length === 0, P.prod);
    }
  } catch (e) {
    t('sin excepciones', false, String(e && e.stack || e));
  } finally {
    if (browser) await browser.close();
    if (srv) srv.close();
    pararEmulador(emu);
  }
  const mal = res.filter(r => !r.ok);
  console.log(`\n${res.length - mal.length} OK, ${mal.length} fallos (${Math.round((Date.now() - t0) / 1000)} s). Capturas en ${OUT}`);
  process.exit(mal.length ? 1 : 0);
})();
