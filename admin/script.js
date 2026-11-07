
// Public by design: the project URL and the publishable key. Paste the key
// (starts with sb_publishable_) between the quotes. Never put a secret key here.
const SUPABASE_URL = "https://bcubwgmzbeqpedmhvmfj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "";

const keyLooksValid = /^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLISHABLE_KEY);
const db = keyLooksValid
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

let allResponses = [];

// ADMIN LOGIN
document.getElementById("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const button = this.querySelector("button");
    const message = document.getElementById("loginMessage");

    button.disabled = true;
    message.textContent = "Checking login...";

    try {
        if (!db) throw new Error("Admin is not connected yet (missing key).");

        const { error } = await db.auth.signInWithPassword({
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value
        });

        if (error) throw new Error("Wrong email or password.");

        if (!(await isAdmin())) {
            await db.auth.signOut();
            throw new Error("This account is not allowed to view RSVPs.");
        }

        this.reset();
        message.textContent = "";
        showDashboard();

    } catch (error) {
        message.textContent = error.message;
    }

    button.disabled = false;
});

// IS THE SIGNED-IN USER LISTED IN admins?
// (the admins_read_self policy lets a user see only their own row)
async function isAdmin() {
    const { data, error } = await db.from("admins").select("user_id").maybeSingle();
    return !error && !!data;
}

// CHECK LOGIN STATUS
async function checkLogin() {
    if (!db) {
        showLogin();
        document.getElementById("loginMessage").textContent =
            "Admin is not connected yet (missing key).";
        return;
    }

    const { data } = await db.auth.getSession();

    if (data.session && await isAdmin()) {
        showDashboard();
    } else {
        showLogin();
    }
}

// SHOW LOGIN
function showLogin() {
    document.getElementById("loginSection").hidden = false;
    document.getElementById("dashboardSection").hidden = true;
}

// SHOW DASHBOARD
function showDashboard() {
    document.getElementById("loginSection").hidden = true;
    document.getElementById("dashboardSection").hidden = false;

    loadResponses();
}

// LOAD RSVP RESPONSES
async function loadResponses() {
    const table = document.getElementById("responseTable");
    const status = document.getElementById("statusMessage");

    table.innerHTML = `
        <tr><td colspan="7">Loading responses...</td></tr>
    `;

    try {
        const { data, error } = await db
            .from("rsvps")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw new Error("Could not load responses");

        allResponses = data;

        let attendingCount = 0;
        let notAttendingCount = 0;
        let totalGuests = 0;

        allResponses.forEach(guest => {
            if (guest.attending === "Yes") {
                attendingCount++;
                totalGuests += Number(guest.guests) || 0;
            } else {
                notAttendingCount++;
            }
        });

        document.getElementById("totalResponses").textContent =
            allResponses.length;

        document.getElementById("attending").textContent =
            attendingCount;

        document.getElementById("notAttending").textContent =
            notAttendingCount;

        document.getElementById("totalGuests").textContent =
            totalGuests;

        displayResponses();

        status.textContent = "Responses updated successfully.";

    } catch (error) {
        table.innerHTML = `
            <tr><td colspan="7">Unable to load responses.</td></tr>
        `;

        status.textContent =
            "Sign in again, or check your connection.";
    }
}

// DISPLAY SEARCHED AND FILTERED RESPONSES
function displayResponses() {
    const search = document.getElementById("guestSearch").value
        .trim()
        .toLowerCase();

    const filter = document.getElementById("attendanceFilter").value;

    const filtered = allResponses.filter(guest => {
        const matchesName = String(guest.name)
            .toLowerCase()
            .includes(search);

        const matchesAttendance =
            filter === "All" || guest.attending === filter;

        return matchesName && matchesAttendance;
    });

    const table = document.getElementById("responseTable");

    table.innerHTML = "";

    if (filtered.length === 0) {
        table.innerHTML = `
            <tr><td colspan="7">No matching responses found.</td></tr>
        `;
        return;
    }

    filtered.forEach((guest, index) => {

        const values = [
            index + 1,
            guest.name,
            guest.attending,
            guest.guests,
            guest.message || "-",
            guest.created_at
                ? new Date(guest.created_at).toLocaleString()
                : "-"
        ];

        const row = document.createElement("tr");

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        // DELETE BUTTON
        const actionCell = document.createElement("td");

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.className = "delete-button";

        deleteButton.onclick = () => deleteResponse(guest.id);

        actionCell.appendChild(deleteButton);
        row.appendChild(actionCell);

        table.appendChild(row);
    });
}

// SEARCH GUESTS
document.getElementById("guestSearch").addEventListener(
    "input",
    displayResponses
);

// FILTER ATTENDANCE
document.getElementById("attendanceFilter").addEventListener(
    "change",
    displayResponses
);

// ONE CSV CELL: quote it, and stop Excel treating guest text as a formula
function csvCell(value) {
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
}

// DOWNLOAD RESPONSES AS CSV
async function downloadCSV() {
    try {
        const { data, error } = await db
            .from("rsvps")
            .select("*")
            .order("created_at", { ascending: true });

        if (error) throw new Error("Unable to download responses");

        if (data.length === 0) {
            alert("No RSVP responses available.");
            return;
        }

        const headers = [
            "Guest Name",
            "Attendance",
            "Number of Guests",
            "Wishes",
            "Submitted On"
        ];

        const rows = data.map(guest => [
            guest.name,
            guest.attending,
            guest.guests,
            guest.message || "",
            guest.created_at || ""
        ]);

        const csv = [headers, ...rows]
            .map(row => row.map(value => csvCell(value)).join(","))
            .join("\n");

        const blob = new Blob(
            ["\uFEFF" + csv],
            { type: "text/csv;charset=utf-8;" }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "Nyra_RSVP_Responses.csv";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

    } catch (error) {
        alert("Unable to download RSVP responses.");
    }
}

// DELETE RSVP RESPONSE
async function deleteResponse(id) {

    const confirmDelete = confirm(
        "Are you sure you want to delete this RSVP response?"
    );

    if (!confirmDelete) return;

    try {
        // .select() returns the deleted rows, so 0 rows means nothing was deleted
        const { data, error } = await db
            .from("rsvps")
            .delete()
            .eq("id", id)
            .select();

        if (error || !data || data.length === 0) {
            throw new Error("Delete failed");
        }

        alert("RSVP response deleted successfully!");

        await loadResponses();

    } catch (error) {
        alert(error.message);
    }
}

// ADMIN LOGOUT
document.getElementById("logoutButton").addEventListener(
    "click",
    async function() {
        await db.auth.signOut();

        allResponses = [];

        document.getElementById("guestSearch").value = "";
        document.getElementById("attendanceFilter").value = "All";

        showLogin();

        document.getElementById("loginMessage").textContent =
            "You have logged out successfully.";
    }
);

// START
checkLogin();
