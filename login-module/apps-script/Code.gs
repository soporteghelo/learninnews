/**
 * Apps Script - Módulo de login por DNI (extraído de LearnDrive AI)
 *
 * Instalación:
 * 1. Crea una Google Sheet nueva (o usa una existente).
 * 2. Extensiones -> Apps Script. Borra el contenido de Code.gs y pega este archivo.
 * 3. Ajusta SPREADSHEET_ID más abajo con el ID de tu hoja (está en la URL de la hoja).
 * 4. Recarga la hoja y ejecuta la función `CrearHojaUsuarios` una vez desde el
 *    editor (o usa el menú "⚙️ Login" -> "Crear hoja USUARIOS") para provisionar
 *    la hoja USUARIOS con sus columnas.
 * 5. Implementar -> Nueva implementación -> Tipo "Aplicación web".
 *    Quién tiene acceso: "Cualquiera".
 * 6. Copia la URL del Web App resultante en el .env de tu app como
 *    VITE_APPS_SCRIPT_URL.
 * 7. (Opcional, solo si usarás el autocompletado `fetchKnownUsers` del
 *    frontend) comparte la hoja como "Cualquiera con el enlace — Lector".
 */

const SPREADSHEET_ID = 'PEGA_AQUI_EL_ID_DE_TU_HOJA';
const USERS_SHEET_NAME = 'USUARIOS';
const USERS_HEADERS = ['Id', 'DNI', 'Apellidos', 'Nombres', 'FechaRegistro', 'UltimoAcceso', 'Dispositivo'];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (data.action === 'getUserByDni') {
      return getUserByDni(ss, data);
    } else if (data.action === 'registerUser') {
      return registerUser(ss, data);
    }

    return createResponse({ status: 'error', message: 'Acción no reconocida' });
  } catch (err) {
    return createResponse({ status: 'error', message: err.toString() });
  }
}

function doGet() {
  return createResponse({ status: 'ok', message: 'Servicio de login activo' });
}

function createResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Crea la hoja USUARIOS con sus cabeceras si todavía no existe. No toca una hoja ya existente. */
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
 * Todas las filas de `sheet` donde la columna `columnName` == `value`, usando
 * TextFinder acotado a esa única columna en vez de leer la hoja completa
 * (`getDataRange()`). Así el costo de buscar un DNI no crece con el total de
 * usuarios registrados, sino que queda acotado a una lectura de una columna.
 */
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

/** Busca un usuario por DNI sin bajar el resto de usuarios registrados. */
function getUserByDni(ss, data) {
  var dni = String(data.dni || '').trim();
  if (!dni) return createResponse({ status: 'error', message: 'DNI requerido' });
  var sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) return createResponse({ status: 'ok', record: null });
  var matches = findRowsByColumnValue_(sheet, 'DNI', dni);
  if (matches.length === 0) return createResponse({ status: 'ok', record: null });
  return createResponse({ status: 'ok', record: rowToObject_(matches[0].headers, matches[0].values) });
}

/**
 * Crea el registro si el DNI es nuevo (fija FechaRegistro), o solo actualiza
 * UltimoAcceso/Dispositivo/Apellidos/Nombres si ya existía (preserva la
 * FechaRegistro original). `data.usuario` trae: Id, DNI, Apellidos, Nombres,
 * UltimoAcceso, Dispositivo.
 */
function registerUser(ss, data) {
  var usuario = data.usuario || {};
  var dni = String(usuario.DNI || '').trim();
  if (!dni) return createResponse({ status: 'error', message: 'DNI requerido' });

  var sheet = getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS);
  var matches = findRowsByColumnValue_(sheet, 'DNI', dni);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var now = new Date().toISOString();

  if (matches.length > 0) {
    var rowIndex = matches[0].row;
    var existing = rowToObject_(matches[0].headers, matches[0].values);
    var rowData = headers.map(function (h) {
      if (h === 'Apellidos') return usuario.Apellidos || existing.Apellidos || '';
      if (h === 'Nombres') return usuario.Nombres || existing.Nombres || '';
      if (h === 'UltimoAcceso') return usuario.UltimoAcceso || now;
      if (h === 'Dispositivo') return usuario.Dispositivo || existing.Dispositivo || '';
      if (h === 'FechaRegistro') return existing.FechaRegistro || now; // nunca se pisa
      return existing[h] !== undefined ? existing[h] : '';
    });
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    var newRow = headers.map(function (h) {
      if (h === 'Id') return usuario.Id || (dni + '-' + Date.now());
      if (h === 'DNI') return dni;
      if (h === 'Apellidos') return usuario.Apellidos || '';
      if (h === 'Nombres') return usuario.Nombres || '';
      if (h === 'FechaRegistro') return now;
      if (h === 'UltimoAcceso') return usuario.UltimoAcceso || now;
      if (h === 'Dispositivo') return usuario.Dispositivo || '';
      return '';
    });
    sheet.appendRow(newRow);
  }

  SpreadsheetApp.flush();
  return createResponse({ status: 'ok', message: 'Usuario registrado correctamente' });
}

/** Ejecuta esto una vez desde el editor (o desde el menú) para crear la hoja USUARIOS. */
function CrearHojaUsuarios() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS);
  SpreadsheetApp.getUi().alert('Hoja "' + USERS_SHEET_NAME + '" lista.');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ Login')
    .addItem('Crear hoja USUARIOS', 'CrearHojaUsuarios')
    .addToUi();
}
