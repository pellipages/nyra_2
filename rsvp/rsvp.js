
document.addEventListener("submit", async function (event) {
    if (event.target.id !== "rsvpForm") return;

    event.preventDefault();

    const form = event.target;
    const message = document.getElementById("rsvpMessage");
    const button = form.querySelector("button[type='submit']");

    const name = document.getElementById("guestName").value.trim();
    const attending = form.querySelector(
        'input[name="attending"]:checked'
    )?.value;
    const guests = Number(document.getElementById("guestCount").value);
    const wishes = document.getElementById("guestMessage").value.trim();

    if (!name || !attending || !Number.isInteger(guests) ||
        guests < 1 || guests > 20) {
        message.textContent = "Please check your details and try once more.";
        return;
    }

    button.disabled = true;
    button.textContent = "Submitting…";

    try {
        const response = await fetch("http://localhost:5000/api/rsvp", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: name,
                attending: attending,
                guests: attending === "Yes" ? guests : 0,
                message: wishes
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Submission failed");
        }

        message.textContent = attending === "Yes"
            ? "Thank you! We can't wait to celebrate with you. ♡"
            : "Thank you for letting us know. You'll be in our hearts that day. ♡";
        form.reset();

    } catch (error) {
        message.textContent =
            "We couldn't send your RSVP just now. Please try again in a moment.";
    }

    button.disabled = false;
    button.textContent = "Submit RSVP ♡";
});
