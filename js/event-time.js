// ==========================================================
// EVENT TIME — reads the date and time of the celebration from
// the public site_content table (keys event_at and event_timezone),
// so it can be changed in Supabase without touching code.
//
// The text already written in the HTML is the fallback: if Supabase is
// slow or unreachable, guests simply see that and nothing breaks.
// Console lines start with [event]. Only public values are used here.
// ==========================================================
(function () {
    "use strict";

    // Public by design: project URL and publishable key.
    const SUPABASE_URL = "https://bcubwgmzbeqpedmhvmfj.supabase.co";
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qC2lRFkyr8b1H9-M8YGRJA_jAKeDx1r";

    const FALLBACK = {
        event_at: "2026-12-12T09:00:00-08:00",
        event_timezone: "America/Los_Angeles"
    };

    const settings = { ...FALLBACK };
    const keyLooksValid = /^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLISHABLE_KEY);

    // ---------- load from the database ----------

    function validZone(zone) {
        try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; }
        catch (e) { return false; }
    }

    // event_at must carry an offset (or Z), otherwise each guest's browser
    // would read it in their own time zone and show a different moment.
    const HAS_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

    async function loadSettings() {
        if (!keyLooksValid) {
            console.warn("[event] publishable key missing; using the built-in event time.");
            return;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        try {
            const response = await fetch(
                SUPABASE_URL + "/rest/v1/site_content?select=key,value&key=in.(event_at,event_timezone)",
                {
                    headers: {
                        apikey: SUPABASE_PUBLISHABLE_KEY,
                        Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY
                    },
                    signal: controller.signal
                }
            );
            if (!response.ok) throw new Error("HTTP " + response.status);

            const rows = await response.json();
            rows.forEach((row) => {
                if (row.key === "event_at") {
                    if (HAS_OFFSET.test(row.value) && !Number.isNaN(new Date(row.value).getTime())) {
                        settings.event_at = row.value;
                    } else {
                        console.warn("[event] event_at in the database is not a valid date with a time-zone offset; ignoring it.");
                    }
                }
                if (row.key === "event_timezone") {
                    if (validZone(row.value)) settings.event_timezone = row.value;
                    else console.warn("[event] event_timezone in the database is not a valid zone; ignoring it.");
                }
            });
            console.info("[event] settings loaded from the database.");

        } catch (error) {
            console.warn("[event] using the built-in event time:", error.message);
        } finally {
            clearTimeout(timer);
        }
    }

    // ---------- formatting ----------

    const fmt = (options, zone) =>
        new Intl.DateTimeFormat("en-US", { ...options, timeZone: zone });

    const tidy = (text) => text.replace(/[\u202f\u00a0]/g, " ");

    function setText(element, text) {
        if (element) element.textContent = text;
    }

    function guestZone() {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
        catch (e) { return null; }
    }

    // "In your time: ..." only when the guest's clock differs from the event's.
    function localLine(when, zone) {
        const mine = guestZone();
        if (!mine) return "";

        const wall = (z) => fmt({
            year: "numeric", month: "numeric", day: "numeric",
            hour: "numeric", minute: "numeric", hourCycle: "h23"
        }, z).format(when);
        if (wall(mine) === wall(zone)) return "";

        const day = (z) => fmt({ year: "numeric", month: "numeric", day: "numeric" }, z).format(when);
        const time = tidy(fmt({ hour: "numeric", minute: "2-digit", timeZoneName: "long" }, mine).format(when));

        if (day(mine) === day(zone)) return "In your time: " + time;

        const date = fmt({ weekday: "long", month: "long", day: "numeric" }, mine).format(when);
        return "In your time: " + date + " at " + time;
    }

    // ---------- put it on the page ----------

    function apply() {
        const when = new Date(settings.event_at);
        const zone = settings.event_timezone;

        const time = tidy(fmt({ hour: "numeric", minute: "2-digit", timeZoneName: "short" }, zone).format(when));
        const weekday = fmt({ weekday: "long" }, zone).format(when);
        const dayNumber = fmt({ day: "numeric" }, zone).format(when);
        const monthYear = fmt({ month: "long", year: "numeric" }, zone).format(when);
        const monthShort = fmt({ month: "short" }, zone).format(when).toUpperCase();
        const year = fmt({ year: "numeric" }, zone).format(when);
        const longDate = fmt({ weekday: "long", month: "long", day: "numeric", year: "numeric" }, zone).format(when);

        const section = document.getElementById("save-the-date");
        if (section) {
            section.dataset.eventDate = when.toISOString();   // the countdown reads this every second

            setText(section.querySelector(".sd-date-day"), weekday);
            setText(section.querySelector(".sd-date-num"), dayNumber);
            setText(section.querySelector(".sd-date-month"), monthYear);
            setText(section.querySelector(".sd-date-time"), time);

            setText(section.querySelector('.sd-coin[data-part="day"] strong'), dayNumber);
            setText(section.querySelector('.sd-coin[data-part="month"] strong'), monthShort);
            setText(section.querySelector('.sd-coin[data-part="year"] strong'), year);

            const anchor = section.querySelector(".sd-date-time");
            const line = localLine(when, zone);
            let local = section.querySelector(".sd-date-local");

            if (line && anchor) {
                if (!local) {
                    local = document.createElement("span");
                    local.className = "sd-date-local";
                    anchor.insertAdjacentElement("afterend", local);
                }
                local.textContent = line;
            } else if (local) {
                local.remove();
            }
        }

        setText(document.querySelector(".footer-date"), longDate + " \u00b7 " + time);

        console.info("[event] showing:", longDate, time, "| guest zone:", guestZone());
    }

    // ---------- start: wait for both the settings and the page sections ----------

    const settingsReady = loadSettings();
    const sectionsReady = new Promise((resolve) => {
        if (document.getElementById("save-the-date")) resolve();
        else document.addEventListener("sectionsLoaded", resolve, { once: true });
    });

    Promise.all([settingsReady, sectionsReady]).then(apply);
})();
