
(() => {
    "use strict";
  
    function revealHero() {
      const hero = document.getElementById("hero");
      if (!hero) return;
  
      document.body.classList.remove("hero-ready");
  
      // Restart the animation cleanly.
      void hero.offsetWidth;
  
      document.body.classList.add("hero-ready");
    }
  
    document.addEventListener("sectionsLoaded", () => {
      if (document.body.classList.contains("intro-complete")) {
        revealHero();
      }
    });
  
    document.addEventListener("introComplete", revealHero);
  })();
  