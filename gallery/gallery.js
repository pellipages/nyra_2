
// Gallery uses event delegation because main.js loads
// gallery.html dynamically after the page starts.

function showGalleryPhoto(index) {
    const photos = document.querySelectorAll(".floating-photo img");
    const lightboxImage = document.getElementById("lightboxImage");
    const caption = document.getElementById("lightboxCaption");
    const count = document.getElementById("lightboxCount");

    if (!photos.length || !lightboxImage) return;

    window.currentGalleryPhoto = (index + photos.length) % photos.length;

    const photo = photos[window.currentGalleryPhoto];

    lightboxImage.src = photo.src;
    lightboxImage.alt = photo.alt;

    if (caption) caption.textContent = photo.dataset.caption || "";
    if (count) {
        count.textContent =
            `${window.currentGalleryPhoto + 1} of ${photos.length}`;
    }
}

document.addEventListener("click", function (event) {

    const photo = event.target.closest(".floating-photo img");
    const lightbox = document.getElementById("galleryLightbox");

    if (!lightbox) return;

    const photos = document.querySelectorAll(".floating-photo img");

    if (photo) {
        showGalleryPhoto(Array.from(photos).indexOf(photo));
        lightbox.classList.add("active");
        return;
    }

    if (event.target.closest(".gallery-close")) {
        lightbox.classList.remove("active");
        return;
    }

    if (event.target.closest(".gallery-prev")) {
        showGalleryPhoto(window.currentGalleryPhoto - 1);
        return;
    }

    if (event.target.closest(".gallery-next")) {
        showGalleryPhoto(window.currentGalleryPhoto + 1);
        return;
    }

    if (event.target === lightbox) {
        lightbox.classList.remove("active");
    }
});

document.addEventListener("keydown", function (event) {

    const lightbox = document.getElementById("galleryLightbox");

    if (!lightbox || !lightbox.classList.contains("active")) return;

    if (event.key === "Escape") {
        lightbox.classList.remove("active");
    }

    if (event.key === "ArrowRight") {
        showGalleryPhoto(window.currentGalleryPhoto + 1);
    }

    if (event.key === "ArrowLeft") {
        showGalleryPhoto(window.currentGalleryPhoto - 1);
    }
});
