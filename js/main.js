
document.addEventListener("DOMContentLoaded", async () => {
  const introMount = document.getElementById("intro-mount");
  const sectionsContainer = document.getElementById("site-sections");

  const sections = [
    "hero/hero.html",
    "invitation/invitation.html",
    "savedate/savedate.html",
    "bappu-bomma/bappu-bomma.html",
    "gallery/gallery.html",
    "venue/venue.html",
    "rsvp/rsvp.html",
    "footer/footer.html"
  ];

  async function loadHTML(path) {
    try {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${path}`);
      }

      return await response.text();
    } catch (error) {
      console.error("Could not load section:", path, error);
      return "";
    }
  }

  if (introMount) {
    const introHTML = await loadHTML("intro/intro.html");
    if (introHTML) introMount.innerHTML = introHTML;
  }

  if (!sectionsContainer) {
    console.error("Missing #site-sections");
    return;
  }

  sectionsContainer.innerHTML = "";

  for (const path of sections) {
    const html = await loadHTML(path);

    if (html) {
      sectionsContainer.insertAdjacentHTML("beforeend", html);
    }
  }

  initializeScrollAnimations();

  document.dispatchEvent(new CustomEvent("sectionsLoaded"));
});

function initializeScrollAnimations() {
  const container = document.getElementById("site-sections");
  if (!container) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const invitation = container.querySelector("#invitation");

  // Animate the invitation separately.
  if (invitation) {
    invitation.classList.add("invitation-scroll-hidden");
    invitation.classList.remove("is-visible");
  } else {
    console.error("Invitation section #invitation was not found.");
  }

  // Animate every other section without changing the hero.
  const otherSections = container.querySelectorAll(
    "section:not(#hero):not(#invitation)"
  );

  if (reduceMotion || !("IntersectionObserver" in window)) {
    otherSections.forEach(section => {
      section.classList.add("scroll-reveal", "is-visible");
    });

    if (invitation) {
      invitation.classList.add("is-visible");
    }

    return;
  }

  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        sectionObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.08
  });

  otherSections.forEach(section => {
    section.classList.add("scroll-reveal");

    const rect = section.getBoundingClientRect();

    if (rect.top < window.innerHeight && rect.bottom > 0) {
      section.classList.add("is-visible");
    } else {
      sectionObserver.observe(section);
    }
  });

  // Reveal the invitation when it enters the viewport.
  if (invitation) {
    const invitationObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          invitation.classList.add("is-visible");
          invitationObserver.unobserve(invitation);
        }
      });
    }, {
      threshold: 0.05,
      rootMargin: "0px 0px -20px 0px"
    });

    invitationObserver.observe(invitation);
  }
}

