# LearnDrive — Manual de Uso y Ficha Técnica

**Versión de la app:** 2.1.0
**Nombre visible (PWA):** LearnDrive AI — Capacitaciones SST
**Tipo de producto:** Plataforma web progresiva (PWA) *mobile-first* de capacitación corporativa, evaluación, emisión de certificados y firma digital de actas de recepción de documentos.
**Base de datos:** Google Sheets (lectura pública vía CSV) + Google Apps Script (escritura vía proxy REST) + Google Drive (almacenamiento de PDFs, selfies, firmas y videos).

---

## Índice

1. [Visión general y ficha técnica](#1-visión-general-y-ficha-técnica)
2. [Requisitos y acceso](#2-requisitos-y-acceso)
3. [Manual de Usuario (trabajador / aprendiz)](#3-manual-de-usuario-trabajador--aprendiz)
4. [Manual de Administrador](#4-manual-de-administrador)
5. [Arquitectura y sincronización de datos](#5-arquitectura-y-sincronización-de-datos)
6. [Seguridad, privacidad y datos sensibles](#6-seguridad-privacidad-y-datos-sensibles)
7. [Preguntas frecuentes y solución de problemas](#7-preguntas-frecuentes-y-solución-de-problemas)

---

## 1. Visión general y ficha técnica

| Campo | Detalle |
|---|---|
| Nombre del producto | LearnDrive |
| Versión actual | 2.1.0 |
| Tipo de aplicación | Progressive Web App (PWA), instalable en Android/iOS/Desktop |
| Frontend | React 19 + Vite 8 + TypeScript + Tailwind CSS 4 + Framer Motion |
| Base de datos | Google Sheets (una sola hoja de cálculo con múltiples pestañas) |
| Backend de escritura | Google Apps Script publicado como aplicación web (proxy REST vía POST) |
| Almacenamiento de archivos | Google Drive (PDFs de certificados/actas, selfies, firmas) |
| Detección facial | MediaPipe FaceDetection (cargado por CDN en tiempo de ejecución) |
| Generación de PDF | html2pdf.js (renderiza una plantilla HTML oculta y la exporta) |
| Modo offline | Service Worker (Workbox) + cola de reintentos en `localStorage` |
| Hospedaje sugerido | Vercel / GitHub Pages (`npm run deploy`) |
| Perfiles de usuario (audiencias) | Obrero, Empleado Superficie, Empleado Mina, Energías, Conductor |
| Autenticación | Sin contraseña: identificación por DNI (8 dígitos) + nombre/apellido |
| Panel administrativo | Protegido por una contraseña simple (`adminPass`, configurable desde la hoja `CONFIG`) |

### Módulos funcionales

1. **Aprendizaje**: cursos ("Temas") compuestos por lecciones ("chunks") con video y/o texto enriquecido.
2. **Evaluación**: cuestionarios de opción múltiple con temporizador y monitoreo antidistracción por cámara.
3. **Certificación**: emisión de certificado PDF con firma dibujada y selfie de verificación, subido a Drive.
4. **Actas y Compromisos**: firma digital de una "Acta de Recepción de Documentos" (EPP, reglamentos, capacitaciones) con firma, selfie, geolocalización y folio único; envío automático por correo.
5. **Evaluaciones cortas públicas**: cuestionarios independientes, accesibles por enlace público, sin necesidad de pasar por el login principal.
6. **Panel de Administración**: gestión CRUD de todo el contenido (temas, lecciones, preguntas), configuración de marca, gestión de actas, evaluaciones cortas, progreso de usuarios y diagnóstico del sistema.

### Hojas de Google Sheets utilizadas

| Pestaña | Contenido |
|---|---|
| `LEARN` | Temas/cursos (título, audiencia, resumen, puntos clave, orden, activo) |
| `DATA` | Lecciones/"chunks" de cada tema (contenido, videos, PDF, contexto) |
| `QUIZ` | Banco de preguntas de evaluación por tema |
| `INGRESOS` | Registro de usuarios: datos personales, perfil, progreso, notas |
| `CONFIG` | Configuración dinámica de la app (branding, contacto, contraseña admin, etc.) |
| `CERTIFICADOS` | Enlaces a certificados PDF generados, por DNI y curso |
| `SHORT_EVALUACIONES` | Definición de evaluaciones cortas públicas |
| `SHORT_RESULTADOS` | Resultados de evaluaciones cortas |
| `ACTAS_DOCUMENTOS` | Documentos/compromisos configurables para firma |
| `ACTAS_FIRMAS` | Registro de cada firma de acta realizada |

---

## 2. Requisitos y acceso

- **Dispositivo:** cualquier smartphone, tablet o computadora con navegador moderno (Chrome, Edge, Safari, Firefox).
- **Cámara:** requerida para la evaluación con monitoreo antidistracción, la selfie del certificado y la selfie de firma de actas.
- **Conexión a internet:** requerida para iniciar sesión y sincronizar; una vez cargado el contenido, partes de la app funcionan offline (ver [sección 3.12](#312-modo-offline)).
- **URL de acceso:** la proporciona el administrador (dominio propio o `https://learninnews.vercel.app`).
- **No se requiere contraseña de usuario** — el acceso es por DNI.

---

## 3. Manual de Usuario (trabajador / aprendiz)

### 3.1 Ingreso (Login)

Pantalla inicial al abrir la app.

1. Ingresa tu **DNI** (exactamente 8 dígitos numéricos; el campo solo acepta números).
2. Si el DNI ya fue usado antes en ese dispositivo o está en la base de conocidos global, los campos **Apellidos** y **Nombres** se autocompletan y se bloquean (candado 🔒, mensaje "Usuario registrado — datos bloqueados") para evitar suplantaciones o errores de tipeo.
3. Si es la primera vez, escribe tus **Apellidos** y **Nombres** (se guardan en mayúsculas automáticamente).
4. Presiona **INGRESAR**.
   - Si el DNI ya existe en el sistema (hoja `INGRESOS`), se restaura tu sesión completa: perfil, progreso de cursos, notas y certificados ya emitidos.
   - Si el DNI no existe, se crea una sesión nueva y continúas al formulario de perfil.
5. Si necesitas ayuda, toca **Soporte Técnico** al pie de la pantalla para abrir un chat de WhatsApp preconfigurado con el número de contacto definido por el administrador.

### 3.2 Completar Perfil (solo la primera vez)

Formulario obligatorio antes de poder usar la app. Se muestra únicamente si tu registro en `INGRESOS` no tiene aún el campo "Área" lleno.

**Datos laborales**
- **Empresa** *(lista: AESA, FERREYROS, TH, LUCARBAL, OTROS — con campo de texto libre si eliges "OTROS")*
- **Área** *(lista: Avances, Servicios, Administración, Logística, Mantenimiento, Seguridad, Oficina Técnica)*
- **Cargo / Puesto** *(texto libre, ej. "Operador de Equipo")*
- **Fecha de Ingreso a Unidad** *(selector de fecha, no puede ser futura)*

**Datos personales**
- **Fecha de Nacimiento** *(selector de fecha, no puede ser futura)*
- **Correo electrónico** *(validado con formato `algo@dominio.com`)*
- **Celular** *(exactamente 9 dígitos)*

**Contacto de Emergencia 1** *(obligatorio)*
- Número (9 dígitos) y Parentesco *(Esposa(o), Padre, Madre, Hijo(a), Otros — con texto libre si es "Otros")*

**Contacto de Emergencia 2** *(opcional)*
- Mismos campos; si no se ingresa número, se omite por completo.

Al presionar **GUARDAR Y CONTINUAR** (botón disponible arriba y abajo del formulario), el sistema valida todos los campos obligatorios y muestra el error específico bajo cada campo si falta algo. Al completarse correctamente, avanzas a la selección de perfil.

> Este formulario no se vuelve a mostrar en logins posteriores: tus datos quedan guardados y se restauran automáticamente.

### 3.3 Selección de Perfil / Audiencia (Onboarding)

Define qué cursos verás en tu Dashboard.

1. Elige **uno o más perfiles** tocando las tarjetas: Obrero, Empleado Superficie, Empleado Mina, Energías, Conductor.
2. Algunos perfiles son **mutuamente excluyentes**: Obrero, Empleado Superficie y Empleado Mina no pueden combinarse entre sí (al elegir uno, los otros dos se deshabilitan con un ícono de prohibido 🚫). Energías y Conductor sí pueden combinarse con cualquiera.
3. Presiona **Confirmar perfil(es)** y luego **Sí, continuar** en el modal de confirmación.

> ⚠️ **Esta selección no se puede modificar nuevamente por el propio usuario** una vez confirmada (queda fijada en tu registro `INGRESOS`). Si necesitas cambiarla, debe hacerlo un administrador.

### 3.4 Dashboard (pantalla principal)

Al ingresar verás:

- **Encabezado** con el nombre de la app y chips de tu(s) perfil(es) asignado(s).
- **Tarjeta "Actas y Compromisos"** (si el módulo está habilitado y tienes documentos asignados): indica cuántos documentos tienes pendientes de firmar, o confirma que ya firmaste todo.
- **Estadísticas**: número de cursos disponibles para tu perfil, cursos aprobados, y porcentaje de aprobación general.
- **Lista de cursos** ("Tus cursos programados"), cada tarjeta muestra:
  - Ícono de estado: libro (no iniciado), reloj (en progreso), check verde (completado).
  - Número de lecciones y de preguntas del curso.
  - Tu nota actual si ya rendiste el quiz (verde si ≥16/20, ámbar si menor).
  - Barra de progreso inferior si el curso está a medias.
  - Botón **Generar Certificado** si aprobaste (nota ≥16/20) y aún no lo generaste; o **Ver Certificado** con opciones para **Abrir en Drive** o **Enviar a WhatsApp** si ya lo generaste.
- **Botón flotante de video-tutorial** (esquina inferior derecha) si el administrador cargó un video de ayuda.
- **Botones superiores**: instalar app (📥), cerrar sesión, panel admin (⚙️), cambiar tema claro/oscuro (☀️/🌙).

### 3.5 Detalle del curso

Al tocar un curso se muestra:
- Portada con el título y tu estado de avance.
- **Resumen del módulo** y **Puntos clave** (si el administrador los configuró).
- Panel de acciones: **IR A LECCIÓN** y **EVALUACIÓN** (deshabilitado si el curso no tiene preguntas cargadas).
- Tu **nota actual** sobre 20 y el mínimo aprobatorio (16/20).
- Vista previa de 2 preguntas del banco de evaluación.

### 3.6 Modo Aprendizaje (lecciones)

- Navega lección por lección con los botones **Anterior** / **Siguiente lección** (el último botón cambia a **FINALIZAR MÓDULO**).
- Si una lección tiene video, puedes alternar entre **VER VIDEO** y **LEER RESUMEN** con el selector superior; los videos se abren en un reproductor a pantalla completa ("modo cine") con opción de **abrir en Google Drive**.
- Si hay un PDF técnico adjunto, aparece un botón **ABRIR PDF TÉCNICO**.
- El contenido de texto admite formato enriquecido (negritas, listas, imágenes, tablas).
- Tu avance (lección actual) se guarda automáticamente en cada cambio de lección y se sincroniza a la nube cada 3 lecciones, para poder retomar desde cualquier dispositivo.
- En computadoras (pantallas grandes) se muestra además un panel lateral con el índice completo de lecciones.
- Al llegar a la última lección y presionar **FINALIZAR MÓDULO**, se muestra una pantalla de **recapitulación** con los puntos clave y los temas cubiertos antes de pasar a la evaluación. Botón **Ir a la evaluación**.

### 3.7 Evaluación (Quiz)

- El cuestionario toma únicamente las preguntas del curso actual y las presenta en **orden aleatorio**; el orden de las opciones A–D también se mezcla por pregunta (medida anticopia).
- **Temporizador de 30 segundos por pregunta**: si se agota, la pregunta se marca como incorrecta y avanza automáticamente.
- Selecciona una opción, presiona **Confirmar** para ver el feedback (correcto/incorrecto + explicación), luego **Siguiente Pregunta** (o **Ver Resultado Final** en la última).
- **Monitoreo antidistracción** (obligatorio, requiere permiso de cámara):
  - Se activa la cámara frontal (miniatura visible en la esquina inferior derecha con contador `X/5`).
  - Se detectan dos tipos de distracción: **cambiar de pestaña/aplicación** (instantáneo) y **no mirar la pantalla / ausencia de rostro** sostenida por 5 segundos (con aviso previo no bloqueante de cuenta regresiva).
  - Cada distracción detectada muestra un aviso a pantalla completa durante 5 segundos.
  - Al acumular **5 distracciones**, el cuestionario **se reinicia por completo** (se pierden las respuestas de ese intento) y se muestra un aviso.
  - Si la cámara no está disponible/permitida, la miniatura no se muestra pero el aviso de cambio de pestaña sigue activo.
- **Tu progreso se guarda automáticamente** pregunta por pregunta (local y en la nube); si sales de la evaluación (botón atrás) puedes **retomarla exactamente donde la dejaste** (se muestra la etiqueta "Retomando").
- Al finalizar se muestra tu **nota final sobre 20** y el número de respuestas correctas, con opción de **Finalizar y Continuar** o **Intentar de nuevo** (reinicia el intento).
- **Nota mínima aprobatoria: 16/20.**

### 3.8 Generar Certificado

Disponible desde el Dashboard cuando apruebas un curso (nota ≥16/20). Es un asistente de 4 pasos:

1. **Verifica tus Datos**: nombre completo, DNI (fijo), cargo y celular (editable). Debes completar cargo y celular (9 dígitos) para continuar.
2. **Firma del Participante**: dibuja tu firma con el dedo o mouse sobre el lienzo blanco. Botón **LIMPIAR** para reintentar.
3. **Validación Biométrica (selfie)**: coloca tu rostro dentro del óvalo guía; el sistema detecta automáticamente cercanía y centrado (mensajes: *acércate*, *aléjate*, *centra tu rostro*) y, al mantenerte estable ~3 segundos con el óvalo en verde, **toma la foto automáticamente** (no hay botón manual de disparo). Puedes **REPETIR** o **REINICIAR CÁMARA** si algo falla.
4. Presiona **GENERAR CERTIFICADO**: se arma el PDF (incluye tu firma, selfie, fecha/hora, nota y resumen de preguntas por categoría) y se sube automáticamente a Google Drive.
5. Pantalla de éxito con botones: **DESCARGAR PDF** (local), **COMPARTIR POR WHATSAPP** (envía el enlace de Drive) y **VOLVER AL DASHBOARD**.

El enlace del certificado queda guardado en tu sesión y visible desde el Dashboard en cualquier momento ("Ver Certificado").

### 3.9 Actas y Compromisos

Solo visible si el administrador habilitó el módulo y te asignó documentos (por tu perfil o por tu DNI específico).

**Pantalla "Actas y Compromisos":**
- Lista de todos los documentos que te corresponde recibir (reglamentos, EPP, procedimientos, capacitaciones, etc.), cada uno marcado como **Virtual** (con botón **Ver** para previsualizarlo dentro de la app) o **Físico** (entrega en papel, sin archivo digital).
- Estado general: **Pendiente de firma** o **Acta firmada** (con fecha y enlace al PDF en Drive).

**Proceso de firma (botón "Firmar"), asistente de pasos:**

1. **Confirmación**: marca (check ✓) cada documento que efectivamente recibiste — por defecto todos están marcados; puedes destildar los que no te correspondan. Lee la **declaración de compromiso** y escribe el **correo** donde recibirás la copia firmada.
2. **Firma del Trabajador**: dibuja tu firma.
3. **Firma para Lista de Asistencia** *(solo si alguno de los documentos marcados es una capacitación)*: firma adicional e independiente, requerida para el registro formal de asistencia (documento RG-CL-SSMA-1-F62).
4. **Validación Biométrica (selfie)**: mismo mecanismo automático que en el certificado.
5. Presiona **FIRMAR ACTA**: se genera el PDF con folio único de verificación (`AC-<DNI>-<timestamp>`), tu firma, selfie, fecha/hora exacta (zona horaria Lima), **geolocalización aproximada** (si el navegador la permite) y datos del dispositivo/navegador usado — todo como refuerzo de la verificación de identidad.
6. El acta se guarda en Drive y se **envía automáticamente por correo** a la dirección indicada. Pantalla final con **DESCARGAR PDF**, **VER EN DRIVE** y aviso de si el correo se envió o no.

> Solo existe **una acta general por trabajador** que agrupa todos sus documentos asignados; una vez firmada, no se puede volver a firmar (a menos que el administrador reasigne nuevos documentos).

### 3.10 Evaluaciones cortas (enlace público)

Accesibles mediante un enlace especial que el administrador comparte (formato `.../#/eval/ID-DE-LA-EVALUACION`), **sin pasar por el login normal de la app**.

1. Se abre directamente el formulario de la evaluación con su nombre y descripción.
2. Completa **DNI, Apellidos y Nombres** (si ya rendiste esa evaluación antes con ese DNI, el sistema te lo reconoce y bloquea un segundo intento).
3. Responde las preguntas (máximo 15, aleatorias, con feedback inmediato y **30 segundos por pregunta**).
4. Al finalizar ves tu **nota sobre 20**, el porcentaje, si aprobaste o no, y el detalle de tus respuestas incorrectas con la explicación correcta.
5. El resultado se guarda automáticamente; **solo se permite un intento por evaluación y por DNI**.

### 3.11 Instalar la app en tu celular/computadora (PWA)

Botón de descarga (📥) visible en la esquina superior derecha en la mayoría de pantallas:

- **Android / Chrome / Edge (Desktop):** al tocar el botón se abre el diálogo nativo de instalación del navegador; acepta y el ícono aparecerá en tu pantalla de inicio o escritorio.
- **iPhone / iPad (Safari):** el navegador no permite instalación automática, así que se muestra una guía con 3 pasos: 1) toca **Compartir** en la barra de Safari, 2) selecciona **"Agregar a inicio"**, 3) confirma con **"Agregar"**.
- El botón desaparece automáticamente una vez que la app ya está instalada.

### 3.12 Modo Offline

- El contenido de cursos/lecciones/preguntas que ya visitaste queda disponible sin conexión (estrategia *stale-while-revalidate*: se muestra lo último guardado mientras se intenta refrescar en segundo plano).
- Si respondes una evaluación o completas una acción sin conexión, la escritura se **encola localmente** y se reintenta automáticamente en cuanto vuelve la señal de internet (o al reabrir la app).
- Acciones que requieren generar un PDF (certificados, actas) sí necesitan conexión activa para subir el archivo a Drive.

### 3.13 Cerrar sesión / cambiar de tema

- **Cerrar sesión** (ícono de salida, visible en Dashboard y Detalle de curso): pide confirmación; tu progreso queda respaldado localmente por DNI, así que si vuelves a ingresar con el mismo DNI se restaura automáticamente.
- **Cambiar tema** (☀️/🌙): alterna entre modo oscuro (por defecto) y modo claro; se recuerda entre sesiones.

---

## 4. Manual de Administrador

### 4.1 Acceso al panel

1. Toca el ícono de **⚙️ Admin** (visible en la esquina superior derecha desde el login, dashboard o detalle de curso).
2. Ingresa la contraseña de administrador y presiona **"Acceder al Panel"** (hay un botón con ícono de ojo para mostrar/ocultar la contraseña, y un botón **"Volver"** para salir sin ingresar).
3. Esta contraseña se compara contra la columna `adminPass` de la hoja `CONFIG`; si esa columna está vacía, se usa una contraseña de respaldo fija en el código (`123456` — **se recomienda definir una propia en Configuración → Contraseña de administrador**). No hay límite de intentos ni bloqueo por fuerza bruta, solo un mensaje "Contraseña incorrecta".
4. La sesión de administrador queda activa **mientras la pestaña del navegador siga abierta** (no persiste si cierras el navegador). Para salir, usa **"Cerrar sesión"** en el encabezado del panel.

### 4.2 Navegación del panel (barra lateral)

El panel usa una barra lateral plegable (ícono de hamburguesa en el encabezado) con dos grupos de accesos:

- **Grupo "Cursos"** (requiere primero elegir un módulo/tema activo): **Resumen**, **Contenido** (con contador de secciones) y **Quizzes** (con contador de preguntas). Mientras no elijas un módulo, estas tres opciones aparecen deshabilitadas.
- **Accesos directos** (siempre disponibles): **Usuarios** (progreso), **Evals** (evaluaciones cortas), **Documentos y Capacitaciones** (actas) y **Configuración**.

En el encabezado superior también encontrarás: **Test conexión**, el botón de **Diagnóstico** (🩺), **Refrescar datos** y **Cerrar sesión**. Un botón flotante fijo en la esquina inferior enlaza directo a la hoja de Google Sheets del proyecto, como acceso de emergencia a la base de datos cruda.

### 4.3 Pestaña "Temas" (módulos de capacitación) — hoja `LEARN`

Si no tienes un módulo elegido, verás la lista de todos los temas existentes (título, audiencia, estado). Toca uno para seleccionarlo; queda fijado en un banner **"Módulo activo"** en la parte superior, desde donde puedes reabrir el selector en cualquier momento.

**Formulario de un tema:**
- **Título**
- **ID (Único)** — solo editable si el tema es nuevo (no se puede cambiar después de creado)
- **Descripción Corta**
- **Puntos Clave (un punto por línea)** — cada Enter continúa automáticamente con una viñeta
- **Audiencia** — chips de los 5 perfiles (Obrero, Empleado Superficie, Empleado Mina, Energías, Conductor) + botón "Todos"
- **Orden** (numérico, define la posición en el Dashboard del usuario)
- **Estado**: Activo (Visible) / Oculto

**Acciones:** ícono de papelera para eliminar (pide confirmación); botón flotante **"+"** para **añadir nuevo módulo**; barra inferior con **"Deshacer"** y **"Sincronizar Módulos"** (solo aparece si hay cambios pendientes).

**Flujo — crear un tema nuevo:**
1. Botón flotante "+" → se crea el borrador y se abre su formulario automáticamente.
2. Completa Título, Descripción, Puntos Clave, Audiencia, Orden y Estado.
3. Presiona **"Sincronizar Módulos"**. Si hay error, se muestra un banner rojo con el mensaje devuelto por el servidor; si todo sale bien, un aviso de éxito y los datos se refrescan.

### 4.4 Pestaña "Resumen" (overview del módulo activo) — hoja `LEARN`

Solo lectura: 4 tarjetas con el total de **Secciones**, **Preguntas**, si está **Activo** y cuántas **Audiencias** tiene asignadas el módulo seleccionado. Sirve como vistazo rápido antes de entrar a Contenido o Quizzes.

### 4.5 Pestaña "Contenido" (lecciones del módulo) — hoja `DATA`

Cada lección ("sección") es una tarjeta colapsable, coloreada según su estado (verde = nueva, azul = modificada, gris = sin cambios). Al expandir una sección:

- **Título**
- **Contenido (Markdown / HTML)** — con botón **"Vista previa"** que abre un editor de pantalla completa con 3 modos: **Ver** (previsualización), **Editar** (texto plano) y **Bloques** (divide el contenido en bloques y permite eliminar bloques individuales sin perder el resto — útil para depurar contenido largo). Desde ese editor también puedes exportar la sección a **PDF** (usa el motor de impresión del navegador) y **guardar solo esa sección** sin esperar el guardado masivo de toda la pestaña.
- **Contexto**: Teórico / Práctico / Normativo / Caso Real / Procedimiento
- **Orden**
- **Videos y Recursos Multimedia**: hasta 3 enlaces de Google Drive (Video 1/2/3), un comentario libre y un enlace a **PDF**.

**Asistentes de IA (solo si hay un PDF cargado en la sección):**
- **"PROMPT QUIZ"**: extrae el texto del PDF de Drive y copia al portapapeles un prompt listo para pegar en una IA externa (ChatGPT, Gemini, etc.) que pide generar un cuestionario de opción múltiple.
- **"PROMPT CONTENIDO"**: mismo mecanismo, pero el prompt pide reescribir el contenido del PDF como Markdown/HTML interactivo, conservando toda la información.
- Ambos requieren que el servidor de la app esté corriendo (en desarrollo local) para poder extraer el texto del PDF; si falla, se muestra un aviso explicando el motivo.

**Acciones generales:** botón flotante **"+"** ("Añadir sección manual"); papelera por sección; barra inferior con **"Exportar CSV"** (copia al portapapeles), **"Deshacer"** y **"Sincronizar (N cambios)"**.

**Flujo — crear una lección con ayuda de IA:**
1. Selecciona el módulo → pestaña Contenido → "+".
2. Completa Título, Contexto, Orden, y pega enlaces de Drive (Video/PDF).
3. Si hay PDF: usa "PROMPT CONTENIDO", pégalo en una IA, copia el resultado en el campo Contenido.
4. Presiona "Sincronizar (N cambios)".

### 4.6 Pestaña "Quiz" (banco de preguntas) — hoja `QUIZ`

**Barra de acciones:** contador de preguntas, **"Colapsar todas"**, filtro por categoría de contenido, **"Plantilla"** (descarga un Excel de ejemplo con las columnas correctas) e **"Importar"** (sube un Excel `.xlsx` y agrega cada fila como pregunta nueva al borrador — tolera nombres de columna en español/inglés y mayúsculas/minúsculas; las filas sin el campo Pregunta se descartan sin avisar).

**Cada pregunta** (tarjeta colapsable, se auto-expande si está incompleta):
- **Pregunta**
- **4 opciones A/B/C/D** — toca la letra para marcarla como la respuesta correcta (se resalta en verde)
- **Justificación** (explicación que ve el usuario tras responder)
- **Dificultad**: Fácil / Media / Difícil
- **Categoría del Contenido** — debe coincidir con el título de una sección de Contenido; es lo que vincula la pregunta a una lección específica y habilita las **evaluaciones cortas por sección**.

**Validación al guardar:** si alguna pregunta nueva o modificada tiene un campo vacío (pregunta, alguna opción o sin sección asignada), el sistema **bloquea todo el guardado** con el aviso: *"Completa todos los campos de cada pregunta antes de guardar (pregunta, 4 opciones y sección)."*

**Acciones generales:** botón flotante **"+"** ("Añadir pregunta manual"); barra inferior con **"Exportar"**, **"Deshacer"** y **"Sincronizar (N)"**.

**Flujo — generar e importar preguntas con IA:**
1. En Contenido, usa "PROMPT QUIZ" sobre el PDF de una lección y pégalo en una IA externa.
2. Convierte el resultado a la plantilla Excel descargada (o carga las preguntas manualmente con "+").
3. Importa el Excel con "Importar"; asigna la Categoría del Contenido igual al título de la lección relacionada.
4. Sincroniza.

### 4.7 Pestaña "Usuarios" (progreso) — hoja `INGRESOS` (+ Certificados, Actas, Evaluaciones cortas)

**Estadísticas y gráficos:** total de usuarios, avance promedio, nota promedio; gráfico de barras de **distribución de notas** (5 rangos), gráfico de **registros por semana** (últimas 8 semanas) y una **dona de aprobación** (nota ≥14).

**Filtros:** búsqueda por nombre/DNI, y selects de empresa y de perfil/audiencia.

**Exportación a Excel:**
- **"Excel"**: hoja completa de seguimiento (datos personales + avance y nota por cada módulo del sistema).
- **"Usuarios"**: listado básico (fecha de inicio, semana, área, cargo, nombre) ordenado por antigüedad.

**Listado**, agrupado por semana de registro, con botón **"Ver más usuarios"** para cargar de a 30. Cada fila se expande mostrando:
- Datos de perfil (área, cargo, correo, DNI, fecha de inicio, último acceso, dispositivo) + botón **"Editar"**.
- **Avance por módulo** con barra de progreso y nota; enlace **"Cert."** si ya emitió certificado de ese módulo.
- **Vista 360°**: evaluaciones cortas rendidas, certificados emitidos y actas firmadas, cada uno con su enlace al PDF correspondiente en Drive.

**Editar perfil de un usuario:** permite corregir su **Perfil/audiencia**, **Correo** y **DNI**. ⚠️ Si cambias el DNI, se muestra la advertencia: *"Se actualizará también en certificados, actas firmadas y evaluaciones cortas de este usuario. El usuario deberá usar el nuevo DNI para volver a ingresar."*

**Flujo — revisar el progreso de un usuario:**
1. Pestaña "Usuarios" → busca por nombre o DNI (o filtra por empresa/perfil).
2. Toca la fila para expandirla.
3. Revisa avance, notas, certificados y actas firmadas.
4. Si necesitas corregir DNI/correo/perfil, usa "Editar".

### 4.8 Pestaña "Evals" (evaluaciones cortas) — hojas `SHORT_EVALUACIONES` y `SHORT_RESULTADOS`

Botón **"Nueva"** abre el formulario:
- **Nombre*** y **Descripción**
- **Módulo*** (de dónde salen las preguntas)
- **Secciones** (checkboxes; si dejas todo sin marcar, se usan **todas** las preguntas del módulo — si marcas alguna(s), solo se usan las preguntas de esas secciones)
- **"Crear evaluación"**

Cada evaluación creada se lista con: estado Activo/Inactivo, cantidad de respuestas recibidas, nota promedio, y una **caja con el enlace público** (`.../#/eval/ID`) con botón **"Copiar"** y acceso directo para abrirlo — es el enlace que compartes con los usuarios para que rindan sin pasar por el login normal.

**Acciones por evaluación:** activar/desactivar, **ver resultados** (tabla ordenable y filtrable por DNI, nombre, nota, %, fecha y cantidad de preguntas falladas; cada fila con falladas es expandible para ver el detalle), eliminar. Puedes **eliminar el resultado de un usuario puntual** para permitirle repetir la evaluación (el sistema controla "un intento" por la existencia de esa fila de resultado).

**Flujo — crear y compartir una evaluación corta:**
1. "Evals" → "Nueva" → completa Nombre, Descripción, Módulo (y Secciones si quieres limitarlas).
2. "Crear evaluación".
3. Copia el enlace público y compártelo por correo/WhatsApp.
4. Monitorea resultados en tiempo real con "Ver resultados".

### 4.9 Pestaña "Documentos y Capacitaciones" (Actas) — hojas `ACTAS_DOCUMENTOS` y `ACTAS_FIRMAS`

Cada documento que crees representa **un único documento o capacitación independiente** para firmar. Botón **"Nuevo"** abre el formulario:

1. **¿Qué vas a agregar?** — **Documento** o **Capacitación** (cambia los campos siguientes).
2. **Título*** y **Descripción**.
3. *Solo si es Capacitación:* **Nombre del capacitador** y **N° de horas** (se pedirá una firma adicional para la lista de asistencia al momento de firmar).
4. **Asignar a perfiles** (chips) **o** asignar a **DNIs específicos** separados por coma — son mutuamente excluyentes: si marcas perfiles, el campo de DNIs se bloquea y viceversa.
5. **Tipo**: **Virtual** (pega el enlace de Drive; se genera una vista previa del **código QR** que se imprimirá en el acta firmada) o **Físico** (entrega en papel, sin enlace).
6. *Solo si es Documento:* **Código**, **Versión** y **Fecha de actualización** (control documental, aparecen en el reporte de distribución).
7. Casilla **"Requiere firma dibujada (además del rostro)"**.
8. **"Crear documento"** / **"Guardar cambios"**.

**Validaciones:** el Título es obligatorio; debe haber al menos un perfil o un DNI asignado, si no, se muestra el aviso "Asigna al menos un perfil o un DNI".

> Importante: en esta pantalla el administrador **no sube ningún PDF ni firma** — solo define los metadatos y (si es virtual) el enlace de Drive del documento a mostrar. La firma, la selfie y el PDF final se generan del lado del usuario cuando firma su acta (ver [sección 3.9](#39-actas-y-compromisos)), y Apps Script los sube automáticamente a Drive.

**Cada documento en la lista** muestra su categoría, perfiles/DNIs asignados, y un contador **"X firmado(s) · Y asignado(s) (Z%)"** con barra de progreso. Acciones: **ver firmas**, **editar**, **eliminar** (las firmas ya registradas se conservan aunque borres el documento).

**Al "ver firmas" de un documento** puedes:
- Generar en PDF la **Lista de Asistencia** (documentos de categoría Capacitación, formato RG-CL-SSMA-1-F62) o la **Lista de Distribución** (documentos de categoría Documento, con código/versión) — ambos reportes se descargan directo a tu computadora, con solo quienes ya firmaron.
- Ver la **tabla de firmas**: DNI, nombre, cargo, estado (Firmado/Pendiente), fecha, correo (con indicador de si se envió), enlace al PDF firmado, y botón para **reenviar el correo** si no llegó.
- **Exportar a Excel** el detalle completo de firmas para auditoría.

**Flujo — crear y asignar un documento/capacitación:**
1. "Documentos y Capacitaciones" → "Nuevo".
2. Elige Documento o Capacitación, completa título/descripción (y capacitador/horas si aplica).
3. Asigna por perfiles o por DNIs puntuales.
4. Elige Virtual (con enlace de Drive) o Físico.
5. Completa código de control documental si aplica.
6. "Crear documento".
7. Monitorea firmas, genera los reportes en PDF cuando lo necesites y reenvía correos pendientes.

### 4.10 Pestaña "Configuración" — hoja `CONFIG`

Es un formulario de **un solo registro** (no una lista) con estos campos:

| Campo en pantalla | Qué controla |
|---|---|
| Título | Nombre de la app mostrado en el login |
| Contacto de soporte | Número de WhatsApp para el botón de soporte |
| Mensaje de bienvenida | Texto bajo el título en la pantalla de login |
| Contraseña de administrador | La misma que se usa para entrar al panel (sección 4.1) |
| Estatus de la app | Activo / Inactivo — **Inactivo bloquea el acceso a toda la app** para los usuarios |
| Logo del certificado (URL) | Logo que aparece en certificados y actas |
| Firma del representante (URL) | Firma escaneada que se imprime como "quien entrega/autoriza" |
| Nombre y Cargo del representante | Textos junto a esa firma |
| Lugar / proyecto minero | Texto fijo en el encabezado del acta |
| Contratista | Nombre de la empresa que entrega, en el acta |
| Video tutorial (URL) | Alimenta el botón flotante de tutorial en el Dashboard del usuario |
| Módulo de Actas | Casilla para mostrar/ocultar "Actas y Compromisos" a los usuarios |

Cualquier cambio activa una barra inferior con **"Deshacer"** y **"Guardar Configuración"**. Al guardar con éxito, los cambios se aplican de inmediato (sin recargar la página) — por ejemplo, una nueva contraseña de admin rige desde el siguiente ingreso al panel.

### 4.11 Test de conexión y Diagnóstico del sistema

- **"Test conexión"** (encabezado): revisa por separado la **lectura de Google Sheets** y la **escritura vía Apps Script**, mostrando dos tarjetas (verde = conectado, roja = error con el detalle crudo). Son dos mecanismos de transporte distintos y pueden fallar independientemente — por eso se muestran por separado.
- **Diagnóstico** (ícono de estetoscopio 🩺): abre un panel más profundo que verifica configuración, hojas requeridas y permisos de carpetas de Drive, con un resumen de correctos/advertencias/errores y detalle expandible por chequeo. Botón para **volver a verificar** en cualquier momento.
- **"Refrescar datos"** (encabezado): recarga temas/lecciones/preguntas desde Sheets ignorando la caché local.

### 4.12 Comportamientos importantes a tener en cuenta

- **No existe un botón único de "Guardar todo"**: cada pestaña (Temas, Contenido, Quiz, Configuración, Actas, Evals) sincroniza de forma independiente. Cambiar de pestaña no descarta tus cambios pendientes, pero **recargar la página sí los pierde** si no sincronizaste antes.
- **Sincroniza antes de cambiar de módulo activo**: si tienes cambios sin guardar en Contenido o Quiz y cambias el módulo seleccionado, esos cambios pueden perderse silenciosamente.
- **"Deshacer"** en cualquier pestaña descarta **todos** los cambios pendientes de esa pestaña (no es un deshacer paso a paso).
- **Borrar un registro nunca sincronizado** (recién creado, aún no guardado) solo lo quita de la pantalla; **borrar un registro ya existente en Sheets** sí llama al servidor. En ambos casos se pide confirmación y la acción **no se puede deshacer**.
- Verás dos tipos de notificación: banners de color en la parte superior (para guardados/sincronizaciones) y un pequeño **toast** flotante (para acciones puntuales como copiar un enlace o reenviar un correo) — ambos son normales, no indican un error de la app.
- En Actas, **Perfiles y DNIs específicos son excluyentes entre sí** en el formulario: se asigna por uno u otro, no ambos a la vez.
- Cambiar el DNI de un usuario en "Usuarios → Editar" se propaga a sus certificados, actas firmadas y resultados de evaluaciones cortas ya existentes.

### 4.13 Mapa rápido: pestaña → hoja de Google Sheets

| Pestaña del panel | Hoja(s) de Sheets que gestiona |
|---|---|
| Temas | `LEARN` |
| Resumen | `LEARN` (solo lectura) |
| Contenido | `DATA` |
| Quiz | `QUIZ` |
| Usuarios | `INGRESOS`, `CERTIFICADOS`, `ACTAS_FIRMAS`, `SHORT_RESULTADOS` |
| Evals | `SHORT_EVALUACIONES`, `SHORT_RESULTADOS` |
| Documentos y Capacitaciones | `ACTAS_DOCUMENTOS`, `ACTAS_FIRMAS` (+ `INGRESOS` para saber quién debe firmar) |
| Configuración | `CONFIG` |

---

## 5. Arquitectura y sincronización de datos

- **Lectura de contenido:** la app descarga las hojas `LEARN`, `DATA`, `QUIZ`, etc. como CSV público de Google Sheets (`gviz/tq?tqx=out:csv`), sin necesidad de API key.
- **Caché:** 30 segundos de caché "fresca" en `localStorage`; hasta 10 minutos de caché "stale" que se muestra instantáneamente mientras se refresca en segundo plano (patrón *stale-while-revalidate*). Se refresca automáticamente cada 30 segundos mientras la app está abierta.
- **Escritura:** toda escritura (registro de usuario, progreso, certificados, actas, configuración) pasa por un **Google Apps Script** publicado como aplicación web, que actúa de proxy hacia la hoja de cálculo y hacia Google Drive.
- **Archivos:** selfies, firmas y PDFs se envían como Base64 al Apps Script, que los sube a carpetas de Google Drive y devuelve el enlace público.
- **PWA / Service Worker:** cachea los archivos estáticos de la app y las respuestas de Google Sheets para uso offline; actualización automática (`registerType: autoUpdate`).

---

## 6. Seguridad, privacidad y datos sensibles

- Se capturan datos personales (DNI, contacto de emergencia), **biométricos** (selfie facial) y de **geolocalización aproximada** durante la firma de actas y la emisión de certificados — el usuario debe ser informado de este uso (declaración mostrada antes de firmar).
- El acceso de usuario **no usa contraseña**; el DNI actúa como identificador. El panel admin usa una contraseña simple compartida, sin roles ni usuarios individuales.
- El monitoreo por cámara durante la evaluación (antidistracción) es continuo mientras dura el cuestionario; se recomienda informarlo claramente al personal antes de su primer uso.

---

## 7. Preguntas frecuentes y solución de problemas

**No puedo tomar la selfie / la cámara no avanza.**
Verifica los permisos de cámara del navegador, mejora la iluminación y usa el botón "Reiniciar cámara".

**El cuestionario se reinició solo.**
Acumulaste 5 distracciones detectadas (cambios de pestaña o mirar fuera de la pantalla). Mantén la pestaña activa y la mirada en la pantalla durante toda la evaluación.

**No veo el módulo de Actas.**
El administrador no lo ha habilitado para tu perfil, o no tienes documentos asignados todavía.

**Mi progreso no aparece en otro dispositivo.**
Espera unos segundos: la sincronización a la nube ocurre cada 3 lecciones y al finalizar cada evaluación; si no hay conexión, se reintenta automáticamente al reconectar.

**¿Puedo cambiar mi perfil (Obrero/Empleado/etc.) yo mismo?**
No. Una vez confirmado, solo un administrador puede modificarlo.
