/**
 * Prancheta — endpoint MÍNIMO de upload de arquivo (parte "híbrida").
 * -------------------------------------------------------------------
 * Único pedaço que continua no Google: recebe um arquivo (base64), grava
 * no Drive e devolve a URL pública. TODO o conteúdo textual (cartas,
 * recados, links, orientação, ativos do Dolarizar, ETFs) vive no GitHub,
 * em arquivos .json — este script NÃO grava nada disso.
 *
 * Como publicar:
 *   1. Cole este código no editor do Apps Script do projeto já existente
 *      (o mesmo que a Prancheta usava), substituindo o doPost antigo.
 *   2. Implantar → Nova implantação → Tipo: App da Web.
 *      - Executar como: eu
 *      - Quem pode acessar: qualquer pessoa
 *   3. Copie a URL /exec e cole em APS_UPLOAD no index.html.
 *   4. Ajuste PASTA_ID abaixo para o ID de uma pasta do Drive (opcional;
 *      se ficar vazio, salva na raiz do Drive).
 */

var PASTA_ID = ''; // ID da pasta do Drive onde os anexos ficam (opcional)

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.action !== 'upload') {
      return _json({ ok: false, error: 'Ação não suportada. Este endpoint só faz upload.' });
    }
    if (!body.fileData || !body.fileName) {
      return _json({ ok: false, error: 'Arquivo ausente.' });
    }
    var bytes = Utilities.base64Decode(body.fileData);
    var blob = Utilities.newBlob(bytes, body.fileMime || 'application/octet-stream', body.fileName);
    var folder = PASTA_ID ? DriveApp.getFolderById(PASTA_ID) : DriveApp.getRootFolder();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return _json({
      ok: true,
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: 'https://drive.google.com/file/d/' + file.getId() + '/view?usp=drivesdk'
    });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
