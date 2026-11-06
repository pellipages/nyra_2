/* Meet our little Bappu Bomma — gentle entrance when the section scrolls in. */
(() => {
  "use strict";

  function init() {
    const section = document.getElementById("meet-bappu-bomma");
    if (!section || section.dataset.bbReady) return;
    section.dataset.bbReady = "true";

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return; // content simply stays visible

    section.classList.add("bb-js");

    const observer = new IntersectionObserver((entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) {
        section.classList.add("is-in");
        obs.disconnect();
      }
    }, { threshold: 0.15 });

    observer.observe(section);
  }

  document.addEventListener("sectionsLoaded", init);
  if (document.getElementById("meet-bappu-bomma")) init();
})();
