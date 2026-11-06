
/* =====================================
   NYRA HERO — ANIMATION STARTUP
===================================== */

(() => {
    "use strict";
  
    function startHero() {
      const hero = document.querySelector(".hero");
  
      if (!hero) return;
  
      // Start the animation sequence once.
      hero.classList.add("is-loaded");
    }
  
    if (document.readyState === "complete") {
      startHero();
    } else {
      window.addEventListener("load", startHero, {
        once: true
      });
    }
  })();
  