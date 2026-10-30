/* Owner guides: read the unit's identifiers, then request the code from
 * someone who can legitimately issue it. */

import { findUnit, UNITS } from "../shared/units.js";
import { button, cls, h, icon } from "../ui.js";

function block(title, items, { ordered = true, note = null } = {}) {
  if (!items.length) return null;
  return h("section", { class: "space-y-3" },
    h("h2", { class: "text-lg font-semibold" }, title),
    h(ordered ? "ol" : "ul", { class: "space-y-2.5" }, items.map((text, i) =>
      h("li", { class: "flex gap-3 text-sm leading-relaxed" },
        ordered
          ? h("span", { class: "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-500/12 text-xs font-semibold text-accent-600 dark:text-accent-300" }, String(i + 1))
          : h("span", { class: "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-faint" }),
        h("span", {}, text)))),
    note ? h("p", { class: "rounded-xl border border-warn/25 bg-warn/[0.07] px-4 py-3 text-sm text-ink/90" }, note) : null);
}

export function renderGuides(key) {
  const unit = findUnit(key) || UNITS[0];

  const overview = h("ol", { class: "grid gap-3 sm:grid-cols-4" },
    [
      ["Identify the unit", "Brand, model and serial from the label on its case."],
      ["Read the ERC", "Toyota and Lexus units show it on a hidden service screen."],
      ["Request the code", "From a dealer or the maker's own service, with proof you own the car."],
      ["Save it here", "Next time the unit locks, the code is waiting in your garage."],
    ].map(([title, text], i) => h("li", { class: `${cls.card} p-4` },
      h("p", { class: "text-xs font-semibold text-accent-600 dark:text-accent-300" }, `Step ${i + 1}`),
      h("p", { class: "mt-1 font-medium" }, title),
      h("p", { class: "mt-1 text-sm text-muted" }, text))));

  const tabs = h("nav", { class: "-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-col sm:overflow-visible sm:px-0", "aria-label": "Unit brands" },
    UNITS.map((u) => h("a", {
      href: `#/guides/${u.key}`,
      "aria-current": u.key === unit.key ? "page" : null,
      class: "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-hover hover:text-ink aria-[current=page]:bg-accent-500/12 aria-[current=page]:text-accent-700 dark:aria-[current=page]:text-accent-300",
    }, u.name)));

  const content = h("article", { class: `${cls.card} space-y-8 p-5 sm:p-7` },
    h("header", {},
      h("p", { class: cls.sectionTitle }, "Guide"),
      h("h2", { class: "mt-1 text-2xl font-semibold tracking-tight" }, `${unit.name} units`),
      h("p", { class: "mt-1 text-sm text-muted" }, unit.examples)),
    block("Find the model and serial", unit.find_serial),
    block("Show the ERC", unit.find_erc, { note: unit.erc_note || null }),
    block("Get the unlock code", unit.get_code, { ordered: false }),
    unit.official
      ? button("secondary", { href: unit.official.url, target: "_blank", rel: "noopener noreferrer" }, unit.official.label, icon("external"))
      : null,
    block("Before you enter it", unit.tips, { ordered: false }),
    h("div", { class: "flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6" },
      h("p", { class: "text-sm text-muted" }, "Ready? Add the car and the vehicle page will track each step."),
      button("primary", { href: "#/add" }, icon("plus"), "Add a vehicle")));

  return h("div", { class: "fade-in space-y-8" },
    h("div", {},
      h("h1", { class: "text-2xl font-semibold tracking-tight sm:text-3xl" }, "Unlock guides"),
      h("p", { class: "mt-1 max-w-2xl text-sm text-muted" },
        "After a battery change many head units lock and ask for a code. The code is issued for one specific unit, so you need that unit's details first.")),
    overview,
    h("div", { class: "grid gap-6 sm:grid-cols-[12rem_1fr]" }, tabs, content));
}
