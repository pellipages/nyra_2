/* =========================================================
   PATCH 7 — TINY NYRA (paper-doll cutout)

   1. Pop out : each time a coin is scratched clear, tiny Nyra
                pops up from it with a sparkle, bounces, waves
                and tucks away again.
   2. Walk    : once all three coins are revealed she strolls
                across the card, scattering petals, then stays
                to be tapped (giggle + heart).

   Light on phones: one 42 KB image, transform/opacity-only
   animation, a handful of short-lived DOM nodes.
   Respects "reduce motion": no pop-out, no walking — she just
   stands on the card and a tap shows a still bubble.
   Listens for events fired by savedate.js.
========================================================= */

(() => {
  "use strict";

  const DOLL_IMAGE = "assets/images/nyra-mini.png";
  const PETAL_IMAGE = "assets/images/pink-petal.png";
  const POP_MS = 2700;
  const WALK_DELAY_MS = 2300; // let the third pop-out finish first
  const GIGGLES = ["hehe!", "tee-hee!", "hi hi!", "yay!"];
  const HEART_SVG =
    '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21S3 15.3 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.3-9 12-9 12z"/></svg>';

  const reducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, className, parent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }

  function makeDollImage() {
    const img = document.createElement("img");
    img.src = DOLL_IMAGE;
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    return img;
  }

  /* Warm the image cache once the sections exist. */
  document.addEventListener("sectionsLoaded", () => {
    const preload = new Image();
    preload.decoding = "async";
    preload.src = DOLL_IMAGE;
  });

  /* =======================================================
     1. POP OUT
  ======================================================= */

  function popOut(coin) {
    if (reducedMotion() || coin.dataset.nyraPopped) return;

    const coins = coin.parentElement;
    if (!coins) return;

    coin.dataset.nyraPopped = "true";

    const x = coin.offsetLeft + coin.offsetWidth / 2;
    const y = coin.offsetTop + 4; // feet rest on the coin's top rim

    // Sparkle burst
    const sparks = el("span", "sd-sparks", coins);
    sparks.setAttribute("aria-hidden", "true");
    sparks.style.left = `${x}px`;
    sparks.style.top = `${y}px`;

    const count = 8;
    for (let i = 0; i < count; i++) {
      const spark = el("i", "sd-spark", sparks);
      const angle = Math.PI * (1.08 + (0.84 * i) / (count - 1)); // upper arc
      const radius = 34 + Math.random() * 30;

      spark.style.setProperty("--dx", `${Math.cos(angle) * radius}px`);
      spark.style.setProperty("--dy", `${Math.sin(angle) * radius - 26}px`);
      spark.style.setProperty("--delay", `${Math.random() * 0.12}s`);
      spark.classList.toggle("is-gold", i % 2 === 0);
    }

    // The doll
    const pop = el("span", "sd-pop", coins);
    pop.setAttribute("aria-hidden", "true");
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;

    const wave = el("span", "sd-pop-wave", pop);
    wave.appendChild(makeDollImage());

    window.setTimeout(() => {
      pop.remove();
      sparks.remove();
    }, POP_MS);
  }

  /* =======================================================
     2. WALK ACROSS
  ======================================================= */

  function startWalk(section) {
    const card = section.querySelector(".sd-card");
    if (!card || card.querySelector(".sd-lane")) return;

    const reduce = reducedMotion();

    card.classList.add("has-walker");

    const lane = el("div", "sd-lane", card);
    const petalLayer = el("div", "sd-scatter-layer", lane);
    petalLayer.setAttribute("aria-hidden", "true");

    const walker = el("button", "sd-walker", lane);
    walker.type = "button";
    walker.setAttribute("aria-label", "Tiny Nyra. Tap her to make her giggle.");

    const body = el("span", "sd-walker-body", walker);
    body.appendChild(makeDollImage());

    const bubble = el("span", "sd-bubble", walker);
    bubble.setAttribute("aria-hidden", "true");

    let bubbleTimer = null;
    let lastTap = 0;

    walker.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastTap < 350) return;
      lastTap = now;

      giggle(walker, body, bubble, (t) => {
        window.clearTimeout(bubbleTimer);
        bubbleTimer = window.setTimeout(t.fn, t.ms);
      });
    });

    if (reduce) {
      walker.classList.add("is-idle");
      return;
    }

    window.setTimeout(() => beginWalk(lane, walker, petalLayer), WALK_DELAY_MS);
  }

  function beginWalk(lane, walker, petalLayer) {
    const laneWidth = lane.clientWidth;

    // She rests at the right end of the lane; start just off the left edge.
    walker.style.setProperty("--walk-from", `${-(laneWidth - 6)}px`);
    walker.style.setProperty(
      "--walk-duration",
      `${Math.min(9, Math.max(4.5, laneWidth / 85))}s`
    );
    walker.classList.add("is-walking");

    let scattered = 0;
    const petalTimer = window.setInterval(() => {
      scatterPetal(lane, walker, petalLayer);
      scattered++;
      if (scattered > 40) window.clearInterval(petalTimer);
    }, 330);

    walker.addEventListener("animationend", function onEnd(event) {
      if (event.animationName !== "sd-walk" || event.target !== walker) return;

      walker.removeEventListener("animationend", onEnd);
      window.clearInterval(petalTimer);

      walker.classList.remove("is-walking");
      walker.classList.add("is-idle");

      // A little flourish where she stops.
      for (let i = 0; i < 6; i++) {
        window.setTimeout(() => scatterPetal(lane, walker, petalLayer), i * 70);
      }
    });
  }

  function scatterPetal(lane, walker, petalLayer) {
    const laneRect = lane.getBoundingClientRect();
    const walkerRect = walker.getBoundingClientRect();
    const centre = walkerRect.left - laneRect.left + walkerRect.width / 2;

    const petal = document.createElement("img");
    petal.className = "sd-scatter-petal";
    petal.src = PETAL_IMAGE;
    petal.alt = "";
    petal.draggable = false;
    petal.style.left = `${centre + (Math.random() * 16 - 8)}px`;
    petal.style.setProperty("--dx", `${-50 + Math.random() * 70}px`);
    petal.style.setProperty("--rot", `${180 + Math.random() * 360}deg`);
    petal.style.setProperty("--size", `${12 + Math.random() * 9}px`);
    petal.addEventListener("error", () => petal.remove(), { once: true });

    petalLayer.appendChild(petal);
    window.setTimeout(() => petal.remove(), 2100);
  }

  /* =======================================================
     TAP: giggle + heart
  ======================================================= */

  function giggle(walker, body, bubble, schedule) {
    bubble.textContent = GIGGLES[Math.floor(Math.random() * GIGGLES.length)];
    bubble.classList.add("is-on");
    schedule({ ms: 1500, fn: () => bubble.classList.remove("is-on") });

    // Hop (restart the animation each tap)
    body.classList.remove("is-hop");
    void body.offsetWidth;
    body.classList.add("is-hop");

    // Hearts, capped so rapid tapping stays cheap
    const hearts = walker.querySelectorAll(".sd-heart");
    if (hearts.length > 5) hearts[0].remove();

    const heartCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < heartCount; i++) {
      const heart = el("span", "sd-heart", walker);
      heart.setAttribute("aria-hidden", "true");
      heart.innerHTML = HEART_SVG;
      heart.style.setProperty("--hx", `${-22 + Math.random() * 44}px`);
      heart.style.setProperty("--hd", `${i * 0.12}s`);
      window.setTimeout(() => heart.remove(), 1700);
    }
  }

  /* =======================================================
     SCRATCH DELIGHT (Patch 8)
     Instant feedback: gold dust under the finger, a petal
     burst from each revealed coin, a small buzz on phones.
  ======================================================= */

  let dustCount = 0;
  let lastDust = 0;

  document.addEventListener("pointermove", (event) => {
    if (!event.buttons || reducedMotion()) return;

    const canvas = event.target;
    if (!canvas || !canvas.classList || !canvas.classList.contains("sd-scratch")) return;

    const now = performance.now();
    if (now - lastDust < 45 || dustCount > 14) return;
    lastDust = now;

    const coin = canvas.parentElement;
    if (!coin) return;

    const rect = canvas.getBoundingClientRect();
    const dust = el("i", "sd-dust", coin);
    dust.style.left = `${event.clientX - rect.left}px`;
    dust.style.top = `${event.clientY - rect.top}px`;
    dust.style.setProperty("--dxs", `${-10 + Math.random() * 20}px`);
    dust.classList.toggle("is-pink", Math.random() > 0.7);

    dustCount++;
    window.setTimeout(() => {
      dust.remove();
      dustCount--;
    }, 650);
  });

  function burstPetals(parent, x, y, count, power) {
    if (reducedMotion()) return;

    for (let i = 0; i < count; i++) {
      const petal = document.createElement("img");
      const angle = Math.PI * (1.05 + Math.random() * 0.9); // fan upward
      const dist = power * (0.55 + Math.random() * 0.6);

      petal.className = "sd-burst-petal";
      petal.src = PETAL_IMAGE;
      petal.alt = "";
      petal.draggable = false;
      petal.style.left = `${x}px`;
      petal.style.top = `${y}px`;
      petal.style.setProperty("--bx", `${Math.cos(angle) * dist}px`);
      petal.style.setProperty("--by", `${Math.sin(angle) * dist}px`);
      petal.style.setProperty("--br", `${(Math.random() - 0.5) * 540}deg`);
      petal.style.setProperty("--bs", `${13 + Math.random() * 12}px`);
      petal.addEventListener("error", () => petal.remove(), { once: true });

      parent.appendChild(petal);
      window.setTimeout(() => petal.remove(), 1300);
    }
  }

  function buzz(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    }
  }

  /* =======================================================
     WIRING
  ======================================================= */

  document.addEventListener("sd:coin-revealed", (event) => {
    const coin = event.detail && event.detail.coin;
    if (!coin) return;

    const coins = coin.parentElement;
    if (coins) {
      burstPetals(
        coins,
        coin.offsetLeft + coin.offsetWidth / 2,
        coin.offsetTop + coin.offsetHeight / 2,
        9,
        90
      );
    }
    buzz(25);

    // let the gold fade start first
    window.setTimeout(() => popOut(coin), 160);
  });

  document.addEventListener("sd:all-revealed", (event) => {
    const section = event.detail && event.detail.section;
    if (!section) return;

    const coins = section.querySelector(".sd-coins");
    if (coins) {
      burstPetals(coins, coins.offsetWidth / 2, coins.offsetHeight / 2, 24, 170);
    }
    buzz([30, 50, 30]);

    startWalk(section);
  });
})();
