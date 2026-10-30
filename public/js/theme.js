// Loaded blocking in <head> so the theme applies before first paint: the
// saved choice if there is one, otherwise the device's setting.
try {
  const saved = localStorage.getItem("tmv-theme");
  const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
} catch (_) {
  document.documentElement.classList.add("dark");
}
