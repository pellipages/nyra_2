// ==========================================================
// NYRA ADMIN — sign in with Supabase email + password.
// Console lines start with [admin]. Passwords, emails, guest
// names and blessings are never logged.
// ==========================================================

const ADMIN_BUILD = "2026-11-07-admin-ui";

// Public by design: the project URL and the publishable key. Paste the key
// (starts with sb_publishable_) between the quotes. Never put a secret key here.
const SUPABASE_URL = "https://bcubwgmzbeqpedmhvmfj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "";

const keyLooksValid = /^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLISHABLE_KEY);
const libraryLoaded = !!(window.supabase && window.supabase.createClient);
const db = (keyLooksValid && libraryLoaded)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

console.info(
    "[admin] script loaded. build:", ADMIN_BUILD,
    "| supabase library loaded:", libraryLoaded,
    "| key looks valid:", keyLooksValid,
    "| page origin:", location.origin
);
if (!libraryLoaded) console.error("[admin] supabase-js did not load. Network or content blocker? Check the Network tab.");
if (!keyLooksValid) console.error("[admin] SUPABASE_PUBLISHABLE_KEY is empty or malformed in admin/script.js.");

const $ = (id) => document.getElementById(id);
let allResponses = [];
let toastTimer = null;

// ---------- small UI helpers ----------

function setBanner(el, state, text) {
    el.dataset.state = text ? state : "";
    el.textContent = text || "";
    el.hidden = !text;
}

function showToast(text, state = "success") {
    const toast = $("toast");
    toast.textContent = text;
    toast.dataset.state = state;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function setBusy(button, busy, busyText, idleText) {
    button.disabled = busy;
    button.classList.toggle("is-busy", busy);
    const label = button.querySelector(".button-label");
    if (label) label.textContent = busy ? busyText : idleText;
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
    ]);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function showLogin(text, state = "info") {
    $("loginSection").hidden = false;
    $("dashboardSection").hidden = true;
    setBanner($("loginMessage"), state, text || "");
    $("email").focus();
}

function showDashboard(email) {
    $("loginSection").hidden = true;
    $("dashboardSection").hidden = false;
    $("adminWho").textContent = email || "";
    window.scrollTo(0, 0);
    loadResponses();
}

// ---------- sign in ----------

function friendlyAuthError(error) {
    const code = error.code || "";
    if (!error.status || error.name === "AuthRetryableFetchError") {
        return "We couldn't reach the server. Please check your connection and try again.";
    }
    if (code === "email_not_confirmed") {
        return "This account hasn't been confirmed yet. In Supabase, open Authentication → Users and confirm it.";
    }
    if (error.status === 429 || code.includes("rate_limit")) {
        return "Too many attempts. Please wait a minute and try again.";
    }
    if (code === "invalid_credentials" || error.status === 400) {
        return "That email and password don't match. Please check them and try again.";
    }
    return "We couldn't sign you in just now. Please try again.";
}

// Signed in is not the same as allowed in. The person must be listed in
// admins, and the database function is_admin() must agree.
async function checkAdminAccess() {
    const listed = await db.from("admins").select("user_id").maybeSingle();
    if (listed.error) {
        console.error("[admin] admins lookup failed:", listed.error.code, listed.error.message);
        return { ok: false, reason: "error" };
    }
    if (!listed.data) {
        console.warn("[admin] signed in, but this user has no row in the admins table.");
        return { ok: false, reason: "not-listed" };
    }

    const gate = await db.rpc("is_admin");
    if (gate.error) {
        console.error("[admin] is_admin() call failed:", gate.error.code, gate.error.message);
        return { ok: false, reason: "error" };
    }
    if (gate.data !== true) {
        console.error("[admin] user IS in admins but is_admin() returned false. Has migration 20261107120000_admin_no_mfa.sql been run?");
        return { ok: false, reason: "db-not-updated" };
    }

    console.info("[admin] admin access confirmed.");
    return { ok: true };
}

const ACCESS_TEXT = {
    "not-listed": "You're signed in, but this account isn't on the admin list.",
    "db-not-updated": "You're signed in, but the database isn't set up for admin access yet. The latest database update (the no-MFA migration) still needs to be run.",
    "error": "You're signed in, but we couldn't confirm admin access. Please try again."
};

$("loginForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const button = $("loginButton");
    const message = $("loginMessage");
    const email = $("email").value.trim();
    const password = $("password").value;

    if (!db) { showLogin(connectionProblem(), "error"); return; }
    if (!email || !password) {
        setBanner(message, "error", "Please enter both your email and your password.");
        return;
    }

    setBusy(button, true, "Signing in…", "Sign in ♡");
    setBanner(message, "info", "Signing you in…");
    console.info("[admin] sign-in attempt started.");

    try {
        const { data, error } = await withTimeout(
            db.auth.signInWithPassword({ email, password }), 15000
        );

        if (error) {
            console.warn("[admin] sign-in refused:", error.status, error.code, error.message);
            setBanner(message, "error", friendlyAuthError(error));
            return;
        }

        console.info("[admin] password accepted. checking admin access…");
        setBanner(message, "info", "Password accepted. Checking access…");

        const access = await withTimeout(checkAdminAccess(), 15000);
        if (!access.ok) {
            await db.auth.signOut();
            setBanner(message, "error", ACCESS_TEXT[access.reason]);
            return;
        }

        setBanner(message, "success", "Welcome back ♡ Opening your dashboard…");
        await wait(700);
        this.reset();
        showDashboard(data.user.email);

    } catch (err) {
        console.error("[admin] sign-in did not finish:", err.message);
        setBanner(message, "error",
            err.message === "timeout"
                ? "The server is taking too long to answer. Please try again in a moment."
                : "Something went wrong while signing in. Please try again.");
    } finally {
        setBusy(button, false, "Signing in…", "Sign in ♡");
    }
});

$("togglePassword").addEventListener("click", function () {
    const field = $("password");
    const show = field.type === "password";
    field.type = show ? "text" : "password";
    this.textContent = show ? "Hide" : "Show";
    this.setAttribute("aria-label", show ? "Hide password" : "Show password");
    this.setAttribute("aria-pressed", String(show));
});

function connectionProblem() {
    if (!libraryLoaded) return "A required script couldn't load. Please check your connection, turn off any content blocker, and refresh the page.";
    if (!keyLooksValid) return "Admin sign-in isn't connected yet: the project's publishable key is missing from admin/script.js.";
    return "";
}

// ---------- start-up: is there already a session? ----------

async function checkLogin() {
    if (!db) {
        showLogin(connectionProblem(), "error");
        return;
    }

    try {
        const { data } = await db.auth.getSession();
        if (!data.session) {
            console.info("[admin] no saved session. showing sign-in.");
            showLogin();
            return;
        }
        console.info("[admin] saved session found. checking admin access…");
        const access = await checkAdminAccess();
        if (access.ok) {
            showDashboard(data.session.user.email);
        } else {
            showLogin(ACCESS_TEXT[access.reason], "error");
        }
    } catch (err) {
        console.error("[admin] start-up check failed:", err.message);
        showLogin();
    }
}

// If the session ends elsewhere (other tab, expiry), return to sign-in.
if (db) {
    db.auth.onAuthStateChange((event) => {
        console.info("[admin] auth event:", event);
        if (event === "SIGNED_OUT" && $("loginSection").hidden) {
            showLogin("You've been signed out. Please sign in again.", "info");
        }
    });
}

// ---------- load + show RSVPs ----------

async function loadResponses(manual = false) {
    const table = $("responseTable");
    const status = $("statusMessage");
    const button = $("refreshButton");

    button.disabled = true;
    setBanner(status, "info", "Loading responses…");
    table.innerHTML = '<tr><td colspan="7" class="empty-row">Loading responses…</td></tr>';

    try {
        const { data, error } = await withTimeout(
            db.from("rsvps").select("*").order("created_at", { ascending: false }), 15000
        );

        if (error) {
            console.error("[admin] loading RSVPs failed:", error.code, error.message);
            const expired = error.code === "PGRST301" || /jwt/i.test(error.message || "");
            if (expired) { showLogin("Your session ended. Please sign in again.", "info"); return; }
            throw new Error("load-failed");
        }

        allResponses = data;
        console.info("[admin] loaded", data.length, "RSVP(s).");

        let yes = 0, no = 0, guests = 0;
        data.forEach((g) => {
            if (g.attending === "Yes") { yes++; guests += Number(g.guests) || 0; }
            else no++;
        });

        $("totalResponses").textContent = data.length;
        $("attending").textContent = yes;
        $("notAttending").textContent = no;
        $("totalGuests").textContent = guests;
        $("lastUpdated").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

        setBanner(status, "", "");
        displayResponses();
        if (manual) showToast("Responses refreshed ♡");

    } catch (err) {
        console.error("[admin] could not load responses:", err.message);
        table.innerHTML = '<tr><td colspan="7" class="empty-row">We couldn\'t load the responses.</td></tr>';
        setBanner(status, "error", "We couldn't load the responses. Please press Refresh to try again.");
    } finally {
        button.disabled = false;
    }
}

function displayResponses() {
    const search = $("guestSearch").value.trim().toLowerCase();
    const filter = $("attendanceFilter").value;
    const table = $("responseTable");

    const rows = allResponses.filter((g) =>
        String(g.name).toLowerCase().includes(search) &&
        (filter === "All" || g.attending === filter)
    );

    table.innerHTML = "";

    if (rows.length === 0) {
        const empty = allResponses.length === 0
            ? "No RSVPs yet. They will appear here as guests respond."
            : "No responses match your search.";
        table.innerHTML = `<tr><td colspan="7" class="empty-row">${empty}</td></tr>`;
        return;
    }

    rows.forEach((guest, index) => {
        const row = document.createElement("tr");

        const add = (label, content, className) => {
            const cell = document.createElement("td");
            cell.dataset.label = label;
            if (className) cell.className = className;
            if (content instanceof Node) cell.appendChild(content);
            else cell.textContent = content;
            row.appendChild(cell);
        };

        const pill = document.createElement("span");
        const yes = guest.attending === "Yes";
        pill.className = "pill " + (yes ? "yes" : "no");
        pill.textContent = yes ? "Attending" : "Not attending";

        add("#", index + 1);
        add("Guest", guest.name);
        add("Attending", pill);
        add("Guests", yes ? guest.guests : "—");
        add("Blessing", guest.message || "—", "blessing");
        add("Received", guest.created_at
            ? new Date(guest.created_at).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
            : "—", "when");

        const del = document.createElement("button");
        del.type = "button";
        del.className = "delete-button";
        del.textContent = "Delete";
        del.addEventListener("click", () => deleteResponse(guest));
        add("", del);

        table.appendChild(row);
    });
}

$("guestSearch").addEventListener("input", displayResponses);
$("attendanceFilter").addEventListener("change", displayResponses);
$("refreshButton").addEventListener("click", () => loadResponses(true));

// ---------- CSV ----------

// One CSV cell: quote it, and stop Excel treating guest text as a formula.
function csvCell(value) {
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
}

$("exportButton").addEventListener("click", async function () {
    try {
        const { data, error } = await db.from("rsvps").select("*").order("created_at", { ascending: true });
        if (error) throw new Error(error.message);

        if (data.length === 0) { showToast("There are no RSVPs to download yet."); return; }

        const headers = ["Guest Name", "Attendance", "Number of Guests", "Wishes", "Submitted On"];
        const rows = data.map((g) => [g.name, g.attending, g.guests, g.message || "", g.created_at || ""]);
        const csv = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");

        const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "Nyra_RSVP_Responses.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        console.info("[admin] CSV downloaded with", data.length, "row(s).");
        showToast("Download started ↓");

    } catch (err) {
        console.error("[admin] CSV download failed:", err.message);
        showToast("We couldn't prepare the download. Please try again.", "error");
    }
});

// ---------- delete (with a themed confirmation) ----------

async function confirmDelete(guest) {
    const dialog = $("confirmDialog");
    $("confirmText").textContent = `${guest.name}'s response will be removed.`;

    if (typeof dialog.showModal !== "function") {
        return window.confirm(`Delete ${guest.name}'s response? This can't be undone.`);
    }

    return new Promise((resolve) => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue === "delete"), { once: true });
        dialog.showModal();
    });
}

async function deleteResponse(guest) {
    if (!(await confirmDelete(guest))) return;

    try {
        // .select() hands back the deleted rows, so 0 rows means nothing was deleted
        const { data, error } = await db.from("rsvps").delete().eq("id", guest.id).select();

        if (error || !data || data.length === 0) {
            console.error("[admin] delete did not remove a row:", error ? error.code + " " + error.message : "0 rows");
            showToast("That response couldn't be deleted. Please try again.", "error");
            return;
        }

        console.info("[admin] deleted 1 RSVP.");
        showToast("Response deleted.");
        await loadResponses();

    } catch (err) {
        console.error("[admin] delete failed:", err.message);
        showToast("That response couldn't be deleted. Please try again.", "error");
    }
}

// ---------- sign out ----------

$("logoutButton").addEventListener("click", async function () {
    console.info("[admin] signing out.");
    await db.auth.signOut();

    allResponses = [];
    $("guestSearch").value = "";
    $("attendanceFilter").value = "All";

    showLogin("You've been signed out. Thank you ♡", "success");
});

// START
checkLogin();
