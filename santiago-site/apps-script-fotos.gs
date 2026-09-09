/**
 * Recebe fotos enviadas pelos convidados via fotos-convidados.html e salva
 * numa pasta do Google Drive.
 *
 * COMO PUBLICAR (passo a passo):
 * 1. No Google Drive, crie uma pasta (ex.: "Fotos da festa do Santiago") e
 *    copie o ID dela — é o trecho da URL depois de ".../folders/".
 * 2. Em script.google.com, crie um projeto novo (solto, sem vincular a
 *    nenhuma planilha) e cole todo o conteúdo deste arquivo.
 * 3. Troque o valor de FOLDER_ID abaixo pelo ID copiado no passo 1.
 * 4. Implantar → Nova implantação → tipo "App da Web".
 *    - Executar como: Eu (sua conta)
 *    - Quem pode acessar: Qualquer pessoa (não "com conta Google" — senão
 *      convidado sem login não consegue enviar)
 * 5. Aceite a tela de aviso do Google ("app não verificado") — normal, é o
 *    mesmo aviso que já apareceu ao publicar o Apps Script do RSVP.
 * 6. Copie a URL que termina em "/exec", abra ela no navegador e confirme
 *    que aparece a mensagem de "endpoint ativo".
 * 7. Cole essa URL na constante SCRIPT_URL dentro de fotos-convidados.html.
 *
 * Se um dia precisar editar este código, lembre-se: só salvar não atualiza
 * a URL já publicada — é preciso ir em "Gerenciar implantações", editar, e
 * escolher "Nova versão" antes de implantar de novo.
 */

var FOLDER_ID = "1bsZzPrl3anN6yuEFzCsX2F0QKXb1wJCB";
var MAX_PHOTOS_PER_REQUEST = 10; // limite defensivo no servidor (o site já limita a 8)
var MAX_PHOTO_BYTES = 15 * 1024 * 1024; // ~15MB por foto já decodificada
var MAX_VIDEO_BYTES = 25 * 1024 * 1024; // ~25MB por vídeo já decodificado (o site já limita a 20MB no envio)

function doGet(e) {
  return ContentService.createTextOutput("OK — endpoint de fotos do Santiago está ativo.");
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var guestName = String(data.guestName || "").trim().slice(0, 60) || "Convidado";
    var safeName = guestName.replace(/[^a-zA-Z0-9 \-_]/g, "").trim().replace(/\s+/g, "-") || "convidado";
    var photos = Array.isArray(data.photos) ? data.photos.slice(0, MAX_PHOTOS_PER_REQUEST) : [];

    if (!photos.length) {
      return jsonOut({ status: "error", message: "Nenhum arquivo recebido." });
    }

    var folder = DriveApp.getFolderById(FOLDER_ID);
    var timestamp = Utilities.formatDate(new Date(), "America/Sao_Paulo", "yyyyMMdd-HHmmss");
    var results = [];

    for (var i = 0; i < photos.length; i++) {
      try {
        var p = photos[i] || {};
        if (!p.base64) throw new Error("sem dado de imagem/vídeo");
        var mime = p.mimeType || "image/jpeg";
        var isVideo = mime.indexOf("video/") === 0;
        var ext = isVideo
          ? (mime.indexOf("quicktime") > -1 ? "mov" : "mp4")
          : (mime.indexOf("png") > -1 ? "png" : (mime.indexOf("heic") > -1 ? "heic" : "jpg"));
        var bytes = Utilities.base64Decode(p.base64);
        var maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
        if (bytes.length > maxBytes) throw new Error("arquivo muito grande");

        var filename = timestamp + "_" + safeName + "_" + (i + 1) + "." + ext;
        var blob = Utilities.newBlob(bytes, mime, filename);
        folder.createFile(blob);
        results.push({ index: i, status: "ok" });
      } catch (errPhoto) {
        results.push({ index: i, status: "error", message: String(errPhoto) });
      }
    }

    var saved = results.filter(function (r) { return r.status === "ok"; }).length;
    return jsonOut({
      status: saved > 0 ? "ok" : "error",
      saved: saved,
      total: photos.length,
      results: results
    });
  } catch (err) {
    return jsonOut({ status: "error", message: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
