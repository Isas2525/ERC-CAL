/* ERC-CAL frontend.
 *
 * Plain JS, no build step. All brand rules come from GET /api/brands, so
 * the client-side validation here always mirrors the server's. The server
 * re-validates everything; client checks only give instant feedback.
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    brands: [],
    brand: null,          // currently selected brand object
    tab: "find",
  };

  // ---- Helpers -------------------------------------------------------------

  /** Same normalization as the server: drop spaces/dashes/dots, upper-case. */
  const stripSeparators = (raw) => (raw || "").replace(/[\s.-]/g, "");
  const normalize = (raw) => stripSeparators(raw).toUpperCase();

  /** Returns an error string, or "" when the identifier is valid for the brand. */
  function validateIdentifier(brand, raw) {
    const value = normalize(raw);
    if (!value) return "";  // empty is "not yet", not an error, while typing
    // Check before upper-casing: toUpperCase() turns "ß" into "SS".
    const bad = [...new Set([...stripSeparators(raw)].filter((c) => !/^[0-9A-Za-z]$/.test(c)))];
    if (bad.length) return `Invalid character(s): ${bad.join(" ")}. ${brand.requirement}`;
    if (brand.min_len === brand.max_len && value.length !== brand.min_len) {
      return `Expected exactly ${brand.min_len} characters (you have ${value.length}).`;
    }
    if (value.length < brand.min_len) return `Too short — minimum ${brand.min_len} characters.`;
    if (value.length > brand.max_len) return `Too long — maximum ${brand.max_len} characters.`;
    if (!new RegExp(brand.pattern).test(value)) {
      if (brand.pattern.startsWith("^[0-9A-F]")) {
        const nonHex = [...new Set([...value].filter((c) => !/[0-9A-F]/.test(c)))];
        if (nonHex.length) return `Not hexadecimal: ${nonHex.join(" ")}. Only 0-9 and A-F are allowed.`;
      }
      return `Unrecognized format. ${brand.requirement}`;
    }
    return "";
  }

  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        // When the login expires, Cloudflare Access answers with a redirect
        // to its sign-in page; catch it instead of following it.
        redirect: "manual",
        ...options,
      });
    } catch (_) {
      throw new Error("Can't reach the server. Check your connection and try again.");
    }
    if (res.type === "opaqueredirect" || res.status === 401) {
      const err = new Error("Your sign-in has expired. Reload the page to sign in again.");
      err.expired = true;
      throw err;
    }
    let body = null;
    try { body = await res.json(); } catch (_) { /* non-JSON body */ }
    if (!res.ok) {
      const err = new Error((body && body.error) || `Request failed (${res.status}).`);
      err.field = body && body.field;
      throw err;
    }
    return body;
  }

  function setLoading(button, loading, idleLabel) {
    button.disabled = loading;
    button.innerHTML = loading
      ? `<svg class="spinner h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".25" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><span>Working…</span>`
      : `<span class="label">${idleLabel}</span>`;
  }

  let toastTimer;
  function toast(message) {
    $("toastInner").textContent = message;
    const el = $("toast");
    el.classList.remove("opacity-0");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("opacity-0"), 1800);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Fallback for insecure contexts / older browsers.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) {}
      ta.remove();
      return ok;
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // ---- Input field wiring --------------------------------------------------

  const INPUT_OK = ["border-slate-300", "dark:border-white/10"];
  const INPUT_BAD = ["border-rose-500", "dark:border-rose-500"];
  const INPUT_GOOD = ["border-accent-500", "dark:border-accent-500"];

  function paintInput(input, status) {
    input.classList.remove(...INPUT_OK, ...INPUT_BAD, ...INPUT_GOOD);
    input.classList.add(...(status === "bad" ? INPUT_BAD : status === "good" ? INPUT_GOOD : INPUT_OK));
    input.setAttribute("aria-invalid", status === "bad" ? "true" : "false");
  }

  function showError(node, message) {
    node.textContent = message || "";
    node.classList.toggle("hidden", !message);
  }

  /** Live-validate an identifier input; returns true when valid. */
  function checkIdentifier(input, counter, errorNode, { final = false } = {}) {
    const brand = state.brand;
    if (!brand) return false;
    const value = normalize(input.value);
    counter.textContent = brand.min_len === brand.max_len
      ? `${value.length}/${brand.max_len}`
      : `${value.length} chars`;

    if (!value) {
      paintInput(input, "idle");
      showError(errorNode, final ? `Please enter the ${brand.identifier_noun}.` : "");
      return false;
    }
    let message = validateIdentifier(brand, input.value);
    // While typing, don't nag about "too short" — only on submit.
    if (!final && message && value.length < brand.min_len && !/Invalid|Not hex/.test(message)) {
      paintInput(input, "idle");
      showError(errorNode, "");
      return false;
    }
    paintInput(input, message ? "bad" : "good");
    showError(errorNode, message);
    return !message;
  }

  // ---- Brand selection & guide --------------------------------------------

  const CHIP_BASE = "brand-chip flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition ";
  const CHIP = {
    off: CHIP_BASE + "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20",
    on: CHIP_BASE + "border-transparent bg-white ring-2 ring-accent-500 dark:bg-white/[0.03]",
  };
  const BADGE_BASE = "grid h-8 w-8 place-items-center rounded-lg text-sm font-bold ";
  const BADGE = {
    off: BADGE_BASE + "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
    on: BADGE_BASE + "bg-accent-500 text-white dark:text-slate-950",
  };

  function renderBrands() {
    const grid = $("brandGrid");
    grid.innerHTML = "";
    for (const b of state.brands) {
      const btn = el("button");
      btn.type = "button";
      btn.setAttribute("role", "radio");
      btn.dataset.brand = b.key;
      btn.className = CHIP.off;
      const badge = el("span", BADGE.off, b.icon);
      btn.append(badge, el("span", "", b.name));
      btn.addEventListener("click", () => selectBrand(b.key));
      grid.append(btn);
    }
  }

  function selectBrand(key) {
    const brand = state.brands.find((b) => b.key === key);
    if (!brand) return;
    state.brand = brand;
    try { localStorage.setItem("erc-cal-brand", key); } catch (_) {}

    for (const chip of document.querySelectorAll(".brand-chip")) {
      const on = chip.dataset.brand === key;
      chip.setAttribute("aria-checked", on ? "true" : "false");
      // Swap whole class sets: two competing utilities on one element
      // (e.g. bg-slate-100 and bg-accent-500) resolve by stylesheet order,
      // not by which was added last.
      chip.className = on ? CHIP.on : CHIP.off;
      chip.firstElementChild.className = on ? BADGE.on : BADGE.off;
    }

    // Guide
    $("guideTitle").textContent = `How to find your ${brand.name} ${brand.identifier_noun}`;
    const steps = $("guideSteps");
    steps.innerHTML = "";
    brand.retrieval_steps.forEach((text, i) => {
      const li = el("li", "flex gap-3");
      li.append(
        el("span", "grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-500/15 text-[11px] font-semibold text-accent-600 dark:text-accent-400", String(i + 1)),
        el("span", "", text),
      );
      steps.append(li);
    });
    const note = $("guideNote");
    note.textContent = brand.note || "";
    note.classList.toggle("hidden", !brand.note);

    // Inputs
    for (const prefix of ["find", "save"]) {
      $(`${prefix}Label`).textContent = brand.identifier_label;
      const input = $(`${prefix}Identifier`);
      input.placeholder = brand.placeholder;
      input.maxLength = brand.max_len + 8;  // allow typed separators
      $(`${prefix}Hint`).textContent = brand.requirement;
      checkIdentifier(input, $(`${prefix}Counter`), $(prefix === "find" ? "findError" : "saveIdError"));
    }
    $("result").innerHTML = "";
  }

  // ---- Tabs ----------------------------------------------------------------

  function setTab(tab) {
    state.tab = tab;
    for (const t of document.querySelectorAll(".tab")) {
      const on = t.dataset.tab === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.classList.toggle("bg-white", on);
      t.classList.toggle("shadow-sm", on);
      t.classList.toggle("dark:bg-white/10", on);
      t.classList.toggle("text-slate-500", !on);
      t.classList.toggle("dark:text-slate-400", !on);
    }
    $("panel-find").classList.toggle("hidden", tab !== "find");
    $("panel-save").classList.toggle("hidden", tab !== "save");
  }

  // ---- Result rendering ----------------------------------------------------

  function renderFound(data) {
    const card = el("div",
      "fade-in rounded-2xl border border-accent-500/30 bg-accent-500/[0.06] p-5 dark:bg-accent-500/[0.08]");
    card.append(el("p", "text-xs font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400", "Unlock code"));

    const row = el("div", "mt-2 flex items-center justify-between gap-3");
    const code = el("p", "break-all font-mono text-3xl font-bold tracking-[0.2em] sm:text-4xl", data.code);
    code.id = "resultCode";
    const copy = el("button",
      "shrink-0 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600 dark:text-slate-950",
      "Copy");
    copy.type = "button";
    copy.id = "copyBtn";
    copy.addEventListener("click", async () => {
      const ok = await copyText(data.code);
      toast(ok ? "Copied to clipboard" : "Couldn't copy — select the code manually");
      if (ok) {
        copy.textContent = "Copied ✓";
        setTimeout(() => { copy.textContent = "Copy"; }, 1500);
      }
    });
    row.append(code, copy);
    card.append(row);

    const meta = el("dl", "mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm");
    const add = (k, v) => {
      if (v == null || v === "") return;
      meta.append(el("dt", "text-slate-500 dark:text-slate-400", k), el("dd", "break-words", String(v)));
    };
    add("Identifier", data.identifier);
    add("Vehicle", [data.model, data.model_year].filter(Boolean).join(" · "));
    add("Notes", data.notes);
    add("Source", data.source === "local" ? "Your vault" : data.source);
    card.append(meta);
    return card;
  }

  function renderNotFound(data) {
    const card = el("div",
      "fade-in rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/[0.07] dark:text-amber-100");
    card.append(el("p", "font-semibold", "No code stored for this unit"));
    card.append(el("p", "mt-1 text-sm opacity-90", data.message));
    const btn = el("button",
      "mt-4 rounded-xl border border-amber-400/60 px-4 py-2 text-sm font-semibold transition hover:bg-amber-100 dark:hover:bg-amber-400/10",
      "Save a code for this unit");
    btn.type = "button";
    btn.addEventListener("click", () => {
      $("saveIdentifier").value = data.identifier;
      setTab("save");
      checkIdentifier($("saveIdentifier"), $("saveCounter"), $("saveIdError"));
      $("saveCode").focus();
    });
    card.append(btn);
    return card;
  }

  function renderError(message) {
    const card = el("div",
      "fade-in rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-400/25 dark:bg-rose-400/[0.07] dark:text-rose-200");
    card.setAttribute("role", "alert");
    card.textContent = message;
    return card;
  }

  // ---- Forms ---------------------------------------------------------------

  async function onFind(e) {
    e.preventDefault();
    const input = $("findIdentifier");
    const result = $("result");
    if (!state.brand) { result.replaceChildren(renderError("Please choose a brand first.")); return; }
    if (!checkIdentifier(input, $("findCounter"), $("findError"), { final: true })) { input.focus(); return; }

    const button = $("findSubmit");
    setLoading(button, true);
    result.innerHTML = "";
    try {
      const data = await api("/api/lookup", {
        method: "POST",
        body: JSON.stringify({ brand: state.brand.key, identifier: input.value }),
      });
      result.replaceChildren(data.found ? renderFound(data) : renderNotFound(data));
    } catch (err) {
      if (err.field === "identifier") {
        paintInput(input, "bad");
        showError($("findError"), err.message);
      } else {
        result.replaceChildren(renderError(err.message));
      }
    } finally {
      setLoading(button, false, "Find unlock code");
    }
  }

  async function onSave(e) {
    e.preventDefault();
    const out = $("saveResult");
    if (!state.brand) { out.replaceChildren(renderError("Please choose a brand first.")); return; }

    const idInput = $("saveIdentifier");
    const codeInput = $("saveCode");
    const yearInput = $("saveYear");
    let ok = checkIdentifier(idInput, $("saveCounter"), $("saveIdError"), { final: true });

    const code = codeInput.value.trim();
    if (!code) { showError($("saveCodeError"), "Please enter the unlock code."); paintInput(codeInput, "bad"); ok = false; }
    else if (!/^[0-9A-Za-z-]{1,32}$/.test(code)) { showError($("saveCodeError"), "Use only letters, digits and dashes."); paintInput(codeInput, "bad"); ok = false; }
    else { showError($("saveCodeError"), ""); paintInput(codeInput, "idle"); }

    const yearRaw = yearInput.value.trim();
    let year = null;
    if (yearRaw) {
      year = Number(yearRaw);
      if (!/^\d{4}$/.test(yearRaw) || year < 1980 || year > 2100) {
        showError($("saveYearError"), "Year must be a 4-digit year, e.g. 2019.");
        paintInput(yearInput, "bad");
        ok = false;
      } else { showError($("saveYearError"), ""); paintInput(yearInput, "idle"); }
    } else { showError($("saveYearError"), ""); paintInput(yearInput, "idle"); }

    if (!ok) return;

    const button = $("saveSubmit");
    setLoading(button, true);
    out.innerHTML = "";
    try {
      const data = await api("/api/codes", {
        method: "POST",
        body: JSON.stringify({
          brand: state.brand.key,
          identifier: idInput.value,
          code,
          model: $("saveModel").value.trim() || null,
          model_year: year,
          notes: $("saveNotes").value.trim() || null,
        }),
      });
      const card = el("div",
        "fade-in rounded-2xl border border-accent-500/30 bg-accent-500/[0.06] p-4 text-sm dark:bg-accent-500/[0.08]");
      card.append(el("p", "font-semibold", data.message),
        el("p", "mt-1 text-slate-600 dark:text-slate-300",
          `${state.brand.name} · ${data.identifier} → ${data.code}`));
      out.replaceChildren(card);
      toast(data.message);
      codeInput.value = "";
    } catch (err) {
      const target = { identifier: "saveIdError", code: "saveCodeError", model_year: "saveYearError" }[err.field];
      if (target) showError($(target), err.message);
      else out.replaceChildren(renderError(err.message));
    } finally {
      setLoading(button, false, "Save code");
    }
  }

  // ---- Boot ----------------------------------------------------------------

  async function boot() {
    for (const t of document.querySelectorAll(".tab")) t.addEventListener("click", () => setTab(t.dataset.tab));
    setTab("find");

    $("themeToggle").addEventListener("click", () => {
      const dark = document.documentElement.classList.toggle("dark");
      try { localStorage.setItem("erc-cal-theme", dark ? "dark" : "light"); } catch (_) {}
    });

    $("findIdentifier").addEventListener("input", () =>
      checkIdentifier($("findIdentifier"), $("findCounter"), $("findError")));
    $("saveIdentifier").addEventListener("input", () =>
      checkIdentifier($("saveIdentifier"), $("saveCounter"), $("saveIdError")));
    $("findForm").addEventListener("submit", onFind);
    $("saveForm").addEventListener("submit", onSave);

    try {
      state.brands = await api("/api/brands");
    } catch (err) {
      $("brandGrid").innerHTML = "";
      showError($("brandsError"), `Couldn't load brands: ${err.message}`);
      return;
    }
    renderBrands();
    let saved = null;
    try { saved = localStorage.getItem("erc-cal-brand"); } catch (_) {}
    selectBrand(state.brands.some((b) => b.key === saved) ? saved : state.brands[0].key);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
