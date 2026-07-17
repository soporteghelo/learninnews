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
    } else if (data.action === 'updateUserProfile') {
      return updateUserProfile(ss, data);
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
    } else if (data.action === 'upsertActaDocumento') {
      return upsertActaDocumento(ss, data);
    } else if (data.action === 'deleteActaDocumento') {
      return deleteActaDocumento(ss, data);
    } else if (data.action === 'saveActaFirma') {
      return saveActaFirma(ss, data);
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

function registerIngreso(sheet, ingreso) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });

  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colMap['DNI']] || data[i][colMap['Id']] || '') === String(ingreso.DNI || ingreso.Id)) {
      rowIndex = i + 1;
      break;
    }
  }

  var rowData = [];
  headers.forEach(function(h) {
    if (rowIndex !== -1 && (h === 'ProgressJSON' || h === 'Avance' || h === 'Nota' || h === 'ModulosCompletados' || h === 'IntentosQuiz' || h === 'TiempoTotal')) {
      rowData.push(data[rowIndex - 1][colMap[h]] || (ingreso[h] !== undefined ? ingreso[h] : ''));
    } else {
      rowData.push(ingreso[h] !== undefined ? ingreso[h] : (rowIndex !== -1 ? data[rowIndex - 1][colMap[h]] || '' : ''));
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
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colMap['DNI']] || data[i][colMap['Id']] || '') === String(ingreso.DNI || ingreso.Id)) {
      var fieldsToUpdate = ['Avance', 'Nota', 'UltimoAcceso', 'Dispositivo', 'ModulosCompletados', 'IntentosQuiz', 'TiempoTotal', 'ProgressJSON'];
      fieldsToUpdate.forEach(function(field) {
        if (ingreso[field] !== undefined && ingreso[field] !== '' && colMap[field] !== undefined) {
          sheet.getRange(i + 1, colMap[field] + 1).setValue(ingreso[field]);
        }
      });
      return createResponse({ status: 'ok', message: 'Progreso actualizado' });
    }
  }
  return createResponse({ status: 'error', message: 'No se encontró el registro' });
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

  var sheetData = sheet.getDataRange().getValues();
  var headers = sheetData[0];
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });
  var dniCol = getHeaderIndex(headers, ['DNI', 'Id']);
  if (dniCol === -1) return createResponse({ status: 'error', message: 'Columna DNI no encontrada' });

  var rowIndex = -1;
  for (var i = 1; i < sheetData.length; i++) {
    if (String(sheetData[i][dniCol] || '').trim() === dni) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) return createResponse({ status: 'error', message: 'No se encontró ningún usuario con el DNI ' + dni });

  var nuevoDni = data.nuevoDni ? String(data.nuevoDni).trim() : '';
  if (nuevoDni && nuevoDni !== dni) {
    for (var j = 1; j < sheetData.length; j++) {
      if (j + 1 !== rowIndex && String(sheetData[j][dniCol] || '').trim() === nuevoDni) {
        return createResponse({ status: 'error', message: 'Ya existe otro usuario registrado con el DNI ' + nuevoDni });
      }
    }
  }

  if (data.publico !== undefined && colMap['Publico'] !== undefined) {
    sheet.getRange(rowIndex, colMap['Publico'] + 1).setValue(data.publico);
  }
  if (data.correo !== undefined && colMap['CORREO'] !== undefined) {
    sheet.getRange(rowIndex, colMap['CORREO'] + 1).setValue(data.correo);
  }
  if (nuevoDni && nuevoDni !== dni) {
    sheet.getRange(rowIndex, dniCol + 1).setValue(nuevoDni);
    migrateDniAcrossSheets_(ss, dni, nuevoDni);
  }

  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Perfil actualizado correctamente', dni: nuevoDni || dni });
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
var SHORT_RESULTS_HEADERS = ['EvaluacionId', 'EvaluacionNombre', 'Tema', 'DNI', 'Apellidos', 'Nombres', 'Nota', 'Porcentaje', 'FechaHora', 'TotalPreguntas', 'Correctas', 'PreguntasErroneas'];

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
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Blindaje anti-duplicado: si ya existe (EvaluacionId + DNI), no volver a insertar
  var values = sheet.getDataRange().getValues();
  var evalIdx = headers.indexOf('EvaluacionId');
  var dniIdx = headers.indexOf('DNI');
  if (evalIdx !== -1 && dniIdx !== -1) {
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][evalIdx]).trim() === String(data.evaluacionId).trim() &&
          String(values[i][dniIdx]).trim() === String(data.dni).trim()) {
        return createResponse({ status: 'ok', message: 'Ya registrado', duplicate: true });
      }
    }
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
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return createResponse({ status: 'ok', message: 'Sin registros', deleted: 0 });
  var headers = values[0];
  var evalIdx = headers.indexOf('EvaluacionId');
  var dniIdx = headers.indexOf('DNI');
  if (evalIdx === -1 || dniIdx === -1) return createResponse({ status: 'error', message: 'Columnas EvaluacionId/DNI no encontradas' });
  var deleted = 0;
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][evalIdx]).trim() === String(data.evaluacionId).trim() &&
        String(values[i][dniIdx]).trim() === String(data.dni).trim()) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Resultado eliminado', deleted: deleted });
}

// =============================================
// ACTAS DE ENTREGA / COMPROMISOS
// =============================================

var ACTAS_DOCS_HEADERS = ['Id', 'Titulo', 'Descripcion', 'Perfiles', 'DnisAsignados', 'CuerpoHtml', 'Items', 'DriveDocUrl', 'RequiereFirmaDibujada', 'Activo', 'FechaCreacion'];
var ACTAS_FIRMAS_HEADERS = ['Id', 'DocumentoId', 'DocumentoTitulo', 'DNI', 'Apellidos', 'Nombres', 'Cargo', 'Area', 'Empresa', 'Correo', 'FechaFirma', 'ActaPdfUrl', 'SelfieUrl', 'FirmaUrl', 'CorreoEnviado', 'Dispositivo'];

function upsertActaDocumento(ss, data) {
  var sheet = getOrCreateSheetWithHeaders(ss, ACTAS_DOCS_SHEET_NAME, ACTAS_DOCS_HEADERS);
  // Asegura la columna Items en hojas creadas antes de esta versión
  getOrCreateColumn(sheet, 'Items');
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
  if (idIdx === -1) return createResponse({ status: 'error', message: 'Columna Id no encontrada' });
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][idIdx]).trim() === String(data.id).trim()) {
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
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Anti-duplicado por DocumentoId + DNI
    var values = sheet.getDataRange().getValues();
    var docIdx = headers.indexOf('DocumentoId');
    var dniIdx = headers.indexOf('DNI');
    if (docIdx !== -1 && dniIdx !== -1) {
      for (var i = 1; i < values.length; i++) {
        if (String(values[i][docIdx]).trim() === String(data.documentoId).trim() &&
            String(values[i][dniIdx]).trim() === String(data.dni).trim()) {
          var urlIdx = headers.indexOf('ActaPdfUrl');
          return createResponse({ status: 'ok', message: 'Ya firmado', duplicate: true, url: urlIdx !== -1 ? values[i][urlIdx] : '' });
        }
      }
    }

    var now = new Date();
    var dni = String(data.dni).trim();
    var docId = now.getTime();

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
      Id: dni + '-' + String(data.documentoId).trim() + '-' + now.getTime(),
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
      CorreoEnviado: correoEnviado,
      Dispositivo: String(data.dispositivo || '').trim()
    });
    sheet.appendRow(rowData);
    SpreadsheetApp.flush();
    return createResponse({ status: 'ok', url: pdfUrl, correoEnviado: correoEnviado });
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
    'INGRESOS': ['Id', 'Apellidos', 'Nombres', 'DNI', 'Inicio', 'Avance', 'Publico', 'Nota', 'UltimoAcceso', 'Dispositivo', 'ModulosCompletados', 'IntentosQuiz', 'TiempoTotal', 'ProgressJSON', 'CertificadoUrl', 'EMPRESA', 'AREA', 'CARGO', 'FECHA_INGRESO', 'FECHA_NACIMIENTO', 'CORREO', 'CELULAR', 'NUMERO_CONTACTO_1', 'PARENTESCO_CONTACTO_1', 'NUMERO_CONTACTO_2', 'PARENTESCO_CONTACTO_2'],
    'CONFIG': ['Titulo', 'Mensaje', 'Contacto', 'PassAdmin', 'Estatus', 'LogoCertificado', 'FirmaRepresentante', 'NombreRepresentante', 'CargoRepresentante', 'Lugar', 'Contratista', 'Tutorial', 'Actas'],
    'CERTIFICADOS': ['Id', 'DNI', 'APELLIDOS', 'NOMBRES', 'CARGO', 'NOTA', 'CELULAR', 'FOTO', 'TITULO_CERTIFICADO', 'LinkCertificado', 'Fecha', 'FIRMA', 'TopicId'],
    'SHORT_EVALUACIONES': SHORT_EVALS_HEADERS,
    'SHORT_RESULTADOS': SHORT_RESULTS_HEADERS,
    'ACTAS_DOCUMENTOS': ACTAS_DOCS_HEADERS,
    'ACTAS_FIRMAS': ACTAS_FIRMAS_HEADERS,
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
