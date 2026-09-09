/**
 * Cole este código no Apps Script da planilha "Santi - Lista de Famílias (preencher)".
 * Passo a passo: Extensões → Apps Script → apagar o que tiver lá → colar isto → Salvar.
 *
 * Antes de publicar, rode a função "setupHeaders" uma vez (menu Executar, escolhendo
 * essa função) — ela escreve os títulos das colunas novas (H, I, J, K) sozinha.
 */

// Códigos de teste (aquecimento): confirmam quantas vezes for preciso, nunca travam
// como "já confirmado". Usados só pelo próprio Uriel/família pra testar o fluxo.
var TEST_CODES = ["ANATESTE", "URIELTESTE"];

// Planilha "1 ano Santiago - Lista de Convidados" (a de nomes individuais/apelidos),
// onde cada confirmação real cai automaticamente numa aba de revisão.
var REVIEW_SHEET_ID = "18FToLa0bzzg65OQ-BKP-bvhnaHV8QrtbxW0A2CMt6tE";
var REVIEW_TAB_NAME = "Confirmações a revisar";

/**
 * Busca a família pelo código (usado pela tela de confirmar presença pra
 * mostrar os nomes de quem mora na casa antes de confirmar).
 */
function doGet(e) {
  var code = String((e && e.parameter && e.parameter.code) || "").trim().toUpperCase();
  if (!code) {
    return ContentService.createTextOutput("OK — endpoint da lista de famílias do Santiago está ativo.");
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var rowCode = String(values[i][0]).trim().toUpperCase();
    if (rowCode !== code) continue;

    var names = splitNames(values[i][3]); // coluna D - Nomes individuais da casa
    var isTestCode = TEST_CODES.indexOf(rowCode) > -1;
    var alreadyConfirmed = !isTestCode && !!String(values[i][6] || "").trim(); // coluna G - Confirmado

    return ContentService.createTextOutput(JSON.stringify({
      found: true, names: names, alreadyConfirmed: alreadyConfirmed
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ found: false }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Separa "Norma, Aloma e Alanna" em ["Norma", "Aloma", "Alanna"] — troca o
 * último " e " por vírgula antes de dividir, pra funcionar com qualquer
 * quantidade de nomes na casa.
 */
function splitNames(raw) {
  var s = String(raw || "").trim();
  if (!s) return [];
  var lastE = s.lastIndexOf(" e ");
  if (lastE > -1) {
    s = s.substring(0, lastE) + ", " + s.substring(lastE + 3);
  }
  return s.split(",")
    .map(function (n) { return n.trim(); })
    .filter(function (n) { return n; });
}

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

      var isTestCode = TEST_CODES.indexOf(rowCode) > -1;
      var jaConfirmado = String(values[i][6] || "").trim(); // coluna G = Confirmado
      if (jaConfirmado && !isTestCode) {
        return ContentService.createTextOutput(JSON.stringify({ status: "already_confirmed" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      sheet.getRange(i + 1, 7).setValue(coming || "Confirmado sem ninguém marcado"); // G - Confirmado
      sheet.getRange(i + 1, 8).setValue(msgParents);                                // H - Recado para os pais
      sheet.getRange(i + 1, 9).setValue(msgSanti);                                  // I - Recado para o Santiago
      sheet.getRange(i + 1, 10).setValue(notComing);                                // J - Não vão
      sheet.getRange(i + 1, 11).setValue(new Date());                               // K - Data da confirmação

      var familyName = String(values[i][2] || "");
      logConfirmacaoParaRevisao(code, familyName, coming, notComing, msgParents, msgSanti);

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
 * Escreve uma linha na aba "Confirmações a revisar" da planilha de convidados
 * (arquivo separado), pra o Uriel conferir e marcar manualmente quem confirmou
 * naquela lista de nomes individuais — sem tentar adivinhar por nome parecido.
 * Se a aba ainda não existir, ela é criada sozinha com o cabeçalho.
 */
function logConfirmacaoParaRevisao(code, familyName, coming, notComing, msgParents, msgSanti) {
  try {
    var reviewSpreadsheet = SpreadsheetApp.openById(REVIEW_SHEET_ID);
    var reviewSheet = reviewSpreadsheet.getSheetByName(REVIEW_TAB_NAME);
    if (!reviewSheet) {
      reviewSheet = reviewSpreadsheet.insertSheet(REVIEW_TAB_NAME);
      reviewSheet.getRange(1, 1, 1, 6).setValues([[
        "Data/hora", "Código da família", "Nome da família",
        "Confirmaram presença", "Não vão", "Recados"
      ]]);
    }
    var recados = [msgParents, msgSanti].filter(function (m) { return m; }).join(" | ");
    reviewSheet.appendRow([new Date(), code, familyName, coming, notComing, recados]);
  } catch (errReview) {
    // Uma falha aqui não deve impedir a confirmação de valer na planilha principal.
    Logger.log("Não consegui gravar na aba de revisão: " + errReview);
  }
}

/**
 * Rode esta função MANUALMENTE aqui no editor (não vem do site) — selecione
 * "testarAcessoPlanilhaRevisao" na listinha ao lado do botão Executar (▶) lá
 * em cima e clique em Executar. Se aparecer uma tela do Google pedindo
 * permissão, aceite (clique em Avançado → Acessar [nome do projeto] (não
 * seguro) → Permitir, do mesmo jeito que já fez antes). Se der certo, confira
 * se surgiu uma linha "TESTE-ACESSO" na aba "Confirmações a revisar" da
 * planilha de convidados. Se der erro, o próprio Apps Script mostra a
 * mensagem exata do problema numa caixinha na tela.
 */
function testarAcessoPlanilhaRevisao() {
  var reviewSpreadsheet = SpreadsheetApp.openById(REVIEW_SHEET_ID);
  var reviewSheet = reviewSpreadsheet.getSheetByName(REVIEW_TAB_NAME);
  if (!reviewSheet) {
    reviewSheet = reviewSpreadsheet.insertSheet(REVIEW_TAB_NAME);
    reviewSheet.getRange(1, 1, 1, 6).setValues([[
      "Data/hora", "Código da família", "Nome da família",
      "Confirmaram presença", "Não vão", "Recados"
    ]]);
  }
  reviewSheet.appendRow([new Date(), "TESTE-ACESSO", "Teste de acesso", "ninguém", "ninguém", ""]);
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
