const app = document.getElementById('app');
const VEREDICTOS = {
  blanda: 'Parece más blanda',
  justa: 'Bien graduada',
  dura: 'Parece más dura',
};
const ICONOS_VEREDICTO = { blanda: '↓', justa: '✓', dura: '↑' };

// Colores de presas que se ofrecen al cargar una vía. La raíz sirve para reconocer
// variantes escritas a mano ("amarillas", "Roja", "marrón").
const COLORES = [
  ['Amarillo', 'amarill', '#fcc419'],
  ['Naranja', 'naranj', '#fd7e14'],
  ['Rojo', 'roj', '#e03131'],
  ['Rosa', 'rosa', '#f783ac'],
  ['Violeta', 'violet', '#7950f2'],
  ['Azul', 'azul', '#1c7ed6'],
  ['Celeste', 'celest', '#74c0fc'],
  ['Verde', 'verde', '#2f9e44'],
  ['Negro', 'negr', '#212529'],
  ['Blanco', 'blanc', '#f8f9fa'],
  ['Gris', 'gris', '#868e96'],
  ['Marrón', 'marron', '#8d5a2b'],
];
const SECTORES = ['Placa izquierda', 'Placa derecha', 'Desplome izquierdo', 'Desplome derecho'];
const ICONO_PRESA ='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 22c-2-6 2-14 9-15 6-1 12 3 11 9-1 5-5 6-8 9-3 3-10 3-12-3z"/></svg>';

// Filtros de la lista: se mantienen al ir y volver de una vía.
const filtro = { texto: '', sector: '', desmontadas: false };

// Todos los datos vienen en un solo pedido al Apps Script. La última copia queda guardada
// en el navegador: las pantallas se dibujan al instante con ella y se actualizan cuando
// llega la respuesta nueva.
const CLAVE_DATOS = 'datos-v1';
let cache = leerGuardado();
let cacheJSON = cache && JSON.stringify(cache);
let pedidoEnCurso = null;

function leerGuardado() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_DATOS));
  } catch {
    return null;
  }
}

// Devuelve true si los datos cambiaron.
function guardarDatos(d) {
  const json = JSON.stringify(d);
  const cambio = json !== cacheJSON;
  cache = d;
  cacheJSON = json;
  try {
    localStorage.setItem(CLAVE_DATOS, json);
  } catch {
    // Sin espacio o en modo privado: se sigue usando solo la memoria.
  }
  return cambio;
}

async function pedir(opciones) {
  if (!/^https:/.test(window.API_URL)) throw new Error('Falta configurar API_URL en config.js');
  const res = await fetch(window.API_URL, opciones);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// Pide los datos al servidor (comparte el pedido si ya hay uno en camino).
function refrescar() {
  if (!pedidoEnCurso) {
    pedidoEnCurso = pedir()
      .then((d) => ({ datos: d, cambio: guardarDatos(d) }))
      .finally(() => (pedidoEnCurso = null));
  }
  return pedidoEnCurso;
}

async function datos() {
  return cache || (await refrescar()).datos;
}

// text/plain evita el preflight CORS, que Apps Script no responde.
async function enviar(accion, cuerpo) {
  const { datos: nuevos, ...resultado } = await pedir({
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ accion, ...cuerpo }),
  });
  // Las versiones viejas del script no devuelven los datos: en ese caso se piden aparte.
  if (nuevos) guardarDatos(nuevos);
  else await refrescar();
  return resultado;
}

// Actualiza en segundo plano y vuelve a dibujar si cambió algo y el usuario sigue en la misma pantalla.
function actualizarDetras(vista, redibujar) {
  refrescar()
    .then(({ cambio }) => {
      if (cambio && vista === vistaActual) redibujar();
    })
    .catch(() => {});
}

function urlFoto(id, ancho = 1280) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${ancho}`;
}

// Resumen de opiniones: promedio sobre el índice de la escala y veredicto.
function consenso(grado, opiniones) {
  const idx = opiniones.map((g) => GRADOS.indexOf(g)).filter((i) => i >= 0);
  // Un grado marcado que ya no está en la escala (p. ej. un 5b viejo) no se puede comparar.
  if (!idx.length || !GRADOS.includes(grado)) return { votos: 0 };
  const prom = idx.reduce((a, b) => a + b, 0) / idx.length;
  const diff = prom - GRADOS.indexOf(grado);
  let veredicto = 'justa';
  if (diff >= 0.5) veredicto = 'dura';
  else if (diff <= -0.5) veredicto = 'blanda';
  return {
    votos: idx.length,
    grado_consenso: GRADOS[Math.round(prom)],
    diferencia: Math.round(diff * 10) / 10,
    veredicto,
  };
}

function conConsenso(via, encadenes) {
  const propios = encadenes
    .filter((e) => e.via_id === via.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const puntajes = propios.map((e) => Number(e.estrellas)).filter((n) => n >= 1 && n <= 5);
  return {
    ...via,
    encadenes: propios,
    ...consenso(via.grado, propios.map((e) => e.grado_sugerido)),
    estrellas: puntajes.length ? puntajes.reduce((a, b) => a + b, 0) / puntajes.length : 0,
    estrellas_votos: puntajes.length,
  };
}

// Cinco estrellas pintadas hasta el valor (admite decimales, p. ej. 4,3).
function estrellasHTML(valor) {
  const n = String(Math.round(valor * 10) / 10).replace('.', ',');
  return `<span class="estrellas" style="--valor:${valor}" role="img" aria-label="${n} de 5 estrellas">★★★★★</span>`;
}

function promedioEstrellas(v) {
  return String(Math.round(v.estrellas * 10) / 10).replace('.', ',');
}

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function colorPresa(nombre) {
  const n = normalizar(nombre);
  const c = n && COLORES.find(([, raiz]) => n.startsWith(raiz));
  return c ? c[2] : null;
}

function estiloPresa(nombre) {
  const hex = colorPresa(nombre);
  return hex ? ` style="--presa:${hex}"` : '';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function hace(iso) {
  const dias = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 30) return `hace ${plural(Math.floor(dias / 7), 'semana', 'semanas')}`;
  return new Date(iso).toLocaleDateString('es-AR');
}

function veredictoHTML(v, conGrado = true) {
  if (!v.votos) return '<span class="veredicto sin">Sin opiniones</span>';
  const extra = conGrado ? ` · ${esc(v.grado_consenso)} (${v.votos})` : '';
  return `<span class="veredicto ${v.veredicto}"><i data-icono="${ICONOS_VEREDICTO[v.veredicto]}"></i>${VEREDICTOS[v.veredicto]}${extra}</span>`;
}

function plantilla(id) {
  return document.getElementById(id).content.cloneNode(true);
}

function cargando() {
  app.innerHTML = '<div class="esqueleto-hero"></div>';
}

let timerToast;
function toast(mensaje) {
  const el = document.getElementById('toast');
  el.textContent = mensaje;
  el.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => (el.hidden = true), 2800);
}

// Achica la foto en el navegador para no subir archivos de varios MB.
function comprimirFoto(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = URL.createObjectURL(file);
  });
}

async function vistaLista() {
  const vista = vistaActual;
  app.replaceChildren(plantilla('t-lista'));
  const ul = document.getElementById('vias');
  const buscar = document.getElementById('buscar');
  const filtros = document.getElementById('filtros');
  buscar.value = filtro.texto;
  let vias = [];

  function cargar({ vias: todas, encadenes }) {
    vias = todas
      .map((v) => conConsenso(v, encadenes))
      .sort((a, b) => b.creada.localeCompare(a.creada));
    const activas = vias.filter((v) => v.activa === '1');
    app.querySelector('.contador').textContent = plural(activas.length, 'vía activa', 'vías activas');
    pintarFiltros();
    pintar();
  }

  function pintarFiltros() {
    // Los 4 sectores fijos, más cualquier otro que haya quedado cargado a mano antes.
    const otros = [...new Set(vias.map((v) => v.sector).filter((s) => s && !SECTORES.includes(s)))].sort();
    const sectores = [...SECTORES, ...otros];
    if (filtro.sector && !sectores.includes(filtro.sector)) filtro.sector = '';
    const boton = (valor, texto) =>
      `<button type="button" class="filtro" data-sector="${esc(valor)}" aria-pressed="${filtro.sector === valor}">${esc(texto)}</button>`;
    filtros.innerHTML = sectores.map((s) => boton(s, s)).join('') +
      `<button type="button" class="filtro secundario" data-desmontadas aria-pressed="${filtro.desmontadas}">Desmontadas</button>`;
  }

  function pintar() {
    const q = normalizar(filtro.texto);
    const activa = filtro.desmontadas ? '0' : '1';
    const filtradas = vias.filter((v) => v.activa === activa &&
      (!filtro.sector || v.sector === filtro.sector) &&
      normalizar([v.nombre, v.sector, v.color, v.grado, v.armador].join(' ')).includes(q));

    if (!filtradas.length) {
      ul.innerHTML = !vias.length
        ? `<li class="vacio-grande">${ICONO_PRESA}<p>Todavía no hay vías cargadas.</p><a href="#/nueva" class="boton">Cargar la primera</a></li>`
        : `<li class="vacio-grande">${ICONO_PRESA}<p>No hay vías que coincidan.</p></li>`;
      return;
    }
    ul.innerHTML = filtradas.map((v) => `
      <li><a href="#/via/${esc(v.id)}" class="tarjeta">
        <div class="tarjeta-foto"${estiloPresa(v.color)}>
          ${v.foto ? `<img src="${urlFoto(v.foto, 640)}" alt="" loading="lazy">` : `<div class="placeholder">${ICONO_PRESA}</div>`}
          <span class="grado">${esc(v.grado)}</span>
        </div>
        <div class="tarjeta-info">
          <div class="tarjeta-titulo">${colorPresa(v.color) ? `<span class="punto"${estiloPresa(v.color)}></span>` : ''}${esc(v.nombre)}</div>
          ${subtitulo(v) ? `<div class="tarjeta-sub">${esc(subtitulo(v))}</div>` : ''}
          <div class="tarjeta-pie">
            ${veredictoHTML(v)}
            ${v.estrellas_votos ? `<span class="puntaje-chico" aria-label="${promedioEstrellas(v)} de 5 estrellas">★ ${promedioEstrellas(v)}</span>` : ''}
          </div>
        </div>
      </a></li>`).join('');
  }

  buscar.addEventListener('input', () => {
    filtro.texto = buscar.value;
    pintar();
  });
  filtros.addEventListener('click', (e) => {
    const b = e.target.closest('.filtro');
    if (!b) return;
    if (b.hasAttribute('data-desmontadas')) filtro.desmontadas = !filtro.desmontadas;
    // Tocar el sector elegido lo desmarca y vuelven a verse todas.
    else filtro.sector = filtro.sector === b.dataset.sector ? '' : b.dataset.sector;
    pintarFiltros();
    pintar();
  });

  if (cache) {
    cargar(cache);
    actualizarDetras(vista, () => cargar(cache));
  } else {
    ul.innerHTML = '<li class="esqueleto"></li>'.repeat(4);
    cargar(await datos());
  }
}

function subtitulo(v) {
  return [v.sector, v.color, v.armador && `por ${v.armador}`].filter(Boolean).join(' · ');
}

function vistaNueva() {
  app.replaceChildren(plantilla('t-nueva'));
  const form = document.getElementById('form-via');
  const preview = document.getElementById('preview');
  const error = document.getElementById('error');
  const drop = app.querySelector('.foto-drop');
  const muestras = document.getElementById('muestras');
  let foto = null;

  form.grado.innerHTML = '<option value="">Elegí…</option>' + GRADOS.map((g) => `<option>${g}</option>`).join('');
  form.sector.innerHTML = '<option value="">Elegí…</option>' + SECTORES.map((s) => `<option>${s}</option>`).join('');
  form.armador.value = localStorage.getItem('armador') || '';
  if (cache) {
    const armadores = [...new Set(cache.vias.map((v) => v.armador).filter(Boolean))].sort();
    document.getElementById('armadores').innerHTML = armadores.map((a) => `<option value="${esc(a)}">`).join('');
  }

  muestras.innerHTML = COLORES.map(([nombre, , hex]) =>
    `<button type="button" class="muestra" style="--presa:${hex}" data-color="${nombre}" title="${nombre}" aria-label="${nombre}" aria-pressed="false"></button>`
  ).join('');
  const marcarMuestra = () => muestras.querySelectorAll('.muestra').forEach((m) =>
    m.setAttribute('aria-pressed', normalizar(m.dataset.color) === normalizar(form.color.value)));
  muestras.addEventListener('click', (e) => {
    const m = e.target.closest('.muestra');
    if (!m) return;
    form.color.value = m.dataset.color;
    marcarMuestra();
  });
  form.color.addEventListener('input', marcarMuestra);

  form.foto.addEventListener('change', async () => {
    const file = form.foto.files[0];
    try {
      foto = file ? await comprimirFoto(file) : null;
    } catch (err) {
      foto = null;
      error.textContent = err.message;
    }
    preview.hidden = !foto;
    drop.classList.toggle('con-foto', !!foto);
    drop.querySelector('.foto-texto b').textContent = foto ? 'Cambiar foto' : 'Sacá una foto del inicio';
    if (foto) preview.src = foto;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = form.querySelector('button[type=submit]');
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    error.textContent = '';
    try {
      const { foto: _, ...valores } = Object.fromEntries(new FormData(form));
      try {
        localStorage.setItem('armador', valores.armador.trim());
      } catch {}
      const { id } = await enviar('crearVia', { ...valores, foto });
      toast('Vía cargada');
      location.hash = `#/via/${id}`;
    } catch (err) {
      error.textContent = err.message;
      boton.disabled = false;
      boton.textContent = 'Guardar vía';
    }
  });
}

async function vistaVia(id) {
  const vista = vistaActual;
  const enCache = cache && cache.vias.some((x) => x.id === id);
  if (!enCache) {
    // Sin datos guardados, o un link a una vía que todavía no estaba en la copia local.
    cargando();
    await refrescar();
  }
  dibujarVia(id);
  if (enCache) {
    // No se redibuja si la persona está completando el formulario, para no borrarle lo que escribió.
    actualizarDetras(vista, () => {
      if (app.querySelector('#form-encadene')?.hidden !== false) dibujarVia(id);
    });
  }
}

function dibujarVia(id) {
  const { vias, encadenes } = cache;
  const via = vias.find((x) => x.id === id);
  if (!via) throw new Error('Vía no encontrada');
  const v = conConsenso(via, encadenes);
  app.replaceChildren(plantilla('t-via'));
  const $ = (s) => app.querySelector(s);

  const hero = $('.hero');
  const hex = colorPresa(v.color);
  if (hex) hero.style.setProperty('--presa', hex);
  if (v.foto) {
    $('.hero-foto').src = urlFoto(v.foto);
    $('.hero-foto').hidden = false;
    hero.classList.add('con-foto');
    $('.hero-ampliar').hidden = false;
    // Tocar la foto (salvo la flecha de volver) la abre completa.
    hero.addEventListener('click', (e) => {
      if (!e.target.closest('.hero-volver')) abrirFoto(v.foto);
    });
  }
  $('.pill-desmontada').hidden = v.activa === '1';
  $('.nombre').textContent = v.nombre;
  $('.meta').innerHTML = (hex ? `<span class="punto" style="--presa:${hex}"></span>` : '') +
    esc([v.color, v.sector].filter(Boolean).join(' · '));
  const cuando = hace(v.creada);
  $('.armado').textContent = (v.armador ? `Armada por ${v.armador} · ` : 'Armada ') +
    (/^\d/.test(cuando) ? `el ${cuando}` : cuando);
  $('.grado-hero').textContent = v.grado;
  $('.descripcion').textContent = v.descripcion;
  $('.puntaje').hidden = !v.estrellas_votos;
  $('.puntaje').innerHTML = v.estrellas_votos
    ? `${estrellasHTML(v.estrellas)} <b>${promedioEstrellas(v)}</b> <span>· ${plural(v.estrellas_votos, 'voto', 'votos')}</span>`
    : '';

  $('.consenso').innerHTML = v.votos ? `
    <div class="resumen ${v.veredicto}">
      <div class="comparacion">
        <div><small>Marcado</small><b>${esc(v.grado)}</b></div>
        <span class="flecha">→</span>
        <div class="consensuado"><small>La gente dice</small><b>${esc(v.grado_consenso)}</b></div>
      </div>
      ${veredictoHTML(v, false)}
      <p class="resumen-detalle">${textoDiferencia(v.diferencia)} · ${plural(v.votos, 'opinión', 'opiniones')}</p>
      ${histograma(v)}
    </div>` : `
    <div class="resumen sin-opiniones">
      <b>Todavía nadie opinó</b>
      <p>Si la encadenaste, contá qué grado te pareció.</p>
    </div>`;

  $('.cuenta').textContent = v.encadenes.length ? `(${v.encadenes.length})` : '';
  $('.encadenes').innerHTML = v.encadenes.map((e) => `
    <li>
      <span class="avatar" style="--hue:${tono(e.escalador)}">${esc(iniciales(e.escalador))}</span>
      <div>
        <div class="encadene-nombre">${esc(e.escalador)}</div>
        <div class="encadene-meta"><span class="estilo-pill">${e.estilo === 'top' ? 'De top' : 'De primero'}</span>${Number(e.estrellas) ? estrellasHTML(Number(e.estrellas)) : ''}${hace(e.fecha)}</div>
        ${e.comentario ? `<p>${esc(e.comentario)}</p>` : ''}
      </div>
      <span class="grado">${esc(e.grado_sugerido)}</span>
    </li>`).join('') || '<li class="vacio">Sin encadenes todavía.</li>';

  formularioEncadene(v);

  const btnActiva = $('#btn-activa');
  const activa = v.activa === '1';
  btnActiva.textContent = activa ? 'Marcar como desmontada' : 'Volver a activar';
  btnActiva.addEventListener('click', async () => {
    btnActiva.disabled = true;
    try {
      await enviar('activa', { via_id: id, activa: !activa });
      toast(activa ? 'Vía marcada como desmontada' : 'Vía activada de nuevo');
      dibujarVia(id);
    } catch (err) {
      btnActiva.disabled = false;
      btnActiva.textContent = err.message;
    }
  });
}

function formularioEncadene(v) {
  const $ = (s) => app.querySelector(s);
  const form = $('#form-encadene');
  const cta = $('.cta');
  const chips = $('#chips-grado');
  const otro = $('#grado-otro');
  const error = $('#error');
  const inputEstrellas = $('#estrellas-input');
  let elegido = '';
  let estrellas = 0;

  // Tocar la misma estrella otra vez borra el puntaje (es opcional).
  inputEstrellas.innerHTML = [1, 2, 3, 4, 5].map((n) =>
    `<button type="button" class="estrella" data-n="${n}" aria-label="${plural(n, 'estrella', 'estrellas')}" aria-pressed="false">★</button>`
  ).join('');
  inputEstrellas.addEventListener('click', (e) => {
    const b = e.target.closest('.estrella');
    if (!b) return;
    const n = Number(b.dataset.n);
    estrellas = estrellas === n ? 0 : n;
    inputEstrellas.querySelectorAll('.estrella').forEach((s) => {
      s.classList.toggle('llena', Number(s.dataset.n) <= estrellas);
      s.setAttribute('aria-pressed', Number(s.dataset.n) === estrellas);
    });
  });

  // Botones con los 7 grados alrededor del marcado; el resto queda en el desplegable.
  const i = GRADOS.indexOf(v.grado);
  const desde = Math.max(0, Math.min(i - 3, GRADOS.length - 7));
  const cercanos = GRADOS.slice(desde, desde + 7);
  chips.innerHTML = cercanos.map((g) =>
    `<button type="button" class="chip-grado${g === v.grado ? ' marcado' : ''}" data-grado="${g}" aria-pressed="false">${g}</button>`
  ).join('');
  otro.innerHTML = '<option value="">Otro grado…</option>' +
    GRADOS.filter((g) => !cercanos.includes(g)).map((g) => `<option>${g}</option>`).join('');

  function elegir(g) {
    elegido = g;
    chips.querySelectorAll('.chip-grado').forEach((c) => c.setAttribute('aria-pressed', c.dataset.grado === g));
    if (cercanos.includes(g)) otro.value = '';
  }
  chips.addEventListener('click', (e) => {
    const c = e.target.closest('.chip-grado');
    if (c) elegir(c.dataset.grado);
  });
  otro.addEventListener('change', () => elegir(otro.value));

  form.escalador.value = localStorage.getItem('escalador') || '';

  $('#btn-encadene').addEventListener('click', () => {
    form.hidden = false;
    cta.hidden = true;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!form.escalador.value) form.escalador.focus({ preventScroll: true });
  });
  $('#btn-cancelar').addEventListener('click', () => {
    form.hidden = true;
    cta.hidden = false;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    if (!elegido) {
      error.textContent = 'Elegí qué grado te pareció';
      return;
    }
    const boton = form.querySelector('button[type=submit]');
    const valores = Object.fromEntries(new FormData(form));
    boton.disabled = true;
    boton.textContent = 'Enviando…';
    try {
      localStorage.setItem('escalador', valores.escalador.trim());
      await enviar('encadenar', { ...valores, grado_sugerido: elegido, estrellas: estrellas || '', via_id: v.id });
      toast('¡Gracias! Tu opinión quedó guardada');
      dibujarVia(v.id);
    } catch (err) {
      error.textContent = err.message;
      boton.disabled = false;
      boton.textContent = 'Enviar opinión';
    }
  });
}

function textoDiferencia(d) {
  if (d === 0) return 'Coincide con lo marcado';
  const n = String(Math.abs(d)).replace('.', ',');
  return `${d > 0 ? '+' : '−'}${n} ${Math.abs(d) === 1 ? 'grado' : 'grados'} respecto a lo marcado`;
}

function iniciales(nombre) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

// Color estable por persona para el avatar.
function tono(nombre) {
  let h = 0;
  for (const c of normalizar(nombre)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

// Barras con cuántos votos tiene cada grado, de un grado abajo a uno arriba del rango votado.
function histograma(v) {
  const cuenta = {};
  v.encadenes.forEach((e) => (cuenta[e.grado_sugerido] = (cuenta[e.grado_sugerido] || 0) + 1));
  const indices = [v.grado, ...Object.keys(cuenta)].map((g) => GRADOS.indexOf(g));
  const desde = Math.max(0, Math.min(...indices) - 1);
  const hasta = Math.min(GRADOS.length - 1, Math.max(...indices) + 1);
  const max = Math.max(...Object.values(cuenta));
  const barras = GRADOS.slice(desde, hasta + 1).map((g) => {
    const n = cuenta[g] || 0;
    return `<div class="barra${g === v.grado ? ' marcado' : ''}">
      <span class="n">${n || ''}</span>
      <div style="height:${(n / max) * 100}%"></div>
      <span class="g">${g}</span>
    </div>`;
  }).join('');
  return `<div class="histograma" aria-label="Votos por grado">${barras}</div>
    <div class="leyenda"><span class="l-marcado">Grado marcado</span></div>`;
}

// Cambia en cada navegación: así una actualización que llega tarde no redibuja otra pantalla.
let vistaActual = 0;

// Visor de la foto a pantalla completa. Muestra al toque la versión que ya está
// cargada y la cambia por una más grande cuando llega. Se cierra tocando, con
// Escape o con el botón atrás del celular (por eso suma una entrada al historial).
const visor = document.getElementById('visor');
function abrirFoto(id) {
  const img = visor.querySelector('img');
  img.src = urlFoto(id);
  const grande = new Image();
  grande.onload = () => {
    if (visor.open) img.src = grande.src;
  };
  grande.src = urlFoto(id, 2400);
  visor.showModal();
  history.pushState({ visor: true }, '');
}
visor.addEventListener('click', () => visor.close());
visor.addEventListener('close', () => {
  if (history.state?.visor) history.back();
});
window.addEventListener('popstate', () => {
  if (visor.open) visor.close();
});

async function router() {
  if (visor.open) visor.close();
  vistaActual++;
  const [, ruta, id] = location.hash.split('/');
  try {
    if (ruta === 'nueva') vistaNueva();
    else if (ruta === 'via' && id) await vistaVia(decodeURIComponent(id));
    else await vistaLista();
  } catch (err) {
    app.innerHTML = `<div class="vacio-grande">${ICONO_PRESA}<p>${esc(err.message)}</p><a href="#/" class="boton">Volver</a></div>`;
  }
  window.scrollTo(0, 0);
}

// Instalación como app. Android y Chrome de escritorio ofrecen el diálogo propio;
// en iPhone no existe, así que se explica cómo agregarla a la pantalla de inicio.
function avisoInstalar() {
  const aviso = document.getElementById('instalar');
  const texto = aviso.querySelector('.instalar-texto');
  const boton = document.getElementById('btn-instalar');
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const descartado = () => {
    try {
      return localStorage.getItem('instalar-descartado') === '1';
    } catch {
      return false;
    }
  };
  if (instalada || descartado()) return;

  document.getElementById('btn-cerrar-instalar').addEventListener('click', () => {
    aviso.hidden = true;
    try {
      localStorage.setItem('instalar-descartado', '1');
    } catch {}
  });

  let pedidoInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pedidoInstalar = e;
    texto.textContent = 'Instalá la app para abrirla más rápido desde el celular.';
    boton.hidden = false;
    aviso.hidden = false;
  });
  boton.addEventListener('click', async () => {
    if (!pedidoInstalar) return;
    pedidoInstalar.prompt();
    const { outcome } = await pedidoInstalar.userChoice;
    pedidoInstalar = null;
    if (outcome === 'accepted') aviso.hidden = true;
  });
  window.addEventListener('appinstalled', () => (aviso.hidden = true));

  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (esIOS) {
    texto.innerHTML = 'Para instalarla: tocá <b>Compartir</b> <span aria-hidden="true">⬆︎</span> y después <b>Agregar a inicio</b>.';
    aviso.hidden = false;
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

avisoInstalar();
window.addEventListener('hashchange', router);
router();
