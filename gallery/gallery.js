
// Gallery uses event delegation because main.js loads
// gallery.html dynamically after the page starts.

document.addEventListener("click", function (event) {

    const photo = event.target.closest(".floating-photo img");
    const lightbox = document.getElementById("galleryLightbox");

    if (!lightbox) return;

    const photos = document.querySelectorAll(".floating-photo img");
    const lightboxImage = document.getElementById("lightboxImage");

    if (photo) {
        window.currentGalleryPhoto = Array.from(photos).indexOf(photo);
        lightboxImage.src = photo.src;
        lightbox.classList.add("active");
        return;
    }

    if (event.target.closest(".gallery-close")) {
        lightbox.classList.remove("active");
        return;
    }

    if (event.target.closest(".gallery-prev")) {
        window.currentGalleryPhoto =
            (window.currentGalleryPhoto - 1 + photos.length) % photos.length;

        lightboxImage.src = photos[window.currentGalleryPhoto].src;
        return;
    }

    if (event.target.closest(".gallery-next")) {
        window.currentGalleryPhoto =
            (window.currentGalleryPhoto + 1) % photos.length;

        lightboxImage.src = photos[window.currentGalleryPhoto].src;
        return;
    }

    if (event.target === lightbox) {
        lightbox.classList.remove("active");
    }
});

document.addEventListener("keydown", function (event) {

    const lightbox = document.getElementById("galleryLightbox");

    if (!lightbox || !lightbox.classList.contains("active")) return;

    const photos = document.querySelectorAll(".floating-photo img");
    const lightboxImage = document.getElementById("lightboxImage");

    if (event.key === "Escape") {
        lightbox.classList.remove("active");
    }

    if (event.key === "ArrowRight") {
        window.currentGalleryPhoto =
            (window.currentGalleryPhoto + 1) % photos.length;

        lightboxImage.src = photos[window.currentGalleryPhoto].src;
    }

    if (event.key === "ArrowLeft") {
        window.currentGalleryPhoto =
            (window.currentGalleryPhoto - 1 + photos.length) % photos.length;

        lightboxImage.src = photos[window.currentGalleryPhoto].src;
    }
});
