(function () {
  "use strict";

  var SCRIPT_URL = "https://script.google.com/macros/s/AKfycbza0-DjB26jEMIjpLimp9ZeA5c9ss0vKyT7QrALZ4DdH_hpcmuJTPVMKzVj6OD1NgkR/exec";
  var PIN_STORAGE_KEY = "painelSantiagoPin";
  var FRONT_LINK = "https://designeruplima-cmd.github.io/santiago-1-aninho/santiago-site/index.html";

  // ---------------------------------------------------------------------
  // Estado em memória
  // ---------------------------------------------------------------------
  var state = {
    pin: "",
    families: [],
    guests: [],
    templates: [], // lista de mensagens salvas — uma delas tem ativo:true
    editingCode: null, // se preenchido, o form de "Adicionar" vira "Editar"
    editingTemplateId: null // se preenchido, o form de "Mensagem" vira "Editar"
  };

  // ---------------------------------------------------------------------
  // Comunicação com o Apps Script — mesmo padrão de confirmar.html:
  // POST com Content-Type text/plain (evita preflight CORS), resposta
  // sempre tratada pelo campo "status", nunca pelo status HTTP.
  // ---------------------------------------------------------------------
  function callGet(action, extraParams) {
    var params = "action=" + encodeURIComponent(action) + "&pin=" + encodeURIComponent(state.pin);
    if (extraParams) params += "&" + extraParams;
    return fetch(SCRIPT_URL + "?" + params).then(function (res) { return res.json(); });
  }

  function callPost(action, body) {
    var payload = Object.assign({ action: action, pin: state.pin }, body || {});
    return fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).then(function (res) { return res.json(); });
  }

  // ---------------------------------------------------------------------
  // Tela de PIN
  // ---------------------------------------------------------------------
  var lockScreen = document.getElementById("lockScreen");
  var appEl = document.getElementById("app");
  var pinInput = document.getElementById("pinInput");
  var pinBtn = document.getElementById("pinBtn");
  var pinError = document.getElementById("pinError");

  function tryEnter(pin) {
    state.pin = pin;
    pinError.textContent = "";
    pinBtn.disabled = true;
    pinBtn.textContent = "Entrando...";
    callGet("listAll").then(function (data) {
      pinBtn.disabled = false;
      pinBtn.textContent = "Entrar";
      if (data.status === "unauthorized") {
        pinError.textContent = "PIN incorreto. Tenta de novo.";
        localStorage.removeItem(PIN_STORAGE_KEY);
        return;
      }
      if (data.status === "ok") {
        localStorage.setItem(PIN_STORAGE_KEY, pin);
        state.families = data.families || [];
        showApp();
        loadTemplates();
        loadGuests();
      } else {
        pinError.textContent = "Não conseguimos entrar agora. Confira sua internet.";
      }
    }).catch(function () {
      pinBtn.disabled = false;
      pinBtn.textContent = "Entrar";
      pinError.textContent = "Sem conexão — confira sua internet e tente de novo.";
    });
  }

  pinBtn.addEventListener("click", function () {
    var pin = pinInput.value.trim();
    if (!pin) return;
    tryEnter(pin);
  });
  pinInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") pinBtn.click();
  });

  function showApp() {
    lockScreen.style.display = "none";
    appEl.classList.add("is-visible");
    renderFamilias();
    renderConfirmados();
  }

  // ---------------------------------------------------------------------
  // Navegação entre abas
  // ---------------------------------------------------------------------
  var screens = {
    Familias: document.getElementById("screenFamilias"),
    Adicionar: document.getElementById("screenAdicionar"),
    Confirmados: document.getElementById("screenConfirmados"),
    Mensagem: document.getElementById("screenMensagem")
  };
  var navButtons = document.querySelectorAll(".bottom-nav button");

  function goToScreen(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("is-active", key === name);
    });
    navButtons.forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.screen === name);
    });
    if (name !== "Adicionar" && state.editingCode) resetForm();
  }

  navButtons.forEach(function (btn) {
    btn.addEventListener("click", function () { goToScreen(btn.dataset.screen); });
  });

  // ---------------------------------------------------------------------
  // Utilitários
  // ---------------------------------------------------------------------
  function normalizePhoneForWhatsApp(raw) {
    var digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length <= 11) digits = "55" + digits; // assume Brasil sem DDI
    return digits;
  }

  function getActiveTemplateText() {
    var ativa = state.templates.find(function (t) { return t.ativo; });
    if (ativa) return ativa.conteudo;
    if (state.templates.length) return state.templates[0].conteudo; // sem nenhuma marcada, usa a primeira
    return "";
  }

  function buildWhatsAppLink(family) {
    var templateText = getActiveTemplateText();
    if (!templateText) return null;
    var text = templateText
      .replace(/\{nome\}/g, family.nome)
      .replace(/\{codigo\}/g, family.codigo)
      .replace(/\{link\}/g, FRONT_LINK);
    var digits = normalizePhoneForWhatsApp(family.telefone);
    if (!digits) return null;
    return "https://wa.me/" + digits + "?text=" + encodeURIComponent(text);
  }

  function statusBadge(family) {
    if (family.confirmado) return { cls: "confirmado", label: "Confirmado" };
    if (family.naoConfirmado) return { cls: "recusado", label: "Não vem" };
    if (family.enviado) return { cls: "enviado", label: "Enviado" };
    return { cls: "pendente", label: "Não enviado" };
  }

  // ---------------------------------------------------------------------
  // Aba Famílias
  // ---------------------------------------------------------------------
  var familiasStatus = document.getElementById("familiasStatus");
  var familiasList = document.getElementById("familiasList");
  var searchFamilias = document.getElementById("searchFamilias");

  function loadFamilies() {
    familiasStatus.textContent = "Carregando...";
    familiasStatus.classList.remove("error");
    callGet("listAll").then(function (data) {
      if (data.status === "ok") {
        state.families = data.families || [];
        familiasStatus.textContent = "";
        renderFamilias();
        renderConfirmados();
      } else {
        familiasStatus.textContent = "Não conseguimos carregar. Puxa pra atualizar e tenta de novo.";
        familiasStatus.classList.add("error");
      }
    }).catch(function () {
      familiasStatus.textContent = "Sem conexão — confira sua internet.";
      familiasStatus.classList.add("error");
    });
  }

  function renderFamilias() {
    var query = (searchFamilias.value || "").trim().toLowerCase();
    var list = state.families.filter(function (f) {
      if (!query) return true;
      return f.nome.toLowerCase().indexOf(query) > -1 || f.codigo.toLowerCase().indexOf(query) > -1;
    });

    familiasList.innerHTML = "";
    if (!list.length) {
      familiasList.innerHTML = '<div class="empty-state">Nenhuma família encontrada.</div>';
      return;
    }

    list.forEach(function (family) {
      var badge = statusBadge(family);
      var card = document.createElement("div");
      card.className = "family-card" + (family.confirmado ? " is-confirmed" : "");

      var recadoHtml = "";
      if (family.msgParents || family.msgSanti) {
        recadoHtml = '<div class="recado">' +
          (family.msgParents ? "💌 " + escapeHtml(family.msgParents) : "") +
          (family.msgParents && family.msgSanti ? "<br>" : "") +
          (family.msgSanti ? "🎈 " + escapeHtml(family.msgSanti) : "") +
          "</div>";
      }

      card.innerHTML =
        '<div class="top-row">' +
          '<div class="codigo">' + escapeHtml(family.codigo) + '</div>' +
          '<div class="badge ' + badge.cls + '">' + badge.label + '</div>' +
        '</div>' +
        '<p class="nome">' + escapeHtml(family.nome) + '</p>' +
        '<p class="pessoas">' + escapeHtml(family.pessoasRaw || "—") + '</p>' +
        '<p class="telefone">' + (family.telefone ? "📱 " + escapeHtml(family.telefone) : "Sem telefone cadastrado") + '</p>' +
        recadoHtml +
        '<div class="actions">' +
          '<button class="btn whatsapp" data-action="wa" data-codigo="' + family.codigo + '">Enviar WhatsApp</button>' +
          '<button class="btn edit" data-action="edit" data-codigo="' + family.codigo + '">Editar</button>' +
          '<button class="btn delete" data-action="delete" data-codigo="' + family.codigo + '">Excluir</button>' +
        '</div>';

      familiasList.appendChild(card);
    });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  familiasList.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    var codigo = btn.dataset.codigo;
    var family = state.families.find(function (f) { return f.codigo === codigo; });
    if (!family) return;

    if (btn.dataset.action === "wa") {
      if (!getActiveTemplateText()) { alert("Cadastre uma mensagem na aba Mensagem antes de enviar."); return; }
      var link = buildWhatsAppLink(family);
      if (!link) { alert("Essa família ainda não tem telefone cadastrado."); return; }
      window.open(link, "_blank");
      if (!family.enviado) {
        family.enviado = true;
        renderFamilias();
        callPost("markSent", { codigo: family.codigo }).catch(function () {});
      }
    } else if (btn.dataset.action === "edit") {
      startEdit(family);
    } else if (btn.dataset.action === "delete") {
      if (confirm('Tem certeza que quer excluir a família "' + family.nome + '" (' + family.codigo + ')? Isso não pode ser desfeito.')) {
        deleteFamily(codigo);
      }
    }
  });

  searchFamilias.addEventListener("input", renderFamilias);

  function deleteFamily(codigo) {
    callPost("deleteFamily", { codigo: codigo }).then(function (data) {
      if (data.status === "ok") {
        state.families = state.families.filter(function (f) { return f.codigo !== codigo; });
        renderFamilias();
        renderConfirmados();
      } else {
        alert("Não consegui excluir agora. Tenta de novo em instantes.");
      }
    }).catch(function () {
      alert("Sem conexão — confira sua internet.");
    });
  }

  // ---------------------------------------------------------------------
  // Aba Adicionar / Editar
  // ---------------------------------------------------------------------
  var formTitle = document.getElementById("formTitle");
  var fNome = document.getElementById("fNome");
  var fPessoas = document.getElementById("fPessoas");
  var fTelefone = document.getElementById("fTelefone");
  var fCodigo = document.getElementById("fCodigo");
  var codeToggle = document.getElementById("codeToggle");
  var codeManualField = document.getElementById("codeManualField");
  var btnSalvarFamilia = document.getElementById("btnSalvarFamilia");
  var btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
  var addStatus = document.getElementById("addStatus");
  var codeMode = "auto";

  codeToggle.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    codeMode = btn.dataset.value;
    Array.prototype.forEach.call(codeToggle.querySelectorAll("button"), function (b) {
      b.classList.toggle("is-active", b === btn);
    });
    codeManualField.style.display = codeMode === "manual" ? "block" : "none";
  });

  function startEdit(family) {
    state.editingCode = family.codigo;
    formTitle.textContent = "Editar " + family.nome;
    fNome.value = family.nome;
    fPessoas.value = family.pessoasRaw;
    fTelefone.value = family.telefone;
    fCodigo.value = family.codigo;
    codeMode = "manual";
    codeManualField.style.display = "block";
    fCodigo.disabled = true;
    Array.prototype.forEach.call(codeToggle.querySelectorAll("button"), function (b) {
      b.classList.toggle("is-active", b.dataset.value === "manual");
    });
    codeToggle.style.display = "none";
    btnCancelarEdicao.style.display = "block";
    btnSalvarFamilia.textContent = "Salvar alterações";
    addStatus.textContent = "";
    goToScreen("Adicionar");
  }

  function resetForm() {
    state.editingCode = null;
    formTitle.textContent = "Adicionar convidado";
    fNome.value = "";
    fPessoas.value = "";
    fTelefone.value = "";
    fCodigo.value = "";
    fCodigo.disabled = false;
    codeMode = "auto";
    codeManualField.style.display = "none";
    codeToggle.style.display = "flex";
    Array.prototype.forEach.call(codeToggle.querySelectorAll("button"), function (b) {
      b.classList.toggle("is-active", b.dataset.value === "auto");
    });
    btnCancelarEdicao.style.display = "none";
    btnSalvarFamilia.textContent = "Salvar";
    addStatus.textContent = "";
  }

  btnCancelarEdicao.addEventListener("click", resetForm);

  btnSalvarFamilia.addEventListener("click", function () {
    var nome = fNome.value.trim();
    var pessoas = fPessoas.value.trim();
    var telefone = fTelefone.value.trim();
    if (!nome) { addStatus.textContent = "Preenche pelo menos o nome da família."; addStatus.classList.add("error"); return; }

    addStatus.classList.remove("error");
    addStatus.textContent = "Salvando...";
    btnSalvarFamilia.disabled = true;

    if (state.editingCode) {
      callPost("editFamily", { codigo: state.editingCode, nome: nome, pessoas: pessoas, telefone: telefone })
        .then(function (data) {
          btnSalvarFamilia.disabled = false;
          if (data.status === "ok") {
            addStatus.textContent = "Atualizado!";
            loadFamilies();
            setTimeout(resetForm, 700);
          } else {
            addStatus.textContent = "Não encontrei essa família pra atualizar.";
            addStatus.classList.add("error");
          }
        }).catch(function () {
          btnSalvarFamilia.disabled = false;
          addStatus.textContent = "Sem conexão — tenta de novo.";
          addStatus.classList.add("error");
        });
      return;
    }

    var body = { nome: nome, pessoas: pessoas, telefone: telefone };
    if (codeMode === "manual") {
      var codigo = fCodigo.value.trim().toUpperCase();
      if (!codigo) { addStatus.textContent = "Digita um código ou escolhe gerar automático."; addStatus.classList.add("error"); btnSalvarFamilia.disabled = false; return; }
      body.codigo = codigo;
    }

    callPost("addFamily", body).then(function (data) {
      btnSalvarFamilia.disabled = false;
      if (data.status === "ok") {
        addStatus.textContent = "Adicionado! Código: " + data.family.codigo;
        state.families.push(data.family);
        renderFamilias();
        renderConfirmados();
        setTimeout(resetForm, 1200);
      } else if (data.status === "duplicate_code") {
        addStatus.textContent = "Esse código já existe — escolhe outro.";
        addStatus.classList.add("error");
      } else {
        addStatus.textContent = data.message || "Não consegui salvar agora.";
        addStatus.classList.add("error");
      }
    }).catch(function () {
      btnSalvarFamilia.disabled = false;
      addStatus.textContent = "Sem conexão — tenta de novo.";
      addStatus.classList.add("error");
    });
  });

  // ---------------------------------------------------------------------
  // Aba Confirmados
  // ---------------------------------------------------------------------
  var confirmadosStatus = document.getElementById("confirmadosStatus");
  var confirmadosList = document.getElementById("confirmadosList");
  var guestsStatus = document.getElementById("guestsStatus");
  var guestsList = document.getElementById("guestsList");

  // guarda quais famílias estão "abertas" na lista de confirmados, pra não
  // fechar tudo de novo toda vez que os dados são recarregados
  var expandedConfirmados = {};

  function renderConfirmados() {
    var list = state.families.filter(function (f) { return f.confirmado || f.naoConfirmado; });
    confirmadosStatus.textContent = "";
    confirmadosList.innerHTML = "";
    if (!list.length) {
      confirmadosList.innerHTML = '<div class="empty-state">Ninguém confirmou ainda.</div>';
      return;
    }
    list.forEach(function (family) {
      var badge = statusBadge(family);
      var isOpen = !!expandedConfirmados[family.codigo];

      var row = document.createElement("div");
      row.className = "confirm-row" + (isOpen ? " is-open" : "");
      row.dataset.codigo = family.codigo;

      var recadoHtml = "";
      if (family.msgParents || family.msgSanti) {
        recadoHtml = '<div class="recado">' +
          (family.msgParents ? "💌 " + escapeHtml(family.msgParents) : "") +
          (family.msgParents && family.msgSanti ? "<br>" : "") +
          (family.msgSanti ? "🎈 " + escapeHtml(family.msgSanti) : "") +
          "</div>";
      }

      row.innerHTML =
        '<div class="confirm-row-header">' +
          '<span class="confirm-row-nome">' + escapeHtml(family.nome) + '</span>' +
          '<div class="badge ' + badge.cls + '">' + badge.label + '</div>' +
        '</div>' +
        '<div class="confirm-row-details">' +
          '<p class="pessoas">Código: ' + escapeHtml(family.codigo) + '</p>' +
          '<p class="pessoas">Vêm: ' + escapeHtml(family.confirmado || "—") + '</p>' +
          (family.naoConfirmado ? '<p class="pessoas">Não vêm: ' + escapeHtml(family.naoConfirmado) + '</p>' : "") +
          (recadoHtml || '<p class="pessoas">Sem recados.</p>') +
        '</div>';

      confirmadosList.appendChild(row);
    });
  }

  confirmadosList.addEventListener("click", function (e) {
    var header = e.target.closest(".confirm-row-header");
    if (!header) return;
    var row = header.closest(".confirm-row");
    var codigo = row.dataset.codigo;
    expandedConfirmados[codigo] = !expandedConfirmados[codigo];
    row.classList.toggle("is-open", expandedConfirmados[codigo]);
  });

  function loadGuests() {
    guestsStatus.textContent = "Carregando...";
    callGet("listGuests").then(function (data) {
      if (data.status === "ok") {
        state.guests = data.guests || [];
        guestsStatus.textContent = "";
        renderGuests();
      } else {
        guestsStatus.textContent = "Não consegui carregar a lista de convidados.";
        guestsStatus.classList.add("error");
      }
    }).catch(function () {
      guestsStatus.textContent = "Sem conexão — confira sua internet.";
      guestsStatus.classList.add("error");
    });
  }

  function renderGuests() {
    guestsList.innerHTML = "";
    if (!state.guests.length) {
      guestsList.innerHTML = '<div class="empty-state">Nenhum convidado na lista.</div>';
      return;
    }
    state.guests.forEach(function (guest) {
      var row = document.createElement("div");
      row.className = "guest-row";
      row.innerHTML =
        '<span>' + escapeHtml(guest.nome) + '</span>' +
        '<span class="guest-check' + (guest.confirmado ? " is-checked" : "") + '" data-row="' + guest.row + '">' +
        (guest.confirmado ? "✓" : "") + '</span>';
      guestsList.appendChild(row);
    });
  }

  guestsList.addEventListener("click", function (e) {
    var check = e.target.closest(".guest-check");
    if (!check) return;
    var row = Number(check.dataset.row);
    var guest = state.guests.find(function (g) { return g.row === row; });
    if (!guest) return;
    var newValue = !guest.confirmado;

    // atualização otimista — reflete na hora, corrige se der erro
    guest.confirmado = newValue;
    renderGuests();

    callPost("toggleGuest", { row: row, confirmed: newValue }).then(function (data) {
      if (data.status !== "ok") {
        guest.confirmado = !newValue;
        renderGuests();
        alert("Não consegui salvar essa marcação. Tenta de novo.");
      }
    }).catch(function () {
      guest.confirmado = !newValue;
      renderGuests();
      alert("Sem conexão — a marcação não foi salva.");
    });
  });

  // ---------------------------------------------------------------------
  // Aba Mensagem — agora com várias mensagens salvas, uma delas "Ativa"
  // (é essa que o botão "Enviar WhatsApp" usa em cada família).
  // ---------------------------------------------------------------------
  var templatesStatus = document.getElementById("templatesStatus");
  var templatesList = document.getElementById("templatesList");
  var btnNovaMensagem = document.getElementById("btnNovaMensagem");
  var templateForm = document.getElementById("templateForm");
  var templateFormTitle = document.getElementById("templateFormTitle");
  var tNome = document.getElementById("tNome");
  var tConteudo = document.getElementById("tConteudo");
  var btnSalvarTemplateForm = document.getElementById("btnSalvarTemplateForm");
  var btnCancelarTemplateForm = document.getElementById("btnCancelarTemplateForm");
  var templateFormStatus = document.getElementById("templateFormStatus");
  var templateFormPreview = document.getElementById("templateFormPreview");

  // guarda quais mensagens estão "abertas" na lista, pra não fechar tudo
  // de novo toda vez que os dados são recarregados
  var expandedTemplates = {};

  function loadTemplates() {
    templatesStatus.textContent = "Carregando...";
    templatesStatus.classList.remove("error");
    callGet("listTemplates").then(function (data) {
      if (data.status === "ok") {
        state.templates = data.templates || [];
        templatesStatus.textContent = "";
        renderTemplates();
      } else {
        templatesStatus.textContent = "Não consegui carregar as mensagens.";
        templatesStatus.classList.add("error");
      }
    }).catch(function () {
      templatesStatus.textContent = "Sem conexão — confira sua internet.";
      templatesStatus.classList.add("error");
    });
  }

  function renderTemplates() {
    templatesList.innerHTML = "";
    if (!state.templates.length) {
      templatesList.innerHTML = '<div class="empty-state">Nenhuma mensagem cadastrada ainda.</div>';
      return;
    }
    state.templates.forEach(function (tpl) {
      var isOpen = !!expandedTemplates[tpl.id];
      var row = document.createElement("div");
      row.className = "template-row" + (isOpen ? " is-open" : "") + (tpl.ativo ? " is-active-template" : "");
      row.dataset.id = tpl.id;
      row.innerHTML =
        '<div class="template-row-header">' +
          '<span class="template-row-nome">' + escapeHtml(tpl.nome) + '</span>' +
          (tpl.ativo ? '<div class="badge ativa">Ativa</div>' : '') +
        '</div>' +
        '<div class="template-row-details">' +
          '<div class="preview-box">' + escapeHtml(tpl.conteudo) + '</div>' +
          '<div class="actions">' +
            (tpl.ativo ? '' : '<button class="btn whatsapp" data-action="ativar" data-id="' + tpl.id + '">Ativar</button>') +
            '<button class="btn edit" data-action="editar" data-id="' + tpl.id + '">Editar</button>' +
            '<button class="btn delete" data-action="excluir" data-id="' + tpl.id + '">Excluir</button>' +
          '</div>' +
        '</div>';
      templatesList.appendChild(row);
    });
  }

  templatesList.addEventListener("click", function (e) {
    var actionBtn = e.target.closest("button[data-action]");
    if (actionBtn) {
      var id = actionBtn.dataset.id;
      var tpl = state.templates.find(function (t) { return t.id === id; });
      if (!tpl) return;
      if (actionBtn.dataset.action === "ativar") {
        ativarTemplate(id);
      } else if (actionBtn.dataset.action === "editar") {
        startEditTemplate(tpl);
      } else if (actionBtn.dataset.action === "excluir") {
        if (confirm('Tem certeza que quer excluir a mensagem "' + tpl.nome + '"? Isso não pode ser desfeito.')) {
          excluirTemplate(id);
        }
      }
      return;
    }
    var header = e.target.closest(".template-row-header");
    if (!header) return;
    var row = header.closest(".template-row");
    var id = row.dataset.id;
    expandedTemplates[id] = !expandedTemplates[id];
    row.classList.toggle("is-open", expandedTemplates[id]);
  });

  function ativarTemplate(id) {
    // atualização otimista — reflete na hora, recarrega se der erro
    state.templates.forEach(function (t) { t.ativo = (t.id === id); });
    renderTemplates();
    callPost("activateTemplate", { id: id }).then(function (data) {
      if (data.status !== "ok") {
        alert("Não consegui ativar essa mensagem agora. Tenta de novo.");
        loadTemplates();
      }
    }).catch(function () {
      alert("Sem conexão — tenta de novo.");
      loadTemplates();
    });
  }

  function excluirTemplate(id) {
    callPost("deleteTemplate", { id: id }).then(function (data) {
      if (data.status === "ok") {
        delete expandedTemplates[id];
        loadTemplates();
      } else {
        alert("Não consegui excluir agora. Tenta de novo.");
      }
    }).catch(function () {
      alert("Sem conexão — confira sua internet.");
    });
  }

  function updateTemplateFormPreview() {
    var sample = state.families[0] || { nome: "Norma", codigo: "NORMA01" };
    var text = tConteudo.value
      .replace(/\{nome\}/g, sample.nome)
      .replace(/\{codigo\}/g, sample.codigo)
      .replace(/\{link\}/g, FRONT_LINK);
    templateFormPreview.textContent = text;
  }
  tConteudo.addEventListener("input", updateTemplateFormPreview);

  function abrirFormularioTemplate() {
    templateFormStatus.textContent = "";
    templateFormStatus.classList.remove("error");
    templateForm.style.display = "block";
    templateForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  btnNovaMensagem.addEventListener("click", function () {
    state.editingTemplateId = null;
    templateFormTitle.textContent = "Nova mensagem";
    tNome.value = "";
    tConteudo.value = "";
    updateTemplateFormPreview();
    abrirFormularioTemplate();
  });

  function startEditTemplate(tpl) {
    state.editingTemplateId = tpl.id;
    templateFormTitle.textContent = "Editar mensagem";
    tNome.value = tpl.nome;
    tConteudo.value = tpl.conteudo;
    updateTemplateFormPreview();
    abrirFormularioTemplate();
  }

  btnCancelarTemplateForm.addEventListener("click", function () {
    templateForm.style.display = "none";
    state.editingTemplateId = null;
  });

  btnSalvarTemplateForm.addEventListener("click", function () {
    var nome = tNome.value.trim();
    var conteudo = tConteudo.value.trim();
    if (!nome || !conteudo) {
      templateFormStatus.textContent = "Preenche o nome e o texto da mensagem.";
      templateFormStatus.classList.add("error");
      return;
    }
    templateFormStatus.classList.remove("error");
    templateFormStatus.textContent = "Salvando...";
    btnSalvarTemplateForm.disabled = true;

    if (state.editingTemplateId) {
      callPost("editTemplate", { id: state.editingTemplateId, nome: nome, conteudo: conteudo }).then(function (data) {
        btnSalvarTemplateForm.disabled = false;
        if (data.status === "ok") {
          templateFormStatus.textContent = "Mensagem atualizada!";
          loadTemplates();
          setTimeout(function () { templateForm.style.display = "none"; }, 800);
        } else {
          templateFormStatus.textContent = "Não encontrei essa mensagem pra atualizar.";
          templateFormStatus.classList.add("error");
        }
      }).catch(function () {
        btnSalvarTemplateForm.disabled = false;
        templateFormStatus.textContent = "Sem conexão — tenta de novo.";
        templateFormStatus.classList.add("error");
      });
      return;
    }

    callPost("addTemplate", { nome: nome, conteudo: conteudo }).then(function (data) {
      btnSalvarTemplateForm.disabled = false;
      if (data.status === "ok") {
        templateFormStatus.textContent = "Mensagem criada!";
        loadTemplates();
        setTimeout(function () { templateForm.style.display = "none"; }, 800);
      } else {
        templateFormStatus.textContent = data.message || "Não consegui salvar agora.";
        templateFormStatus.classList.add("error");
      }
    }).catch(function () {
      btnSalvarTemplateForm.disabled = false;
      templateFormStatus.textContent = "Sem conexão — tenta de novo.";
      templateFormStatus.classList.add("error");
    });
  });

  // ---------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------
  var savedPin = localStorage.getItem(PIN_STORAGE_KEY);
  if (savedPin) {
    pinInput.value = savedPin;
    tryEnter(savedPin);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }
})();
