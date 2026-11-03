// Backend de la app. Se pega en la planilla: Extensiones > Apps Script.
// La planilla hace de base de datos (hojas "vias" y "encadenes") y las fotos van a una carpeta de Drive.

// Tiene que coincidir con grados.js del frontend.
const GRADOS = [
  '4', '4+', '5a', '5a+', '5b', '5b+', '5c', '5c+',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a',
];
const COLUMNAS = {
  vias: ['id', 'nombre', 'sector', 'color', 'grado', 'descripcion', 'foto', 'activa', 'creada'],
  encadenes: ['id', 'via_id', 'escalador', 'estilo', 'grado_sugerido', 'comentario', 'fecha'],
};
const CARPETA_FOTOS = 'Grados del gimnasio - fotos';

// Devuelve todo de una vez: son pocos datos y así la página hace un solo pedido.
function doGet() {
  return responder(() => ({ vias: leer('vias'), encadenes: leer('encadenes') }));
}

function doPost(e) {
  return responder(() => {
    const b = JSON.parse(e.postData.contents);
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      if (b.accion === 'crearVia') return crearVia(b);
      if (b.accion === 'encadenar') return encadenar(b);
      if (b.accion === 'activa') return cambiarActiva(b);
      throw new Error('Acción desconocida');
    } finally {
      lock.releaseLock();
    }
  });
}

// Corré esta función una vez desde el editor para crear las hojas y dar los permisos.
function configurar() {
  hoja('vias');
  hoja('encadenes');
  carpetaFotos();
}

function responder(fn) {
  let data;
  try {
    data = fn();
  } catch (err) {
    data = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function hoja(nombre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let h = ss.getSheetByName(nombre);
  if (!h) {
    h = ss.insertSheet(nombre);
    h.appendRow(COLUMNAS[nombre]);
    h.setFrozenRows(1);
  }
  return h;
}

function leer(nombre) {
  const [encabezado, ...filas] = hoja(nombre).getDataRange().getDisplayValues();
  return filas.map((f) => Object.fromEntries(encabezado.map((k, i) => [k, f[i]])));
}

// El apóstrofo fuerza texto: evita que "4" quede como número, que las fechas se reformateen
// y que un comentario que empieza con "=" se interprete como fórmula.
function fila(nombre, obj) {
  return COLUMNAS[nombre].map((k) => "'" + (obj[k] == null ? '' : obj[k]));
}

function texto(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function crearVia(b) {
  const nombre = texto(b.nombre, 80);
  const grado = texto(b.grado, 5);
  if (!nombre) throw new Error('Falta el nombre');
  if (!GRADOS.includes(grado)) throw new Error('Grado inválido');
  const id = Utilities.getUuid().slice(0, 8);
  hoja('vias').appendRow(fila('vias', {
    id,
    nombre,
    sector: texto(b.sector, 60),
    color: texto(b.color, 30),
    grado,
    descripcion: texto(b.descripcion, 1000),
    foto: guardarFoto(b.foto, id),
    activa: 1,
    creada: new Date().toISOString(),
  }));
  return { id };
}

function encadenar(b) {
  const vias = leer('vias');
  if (!vias.some((v) => v.id === b.via_id)) throw new Error('Vía no encontrada');
  const escalador = texto(b.escalador, 60);
  if (!escalador) throw new Error('Falta tu nombre');
  if (!['top', 'primero'].includes(b.estilo)) throw new Error('Estilo inválido');
  if (!GRADOS.includes(b.grado_sugerido)) throw new Error('Grado inválido');

  // Una opinión por persona y vía: si ya opinó, se reemplaza.
  const encadenes = leer('encadenes');
  const i = encadenes.findIndex(
    (e) => e.via_id === b.via_id && e.escalador.toLowerCase() === escalador.toLowerCase()
  );
  const valores = fila('encadenes', {
    id: i >= 0 ? encadenes[i].id : Utilities.getUuid().slice(0, 8),
    via_id: b.via_id,
    escalador,
    estilo: b.estilo,
    grado_sugerido: b.grado_sugerido,
    comentario: texto(b.comentario, 500),
    fecha: new Date().toISOString(),
  });
  const h = hoja('encadenes');
  if (i >= 0) h.getRange(i + 2, 1, 1, valores.length).setValues([valores]);
  else h.appendRow(valores);
  return { ok: true };
}

function cambiarActiva(b) {
  const i = leer('vias').findIndex((v) => v.id === b.via_id);
  if (i < 0) throw new Error('Vía no encontrada');
  const col = COLUMNAS.vias.indexOf('activa') + 1;
  hoja('vias').getRange(i + 2, col).setValue("'" + (b.activa ? 1 : 0));
  return { ok: true };
}

function guardarFoto(dataUrl, id) {
  if (!dataUrl) return '';
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('Formato de foto no soportado');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), 'image/' + m[1]);
  const archivo = Drive.Files.create({ name: id + '.' + m[1], parents: [carpetaFotos()] }, blob);
  Drive.Permissions.create({ role: 'reader', type: 'anyone' }, archivo.id);
  return archivo.id;
}

// Se usa el servicio avanzado de Drive (y no DriveApp) porque permite el permiso drive.file:
// el script solo ve los archivos que crea él mismo, no el resto del Drive.
function carpetaFotos() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('carpetaFotos');
  if (id) {
    try {
      if (!Drive.Files.get(id, { fields: 'trashed' }).trashed) return id;
    } catch (err) {
      // La carpeta se borró o no la creó este script: se crea otra.
    }
  }
  const carpeta = Drive.Files.create({ name: CARPETA_FOTOS, mimeType: 'application/vnd.google-apps.folder' });
  props.setProperty('carpetaFotos', carpeta.id);
  return carpeta.id;
}
