/* Guide cues: adds next-section buttons and stops hints once used. */
(() => {
  "use strict";

  // Sections that end with a "next" pill, and what the pill says.
  // (hero and Bappu Bomma already have their own links; they are
  // only given the pulse in guide.css.)
  const NEXT = [
    { from: "invitation",   to: "save-the-date", label: "Reveal the date" },
    { from: "save-the-date", to: "meet-bappu-bomma", label: "Meet little Nyra" },
    { from: "nyra-gallery", to: "venue",         label: "See where to join us" },
    { from: "venue",        to: "rsvp",          label: "Kindly respond" }
  ];

  function addNextCues() {
    NEXT.forEach(({ from, to, label }) => {
      const section = document.getElementById(from);
      if (!section || !document.getElementById(to)) return;
      if (section.querySelector(".next-cue")) return;

      const wrap = document.createElement("div");
      wrap.className = "next-cue-wrap";
      wrap.innerHTML =
        `<a class="next-cue" href="#${to}">${label} <span aria-hidden="true"></span></a>`;
      section.appendChild(wrap);
    });
  }

  function init() {
    addNextCues();

    // Scratch card: stop the coin shimmer after the first touch.
    const sd = document.getElementById("save-the-date");
    if (sd) {
      sd.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".sd-scratch")) sd.classList.add("is-touched");
      });
    }

    // Gallery: stop the pulse once a photo has been opened.
    document.addEventListener("click", (e) => {
      if (e.target.closest(".floating-photo img")) {
        const hint = document.querySelector(".gallery-hint");
        if (hint) hint.classList.add("is-seen");
      }
    });

    // Map: first tap hands the map over to the guest.
    const map = document.querySelector(".venue-map");
    if (map) {
      const caption = map.querySelector(".map-caption");
      const original = caption ? caption.innerHTML : "";
      if (caption) caption.innerHTML = "Tap to explore the map";

      map.addEventListener("click", () => {
        if (map.classList.contains("is-active")) return;
        map.classList.add("is-active");
        if (caption) caption.innerHTML = original;
      });
    }
  }

  document.addEventListener("sectionsLoaded", init);
})();
