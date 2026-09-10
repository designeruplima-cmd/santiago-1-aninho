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

// ---------------------------------------------------------------------------
// Painel PWA (Uriel + esposa) — tudo daqui pra baixo até a próxima linha de
// travessões é usado só pelo painel em painel/, nunca pelo site dos convidados.
// ---------------------------------------------------------------------------
var PANEL_PIN = "1128"; // PIN de acesso ao painel (28/11, data da festa)
var CONFIG_TAB_NAME = "Configuração";
var TEMPLATE_KEY = "template_whatsapp";
var DEFAULT_TEMPLATE =
  "Oi, família {nome}! Tudo bem?\n\n" +
  "O Santiago te convida pra festa do aniversário de 1 aninho dele — vai ser uma alegria " +
  "ter vocês lá pra brincar e comemorar com a gente!\n\n" +
  "Guarda a data: 28 de novembro. Saiba mais e confirme sua presença no link abaixo:\n\n" +
  "https://designeruplima-cmd.github.io/santiago-1-aninho/santiago-site/index.html\n\n" +
  "Pra confirmar, usa esse código da família de vocês: *{codigo}*\n\n" +
  "Só um detalhe: o código vale pra família toda — assim que uma pessoa confirmar, ele já " +
  "fica marcado como usado. Então combinem entre vocês quem vai confirmar, porque se outra " +
  "pessoa tentar depois, vai aparecer que já foi confirmado.\n\n" +
  "Esperamos vocês!";

/**
 * Busca a família pelo código (usado pela tela de confirmar presença pra
 * mostrar os nomes de quem mora na casa antes de confirmar).
 */
function doGet(e) {
  var action = String((e && e.parameter && e.parameter.action) || "").trim();
  if (action) return routeAction(action, e, null);

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
  var earlyAction = "";
  try { earlyAction = String((JSON.parse(e.postData.contents) || {}).action || "").trim(); } catch (errEarly) {}
  if (earlyAction) return routeAction(earlyAction, e, JSON.parse(e.postData.contents));

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

// ---------------------------------------------------------------------------
// Painel PWA — roteador de ações e implementações. Só é acionado quando vem
// um parâmetro "action" (GET) ou campo "action" no corpo (POST); sem isso,
// doGet/doPost seguem o comportamento de sempre, usado por confirmar.html.
// ---------------------------------------------------------------------------

function routeAction(action, e, body) {
  try {
    if (!checkPin(e, body)) return jsonOut({ status: "unauthorized" });
    switch (action) {
      case "listAll":      return actionListAll();
      case "addFamily":    return actionAddFamily(body || {});
      case "editFamily":   return actionEditFamily(body || {});
      case "deleteFamily": return actionDeleteFamily(body || {});
      case "listTemplates":    return actionListTemplates();
      case "addTemplate":      return actionAddTemplate(body || {});
      case "editTemplate":     return actionEditTemplate(body || {});
      case "deleteTemplate":   return actionDeleteTemplate(body || {});
      case "activateTemplate": return actionActivateTemplate(body || {});
      case "listGuests":   return actionListGuests();
      case "toggleGuest":  return actionToggleGuestConfirmed(body || {});
      case "markSent":     return actionMarkSent(body || {});
      default:
        return jsonOut({ status: "error", message: "ação desconhecida: " + action });
    }
  } catch (err) {
    return jsonOut({ status: "error", message: String(err) });
  }
}

function checkPin(e, body) {
  var pin = String((body && body.pin) || (e && e.parameter && e.parameter.pin) || "").trim();
  return !!pin && pin === PANEL_PIN;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function actionListAll() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var families = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!String(row[0]).trim()) continue; // pula linhas em branco
    families.push({
      rowIndex: i + 1,
      codigo: String(row[0]).trim().toUpperCase(),
      numero: row[1],
      nome: String(row[2] || ""),
      pessoasRaw: String(row[3] || ""),
      pessoas: splitNames(row[3]),
      telefone: String(row[4] || ""),
      enviado: !!String(row[5] || "").trim(),
      confirmado: String(row[6] || ""),
      msgParents: String(row[7] || ""),
      msgSanti: String(row[8] || ""),
      naoConfirmado: String(row[9] || ""),
      dataConfirmacao: row[10] ? String(row[10]) : ""
    });
  }
  return jsonOut({ status: "ok", families: families });
}

function actionAddFamily(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var values = sheet.getDataRange().getValues();
    var existingCodes = {};
    for (var i = 1; i < values.length; i++) {
      var c = String(values[i][0]).trim().toUpperCase();
      if (c) existingCodes[c] = true;
    }
    TEST_CODES.forEach(function (c) { existingCodes[c] = true; });

    var nome = String(body.nome || "").trim();
    var pessoas = String(body.pessoas || "").trim();
    var telefone = String(body.telefone || "").trim();
    if (!nome) return jsonOut({ status: "error", message: "Nome da família é obrigatório." });

    var manualCode = String(body.codigo || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    var code;
    if (manualCode) {
      if (existingCodes[manualCode]) return jsonOut({ status: "duplicate_code", codigo: manualCode });
      code = manualCode;
    } else {
      code = generateFamilyCode(nome, existingCodes);
    }

    var lastNumero = values.length > 1 ? Number(values[values.length - 1][1]) || (values.length - 1) : 0;
    var nextNumero = lastNumero + 1;

    sheet.appendRow([code, nextNumero, nome, pessoas, telefone]);

    return jsonOut({
      status: "ok",
      family: { codigo: code, numero: nextNumero, nome: nome, pessoasRaw: pessoas, pessoas: splitNames(pessoas), telefone: telefone }
    });
  } finally {
    lock.releaseLock();
  }
}

function generateFamilyCode(nome, existingCodes) {
  var base = nome.toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "")
    .slice(0, 6) || "FAMILIA";
  var n = 1;
  var candidate = base + String(n).padStart(2, "0");
  while (existingCodes[candidate]) {
    n++;
    candidate = base + String(n).padStart(2, "0");
  }
  return candidate;
}

function actionEditFamily(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var codigo = String(body.codigo || "").trim().toUpperCase();
    if (!codigo) return jsonOut({ status: "error", message: "Código é obrigatório." });

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      var rowCode = String(values[i][0]).trim().toUpperCase();
      if (rowCode !== codigo) continue;

      if (body.nome !== undefined) sheet.getRange(i + 1, 3).setValue(String(body.nome || ""));
      if (body.pessoas !== undefined) sheet.getRange(i + 1, 4).setValue(String(body.pessoas || ""));
      if (body.telefone !== undefined) sheet.getRange(i + 1, 5).setValue(String(body.telefone || ""));

      return jsonOut({ status: "ok" });
    }
    return jsonOut({ status: "not_found", codigo: codigo });
  } finally {
    lock.releaseLock();
  }
}

function actionDeleteFamily(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var codigo = String(body.codigo || "").trim().toUpperCase();
    if (!codigo) return jsonOut({ status: "error", message: "Código é obrigatório." });

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      var rowCode = String(values[i][0]).trim().toUpperCase();
      if (rowCode !== codigo) continue;
      sheet.deleteRow(i + 1);
      return jsonOut({ status: "ok" });
    }
    return jsonOut({ status: "not_found", codigo: codigo });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Marca que o WhatsApp já foi enviado pra essa família (coluna F, que antes
 * ficava em branco). Chamado automaticamente pelo painel ao clicar em
 * "Enviar WhatsApp" — não afeta o fluxo de confirmar.html, que nunca lê essa
 * coluna.
 */
function actionMarkSent(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var codigo = String(body.codigo || "").trim().toUpperCase();
    if (!codigo) return jsonOut({ status: "error", message: "Código é obrigatório." });

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      var rowCode = String(values[i][0]).trim().toUpperCase();
      if (rowCode !== codigo) continue;
      sheet.getRange(i + 1, 6).setValue(new Date()); // F - Enviado
      return jsonOut({ status: "ok" });
    }
    return jsonOut({ status: "not_found", codigo: codigo });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Aba "Configuração" — agora guarda VÁRIAS mensagens de WhatsApp (não só uma),
 * cada linha com [ID, Nome, Mensagem, Ativa]. A coluna "Ativa" só tem "Sim" em
 * UMA linha por vez: essa é a mensagem que o botão "Enviar WhatsApp" usa.
 * Se a aba ainda estiver no formato antigo (uma mensagem só, colunas
 * "Chave"/"Valor"), essa função migra sozinha pro formato novo, preservando
 * o texto que já estava salvo.
 */
function getMessagesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG_TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_TAB_NAME);
    sheet.getRange(1, 1, 1, 4).setValues([["ID", "Nome", "Mensagem", "Ativa"]]);
    sheet.getRange(2, 1, 1, 4).setValues([["m1", "Mensagem padrão", DEFAULT_TEMPLATE, "Sim"]]);
    return sheet;
  }

  var primeiroCabecalho = String(sheet.getRange(1, 1).getValue()).trim();
  if (primeiroCabecalho === "Chave") {
    var oldValues = sheet.getDataRange().getValues();
    var oldTemplate = DEFAULT_TEMPLATE;
    for (var i = 1; i < oldValues.length; i++) {
      if (String(oldValues[i][0]).trim() === TEMPLATE_KEY) {
        oldTemplate = String(oldValues[i][1] || DEFAULT_TEMPLATE);
        break;
      }
    }
    sheet.clear();
    sheet.getRange(1, 1, 1, 4).setValues([["ID", "Nome", "Mensagem", "Ativa"]]);
    sheet.getRange(2, 1, 1, 4).setValues([["m1", "Mensagem padrão", oldTemplate, "Sim"]]);
  }
  return sheet;
}

function actionListTemplates() {
  var sheet = getMessagesSheet();
  var values = sheet.getDataRange().getValues();
  var templates = [];
  for (var i = 1; i < values.length; i++) {
    if (!String(values[i][0]).trim()) continue;
    templates.push({
      id: String(values[i][0]),
      nome: String(values[i][1] || ""),
      conteudo: String(values[i][2] || ""),
      ativo: String(values[i][3] || "").trim().toLowerCase() === "sim"
    });
  }
  return jsonOut({ status: "ok", templates: templates });
}

function actionAddTemplate(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var nome = String(body.nome || "").trim();
    var conteudo = String(body.conteudo || "").trim();
    if (!nome || !conteudo) {
      return jsonOut({ status: "error", message: "Nome e texto da mensagem são obrigatórios." });
    }

    var sheet = getMessagesSheet();
    var values = sheet.getDataRange().getValues();
    var isFirst = values.length <= 1; // só tem o cabeçalho ainda
    var id = "m" + new Date().getTime();

    sheet.appendRow([id, nome, conteudo, isFirst ? "Sim" : ""]);

    return jsonOut({ status: "ok", template: { id: id, nome: nome, conteudo: conteudo, ativo: isFirst } });
  } finally {
    lock.releaseLock();
  }
}

function actionEditTemplate(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var id = String(body.id || "").trim();
    if (!id) return jsonOut({ status: "error", message: "ID é obrigatório." });

    var sheet = getMessagesSheet();
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) !== id) continue;
      if (body.nome !== undefined) sheet.getRange(i + 1, 2).setValue(String(body.nome || ""));
      if (body.conteudo !== undefined) sheet.getRange(i + 1, 3).setValue(String(body.conteudo || ""));
      return jsonOut({ status: "ok" });
    }
    return jsonOut({ status: "not_found", id: id });
  } finally {
    lock.releaseLock();
  }
}

function actionDeleteTemplate(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var id = String(body.id || "").trim();
    if (!id) return jsonOut({ status: "error", message: "ID é obrigatório." });

    var sheet = getMessagesSheet();
    var values = sheet.getDataRange().getValues();
    var rowIndex = -1;
    var wasActive = false;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === id) {
        rowIndex = i + 1;
        wasActive = String(values[i][3] || "").trim().toLowerCase() === "sim";
        break;
      }
    }
    if (rowIndex === -1) return jsonOut({ status: "not_found", id: id });

    sheet.deleteRow(rowIndex);

    // se a mensagem excluída era a ativa, ativa a primeira que sobrou, pra
    // nunca ficar sem nenhuma mensagem ativa.
    if (wasActive) {
      var remaining = sheet.getDataRange().getValues();
      if (remaining.length > 1) {
        sheet.getRange(2, 4).setValue("Sim");
      }
    }
    return jsonOut({ status: "ok" });
  } finally {
    lock.releaseLock();
  }
}

function actionActivateTemplate(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var id = String(body.id || "").trim();
    if (!id) return jsonOut({ status: "error", message: "ID é obrigatório." });

    var sheet = getMessagesSheet();
    var values = sheet.getDataRange().getValues();
    var found = false;
    for (var i = 1; i < values.length; i++) {
      var isMatch = String(values[i][0]) === id;
      if (isMatch) found = true;
      sheet.getRange(i + 1, 4).setValue(isMatch ? "Sim" : "");
    }
    return found ? jsonOut({ status: "ok" }) : jsonOut({ status: "not_found", id: id });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lista individual de convidados (planilha separada "1 ano Santiago - Lista
 * de Convidados", primeira aba: colunas Lista/Nomes/Enviados/Confirmados).
 */
function actionListGuests() {
  var ss = SpreadsheetApp.openById(REVIEW_SHEET_ID);
  var sheet = ss.getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var guests = [];
  for (var i = 1; i < values.length; i++) {
    var nome = String(values[i][1] || "").trim();
    if (!nome) continue;
    guests.push({
      row: i + 1,
      numero: values[i][0],
      nome: nome,
      confirmado: !!String(values[i][3] || "").trim()
    });
  }
  return jsonOut({ status: "ok", guests: guests });
}

function actionToggleGuestConfirmed(body) {
  var row = Number(body.row);
  if (!row) return jsonOut({ status: "error", message: "linha inválida" });
  var confirmed = !!body.confirmed;
  var ss = SpreadsheetApp.openById(REVIEW_SHEET_ID);
  var sheet = ss.getSheets()[0];
  sheet.getRange(row, 4).setValue(confirmed ? "Sim" : "");
  return jsonOut({ status: "ok" });
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
