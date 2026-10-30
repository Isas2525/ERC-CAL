/* Garage: every vehicle at a glance, search, and backups. */

import { api } from "../api.js";
import { findMake, toKey } from "../shared/rules.js";
import { findUnit, vehicleStatus } from "../shared/units.js";
import { button, cls, h, icon, mask, statusPill, toast, vehicleSubtitle, vehicleTitle } from "../ui.js";

function matches(v, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const key = toKey(q);
  const ids = [v.vin, v.unit_serial, v.erc, v.unlock_code, v.unit_model].filter(Boolean).map(toKey);
  if (key && ids.some((id) => id.includes(key))) return true;
  const text = [v.nickname, v.model, v.model_year, findMake(v.make)?.name, v.notes].filter(Boolean).join(" ").toLowerCase();
  return text.includes(q);
}

function stat(label, value, tone = "") {
  return h("div", { class: `${cls.card} px-4 py-3.5` },
    h("p", { class: "text-xs font-medium text-muted" }, label),
    h("p", { class: `mt-1 text-2xl font-semibold tabular-nums ${tone}` }, String(value)));
}

function vehicleCard(v) {
  const unit = findUnit(v.unit_brand);
  return h("a", {
    href: `#/v/${v.id}`,
    class: `${cls.card} group flex flex-col gap-3 p-4 transition hover:border-line-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-500/30`,
  },
    h("div", { class: "flex items-start justify-between gap-3" },
      h("div", { class: "flex min-w-0 items-center gap-3" },
        h("span", { class: "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-hover text-sm font-bold text-muted" },
          (findMake(v.make)?.name || "?").slice(0, 1)),
        h("div", { class: "min-w-0" },
          h("p", { class: "truncate font-semibold group-hover:text-accent-600 dark:group-hover:text-accent-300" }, vehicleTitle(v)),
          h("p", { class: "truncate text-xs text-muted" }, vehicleSubtitle(v) || `${unit?.name || "Unknown"} unit${v.unit_model ? ` · ${v.unit_model}` : ""}`))),
      statusPill(v)),
    h("dl", { class: "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs" },
      h("dt", { class: "text-muted" }, "VIN"),
      h("dd", { class: `${cls.mono} truncate` }, v.vin),
      v.unit_serial && [h("dt", { class: "text-muted" }, "Serial"), h("dd", { class: `${cls.mono} truncate` }, v.unit_serial)],
      v.erc && [h("dt", { class: "text-muted" }, "ERC"), h("dd", { class: `${cls.mono} truncate` }, v.erc)],
      v.unlock_code && [h("dt", { class: "text-muted" }, "Code"), h("dd", { class: `${cls.mono} text-muted` }, mask(v.unlock_code))]));
}

function emptyState() {
  const step = (n, title, text) => h("li", { class: "flex gap-4" },
    h("span", { class: "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-500/12 text-sm font-semibold text-accent-600 dark:text-accent-300" }, String(n)),
    h("div", {}, h("p", { class: "font-medium" }, title), h("p", { class: "mt-0.5 text-sm text-muted" }, text)));
  return h("div", { class: `${cls.card} fade-in overflow-hidden` },
    h("div", { class: "border-b border-line bg-hover/50 px-6 py-8 text-center sm:px-10" },
      h("div", { class: "mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-500/12 text-accent-600 dark:text-accent-300" }, icon("car", "h-7 w-7")),
      h("h2", { class: "mt-4 text-xl font-semibold" }, "Add your first car"),
      h("p", { class: "mx-auto mt-2 max-w-md text-sm text-muted" },
        "Save each car's infotainment details once. When the screen locks after a battery change, the code is here in seconds."),
      button("primary", { href: "#/add", class: "mt-6" }, icon("plus"), "Add a vehicle")),
    h("ol", { class: "grid gap-6 px-6 py-8 sm:grid-cols-3 sm:px-10" },
      step(1, "Add the car", "Its VIN or Japanese chassis number, and the head unit's serial if you have it."),
      step(2, "Find the ERC", "Follow the guide to show the unit's ERC or serial on screen, then request the code from a dealer."),
      step(3, "Save the code", "Store the code you're issued. Next time the unit locks, it's one tap away.")));
}

async function importBackup(file, rerender) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast("That file isn't valid JSON.");
    return;
  }
  try {
    const res = await api("/api/import", { method: "POST", body: data });
    toast(res.message);
    rerender();
  } catch (err) {
    toast(err.message);
  }
}

export async function renderGarage() {
  const vehicles = await api("/api/vehicles");
  const root = h("div", { class: "fade-in space-y-6" });
  const rerender = async () => root.replaceWith(await renderGarage());

  const withCode = vehicles.filter((v) => v.unlock_code).length;
  const waiting = vehicles.filter((v) => vehicleStatus(v).key === "ready").length;

  root.append(
    h("div", { class: "flex flex-wrap items-end justify-between gap-4" },
      h("div", {},
        h("h1", { class: "text-2xl font-semibold tracking-tight sm:text-3xl" }, "Your garage"),
        h("p", { class: "mt-1 text-sm text-muted" }, vehicles.length
          ? "Pick a vehicle to see its unlock code, or what's needed to get one."
          : "Your private vault for infotainment unlock codes.")),
      vehicles.length > 0 && button("primary", { href: "#/add" }, icon("plus"), "Add vehicle")),
  );

  if (!vehicles.length) {
    root.append(emptyState());
  } else {
    root.append(h("div", { class: "grid grid-cols-3 gap-3" },
      stat("Vehicles", vehicles.length),
      stat("Codes saved", withCode, "text-ok"),
      stat("Ready to request", waiting, waiting ? "text-accent-600 dark:text-accent-300" : "")));

    const list = h("div", { class: "grid gap-3 sm:grid-cols-2" });
    const none = h("p", { class: "hidden rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted" },
      "No vehicle matches that search.");
    const search = h("input", {
      type: "search",
      class: `${cls.input} pl-10`,
      placeholder: "Search by VIN, serial, ERC, code or name",
      "aria-label": "Search vehicles",
      autocomplete: "off",
      spellcheck: "false",
      oninput: () => {
        const shown = vehicles.filter((v) => matches(v, search.value));
        list.replaceChildren(...shown.map(vehicleCard));
        none.classList.toggle("hidden", shown.length > 0);
      },
    });
    list.append(...vehicles.map(vehicleCard));
    root.append(
      h("div", { class: "relative" },
        h("span", { class: "pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-faint" }, icon("search")),
        search),
      list,
      none);
  }

  const fileInput = h("input", {
    type: "file",
    accept: "application/json,.json",
    class: "hidden",
    onchange: () => fileInput.files[0] && importBackup(fileInput.files[0], rerender),
  });
  root.append(h("div", { class: "flex flex-wrap items-center gap-2 border-t border-line pt-5 text-sm" },
    h("span", { class: "mr-auto text-muted" }, "Backups keep your codes safe if anything happens to the database."),
    vehicles.length > 0 && button("ghost", { href: "/api/export", download: "" }, icon("download"), "Export backup"),
    button("ghost", { onclick: () => fileInput.click() }, icon("upload"), "Import backup"),
    fileInput));

  return root;
}
