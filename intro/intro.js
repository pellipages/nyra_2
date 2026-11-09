(() => {
  "use strict";

  let finished = false;

  function initializeIntro() {
    const overlay = document.getElementById("intro-overlay");
    const video = document.getElementById("intro-video");
    const skip = document.getElementById("intro-skip");
    const loading = document.getElementById("intro-loading");
    const startBtn = document.getElementById("intro-start");

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

      // Tell the page the video has started so the music starts with it.
      document.dispatchEvent(new Event("introVideoPlaying"));
    });

    video.addEventListener("error", () => {
      if (loading) {
        loading.hidden = false;
        loading.textContent = "Video unavailable — click Skip intro";
      }
    });

    // The video does NOT autoplay. It starts (with sound) when the guest
    // taps "Tap to open". Because this is a real tap, the browser allows
    // sound, and the music starts at the same moment.
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        startBtn.classList.add("is-hidden");
        if (loading) loading.hidden = false;

        video.muted = false;      // allow the video's own audio
        video.currentTime = 0;

        video.play().catch(() => {
          if (loading) {
            loading.hidden = false;
            loading.textContent = "Click Skip intro to continue";
          }
        });

        // Start the song together with the video
        document.dispatchEvent(new Event("introVideoPlaying"));
      });
    }
  }

  document.addEventListener("sectionsLoaded", initializeIntro);
})();
