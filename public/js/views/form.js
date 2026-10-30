/* Add or edit a vehicle. Live checks use the same rules as the server. */

import { api, editable } from "../api.js";
import {
  checkCode, checkErc, checkSerial, checkText, checkVin, checkYear, CODE_SOURCES, findMake, MAKES,
} from "../shared/rules.js";
import { findUnit, UNITS, usesErc } from "../shared/units.js";
import { button, cls, h, icon, toast } from "../ui.js";

const FIELD_CHECKS = {
  vin: checkVin,
  model_year: checkYear,
  unit_serial: checkSerial,
  erc: checkErc,
  unlock_code: checkCode,
  nickname: (v) => checkText(v, 60, "Nickname"),
  model: (v) => checkText(v, 60, "Model"),
  unit_model: (v) => checkText(v, 40, "Unit model"),
  notes: (v) => checkText(v, 1000, "Notes"),
};

function field({ name, label, optional = false, hint = null, control, extra = null }) {
  const id = `f-${name}`;
  control.id = id;
  control.name = name;
  const hintEl = h("p", { id: `${id}-hint`, class: `${cls.hint} ${hint ? "" : "hidden"}` }, hint);
  const errorEl = h("p", { id: `${id}-error`, class: `${cls.error} hidden`, role: "alert" });
  control.setAttribute("aria-describedby", `${id}-hint ${id}-error`);
  const wrap = h("div", { dataset: { field: name } },
    h("label", { for: id, class: cls.label }, label, optional ? h("span", { class: "font-normal text-faint" }, " (optional)") : null),
    control, hintEl, errorEl, extra);
  return { wrap, control, hintEl, errorEl };
}

const input = (attrs = {}) => h("input", { class: cls.input, autocomplete: "off", spellcheck: "false", ...attrs });
const monoInput = (attrs = {}) => input({ class: `${cls.input} ${cls.mono} ${cls.monoPlaceholder}`, autocapitalize: "characters", ...attrs });

function select(options, placeholder) {
  return h("select", { class: cls.input },
    placeholder ? h("option", { value: "" }, placeholder) : null,
    options.map((o) => h("option", { value: o.key }, o.name)));
}

function guideDetails(title, steps, note) {
  return h("details", { class: "group mt-2 rounded-xl border border-line bg-hover/40 text-sm" },
    h("summary", { class: "flex list-none items-center justify-between gap-2 px-3.5 py-2.5 font-medium text-accent-600 dark:text-accent-300" },
      title, h("span", { class: "transition group-open:rotate-90" }, "›")),
    h("div", { class: "border-t border-line px-3.5 pb-3.5 pt-2.5 text-muted" },
      h("ol", { class: "list-decimal space-y-1.5 pl-5" }, steps.map((s) => h("li", {}, s))),
      note ? h("p", { class: "mt-2 text-xs" }, note) : null));
}

function section(title, description, ...children) {
  return h("section", { class: `${cls.card} grid gap-6 p-5 sm:p-6 lg:grid-cols-[14rem_1fr]` },
    h("div", {},
      h("h2", { class: "font-semibold" }, title),
      h("p", { class: "mt-1 text-sm text-muted" }, description)),
    h("div", { class: "grid gap-4" }, ...children));
}

export async function renderForm(id) {
  const existing = id ? await api(`/api/vehicles/${id}`) : null;
  const initial = existing ? editable(existing) : {};
  let unitTouched = Boolean(existing);

  const f = {};
  const add = (spec) => (f[spec.name] = field(spec));

  // ---- Vehicle ----
  const decodeBtn = button("secondary", { class: "shrink-0", disabled: true }, icon("wand"), "Decode");
  add({
    name: "vin", label: "VIN or chassis number",
    hint: "17-character VIN, or the chassis (frame) number on Japanese-market cars, e.g. ZVW30-1234567.",
    control: monoInput({ placeholder: "JTDKB20U093123456", maxlength: "24", required: true }),
  });
  const vinRow = h("div", { class: "flex gap-2" });
  f.vin.control.replaceWith(vinRow);
  vinRow.append(f.vin.control, decodeBtn);

  add({ name: "make", label: "Make", control: select(MAKES, "Choose…") });
  add({ name: "model", label: "Model", optional: true, control: input({ placeholder: "e.g. Prius", maxlength: "60" }) });
  add({ name: "model_year", label: "Year", optional: true, control: input({ placeholder: "2014", inputmode: "numeric", maxlength: "4" }) });
  add({ name: "nickname", label: "Nickname", optional: true, hint: "How you'll recognise it in your garage.", control: input({ placeholder: "e.g. Blue Prius", maxlength: "60" }) });

  // ---- Unit ----
  add({ name: "unit_brand", label: "Unit brand", control: select(UNITS, "Choose…") });
  add({ name: "unit_model", label: "Unit model", optional: true, control: monoInput({ maxlength: "40" }) });
  const serialGuide = h("div");
  const ercGuide = h("div");
  add({ name: "unit_serial", label: "Unit serial number", optional: true, control: monoInput({ placeholder: "As printed on the label", maxlength: "32" }), extra: serialGuide });
  add({ name: "erc", label: "ERC", optional: true, hint: "16 characters, 0-9 and A-F, shown on the unit's service screen.", control: monoInput({ placeholder: "1A2B3C4D5E6F7A8B", maxlength: "24" }), extra: ercGuide });

  // ---- Code ----
  add({ name: "unlock_code", label: "Unlock code", optional: true, hint: "Leave empty if you don't have it yet; the vehicle page walks you through getting it.", control: monoInput({ placeholder: "e.g. 1A2B3C4D", maxlength: "40" }) });
  add({ name: "code_source", label: "Where it came from", optional: true, control: select(CODE_SOURCES, "Choose…") });
  add({ name: "notes", label: "Notes", optional: true, control: h("textarea", { class: `${cls.input} min-h-24 resize-y`, rows: 3, maxlength: "1000", placeholder: "Anything useful: dealer, invoice number, where the label is…" }) });

  for (const [name, value] of Object.entries(initial)) {
    if (f[name] && value != null) f[name].control.value = String(value);
  }

  // ---- Behaviour ----
  const setError = (name, message) => {
    const { control, errorEl } = f[name];
    errorEl.textContent = message || "";
    errorEl.classList.toggle("hidden", !message);
    control.setAttribute("aria-invalid", message ? "true" : "false");
  };

  const check = (name, { final = false } = {}) => {
    const fn = FIELD_CHECKS[name];
    if (!fn) return true;
    const value = f[name].control.value;
    // While typing, stay quiet about an empty or half-typed VIN.
    if (!final && name === "vin" && value.replace(/[\s.-]/g, "").length < 6) { setError(name, ""); return true; }
    const res = fn(value);
    setError(name, res.error || "");
    return !res.error;
  };

  const vinHint = () => {
    const res = checkVin(f.vin.control.value);
    decodeBtn.disabled = res.kind !== "vin";
    if (res.kind === "vin") {
      f.vin.hintEl.textContent = res.check_digit_ok
        ? "17-character VIN. Check digit OK."
        : "17-character VIN. The check digit doesn't match (normal for many non-US cars), so double-check it.";
    } else if (res.kind === "chassis") {
      f.vin.hintEl.textContent = "Japanese chassis (frame) number.";
    }
  };

  const refreshUnit = () => {
    const unit = findUnit(f.unit_brand.control.value);
    f.unit_model.control.placeholder = unit ? `e.g. ${unit.examples.split(",")[0]}` : "";
    f.erc.wrap.classList.toggle("hidden", !(unit && usesErc(unit)) && !f.erc.control.value);
    serialGuide.replaceChildren(unit ? guideDetails("Where do I find the serial?", unit.find_serial) : "");
    ercGuide.replaceChildren(unit && unit.find_erc.length ? guideDetails("How do I show the ERC?", unit.find_erc, unit.erc_note) : "");
  };

  for (const name of Object.keys(FIELD_CHECKS)) {
    f[name].control.addEventListener("input", () => check(name));
    f[name].control.addEventListener("blur", () => f[name].control.value && check(name, { final: true }));
  }
  f.vin.control.addEventListener("input", vinHint);
  f.make.control.addEventListener("change", () => {
    setError("make", "");
    const make = findMake(f.make.control.value);
    if (make && !unitTouched) { f.unit_brand.control.value = make.unit; refreshUnit(); }
  });
  f.unit_brand.control.addEventListener("change", () => { unitTouched = true; setError("unit_brand", ""); refreshUnit(); });

  decodeBtn.addEventListener("click", async () => {
    const vin = checkVin(f.vin.control.value);
    if (vin.error) { setError("vin", vin.error); return; }
    decodeBtn.disabled = true;
    try {
      const res = await api(`/api/vin/${encodeURIComponent(vin.key)}`);
      if (res.decoded) {
        if (res.make) { f.make.control.value = res.make; f.make.control.dispatchEvent(new Event("change")); }
        if (res.model && !f.model.control.value) f.model.control.value = res.model;
        if (res.model_year && !f.model_year.control.value) f.model_year.control.value = String(res.model_year);
      }
      toast(res.message);
    } catch (err) {
      toast(err.message);
    } finally {
      vinHint();
    }
  });

  vinHint();
  refreshUnit();

  const submit = button("primary", { type: "submit" }, existing ? "Save changes" : "Add vehicle");
  const formError = h("div", { class: "hidden rounded-xl border border-danger/30 bg-danger/[0.06] p-4 text-sm text-danger", role: "alert" });

  const form = h("form", {
    class: "space-y-4",
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      formError.classList.add("hidden");
      let ok = Object.keys(FIELD_CHECKS).map((name) => check(name, { final: true })).every(Boolean);
      for (const name of ["make", "unit_brand"]) {
        if (!f[name].control.value) { setError(name, name === "make" ? "Choose the make." : "Choose the unit's brand."); ok = false; }
      }
      if (!ok) {
        form.querySelector("[aria-invalid=true]")?.focus();
        return;
      }
      const body = Object.fromEntries(Object.entries(f).map(([name, x]) => [name, x.control.value.trim() || null]));
      body.model_year = body.model_year ? Number(body.model_year) : null;
      if (f.erc.wrap.classList.contains("hidden")) body.erc = null;

      submit.disabled = true;
      try {
        const saved = await api(existing ? `/api/vehicles/${id}` : "/api/vehicles", { method: existing ? "PUT" : "POST", body });
        toast(existing ? "Changes saved" : "Vehicle added");
        location.hash = `#/v/${saved.id}`;
      } catch (err) {
        if (err.field && f[err.field]) {
          setError(err.field, err.message);
          f[err.field].control.focus();
        } else {
          formError.textContent = err.message;
          formError.classList.remove("hidden");
        }
        if (err.data?.existing_id) {
          formError.replaceChildren(err.message, " ",
            h("a", { href: `#/v/${err.data.existing_id}`, class: "font-semibold underline" }, "Open it"));
          formError.classList.remove("hidden");
        }
      } finally {
        submit.disabled = false;
      }
    },
  },
    section("Vehicle", "The VIN identifies the car. Decode fills in the rest for most US-market VINs.",
      f.vin.wrap,
      h("div", { class: "grid gap-4 sm:grid-cols-[1fr_1fr_7rem]" }, f.make.wrap, f.model.wrap, f.model_year.wrap),
      f.nickname.wrap),
    section("Infotainment unit", "The locked head unit. Its serial (and the ERC on Toyota/Lexus) is what the code is issued for.",
      h("div", { class: "grid gap-4 sm:grid-cols-2" }, f.unit_brand.wrap, f.unit_model.wrap),
      f.unit_serial.wrap,
      f.erc.wrap),
    section("Unlock code", "Only codes you were issued: by a dealer, the manufacturer, or the car's paperwork.",
      h("div", { class: "grid gap-4 sm:grid-cols-2" }, f.unlock_code.wrap, f.code_source.wrap),
      f.notes.wrap),
    formError,
    h("div", { class: "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end" },
      button("secondary", { href: existing ? `#/v/${id}` : "#/" }, "Cancel"),
      submit));

  return h("div", { class: "fade-in space-y-6" },
    h("a", { href: existing ? `#/v/${id}` : "#/", class: "inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink" },
      icon("back"), existing ? "Back to vehicle" : "Garage"),
    h("div", {},
      h("h1", { class: "text-2xl font-semibold tracking-tight sm:text-3xl" }, existing ? "Edit vehicle" : "Add a vehicle"),
      h("p", { class: "mt-1 text-sm text-muted" }, existing
        ? "Changing the unlock code keeps the old one in the history."
        : "Only the VIN, make and unit brand are required. Add the rest whenever you have it.")),
    form);
}
