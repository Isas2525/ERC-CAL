/* Small DOM helpers and the shared look of the app. */

import { findMake } from "./shared/rules.js";
import { vehicleStatus } from "./shared/units.js";

/**
 * h("a", { class: "x", href: "#/", onclick: fn }, "text", child, [more])
 * Strings become text nodes (never HTML); null/false children are skipped.
 */
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k in node && typeof v !== "string") node[k] = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// ---- Icons (static markup, never user data) --------------------------------

const PATHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  car: '<path d="M5 17h14M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4a1 1 0 0 1-1 1h-1M4 18H3a1 1 0 0 1-1-1v-4h20"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  wand: '<path d="M4 20 15 9M14 4v3M19 9h-3M17.5 5.5l-2 2M9 4l.5 1.5L11 6l-1.5.5L9 8l-.5-1.5L7 6l1.5-.5z"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
};

export function icon(name, cls = "h-4 w-4") {
  const span = document.createElement("span");
  span.className = "inline-flex shrink-0";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
  return span;
}

// ---- Shared class sets ------------------------------------------------------

export const cls = {
  card: "rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
  label: "mb-1.5 block text-sm font-medium",
  hint: "mt-1.5 text-xs text-muted",
  error: "mt-1.5 text-xs font-medium text-danger",
  input:
    "w-full rounded-xl border border-line-strong bg-field px-3.5 py-2.5 text-base outline-none transition " +
    "placeholder:text-faint focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 " +
    "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15",
  mono: "font-mono tracking-wider",
  // Typed codes are monospace; the hint text inside the box shouldn't be.
  monoPlaceholder: "uppercase placeholder:normal-case placeholder:font-sans placeholder:tracking-normal",
  btn:
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition " +
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-500/30 disabled:cursor-not-allowed disabled:opacity-50",
  primary: "bg-accent-600 text-white hover:bg-accent-700 shadow-sm",
  secondary: "border border-line-strong bg-surface hover:bg-hover",
  ghost: "text-muted hover:bg-hover hover:text-ink",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
  sectionTitle: "text-xs font-semibold uppercase tracking-[0.12em] text-muted",
};

export const button = (variant, attrs, ...children) =>
  h(attrs.href ? "a" : "button", { type: attrs.href ? null : "button", ...attrs, class: `${cls.btn} ${cls[variant]} ${attrs.class || ""}` }, ...children);

// ---- Feedback ---------------------------------------------------------------

let toastTimer;
export function toast(message) {
  const el = document.getElementById("toast");
  el.firstElementChild.textContent = message;
  el.classList.remove("opacity-0", "translate-y-2");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("opacity-0", "translate-y-2"), 2200);
}

export async function copyText(text, what = "Copied") {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    // Fallback for browsers without the async clipboard.
    const ta = h("textarea", { readonly: true, class: "fixed opacity-0" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try { ok = document.execCommand("copy"); } catch { /* ignore */ }
    ta.remove();
  }
  toast(ok ? `${what} to clipboard` : "Couldn't copy. Select it and copy manually.");
  return ok;
}

/** Native <dialog> confirmation. Resolves true when confirmed. */
export function confirmDialog({ title, body, confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const dialog = h("dialog", {
      class: "m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50",
    });
    const close = (result) => { dialog.close(); dialog.remove(); resolve(result); };
    dialog.append(
      h("div", { class: "p-6" },
        h("h2", { class: "text-lg font-semibold" }, title),
        h("p", { class: "mt-2 text-sm text-muted" }, body)),
      h("div", { class: "flex justify-end gap-2 border-t border-line px-6 py-4" },
        button("secondary", { onclick: () => close(false) }, "Cancel"),
        button(danger ? "danger" : "primary", { onclick: () => close(true), autofocus: true }, confirmLabel)),
    );
    dialog.addEventListener("cancel", (e) => { e.preventDefault(); close(false); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

// ---- Vehicle presentation ---------------------------------------------------

export function vehicleTitle(v) {
  if (v.nickname) return v.nickname;
  const make = findMake(v.make)?.name;
  return [v.model_year, make === "Other" ? null : make, v.model].filter(Boolean).join(" ") || "Unnamed vehicle";
}

export function vehicleSubtitle(v) {
  if (!v.nickname) return null;
  const make = findMake(v.make)?.name;
  return [v.model_year, make === "Other" ? null : make, v.model].filter(Boolean).join(" ") || null;
}

const PILL = {
  unlocked: "bg-ok/12 text-ok ring-ok/25",
  ready: "bg-accent-500/12 text-accent-700 ring-accent-500/25 dark:text-accent-300",
  missing: "bg-warn/12 text-warn ring-warn/25",
};

export function statusPill(v) {
  const s = vehicleStatus(v);
  return h("span", { class: `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${PILL[s.key]}` },
    h("span", { class: "h-1.5 w-1.5 rounded-full bg-current" }), s.label);
}

export function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export const mask = (code) => "•".repeat(Math.min(Math.max(code.length, 4), 12));
