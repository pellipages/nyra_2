// =====================================================================
// RSVP form -> Supabase Edge Function "submit-rsvp"
//
// The browser never talks to the database. It sends one JSON request to
// the function, which checks the website address, validates every field,
// rate-limits, and only then saves the RSVP.
//
// No API key is used here on purpose: the function is public and
// protects itself. Nothing secret belongs in this file.
// =====================================================================

// ---- SET THIS ONCE -----------------------------------------------------
// Supabase dashboard > Project Settings > API > Project URL, then add
// /functions/v1/submit-rsvp. Example:
//   https://abcdefghijklmnop.supabase.co/functions/v1/submit-rsvp
const RSVP_ENDPOINT =
    "https://bcubwgmzbeqpedmhvmfj.supabase.co/functions/v1/submit-rsvp";
// ------------------------------------------------------------------------

// Real addresses look like https://<20 letters or digits>.supabase.co/...
// Checking the shape (not a placeholder word) means filling in the project
// ref can never break this check.
const RSVP_ENDPOINT_PATTERN =
    /^https:\/\/[a-z0-9]{20}\.supabase\.co\/functions\/v1\/submit-rsvp$/;
const RSVP_ENDPOINT_OK = RSVP_ENDPOINT_PATTERN.test(RSVP_ENDPOINT);

// Changes with every edit to this file, so the browser console can tell us
// which copy of the script the live site is really running.
const RSVP_BUILD = "2026-11-07-debug-2";

const RSVP_TIMEOUT_MS = 15000;
const NAME_MAX = 80;
const MESSAGE_MAX = 500;

const RSVP_TEXT = {
    thanksYes: "Thank you! We can't wait to celebrate with you. ♡",
    thanksNo: "Thank you for letting us know. You'll be in our hearts that day. ♡",
    check: "Please check your details and try once more.",
    rateLimited:
        "You've sent a few responses already. Please wait a few minutes and try again.",
    busy: "We're a little busy right now. Please try again in a moment.",
    generic: "We couldn't send your RSVP just now. Please try again in a moment.",
    notConnected:
        "The RSVP form isn't connected yet. Please try again later."
};

console.info(
    "[rsvp] script loaded. build:", RSVP_BUILD,
    "| endpoint looks valid:", RSVP_ENDPOINT_OK,
    "| page origin:", location.origin
);

const rsvpLength = (text) => [...text].length;

// Turn what the function said into something kind for a guest.
function messageForFailure(status, code) {
    if (status === 429 || code === "rate_limited") return RSVP_TEXT.rateLimited;
    if (status === 400 && code === "invalid_input") return RSVP_TEXT.check;
    if (status === 503 || code === "try_again") return RSVP_TEXT.busy;
    return RSVP_TEXT.generic;
}

// "No" has no guest count: turn the box off so it can't block the form.
function syncGuestField() {
    const guestCount = document.getElementById("guestCount");
    const form = document.getElementById("rsvpForm");
    if (!guestCount || !form) return;

    const attending = form.querySelector('input[name="attending"]:checked')?.value;
    guestCount.disabled = attending === "No";
}

document.addEventListener("change", function (event) {
    if (event.target && event.target.name === "attending") syncGuestField();
});

let rsvpSubmitting = false;

document.addEventListener("submit", async function (event) {
    if (event.target.id !== "rsvpForm") return;

    event.preventDefault();

    // one request at a time (double taps, slow networks)
    if (rsvpSubmitting) return;

    const form = event.target;
    const message = document.getElementById("rsvpMessage");
    const button = form.querySelector("button[type='submit']");
    const originalLabel = button.textContent;

    if (!RSVP_ENDPOINT_OK) {
        console.error("[rsvp] RSVP_ENDPOINT is not a valid Supabase function address:",
            RSVP_ENDPOINT, "| build:", RSVP_BUILD);
        message.textContent = RSVP_TEXT.notConnected;
        return;
    }

    const name = document.getElementById("guestName").value.trim();
    const attending = form.querySelector('input[name="attending"]:checked')?.value;
    const wishes = document.getElementById("guestMessage").value.trim();
    const honeypot = document.getElementById("guestWebsite")?.value ?? "";

    const guests = attending === "Yes"
        ? Number(document.getElementById("guestCount").value)
        : 0;

    const nameOk = name.length > 0 && rsvpLength(name) <= NAME_MAX;
    const attendingOk = attending === "Yes" || attending === "No";
    const guestsOk = attending === "No"
        ? guests === 0
        : Number.isInteger(guests) && guests >= 1 && guests <= 20;
    const wishesOk = rsvpLength(wishes) <= MESSAGE_MAX;

    if (!nameOk || !attendingOk || !guestsOk || !wishesOk) {
        console.warn("[rsvp] blocked in the browser before sending:",
            { nameOk, attendingOk, guestsOk, wishesOk });
        message.textContent = RSVP_TEXT.check;
        return;
    }

    rsvpSubmitting = true;
    button.disabled = true;
    button.textContent = "Submitting…";
    message.textContent = "";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RSVP_TIMEOUT_MS);

    try {
        const response = await fetch(RSVP_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: name,
                attending: attending,
                guests: guests,
                message: wishes,
                website: honeypot // hidden trap field; real guests leave it empty
            }),
            signal: controller.signal
        });

        const result = await response.json().catch(() => ({}));
        console.info("[rsvp] server answered:", response.status, result);

        if (!response.ok || result.ok !== true) {
            message.textContent = messageForFailure(response.status, result.code);
        } else {
            message.textContent = attending === "Yes"
                ? RSVP_TEXT.thanksYes
                : RSVP_TEXT.thanksNo;
            form.reset();
            syncGuestField();
        }
    } catch (error) {
        // offline, timed out, or blocked (for example, wrong website address)
        console.error(
            "[rsvp] request failed before any answer:",
            error && error.name, error && error.message,
            "| If this says 'Failed to fetch', the website address is probably",
            "missing from ALLOWED_ORIGINS, or the endpoint is wrong. Page origin:",
            location.origin
        );
        message.textContent = RSVP_TEXT.generic;
    } finally {
        clearTimeout(timer);
        rsvpSubmitting = false;
        button.disabled = false;
        button.textContent = originalLabel;
    }
});
