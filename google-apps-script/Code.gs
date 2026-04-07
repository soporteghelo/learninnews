/**
 * Google Apps Script - LearnDrive AI v2 Proxy
 * 
 * Instrucciones de Instalación:
 * 1. En tu Google Sheet, ve a Extenciones -> Apps Script.
 * 2. Borra el contenido de Code.gs y pega este código.
 * 3. Cambia el SPREADSHEET_ID por el ID de tu hoja de cálculo.
 * 4. Haz clic en "Implementar" -> "Nueva implementación".
 * 5. Tipo: Aplicación web.
 * 6. Quién tiene acceso: Cualquiera (Anyone).
 * 7. Copia la URL de la implementación y ponla en tu .env como VITE_APPS_SCRIPT_URL.
 */

const SPREADSHEET_ID = '1fXcrk-6YSA5NcgDbCBinu4WaPpyJMRK0og6miVE8ZZw';
const QUIZ_SHEET_NAME = 'QUIZ';
const DATA_SHEET_NAME = 'DATA';
const INGRESOS_SHEET_NAME = 'INGRESOS';
const LEARN_SHEET_NAME = 'LEARN';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (data.action === 'upsertQuiz') {
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
    } else if (data.action === 'upsertTopic') {
      const sheet = ss.getSheetByName(LEARN_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'error', message: 'Hoja LEARN no encontrada' });
      return upsertTopic(sheet, data.topics);
    } else if (data.action === 'deleteTopic') {
      const sheet = ss.getSheetByName(LEARN_SHEET_NAME);
      if (!sheet) return createResponse({ status: 'error', message: 'Hoja LEARN no encontrada' });
      return deleteTopic(sheet, data.topicIds);
    } else if (data.action === 'extractText') {
      return extractPdfText(data.fileId);
    }

    return createResponse({ status: 'error', message: 'Acción no reconocida' });
  } catch (err) {
    return createResponse({ status: 'error', message: err.toString() });
  }
}

function upsertQuiz(sheet, questions) {
  // Ensure header row exists
  var firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  if (!firstRow[0] || String(firstRow[0]).trim() === '') {
    var quizHeaders = ['IdQuiz', 'IdMain', 'Pregunta', 'OpcionA', 'OpcionB', 'OpcionC', 'OpcionD', 'RespuestaCorrecta', 'Explicacion', 'Dificultad'];
    sheet.getRange(1, 1, 1, quizHeaders.length).setValues([quizHeaders]);
  }

  questions.forEach(function(q) {
    // Re-read data each iteration to avoid stale references
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
  // Ensure header row exists
  var firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  if (!firstRow[0] || String(firstRow[0]).trim() === '') {
    var dataHeaders = ['Cod', 'IdMain', 'Tema', 'Contenido', 'Video_1', 'Video_2', 'Video_3', 'ComentarioVideo', 'PDF', 'Contexto', 'Orden'];
    sheet.getRange(1, 1, 1, dataHeaders.length).setValues([dataHeaders]);
  }

  chunks.forEach(function(c) {
    // Re-read data each iteration to avoid stale references
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

  // Check if this DNI already has a row — update it (new session)
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
      // Preserve existing progress data on re-login
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

  // Find row by DNI
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colMap['DNI']] || data[i][colMap['Id']] || '') === String(ingreso.DNI || ingreso.Id)) {
      // Update provided columns
      var fieldsToUpdate = ['Avance', 'Nota', 'UltimoAcceso', 'Dispositivo', 'ModulosCompletados', 'IntentosQuiz', 'TiempoTotal', 'ProgressJSON'];
      fieldsToUpdate.forEach(function(field) {
        if (ingreso[field] !== undefined && ingreso[field] !== '' && colMap[field] !== undefined) {
          sheet.getRange(i + 1, colMap[field] + 1).setValue(ingreso[field]);
        }
      });
      return createResponse({ status: 'ok', message: 'Progreso actualizado' });
    }
  }

  return createResponse({ status: 'error', message: 'No se encontró el registro con DNI: ' + (ingreso.DNI || ingreso.Id) });
}

function extractPdfText(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    // Para que esto funcione, DEBES activar "Google Drive API" en Servicios
    const resource = {
       title: "TEMP_OCR_" + fileId,
       mimeType: MimeType.GOOGLE_DOCS
    };
    
    // Convertir PDF a Google Doc (activando OCR)
    const tempFile = Drive.Files.insert(resource, file.getBlob(), { ocr: true });
    const docId = tempFile.id;
    const doc = DocumentApp.openById(docId);
    const text = doc.getBody().getText();
    
    // Eliminar archivo temporal
    Drive.Files.remove(docId);
    
    return createResponse({ status: 'ok', text: text });
  } catch (err) {
    return createResponse({ status: 'error', message: 'Error en la extracción (¿Habilitaste Drive API?): ' + err.toString() });
  }
}

function createResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Add simple GET for testing deployment
function doGet() {
  return createResponse({ status: 'ok', message: 'Servicio LearnDrive activo' });
}
