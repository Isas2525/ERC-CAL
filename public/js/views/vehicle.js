/* One vehicle: its unlock code, or the steps to get one; details; history. */

import { api, editable } from "../api.js";
import { checkCode, checkErc, checkSerial, CODE_SOURCES, findMake, findSource } from "../shared/rules.js";
import { findUnit, usesErc, vehicleStatus } from "../shared/units.js";
import {
  button, cls, confirmDialog, copyText, formatDate, h, icon, mask, statusPill, toast, vehicleSubtitle, vehicleTitle,
} from "../ui.js";

/** Plain-text summary to hand a dealer or code service. */
export function requestText(v) {
  const unit = findUnit(v.unit_brand);
  const vehicle = [v.model_year, findMake(v.make)?.name, v.model].filter(Boolean).join(" ");
  return [
    "Infotainment unlock code request",
    "",
    `Vehicle: ${vehicle || "-"}`,
    `VIN / chassis number: ${v.vin}`,
    `Head unit: ${unit?.name || "-"}${v.unit_model ? ` ${v.unit_model}` : ""}`,
    `Unit serial: ${v.unit_serial || "-"}`,
    v.erc ? `ERC: ${v.erc}` : null,
    "",
    "I'm the registered owner and can provide the registration and photo ID.",
  ].filter((l) => l !== null).join("\n");
}

function copyButton(text, what) {
  return h("button", {
    type: "button",
    class: "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink",
    "aria-label": `Copy ${what}`,
    title: `Copy ${what}`,
    onclick: () => copyText(text, `${what} copied`),
  }, icon("copy"));
}

function detailRow(label, value, { mono = false, copy = null } = {}) {
  return h("div", { class: "flex items-center justify-between gap-3 py-2.5" },
    h("dt", { class: "text-sm text-muted" }, label),
    h("dd", { class: "flex min-w-0 items-center gap-1 text-right text-sm" },
      h("span", { class: `${mono ? cls.mono : ""} break-all ${value ? "" : "text-faint"}` }, value || "Not set"),
      value && copy ? copyButton(value, copy) : null));
}

function codeCard(v) {
  let shown = false;
  const code = h("p", { class: `${cls.mono} break-all text-3xl font-bold sm:text-4xl`, "aria-live": "polite" }, mask(v.unlock_code));
  const toggle = button("secondary", {
    "aria-pressed": "false",
    onclick: () => {
      shown = !shown;
      code.textContent = shown ? v.unlock_code : mask(v.unlock_code);
      toggle.replaceChildren(icon(shown ? "eyeOff" : "eye"), shown ? "Hide" : "Show");
      toggle.setAttribute("aria-pressed", String(shown));
    },
  }, icon("eye"), "Show");
  const unit = findUnit(v.unit_brand);
  return h("section", { class: "fade-in rounded-2xl border border-ok/30 bg-ok/[0.06] p-5 sm:p-6", "aria-label": "Unlock code" },
    h("p", { class: "text-xs font-semibold uppercase tracking-[0.12em] text-ok" }, "Unlock code"),
    h("div", { class: "mt-3 flex flex-wrap items-center justify-between gap-4" },
      code,
      h("div", { class: "flex gap-2" },
        toggle,
        button("primary", { onclick: () => copyText(v.unlock_code, "Code copied") }, icon("copy"), "Copy"))),
    h("p", { class: "mt-4 text-xs text-muted" },
      [findSource(v.code_source)?.name, v.code_saved_at && `saved ${formatDate(v.code_saved_at)}`].filter(Boolean).join(" · ") || null),
    unit?.tips?.length ? h("p", { class: "mt-2 text-xs text-muted" }, unit.tips[0]) : null);
}

/** The guided path from "locked" to "code saved". */
function nextSteps(v, save) {
  const unit = findUnit(v.unit_brand) || findUnit("other");
  const needsErc = unit.needs === "erc";
  const haveId = needsErc ? Boolean(v.erc) : Boolean(v.unit_serial || v.erc);

  const step = (n, done, title, ...body) => h("li", { class: "relative flex gap-4 pb-8 last:pb-0" },
    h("span", { class: "absolute left-4 top-9 bottom-1 w-px bg-line [li:last-child>&]:hidden", "aria-hidden": "true" }),
    h("span", {
      class: `relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${done ? "bg-ok text-white" : "bg-hover text-muted ring-1 ring-line-strong"}`,
    }, done ? icon("check") : String(n)),
    h("div", { class: "min-w-0 flex-1 pt-1" },
      h("p", { class: "font-medium" }, title, done ? h("span", { class: "sr-only" }, " (done)") : null),
      h("div", { class: "mt-2 space-y-3 text-sm text-muted" }, ...body)));

  // Step 2: read the identifier off the unit, and save it right here.
  const idField = needsErc ? "erc" : "unit_serial";
  const idInput = h("input", {
    class: `${cls.input} ${cls.mono} ${cls.monoPlaceholder}`,
    placeholder: needsErc ? "16 characters, 0-9 and A-F" : "As printed on the label",
    "aria-label": needsErc ? "ERC" : "Unit serial",
    autocomplete: "off", autocapitalize: "characters", spellcheck: "false",
  });
  const idError = h("p", { class: `${cls.error} hidden`, role: "alert" });
  const saveId = async (e) => {
    e.preventDefault();
    const res = (needsErc ? checkErc : checkSerial)(idInput.value);
    if (res.error || !res.value) {
      idError.textContent = res.error || "Enter it first.";
      idError.classList.remove("hidden");
      idInput.setAttribute("aria-invalid", "true");
      return;
    }
    await save({ [idField]: res.value }, needsErc ? "ERC saved" : "Serial saved");
  };
  const guideSteps = needsErc ? unit.find_erc : unit.find_serial;

  // Step 4: store the issued code.
  const codeInput = h("input", {
    class: `${cls.input} ${cls.mono} ${cls.monoPlaceholder}`, placeholder: "e.g. 1A2B3C4D", "aria-label": "Unlock code",
    autocomplete: "off", autocapitalize: "characters", spellcheck: "false", maxlength: "40",
  });
  const sourceSelect = h("select", { class: cls.input, "aria-label": "Where the code came from" },
    h("option", { value: "" }, "Where did it come from?"),
    CODE_SOURCES.map((s) => h("option", { value: s.key }, s.name)));
  const codeError = h("p", { class: `${cls.error} hidden`, role: "alert" });
  const saveCode = async (e) => {
    e.preventDefault();
    const res = checkCode(codeInput.value);
    if (res.error || !res.value) {
      codeError.textContent = res.error || "Enter the code you were issued.";
      codeError.classList.remove("hidden");
      codeInput.setAttribute("aria-invalid", "true");
      return;
    }
    await save({ unlock_code: res.value, code_source: sourceSelect.value || null }, "Unlock code saved");
  };

  const mailto = `mailto:?subject=${encodeURIComponent("Infotainment unlock code request")}&body=${encodeURIComponent(requestText(v))}`;

  return h("section", { class: `${cls.card} fade-in p-5 sm:p-6`, "aria-labelledby": "steps-title" },
    h("div", { class: "flex flex-wrap items-baseline justify-between gap-2" },
      h("h2", { id: "steps-title", class: "text-lg font-semibold" }, "Get your unlock code"),
      h("a", { href: `#/guides/${unit.key}`, class: "text-sm font-medium text-accent-600 hover:underline dark:text-accent-300" }, `${unit.name} guide`)),
    h("p", { class: "mt-1 text-sm text-muted" }, "Work through these in order. Each step saves as you go."),
    h("ol", { class: "mt-6" },
      step(1, true, "Vehicle identified", h("p", {}, "VIN / chassis number ", h("span", { class: `${cls.mono} text-ink` }, v.vin))),

      step(2, haveId, needsErc ? "Show the ERC on the unit" : "Find the unit's serial number",
        haveId
          ? h("p", {}, needsErc ? "ERC " : "Serial ", h("span", { class: `${cls.mono} text-ink` }, needsErc ? v.erc : v.unit_serial || v.erc))
          : [
            h("ol", { class: "list-decimal space-y-1.5 pl-5" }, guideSteps.map((s) => h("li", {}, s))),
            needsErc && unit.erc_note ? h("p", { class: "text-xs" }, unit.erc_note) : null,
            h("form", { class: "flex flex-col gap-2 sm:flex-row", onsubmit: saveId, novalidate: true },
              h("div", { class: "flex-1" }, idInput, idError),
              button("primary", { type: "submit", class: "self-start" }, needsErc ? "Save ERC" : "Save serial")),
          ]),

      step(3, false, "Request the code",
        h("ul", { class: "list-disc space-y-1.5 pl-5" }, unit.get_code.map((s) => h("li", {}, s))),
        h("div", { class: "flex flex-wrap gap-2" },
          unit.official && button("secondary", { href: unit.official.url, target: "_blank", rel: "noopener noreferrer" },
            unit.official.label, icon("external")),
          button("secondary", { onclick: () => copyText(requestText(v), "Request details copied") }, icon("copy"), "Copy request details"),
          button("secondary", { href: mailto }, icon("mail"), "Email a dealer"))),

      step(4, false, "Save the code you were issued",
        h("form", { class: "grid gap-2 sm:grid-cols-[1fr_1fr_auto]", onsubmit: saveCode, novalidate: true },
          h("div", {}, codeInput, codeError),
          sourceSelect,
          button("primary", { type: "submit", class: "self-start" }, "Save code")))));
}

function historyList(v) {
  if (!v.history.length) return null;
  return h("section", { class: `${cls.card} p-5 sm:p-6`, "aria-labelledby": "history-title" },
    h("h2", { id: "history-title", class: cls.sectionTitle }, "Code history"),
    h("ul", { class: "mt-3 divide-y divide-line" }, v.history.map((e, i) =>
      h("li", { class: "flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm" },
        h("span", { class: "flex items-center gap-2" },
          h("span", { class: `${cls.mono} font-semibold` }, e.unlock_code),
          i === 0 && e.unlock_code === v.unlock_code
            ? h("span", { class: "rounded-full bg-ok/12 px-2 py-0.5 text-[11px] font-medium text-ok" }, "Current") : null),
        h("span", { class: "text-xs text-muted" },
          [formatDate(e.recorded_at), findSource(e.code_source)?.name, e.erc && `ERC ${e.erc}`].filter(Boolean).join(" · "))))));
}

export async function renderVehicle(id) {
  const v = await api(`/api/vehicles/${id}`);
  const unit = findUnit(v.unit_brand);
  const root = h("div", { class: "fade-in space-y-6" });

  const rerender = async () => root.replaceWith(await renderVehicle(id));
  const save = async (changes, message) => {
    try {
      await api(`/api/vehicles/${id}`, { method: "PUT", body: { ...editable(v), ...changes } });
      toast(message);
      await rerender();
    } catch (err) {
      toast(err.message);
    }
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete ${vehicleTitle(v)}?`,
      body: "This removes the vehicle, its unlock code and its code history. Export a backup first if you might need them.",
      confirmLabel: "Delete vehicle",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/vehicles/${id}`, { method: "DELETE" });
      toast("Vehicle deleted");
      location.hash = "#/";
    } catch (err) {
      toast(err.message);
    }
  };

  const status = vehicleStatus(v);
  root.append(
    h("a", { href: "#/", class: "inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink" }, icon("back"), "Garage"),
    h("div", { class: "flex flex-wrap items-start justify-between gap-4" },
      h("div", { class: "min-w-0" },
        h("div", { class: "flex flex-wrap items-center gap-3" },
          h("h1", { class: "text-2xl font-semibold tracking-tight sm:text-3xl" }, vehicleTitle(v)),
          statusPill(v)),
        h("p", { class: "mt-1 text-sm text-muted" }, vehicleSubtitle(v) || `${unit?.name || "Unknown"} infotainment unit`)),
      h("div", { class: "flex gap-2" },
        button("secondary", { href: `#/v/${id}/edit` }, icon("edit"), "Edit"),
        button("danger", { onclick: remove, "aria-label": "Delete vehicle" }, icon("trash"), h("span", { class: "hidden sm:inline" }, "Delete")))),
  );

  root.append(status.key === "unlocked" ? codeCard(v) : nextSteps(v, save));

  const vehicleRows = h("dl", { class: "divide-y divide-line" },
    detailRow("Make", findMake(v.make)?.name),
    detailRow("Model", v.model),
    detailRow("Year", v.model_year && String(v.model_year)),
    detailRow("VIN / chassis no.", v.vin, { mono: true, copy: "VIN" }));
  const unitRows = h("dl", { class: "divide-y divide-line" },
    detailRow("Brand", unit?.name),
    detailRow("Model", v.unit_model, { mono: true }),
    detailRow("Serial", v.unit_serial, { mono: true, copy: "Serial" }),
    unit && usesErc(unit) || v.erc ? detailRow("ERC", v.erc, { mono: true, copy: "ERC" }) : null);

  root.append(h("div", { class: "grid gap-4 md:grid-cols-2" },
    h("section", { class: `${cls.card} px-5 py-4`, "aria-labelledby": "veh-title" },
      h("h2", { id: "veh-title", class: cls.sectionTitle }, "Vehicle"), vehicleRows),
    h("section", { class: `${cls.card} px-5 py-4`, "aria-labelledby": "unit-title" },
      h("h2", { id: "unit-title", class: cls.sectionTitle }, "Infotainment unit"), unitRows)));

  if (v.notes) {
    root.append(h("section", { class: `${cls.card} p-5`, "aria-labelledby": "notes-title" },
      h("h2", { id: "notes-title", class: cls.sectionTitle }, "Notes"),
      h("p", { class: "mt-2 whitespace-pre-wrap text-sm" }, v.notes)));
  }
  const history = historyList(v);
  if (history) root.append(history);

  if (status.key === "unlocked") {
    root.append(h("p", { class: "text-sm text-muted" }, "Got a new code? ",
      h("a", { href: `#/v/${id}/edit`, class: "font-medium text-accent-600 hover:underline dark:text-accent-300" }, "Edit the vehicle"),
      " to replace it; the old one stays in the history."));
  }
  return root;
}
