/**
 * Cole este código no Apps Script da planilha "Santi - Lista de Famílias (preencher)".
 * Passo a passo: Extensões → Apps Script → apagar o que tiver lá → colar isto → Salvar.
 *
 * Antes de publicar, rode a função "setupHeaders" uma vez (menu Executar, escolhendo
 * essa função) — ela escreve os títulos das colunas novas (H, I, J, K) sozinha.
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var data = JSON.parse(e.postData.contents);
    var code = String(data.code || "").trim().toUpperCase();
    var coming = (data.coming || []).join(", ");
    var notComing = (data.notComing || []).join(", ");
    var msgParents = data.msgParents || "";
    var msgSanti = data.msgSanti || "";

    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      var rowCode = String(values[i][0]).trim().toUpperCase();
      if (rowCode !== code) continue;

      var jaConfirmado = String(values[i][6] || "").trim(); // coluna G = Confirmado
      if (jaConfirmado) {
        return ContentService.createTextOutput(JSON.stringify({ status: "already_confirmed" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      sheet.getRange(i + 1, 7).setValue(coming || "Confirmado sem ninguém marcado"); // G - Confirmado
      sheet.getRange(i + 1, 8).setValue(msgParents);                                // H - Recado para os pais
      sheet.getRange(i + 1, 9).setValue(msgSanti);                                  // I - Recado para o Santiago
      sheet.getRange(i + 1, 10).setValue(notComing);                                // J - Não vão
      sheet.getRange(i + 1, 11).setValue(new Date());                               // K - Data da confirmação

      return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "not_found", code: code }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Rode esta função uma única vez (antes de publicar), pra escrever os
 * títulos das colunas novas na primeira linha da planilha.
 */
function setupHeaders() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  sheet.getRange(1, 8).setValue("Recado para os pais");
  sheet.getRange(1, 9).setValue("Recado para o Santiago");
  sheet.getRange(1, 10).setValue("Não vão");
  sheet.getRange(1, 11).setValue("Data da confirmação");
}

/**
 * Se precisar deixar um código livre pra confirmar de novo (por exemplo,
 * a pessoa errou e pediu pra você liberar de novo): é só apagar manualmente
 * o conteúdo da célula da coluna "Confirmado" (coluna G) daquela linha, na
 * própria planilha. Não precisa mexer no código.
 */
