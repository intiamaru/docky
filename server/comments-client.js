(function () {
  var scriptEl = document.currentScript;
  var API_BASE = scriptEl.getAttribute("data-api");
  var page = scriptEl.getAttribute("data-page");
  var VISITOR_TOKEN_KEY = "ce_visitor_token"; // shared across pages on this API — one login, comment anywhere
  var ADMIN_TOKEN_KEY = "ce_admin_token_" + page; // optional integration with Docky's edit.js, same page

  function getVisitorToken() { return localStorage.getItem(VISITOR_TOKEN_KEY); }
  function setVisitorToken(t) { localStorage.setItem(VISITOR_TOKEN_KEY, t); }
  function clearVisitorToken() { localStorage.removeItem(VISITOR_TOKEN_KEY); }
  function getVisitorName() { return localStorage.getItem(VISITOR_TOKEN_KEY + "_name"); }
  function setVisitorName(n) { localStorage.setItem(VISITOR_TOKEN_KEY + "_name", n); }
  function getAdminToken() { return localStorage.getItem(ADMIN_TOKEN_KEY); }

  function decodeJwtExp(token) {
    try {
      var payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.exp ? payload.exp * 1000 : null;
    } catch (e) { return null; }
  }

  var style = document.createElement("style");
  style.textContent =
    ".cm-badge{position:absolute;z-index:400;display:flex;align-items:center;gap:4px;" +
    "background:#2b2622;color:#f0e9d8;border:none;border-radius:999px;padding:5px 10px;" +
    "font-size:12px;font-family:system-ui,sans-serif;cursor:pointer;opacity:.55;transition:opacity .15s;box-shadow:0 2px 8px rgba(0,0,0,.2)}" +
    ".cm-badge:hover{opacity:1}" +
    ".cm-badge .n{font-weight:700}" +
    ".cm-panel{position:absolute;z-index:10050;width:min(340px,90vw);background:#faf6f0;" +
    "border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:system-ui,sans-serif;" +
    "color:#2b2622;overflow:hidden}" +
    ".cm-panel .cm-head{display:flex;justify-content:space-between;align-items:center;" +
    "padding:12px 14px;border-bottom:1px solid #e2d7c7;font-size:13px;font-weight:700}" +
    ".cm-panel .cm-close{background:none;border:none;font-size:16px;cursor:pointer;color:#8a7d6b;line-height:1}" +
    ".cm-list{max-height:260px;overflow-y:auto;padding:10px 14px}" +
    ".cm-item{padding:9px 0;border-bottom:1px solid #efe7d8;font-size:13px}" +
    ".cm-item:last-child{border-bottom:none}" +
    ".cm-item .cm-author{font-weight:700;margin-right:6px}" +
    ".cm-item .cm-date{color:#a89a82;font-size:11px}" +
    ".cm-item .cm-body{margin-top:3px;line-height:1.4;white-space:pre-wrap;word-break:break-word}" +
    ".cm-item .cm-del{float:right;background:none;border:none;color:#b5493a;cursor:pointer;font-size:12px}" +
    ".cm-empty{color:#a89a82;font-size:12.5px;padding:6px 0}" +
    ".cm-form{padding:10px 14px 14px;border-top:1px solid #e2d7c7}" +
    ".cm-form input,.cm-form textarea{width:100%;box-sizing:border-box;border:1px solid #e2d7c7;" +
    "border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;margin-bottom:8px}" +
    ".cm-form textarea{resize:vertical;min-height:52px}" +
    ".cm-form .cm-row{display:flex;gap:8px;align-items:center}" +
    ".cm-form button{border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;" +
    "font-weight:700;cursor:pointer;font-family:inherit;background:#2b2622;color:#f0e9d8}" +
    ".cm-form .cm-as{font-size:11.5px;color:#6b8f74;margin-bottom:6px}" +
    ".cm-form .cm-link{background:none;color:#8a6d3b;font-weight:600;padding:0;text-decoration:underline;" +
    "font-size:11.5px;cursor:pointer;border:none}" +
    ".cm-err{color:#b5493a;font-size:11.5px;margin:-4px 0 8px}";
  document.head.appendChild(style);

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
        " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  function apiGet(path) {
    return fetch(API_BASE + path).then(function (r) { return r.ok ? r.json() : []; });
  }
  function apiPost(path, body, token) {
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(API_BASE + path, { method: "POST", headers: headers, body: JSON.stringify(body) });
  }
  function apiDelete(path, token) {
    return fetch(API_BASE + path, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
  }

  var allComments = []; // cached full list for this page, refreshed on load and after posting

  function commentsFor(key) {
    return allComments.filter(function (c) { return c.elementKey === key; });
  }

  function closeAnyPanel() {
    var existing = document.querySelector(".cm-panel");
    if (existing) existing.remove();
  }

  function placeNear(panel, anchor) {
    var r = anchor.getBoundingClientRect();
    panel.style.top = (window.scrollY + r.bottom + 8) + "px";
    var left = window.scrollX + r.right - 340;
    if (left < 8) left = window.scrollX + r.left;
    panel.style.left = Math.max(8, left) + "px";
  }

  function renderLoginStep(container, onDone) {
    container.innerHTML = "";
    var err = el("div", { class: "cm-err" }, "");
    var emailInput = el("input", { type: "email", placeholder: "tu email" });
    var sendBtn = el("button", {}, "Enviar código");
    var row = el("div", { class: "cm-row" });
    row.appendChild(emailInput);
    row.appendChild(sendBtn);
    container.appendChild(err);
    container.appendChild(row);

    sendBtn.addEventListener("click", function () {
      var email = emailInput.value.trim();
      if (!email) return;
      sendBtn.disabled = true;
      apiPost("/api/auth/request-code", { email: email }).then(function (res) {
        sendBtn.disabled = false;
        if (!res.ok) { err.textContent = "No se pudo enviar el código"; return; }
        renderCodeStep(container, email, onDone);
      }).catch(function () { sendBtn.disabled = false; err.textContent = "Error de conexión"; });
    });
  }

  function renderCodeStep(container, email, onDone) {
    container.innerHTML = "";
    var err = el("div", { class: "cm-err" }, "");
    var info = el("div", { class: "cm-as" }, "Código enviado a " + email);
    var codeInput = el("input", { type: "text", placeholder: "código de 6 dígitos", maxlength: "6" });
    var nameInput = el("input", { type: "text", placeholder: "tu nombre (si es tu primera vez)" });
    var confirmBtn = el("button", {}, "Confirmar");
    container.appendChild(info);
    container.appendChild(err);
    container.appendChild(codeInput);
    container.appendChild(nameInput);
    container.appendChild(confirmBtn);

    confirmBtn.addEventListener("click", function () {
      var code = codeInput.value.trim();
      if (!code) return;
      confirmBtn.disabled = true;
      apiPost("/api/auth/verify-code", { email: email, code: code, name: nameInput.value.trim() })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          confirmBtn.disabled = false;
          if (!data) { err.textContent = "Código inválido o vencido"; return; }
          setVisitorToken(data.token);
          setVisitorName(data.name);
          onDone();
        })
        .catch(function () { confirmBtn.disabled = false; err.textContent = "Error de conexión"; });
    });
  }

  function renderCommentForm(container, key, onPosted) {
    container.innerHTML = "";
    var err = el("div", { class: "cm-err" }, "");
    container.appendChild(err);

    var token = getVisitorToken();
    var name = getVisitorName();
    var nameInput = null;

    if (token && name) {
      container.appendChild(el("div", { class: "cm-as" }, "Comentando como " + name));
    } else {
      nameInput = el("input", { type: "text", placeholder: "tu nombre" });
      container.appendChild(nameInput);
      var loginLink = el("button", { class: "cm-link" }, "¿Querés poder volver luego? Ingresá con tu email");
      container.appendChild(loginLink);
      loginLink.addEventListener("click", function () {
        renderLoginStep(container, function () { renderCommentForm(container, key, onPosted); });
      });
    }

    var textarea = el("textarea", { placeholder: "Escribí un comentario…" });
    var postBtn = el("button", {}, "Publicar");
    container.appendChild(textarea);
    container.appendChild(postBtn);

    postBtn.addEventListener("click", function () {
      var body = textarea.value.trim();
      if (!body) return;
      var authorName = nameInput ? nameInput.value.trim() : undefined;
      if (!token && !authorName) { err.textContent = "Escribí tu nombre"; return; }
      postBtn.disabled = true;
      apiPost("/api/comments", { page: page, elementKey: key, body: body, authorName: authorName }, token)
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (created) {
          postBtn.disabled = false;
          if (!created) { err.textContent = "No se pudo publicar"; return; }
          allComments.push(created);
          textarea.value = "";
          onPosted();
        })
        .catch(function () { postBtn.disabled = false; err.textContent = "Error de conexión"; });
    });
  }

  function openPanel(anchor, badgeEl, key) {
    closeAnyPanel();
    var panel = el("div", { class: "cm-panel" });
    var head = el("div", { class: "cm-head" });
    head.appendChild(el("span", {}, "Comentarios"));
    var closeBtn = el("button", { class: "cm-close" }, "✕");
    head.appendChild(closeBtn);
    panel.appendChild(head);

    var list = el("div", { class: "cm-list" });
    var form = el("div", { class: "cm-form" });
    panel.appendChild(list);
    panel.appendChild(form);

    function renderList() {
      list.innerHTML = "";
      var items = commentsFor(key);
      if (!items.length) {
        list.appendChild(el("div", { class: "cm-empty" }, "Sé el primero en comentar."));
        return;
      }
      var adminToken = getAdminToken();
      items.forEach(function (c) {
        var item = el("div", { class: "cm-item" });
        if (adminToken) {
          var del = el("button", { class: "cm-del" }, "borrar");
          del.addEventListener("click", function () {
            apiDelete("/api/comments/" + c.id, adminToken).then(function (res) {
              if (res.ok) {
                allComments = allComments.filter(function (x) { return x.id !== c.id; });
                renderList();
                updateBadge(anchor, key);
              }
            });
          });
          item.appendChild(del);
        }
        item.appendChild(el("span", { class: "cm-author" }, escapeHtml(c.authorName)));
        item.appendChild(el("span", { class: "cm-date" }, fmtDate(c.createdAt)));
        item.appendChild(el("div", { class: "cm-body" }, escapeHtml(c.body)));
        list.appendChild(item);
      });
    }

    renderList();
    renderCommentForm(form, key, function () {
      renderList();
      updateBadge(anchor, key);
    });

    document.body.appendChild(panel);
    placeNear(panel, badgeEl);
    closeBtn.addEventListener("click", closeAnyPanel);
    setTimeout(function () {
      document.addEventListener("mousedown", function outside(e) {
        if (panel.contains(e.target) || anchor.contains(e.target) || badgeEl.contains(e.target)) return;
        document.removeEventListener("mousedown", outside, true);
        panel.remove();
      }, true);
    }, 0);
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  var badges = [];

  function updateBadge(anchor, key) {
    var count = commentsFor(key).length;
    var b = badges.find(function (x) { return x.anchor === anchor; });
    if (b) b.el.querySelector(".n").textContent = count;
  }

  function placeBadges() {
    badges.forEach(function (b) {
      var r = b.anchor.getBoundingClientRect();
      b.el.style.top = (window.scrollY + r.top - 10) + "px";
      b.el.style.left = (window.scrollX + r.right - 30) + "px";
    });
  }

  function wireCommentable(anchorEl) {
    var key = anchorEl.getAttribute("data-cm");
    var badge = el("button", { class: "cm-badge", title: "Comentar" },
      '💬 <span class="n">0</span>');
    document.body.appendChild(badge);
    badges.push({ anchor: anchorEl, el: badge, key: key });
    badge.addEventListener("click", function (e) {
      e.stopPropagation();
      openPanel(anchorEl, badge, key);
    });
    updateBadge(anchorEl, key);
  }

  function init() {
    document.querySelectorAll("[data-cm]").forEach(wireCommentable);
    apiGet("/api/comments?page=" + encodeURIComponent(page)).then(function (rows) {
      allComments = rows;
      badges.forEach(function (b) { updateBadge(b.anchor, b.key); });
    });
    placeBadges();
    window.addEventListener("scroll", placeBadges);
    window.addEventListener("resize", placeBadges);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
