/**
 * Private Google Drive connection for the graduation backend.
 * Deploy as a Web app executing as the owner, with access "Anyone".
 * The invitation never receives this URL's private key or Google's OAuth token.
 */
function setupDrive() {
  var p=PropertiesService.getScriptProperties();
  var root=p.getProperty('ROOT_FOLDER_ID') ? DriveApp.getFolderById(p.getProperty('ROOT_FOLDER_ID')) : DriveApp.createFolder('Graduación Ing. Alexander Mejía 2026');
  if(root.getSharingAccess()!==DriveApp.Access.PRIVATE || root.getViewers().length || root.getEditors().length) throw new Error('La carpeta debe ser privada y sin otros lectores ni editores para proteger el listado.');
  p.setProperty('ROOT_FOLDER_ID',root.getId());
  if(!p.getProperty('PHOTO_FOLDER_ID')) p.setProperty('PHOTO_FOLDER_ID',root.createFolder('Fotos').getId());
  if(!p.getProperty('VIDEO_FOLDER_ID')) p.setProperty('VIDEO_FOLDER_ID',root.createFolder('Videos').getId());
  if(!p.getProperty('SHEET_ID')) {
    var book=SpreadsheetApp.create('Listado privado de invitados - Alexander Mejía');
    DriveApp.getFileById(book.getId()).moveTo(root);
    var sheet=book.getSheets()[0];sheet.setName('Invitados');
    sheet.getRange(1,1,1,7).setValues([['ID','Nombre completo','Correo','CUI','Asistencia','Registro','Actualizado']]);
    sheet.setFrozenRows(1);sheet.getRange('A:G').setNumberFormat('@');sheet.getRange(1,1,1,7).setFontWeight('bold');
    p.setProperty('SHEET_ID',book.getId());
  }
  if(!p.getProperty('BRIDGE_KEY')) p.setProperty('BRIDGE_KEY',(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''));
  // No credentials are written to logs, source files, or public Drive files.
  return {folderUrl:root.getUrl(),sheetUrl:'https://docs.google.com/spreadsheets/d/'+p.getProperty('SHEET_ID')+'/edit'};
}
function doGet() {return output_({ok:false,error:'Esta conexión solo recibe solicitudes del servidor.'});}
function doPost(e) {
  try {
    var body=JSON.parse(e.postData.contents);
    var p=PropertiesService.getScriptProperties();
    if(!equalSecret_(String(body.secret || ''),p.getProperty('BRIDGE_KEY') || '')) throw new Error('Unauthorized');
    if(body.action==='health') return output_({ok:true,data:info_(p)});
    if(body.action==='token') {
      var info=info_(p);info.accessToken=ScriptApp.getOAuthToken();
      return output_({ok:true,data:info});
    }
    if(body.action==='record') {
      saveRecord_(body.payload,p);return output_({ok:true,data:{saved:true}});
    }
    throw new Error('Unsupported action');
  } catch(error) {return output_({ok:false,error:'No se pudo completar la operación de Drive.'});}
}
function info_(p) {
  var root=DriveApp.getFolderById(p.getProperty('ROOT_FOLDER_ID'));
  if(root.getSharingAccess()!==DriveApp.Access.PRIVATE || root.getViewers().length || root.getEditors().length) throw new Error('Folder is no longer private');
  var photos=DriveApp.getFolderById(p.getProperty('PHOTO_FOLDER_ID'));
  var videos=DriveApp.getFolderById(p.getProperty('VIDEO_FOLDER_ID'));
  var file=DriveApp.getFileById(p.getProperty('SHEET_ID'));
  for(var item of [photos,videos,file]) {
    if(item.getSharingAccess()!==DriveApp.Access.PRIVATE || item.getViewers().length || item.getEditors().length) throw new Error('Private storage required');
  }
  return {folderUrl:root.getUrl(),sheetUrl:'https://docs.google.com/spreadsheets/d/'+file.getId()+'/edit',photoFolderId:photos.getId(),videoFolderId:videos.getId()};
}
function saveRecord_(record,p) {
  if(!record || !/^[a-zA-Z0-9_-]{1,100}$/.test(String(record.id)) || !/^\d{13}$/.test(String(record.cui)) || !['yes','no'].includes(record.attendance)) throw new Error('Invalid record');
  info_(p);
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(20000)) throw new Error('Busy');
  try {
    var sheet=SpreadsheetApp.openById(p.getProperty('SHEET_ID')).getSheetByName('Invitados');
    var rows=sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,7).getDisplayValues() : [];
    var found=rows.findIndex(function(row){return row[0]===record.id;});
    if(found>=0 && rows[found][6]>record.version) return;
    var row=[record.id,record.fullName,record.email,record.cui,record.attendance==='yes' ? 'Confirmada' : 'No asistirá',record.createdAt,record.version].map(safeCell_);
    var destination=sheet.getRange(found>=0 ? found+2 : sheet.getLastRow()+1,1,1,7);
    destination.setNumberFormat('@').setValues([row]);
    SpreadsheetApp.flush();
  } finally {lock.releaseLock();}
}
function safeCell_(value) {value=String(value || '');return /^[\s]*[=+@-]/.test(value) ? "'"+value : value;}
function equalSecret_(given,expected) {
  if(!/^[a-f0-9]{64}$/.test(given) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  var a=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,given);
  var b=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,expected);
  var diff=0;for(var i=0;i<a.length;i++) diff|=a[i]^b[i];return diff===0;
}
function output_(value) {return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
