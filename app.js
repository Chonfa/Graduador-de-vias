const app = document.getElementById('app');
const VEREDICTOS = {
  blanda: 'Parece más blanda',
  justa: 'Bien graduada',
  dura: 'Parece más dura',
};

// Todos los datos vienen en un solo pedido al Apps Script y se guardan acá
// hasta que alguien escribe algo.
let cache = null;

async function pedir(opciones) {
  if (!/^https:/.test(window.API_URL)) throw new Error('Falta configurar API_URL en config.js');
  const res = await fetch(window.API_URL, opciones);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function datos(refrescar = false) {
  if (!cache || refrescar) cache = await pedir();
  return cache;
}

// text/plain evita el preflight CORS, que Apps Script no responde.
async function enviar(accion, cuerpo) {
  const data = await pedir({
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ accion, ...cuerpo }),
  });
  cache = null;
  return data;
}

function urlFoto(id) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1280`;
}

// Resumen de opiniones: promedio sobre el índice de la escala y veredicto.
function consenso(grado, opiniones) {
  const idx = opiniones.map((g) => GRADOS.indexOf(g)).filter((i) => i >= 0);
  if (!idx.length) return { votos: 0 };
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
  return { ...via, encadenes: propios, ...consenso(via.grado, propios.map((e) => e.grado_sugerido)) };
}

function cargando() {
  app.innerHTML = '<p class="vacio">Cargando…</p>';
}

function plantilla(id) {
  return document.getElementById(id).content.cloneNode(true);
}

function opcionesGrado(select, seleccionado) {
  select.innerHTML = '<option value="">Elegí un grado</option>' +
    GRADOS.map((g) => `<option${g === seleccionado ? ' selected' : ''}>${g}</option>`).join('');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function badgeConsenso(v) {
  if (!v.votos) return '<span class="chip">Sin opiniones</span>';
  return `<span class="chip ${v.veredicto}">${VEREDICTOS[v.veredicto]} · ${v.grado_consenso} (${v.votos})</span>`;
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
  if (!cache) cargando();
  const { vias: todas, encadenes } = await datos(true);
  app.replaceChildren(plantilla('t-lista'));
  const ul = document.getElementById('vias');
  const buscar = document.getElementById('buscar');
  const desmontadas = document.getElementById('desmontadas');
  const vias = todas
    .map((v) => conConsenso(v, encadenes))
    .sort((a, b) => b.creada.localeCompare(a.creada));

  function pintar() {
    const q = buscar.value.toLowerCase();
    const activa = desmontadas.checked ? '0' : '1';
    const filtradas = vias.filter((v) => v.activa === activa &&
      [v.nombre, v.sector, v.color, v.grado].join(' ').toLowerCase().includes(q));
    ul.innerHTML = filtradas.length ? filtradas.map((v) => `
      <li><a href="#/via/${esc(v.id)}" class="tarjeta">
        ${v.foto ? `<img src="${urlFoto(v.foto)}" alt="" loading="lazy">` : '<div class="sin-foto">🧗</div>'}
        <div class="info">
          <strong>${esc(v.nombre)}</strong>
          <small>${esc([v.sector, v.color].filter(Boolean).join(' · '))}</small>
          ${badgeConsenso(v)}
        </div>
        <span class="grado">${esc(v.grado)}</span>
      </a></li>`).join('')
      : '<li class="vacio">No hay vías cargadas todavía.</li>';
  }

  buscar.addEventListener('input', pintar);
  desmontadas.addEventListener('change', pintar);
  pintar();
}

function vistaNueva() {
  app.replaceChildren(plantilla('t-nueva'));
  const form = document.getElementById('form-via');
  const preview = document.getElementById('preview');
  const error = document.getElementById('error');
  opcionesGrado(form.grado);
  let foto = null;

  form.foto.addEventListener('change', async () => {
    const file = form.foto.files[0];
    foto = file ? await comprimirFoto(file) : null;
    preview.hidden = !foto;
    if (foto) preview.src = foto;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = form.querySelector('button');
    boton.disabled = true;
    error.textContent = '';
    try {
      const datos = Object.fromEntries(new FormData(form));
      boton.textContent = 'Guardando…';
      const { id } = await enviar('crearVia', { ...datos, foto });
      location.hash = `#/via/${id}`;
    } catch (err) {
      error.textContent = err.message;
      boton.disabled = false;
      boton.textContent = 'Guardar vía';
    }
  });
}

async function vistaVia(id) {
  if (!cache) cargando();
  const { vias, encadenes } = await datos();
  const via = vias.find((x) => x.id === id);
  if (!via) throw new Error('Vía no encontrada');
  const v = conConsenso(via, encadenes);
  app.replaceChildren(plantilla('t-via'));
  const $ = (s) => app.querySelector(s);

  if (v.foto) {
    $('.foto').src = urlFoto(v.foto);
    $('.foto').hidden = false;
  }
  $('.nombre').textContent = v.nombre;
  $('.meta').textContent = [v.sector, v.color].filter(Boolean).join(' · ') + (v.activa === '1' ? '' : ' · DESMONTADA');
  $('.grado').textContent = v.grado;
  $('.descripcion').textContent = v.descripcion;

  $('.consenso').innerHTML = v.votos ? `
    <div class="resumen ${v.veredicto}">
      <strong>${VEREDICTOS[v.veredicto]}</strong>
      <span>La gente le da <b>${v.grado_consenso}</b> en promedio
      (${v.diferencia > 0 ? '+' : ''}${v.diferencia} ${Math.abs(v.diferencia) === 1 ? 'grado' : 'grados'} respecto a lo marcado, ${v.votos} ${v.votos === 1 ? 'opinión' : 'opiniones'})</span>
    </div>
    ${histograma(v)}` : '<p class="vacio">Nadie opinó todavía. ¡Sé el primero!</p>';

  $('.encadenes').innerHTML = v.encadenes.map((e) => `
    <li>
      <span class="grado chico">${esc(e.grado_sugerido)}</span>
      <div><strong>${esc(e.escalador)}</strong> <small>de ${e.estilo === 'top' ? 'top' : 'primero'} · ${e.fecha.slice(0, 10)}</small>
      ${e.comentario ? `<p>${esc(e.comentario)}</p>` : ''}</div>
    </li>`).join('') || '<li class="vacio">Sin encadenes todavía.</li>';

  const form = $('#form-encadene');
  opcionesGrado(form.grado_sugerido, v.grado);
  form.escalador.value = localStorage.getItem('escalador') || '';

  $('#btn-encadene').addEventListener('click', () => {
    form.hidden = false;
    $('#btn-encadene').hidden = true;
    (form.escalador.value ? form.querySelector('[name=estilo]') : form.escalador).focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = form.querySelector('button');
    const valores = Object.fromEntries(new FormData(form));
    boton.disabled = true;
    boton.textContent = 'Enviando…';
    try {
      localStorage.setItem('escalador', valores.escalador.trim());
      await enviar('encadenar', { ...valores, via_id: id });
      await vistaVia(id);
    } catch (err) {
      $('#error').textContent = err.message;
      boton.disabled = false;
      boton.textContent = 'Enviar opinión';
    }
  });

  const btnActiva = $('#btn-activa');
  const activa = v.activa === '1';
  btnActiva.textContent = activa ? 'Marcar como desmontada' : 'Volver a activar';
  btnActiva.addEventListener('click', async () => {
    btnActiva.disabled = true;
    try {
      await enviar('activa', { via_id: id, activa: !activa });
      await vistaVia(id);
    } catch (err) {
      btnActiva.disabled = false;
      btnActiva.textContent = err.message;
    }
  });
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
  return `<div class="histograma" aria-label="Distribución de grados sugeridos">${barras}</div>`;
}

async function router() {
  const [, ruta, id] = location.hash.split('/');
  try {
    if (ruta === 'nueva') vistaNueva();
    else if (ruta === 'via' && id) await vistaVia(id);
    else await vistaLista();
  } catch (err) {
    app.innerHTML = `<p class="error">${esc(err.message)}</p><a href="#/">Volver</a>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', router);
router();
