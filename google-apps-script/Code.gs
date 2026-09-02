/**
 * Google Apps Script - LearnDrive AI v2 Proxy
 *
 * CONFIGURACIÓN: este script solo necesita DOS IDs (definidos más abajo):
 *   - SPREADSHEET_ID         → la hoja de cálculo (base de datos)
 *   - PROJECT_ROOT_FOLDER_ID → la carpeta raíz del proyecto en Drive
 * Todas las subcarpetas (CERTIFICADOS, ACTAS/DOCUMENTOS, ACTAS/DOC_ENTREGAS) se
 * detectan por nombre dentro de la carpeta raíz y se crean solas si faltan.
 * No existe ningún otro ID hardcodeado.
 *
 * Instrucciones de Instalación:
 * 1. En tu Google Sheet, ve a Extensiones -> Apps Script.
 * 2. Borra el contenido de Code.gs y pega este código.
 * 3. Ajusta SPREADSHEET_ID y PROJECT_ROOT_FOLDER_ID con los IDs de tu hoja y tu carpeta raíz.
 * 4. Recarga la hoja y usa el menú "⚙️ Configuración del Proyecto" -> "🚀 Crear carpetas y hojas"
 *    (o ejecuta la función CrearCarpetas desde el editor). Crea/asegura en 1 clic las subcarpetas
 *    de Drive dentro de la raíz y todas las hojas necesarias.
 * 5. Haz clic en "Implementar" -> "Nueva implementación".
 * 6. Tipo: Aplicación web.
 * 7. Quién tiene acceso: Cualquiera (Anyone).
 */

const SPREADSHEET_ID = '1tKXR0sRb3jZYFrQ8WUVjB3hhIpx1_qbQYfAjJIPPgTA';
const QUIZ_SHEET_NAME = 'QUIZ';
const DATA_SHEET_NAME = 'DATA';
const INGRESOS_SHEET_NAME = 'INGRESOS';
const LEARN_SHEET_NAME = 'LEARN';
const SHORT_EVALS_SHEET_NAME = 'SHORT_EVALUACIONES';
const SHORT_RESULTS_SHEET_NAME = 'SHORT_RESULTADOS';
const ACTAS_DOCS_SHEET_NAME = 'ACTAS_DOCUMENTOS';
const ACTAS_FIRMAS_SHEET_NAME = 'ACTAS_FIRMAS';
const PAC_PROGRAMAS_SHEET_NAME = 'PAC_PROGRAMAS';
const PAC_PREGUNTAS_SHEET_NAME = 'PAC_PREGUNTAS';
const PAC_RESULTADOS_SHEET_NAME = 'PAC_RESULTADOS';

// =============================================
// CONFIGURACIÓN DE CARPETAS DE DRIVE
// =============================================
// Único ID de carpeta del proyecto: la carpeta RAÍZ. Todas las subcarpetas se
// detectan por nombre (o se crean si faltan) dentro de ella automáticamente:
//   <RAÍZ>/CERTIFICADOS
//   <RAÍZ>/ACTAS/DOCUMENTOS          → archivos a entregar (los sube el admin)
//   <RAÍZ>/ACTAS/DOC_ENTREGAS/<DNI>/ → actas firmadas por persona
const PROJECT_ROOT_FOLDER_ID = '1bi_81jpB1fEYVE8qnPjOT5wLxCH03zmy';

// Nombres de las subcarpetas dentro de la raíz (no son IDs; se resuelven por nombre).
const CERT_FOLDER_NAME  = 'CERTIFICADOS';
const ACTAS_FOLDER_NAME = 'ACTAS';
const USUARIOS_FOLDER_NAME = 'USUARIOS';
const PAC_FOLDER_NAME = 'PAC';

/** Carpeta raíz del proyecto en Drive (único ID de carpeta del proyecto). */
function getRootFolder_() {
  return DriveApp.getFolderById(PROJECT_ROOT_FOLDER_ID);
}
/** Subcarpeta CERTIFICADOS dentro de la raíz (se detecta o se crea). */
function getCertFolder_() {
  return getOrCreateSubFolder(getRootFolder_(), CERT_FOLDER_NAME);
}
/** Subcarpeta ACTAS dentro de la raíz (se detecta o se crea). */
function getActasFolder_() {
  return getOrCreateSubFolder(getRootFolder_(), ACTAS_FOLDER_NAME);
}
/** Subcarpeta USUARIOS dentro de la raíz (firma+selfie de la autorización de onboarding, por DNI). */
function getUsuariosFolder_() {
  return getOrCreateSubFolder(getRootFolder_(), USUARIOS_FOLDER_NAME);
}
/** Subcarpeta PAC dentro de la raíz (material de referencia y constancias firmadas del Programa Anual de Capacitaciones). */
function getPacFolder_() {
  return getOrCreateSubFolder(getRootFolder_(), PAC_FOLDER_NAME);
}
/** Devuelve una subcarpeta por nombre SIN crearla (null si no existe). */
function findSubFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

// =============================================
// DIAGNÓSTICO DEL SISTEMA
// =============================================
/**
 * Verifica que toda la configuración esté correcta: hoja de cálculo, hojas
 * requeridas con sus columnas, carpeta raíz y subcarpetas de Drive, permiso de
 * escritura en Drive y permiso de correo. Devuelve un reporte estructurado que
 * la app muestra en el módulo "Verificación del sistema".
 */
function ejecutarDiagnostico() {
  var checks = [];
  function add(id, label, level, detail) {
    // level: 'ok' | 'warn' | 'error'
    checks.push({ id: id, label: label, ok: level === 'ok', level: level, detail: detail || '' });
  }

  // 1) Hoja de cálculo accesible
  var ss = null;
  try {
    ss = getSpreadsheet_();
    add('spreadsheet', 'Hoja de cálculo accesible', 'ok', ss.getName() + ' · ' + ss.getId());
  } catch (e) {
    add('spreadsheet', 'Hoja de cálculo accesible', 'error', 'No se pudo abrir SPREADSHEET_ID. Revisa el ID o los permisos. ' + e);
  }

  // 2) Hojas requeridas y sus columnas
  if (ss) {
    var defs = getSheetDefinitions();
    Object.keys(defs).forEach(function (name) {
      var sheet = ss.getSheetByName(name);
      if (!sheet) {
        add('sheet_' + name, 'Hoja "' + name + '"', 'error', 'No existe. Ejecuta "🚀 Crear carpetas y hojas".');
        return;
      }
      var lastCol = sheet.getLastColumn();
      var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
      var missing = defs[name].filter(function (h) { return headers.indexOf(h) === -1; });
      if (missing.length) add('sheet_' + name, 'Hoja "' + name + '"', 'warn', 'Faltan columnas: ' + missing.join(', '));
      else add('sheet_' + name, 'Hoja "' + name + '"', 'ok', headers.length + ' columnas correctas');
    });

    // CONFIG con al menos una fila (necesario para que la app arranque)
    var cfg = ss.getSheetByName('CONFIG');
    if (cfg) {
      var tieneDatos = cfg.getLastRow() >= 2;
      add('config_row', 'CONFIG con datos iniciales', tieneDatos ? 'ok' : 'warn',
        tieneDatos ? 'Fila de configuración presente' : 'CONFIG vacía: la app puede no arrancar. Ejecuta "Crear carpetas y hojas".');
    }
  }

  // 3) Carpeta raíz de Drive
  var root = null;
  try {
    root = getRootFolder_();
    add('root_folder', 'Carpeta raíz de Drive accesible', 'ok', root.getName() + ' · ' + root.getId());
  } catch (e) {
    add('root_folder', 'Carpeta raíz de Drive accesible', 'error', 'No se pudo abrir PROJECT_ROOT_FOLDER_ID. Revisa el ID o comparte la carpeta con esta cuenta. ' + e);
  }

  // 4) Subcarpetas del proyecto (solo se reporta si existen; no se crean aquí)
  if (root) {
    var cert = findSubFolder_(root, CERT_FOLDER_NAME);
    add('cert_folder', 'Subcarpeta ' + CERT_FOLDER_NAME, cert ? 'ok' : 'warn',
      cert ? cert.getId() : 'Aún no existe; se crea sola al emitir el primer certificado (o con "Crear carpetas y hojas").');

    var actas = findSubFolder_(root, ACTAS_FOLDER_NAME);
    if (actas) {
      var faltan = [];
      if (!findSubFolder_(actas, 'DOCUMENTOS')) faltan.push('DOCUMENTOS');
      if (!findSubFolder_(actas, 'DOC_ENTREGAS')) faltan.push('DOC_ENTREGAS');
      add('actas_folder', 'Subcarpeta ' + ACTAS_FOLDER_NAME, faltan.length ? 'warn' : 'ok',
        faltan.length ? actas.getId() + ' — faltan: ' + faltan.join(', ') : actas.getId() + ' (DOCUMENTOS y DOC_ENTREGAS OK)');
    } else {
      add('actas_folder', 'Subcarpeta ' + ACTAS_FOLDER_NAME, 'warn',
        'Aún no existe; se crea sola al firmar la primera acta (o con "Crear carpetas y hojas").');
    }

    var usuarios = findSubFolder_(root, USUARIOS_FOLDER_NAME);
    add('usuarios_folder', 'Subcarpeta ' + USUARIOS_FOLDER_NAME, usuarios ? 'ok' : 'warn',
      usuarios ? usuarios.getId() : 'Aún no existe; se crea sola al registrar la primera autorización de firma digital.');

    // 5) Permiso de escritura en Drive (crea y borra un archivo de prueba)
    try {
      var tmp = root.createFile('__diagnostico__' + Date.now() + '.txt', 'ok', MimeType.PLAIN_TEXT);
      tmp.setTrashed(true);
      add('drive_write', 'Permiso de escritura en Drive', 'ok', 'Se creó y borró un archivo de prueba en la carpeta raíz');
    } catch (e) {
      add('drive_write', 'Permiso de escritura en Drive', 'error', 'No se pudo escribir en Drive. Autoriza los permisos y verifica que la cuenta sea dueña/editora de la carpeta. ' + e);
    }
  }

  // 6) Permiso de correo (para el envío de actas firmadas)
  try {
    var quota = MailApp.getRemainingDailyQuota();
    add('mail', 'Envío de correo (actas)', quota > 0 ? 'ok' : 'warn', 'Cuota diaria de correo restante: ' + quota);
  } catch (e) {
    add('mail', 'Envío de correo (actas)', 'warn', 'Sin autorización de correo todavía; se pedirá al ejecutar el script. ' + e);
  }

  var errores = checks.filter(function (c) { return c.level === 'error'; }).length;
  var advertencias = checks.filter(function (c) { return c.level === 'warn'; }).length;
  var ok = errores === 0;
  return {
    ok: ok,
    errores: errores,
    advertencias: advertencias,
    checks: checks,
    resumen: ok
      ? (advertencias ? 'Configuración correcta con ' + advertencias + ' advertencia(s).' : '¡Todo correcto! El sistema está bien configurado.')
      : 'Se detectaron ' + errores + ' problema(s) crítico(s) que impiden el funcionamiento normal.'
  };
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (data.action === 'getQuizProgress') {
      const sheet = ss.getSheetByName(INGRESOS_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'ok', progress: null });
      return getQuizProgress(sheet, data.dni, data.topicId);
    } else if (data.action === 'updateQuizProgress') {
      const sheet = ss.getSheetByName(INGRESOS_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'error', message: 'Hoja INGRESOS no encontrada' });
      return updateQuizProgress(sheet, data.dni, data.topicId, data.progress);
    } else if (data.action === 'getQuizData') {
      const sheet = ss.getSheetByName(QUIZ_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'ok', questions: [] });
      return getQuizData(sheet);
    } else if (data.action === 'upsertQuiz') {
      const sheet = ss.getSheetByName(QUIZ_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'error', message: 'Hoja QUIZ no encontrada' });
      return upsertQuiz(sheet, data.questions);
    } else if (data.action === 'deleteQuiz') {
      const sheet = ss.getSheetByName(QUIZ_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'error', message: 'Hoja QUIZ no encontrada' });
      return deleteQuiz(sheet, data.quizIds);
    } else if (data.action === 'upsertContent') {
      const sheet = ss.getSheetByName(DATA_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'error', message: 'Hoja DATA no encontrada' });
      return upsertContent(sheet, data.chunks);
    } else if (data.action === 'deleteContent') {
      const sheet = ss.getSheetByName(DATA_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'error', message: 'Hoja DATA no encontrada' });
      return deleteContent(sheet, data.codIds);
    } else if (data.action === 'registerIngreso') {
      const sheet = ss.getSheetByName(INGRESOS_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'error', message: 'Hoja INGRESOS no encontrada' });
      return registerIngreso(sheet, data.ingreso);
    } else if (data.action === 'updateIngreso') {
      const sheet = ss.getSheetByName(INGRESOS_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'error', message: 'Hoja INGRESOS no encontrada' });
      return updateIngreso(sheet, data.ingreso);
    } else if (data.action === 'getIngresoByDni') {
      return getIngresoByDni(ss, data);
    } else if (data.action === 'getCertificadosByDni') {
      return getCertificadosByDni(ss, data);
    } else if (data.action === 'getPacResultadosByDni') {
      return getPacResultadosByDni(ss, data);
    } else if (data.action === 'getShortResultadosByEvaluacion') {
      return getShortResultadosByEvaluacion(ss, data);
    } else if (data.action === 'updateUserProfile') {
      return updateUserProfile(ss, data);
    } else if (data.action === 'updateUserSelfie') {
      return updateUserSelfie(ss, data);
    } else if (data.action === 'deleteUsuario') {
      return deleteUsuario(ss, data);
    } else if (data.action === 'updateConfig') {
      return updateConfig(ss, data);
    } else if (data.action === 'saveCertificate') {
      return saveCertificate(ss, data);
    } else if (data.action === 'upsertTopic') {
      const sheet = ss.getSheetByName(LEARN_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'error', message: 'Hoja LEARN no encontrada' });
      return upsertTopic(sheet, data.topics);
    } else if (data.action === 'deleteTopic') {
      const sheet = ss.getSheetByName(LEARN_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'error', message: 'Hoja LEARN no encontrada' });
      return deleteTopic(sheet, data.topicIds);
    } else if (data.action === 'createShortEval') {
      return createShortEval(ss, data);
    } else if (data.action === 'updateShortEval') {
      return updateShortEval(ss, data);
    } else if (data.action === 'deleteShortEval') {
      return deleteShortEval(ss, data);
    } else if (data.action === 'saveShortEvalResult') {
      return saveShortEvalResult(ss, data);
    } else if (data.action === 'deleteShortEvalResult') {
      return deleteShortEvalResult(ss, data);
    } else if (data.action === 'createPacPrograma') {
      return createPacPrograma(ss, data);
    } else if (data.action === 'updatePacPrograma') {
      return updatePacPrograma(ss, data);
    } else if (data.action === 'deletePacPrograma') {
      return deletePacPrograma(ss, data);
    } else if (data.action === 'upsertPacPreguntas') {
      return upsertPacPreguntas(ss, data);
    } else if (data.action === 'savePacResultado') {
      return savePacResultado(ss, data);
    } else if (data.action === 'deletePacResultado') {
      return deletePacResultado(ss, data);
    } else if (data.action === 'uploadPacMaterial') {
      return uploadPacMaterial(data);
    } else if (data.action === 'uploadActaArchivo') {
      return uploadActaArchivo(data);
    } else if (data.action === 'upsertActaDocumento') {
      return upsertActaDocumento(ss, data);
    } else if (data.action === 'deleteActaDocumento') {
      return deleteActaDocumento(ss, data);
    } else if (data.action === 'saveActaFirma') {
      return saveActaFirma(ss, data);
    } else if (data.action === 'saveOnboardingConsent') {
      return saveOnboardingConsent(ss, data);
    } else if (data.action === 'resendActaCorreo') {
      return resendActaCorreo(ss, data);
    } else if (data.action === 'diagnostico') {
      // Verificación de configuración: hojas, columnas, carpetas y permisos.
      return createResponse({ status: 'ok', report: ejecutarDiagnostico() });
    } else if (data.action === 'crearEstructura') {
      // Permite disparar la creación de carpetas/hojas desde la app (además del menú del editor).
      var resumen = crearEstructuraProyecto();
      return createResponse({ status: 'ok', message: resumen.mensaje, detalle: resumen });
    }

    return createResponse({ status: 'error', message: 'Acción no reconocida' });
  } catch (err) {
    return createResponse({ status: 'error', message: err.toString() });
  }
}

function getQuizProgress(sheet, dni, topicId) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return createResponse({ status: 'ok', progress: null });
  var headers = data[0];
  var dniIdx = getHeaderIndex(headers, ['DNI', 'Id']);
  var progIdx = headers.indexOf('ProgressJSON');
  if (progIdx === -1) return createResponse({ status: 'ok', progress: null });
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][dniIdx] || '').trim() === String(dni).trim()) {
      var raw = String(data[i][progIdx] || '').trim();
      if (!raw) return createResponse({ status: 'ok', progress: null });
      try {
        var arr = JSON.parse(raw);
        var entry = arr.find(function(e) { return e.topicId === topicId; });
        return createResponse({ status: 'ok', progress: (entry && entry.quizSavedProgress) ? entry.quizSavedProgress : null });
      } catch (e) {
        return createResponse({ status: 'ok', progress: null });
      }
    }
  }
  return createResponse({ status: 'ok', progress: null });
}

function updateQuizProgress(sheet, dni, topicId, progress) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var dniIdx = getHeaderIndex(headers, ['DNI', 'Id']);
  var progIdx = headers.indexOf('ProgressJSON');
  if (progIdx === -1) return createResponse({ status: 'error', message: 'Columna ProgressJSON no encontrada' });
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][dniIdx] || '').trim() === String(dni).trim()) {
      var arr = [];
      try { var s = String(data[i][progIdx] || '').trim(); if (s) arr = JSON.parse(s); } catch (e) {}
      var found = false;
      arr = arr.map(function(e) {
        if (e.topicId === topicId) {
          found = true;
          if (progress === null || progress === undefined) {
            delete e.quizSavedProgress;
          } else {
            e.quizSavedProgress = progress;
          }
        }
        return e;
      });
      if (!found && progress !== null && progress !== undefined) {
        arr.push({ topicId: topicId, quizSavedProgress: progress });
      }
      sheet.getRange(i + 1, progIdx + 1).setValue(JSON.stringify(arr));
      SpreadsheetApp.flush();
      return createResponse({ status: 'ok' });
    }
  }
  return createResponse({ status: 'error', message: 'Usuario no encontrado' });
}

function getQuizData(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return createResponse({ status: 'ok', questions: [] });
  var headers = data[0];
  var questions = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var q = {};
    headers.forEach(function(h, j) {
      q[h] = String(row[j] === undefined || row[j] === null ? '' : row[j]).trim();
    });
    questions.push(q);
  }
  return createResponse({ status: 'ok', questions: questions });
}

function upsertQuiz(sheet, questions) {
  var requiredHeaders = ['IdQuiz', 'IdMain', 'Pregunta', 'OpcionA', 'OpcionB', 'OpcionC', 'OpcionD', 'RespuestaCorrecta', 'Explicacion', 'Dificultad', 'Categoria_contenido'];

  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    // Empty sheet — write full header row
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
  } else {
    // Sheet exists — ensure Categoria_contenido column is present
    var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    if (existingHeaders.indexOf('Categoria_contenido') === -1) {
      var nextCol = lastCol + 1;
      sheet.getRange(1, nextCol).setValue('Categoria_contenido');
    }
  }

  questions.forEach(function(q) {
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; });

    var idCol = colMap['IdQuiz'];
    var rowIndex = -1;
    if (idCol !== undefined) {
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][idCol]).trim() === String(q.IdQuiz).trim()) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    var rowData = [];
    headers.forEach(function(h) {
      rowData.push(q[h] !== undefined ? q[h] : '');
    });

    if (rowIndex > 1) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
  });

  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Preguntas procesadas correctamente' });
}

function deleteQuiz(sheet, quizIds) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idQuizIndex = headers.indexOf('IdQuiz');

  if (idQuizIndex === -1) return createResponse({ status: 'error', message: 'Columna IdQuiz no encontrada' });

  for (var i = data.length - 1; i >= 1; i--) {
    if (quizIds.indexOf(String(data[i][idQuizIndex]).trim()) !== -1) {
      sheet.deleteRow(i + 1);
    }
  }

  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Preguntas eliminadas correctamente' });
}

function upsertContent(sheet, chunks) {
  var firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  if (!firstRow[0] || String(firstRow[0]).trim() === '') {
    var dataHeaders = ['Cod', 'IdMain', 'Tema', 'Contenido', 'Video_1', 'Video_2', 'Video_3', 'ComentarioVideo', 'PDF', 'Contexto', 'Orden'];
    sheet.getRange(1, 1, 1, dataHeaders.length).setValues([dataHeaders]);
  }

  chunks.forEach(function(c) {
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; });

    var codCol = colMap['Cod'];
    var rowIndex = -1;
    if (codCol !== undefined) {
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][codCol]).trim() === String(c.Cod).trim()) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    var rowData = [];
    headers.forEach(function(h) {
      rowData.push(c[h] !== undefined ? c[h] : '');
    });

    if (rowIndex > 1) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
  });

  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Contenido procesado correctamente' });
}

function deleteContent(sheet, codIds) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var codIndex = headers.indexOf('Cod');

  if (codIndex === -1) return createResponse({ status: 'error', message: 'Columna Cod no encontrada' });

  for (let i = data.length - 1; i >= 1; i--) {
    if (codIds.indexOf(data[i][codIndex]) !== -1) {
      sheet.deleteRow(i + 1);
    }
  }

  return createResponse({ status: 'ok', message: 'Contenido eliminado correctamente' });
}

function upsertTopic(sheet, topics) {
  var firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  if (!firstRow[0] || String(firstRow[0]).trim() === '') {
    var learnHeaders = ['Id', 'Titulo', 'Publico', 'Detalles', 'Resumen', 'PuntosClave', 'Orden', 'Activo'];
    sheet.getRange(1, 1, 1, learnHeaders.length).setValues([learnHeaders]);
  }

  topics.forEach(function(t) {
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; });

    var idCol = colMap['Id'];
    var rowIndex = -1;
    if (idCol !== undefined) {
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][idCol]).trim() === String(t.Id).trim()) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    var rowData = [];
    headers.forEach(function(h) {
      rowData.push(t[h] !== undefined ? t[h] : '');
    });

    if (rowIndex > 1) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
  });

  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Temas procesados correctamente' });
}

function deleteTopic(sheet, topicIds) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIndex = headers.indexOf('Id');

  if (idIndex === -1) return createResponse({ status: 'error', message: 'Columna Id no encontrada' });

  for (let i = data.length - 1; i >= 1; i--) {
    if (topicIds.indexOf(data[i][idIndex]) !== -1) {
      sheet.deleteRow(i + 1);
    }
  }

  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Temas eliminados correctamente' });
}

/**
 * Busca la fila de un DNI/Id en INGRESOS sin leer la hoja completa: usa TextFinder
 * acotado a la columna DNI (1 sola columna, no las ~28 de la hoja), que además se
 * resuelve del lado del servicio de Sheets en vez de traer todo a memoria de Apps
 * Script. Devuelve el número de fila (1-based) o -1 si no existe.
 */
function findIngresoRow_(sheet, colMap, searchKey) {
  if (!searchKey || sheet.getLastRow() < 2) return -1;
  var dniColIdx = colMap['DNI'] !== undefined ? colMap['DNI'] : colMap['Id'];
  if (dniColIdx === undefined) return -1;
  var range = sheet.getRange(2, dniColIdx + 1, sheet.getLastRow() - 1, 1);
  var found = range.createTextFinder(String(searchKey)).matchEntireCell(true).findNext();
  return found ? found.getRow() : -1;
}

// =============================================
// LECTURAS ACOTADAS POR DNI (evitan bajar la hoja completa)
// =============================================
// Antes, el cliente descargaba el CSV público de la hoja ENTERA (todos los DNIs)
// solo para quedarse con la fila de una persona — un costo que crece con el total
// de registros de todos los trabajadores, no con los de uno. Estas acciones hacen
// ese filtro del lado del servidor con TextFinder acotado a una sola columna (no
// sheet.getDataRange() completo), y solo traen a memoria las filas que sí matchean.

/** Todas las filas de `sheet` donde la columna `columnName` == `value` (comparación exacta de celda). */
function findRowsByColumnValue_(sheet, columnName, value) {
  if (sheet.getLastRow() < 2) return [];
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIdx = headers.indexOf(columnName);
  if (colIdx === -1) return [];
  var range = sheet.getRange(2, colIdx + 1, sheet.getLastRow() - 1, 1);
  var matches = range.createTextFinder(String(value)).matchEntireCell(true).findAll();
  return matches.map(function (m) {
    var row = m.getRow();
    return { row: row, headers: headers, values: sheet.getRange(row, 1, 1, lastCol).getValues()[0] };
  });
}

/** Convierte una fila (headers + values paralelos) en un objeto {NombreColumna: valor}. */
function rowToObject_(headers, values) {
  var obj = {};
  headers.forEach(function (h, i) { obj[h] = values[i]; });
  return obj;
}

/** Un registro de INGRESOS por DNI, sin bajar el resto de trabajadores. */
function getIngresoByDni(ss, data) {
  var dni = String(data.dni || '').trim();
  if (!dni) return createResponse({ status: 'error', message: 'DNI requerido' });
  var sheet = ss.getSheetByName(INGRESOS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'ok', record: null });
  var headers = sheet.getLastColumn() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  var dniColName = headers.indexOf('DNI') !== -1 ? 'DNI' : 'Id';
  var matches = findRowsByColumnValue_(sheet, dniColName, dni);
  if (matches.length === 0) return createResponse({ status: 'ok', record: null });
  var record = rowToObject_(matches[0].headers, matches[0].values);

  // Backfill de CONSENTIMIENTO_OK para quienes ya autorizaron su firma digital
  // antes de que existiera esta columna: una vez marcado, sirve para que el
  // admin pueda borrar/reemplazar la foto después (updateUserSelfie) sin que
  // el login vuelva a exigirle la autorización — ver handleLogin en App.tsx.
  if (String(record.CONSENTIMIENTO_OK || '').trim() !== 'true' && record.FOTOGRAFIA && record.SELFIE) {
    var consentCol = getOrCreateColumn(sheet, 'CONSENTIMIENTO_OK');
    sheet.getRange(matches[0].row, consentCol + 1).setValue('true');
    record.CONSENTIMIENTO_OK = 'true';
  }

  return createResponse({ status: 'ok', record: record });
}

/**
 * Permite al admin reemplazar o borrar la selfie de un usuario sin afectar
 * CONSENTIMIENTO_OK: una vez que el trabajador autorizó su firma digital una
 * vez, eso queda registrado para siempre — limpiar/reemplazar la foto después
 * no debe mandarlo de nuevo a la pantalla de autorización en su próximo login.
 */
function updateUserSelfie(ss, data) {
  var dni = String(data.dni || '').trim();
  if (!dni) return createResponse({ status: 'error', message: 'DNI requerido' });

  var sheet = ss.getSheetByName(INGRESOS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'error', message: 'Hoja INGRESOS no encontrada' });

  var matches = findRowsByColumnValue_(sheet, 'DNI', dni);
  if (matches.length === 0) return createResponse({ status: 'error', message: 'No se encontró ningún usuario con el DNI ' + dni });
  var rowIndex = matches[0].row;
  var selfieCol = getOrCreateColumn(sheet, 'SELFIE');

  if (data.clear) {
    sheet.getRange(rowIndex, selfieCol + 1).setValue('');
    SpreadsheetApp.flush();
    return createResponse({ status: 'ok', message: 'Foto eliminada', url: '' });
  }

  if (!data.selfieBase64) return createResponse({ status: 'error', message: 'Foto requerida' });
  var raw = data.selfieBase64.indexOf(',') !== -1 ? data.selfieBase64.split(',')[1] : data.selfieBase64;
  var blob = Utilities.newBlob(Utilities.base64Decode(raw), 'image/jpeg', dni + '_SELFIE_ADMIN_' + Date.now() + '.jpg');
  var folder = getOrCreateSubFolder(getUsuariosFolder_(), dni);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var url = file.getUrl();

  sheet.getRange(rowIndex, selfieCol + 1).setValue(url);
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Foto actualizada', url: url });
}

/** Los certificados (todas las columnas TopicId/LinkCertificado) de un DNI, sin bajar los de todos. */
function getCertificadosByDni(ss, data) {
  var dni = String(data.dni || '').trim();
  if (!dni) return createResponse({ status: 'error', message: 'DNI requerido' });
  var sheet = ss.getSheetByName('CERTIFICADOS');
  if (!sheet) return createResponse({ status: 'ok', certificados: [] });
  var matches = findRowsByColumnValue_(sheet, 'DNI', dni);
  return createResponse({ status: 'ok', certificados: matches.map(function (m) { return rowToObject_(m.headers, m.values); }) });
}

/** Intentos previos de un DNI en un programa PAC (chequeo "¿ya rendí?"), sin bajar todos los intentos de todos los programas. */
function getPacResultadosByDni(ss, data) {
  var dni = String(data.dni || '').trim();
  var programaId = String(data.programaId || '').trim();
  if (!dni) return createResponse({ status: 'error', message: 'DNI requerido' });
  var sheet = ss.getSheetByName(PAC_RESULTADOS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'ok', resultados: [] });
  var matches = findRowsByColumnValue_(sheet, 'DNI', dni)
    .map(function (m) { return rowToObject_(m.headers, m.values); })
    .filter(function (r) { return !programaId || String(r.ProgramaId).trim() === programaId; });
  return createResponse({ status: 'ok', resultados: matches });
}

/**
 * Todos los resultados de UNA evaluación corta (no de todas). A diferencia de
 * getPacResultadosByDni, aquí el cliente necesita el roster completo de esa
 * evaluación (para reconocer el nombre mientras el trabajador escribe su DNI,
 * sin ida y vuelta al servidor por cada dígito) — se acota por EvaluacionId,
 * no por DNI.
 */
function getShortResultadosByEvaluacion(ss, data) {
  var evaluacionId = String(data.evaluacionId || '').trim();
  if (!evaluacionId) return createResponse({ status: 'error', message: 'EvaluacionId requerido' });
  var sheet = ss.getSheetByName(SHORT_RESULTS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'ok', resultados: [] });
  var matches = findRowsByColumnValue_(sheet, 'EvaluacionId', evaluacionId)
    .map(function (m) { return rowToObject_(m.headers, m.values); });
  return createResponse({ status: 'ok', resultados: matches });
}

function registerIngreso(sheet, ingreso) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });

  var rowIndex = findIngresoRow_(sheet, colMap, ingreso.DNI || ingreso.Id);
  var existingRow = rowIndex !== -1 ? sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0] : null;

  var rowData = [];
  headers.forEach(function(h, i) {
    if (existingRow && (h === 'ProgressJSON' || h === 'Avance' || h === 'Nota' || h === 'ModulosCompletados' || h === 'IntentosQuiz' || h === 'TiempoTotal')) {
      rowData.push(existingRow[i] || (ingreso[h] !== undefined ? ingreso[h] : ''));
    } else {
      rowData.push(ingreso[h] !== undefined ? ingreso[h] : (existingRow ? existingRow[i] || '' : ''));
    }
  });

  if (rowIndex !== -1) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return createResponse({ status: 'ok', message: 'Ingreso registrado correctamente' });
}

function updateIngreso(sheet, ingreso) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });

  var rowIndex = findIngresoRow_(sheet, colMap, ingreso.DNI || ingreso.Id);
  if (rowIndex === -1) return createResponse({ status: 'error', message: 'No se encontró el registro' });

  var fieldsToUpdate = ['Avance', 'Nota', 'UltimoAcceso', 'Dispositivo', 'ModulosCompletados', 'IntentosQuiz', 'TiempoTotal', 'ProgressJSON'];
  fieldsToUpdate.forEach(function(field) {
    if (ingreso[field] !== undefined && ingreso[field] !== '' && colMap[field] !== undefined) {
      sheet.getRange(rowIndex, colMap[field] + 1).setValue(ingreso[field]);
    }
  });
  return createResponse({ status: 'ok', message: 'Progreso actualizado' });
}

/**
 * Permite al admin corregir el perfil (Publico), correo y/o DNI de un usuario
 * ya registrado en INGRESOS. Si cambia el DNI, replica el cambio en las hojas
 * que lo usan como llave de asociación (CERTIFICADOS, SHORT_RESULTADOS,
 * ACTAS_FIRMAS) para que el historial del usuario no quede huérfano bajo el
 * DNI anterior. data: { dni (actual), nuevoDni?, publico?, correo? }
 */
function updateUserProfile(ss, data) {
  var dni = String(data.dni || '').trim();
  if (!dni) return createResponse({ status: 'error', message: 'DNI requerido' });

  var sheet = ss.getSheetByName(INGRESOS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'error', message: 'Hoja INGRESOS no encontrada' });
  if (sheet.getLastRow() < 2) return createResponse({ status: 'error', message: 'No se encontró ningún usuario con el DNI ' + dni });

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });
  var dniCol = getHeaderIndex(headers, ['DNI', 'Id']);
  if (dniCol === -1) return createResponse({ status: 'error', message: 'Columna DNI no encontrada' });

  // Búsqueda acotada a la columna DNI (no toda la hoja) vía TextFinder.
  var dniRange = sheet.getRange(2, dniCol + 1, sheet.getLastRow() - 1, 1);
  var found = dniRange.createTextFinder(dni).matchEntireCell(true).findNext();
  if (!found) return createResponse({ status: 'error', message: 'No se encontró ningún usuario con el DNI ' + dni });
  var rowIndex = found.getRow();

  var nuevoDni = data.nuevoDni ? String(data.nuevoDni).trim() : '';
  if (nuevoDni && nuevoDni !== dni) {
    var dupe = dniRange.createTextFinder(nuevoDni).matchEntireCell(true).findNext();
    if (dupe && dupe.getRow() !== rowIndex) {
      return createResponse({ status: 'error', message: 'Ya existe otro usuario registrado con el DNI ' + nuevoDni });
    }
  }

  // Campos editables del perfil: se actualiza cada uno solo si vino en la petición
  // (undefined = no tocar esa columna) y si la columna existe en la hoja.
  var fieldToColumn = {
    publico: 'Publico', correo: 'CORREO', nombres: 'Nombres', apellidos: 'Apellidos',
    empresa: 'EMPRESA', area: 'AREA', cargo: 'CARGO',
    fechaIngreso: 'FECHA_INGRESO', fechaNacimiento: 'FECHA_NACIMIENTO', celular: 'CELULAR',
    contacto1Numero: 'NUMERO_CONTACTO_1', contacto1Parentesco: 'PARENTESCO_CONTACTO_1',
    contacto2Numero: 'NUMERO_CONTACTO_2', contacto2Parentesco: 'PARENTESCO_CONTACTO_2'
  };
  Object.keys(fieldToColumn).forEach(function (field) {
    var col = fieldToColumn[field];
    if (data[field] !== undefined && colMap[col] !== undefined) {
      sheet.getRange(rowIndex, colMap[col] + 1).setValue(data[field]);
    }
  });
  if (nuevoDni && nuevoDni !== dni) {
    sheet.getRange(rowIndex, dniCol + 1).setValue(nuevoDni);
    migrateDniAcrossSheets_(ss, dni, nuevoDni);
  }

  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Perfil actualizado correctamente', dni: nuevoDni || dni });
}

/**
 * Elimina el registro de un usuario en INGRESOS (por DNI). No borra certificados,
 * firmas de actas ni resultados de evaluaciones cortas ya generados: esos
 * registros históricos se conservan aunque el usuario deje de existir en INGRESOS.
 */
function deleteUsuario(ss, data) {
  var dni = String(data.dni || '').trim();
  if (!dni) return createResponse({ status: 'error', message: 'DNI requerido' });

  var sheet = ss.getSheetByName(INGRESOS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'error', message: 'Hoja INGRESOS no encontrada' });
  if (sheet.getLastRow() < 2) return createResponse({ status: 'error', message: 'No se encontró ningún usuario con el DNI ' + dni });

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var dniCol = getHeaderIndex(headers, ['DNI', 'Id']);
  if (dniCol === -1) return createResponse({ status: 'error', message: 'Columna DNI no encontrada' });

  var dniRange = sheet.getRange(2, dniCol + 1, sheet.getLastRow() - 1, 1);
  var found = dniRange.createTextFinder(dni).matchEntireCell(true).findNext();
  if (!found) return createResponse({ status: 'error', message: 'No se encontró ningún usuario con el DNI ' + dni });

  sheet.deleteRow(found.getRow());
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Usuario eliminado' });
}

/** Reemplaza el DNI antiguo por el nuevo en las hojas que lo usan como llave
 *  de asociación con el usuario (no en INGRESOS, que ya se actualiza aparte). */
function migrateDniAcrossSheets_(ss, oldDni, newDni) {
  ['CERTIFICADOS', SHORT_RESULTS_SHEET_NAME, ACTAS_FIRMAS_SHEET_NAME].forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    var headers = data[0];
    var dniCol = headers.indexOf('DNI');
    if (dniCol === -1) return;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][dniCol] || '').trim() === oldDni) {
        sheet.getRange(i + 1, dniCol + 1).setValue(newDni);
      }
    }
  });
}

/**
 * Actualiza la fila única de configuración dinámica de la app (hoja CONFIG).
 * Solo escribe los campos presentes en `data`; crea columnas que falten
 * (p.ej. si la hoja aún no tiene "Mensaje") sin tocar columnas ajenas como "Id".
 */
function updateConfig(ss, data) {
  var sheet = ss.getSheetByName('CONFIG');
  if (!sheet) return createResponse({ status: 'error', message: 'Hoja CONFIG no encontrada' });
  if (sheet.getLastRow() < 2) sheet.appendRow(['']);

  var fieldToHeader = {
    title: 'Titulo', message: 'Mensaje', contact: 'Contacto', adminPass: 'PassAdmin',
    status: 'Estatus', logoCertificado: 'LogoCertificado', firmaRepresentante: 'FirmaRepresentante',
    nombreRepresentante: 'NombreRepresentante', cargoRepresentante: 'CargoRepresentante',
    lugar: 'Lugar', contratista: 'Contratista', tutorialUrl: 'Tutorial', actasHabilitado: 'Actas',
    ruc: 'RUC', actividadEconomica: 'ActividadEconomica', domicilio: 'Domicilio'
  };

  Object.keys(fieldToHeader).forEach(function (field) {
    if (data[field] === undefined) return;
    var col = getOrCreateColumn(sheet, fieldToHeader[field]);
    var value = field === 'actasHabilitado' ? (data[field] ? 'TRUE' : 'FALSE') : String(data[field]);
    sheet.getRange(2, col + 1).setValue(value);
  });

  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Configuración actualizada correctamente' });
}

function saveCertificate(ss, data) {
  try {
    if (!data.dni) return createResponse({ status: 'error', message: 'DNI requerido' });
    const parentFolder = getCertFolder_();
    const now = new Date();
    const year  = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const dni   = String(data.dni).trim();

    const yearFolder  = getOrCreateSubFolder(parentFolder, year);
    const monthFolder = getOrCreateSubFolder(yearFolder, month);
    const dniFolder   = getOrCreateSubFolder(monthFolder, dni);

    const rawPdf = data.pdfBase64.includes(',') ? data.pdfBase64.split(',')[1] : data.pdfBase64;

    // Build a safe filename prefix from the course title (fallback to DNI if missing)
    const courseSlug = data.courseTitle
      ? data.courseTitle.trim().toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚÜÑ]/gi, '_').replace(/_+/g, '_')
      : dni;

    const pdfFilename = `${courseSlug}_CERTIFICADO_${dni}_${now.getTime()}.pdf`;
    const pdfBlob = Utilities.newBlob(Utilities.base64Decode(rawPdf), 'application/pdf', pdfFilename);
    const pdfFile = dniFolder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const pdfUrl = pdfFile.getUrl();

    if (data.selfieBase64) {
      const rawSelfie = data.selfieBase64.includes(',') ? data.selfieBase64.split(',')[1] : data.selfieBase64;
      const selfieFilename = `${courseSlug}_SELFIE_${dni}_${now.getTime()}.jpg`;
      const selfieBlob = Utilities.newBlob(Utilities.base64Decode(rawSelfie), 'image/jpeg', selfieFilename);
      const selfieFile = dniFolder.createFile(selfieBlob);
      selfieFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    if (data.signatureBase64) {
      const rawSignature = data.signatureBase64.includes(',') ? data.signatureBase64.split(',')[1] : data.signatureBase64;
      const signatureFilename = `${courseSlug}_FIRMA_${dni}_${now.getTime()}.png`;
      const signatureBlob = Utilities.newBlob(Utilities.base64Decode(rawSignature), 'image/png', signatureFilename);
      const signatureFile = dniFolder.createFile(signatureBlob);
      signatureFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    const ingresosSheet = ss.getSheetByName(INGRESOS_SHEET_NAME);
    if (ingresosSheet) {
      const ingData = ingresosSheet.getDataRange().getValues();
      const headers = ingData[0];
      const dniCol  = headers.indexOf('DNI') !== -1 ? headers.indexOf('DNI') : headers.indexOf('Id');
      const certCol = getOrCreateColumn(ingresosSheet, 'CertificadoUrl');
      for (let i = 1; i < ingData.length; i++) {
        if (String(ingData[i][dniCol] || '').trim() === dni) {
          ingresosSheet.getRange(i + 1, certCol + 1).setValue(pdfUrl);
          break;
        }
      }
    }

    let certSheet = ss.getSheetByName('CERTIFICADOS');
    if (!certSheet) {
      certSheet = ss.insertSheet('CERTIFICADOS');
      certSheet.appendRow(['Id', 'DNI', 'APELLIDOS', 'NOMBRES', 'CARGO', 'NOTA', 'CELULAR', 'FOTO', 'TITULO_CERTIFICADO', 'LinkCertificado', 'Fecha', 'FIRMA', 'TopicId']);
    } else {
      // Ensure TITULO_CERTIFICADO and TopicId columns exist in existing sheets
      var hRow = certSheet.getRange(1, 1, 1, certSheet.getLastColumn()).getValues()[0];
      if (hRow.indexOf('TITULO_CERTIFICADO') === -1) certSheet.getRange(1, certSheet.getLastColumn() + 1).setValue('TITULO_CERTIFICADO');
      if (hRow.indexOf('TopicId') === -1) certSheet.getRange(1, certSheet.getLastColumn() + 1).setValue('TopicId');
    }
    const info = getIngresoInfoByDni(ingresosSheet, dni);
    appendCertificateRecord(certSheet, {
      id: `${dni}-${now.getTime()}`,
      dni: dni,
      apellidos: data.apellidos || info.apellidos || '',
      nombres: data.nombres || info.nombres || '',
      cargo: data.cargo || info.cargo || '',
      nota: data.nota || info.nota || '',
      celular: data.celular || info.celular || '',
      firma: '', foto: '',
      linkCertificado: pdfUrl,
      fecha: now,
      tituloCertificado: data.courseTitle || '',
      topicId: data.topicId || '',
    });

    SpreadsheetApp.flush();
    return createResponse({ status: 'ok', url: pdfUrl });
  } catch (err) {
    return createResponse({ status: 'error', message: err.toString() });
  }
}

function getIngresoInfoByDni(sheet, dni) {
  var info = { apellidos: '', nombres: '', cargo: '', nota: '', celular: '' };
  if (!sheet) return info;
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return info;
  var headers = data[0];
  var dniCol = getHeaderIndex(headers, ['DNI', 'Id']);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][dniCol] || '').trim() === dni) {
      info.apellidos = data[i][getHeaderIndex(headers, ['Apellidos', 'APELLIDOS'])] || '';
      info.nombres = data[i][getHeaderIndex(headers, ['Nombres', 'NOMBRES'])] || '';
      info.cargo = data[i][getHeaderIndex(headers, ['Cargo', 'CARGO'])] || '';
      info.nota = data[i][getHeaderIndex(headers, ['Nota', 'NOTA'])] || '';
      info.celular = data[i][getHeaderIndex(headers, ['Celular', 'CELULAR'])] || '';
      break;
    }
  }
  return info;
}

function getHeaderIndex(headers, names) {
  for (var i = 0; i < names.length; i++) {
    var idx = headers.indexOf(names[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

function appendCertificateRecord(sheet, record) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });
  var rowData = new Array(headers.length).fill('');

  rowData[colMap['Id']] = record.id;
  rowData[colMap['DNI']] = record.dni;
  rowData[colMap['APELLIDOS']] = record.apellidos;
  rowData[colMap['NOMBRES']] = record.nombres;
  rowData[colMap['CARGO']] = record.cargo;
  rowData[colMap['NOTA']] = record.nota;
  rowData[colMap['CELULAR']] = record.celular;
  rowData[colMap['LinkCertificado']] = record.linkCertificado;
  rowData[colMap['Fecha']] = record.fecha;
  if (colMap['TITULO_CERTIFICADO'] !== undefined) rowData[colMap['TITULO_CERTIFICADO']] = record.tituloCertificado || '';
  if (colMap['TopicId'] !== undefined) rowData[colMap['TopicId']] = record.topicId || '';

  sheet.appendRow(rowData);
}

function getOrCreateSubFolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(name);
}

function getOrCreateColumn(sheet, columnName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const index = headers.indexOf(columnName);
  if (index !== -1) return index;
  const nextCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, nextCol).setValue(columnName);
  return nextCol - 1;
}


// =============================================
// SHORT EVALUACIONES
// =============================================

var SHORT_EVALS_HEADERS = ['Id', 'Nombre', 'Descripcion', 'TopicId', 'TopicTitle', 'ChunkIds', 'Activo', 'FechaCreacion'];
var SHORT_RESULTS_HEADERS = ['EvaluacionId', 'EvaluacionNombre', 'Tema', 'DNI', 'Apellidos', 'Nombres', 'Guardia', 'Nota', 'Porcentaje', 'FechaHora', 'TotalPreguntas', 'Correctas', 'PreguntasErroneas'];

function getOrCreateSheetWithHeaders(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }
  var firstRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  if (!firstRow[0] || String(firstRow[0]).trim() === '') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

/**
 * Asegura que una hoja exista con sus cabeceras SIN modificar hojas ya existentes.
 *  - Si la hoja NO existe: la crea y escribe la fila de cabeceras.
 *  - Si la hoja YA existe: no se toca nada (ni cabeceras ni filas con datos).
 *    Única excepción segura: si existe pero está totalmente vacía (sin encabezados
 *    ni datos), se escriben solo las cabeceras.
 * Devuelve true únicamente cuando la hoja se creó nueva.
 */
function ensureSheetHeaders_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    ss.insertSheet(name).getRange(1, 1, 1, headers.length).setValues([headers]);
    return true;
  }
  if (sheet.getLastRow() === 0 && sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return false;
}

function buildRowFromObject(headers, valueMap) {
  return headers.map(function(h) {
    return valueMap[h] !== undefined && valueMap[h] !== null ? valueMap[h] : '';
  });
}

function nowPeruString() {
  // dd/MM/yyyy - (HH:mm:ss) en zona horaria de Lima
  var tz = 'America/Lima';
  return Utilities.formatDate(new Date(), tz, "dd/MM/yyyy") + ' - (' +
         Utilities.formatDate(new Date(), tz, "HH:mm:ss") + ')';
}

function createShortEval(ss, data) {
  var sheet = getOrCreateSheetWithHeaders(ss, SHORT_EVALS_SHEET_NAME, SHORT_EVALS_HEADERS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var chunkIds = Array.isArray(data.chunkIds) ? data.chunkIds.join('|') : String(data.chunkIds || '');
  var rowData = buildRowFromObject(headers, {
    Id: String(data.id || '').trim(),
    Nombre: String(data.nombre || '').trim(),
    Descripcion: String(data.descripcion || '').trim(),
    TopicId: String(data.topicId || '').trim(),
    TopicTitle: String(data.topicTitle || '').trim(),
    ChunkIds: chunkIds,
    Activo: data.activo === true || String(data.activo) === 'true' ? 'true' : 'false',
    FechaCreacion: data.fechaCreacion ? String(data.fechaCreacion) : nowPeruString()
  });
  sheet.appendRow(rowData);
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Evaluación creada' });
}

function updateShortEval(ss, data) {
  var sheet = ss.getSheetByName(SHORT_EVALS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'error', message: 'Hoja SHORT_EVALUACIONES no encontrada' });
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idIdx = headers.indexOf('Id');
  var activoIdx = headers.indexOf('Activo');
  if (idIdx === -1) return createResponse({ status: 'error', message: 'Columna Id no encontrada' });
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idIdx]).trim() === String(data.id).trim()) {
      if (activoIdx !== -1 && data.activo !== undefined) {
        sheet.getRange(i + 1, activoIdx + 1).setValue(data.activo === true || String(data.activo) === 'true' ? 'true' : 'false');
      }
      SpreadsheetApp.flush();
      return createResponse({ status: 'ok', message: 'Evaluación actualizada' });
    }
  }
  return createResponse({ status: 'error', message: 'Evaluación no encontrada' });
}

function deleteShortEval(ss, data) {
  var sheet = ss.getSheetByName(SHORT_EVALS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'error', message: 'Hoja SHORT_EVALUACIONES no encontrada' });
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idIdx = headers.indexOf('Id');
  if (idIdx === -1) return createResponse({ status: 'error', message: 'Columna Id no encontrada' });
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][idIdx]).trim() === String(data.id).trim()) {
      sheet.deleteRow(i + 1);
    }
  }
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Evaluación eliminada' });
}

function saveShortEvalResult(ss, data) {
  var sheet = getOrCreateSheetWithHeaders(ss, SHORT_RESULTS_SHEET_NAME, SHORT_RESULTS_HEADERS);
  // Asegura la columna en hojas creadas antes de esta versión
  getOrCreateColumn(sheet, 'Guardia');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Blindaje anti-duplicado: si ya existe (EvaluacionId + DNI), no volver a insertar.
  // Acotado por DNI (TextFinder de 1 columna) en vez de traer toda la hoja a memoria —
  // una persona tiene a lo sumo un puñado de evaluaciones rendidas, no miles.
  var dupExists = findRowsByColumnValue_(sheet, 'DNI', String(data.dni || '').trim())
    .some(function (m) { return String(rowToObject_(m.headers, m.values).EvaluacionId).trim() === String(data.evaluacionId).trim(); });
  if (dupExists) {
    return createResponse({ status: 'ok', message: 'Ya registrado', duplicate: true });
  }

  var wrongJson = '';
  try { wrongJson = JSON.stringify(data.preguntasErroneas || []); } catch (e) { wrongJson = '[]'; }

  var rowData = buildRowFromObject(headers, {
    EvaluacionId: String(data.evaluacionId || '').trim(),
    EvaluacionNombre: String(data.evaluacionNombre || '').trim(),
    Tema: String(data.tema || '').trim(),
    DNI: String(data.dni || '').trim(),
    Apellidos: String(data.apellidos || '').trim(),
    Nombres: String(data.nombres || '').trim(),
    Guardia: String(data.guardia || '').trim(),
    Nota: data.nota !== undefined ? data.nota : '',
    Porcentaje: data.porcentaje !== undefined ? data.porcentaje : '',
    FechaHora: nowPeruString(),
    TotalPreguntas: data.totalPreguntas !== undefined ? data.totalPreguntas : '',
    Correctas: data.correctas !== undefined ? data.correctas : '',
    PreguntasErroneas: wrongJson
  });
  sheet.appendRow(rowData);
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Resultado guardado' });
}

function deleteShortEvalResult(ss, data) {
  var sheet = ss.getSheetByName(SHORT_RESULTS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'error', message: 'Hoja SHORT_RESULTADOS no encontrada' });
  // Acotado por DNI en vez de leer toda la hoja — una persona rinde a lo sumo
  // un puñado de evaluaciones, no hace falta traer las de todos a memoria.
  var rows = findRowsByColumnValue_(sheet, 'DNI', String(data.dni || '').trim())
    .filter(function (m) { return String(rowToObject_(m.headers, m.values).EvaluacionId).trim() === String(data.evaluacionId).trim(); })
    .map(function (m) { return m.row; })
    .sort(function (a, b) { return b - a; }); // de atrás hacia adelante para que borrar no corra los índices restantes
  rows.forEach(function (row) { sheet.deleteRow(row); });
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Resultado eliminado', deleted: rows.length });
}

// =============================================
// PAC - PROGRAMA ANUAL DE CAPACITACIONES
// =============================================

var PAC_PROGRAMAS_HEADERS = ['Id', 'Nombre', 'Descripcion', 'Tema', 'Capacitador', 'FechaProgramada', 'HoraProgramada', 'MaterialUrl', 'MaterialNombre', 'Perfiles', 'DnisAsignados', 'NotaAprobatoria', 'MaxIntentos', 'Activo', 'FechaCreacion'];
var PAC_PREGUNTAS_HEADERS = ['IdPregunta', 'ProgramaId', 'Pregunta', 'OpcionA', 'OpcionB', 'OpcionC', 'OpcionD', 'RespuestaCorrecta', 'Explicacion', 'Orden'];
var PAC_RESULTADOS_HEADERS = ['Id', 'ProgramaId', 'ProgramaNombre', 'Tema', 'Intento', 'DNI', 'Apellidos', 'Nombres', 'Guardia', 'Empresa', 'Area', 'Nota', 'Aprobado', 'TotalPreguntas', 'Correctas', 'PreguntasErroneas', 'Encuesta', 'Consentimiento', 'FirmaUrl', 'SelfieUrl', 'ConstanciaPdfUrl', 'FechaHora', 'Dispositivo'];

/**
 * Sube el material de referencia (PDF/imagen/etc.) de un programa PAC a
 * <RAÍZ>/PAC/MATERIAL. Es solo material de consulta del admin/capacitación
 * presencial — nunca se muestra al trabajador en el flujo de evaluación.
 */
function uploadPacMaterial(data) {
  if (!data.fileBase64) return createResponse({ status: 'error', message: 'Archivo requerido' });
  var fileName = String(data.fileName || 'material').trim() || 'material';
  var mimeType = String(data.mimeType || 'application/octet-stream');
  var raw = data.fileBase64.indexOf(',') !== -1 ? data.fileBase64.split(',')[1] : data.fileBase64;
  var blob = Utilities.newBlob(Utilities.base64Decode(raw), mimeType, fileName);
  var folder = getOrCreateSubFolder(getPacFolder_(), 'MATERIAL');
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return createResponse({ status: 'ok', url: file.getUrl(), nombre: fileName });
}

/** Crea o actualiza (por Id) un programa del PAC — reemplaza la fila completa, igual que upsertActaDocumento. */
function createPacPrograma(ss, data) {
  return upsertPacPrograma_(ss, data, 'Programa creado');
}
function updatePacPrograma(ss, data) {
  return upsertPacPrograma_(ss, data, 'Programa actualizado');
}
function upsertPacPrograma_(ss, data, okMessage) {
  var sheet = getOrCreateSheetWithHeaders(ss, PAC_PROGRAMAS_SHEET_NAME, PAC_PROGRAMAS_HEADERS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idIdx = headers.indexOf('Id');
  var perfiles = Array.isArray(data.perfiles) ? data.perfiles.join('|') : String(data.perfiles || '');
  var dnis = Array.isArray(data.dnisAsignados) ? data.dnisAsignados.join('|') : String(data.dnisAsignados || '');
  var valueMap = {
    Id: String(data.id || '').trim(),
    Nombre: String(data.nombre || '').trim(),
    Descripcion: String(data.descripcion || '').trim(),
    Tema: String(data.tema || '').trim(),
    Capacitador: String(data.capacitador || '').trim(),
    FechaProgramada: String(data.fechaProgramada || '').trim(),
    HoraProgramada: String(data.horaProgramada || '').trim(),
    MaterialUrl: String(data.materialUrl || '').trim(),
    MaterialNombre: String(data.materialNombre || '').trim(),
    Perfiles: perfiles,
    DnisAsignados: dnis,
    NotaAprobatoria: data.notaAprobatoria !== undefined && data.notaAprobatoria !== '' ? Number(data.notaAprobatoria) : 14,
    MaxIntentos: data.maxIntentos !== undefined && data.maxIntentos !== '' ? Number(data.maxIntentos) : 3,
    Activo: (data.activo === false || String(data.activo) === 'false') ? 'false' : 'true',
    FechaCreacion: data.fechaCreacion ? String(data.fechaCreacion) : nowPeruString()
  };

  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idIdx]).trim() === valueMap.Id && valueMap.Id !== '') {
      var fcIdx = headers.indexOf('FechaCreacion');
      if (fcIdx !== -1 && values[i][fcIdx]) valueMap.FechaCreacion = values[i][fcIdx];
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([buildRowFromObject(headers, valueMap)]);
      SpreadsheetApp.flush();
      return createResponse({ status: 'ok', message: okMessage });
    }
  }
  sheet.appendRow(buildRowFromObject(headers, valueMap));
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: okMessage });
}

/** Elimina un programa PAC por Id. No borra en cascada sus preguntas/resultados (mismo criterio que deleteShortEval/deleteActaDocumento). */
function deletePacPrograma(ss, data) {
  var sheet = ss.getSheetByName(PAC_PROGRAMAS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'error', message: 'Hoja PAC_PROGRAMAS no encontrada' });
  var values = sheet.getDataRange().getValues();
  var idIdx = values[0].indexOf('Id');
  if (idIdx === -1) return createResponse({ status: 'error', message: 'Columna Id no encontrada' });
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][idIdx]).trim() === String(data.id).trim()) {
      sheet.deleteRow(i + 1);
    }
  }
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Programa eliminado' });
}

/**
 * Guarda en bloque el banco de preguntas de un programa: actualiza las que ya
 * existen (por IdPregunta), agrega las nuevas, y borra las que ya no vienen en
 * la lista (el cliente siempre manda el set completo de preguntas del programa).
 */
function upsertPacPreguntas(ss, data) {
  var sheet = getOrCreateSheetWithHeaders(ss, PAC_PREGUNTAS_SHEET_NAME, PAC_PREGUNTAS_HEADERS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var programaId = String(data.programaId || '').trim();
  var preguntas = Array.isArray(data.preguntas) ? data.preguntas : [];

  var values = sheet.getDataRange().getValues();
  var idIdx = headers.indexOf('IdPregunta');
  var progIdx = headers.indexOf('ProgramaId');

  var incomingIds = {};
  preguntas.forEach(function (p) { incomingIds[String(p.idPregunta || '').trim()] = true; });

  // Borra (de atrás hacia adelante) las filas de este programa que ya no vienen en el set entrante
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][progIdx]).trim() === programaId && !incomingIds[String(values[i][idIdx]).trim()]) {
      sheet.deleteRow(i + 1);
    }
  }

  // Re-lee tras los borrados para ubicar filas existentes a actualizar
  values = sheet.getDataRange().getValues();
  preguntas.forEach(function (p, idx) {
    var valueMap = {
      IdPregunta: String(p.idPregunta || '').trim(),
      ProgramaId: programaId,
      Pregunta: String(p.pregunta || '').trim(),
      OpcionA: String(p.optionA || '').trim(),
      OpcionB: String(p.optionB || '').trim(),
      OpcionC: String(p.optionC || '').trim(),
      OpcionD: String(p.optionD || '').trim(),
      RespuestaCorrecta: String(p.correctAnswer || '').trim(),
      Explicacion: String(p.explanation || '').trim(),
      Orden: p.orden !== undefined ? p.orden : idx
    };
    var rowIndex = -1;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][idIdx]).trim() === valueMap.IdPregunta && valueMap.IdPregunta !== '') { rowIndex = i + 1; break; }
    }
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, headers.length).setValues([buildRowFromObject(headers, valueMap)]);
    } else {
      sheet.appendRow(buildRowFromObject(headers, valueMap));
    }
  });

  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Preguntas guardadas' });
}

/**
 * Registra un intento de evaluación PAC, aplicando server-side la regla de
 * negocio (no confiar en el cliente): si el DNI ya aprobó este programa, se
 * rechaza; si ya usó todos los intentos permitidos, se rechaza; si no, se
 * asigna el número de intento y se suben constancia PDF + firma + selfie.
 * Usa LockService porque el conteo de intentos debe ser atómico ante envíos
 * concurrentes del mismo DNI (p.ej. doble clic o reintento de red).
 */
function savePacResultado(ss, data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (eLock) {
    return createResponse({ status: 'error', message: 'El sistema está ocupado, intenta nuevamente en unos segundos.' });
  }
  try {
    if (!data.dni) return createResponse({ status: 'error', message: 'DNI requerido' });
    if (!data.programaId) return createResponse({ status: 'error', message: 'Programa requerido' });
    var dni = String(data.dni).trim();
    var programaId = String(data.programaId).trim();

    var programasSheet = ss.getSheetByName(PAC_PROGRAMAS_SHEET_NAME);
    if (!programasSheet) return createResponse({ status: 'error', message: 'Hoja PAC_PROGRAMAS no encontrada' });
    var progValues = programasSheet.getDataRange().getValues();
    var progHeaders = progValues[0];
    var progIdIdx = progHeaders.indexOf('Id');
    var maxIntentosIdx = progHeaders.indexOf('MaxIntentos');
    var maxIntentos = 3;
    var found = false;
    for (var p = 1; p < progValues.length; p++) {
      if (String(progValues[p][progIdIdx]).trim() === programaId) {
        found = true;
        var raw = progValues[p][maxIntentosIdx];
        if (raw !== '' && raw !== undefined && raw !== null) maxIntentos = Number(raw);
        break;
      }
    }
    if (!found) return createResponse({ status: 'error', message: 'Programa no encontrado' });

    var sheet = getOrCreateSheetWithHeaders(ss, PAC_RESULTADOS_SHEET_NAME, PAC_RESULTADOS_HEADERS);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    // Acotado por DNI (TextFinder de 1 columna) en vez de sheet.getDataRange() completo:
    // esta hoja crece con CADA intento de CADA trabajador en CADA programa, así que a
    // diferencia de PAC_PROGRAMAS (catálogo chico) sí conviene no traerla entera.
    var previos = findRowsByColumnValue_(sheet, 'DNI', dni)
      .map(function (m) { return rowToObject_(m.headers, m.values); })
      .filter(function (r) { return String(r.ProgramaId).trim() === programaId; });
    var notaPrevia = null;
    var intentosUsados = 0;
    for (var pi = 0; pi < previos.length; pi++) {
      intentosUsados++;
      if (String(previos[pi].Aprobado).trim() === 'true') {
        return createResponse({ status: 'error', code: 'ALREADY_PASSED', message: 'Ya aprobaste esta capacitación.', nota: previos[pi].Nota });
      }
      notaPrevia = previos[pi].Nota;
    }
    if (intentosUsados >= maxIntentos) {
      return createResponse({ status: 'error', code: 'NO_ATTEMPTS_LEFT', message: 'Ya usaste tus ' + maxIntentos + ' intentos permitidos.', nota: notaPrevia });
    }

    var intento = intentosUsados + 1;
    var nota = Number(data.nota) || 0;
    var notaAprobatoriaIdx = progHeaders.indexOf('NotaAprobatoria');
    var notaAprobatoria = 14;
    for (var p2 = 1; p2 < progValues.length; p2++) {
      if (String(progValues[p2][progIdIdx]).trim() === programaId) {
        var rawNa = progValues[p2][notaAprobatoriaIdx];
        if (rawNa !== '' && rawNa !== undefined && rawNa !== null) notaAprobatoria = Number(rawNa);
        break;
      }
    }
    var aprobado = nota >= notaAprobatoria;

    var dniFolder = getOrCreateSubFolder(getOrCreateSubFolder(getPacFolder_(), 'RESULTADOS'), dni);
    var now = new Date();
    var slug = String(data.programaNombre || 'PAC').trim().toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚÜÑ]/gi, '_').replace(/_+/g, '_');

    var pdfUrl = '';
    if (data.pdfBase64) {
      var rawPdf = data.pdfBase64.indexOf(',') !== -1 ? data.pdfBase64.split(',')[1] : data.pdfBase64;
      var pdfBlob = Utilities.newBlob(Utilities.base64Decode(rawPdf), 'application/pdf', dni + '_' + slug + '_INTENTO' + intento + '_' + now.getTime() + '.pdf');
      var pdfFile = dniFolder.createFile(pdfBlob);
      pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      pdfUrl = pdfFile.getUrl();
    }
    var firmaUrl = '';
    if (data.signatureBase64) {
      var rawFirma = data.signatureBase64.indexOf(',') !== -1 ? data.signatureBase64.split(',')[1] : data.signatureBase64;
      var firmaBlob = Utilities.newBlob(Utilities.base64Decode(rawFirma), 'image/png', dni + '_' + slug + '_FIRMA_INTENTO' + intento + '_' + now.getTime() + '.png');
      var firmaFile = dniFolder.createFile(firmaBlob);
      firmaFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      firmaUrl = firmaFile.getUrl();
    }
    var selfieUrl = '';
    if (data.selfieBase64) {
      var rawSelfie = data.selfieBase64.indexOf(',') !== -1 ? data.selfieBase64.split(',')[1] : data.selfieBase64;
      var selfieBlob = Utilities.newBlob(Utilities.base64Decode(rawSelfie), 'image/jpeg', dni + '_' + slug + '_SELFIE_INTENTO' + intento + '_' + now.getTime() + '.jpg');
      var selfieFile = dniFolder.createFile(selfieBlob);
      selfieFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      selfieUrl = selfieFile.getUrl();
    }

    var wrongJson = '[]';
    try { wrongJson = JSON.stringify(data.preguntasErroneas || []); } catch (e1) {}
    var encuestaJson = '{}';
    try { encuestaJson = JSON.stringify(data.encuesta || {}); } catch (e2) {}

    var rowData = buildRowFromObject(headers, {
      Id: dni + '-' + programaId + '-' + now.getTime(),
      ProgramaId: programaId,
      ProgramaNombre: String(data.programaNombre || '').trim(),
      Tema: String(data.tema || '').trim(),
      Intento: intento,
      DNI: dni,
      Apellidos: String(data.apellidos || '').trim(),
      Nombres: String(data.nombres || '').trim(),
      Guardia: String(data.guardia || '').trim(),
      Empresa: String(data.empresa || '').trim(),
      Area: String(data.area || '').trim(),
      Nota: nota,
      Aprobado: aprobado ? 'true' : 'false',
      TotalPreguntas: data.totalPreguntas !== undefined ? data.totalPreguntas : '',
      Correctas: data.correctas !== undefined ? data.correctas : '',
      PreguntasErroneas: wrongJson,
      Encuesta: encuestaJson,
      Consentimiento: data.consentimiento ? 'true' : 'false',
      FirmaUrl: firmaUrl,
      SelfieUrl: selfieUrl,
      ConstanciaPdfUrl: pdfUrl,
      FechaHora: nowPeruString(),
      Dispositivo: String(data.dispositivo || '').trim()
    });
    sheet.appendRow(rowData);
    SpreadsheetApp.flush();
    return createResponse({ status: 'ok', intento: intento, nota: nota, aprobado: aprobado, url: pdfUrl });
  } catch (err) {
    return createResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

/** Borra un intento puntual (ProgramaId+DNI+Intento) — permite al admin "deshacer" un registro cargado por error. */
function deletePacResultado(ss, data) {
  var sheet = ss.getSheetByName(PAC_RESULTADOS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'error', message: 'Hoja PAC_RESULTADOS no encontrada' });
  // Acotado por DNI en vez de leer toda la hoja — mismo motivo que savePacResultado.
  var rows = findRowsByColumnValue_(sheet, 'DNI', String(data.dni || '').trim())
    .filter(function (m) {
      var r = rowToObject_(m.headers, m.values);
      var matchesIntento = data.intento === undefined || data.intento === null || String(r.Intento) === String(data.intento);
      return String(r.ProgramaId).trim() === String(data.programaId).trim() && matchesIntento;
    })
    .map(function (m) { return m.row; })
    .sort(function (a, b) { return b - a; });
  rows.forEach(function (row) { sheet.deleteRow(row); });
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Resultado eliminado', deleted: rows.length });
}

// =============================================
// ACTAS DE ENTREGA / COMPROMISOS
// =============================================

var ACTAS_DOCS_HEADERS = ['Id', 'Titulo', 'Descripcion', 'Perfiles', 'LinkDrive', 'DnisAsignados', 'CuerpoHtml', 'Items', 'DriveDocUrl', 'RequiereFirmaDibujada', 'Activo', 'FechaCreacion'];
var ACTAS_FIRMAS_HEADERS = ['Id', 'DocumentoId', 'DocumentoTitulo', 'DNI', 'Apellidos', 'Nombres', 'Cargo', 'Area', 'Empresa', 'Correo', 'FechaFirma', 'ActaPdfUrl', 'SelfieUrl', 'FirmaUrl', 'FirmaAsistenciaUrl', 'CorreoEnviado', 'Dispositivo', 'Documentos'];

/**
 * Sube un archivo (PDF, imagen, etc.) elegido por el admin en el formulario de
 * Actas y Compromisos a <RAÍZ>/ACTAS/DOCUMENTOS y devuelve su URL para usarla
 * como enlace del documento virtual. No toca la hoja de cálculo.
 */
function uploadActaArchivo(data) {
  if (!data.fileBase64) return createResponse({ status: 'error', message: 'Archivo requerido' });
  var fileName = String(data.fileName || 'documento').trim() || 'documento';
  var mimeType = String(data.mimeType || 'application/octet-stream');
  var raw = data.fileBase64.indexOf(',') !== -1 ? data.fileBase64.split(',')[1] : data.fileBase64;
  var blob = Utilities.newBlob(Utilities.base64Decode(raw), mimeType, fileName);
  var folder = getOrCreateSubFolder(getActasFolder_(), 'DOCUMENTOS');
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return createResponse({ status: 'ok', url: file.getUrl() });
}

function upsertActaDocumento(ss, data) {
  var sheet = getOrCreateSheetWithHeaders(ss, ACTAS_DOCS_SHEET_NAME, ACTAS_DOCS_HEADERS);
  // Asegura columnas en hojas creadas antes de esta versión
  getOrCreateColumn(sheet, 'Items');
  getOrCreateColumn(sheet, 'LinkDrive');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idIdx = headers.indexOf('Id');
  var perfiles = Array.isArray(data.perfiles) ? data.perfiles.join('|') : String(data.perfiles || '');
  var dnis = Array.isArray(data.dnisAsignados) ? data.dnisAsignados.join('|') : String(data.dnisAsignados || '');
  // `items` llega como cadena JSON desde el cliente; se guarda tal cual
  var itemsJson = typeof data.items === 'string' ? data.items : JSON.stringify(data.items || []);
  var valueMap = {
    Id: String(data.id || '').trim(),
    Titulo: String(data.titulo || '').trim(),
    Descripcion: String(data.descripcion || '').trim(),
    Perfiles: perfiles,
    LinkDrive: String(data.linkDrive || '').trim(),
    DnisAsignados: dnis,
    CuerpoHtml: String(data.cuerpoHtml || ''),
    Items: itemsJson,
    DriveDocUrl: String(data.driveDocUrl || '').trim(),
    RequiereFirmaDibujada: (data.requiereFirmaDibujada === false || String(data.requiereFirmaDibujada) === 'false') ? 'false' : 'true',
    Activo: (data.activo === false || String(data.activo) === 'false') ? 'false' : 'true',
    FechaCreacion: data.fechaCreacion ? String(data.fechaCreacion) : nowPeruString()
  };

  // Update if the Id already exists, else append
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idIdx]).trim() === valueMap.Id && valueMap.Id !== '') {
      // Preserve original FechaCreacion
      var fcIdx = headers.indexOf('FechaCreacion');
      if (fcIdx !== -1 && values[i][fcIdx]) valueMap.FechaCreacion = values[i][fcIdx];
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([buildRowFromObject(headers, valueMap)]);
      SpreadsheetApp.flush();
      return createResponse({ status: 'ok', message: 'Documento actualizado' });
    }
  }
  sheet.appendRow(buildRowFromObject(headers, valueMap));
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Documento creado' });
}

function deleteActaDocumento(ss, data) {
  var sheet = ss.getSheetByName(ACTAS_DOCS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'error', message: 'Hoja ACTAS_DOCUMENTOS no encontrada' });
  var values = sheet.getDataRange().getValues();
  var idIdx = values[0].indexOf('Id');
  var linkDriveIdx = values[0].indexOf('LinkDrive');
  if (idIdx === -1) return createResponse({ status: 'error', message: 'Columna Id no encontrada' });
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][idIdx]).trim() === String(data.id).trim()) {
      // Si el archivo se subió mediante la app (columna LinkDrive), lo enviamos a la
      // papelera de Drive al borrar el documento. Los enlaces pegados manualmente
      // (DriveDocUrl / item.driveUrl) pueden apuntar a archivos ajenos y no se tocan.
      if (linkDriveIdx !== -1) {
        var linkDrive = String(values[i][linkDriveIdx] || '').trim();
        if (linkDrive) {
          var fileId = extractDriveId(linkDrive);
          if (fileId) {
            try { DriveApp.getFileById(fileId).setTrashed(true); } catch (eFile) { /* archivo ya no existe o inaccesible */ }
          }
        }
      }
      sheet.deleteRow(i + 1);
    }
  }
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Documento eliminado' });
}

function saveActaFirma(ss, data) {
  try {
    if (!data.dni) return createResponse({ status: 'error', message: 'DNI requerido' });
    if (!data.documentoId) return createResponse({ status: 'error', message: 'Documento requerido' });

    var sheet = getOrCreateSheetWithHeaders(ss, ACTAS_FIRMAS_SHEET_NAME, ACTAS_FIRMAS_HEADERS);
    // Asegura columnas en hojas creadas antes de esta versión
    getOrCreateColumn(sheet, 'FirmaAsistenciaUrl');
    getOrCreateColumn(sheet, 'Documentos');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // `documentos`: ids de los renglones que cubre esta firma (solo aplica al acta
    // general; para el modelo antiguo de firma por documento individual llega vacío).
    var documentosNuevos = Array.isArray(data.documentos) ? data.documentos.map(function (x) { return String(x); }) : [];
    var documentosNuevosJson = JSON.stringify(documentosNuevos.slice().sort());

    // Acotado por DNI (TextFinder de 1 columna) en vez de sheet.getDataRange() completo:
    // ACTAS_FIRMAS crece con cada firma de cada trabajador en cada documento — una
    // persona firma a lo sumo un puñado de documentos, no hace falta traer todo.
    var previas = findRowsByColumnValue_(sheet, 'DNI', String(data.dni || '').trim())
      .map(function (m) { return rowToObject_(m.headers, m.values); })
      .filter(function (r) { return String(r.DocumentoId).trim() === String(data.documentoId).trim(); });
    var esActaGeneral = String(data.documentoId).trim() === 'ACTA_GENERAL';
    for (var pfi = 0; pfi < previas.length; pfi++) {
      var prevRow = previas[pfi];
      if (!esActaGeneral) {
        // Modelo antiguo (firma por documento individual): una sola firma por documento+DNI.
        return createResponse({ status: 'ok', message: 'Ya firmado', duplicate: true, url: prevRow.ActaPdfUrl || '' });
      }
      // Acta general: se permite volver a firmar cuando hay documentos nuevos que
      // cubrir; solo se bloquea si el lote es idéntico a uno ya firmado (doble envío).
      var existente = String(prevRow.Documentos || '[]');
      var existenteOrdenado = JSON.stringify((function () { try { return JSON.parse(existente); } catch (e) { return []; } })().slice().sort());
      if (existenteOrdenado === documentosNuevosJson) {
        return createResponse({ status: 'ok', message: 'Ya firmado', duplicate: true, url: prevRow.ActaPdfUrl || '' });
      }
    }

    var now = new Date();
    var dni = String(data.dni).trim();
    // Si el cliente envía su propio timestamp (generado al renderizar el PDF), se
    // usa tal cual: así el N° impreso en el acta coincide con el Id guardado aquí.
    var docId = data.timestampId ? Number(data.timestampId) : now.getTime();

    // Estructura: <GENERAL>/DOC_ENTREGAS/<DNI>/  (y aseguramos que exista DOCUMENTOS)
    var parentFolder = getActasFolder_();
    getOrCreateSubFolder(parentFolder, 'DOCUMENTOS');
    var entregasFolder = getOrCreateSubFolder(parentFolder, 'DOC_ENTREGAS');
    var dniFolder = getOrCreateSubFolder(entregasFolder, dni);

    var slug = data.documentoTitulo
      ? String(data.documentoTitulo).trim().toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚÜÑ]/gi, '_').replace(/_+/g, '_')
      : 'ACTA';

    // 1. Guardar el PDF del acta — nombre: <DNI>_<TITULO_DOC>_<ID>.pdf
    var rawPdf = data.pdfBase64.includes(',') ? data.pdfBase64.split(',')[1] : data.pdfBase64;
    var pdfName = dni + '_' + slug + '_' + docId + '.pdf';
    var pdfBlob = Utilities.newBlob(Utilities.base64Decode(rawPdf), 'application/pdf', pdfName);
    var pdfFile = dniFolder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var pdfUrl = pdfFile.getUrl();

    // 2. Selfie y firma (opcionales) — misma carpeta del DNI
    var selfieUrl = '';
    if (data.selfieBase64) {
      var rawSelfie = data.selfieBase64.includes(',') ? data.selfieBase64.split(',')[1] : data.selfieBase64;
      var selfieBlob = Utilities.newBlob(Utilities.base64Decode(rawSelfie), 'image/jpeg', dni + '_' + slug + '_SELFIE_' + docId + '.jpg');
      var selfieFile = dniFolder.createFile(selfieBlob);
      selfieFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      selfieUrl = selfieFile.getUrl();
    }
    var firmaUrl = '';
    if (data.signatureBase64) {
      var rawFirma = data.signatureBase64.includes(',') ? data.signatureBase64.split(',')[1] : data.signatureBase64;
      var firmaBlob = Utilities.newBlob(Utilities.base64Decode(rawFirma), 'image/png', dni + '_' + slug + '_FIRMA_' + docId + '.png');
      var firmaFile = dniFolder.createFile(firmaBlob);
      firmaFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      firmaUrl = firmaFile.getUrl();
    }
    // Firma adicional solo si el acta incluye alguna capacitación (Lista de Asistencia)
    var firmaAsistenciaUrl = '';
    if (data.firmaAsistenciaBase64) {
      var rawFirmaAsis = data.firmaAsistenciaBase64.includes(',') ? data.firmaAsistenciaBase64.split(',')[1] : data.firmaAsistenciaBase64;
      var firmaAsisBlob = Utilities.newBlob(Utilities.base64Decode(rawFirmaAsis), 'image/png', dni + '_' + slug + '_FIRMA_ASISTENCIA_' + docId + '.png');
      var firmaAsisFile = dniFolder.createFile(firmaAsisBlob);
      firmaAsisFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      firmaAsistenciaUrl = firmaAsisFile.getUrl();
    }

    // 3. Enviar correo con acta adjunta + documento digital de Drive (si existe)
    var correoEnviado = 'NO';
    var correo = String(data.correo || '').trim();
    if (correo && /@/.test(correo)) {
      try {
        var attachments = [pdfBlob];
        if (data.driveDocUrl) {
          var driveId = extractDriveId(data.driveDocUrl);
          if (driveId) {
            try { attachments.push(DriveApp.getFileById(driveId).getBlob()); } catch (eAtt) { /* doc inaccesible, se omite */ }
          }
        }
        MailApp.sendEmail({
          to: correo,
          subject: 'Acta firmada: ' + (data.documentoTitulo || 'Documento'),
          htmlBody: buildActaEmailHtml({
            nombres: data.nombres, apellidos: data.apellidos, dni: dni,
            documentoTitulo: data.documentoTitulo, fecha: nowPeruString(), pdfUrl: pdfUrl
          }),
          attachments: attachments,
          name: 'Capacitaciones SST'
        });
        correoEnviado = 'SI';
      } catch (eMail) {
        correoEnviado = 'NO';
      }
    }

    // 4. Registrar la firma
    var rowData = buildRowFromObject(headers, {
      Id: dni + '-' + String(data.documentoId).trim() + '-' + docId,
      DocumentoId: String(data.documentoId).trim(),
      DocumentoTitulo: String(data.documentoTitulo || '').trim(),
      DNI: dni,
      Apellidos: String(data.apellidos || '').trim(),
      Nombres: String(data.nombres || '').trim(),
      Cargo: String(data.cargo || '').trim(),
      Area: String(data.area || '').trim(),
      Empresa: String(data.empresa || '').trim(),
      Correo: correo,
      FechaFirma: nowPeruString(),
      ActaPdfUrl: pdfUrl,
      SelfieUrl: selfieUrl,
      FirmaUrl: firmaUrl,
      FirmaAsistenciaUrl: firmaAsistenciaUrl,
      CorreoEnviado: correoEnviado,
      Dispositivo: String(data.dispositivo || '').trim(),
      Documentos: documentosNuevosJson
    });
    sheet.appendRow(rowData);
    SpreadsheetApp.flush();
    return createResponse({ status: 'ok', url: pdfUrl, correoEnviado: correoEnviado });
  } catch (err) {
    return createResponse({ status: 'error', message: err.toString() });
  }
}

/**
 * Autorización de firma digital del onboarding (se pide una sola vez, luego de
 * completar el perfil, antes de poder usar el resto de la app). Sube la firma
 * dibujada, la selfie de verificación y la constancia en PDF a
 * <RAÍZ>/USUARIOS/<DNI>/, y guarda los enlaces en INGRESOS: FOTOGRAFIA (firma)
 * y SELFIE. Si la fila del trabajador todavía no existe (el onboarding aún no
 * llega a 'registerIngreso'), la crea reusando registerIngreso().
 */
function saveOnboardingConsent(ss, data) {
  try {
    if (!data.dni) return createResponse({ status: 'error', message: 'DNI requerido' });
    var dni = String(data.dni).trim();
    var now = new Date();

    var sheet = ss.getSheetByName(INGRESOS_SHEET_NAME);
    if (!sheet) return createResponse({ status: 'error', message: 'Hoja INGRESOS no encontrada' });

    // Asegura que exista la fila del trabajador (mismo upsert que la acción 'registerIngreso';
    // preserva Avance/Nota/ProgressJSON si la fila ya existía).
    registerIngreso(sheet, {
      Id: dni + '-' + now.getTime(),
      Apellidos: data.apellidos || '',
      Nombres: data.nombres || '',
      DNI: dni,
      Inicio: nowPeruString(),
      Avance: '0%',
      Publico: '',
      Nota: '',
      UltimoAcceso: nowPeruString(),
      Dispositivo: '',
      ModulosCompletados: '0',
      IntentosQuiz: '0',
      TiempoTotal: '0 min',
      ProgressJSON: '[]',
      EMPRESA: data.empresa || '',
      AREA: data.area || '',
      CARGO: data.cargo || '',
      FECHA_INGRESO: data.fechaIngreso || '',
      FECHA_NACIMIENTO: data.fechaNacimiento || '',
      CORREO: data.correo || '',
      CELULAR: data.celular || '',
      NUMERO_CONTACTO_1: data.contacto1Numero || '',
      PARENTESCO_CONTACTO_1: data.contacto1Parentesco || '',
      NUMERO_CONTACTO_2: data.contacto2Numero || '',
      PARENTESCO_CONTACTO_2: data.contacto2Parentesco || ''
    });

    var dniFolder = getOrCreateSubFolder(getUsuariosFolder_(), dni);

    var firmaUrl = '';
    if (data.signatureBase64) {
      var rawFirma = data.signatureBase64.includes(',') ? data.signatureBase64.split(',')[1] : data.signatureBase64;
      var firmaBlob = Utilities.newBlob(Utilities.base64Decode(rawFirma), 'image/png', dni + '_FIRMA_CONSENTIMIENTO_' + now.getTime() + '.png');
      var firmaFile = dniFolder.createFile(firmaBlob);
      firmaFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      firmaUrl = firmaFile.getUrl();
    }

    var selfieUrl = '';
    if (data.selfieBase64) {
      var rawSelfie = data.selfieBase64.includes(',') ? data.selfieBase64.split(',')[1] : data.selfieBase64;
      var selfieBlob = Utilities.newBlob(Utilities.base64Decode(rawSelfie), 'image/jpeg', dni + '_SELFIE_CONSENTIMIENTO_' + now.getTime() + '.jpg');
      var selfieFile = dniFolder.createFile(selfieBlob);
      selfieFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      selfieUrl = selfieFile.getUrl();
    }

    var pdfUrl = '';
    if (data.pdfBase64) {
      var rawPdf = data.pdfBase64.includes(',') ? data.pdfBase64.split(',')[1] : data.pdfBase64;
      var pdfBlob = Utilities.newBlob(Utilities.base64Decode(rawPdf), 'application/pdf', dni + '_CONSTANCIA_FIRMA_' + now.getTime() + '.pdf');
      var pdfFile = dniFolder.createFile(pdfBlob);
      pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      pdfUrl = pdfFile.getUrl();
    }

    // Escribir enlaces en INGRESOS: FOTOGRAFIA (firma) y SELFIE
    var ingData = sheet.getDataRange().getValues();
    var headers = ingData[0];
    var dniCol = headers.indexOf('DNI') !== -1 ? headers.indexOf('DNI') : headers.indexOf('Id');
    var fotoCol = getOrCreateColumn(sheet, 'FOTOGRAFIA');
    var selfieCol = getOrCreateColumn(sheet, 'SELFIE');
    var certUsoCol = getOrCreateColumn(sheet, 'CERTIFICADO_USO');
    var consentCol = getOrCreateColumn(sheet, 'CONSENTIMIENTO_OK');
    for (var i = 1; i < ingData.length; i++) {
      if (String(ingData[i][dniCol] || '').trim() === dni) {
        if (firmaUrl) sheet.getRange(i + 1, fotoCol + 1).setValue(firmaUrl);
        if (selfieUrl) sheet.getRange(i + 1, selfieCol + 1).setValue(selfieUrl);
        if (pdfUrl) sheet.getRange(i + 1, certUsoCol + 1).setValue(pdfUrl);
        // Marca de que este trabajador YA autorizó su firma digital — sirve
        // para que el admin pueda borrar/reemplazar la foto después sin que
        // se le vuelva a pedir esta autorización en su próximo login.
        if (firmaUrl && selfieUrl) sheet.getRange(i + 1, consentCol + 1).setValue('true');
        break;
      }
    }

    SpreadsheetApp.flush();
    return createResponse({ status: 'ok', firmaUrl: firmaUrl, selfieUrl: selfieUrl, pdfUrl: pdfUrl });
  } catch (err) {
    return createResponse({ status: 'error', message: err.toString() });
  }
}

function resendActaCorreo(ss, data) {
  try {
    var sheet = ss.getSheetByName(ACTAS_FIRMAS_SHEET_NAME);
    if (!sheet) return createResponse({ status: 'error', message: 'Hoja ACTAS_FIRMAS no encontrada' });
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idIdx = headers.indexOf('Id');
    var correoIdx = headers.indexOf('Correo');
    var pdfIdx = headers.indexOf('ActaPdfUrl');
    var tituloIdx = headers.indexOf('DocumentoTitulo');
    var enviadoIdx = headers.indexOf('CorreoEnviado');
    var nombresIdx = headers.indexOf('Nombres');
    var apellidosIdx = headers.indexOf('Apellidos');
    var dniIdx = headers.indexOf('DNI');

    for (var i = 1; i < values.length; i++) {
      if (String(values[i][idIdx]).trim() === String(data.id).trim()) {
        var correo = String(data.correo || values[i][correoIdx] || '').trim();
        if (!correo || !/@/.test(correo)) return createResponse({ status: 'error', message: 'Correo inválido' });
        var pdfUrl = String(values[i][pdfIdx] || '');
        var attachments = [];
        var driveId = extractDriveId(pdfUrl);
        if (driveId) { try { attachments.push(DriveApp.getFileById(driveId).getBlob()); } catch (e) { /* ignore */ } }
        MailApp.sendEmail({
          to: correo,
          subject: 'Acta firmada: ' + (values[i][tituloIdx] || 'Documento'),
          htmlBody: buildActaEmailHtml({
            nombres: values[i][nombresIdx], apellidos: values[i][apellidosIdx], dni: values[i][dniIdx],
            documentoTitulo: values[i][tituloIdx], fecha: nowPeruString(), pdfUrl: pdfUrl
          }),
          attachments: attachments,
          name: 'Capacitaciones SST'
        });
        if (enviadoIdx !== -1) sheet.getRange(i + 1, enviadoIdx + 1).setValue('SI');
        if (correoIdx !== -1 && data.correo) sheet.getRange(i + 1, correoIdx + 1).setValue(correo);
        SpreadsheetApp.flush();
        return createResponse({ status: 'ok', message: 'Correo reenviado' });
      }
    }
    return createResponse({ status: 'error', message: 'Firma no encontrada' });
  } catch (err) {
    return createResponse({ status: 'error', message: err.toString() });
  }
}

/** Extrae el fileId de una URL de Google Drive (varios formatos). */
function extractDriveId(url) {
  if (!url) return '';
  url = String(url);
  var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
          url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
          url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // Si ya es un ID pelado
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url)) return url;
  return '';
}

/** Plantilla HTML del correo de entrega del acta firmada. */
function buildActaEmailHtml(r) {
  var nombre = ((r.nombres || '') + ' ' + (r.apellidos || '')).trim();
  return '' +
'<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#f4f6f8;padding:24px;">' +
  '<div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e1e3e4;">' +
    '<div style="background:linear-gradient(135deg,#00366b,#1b4d89);padding:28px 24px;text-align:center;">' +
      '<div style="font-size:13px;letter-spacing:2px;color:#9dc0e8;font-weight:bold;text-transform:uppercase;">Constancia de firma</div>' +
      '<div style="font-size:22px;color:#ffffff;font-weight:bold;margin-top:6px;">Acta de Entrega / Compromiso</div>' +
    '</div>' +
    '<div style="padding:28px 28px 8px 28px;color:#333;">' +
      '<p style="font-size:15px;margin:0 0 12px 0;">Estimado(a) <strong>' + nombre + '</strong>,</p>' +
      '<p style="font-size:14px;line-height:1.6;margin:0 0 16px 0;">Confirmamos que ha firmado correctamente el siguiente documento. Adjuntamos a este correo el acta firmada en formato PDF para tus registros.</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 20px 0;">' +
        '<tr><td style="padding:8px 0;color:#737781;width:130px;">Documento</td><td style="padding:8px 0;color:#191c1d;font-weight:bold;">' + (r.documentoTitulo || '') + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#737781;">DNI</td><td style="padding:8px 0;color:#191c1d;">' + (r.dni || '') + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#737781;">Fecha de firma</td><td style="padding:8px 0;color:#191c1d;">' + (r.fecha || '') + '</td></tr>' +
      '</table>' +
      (r.pdfUrl ? '<div style="text-align:center;margin:8px 0 20px 0;"><a href="' + r.pdfUrl + '" style="display:inline-block;background:#1b4d89;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 26px;border-radius:10px;">Ver acta en línea</a></div>' : '') +
      '<p style="font-size:12px;color:#9aa0a6;line-height:1.6;margin:16px 0 0 0;border-top:1px solid #eef0f2;padding-top:16px;">Este es un mensaje automático generado tras la firma con verificación facial. Si no reconoces esta actividad, comunícate con el área de Seguridad y Salud en el Trabajo.</p>' +
    '</div>' +
    '<div style="background:#f8f9fa;padding:16px 24px;text-align:center;font-size:11px;color:#9aa0a6;">Capacitaciones SST &middot; Plataforma de aprendizaje corporativo</div>' +
  '</div>' +
'</div>';
}

// =============================================
// ARCHIVADO DE DATOS ANTIGUOS (mantenimiento manual, NO automático)
// =============================================
// Las hojas de intentos/firmas (PAC_RESULTADOS, SHORT_RESULTADOS, ACTAS_FIRMAS)
// solo crecen — nunca se borran filas por el uso normal de la app. Con años de
// uso pueden acercarse al límite de 10 millones de celdas por spreadsheet (límite
// de Google, compartido entre TODAS las hojas del archivo). Esta utilidad MUEVE
// (no borra) las filas de años anteriores al actual a una hoja "<NOMBRE>_ARCHIVO"
// dentro del mismo spreadsheet, dejando la hoja "viva" liviana. Es 100% opcional
// y se dispara a mano desde el menú — nunca se ejecuta sola.

/** Extrae el año de una fecha en el formato "dd/MM/yyyy - (HH:mm:ss)" usado en toda la app. */
function extractYearFromFechaString_(s) {
  var m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? Number(m[3]) : null;
}

/**
 * Mueve a "<sheetName>_ARCHIVO" las filas de `sheetName` cuya columna `fechaColumnName`
 * tenga un año menor a `anioLimite`. No borra nada: las filas quedan en el archivo,
 * solo salen de la hoja viva. Devuelve cuántas filas se movieron.
 */
function archivarHojaPorAnio_(ss, sheetName, fechaColumnName, anioLimite) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var lastCol = sheet.getLastColumn();
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var fechaIdx = headers.indexOf(fechaColumnName);
  if (fechaIdx === -1) return 0;

  var filasAArchivar = [];
  for (var i = 1; i < values.length; i++) {
    var anio = extractYearFromFechaString_(values[i][fechaIdx]);
    if (anio !== null && anio < anioLimite) filasAArchivar.push({ row: i + 1, values: values[i] });
  }
  if (filasAArchivar.length === 0) return 0;

  var archivo = getOrCreateSheetWithHeaders(ss, sheetName + '_ARCHIVO', headers);
  archivo.getRange(archivo.getLastRow() + 1, 1, filasAArchivar.length, lastCol)
    .setValues(filasAArchivar.map(function (f) { return f.values; }));

  // Borra de la hoja viva de atrás hacia adelante para no correr los índices restantes.
  filasAArchivar.slice().reverse().forEach(function (f) { sheet.deleteRow(f.row); });

  SpreadsheetApp.flush();
  return filasAArchivar.length;
}

/**
 * Archiva PAC_RESULTADOS, SHORT_RESULTADOS y ACTAS_FIRMAS: mueve todo lo de años
 * anteriores al actual a hojas "_ARCHIVO", dejando en la hoja viva solo el año en
 * curso. Pide confirmación antes de mover nada. Ejecutar desde el menú, a mano,
 * cuando el admin decida que ya es momento (no hay una frecuencia obligatoria).
 */
function ArchivarDatosAntiguos() {
  var ss = getSpreadsheet_();
  var anioActual = new Date().getFullYear();
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { /* headless */ }

  if (ui) {
    var confirm = ui.alert(
      '📦 Archivar datos antiguos',
      'Se moverán (no se borrarán) a hojas "_ARCHIVO" todas las filas de PAC_RESULTADOS, ' +
      'SHORT_RESULTADOS y ACTAS_FIRMAS con fecha anterior a ' + anioActual + '. ' +
      'Los datos siguen disponibles en las hojas de archivo, solo salen de la hoja viva.\n\n¿Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) return;
  }

  var movidas = {
    PAC_RESULTADOS: archivarHojaPorAnio_(ss, PAC_RESULTADOS_SHEET_NAME, 'FechaHora', anioActual),
    SHORT_RESULTADOS: archivarHojaPorAnio_(ss, SHORT_RESULTS_SHEET_NAME, 'FechaHora', anioActual),
    ACTAS_FIRMAS: archivarHojaPorAnio_(ss, ACTAS_FIRMAS_SHEET_NAME, 'FechaFirma', anioActual),
  };
  var mensaje = 'PAC_RESULTADOS: ' + movidas.PAC_RESULTADOS + ' fila(s) movida(s)\n' +
    'SHORT_RESULTADOS: ' + movidas.SHORT_RESULTADOS + ' fila(s) movida(s)\n' +
    'ACTAS_FIRMAS: ' + movidas.ACTAS_FIRMAS + ' fila(s) movida(s)';
  if (ui) { ui.alert('✅ Archivado completo', mensaje, ui.ButtonSet.OK); }
  else { Logger.log(mensaje); }
  return movidas;
}

// =============================================
// CONFIGURACIÓN / REPLICACIÓN DEL PROYECTO
// (Crea en 1 clic todas las carpetas de Drive y las hojas necesarias)
// =============================================

/** Menú "⚙️ Configuración del Proyecto" al abrir la hoja de cálculo. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('⚙️ Configuración del Proyecto')
      .addItem('🚀 Crear carpetas y hojas', 'CrearCarpetas')
      .addItem('🔎 Ver IDs de carpetas', 'MostrarConfiguracion')
      .addItem('🩺 Diagnóstico del sistema', 'MostrarDiagnostico')
      .addItem('📦 Archivar datos antiguos (PAC/Shorts/Actas)', 'ArchivarDatosAntiguos')
      .addToUi();
  } catch (e) { /* sin UI (ejecución headless) */ }
}

/**
 * FUNCIÓN PRINCIPAL — ejecútala desde el menú "⚙️ Configuración del Proyecto"
 * o con el botón ▶ del editor. Es idempotente y NO destructiva:
 *   - Asegura las subcarpetas dentro de la carpeta raíz (CERTIFICADOS, ACTAS/DOCUMENTOS, ACTAS/DOC_ENTREGAS)
 *   - Crea las hojas de cálculo que falten, con sus cabeceras
 *   - Las hojas, carpetas y datos que YA existen no se modifican
 *   - Registra los IDs actuales en la hoja CONFIG_SISTEMA (metadatos de referencia)
 */
function CrearCarpetas() {
  var resumen = crearEstructuraProyecto();
  try {
    SpreadsheetApp.getUi().alert('✅ Estructura del proyecto lista', resumen.mensaje, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log(resumen.mensaje);
  }
  return resumen;
}

/** Muestra los IDs actuales de carpetas y de la hoja. */
function MostrarConfiguracion() {
  var msg = 'SPREADSHEET_ID (activo): ' + getSpreadsheet_().getId() + '\n' +
    'PROJECT_ROOT_FOLDER_ID: ' + PROJECT_ROOT_FOLDER_ID + '\n' +
    'CERT_FOLDER_ID: ' + getCertFolder_().getId() + '\n' +
    'ACTAS_FOLDER_ID: ' + getActasFolder_().getId();
  try { SpreadsheetApp.getUi().alert('IDs del proyecto', msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(msg); }
}

/** Ejecuta el diagnóstico y muestra el resultado en un cuadro de diálogo. */
function MostrarDiagnostico() {
  var r = ejecutarDiagnostico();
  var icono = { ok: '✅', warn: '⚠️', error: '❌' };
  var lineas = r.checks.map(function (c) {
    return (icono[c.level] || '•') + ' ' + c.label + (c.detail ? '\n     ' + c.detail : '');
  }).join('\n');
  var msg = r.resumen + '\n\n' + lineas;
  try { SpreadsheetApp.getUi().alert('🩺 Diagnóstico del sistema', msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(msg); }
}

/**
 * Crea/asegura carpetas, subcarpetas, hojas y sus cabeceras de forma NO destructiva.
 * Reglas:
 *   - Carpetas/subcarpetas: se crean solo si faltan; si ya existen se reutilizan sin tocarlas.
 *   - Hojas: se crean con sus cabeceras solo si NO existen. Si una hoja ya existe,
 *     no se modifican ni sus cabeceras ni sus filas con datos.
 * Es seguro ejecutarla varias veces: nunca borra ni sobrescribe datos existentes.
 */
function crearEstructuraProyecto() {
  var ss = getSpreadsheet_();

  // 1) Carpeta raíz del proyecto (por ID fijo — no se crea ninguna otra)
  var root = getRootFolder_();

  // 2) Subcarpetas: se crean solo si faltan; si ya existen se reutilizan sin modificarlas
  var certFolder  = getOrCreateSubFolder(root, CERT_FOLDER_NAME);
  var actasFolder = getOrCreateSubFolder(root, ACTAS_FOLDER_NAME);
  getOrCreateSubFolder(actasFolder, 'DOCUMENTOS');
  getOrCreateSubFolder(actasFolder, 'DOC_ENTREGAS');
  var usuariosFolder = getOrCreateSubFolder(root, USUARIOS_FOLDER_NAME);

  // 3) Hojas: se crean con cabeceras solo si faltan; las ya existentes NO se tocan
  var defs = getSheetDefinitions();
  var creadas = [], existentes = [];
  Object.keys(defs).forEach(function (name) {
    var fueCreada = ensureSheetHeaders_(ss, name, defs[name]);
    (fueCreada ? creadas : existentes).push(name);
  });
  // Siembra la fila por defecto de CONFIG solo si la hoja está vacía (no toca datos existentes)
  seedConfigDefaults_(ss);

  // 4) Guardar los IDs detectados en la hoja CONFIG_SISTEMA (solo informativo/referencia)
  var kv = {
    'PROJECT_ROOT_FOLDER_ID': root.getId(),
    'CERT_FOLDER_ID': certFolder.getId(),
    'ACTAS_FOLDER_ID': actasFolder.getId(),
    'USUARIOS_FOLDER_ID': usuariosFolder.getId(),
    'SPREADSHEET_ID': ss.getId()
  };
  writeSystemConfig_(ss, kv);
  SpreadsheetApp.flush();

  var mensaje =
    'Carpeta raíz: ' + root.getName() + '\n  ID: ' + root.getId() + '\n\n' +
    'CERTIFICADOS  → ' + certFolder.getId() + '\n' +
    'ACTAS         → ' + actasFolder.getId() + '\n   (subcarpetas DOCUMENTOS y DOC_ENTREGAS listas)\n\n' +
    'Hojas nuevas: ' + (creadas.length ? creadas.join(', ') : '(ninguna, ya existían)') + '\n' +
    'Hojas existentes (sin cambios): ' + (existentes.length ? existentes.join(', ') : '—') + '\n\n' +
    'Las hojas, carpetas y datos ya existentes se conservan sin modificar.';

  return {
    ok: true,
    rootFolderId: root.getId(),
    certFolderId: certFolder.getId(),
    actasFolderId: actasFolder.getId(),
    spreadsheetId: ss.getId(),
    hojasCreadas: creadas,
    hojasExistentes: existentes,
    mensaje: mensaje
  };
}

/** Definición central de todas las hojas y sus cabeceras. */
function getSheetDefinitions() {
  return {
    'LEARN': ['Id', 'Titulo', 'Publico', 'Detalles', 'Resumen', 'PuntosClave', 'Orden', 'Activo'],
    'DATA': ['Cod', 'IdMain', 'Tema', 'Contenido', 'Video_1', 'Video_2', 'Video_3', 'ComentarioVideo', 'PDF', 'Contexto', 'Orden'],
    'QUIZ': ['IdQuiz', 'IdMain', 'Pregunta', 'OpcionA', 'OpcionB', 'OpcionC', 'OpcionD', 'RespuestaCorrecta', 'Explicacion', 'Dificultad', 'Categoria_contenido'],
    'INGRESOS': ['Id', 'Apellidos', 'Nombres', 'DNI', 'Inicio', 'Avance', 'Publico', 'Nota', 'UltimoAcceso', 'Dispositivo', 'ModulosCompletados', 'IntentosQuiz', 'TiempoTotal', 'ProgressJSON', 'CertificadoUrl', 'EMPRESA', 'AREA', 'CARGO', 'FOTOGRAFIA', 'SELFIE', 'CERTIFICADO_USO', 'FECHA_INGRESO', 'FECHA_NACIMIENTO', 'CORREO', 'CELULAR', 'NUMERO_CONTACTO_1', 'PARENTESCO_CONTACTO_1', 'NUMERO_CONTACTO_2', 'PARENTESCO_CONTACTO_2', 'CONSENTIMIENTO_OK'],
    'CONFIG': ['Titulo', 'Mensaje', 'Contacto', 'PassAdmin', 'Estatus', 'LogoCertificado', 'FirmaRepresentante', 'NombreRepresentante', 'CargoRepresentante', 'Lugar', 'Contratista', 'Tutorial', 'Actas', 'RUC', 'ActividadEconomica', 'Domicilio'],
    'CERTIFICADOS': ['Id', 'DNI', 'APELLIDOS', 'NOMBRES', 'CARGO', 'NOTA', 'CELULAR', 'FOTO', 'TITULO_CERTIFICADO', 'LinkCertificado', 'Fecha', 'FIRMA', 'TopicId'],
    'SHORT_EVALUACIONES': SHORT_EVALS_HEADERS,
    'SHORT_RESULTADOS': SHORT_RESULTS_HEADERS,
    'ACTAS_DOCUMENTOS': ACTAS_DOCS_HEADERS,
    'ACTAS_FIRMAS': ACTAS_FIRMAS_HEADERS,
    'PAC_PROGRAMAS': PAC_PROGRAMAS_HEADERS,
    'PAC_PREGUNTAS': PAC_PREGUNTAS_HEADERS,
    'PAC_RESULTADOS': PAC_RESULTADOS_HEADERS,
    'CONFIG_SISTEMA': ['Clave', 'Valor', 'Descripcion', 'Actualizado']
  };
}

/** Devuelve la hoja activa (script enlazado) o abre por ID como respaldo. */
function getSpreadsheet_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (ss) return ss;
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/** Siembra una fila por defecto en CONFIG si está vacía (para que la app arranque). */
function seedConfigDefaults_(ss) {
  var sheet = ss.getSheetByName('CONFIG');
  if (!sheet || sheet.getLastRow() >= 2) return;
  sheet.appendRow(['Capacitaciones SST', 'Identifícate para comenzar tu capacitación', '', '123456', 'Activo', '', '', '', '']);
}

/** Escribe/actualiza pares clave-valor en la hoja CONFIG_SISTEMA. */
function writeSystemConfig_(ss, kv) {
  var sheet = getOrCreateSheetWithHeaders(ss, 'CONFIG_SISTEMA', ['Clave', 'Valor', 'Descripcion', 'Actualizado']);
  var descripciones = {
    'PROJECT_ROOT_FOLDER_ID': 'Carpeta raíz del proyecto en Drive',
    'CERT_FOLDER_ID': 'Carpeta de certificados emitidos',
    'ACTAS_FOLDER_ID': 'Carpeta de actas / entrega de documentos',
    'USUARIOS_FOLDER_ID': 'Carpeta de firma+selfie de autorización (onboarding), por DNI',
    'SPREADSHEET_ID': 'ID de esta hoja de cálculo'
  };
  var data = sheet.getDataRange().getValues();
  var ahora = nowPeruString();
  Object.keys(kv).forEach(function (clave) {
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === clave) { rowIndex = i + 1; break; }
    }
    var row = [clave, kv[clave], descripciones[clave] || '', ahora];
    if (rowIndex > 0) { sheet.getRange(rowIndex, 1, 1, 4).setValues([row]); }
    else { sheet.appendRow(row); data.push(row); }
  });
}

function createResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return createResponse({ status: 'ok', message: 'Servicio LearnDrive activo' });
}
