// Loaded blocking in <head> so the saved theme applies before first paint.
try {
  if (localStorage.getItem("erc-cal-theme") === "light") document.documentElement.classList.remove("dark");
} catch (_) {}
