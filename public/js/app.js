/* Tokyo Model Vault: a small hash-routed app with no build step and no
 * framework. Each route renders a view into <main>; the server re-validates
 * everything, so client checks only give instant feedback. */

import { h, button, cls, icon } from "./ui.js";
import { renderGarage } from "./views/garage.js";
import { renderVehicle } from "./views/vehicle.js";
import { renderForm } from "./views/form.js";
import { renderGuides } from "./views/guides.js";

const ROUTES = [
  [/^\/$/, () => renderGarage(), "garage"],
  [/^\/add$/, () => renderForm(null), "garage"],
  [/^\/v\/(\d+)$/, (m) => renderVehicle(Number(m[1])), "garage"],
  [/^\/v\/(\d+)\/edit$/, (m) => renderForm(Number(m[1])), "garage"],
  [/^\/guides(?:\/([a-z]+))?$/, (m) => renderGuides(m[1]), "guides"],
];

export function errorView(err) {
  return h("div", { class: `${cls.card} fade-in mx-auto max-w-lg p-8 text-center` },
    h("div", { class: "mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger/10 text-danger" }, icon("alert", "h-6 w-6")),
    h("h1", { class: "mt-4 text-lg font-semibold" }, err.status === 404 ? "Not found" : "Something went wrong"),
    h("p", { class: "mt-2 text-sm text-muted" }, err.message),
    err.expired
      ? button("primary", { class: "mt-6", onclick: () => location.reload() }, "Sign in again")
      : button("secondary", { class: "mt-6", href: "#/" }, "Back to garage"));
}

let renderId = 0;

async function route() {
  const path = location.hash.replace(/^#/, "") || "/";
  const view = document.getElementById("view");
  const match = ROUTES.map(([re, render, nav]) => [path.match(re), render, nav]).find(([m]) => m);
  const id = ++renderId;

  for (const a of document.querySelectorAll("[data-nav]")) {
    if (match && a.dataset.nav === match[2]) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }

  let node;
  try {
    node = match ? await match[1](match[0]) : errorView({ status: 404, message: "That page doesn't exist." });
  } catch (err) {
    node = errorView(err);
  }
  if (id !== renderId) return; // a newer navigation won
  view.replaceChildren(node);
  const heading = view.querySelector("h1");
  document.title = heading ? `${heading.textContent} · Tokyo Model Vault` : "Tokyo Model Vault";
  window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
}

document.getElementById("themeToggle").addEventListener("click", () => {
  const dark = document.documentElement.classList.toggle("dark");
  try { localStorage.setItem("tmv-theme", dark ? "dark" : "light"); } catch { /* private mode */ }
});

// The skip link must focus <main>, not change the route.
document.getElementById("skip").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("view").focus();
});

window.addEventListener("hashchange", route);
route();
