# Grados del gimnasio

App web para que la gente del gimnasio opine si las vías están bien graduadas.

- Cargar una vía: nombre, sector, color de presas, grado marcado, descripción y foto del inicio.
- Marcarla como encadenada (de top o de primero) y decir qué grado te pareció.
- Cada vía muestra el grado promedio que le da la gente, si parece más blanda / justa / dura, y un histograma de votos.
- Una opinión por persona y vía (si volvés a opinar, se actualiza).
- Las vías se pueden marcar como desmontadas cuando se cambian.

## Cómo funciona

- **GitHub Pages** sirve la página (`index.html`, `app.js`, `style.css`, `grados.js`, `config.js`).
- **Google Sheets** es la base de datos: hojas `vias` y `encadenes`.
- **Google Drive** guarda las fotos, en la carpeta "Grados del gimnasio - fotos".
- **Apps Script** (`apps-script/Code.gs`) conecta la página con la planilla.

## Instalación

Conviene usar una cuenta de Gmail personal o del gimnasio. Las cuentas de empresa (Google Workspace)
suelen bloquear que el script sea público o que las fotos se compartan con link.

### 1. La planilla y el script

1. Creá una planilla nueva en [sheets.new](https://sheets.new) y ponele un nombre, por ejemplo "Grados del gimnasio".
2. Andá a **Extensiones → Apps Script**. Borrá lo que haya en `Código.gs` y pegá el contenido de `apps-script/Code.gs`.
3. En **Configuración del proyecto** (⚙️, en la barra de la izquierda) marcá
   **Mostrar el archivo de manifiesto "appsscript.json" en el editor**. Volvé al **Editor** (`< >`), abrí
   `appsscript.json`, borrá lo que tenga y pegá el contenido de `apps-script/appsscript.json`. Guardá (💾).

   Este archivo limita los permisos: el script solo puede usar **esta planilla** y, en Drive, **solo los
   archivos que crea él mismo** (la carpeta de fotos y las fotos). No ve el resto de tu Drive ni tus otras planillas.
4. Arriba, en el desplegable de funciones, elegí `configurar` y tocá **Ejecutar**.
   Google te va a pedir permisos:
   - Elegí tu cuenta.
   - Aparece "Google no verificó esta app": tocá **Configuración avanzada → Ir a … (no seguro)**. Es tu propio script, no hay problema.
   - Revisá que los permisos digan "solo la hoja de cálculo en la que se instaló" y "solo los archivos
     de Drive específicos que uses con esta app". Si te pide acceso a todo, falta el paso 3.
   - Tocá **Permitir**.

   Esto crea las hojas `vias` y `encadenes` y la carpeta de fotos en tu Drive.
5. Tocá **Implementar → Nueva implementación**. En el engranaje elegí **Aplicación web** y configurá:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
6. Tocá **Implementar** y copiá la URL que te da (termina en `/exec`).

### 2. La página

1. Abrí `config.js` y pegá la URL del paso anterior:
   ```js
   window.API_URL = 'https://script.google.com/macros/s/XXXX/exec';
   ```
2. Creá un repositorio **público** en GitHub y subí todos los archivos. Podés arrastrarlos desde la web con
   **Add file → Upload files**.
3. En el repo andá a **Settings → Pages**. En "Source" elegí **Deploy from a branch**, rama `main`, carpeta `/ (root)` y guardá.
4. Al minuto la app queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

## Mantenimiento

- **Moderar:** editá o borrá filas directamente en la planilla. Si borrás una vía, borrá también sus filas en `encadenes`.
- **Si cambiás `Code.gs`:** tenés que publicar una versión nueva en **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión**.
  Si no, la URL sigue usando el código viejo. La URL no cambia.
- **Cambiar la escala de grados:** está en `grados.js` y al principio de `Code.gs`. Las dos listas tienen que ser iguales.
- **Probar en tu compu:** corré `python3 -m http.server` en esta carpeta y abrí http://localhost:8000.
