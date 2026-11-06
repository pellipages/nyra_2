
(() => {
    "use strict";
  
    let finished = false;
  
    function initializeIntro() {
      const overlay = document.getElementById("intro-overlay");
      const video = document.getElementById("intro-video");
      const skip = document.getElementById("intro-skip");
      const loading = document.getElementById("intro-loading");
  
      if (!overlay || !video || !skip || overlay.dataset.ready) return;
      overlay.dataset.ready = "true";
  
      function finishIntro() {
        if (finished) return;
        finished = true;
  
        overlay.classList.add("intro-hidden");
        video.pause();
        document.body.classList.add("intro-complete");
  
        document.dispatchEvent(new Event("introComplete"));
  
        window.setTimeout(() => overlay.remove(), 950);
      }
  
      skip.addEventListener("click", finishIntro);
      video.addEventListener("ended", finishIntro);
  
      video.addEventListener("playing", () => {
        if (loading) loading.hidden = true;
      });
  
      video.addEventListener("error", () => {
        if (loading) {
          loading.textContent = "Video unavailable — click Skip intro";
        }
      });
  
      video.play().catch(() => {
        if (loading) {
          loading.textContent = "Click Skip intro to continue";
        }
      });
    }
  
    document.addEventListener("sectionsLoaded", initializeIntro);
  })();
  