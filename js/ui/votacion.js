/* ============ votacion.js — votación del siguiente personaje del Multiverso (MOD nico) ============
 * Petición de Nico (14-11-2026): «Que en el juego salga una ventana al entrar (una vez votan no vuelve a abrirse) para
 * votar qué personaje quieren el siguiente. Una vez votan, que vean cuántos votos lleva cada personaje. Quiero poder ver
 * cómo van los votos en todo momento».
 *
 * - Las opciones y el id de la votación, en G.MODS.votacion (js/core/mods.js). Otra votación = otro id.
 * - Al llegar al menú principal, una cuenta de la nube (no un invitado: el voto va con su uid) que aún no ha votado ve la
 *   ventana (#scr-votacion). «Ahora no» la cierra hasta la próxima vez que abra el juego; votar la cierra para siempre.
 * - Tras votar, en la misma ventana, el recuento: cuántos votos lleva cada personaje, al momento (onSnapshot) y con el
 *   suyo marcado. Desde Ajustes > Cuenta, «Votación» abre el recuento (o el voto, si aún no ha votado); las cuentas de
 *   G.MODS.devHuellas (Nico) ven el recuento siempre, hayan votado o no.
 * - Firestore: votaciones/{id} = { c: { opción: votos } } y votaciones/{id}/votos/{uid} = { p, at }. Se escriben juntos
 *   en una transacción; firestore.rules sólo deja crear el voto de uno mismo, una vez, y subir en 1 el contador de su
 *   opción en la misma escritura (tools/nico/votacion-reglas.js lo prueba en el emulador).
 *
 * Gancho de una línea en render() de settings-ui.js (la sección de Ajustes > Cuenta); lo demás lo mete este fichero al
 * cargar y mira el menú con un MutationObserver, como sugerencias.js. dev.html lo carga tras sugerencias.js.
 */
G.Votacion = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (G.T ? G.T(s) : s);
  const cfg = () => (G.MODS && G.MODS.votacion) || null;
  const leer = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } };

  /** Firestore y uid si hay una cuenta de la nube (no un invitado); si no, null. */
  function nube() {
    const db = G.DB, fb = db && db.fb;
    if (!fb || !fb.fs || db.guest || typeof firebase === 'undefined' || !firebase.firestore) return null;
    const u = fb.auth && fb.auth.currentUser;
    return u ? { fs: fb.fs, uid: u.uid } : null;
  }
  const refs = (n, v) => ({ cont: n.fs.collection('votaciones').doc(v.id), voto: n.fs.collection('votaciones').doc(v.id).collection('votos').doc(n.uid) });
  const claveLocal = (v, uid) => `ps.voto.${v.id}.${uid}`;

  /** El recuento ordenado: de más a menos votos y, a igualdad, en el orden de la lista. Puro. */
  function recuento(opciones, c) {
    c = c || {};
    const filas = opciones.map((o, i) => ({ id: o.id, nombre: o.nombre, saga: o.saga, votos: Math.max(0, +c[o.id] || 0), i }));
    const total = filas.reduce((s, f) => s + f.votos, 0);
    filas.forEach(f => { f.pct = total ? Math.round(f.votos * 100 / total) : 0; });
    filas.sort((a, b) => b.votos - a.votos || a.i - b.i);
    return { filas, total };
  }

  // ---------------- estado ----------------
  let miVoto = null;        // la opción votada por esta cuenta (si se sabe)
  let elegida = null;       // la elegida en la ventana antes de votar
  let ahoraNo = false;      // «Ahora no» en esta sesión
  let escucha = null;       // onSnapshot del recuento
  let volverA = null;
  let votando = false;

  async function yaVotado() {
    const n = nube(), v = cfg();
    if (!n || !v) return null;
    const local = leer(claveLocal(v, n.uid));
    if (local) return local;
    const s = await refs(n, v).voto.get();
    const p = s.exists ? (s.data() || {}).p || '' : '';
    if (p) escribir(claveLocal(v, n.uid), p);
    return p || '';
  }

  /** Vota: el voto y el contador, en una transacción (las reglas exigen las dos cosas a la vez). → la opción. */
  async function votar(p) {
    const n = nube(), v = cfg();
    if (!n || !v) throw new Error('sin-nube');
    if (!v.opciones.some(o => o.id === p)) throw new Error('opcion');
    const r = refs(n, v);
    await n.fs.runTransaction(async tx => {
      const cs = await tx.get(r.cont), vs = await tx.get(r.voto);
      if (vs.exists) throw Object.assign(new Error('ya'), { ya: (vs.data() || {}).p || '' });
      const c = cs.exists ? ((cs.data() || {}).c || {}) : {};
      tx.set(r.cont, { c: { [p]: (+c[p] || 0) + 1 } }, { merge: true });
      tx.set(r.voto, { p, at: firebase.firestore.FieldValue.serverTimestamp() });
    });
    escribir(claveLocal(v, n.uid), p);
    return p;
  }

  // ---------------- interfaz ----------------
  const abierto = () => { const s = $('scr-votacion'); return !!s && !s.classList.contains('hidden'); };

  function crear() {
    if ($('scr-votacion')) return;
    const sec = document.createElement('section');
    sec.id = 'scr-votacion';
    sec.className = 'scr dim hidden';
    sec.setAttribute('role', 'dialog');
    sec.setAttribute('aria-modal', 'true');
    sec.setAttribute('aria-labelledby', 'vot-titulo');
    sec.innerHTML = `<div class="box vot-caja">
      <h2 id="vot-titulo"></h2>
      <p class="sub" id="vot-sub"></p>
      <div id="vot-cuerpo"></div>
      <div class="row sug-pie">
        <p class="sug-estado" id="vot-estado" role="status" aria-live="polite"></p>
        <button type="button" class="btn" id="vot-cerrar"></button>
        <button type="button" class="btn gold" id="vot-votar"></button>
      </div>
    </div>`;
    document.body.appendChild(sec);
    $('vot-cerrar').onclick = cerrar;
    $('vot-votar').onclick = mandar;
    sec.addEventListener('click', e => { if (e.target === sec) cerrar(); });
    addEventListener('keydown', e => {
      if (!abierto()) return;
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
    }, true);
    addEventListener('keyup', e => { if (abierto()) e.stopPropagation(); }, true);
  }

  function estado(txt, clase = '') {
    const el = $('vot-estado');
    el.textContent = txt;
    el.className = 'sug-estado' + (clase ? ' ' + clase : '');
  }

  function pintarVoto() {
    const v = cfg();
    $('vot-titulo').textContent = T('¿Qué personaje quieres que llegue al Multiverso?');
    $('vot-sub').textContent = T('Elige uno: el más votado será el siguiente. Sólo se vota una vez.');
    $('vot-cuerpo').innerHTML = `<div class="vot-opciones" role="radiogroup" aria-label="${esc(T('Personajes'))}">${v.opciones.map(o =>
      `<button type="button" class="btn vot-op" role="radio" aria-checked="false" data-op="${esc(o.id)}"><b translate="no">${esc(T(o.nombre))}</b><span translate="no">${esc(o.saga)}</span></button>`).join('')}</div>`;
    $('vot-cuerpo').querySelectorAll('[data-op]').forEach(b => { b.onclick = () => elegir(b.dataset.op); });
    $('vot-cerrar').textContent = T('Ahora no');
    $('vot-votar').textContent = T('Votar');
    $('vot-votar').classList.remove('hidden');
    elegir(elegida);
  }

  function elegir(p) {
    elegida = p || null;
    document.querySelectorAll('#scr-votacion [data-op]').forEach(b => {
      const on = b.dataset.op === elegida;
      b.classList.toggle('gold', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    const o = elegida && cfg().opciones.find(x => x.id === elegida);
    $('vot-votar').disabled = !o;
    $('vot-votar').textContent = o ? T('Votar a') + ' ' + T(o.nombre) : T('Votar');
  }

  function pintarRecuento(c) {
    const v = cfg(), { filas, total } = recuento(v.opciones, c);
    $('vot-titulo').textContent = T('Así va la votación');
    $('vot-sub').textContent = total ? `${total} ${T(total === 1 ? 'voto' : 'votos')} · ${T('se actualiza sola')}` : T('Todavía no ha votado nadie.');
    const max = filas.length ? Math.max(1, filas[0].votos) : 1;
    $('vot-cuerpo').innerHTML = `<ol class="vot-lista">${filas.map(f => `<li class="vot-fila${f.id === miVoto ? ' mio' : ''}" data-op="${esc(f.id)}" data-votos="${f.votos}">
        <span class="vot-nombre"><b translate="no">${esc(T(f.nombre))}</b>${f.id === miVoto ? ` <em>${esc(T('tu voto'))}</em>` : ''}</span>
        <span class="vot-barra" aria-hidden="true"><i style="width:${(f.votos / max * 100).toFixed(1)}%"></i></span>
        <span class="vot-num">${f.votos}<small>${f.pct}%</small></span></li>`).join('')}</ol>`;
  }

  function verRecuento() {
    const n = nube(), v = cfg();
    $('vot-cerrar').textContent = T('Cerrar');
    $('vot-votar').classList.add('hidden');
    $('vot-cuerpo').innerHTML = `<p class="buz-vacio">${esc(T('Cargando…'))}</p>`;
    if (!n) return;
    pararEscucha();
    escucha = refs(n, v).cont.onSnapshot(s => { if (abierto()) { estado(''); pintarRecuento(s.exists ? (s.data() || {}).c : {}); } },
      () => estado(T('No se ha podido cargar el recuento. Prueba otra vez en un rato.'), 'mal'));
  }
  function pararEscucha() { if (escucha) { try { escucha(); } catch (e) { /* nada */ } escucha = null; } }

  /** Abre la ventana: el voto si aún no ha votado, el recuento si ya votó (o si forzar = 'recuento'). */
  async function abrir(forzar) {
    const v = cfg();
    if (!v || !nube()) return false;
    crear();
    volverA = document.activeElement;
    estado('');
    $('scr-votacion').classList.remove('hidden');
    try { miVoto = await yaVotado(); } catch (e) { miVoto = miVoto || ''; }
    if (!abierto()) return true;
    if (miVoto || forzar === 'recuento' || v.abierta === false) verRecuento(); else pintarVoto();
    setTimeout(() => { const b = $(miVoto || forzar ? 'vot-cerrar' : 'vot-votar'); if (b && abierto()) (b.disabled ? $('vot-cerrar') : b).focus(); }, 30);
    return true;
  }

  function cerrar() {
    if (!abierto()) return;
    if (!miVoto) ahoraNo = true;
    pararEscucha();
    $('scr-votacion').classList.add('hidden');
    if (volverA && volverA.focus && volverA.isConnected) volverA.focus();
    volverA = null;
  }

  async function mandar() {
    if (votando || !elegida) return;
    votando = true;
    $('vot-votar').disabled = true;
    estado(T('Votando…'));
    try {
      if (navigator.onLine === false) throw new Error('sin-red');
      miVoto = await votar(elegida);
      if (G.Audio && G.Audio.sfx) G.Audio.sfx('buy');
      estado(T('¡Gracias por votar!'), 'bien');
      verRecuento();
    } catch (e) {
      if (e && e.ya !== undefined) {   // ya había votado (desde otro dispositivo)
        miVoto = e.ya;
        const n = nube(); if (n) escribir(claveLocal(cfg(), n.uid), e.ya);
        estado(T('Ya habías votado.'));
        verRecuento();
      } else {
        estado(T(navigator.onLine === false ? 'Sin conexión: no se ha votado. Prueba otra vez.' : 'No se ha podido votar. Prueba otra vez en un rato.'), 'mal');
        $('vot-votar').disabled = false;
      }
    } finally { votando = false; }
  }

  /** Gancho de settings-ui.js (render): en Ajustes > Cuenta, «Votación». */
  function ajustes(box, tab) {
    const v = cfg();
    if (!box || tab !== 'acc' || !v || box.querySelector('#vot-ajustes')) return;
    const n = nube();
    box.insertAdjacentHTML('beforeend', `<div id="vot-ajustes"><h3 class="set-h">${esc(T('Votación: el siguiente personaje'))}</h3>
      <p class="sub">${esc(T(n ? 'Qué personaje llega después al Multiverso. Cada cuenta vota una vez.' : 'Inicia sesión con una cuenta para votar qué personaje llega después al Multiverso.'))}</p>
      ${n ? `<button class="btn small" type="button" id="vot-abrir">${esc(T('Ver la votación'))}</button>` : ''}</div>`);
    const b = $('vot-abrir');
    if (!b) return;
    const esNico = () => (G.DevMenu && G.DevMenu.permitido ? G.DevMenu.permitido() : Promise.resolve(false));
    b.onclick = () => esNico().then(ok => abrir(ok ? 'recuento' : undefined));
  }

  // ---------------- al entrar ----------------
  /** El menú principal a la vista, sin un submenú, otra capa, el aviso de novedad de sugerencias ni un aviso de logro. */
  function menuLibre() {
    const m = $('scr-menu'), bar = $('topbar');
    if (!m || m.classList.contains('hidden') || !bar || bar.classList.contains('hidden')) return false;
    return !document.querySelector('.scr.dim:not(.hidden), .tapstart:not(.hidden), #boot:not(.hidden), #pull-fx:not(.hidden), #ach-pop:not(.hidden), #sug-aviso');
  }

  let espera = 0, mirando = false;
  function quizas() {
    const v = cfg();
    if (!v || v.abierta === false || ahoraNo || miVoto || mirando || abierto() || !nube()) return;
    clearTimeout(espera);
    espera = setTimeout(async () => {
      if (!menuLibre() || ahoraNo || miVoto || abierto()) return;
      mirando = true;
      try { miVoto = await yaVotado(); } catch (e) { mirando = false; return; }
      mirando = false;
      if (!miVoto && menuLibre() && !ahoraNo) abrir();
    }, 1500);
  }

  function vigilar() {
    if (typeof MutationObserver === 'undefined') return;
    let uid = null;
    new MutationObserver(() => {
      const n = nube(), u = n ? n.uid : null;
      if (u !== uid) { uid = u; miVoto = null; ahoraNo = false; }   // otra cuenta: vuelve a mirar
      if (menuLibre()) quizas();
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  function iniciar() {
    if (!document.body) return;
    vigilar();
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
  }

  return { abrir, cerrar, abierto, recuento, votar, ajustes };
})();
