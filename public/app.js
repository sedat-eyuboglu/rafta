// Rafta istemci davranışları. htmx olmadan da sayfalar çalışır; bunlar yalnızca kolaylık.
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---- Bildirim ---------------------------------------------------------------
  let toastTimer;
  function toast(message, kind = "ok") {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2200);
  }

  // ---- Pano ---------------------------------------------------------------------
  // navigator.clipboard yalnızca güvenli bağlamda (https/localhost) var; yerel ağda
  // düz http ile açıldığında eski yönteme düşülür.
  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {}
    }
    return legacyCopy(text);
  }

  async function fetchSecret(url) {
    const res = await fetch(url, { headers: { Accept: "text/plain" }, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return res.text();
  }

  function flashCopied(btn) {
    btn.classList.add("copied");
    setTimeout(() => btn.classList.remove("copied"), 1200);
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy], [data-copy-url]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      let text = btn.dataset.copy;
      if (text === undefined) {
        // Safari, await sonrası pano erişimini reddeder; ClipboardItem'a promise verilir.
        if (window.ClipboardItem && navigator.clipboard?.write && window.isSecureContext) {
          const blob = fetchSecret(btn.dataset.copyUrl).then((t) => new Blob([t], { type: "text/plain" }));
          await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
          flashCopied(btn);
          toast("Şifre kopyalandı");
          return;
        }
        text = await fetchSecret(btn.dataset.copyUrl);
      }
      if (await copyText(text)) {
        flashCopied(btn);
        toast(btn.dataset.copyUrl ? "Şifre kopyalandı" : "Kopyalandı");
      } else {
        toast("Kopyalanamadı; tarayıcı pano erişimine izin vermedi", "error");
      }
    } catch {
      toast("Kopyalanamadı", "error");
    }
  });

  // ---- Şifre göster/gizle (detay sayfası) --------------------------------------
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-reveal]");
    if (!btn) return;
    const cell = btn.closest(".cred-secret");
    const code = cell && $(".secret code", cell);
    if (!code) return;
    if (btn.classList.contains("revealed")) {
      hideSecret(btn, code);
      return;
    }
    try {
      code.textContent = await fetchSecret(btn.dataset.reveal);
      code.classList.remove("masked");
      code.removeAttribute("aria-label");
      btn.classList.add("revealed");
      btn.setAttribute("aria-label", "Şifreyi gizle");
      btn.title = "Gizle";
      clearTimeout(btn._hideTimer);
      btn._hideTimer = setTimeout(() => hideSecret(btn, code), 30000);
    } catch {
      toast("Şifre alınamadı", "error");
    }
  });

  function hideSecret(btn, code) {
    clearTimeout(btn._hideTimer);
    code.textContent = "••••••••••";
    code.classList.add("masked");
    code.setAttribute("aria-label", "Gizli şifre");
    btn.classList.remove("revealed");
    btn.setAttribute("aria-label", "Şifreyi göster");
    btn.title = "Göster";
  }

  // ---- Dialoglar ----------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-open-dialog]");
    if (opener) {
      $(`#${opener.dataset.openDialog}`)?.showModal();
      return;
    }
    if (e.target.closest("[data-close-dialog]")) {
      e.target.closest("dialog")?.close();
      return;
    }
    // Arka plana tıklayınca kapat (dialog'un kendisi = backdrop alanı).
    if (e.target instanceof HTMLDialogElement && e.target.open) {
      const r = e.target.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) e.target.close();
    }
  });

  // Hızlı ekleme formu hatayla geri geldiğinde girilen şifre kaybolmasın. Sunucu şifreyi
  // HTML'e geri basmaz; değer yalnızca tarayıcıda tutulup yeni forma konur.
  let pendingSecret = "";
  document.addEventListener("htmx:beforeSwap", (e) => {
    if (e.detail.target.id === "quick-add") pendingSecret = $("#qa-secret")?.value ?? "";
  });
  document.addEventListener("htmx:afterSwap", (e) => {
    if (e.detail.target.id !== "quick-add") return;
    const secret = $("#qa-secret");
    if (secret && pendingSecret && !secret.value) secret.value = pendingSecret;
    pendingSecret = "";
    $("#quick-add [aria-invalid='true']")?.focus();
  });

  // htmx dialog içeriğini yüklediğinde dialog'u aç ve ilk alana odaklan.
  document.addEventListener("htmx:afterSwap", (e) => {
    const dialog = e.detail.target.closest?.("dialog");
    if (dialog) {
      if (!dialog.open) dialog.showModal();
      const focus = $("[aria-invalid='true'], [autofocus]", dialog);
      focus?.focus();
    }
  });

  // Boş filtre alanları adres çubuğuna "?provider=&tag=" olarak düşmesin.
  document.addEventListener("htmx:configRequest", (e) => {
    if (e.detail.verb !== "get") return;
    const fd = e.detail.formData;
    if (!fd) return;
    for (const [k, v] of Array.from(fd.entries())) if (v === "") fd.delete(k);
  });

  document.addEventListener("htmx:responseError", () => toast("İstek başarısız oldu", "error"));
  document.addEventListener("htmx:sendError", () => toast("Sunucuya ulaşılamadı", "error"));

  // ---- İki adımlı onay (dialog içindeki sil butonu) -----------------------------
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest("[data-confirm]");
      if (!btn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (btn.dataset.armed === "1") {
        if (window.htmx && btn.hasAttribute("hx-post")) htmx.trigger(btn, "confirmed");
        else btn.form?.requestSubmit(btn);
        return;
      }
      btn.dataset.armed = "1";
      btn.dataset.original = btn.innerHTML;
      btn.textContent = btn.dataset.confirm;
      btn.classList.add("armed");
      setTimeout(() => {
        if (!btn.isConnected) return;
        btn.dataset.armed = "";
        btn.innerHTML = btn.dataset.original;
        btn.classList.remove("armed");
      }, 4000);
    },
    true,
  );

  // ---- Giriş kodu: 6 hane yazılınca/yapıştırılınca kendiliğinden gönder ----------
  document.addEventListener("input", (e) => {
    const input = e.target.closest?.("[data-autosubmit]");
    if (!input || input.dataset.sent) return;
    if (/^\d{6}$/.test(input.value.replace(/\s/g, ""))) {
      input.dataset.sent = "1";
      input.form?.requestSubmit();
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-print]")) window.print();
  });

  // ---- Şifre alanı yardımcıları -------------------------------------------------
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle-password]");
    if (toggle) {
      const input = document.getElementById(toggle.dataset.togglePassword);
      if (input) input.type = input.type === "password" ? "text" : "password";
      return;
    }
    const gen = e.target.closest("[data-generate-password]");
    if (gen) {
      const input = document.getElementById(gen.dataset.generatePassword);
      if (!input) return;
      // Karışan karakterler (0/O, 1/l/I) yok; 20 karakter ≈ 115 bit.
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.!@#%+=";
      const bytes = crypto.getRandomValues(new Uint32Array(20));
      input.value = Array.from(bytes, (b) => chars[b % chars.length]).join("");
      input.type = "text";
      input.focus();
      input.select();
      // Şifreler sayfasında: üretilen şifre sitedeki kayıt formuna yapıştırılabilsin.
      if (gen.hasAttribute("data-copy-generated")) {
        copyText(input.value).then((ok) => ok && toast("Şifre üretildi ve kopyalandı"));
      }
    }
  });

  // ---- IP satırları (sunucu formu) ----------------------------------------------
  function ipRows() {
    return $$("[data-ip-rows] > tr:not(.row-error)");
  }
  function reindexIps() {
    const rows = ipRows();
    rows.forEach((tr, i) => {
      const radio = $("input[name='ip_primary']", tr);
      if (radio) radio.value = String(i);
    });
    if (rows.length && !$$("input[name='ip_primary']").some((r) => r.checked)) {
      const first = $("input[name='ip_primary']", rows[0]);
      if (first) first.checked = true;
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-add-ip]")) {
      const tpl = $("#ip-row-template");
      const body = $("[data-ip-rows]");
      if (!tpl || !body) return;
      const frag = tpl.content.cloneNode(true);
      const input = $("input[name='ip_address']", frag);
      body.appendChild(frag);
      reindexIps();
      input?.focus();
      return;
    }
    const remove = e.target.closest("[data-remove-ip]");
    if (remove) {
      const tr = remove.closest("tr");
      const err = tr.nextElementSibling?.classList.contains("row-error") ? tr.nextElementSibling : null;
      if (ipRows().length === 1) {
        $$("input:not([type=radio])", tr).forEach((i) => (i.value = ""));
        tr.classList.remove("has-error");
      } else {
        tr.remove();
      }
      err?.remove();
      reindexIps();
    }
  });

  // ---- Tablo satırının tamamı tıklanabilir --------------------------------------
  document.addEventListener("click", (e) => {
    const tr = e.target.closest("table.servers tbody tr");
    if (!tr || e.target.closest("a, button, input, select, label")) return;
    if (window.getSelection()?.toString()) return; // metin seçiliyorsa gezinme
    const link = $(".host-link", tr);
    if (!link) return;
    if (e.metaKey || e.ctrlKey) window.open(link.href, "_blank");
    else window.location.href = link.href;
  });

  // ---- Klavye kısayolları -------------------------------------------------------
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    const t = e.target;
    if (t.closest?.("input, textarea, select, [contenteditable]") || $("dialog[open]")) {
      if (e.key === "Escape" && t.id === "q" && t.value) {
        t.value = "";
        t.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    const target = $(`[data-shortcut="${CSS.escape(e.key.toLowerCase())}"]`);
    if (!target) return;
    e.preventDefault();
    if (target.matches("input")) {
      target.focus();
      target.select();
    } else target.click();
  });

  // ---- Tema ---------------------------------------------------------------------
  const THEMES = ["system", "light", "dark"];
  const THEME_LABEL = { system: "Tema: sistem", light: "Tema: açık", dark: "Tema: koyu" };
  function currentTheme() {
    return document.documentElement.dataset.theme || "system";
  }
  function applyTheme(t) {
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      t === "system" ? localStorage.removeItem("rafta-theme") : localStorage.setItem("rafta-theme", t);
    } catch {}
    $$("[data-theme-toggle]").forEach((b) => {
      b.setAttribute("aria-label", THEME_LABEL[t]);
      b.title = THEME_LABEL[t];
      b.dataset.current = t;
    });
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-theme-toggle]")) return;
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    applyTheme(next);
  });

  // ---- Sayfa açılışı ------------------------------------------------------------
  function init() {
    applyTheme(currentTheme());
    // Bildirim parametresi yenilemede tekrar görünmesin.
    const url = new URL(location.href);
    if (url.searchParams.has("ok")) {
      url.searchParams.delete("ok");
      url.searchParams.delete("new");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
    const alert = $("[data-autofocus]");
    if (alert) {
      const firstInvalid = $("[aria-invalid='true']");
      (firstInvalid || alert).focus();
      alert.scrollIntoView({ block: "center" });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
