export const meta = {
  name: 'lote4-sprites',
  description: 'Genera los sprites de los 14 personajes del cuarto lote: imagen base, modelo 3D, rig por piezas, 8 direcciones, andar, ataque y disparo, con revisión adversarial',
  phases: [
    { title: 'Imagen', detail: 'candidatas con Lucid Origin, elegir, quitar el fondo' },
    { title: 'Modelo', detail: 'TRELLIS.2 en la GPU, de uno en uno' },
    { title: 'Sprites', detail: 'animar3d.py, pixelar.py y hoja de contacto, calibrando el perfil' },
    { title: 'Juez', detail: 'revisión adversarial de cada hoja; si falla, se repite' },
  ],
}

const R = 'C:/Users/Nico/Desktop/Claude/pokeswarm'
const M = R + '/tools/nico/multiverso'
const L = M + '/lote4'
const PY_REMBG = 'C:/Users/Nico/Desktop/Claude/herramientas/3d-gen/.venv-rembg/Scripts/python.exe'
const BLENDER = 'C:/Users/Nico/Tools/blender/blender.exe'
const ROSTER = args.personajes

// La GPU (TRELLIS.2): de uno en uno. Blender: como mucho 3 a la vez.
let colaGPU = Promise.resolve()
const conGPU = fn => { const r = colaGPU.then(fn, fn); colaGPU = r.catch(() => {}); return r }
function semaforo(n) {
  let libres = n; const cola = []
  return async fn => {
    if (libres > 0) libres--; else await new Promise(r => cola.push(r))
    try { return await fn() } finally { if (cola.length) cola.shift()(); else libres++ }
  }
}
const conBlender = semaforo(3)

const CTX = p => `
Trabajas en PokéSwarm (juego web de Nico, carpeta ${R}). Hacemos los SPRITES del personaje ${p.nombre} (${p.saga}), clave
«${p.clave}», N.º ${p.dex}, del cuarto lote del Multiverso. Sus datos (tipos, ataques, cómo se mueve, el variocolor y la
descripción para la imagen con los rasgos que lo hacen reconocible) están en ${L}/propuestas/${p.clave}.json: léelo primero.
Su carpeta de trabajo: ${L}/trabajo/${p.clave}/ (temporal, no va al repositorio).

Cadena (las herramientas ya existen y están probadas; lee su cabecera si dudas):
1. Imagen base: python ${L}/imagen.py ${p.clave} --n 4 --semilla <s> --modelo lucid [--extra "…"] [--prompt "…"]
   → trabajo/${p.clave}/cand-<s>.png y una hoja cands-<s>.png. Lucid Origin respeta la pose A; FLUX (--modelo flux) no.
   El fondo puede salir de cualquier color: da igual, el paso 2 segmenta.
2. Fondo: ${PY_REMBG} ${L}/fondo.py <cand.png> ${L}/trabajo/${p.clave}/base.png  → base.png (alfa) y base-ver.png (sobre tablero).
3. Modelo 3D (SÓLO en la fase «Modelo»): powershell -NoProfile -ExecutionPolicy Bypass -File ${L}/malla.ps1 -Imagen <base.png> -Salida ${L}/trabajo/${p.clave}/modelo.glb
4. Animación y renders: ${BLENDER} --background --python ${M}/animar3d.py -- ${L}/trabajo/${p.clave}/modelo.glb ${L}/trabajo/${p.clave}/render ${L}/trabajo/${p.clave}/perfil.json
   (8 rotaciones + andar 4, ataque 7 y disparo 5 fotogramas en 5 direcciones; esqueleto.png enseña lo detectado:
   piernas azul/cian, brazos rojo/naranja, cadera y hombro como líneas). perfil.json (opcional) fuerza:
   {"giro": grados si el modelo no mira a la cámara en render-south, "cadera": 0-1, "hombro": 0-1, "brazo_x": 0-1 (del ancho),
    "arma": "derecha"|"izquierda"|"ambas", "ataque": "tajo"|"puñetazo"|"embestida", "disparo": "brazo"|"boca", "retroceso": true,
    "zancada": 22, "elevacion": 22}   (elevación 20-25 enseña más la cara bajo gorras o cascos; 30 es la de los demás)
5. Pixel art: python ${M}/pixelar.py ${L}/trabajo/${p.clave}/render ${p.clave} --anim --detalle 0.25 --colores 24 [--alto 30]
   → ${M}/fuentes/${p.clave}/ (rot-*, andar-*, Attack-*, Shoot-*). --alto: alto del personaje en px (30 normal; 26-28 si en su
   saga es claramente más bajo que los demás, nunca más de 30). --detalle conserva ojos, bigotes y contornos oscuros.
6. Hoja de contacto: python ${M}/montar.py vista ${p.clave} ${L}/trabajo/${p.clave}/vista  → hoja.png (×3: 8 direcciones,
   variocolor, andar S/E/N, Attack, Shoot, golpe y caída, y la escala junto a Charmander y Kratos) y andar.gif.
   NUNCA ejecutes montar.py sin «vista» (escribiría las hojas del juego de todos): eso lo hace el coordinador al final.
Variocolor: si al verlo no se reconoce el traje alternativo, escribe las reglas corregidas (mismo formato que
variocolor.reglas de la propuesta) en ${L}/trabajo/${p.clave}/vario.json: la vista las usa.

Progreso para el tablero en directo de Nico (frases cortas en español llano):
  node ${L}/estado.js ${p.clave} <imagen|modelo|rotaciones|andar|hojas> <en-curso|hecho|problema> "nota" [--img <png o gif>]
Pon --img con lo más representativo de cada paso (base-ver.png, render-south.png, hoja.png, andar.gif).
Reglas: no toques otros personajes, ni js/, ni assets/, ni check.js. Español correcto con tildes. Escribe con tus palabras.`

const CRITERIOS = `CRITERIOS DE CALIDAD (los mismos para el que los hace y para el juez):
- Se reconoce a 32 px: tiene los rasgos de sprite.rasgos de la propuesta y su paleta; la cara se ve de frente (ojos, rasgos).
- Las 8 direcciones son el mismo personaje, sin cambios de tamaño, y mira hacia donde toca: sur = de frente, norte = de espaldas,
  este = de perfil mirando a la DERECHA de la pantalla, noreste/sureste en diagonal hacia la derecha.
- Andar: las piernas (o el cuerpo, si no tiene piernas separadas) se mueven de forma visible y sin romperse; no flota ni se hunde.
- Attack: un gesto de ataque que se lee (el brazo del arma prepara y golpea, puñetazo o embestida) acorde a cómo pelea en su
  saga; sin piezas rotas ni brazos que se estiran raro. Shoot: apunta o escupe hacia delante.
- Contorno limpio, sin píxeles sueltos ni manchas del fondo; los colores no se confunden entre sí.
- Variocolor reconocible como el traje o la forma alternativa que dice la propuesta.
- Escala coherente con Charmander y Kratos (ni enano ni gigante salvo que su saga lo pida).`

const IMAGEN = (p, nota) => `${CTX(p)}

FASE «IMAGEN». Consigue la imagen base de ${p.nombre} para reconstruirlo en 3D.
1. node ${L}/estado.js ${p.clave} imagen en-curso "Generando candidatas"
2. Genera 4 candidatas (imagen.py, Lucid Origin), mira la hoja cands-*.png y elige la mejor: el personaje correcto y en su
   versión (rasgos y paleta de la propuesta), ENTERO de pies a cabeza dentro del cuadro, de frente, en pose A con los brazos
   SEPARADOS del cuerpo y las piernas algo abiertas (eso permite animar), sin objetos sueltos ni otros personajes, y con su
   arma o rasgo clave visible. Si ninguna sirve, cambia --extra/--prompt y otras semillas (hasta 4 tandas; prueba FLUX si
   Lucid falla). Para cuadrúpedos (o lo que no sea humanoide) pide que se le vea de frente y entero.
3. Quita el fondo (fondo.py) y mira base-ver.png: nada cortado, nada de fondo pegado. Si dice que toca un borde, otra.
${nota ? '4. ATENCIÓN, esto es un reintento. El juez rechazó lo anterior por: ' + nota + '\n' : ''}
Al acabar: node ${L}/estado.js ${p.clave} imagen hecho "Imagen base elegida: <por qué>" --img ${L}/trabajo/${p.clave}/base-ver.png
Devuelve la ruta de base.png, la semilla, el modelo y por qué la elegiste.`

const MODELO = p => `${CTX(p)}

FASE «MODELO». Sólo esto (usa la GPU; no hagas nada más):
1. node ${L}/estado.js ${p.clave} modelo en-curso "Reconstruyendo en 3D con TRELLIS.2"
2. powershell -NoProfile -ExecutionPolicy Bypass -File ${L}/malla.ps1 -Imagen ${L}/trabajo/${p.clave}/base.png -Salida ${L}/trabajo/${p.clave}/modelo.glb
   (unos 2 minutos). Si falla, repite una vez con -Semilla 7.
3. Si existe el .glb: node ${L}/estado.js ${p.clave} modelo hecho "Modelo 3D listo"; si no: … modelo problema "<el error>".
Devuelve si hay modelo.`

const SPRITES = (p, nota) => `${CTX(p)}

${CRITERIOS}

FASE «SPRITES». Del modelo 3D a las hojas de 32 px, calibrando hasta que cumpla los criterios.
1. node ${L}/estado.js ${p.clave} rotaciones en-curso "Animando el modelo en Blender"
2. Escribe ${L}/trabajo/${p.clave}/perfil.json según cómo pelea en su saga (propuesta: el inicial y su forma; «disparo» de la
   propuesta: -1 = retrocede al disparar): ataque tajo (espadas, garras), puñetazo (puños), embestida (cabezazo, carga,
   cuadrúpedos); arma la mano que la lleva; disparo brazo o boca (aliento); elevación 22-25 si una gorra o casco tapa la cara.
3. Ejecuta animar3d.py y mira esqueleto.png y render-south.png / render-east.png: si el modelo no mira a la cámara en
   render-south, pon «giro»; si las piernas o los brazos no están bien detectados, ajusta cadera/hombro/brazo_x. Repite.
4. pixelar.py y montar.py vista; mira hoja.png con lupa y compara con los criterios. Itera (perfil, --alto, --colores,
   --detalle, elevación, variocolor en vario.json) hasta que cumpla, como mucho 5 vueltas.
5. Apunta: rotaciones hecho (--img hoja.png), andar hecho (--img andar.gif) y hojas hecho "Hojas listas para revisar".
   Si algo no se puede arreglar desde aquí (la imagen base o el modelo están mal), apunta hojas problema y dilo.
${nota ? 'ATENCIÓN, esto es un reintento. El juez rechazó la vez anterior por: ' + nota + '\n' : ''}
Guarda lo que has usado en ${L}/sprites/${p.clave}.json: {"perfil": {...}, "pixelar": {"alto":…, "colores":…, "detalle":…},
"imagen": {"modelo":…, "semilla":…, "prompt": "…"}, "vario": [reglas si las cambiaste, o []], "notas": "…"} (crea la carpeta).
Devuelve el resultado.`

const JUEZ = p => `${CTX(p)}

${CRITERIOS}

Eres el JUEZ ADVERSARIAL de los sprites de ${p.nombre}. Los hizo otro agente; tu trabajo es encontrar fallos, no aprobar.
Mira ${L}/trabajo/${p.clave}/vista/hoja.png (y si hace falta los PNG de ${M}/fuentes/${p.clave}/ ampliados, base-ver.png,
render-*.png y esqueleto.png). Compara con la propuesta (rasgos, paleta, variocolor, cómo pelea). Para ver un PNG ampliado:
python -c "from PIL import Image; im=Image.open(r'<png>'); im.resize((im.width*6, im.height*6), Image.NEAREST).save(r'<salida>')"
Contesta con un veredicto y la lista de problemas reales (gravedad alta = no se reconoce, mira mal, se rompe o no se lee el
ataque; media = se nota pero se puede jugar; baja = detalle). Cada problema con la fase donde se arregla: «imagen» (hace
falta otra imagen base: personaje equivocado, pose sin brazos separados, le falta algo), «modelo» (el 3D salió deforme) o
«sprites» (calibrar perfil, pixelar, variocolor). Aprueba sólo si no hay ninguno de gravedad alta.
Apunta al acabar: node ${L}/estado.js ${p.clave} hojas <hecho|problema> "Juez: <veredicto en una frase>" --img ${L}/trabajo/${p.clave}/vista/hoja.png`

const VEREDICTO = { type: 'object', properties: {
  aprobado: { type: 'boolean' },
  problemas: { type: 'array', items: { type: 'object', properties: {
    gravedad: { type: 'string', enum: ['alta', 'media', 'baja'] }, fase: { type: 'string', enum: ['imagen', 'modelo', 'sprites'] },
    que: { type: 'string' }, arreglo: { type: 'string' } }, required: ['gravedad', 'fase', 'que', 'arreglo'] } },
  resumen: { type: 'string' } }, required: ['aprobado', 'problemas', 'resumen'] }
const HECHO = { type: 'object', properties: { ok: { type: 'boolean' }, notas: { type: 'string' } }, required: ['ok', 'notas'] }

async function personaje(p) {
  const hist = []
  let notaImagen = '', notaSprites = '', rehacerImagen = true
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    if (rehacerImagen) {
      const im = await agent(IMAGEN(p, notaImagen), { label: `imagen:${p.clave}`, phase: 'Imagen', agentType: 'general-purpose', schema: HECHO })
      hist.push({ fase: 'imagen', r: im })
      if (!im || !im.ok) return { clave: p.clave, ok: false, hist }
      const mo = await conGPU(() => agent(MODELO(p), { label: `modelo:${p.clave}`, phase: 'Modelo', agentType: 'general-purpose', schema: HECHO, effort: 'low' }))
      hist.push({ fase: 'modelo', r: mo })
      if (!mo || !mo.ok) { notaImagen = 'TRELLIS no pudo reconstruir esa imagen: ' + (mo && mo.notas || ''); continue }
    }
    const sp = await conBlender(() => agent(SPRITES(p, notaSprites), { label: `sprites:${p.clave}`, phase: 'Sprites', agentType: 'general-purpose', schema: HECHO }))
    hist.push({ fase: 'sprites', r: sp })
    const j = await agent(JUEZ(p), { label: `juez:${p.clave}`, phase: 'Juez', agentType: 'general-purpose', schema: VEREDICTO })
    hist.push({ fase: 'juez', r: j })
    if (j && j.aprobado) return { clave: p.clave, ok: true, vueltas: vuelta + 1, juez: j, hist }
    const altos = (j && j.problemas || []).filter(x => x.gravedad === 'alta')
    rehacerImagen = altos.some(x => x.fase === 'imagen' || x.fase === 'modelo')
    const texto = altos.concat((j && j.problemas || []).filter(x => x.gravedad === 'media')).map(x => `[${x.gravedad}, ${x.fase}] ${x.que} → ${x.arreglo}`).join(' · ')
    if (rehacerImagen) notaImagen = texto; else notaSprites = texto
    log(`${p.nombre}: el juez pide otra vuelta (${rehacerImagen ? 'imagen nueva' : 'recalibrar'})`)
  }
  return { clave: p.clave, ok: false, vueltas: 3, hist }
}

log('14 personajes en paralelo; TRELLIS de uno en uno y Blender de tres en tres')
const res = await parallel(ROSTER.map(p => () => personaje(p)))
const fin = res.filter(Boolean)
log(`Aprobados por el juez: ${fin.filter(r => r.ok).length} de ${ROSTER.length}`)
return fin.map(r => ({ clave: r.clave, ok: r.ok, vueltas: r.vueltas, juez: r.juez ? r.juez.resumen : null,
  pendientes: r.juez ? r.juez.problemas : (r.hist.slice(-1)[0] || {}).r }))
