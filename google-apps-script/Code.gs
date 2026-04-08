/**
 * Google Apps Script - LearnDrive AI v2 Proxy
 * 
 * Instrucciones de Instalación:
 * 1. En tu Google Sheet, ve a Extensiones -> Apps Script.
 * 2. Borra el contenido de Code.gs y pega este código.
 * 3. Cambia el SPREADSHEET_ID por el ID de tu hoja de cálculo.
 * 4. Haz clic en "Implementar" -> "Nueva implementación".
 * 5. Tipo: Aplicación web.
 * 6. Quién tiene acceso: Cualquiera (Anyone).
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
    }

    return createResponse({ status: 'error', message: 'Acción no reconocida' });
  } catch (err) {
    return createResponse({ status: 'error', message: err.toString() });
  }
}

function upsertQuiz(sheet, questions) {
  var firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  if (!firstRow[0] || String(firstRow[0]).trim() === '') {
    var quizHeaders = ['IdQuiz', 'IdMain', 'Pregunta', 'OpcionA', 'OpcionB', 'OpcionC', 'OpcionD', 'RespuestaCorrecta', 'Explicacion', 'Dificultad'];
    sheet.getRange(1, 1, 1, quizHeaders.length).setValues([quizHeaders]);
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

function saveCertificate(ss, data) {
  try {
    if (!data.dni) return createResponse({ status: 'error', message: 'DNI requerido' });
    const CERT_FOLDER_ID = '1uHzYb5jM8gVYdE8IdChetEAxC_caCt5i';
    const parentFolder = DriveApp.getFolderById(CERT_FOLDER_ID);
    const now = new Date();
    const year  = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const dni   = String(data.dni).trim();

    const yearFolder  = getOrCreateSubFolder(parentFolder, year);
    const monthFolder = getOrCreateSubFolder(yearFolder, month);
    const dniFolder   = getOrCreateSubFolder(monthFolder, dni);

    const rawPdf = data.pdfBase64.includes(',') ? data.pdfBase64.split(',')[1] : data.pdfBase64;
    const pdfFilename = `CERTIFICADO_${dni}_${now.getTime()}.pdf`;
    const pdfBlob = Utilities.newBlob(Utilities.base64Decode(rawPdf), 'application/pdf', pdfFilename);
    const pdfFile = dniFolder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const pdfUrl = pdfFile.getUrl();

    if (data.selfieBase64) {
      const rawSelfie = data.selfieBase64.includes(',') ? data.selfieBase64.split(',')[1] : data.selfieBase64;
      const selfieFilename = `SELFIE_${dni}_${now.getTime()}.jpg`;
      const selfieBlob = Utilities.newBlob(Utilities.base64Decode(rawSelfie), 'image/jpeg', selfieFilename);
      const selfieFile = dniFolder.createFile(selfieBlob);
      selfieFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    if (data.signatureBase64) {
      const rawSignature = data.signatureBase64.includes(',') ? data.signatureBase64.split(',')[1] : data.signatureBase64;
      const signatureFilename = `FIRMA_${dni}_${now.getTime()}.png`;
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
      certSheet.appendRow(['Id', 'DNI', 'APELLIDOS', 'NOMBRES', 'CARGO', 'NOTA', 'CELULAR', 'FIRMA', 'FOTO', 'LinkCertificado', 'Fecha']);
    }
    const info = getIngresoInfoByDni(ingresosSheet, dni);
    upsertCertificateRecord(certSheet, {
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

function upsertCertificateRecord(sheet, record) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var dniCol = getHeaderIndex(headers, ['DNI']);
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][dniCol] || '').trim() === record.dni) { rowIndex = i + 1; break; }
  }
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });
  var rowData = new Array(headers.length).fill('');
  if (rowIndex !== -1) rowData = data[rowIndex - 1].slice();

  rowData[colMap['Id']] = record.id;
  rowData[colMap['DNI']] = record.dni;
  rowData[colMap['APELLIDOS']] = record.apellidos;
  rowData[colMap['NOMBRES']] = record.nombres;
  rowData[colMap['CARGO']] = record.cargo;
  rowData[colMap['NOTA']] = record.nota;
  rowData[colMap['CELULAR']] = record.celular;
  rowData[colMap['LinkCertificado']] = record.linkCertificado;
  rowData[colMap['Fecha']] = record.fecha;

  if (rowIndex !== -1) sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  else sheet.appendRow(rowData);
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


function createResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return createResponse({ status: 'ok', message: 'Servicio LearnDrive activo' });
}
