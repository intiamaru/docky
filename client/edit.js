(function () {
  var scriptEl = document.currentScript;
  var API_BASE = scriptEl.getAttribute("data-api");
  var page = scriptEl.getAttribute("data-page");
  var TOKEN_KEY = "ce_admin_token_" + page;

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  var style = document.createElement("style");
  style.textContent =
    ".ce-admin-btn{position:fixed;bottom:18px;right:18px;z-index:9999;" +
    "background:#2b2622;color:#f0e9d8;border:none;border-radius:999px;" +
    "width:44px;height:44px;font-size:18px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25);" +
    "display:flex;align-items:center;justify-content:center;opacity:.5;transition:opacity .15s}" +
    ".ce-admin-btn:hover{opacity:1}" +
    "body.ce-admin-on [data-ek]{outline:1px dashed transparent;cursor:text;border-radius:4px;transition:outline-color .15s,background-color .15s}" +
    "body.ce-admin-on [data-ek]:hover{outline-color:#c08a3e;background-color:rgba(192,138,62,.07)}" +
    "[data-ek][contenteditable=\"true\"]{outline:2px solid #c08a3e !important;background:#fffdf7;padding:2px 4px;border-radius:4px}" +
    ".ce-toolbar{position:absolute;z-index:10000;display:flex;gap:6px;background:#2b2622;padding:6px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.3)}" +
    ".ce-toolbar button{border:none;border-radius:6px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}" +
    ".ce-toolbar .ce-save{background:#3f6b54;color:#fff}" +
    ".ce-toolbar .ce-cancel{background:#5c534b;color:#f0e9d8}" +
    ".ce-toast{position:fixed;bottom:74px;right:18px;z-index:9999;background:#2b2622;color:#f0e9d8;" +
    "padding:10px 16px;border-radius:8px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.25);" +
    "opacity:0;transform:translateY(6px);transition:opacity .2s,transform .2s;max-width:260px}" +
    ".ce-toast.ce-show{opacity:1;transform:translateY(0)}" +
    ".ce-modal-backdrop{position:fixed;inset:0;background:rgba(20,15,10,.5);z-index:10001;display:flex;align-items:center;justify-content:center}" +
    ".ce-modal{background:#faf6f0;border-radius:14px;padding:26px;width:min(320px,90vw);box-shadow:0 20px 60px rgba(0,0,0,.4);font-family:'Inter',system-ui,sans-serif}" +
    ".ce-modal h3{margin:0 0 14px;font-family:'Cormorant Garamond',Georgia,serif;color:#2b2622;font-size:20px}" +
    ".ce-modal input{width:100%;padding:10px 12px;border:1px solid #e2d7c7;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:10px;font-family:inherit}" +
    ".ce-modal .ce-row{display:flex;gap:8px;justify-content:flex-end}" +
    ".ce-modal button{border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}" +
    ".ce-modal .ce-go{background:#2b2622;color:#f0e9d8}" +
    ".ce-modal .ce-cancel2{background:#e2d7c7;color:#2b2622}" +
    ".ce-modal .ce-err{color:#9c4a34;font-size:12.5px;margin:-4px 0 10px;min-height:1em}" +
    ".ce-section-del{display:none;position:absolute;z-index:500;" +
    "background:#9c4a34;color:#fff;border:none;border-radius:8px;width:34px;height:34px;" +
    "font-size:15px;cursor:pointer;opacity:.7;transition:opacity .15s;align-items:center;justify-content:center}" +
    "body.ce-admin-on .ce-section-del{display:flex}" +
    ".ce-section-del:hover{opacity:1}" +
    ".ce-toast .ce-undo{margin-left:8px;background:transparent;border:1px solid #f0e9d8;color:#f0e9d8;" +
    "border-radius:6px;padding:2px 9px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit}" +
    ".ce-toolbar .ce-msg{color:#f0e9d8;font-size:13px;padding:6px 4px;align-self:center;white-space:nowrap}";
  document.head.appendChild(style);

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "ce-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("ce-show"); });
    setTimeout(function () {
      t.classList.remove("ce-show");
      setTimeout(function () { t.remove(); }, 250);
    }, 2200);
  }

  function undoToast(msg, onUndo) {
    var t = document.createElement("div");
    t.className = "ce-toast";
    var msgSpan = document.createElement("span");
    msgSpan.textContent = msg;
    var undoBtn = document.createElement("button");
    undoBtn.className = "ce-undo";
    undoBtn.textContent = "Deshacer";
    t.appendChild(msgSpan);
    t.appendChild(undoBtn);
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("ce-show"); });
    var hide = function () {
      t.classList.remove("ce-show");
      setTimeout(function () { t.remove(); }, 250);
    };
    var timer = setTimeout(hide, 6000);
    undoBtn.addEventListener("click", function () {
      clearTimeout(timer);
      hide();
      onUndo();
    });
  }

  function sectionKey(id) { return "sec:" + id; }

  function hydrateContent() {
    fetch(API_BASE + "/api/content?page=" + encodeURIComponent(page))
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (data) {
        document.querySelectorAll("[data-ek]").forEach(function (el) {
          var key = el.getAttribute("data-ek");
          if (Object.prototype.hasOwnProperty.call(data, key)) {
            el.innerHTML = data[key];
          }
        });
        document.querySelectorAll("main section[id]").forEach(function (sec) {
          if (data[sectionKey(sec.id)] === "1") {
            sec.style.display = "none";
          }
        });
      })
      .catch(function (e) { console.warn("content hydrate failed", e); });
  }

  function showLoginModal() {
    var backdrop = document.createElement("div");
    backdrop.className = "ce-modal-backdrop";
    backdrop.innerHTML =
      '<div class="ce-modal">' +
      "<h3>Acceso admin</h3>" +
      '<div class="ce-err"></div>' +
      '<input type="password" placeholder="Contraseña">' +
      '<div class="ce-row">' +
      '<button class="ce-cancel2">Cancelar</button>' +
      '<button class="ce-go">Entrar</button>' +
      "</div></div>";
    document.body.appendChild(backdrop);
    var input = backdrop.querySelector("input");
    var errEl = backdrop.querySelector(".ce-err");
    input.focus();
    function close() { backdrop.remove(); }
    backdrop.querySelector(".ce-cancel2").addEventListener("click", close);
    backdrop.addEventListener("click", function (e) { if (e.target === backdrop) close(); });
    function submit() {
      var password = input.value;
      if (!password) return;
      fetch(API_BASE + "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password })
      })
        .then(function (res) {
          if (!res.ok) { errEl.textContent = "Contraseña incorrecta"; return null; }
          return res.json();
        })
        .then(function (data) {
          if (!data) return;
          setToken(data.token);
          close();
          enterAdminMode();
          toast("Modo edición activado");
        })
        .catch(function () { errEl.textContent = "Error de conexión"; });
    }
    backdrop.querySelector(".ce-go").addEventListener("click", submit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  }

  var activeEditor = null;

  // Watches for a click/mousedown outside all `containers` elements and calls
  // onOutside once. Registration is deferred to the next tick so the very
  // click that opened the editor doesn't immediately close it.
  function watchOutsideClick(containers, onOutside) {
    function handler(e) {
      for (var i = 0; i < containers.length; i++) {
        if (containers[i] && containers[i].contains(e.target)) return;
      }
      document.removeEventListener("mousedown", handler, true);
      onOutside();
    }
    var timer = setTimeout(function () {
      document.addEventListener("mousedown", handler, true);
    }, 0);
    return function () {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler, true);
    };
  }

  function makeToolbar(target, onSave, onCancel) {
    var bar = document.createElement("div");
    bar.className = "ce-toolbar";
    bar.innerHTML = '<button class="ce-save">Guardar</button><button class="ce-cancel">Cancelar</button>';
    document.body.appendChild(bar);
    function place() {
      var r = target.getBoundingClientRect();
      bar.style.top = (window.scrollY + r.top - 46) + "px";
      bar.style.left = (window.scrollX + r.left) + "px";
    }
    place();
    window.addEventListener("scroll", place);
    window.addEventListener("resize", place);
    function cleanup() {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      bar.remove();
    }
    bar.querySelector(".ce-save").addEventListener("click", function () { cleanup(); onSave(); });
    bar.querySelector(".ce-cancel").addEventListener("click", function () { cleanup(); onCancel(); });
    return { cleanup: cleanup, bar: bar };
  }

  function putContent(key, value) {
    var token = getToken();
    return fetch(API_BASE + "/api/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ page: page, key: key, value: value })
    });
  }

  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  // The API can be cold (Hostinger sleeps idle Node processes) — one transient
  // network failure or 502/503 doesn't mean the save actually failed, so retry
  // once before giving up.
  function saveField(key, value, isRetry) {
    return putContent(key, value).then(function (res) {
      if (res.status === 401) {
        clearToken();
        exitAdminMode();
        toast("Sesión vencida — volvé a entrar");
        return false;
      }
      if (res.status >= 500 && !isRetry) {
        return wait(1500).then(function () { return saveField(key, value, true); });
      }
      if (!res.ok) { toast("No se pudo guardar"); return false; }
      toast("Guardado");
      return true;
    }).catch(function () {
      if (!isRetry) {
        return wait(1500).then(function () { return saveField(key, value, true); });
      }
      toast("Error de conexión");
      return false;
    });
  }

  function wireEditable(el) {
    if (el.__ceWired) return;
    el.__ceWired = true;
    el.addEventListener("click", function () {
      if (!document.body.classList.contains("ce-admin-on")) return;
      if (activeEditor) return;
      var key = el.getAttribute("data-ek");
      var original = el.innerHTML;
      el.setAttribute("contenteditable", "true");
      el.focus();
      var sel = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);

      var stopWatching = null;

      function finishEdit(shouldSave) {
        if (stopWatching) stopWatching();
        toolbar.cleanup();
        el.removeAttribute("contenteditable");
        activeEditor = null;
        if (shouldSave) {
          var newValue = el.innerHTML;
          if (newValue !== original) {
            saveField(key, newValue).then(function (ok) {
              if (!ok) el.innerHTML = original;
            });
          }
        } else {
          el.innerHTML = original;
        }
      }

      var toolbar = makeToolbar(
        el,
        function () { finishEdit(true); },
        function () { finishEdit(false); }
      );

      stopWatching = watchOutsideClick([el, toolbar.bar], function () { finishEdit(false); });

      activeEditor = { key: key, el: el, toolbar: toolbar };
    });
  }

  function confirmDeleteSection(sec, anchorBtn) {
    if (activeEditor) return;
    var bar = document.createElement("div");
    bar.className = "ce-toolbar";
    bar.innerHTML =
      '<span class="ce-msg">¿Eliminar esta sección?</span>' +
      '<button class="ce-save">Confirmar</button><button class="ce-cancel">Cancelar</button>';
    document.body.appendChild(bar);
    function place() {
      var r = anchorBtn.getBoundingClientRect();
      bar.style.top = (window.scrollY + r.bottom + 8) + "px";
      bar.style.left = (window.scrollX + r.right - bar.offsetWidth) + "px";
    }
    place();
    window.addEventListener("scroll", place);
    window.addEventListener("resize", place);
    var stopWatching = null;
    function cleanup() {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      if (stopWatching) stopWatching();
      bar.remove();
      activeEditor = null;
    }
    activeEditor = { section: sec };
    bar.querySelector(".ce-save").addEventListener("click", function () {
      cleanup();
      deleteSection(sec);
    });
    bar.querySelector(".ce-cancel").addEventListener("click", cleanup);
    stopWatching = watchOutsideClick([bar, anchorBtn], cleanup);
  }

  function deleteSection(sec) {
    var key = sectionKey(sec.id);
    sec.style.display = "none";
    saveField(key, "1");
    updateSectionButtonPositions();
    undoToast("Sección eliminada", function () {
      sec.style.display = "";
      saveField(key, "0");
      updateSectionButtonPositions();
    });
  }

  var sectionButtons = [];

  function updateSectionButtonPositions() {
    sectionButtons.forEach(function (item) {
      if (item.sec.style.display === "none") {
        item.btn.style.display = "none";
        return;
      }
      if (document.body.classList.contains("ce-admin-on")) item.btn.style.display = "flex";
      var r = item.sec.getBoundingClientRect();
      item.btn.style.top = (window.scrollY + r.top + 10) + "px";
      item.btn.style.left = (window.scrollX + r.right - 44) + "px";
    });
  }

  window.addEventListener("scroll", function () {
    if (document.body.classList.contains("ce-admin-on")) updateSectionButtonPositions();
  });
  window.addEventListener("resize", function () {
    if (document.body.classList.contains("ce-admin-on")) updateSectionButtonPositions();
  });

  function wireSectionControls() {
    document.querySelectorAll("main section[id]").forEach(function (sec) {
      if (sec.__ceSectionWired) return;
      sec.__ceSectionWired = true;
      var delBtn = document.createElement("button");
      delBtn.className = "ce-section-del";
      delBtn.title = "Eliminar sección";
      delBtn.textContent = "🗑";
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        confirmDeleteSection(sec, delBtn);
      });
      document.body.appendChild(delBtn);
      sectionButtons.push({ sec: sec, btn: delBtn });
    });
    updateSectionButtonPositions();
  }

  function enterAdminMode() {
    document.body.classList.add("ce-admin-on");
    document.querySelectorAll("[data-ek]").forEach(wireEditable);
    wireSectionControls();
    var btn = document.querySelector(".ce-admin-btn");
    if (btn) btn.textContent = "🔓";
  }

  function exitAdminMode() {
    document.body.classList.remove("ce-admin-on");
    sectionButtons.forEach(function (item) { item.btn.style.display = "none"; });
    var btn = document.querySelector(".ce-admin-btn");
    if (btn) btn.textContent = "🔒";
  }

  function checkSession() {
    var token = getToken();
    if (!token) return Promise.resolve(false);
    return fetch(API_BASE + "/api/session", { headers: { "Authorization": "Bearer " + token } })
      .then(function (res) { return res.ok; })
      .catch(function () { return false; });
  }

  function init() {
    hydrateContent();
    var btn = document.createElement("button");
    btn.className = "ce-admin-btn";
    btn.textContent = "🔒";
    btn.title = "Modo edición";
    btn.addEventListener("click", function () {
      if (document.body.classList.contains("ce-admin-on")) {
        clearToken();
        exitAdminMode();
        toast("Saliste del modo edición");
      } else {
        checkSession().then(function (valid) {
          if (valid) enterAdminMode();
          else showLoginModal();
        });
      }
    });
    document.body.appendChild(btn);
    checkSession().then(function (valid) { if (valid) enterAdminMode(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
