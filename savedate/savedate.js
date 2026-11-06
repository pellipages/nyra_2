
(() => {
  "use strict";

  const SECTION_ID = "save-the-date";
  const PETAL_IMAGE = "../assets/images/pink-petal.png";
  const SCRATCH_THRESHOLD = 42;
  const PETAL_COUNT = 28;

  let timerId = null;
  let initializedSection = null;
  let resizeTimer = null;

  function initializeSaveDate() {
    const section = document.getElementById(SECTION_ID);

    if (!section || section === initializedSection) return;

    initializedSection = section;

    setupScratchCoins(section);
  }

  function setupScratchCoins(section) {
    const coins = Array.from(section.querySelectorAll(".sd-coin"));

    if (coins.length === 0) return;

    coins.forEach((coin) => {
      const canvas = coin.querySelector(".sd-scratch");

      if (!canvas || canvas.dataset.initialized === "true") return;

      canvas.dataset.initialized = "true";

      prepareScratchCanvas(canvas);

      const context = canvas.getContext("2d", {
        willReadFrequently: true
      });

      if (!context) return;

      drawGoldCoating(context, canvas);

      let isScratching = false;
      let lastPoint = null;
      let checkingScratch = false;

      function getPoint(event) {
        const rect = canvas.getBoundingClientRect();

        return {
          x: (event.clientX - rect.left) * (canvas.width / rect.width),
          y: (event.clientY - rect.top) * (canvas.height / rect.height)
        };
      }

      function scratchTo(event) {
        const point = getPoint(event);

        context.save();
        context.globalCompositeOperation = "destination-out";
        context.lineWidth = Math.max(24, canvas.width * 0.19);
        context.lineCap = "round";
        context.lineJoin = "round";

        context.beginPath();

        if (lastPoint) {
          context.moveTo(lastPoint.x, lastPoint.y);
          context.lineTo(point.x, point.y);
        } else {
          context.arc(
            point.x,
            point.y,
            context.lineWidth / 2,
            0,
            Math.PI * 2
          );
        }

        context.stroke();
        context.restore();

        lastPoint = point;
      }

      function checkProgress() {
        if (checkingScratch || coin.classList.contains("is-revealed")) {
          return;
        }

        checkingScratch = true;

        requestAnimationFrame(() => {
          checkingScratch = false;

          try {
            const pixels = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            ).data;

            let transparentPixels = 0;
            let totalPixels = 0;

            // Sample every few pixels for performance.
            for (let i = 3; i < pixels.length; i += 16) {
              totalPixels++;

              if (pixels[i] < 100) {
                transparentPixels++;
              }
            }

            const clearedPercent =
              totalPixels > 0
                ? (transparentPixels / totalPixels) * 100
                : 0;

            if (clearedPercent >= SCRATCH_THRESHOLD) {
              revealCoin(coin, canvas);
            }
          } catch (error) {
            console.warn("Unable to check scratch progress.", error);
          }
        });
      }

      canvas.addEventListener("pointerdown", (event) => {
        if (coin.classList.contains("is-revealed")) return;

        isScratching = true;
        lastPoint = null;

        if (canvas.setPointerCapture) {
          canvas.setPointerCapture(event.pointerId);
        }

        scratchTo(event);
        event.preventDefault();
      });

      canvas.addEventListener("pointermove", (event) => {
        if (!isScratching) return;

        scratchTo(event);
        checkProgress();
        event.preventDefault();
      });

      function stopScratching() {
        isScratching = false;
        lastPoint = null;
        checkProgress();
      }

      canvas.addEventListener("pointerup", stopScratching);
      canvas.addEventListener("pointercancel", stopScratching);
      canvas.addEventListener("lostpointercapture", stopScratching);
    });

    updateScratchHint(section);
  }

  function prepareScratchCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const size = Math.max(1, Math.round(rect.width || 150));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    // The canvas is drawn and scratched in real device pixels.
    // (Patch 8: it used to also scale the context by the pixel ratio, which
    // made scratches land up-left of the finger on every phone screen.)
    canvas.width = Math.round(size * pixelRatio);
    canvas.height = Math.round(size * pixelRatio);
  }

  function drawGoldCoating(context, canvas) {
    const width = canvas.width;
    const height = canvas.height;

    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#f7e7b3");
    gradient.addColorStop(0.25, "#d4ad5d");
    gradient.addColorStop(0.52, "#f2d78f");
    gradient.addColorStop(0.78, "#bd8c3c");
    gradient.addColorStop(1, "#ead18a");

    context.save();
    context.globalCompositeOperation = "source-over";
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    // Fine gold texture without decorative symbols or emojis.
    for (let i = 0; i < 180; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const radius = 0.4 + Math.random() * 1.2;

      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle =
        Math.random() > 0.5
          ? "rgba(255,255,235,0.32)"
          : "rgba(128,84,27,0.13)";
      context.fill();
    }

    context.strokeStyle = "rgba(255, 248, 213, 0.85)";
    context.lineWidth = Math.max(2, width * 0.025);
    context.beginPath();
    context.arc(
      width / 2,
      height / 2,
      width * 0.43,
      0,
      Math.PI * 2
    );
    context.stroke();

    context.restore();
  }

  function revealCoin(coin, canvas) {
    if (coin.classList.contains("is-revealed")) return;

    coin.classList.add("is-revealed");
    canvas.style.opacity = "0";
    canvas.style.pointerEvents = "none";

    const section = document.getElementById(SECTION_ID);
    if (!section) return;

    const coins = Array.from(section.querySelectorAll(".sd-coin"));
    const allRevealed =
      coins.length === 3 &&
      coins.every((item) => item.classList.contains("is-revealed"));

    updateScratchHint(section);

    // Patch 7: let Tiny Nyra (tiny-nyra.js) react to each reveal.
    document.dispatchEvent(
      new CustomEvent("sd:coin-revealed", { detail: { coin, section } })
    );

    if (allRevealed) {
      revealDateAndStartCountdown(section);

      document.dispatchEvent(
        new CustomEvent("sd:all-revealed", { detail: { section } })
      );
    }
  }

  function updateScratchHint(section) {
    const hint = section.querySelector("#sd-scratch-hint");
    if (!hint) return;

    const coins = Array.from(section.querySelectorAll(".sd-coin"));
    const revealedCount = coins.filter((coin) =>
      coin.classList.contains("is-revealed")
    ).length;

    if (revealedCount === 3) {
      hint.textContent = "The date has been revealed!";
    } else if (revealedCount > 0) {
      hint.textContent = `${3 - revealedCount} more to reveal`;
    } else {
      hint.textContent = "Rub each golden coin to reveal the date";
    }
  }

  function revealDateAndStartCountdown(section) {
    const result = section.querySelector("#sd-date-result");
    const countdown = section.querySelector("#sd-countdown");

    if (result) result.hidden = false;
    if (countdown) countdown.hidden = false;

    updateScratchHint(section);
    startPetalAnimation(section);

    if (!timerId) {
      updateCountdown(section);
      timerId = window.setInterval(() => {
        updateCountdown(section);
      }, 1000);
    }
  }

  /* =========================================
     PINK PETAL ANIMATION
     Starts only after all 3 coins are revealed.
  ========================================= */

  function startPetalAnimation(section) {
    if (section.querySelector(".sd-petal-layer")) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const layer = document.createElement("div");
    layer.className = "sd-petal-layer";
    layer.setAttribute("aria-hidden", "true");

    for (let i = 0; i < PETAL_COUNT; i++) {
      const petal = document.createElement("img");

      petal.className = "sd-falling-petal";
      petal.src = PETAL_IMAGE;
      petal.alt = "";
      petal.draggable = false;
      petal.decoding = "async";

      petal.style.setProperty(
        "--petal-left",
        `${Math.random() * 100}%`
      );

      petal.style.setProperty(
        "--petal-width",
        `${14 + Math.random() * 20}px`
      );

      petal.style.setProperty(
        "--petal-duration",
        `${3.5 + Math.random() * 3.5}s`
      );

      petal.style.setProperty(
        "--petal-delay",
        `${Math.random() * 1.2}s`
      );

      petal.style.setProperty(
        "--petal-sway",
        `${-65 + Math.random() * 130}px`
      );

      petal.style.setProperty(
        "--petal-end-sway",
        `${-55 + Math.random() * 110}px`
      );

      petal.style.setProperty(
        "--petal-start-rotation",
        `${Math.random() * 180}deg`
      );

      petal.style.setProperty(
        "--petal-mid-rotation",
        `${180 + Math.random() * 360}deg`
      );

      petal.style.setProperty(
        "--petal-end-rotation",
        `${360 + Math.random() * 540}deg`
      );

      petal.style.setProperty(
        "--petal-opacity",
        `${0.55 + Math.random() * 0.4}`
      );

      petal.addEventListener("error", () => {
        petal.remove();
        console.warn(
          `Petal image could not load. Check the path: ${PETAL_IMAGE}`
        );
      }, { once: true });

      layer.appendChild(petal);
    }

    section.appendChild(layer);
  }

  /* =========================================
     COUNTDOWN
  ========================================= */

  function updateCountdown(section) {
    const dateValue = section.dataset.eventDate;

    if (!dateValue) return;

    const eventDate = new Date(dateValue).getTime();
    const now = Date.now();
    const difference = Math.max(0, eventDate - now);

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor(
      (difference % (1000 * 60 * 60)) / (1000 * 60)
    );
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);

    setCountdownValue(section, "sd-days", days);
    setCountdownValue(section, "sd-hours", hours);
    setCountdownValue(section, "sd-minutes", minutes);
    setCountdownValue(section, "sd-seconds", seconds);
  }

  function setCountdownValue(section, id, value) {
    const element = section.querySelector(`#${id}`);

    if (element) {
      element.textContent = String(value).padStart(2, "0");
    }
  }

  /* =========================================
     INITIALIZATION
     Supports sections loaded dynamically.
  ========================================= */

  function initializeWhenReady() {
    initializeSaveDate();

    const observer = new MutationObserver(() => {
      initializeSaveDate();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeWhenReady, {
      once: true
    });
  } else {
    initializeWhenReady();
  }

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);

    resizeTimer = window.setTimeout(() => {
      const section = document.getElementById(SECTION_ID);

      if (!section) return;

      // Repaint only coins that have not been scratched yet.
      section.querySelectorAll(".sd-coin").forEach((coin) => {
        if (coin.classList.contains("is-revealed")) return;

        const oldCanvas = coin.querySelector(".sd-scratch");
        if (!oldCanvas) return;

        const replacement = oldCanvas.cloneNode(false);
        replacement.dataset.initialized = "";
        oldCanvas.replaceWith(replacement);
      });

      setupScratchCoins(section);
    }, 180);
  });
})();
