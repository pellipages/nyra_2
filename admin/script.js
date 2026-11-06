
const API = "http://localhost:5000/api";

let allResponses = [];

// ADMIN LOGIN
document.getElementById("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const button = this.querySelector("button");
    const message = document.getElementById("loginMessage");

    button.disabled = true;
    message.textContent = "Checking login...";

    try {
        const response = await fetch(`${API}/login`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: document.getElementById("username").value,
                password: document.getElementById("password").value
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Login failed");
        }

        this.reset();
        showDashboard();

    } catch (error) {
        message.textContent = error.message;
    }

    button.disabled = false;
});

// CHECK LOGIN STATUS
async function checkLogin() {
    try {
        const response = await fetch(`${API}/auth/status`, {
            credentials: "include"
        });

        const result = await response.json();

        if (result.loggedIn) {
            showDashboard();
        } else {
            showLogin();
        }

    } catch (error) {
        showLogin();

        document.getElementById("loginMessage").textContent =
            "Cannot connect to the RSVP server.";
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
        const response = await fetch(`${API}/rsvps`, {
            credentials: "include"
        });

        if (response.status === 401) {
            showLogin();
            return;
        }

        if (!response.ok) {
            throw new Error("Could not load responses");
        }

        allResponses = await response.json();

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
            <tr><td colspan="7">Unable to connect to the RSVP server.</td></tr>
        `;

        status.textContent =
            "Make sure your backend server is running.";
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
                ? new Date(guest.created_at + " UTC").toLocaleString()
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

// DOWNLOAD RESPONSES AS CSV
async function downloadCSV() {
    try {
        const response = await fetch(`${API}/rsvps`, {
            credentials: "include"
        });

        if (response.status === 401) {
            showLogin();
            return;
        }

        if (!response.ok) {
            throw new Error("Unable to download responses");
        }

        const data = await response.json();

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
            .map(row => row.map(value =>
                `"${String(value).replace(/"/g, '""')}"`
            ).join(","))
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
        const response = await fetch(`${API}/rsvps/${id}`, {
            method: "DELETE",
            credentials: "include"
        });

        const result = await response.json();

        if (response.status === 401) {
            showLogin();
            return;
        }

        if (!response.ok) {
            throw new Error(result.error || "Delete failed");
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
        try {
            const response = await fetch(`${API}/logout`, {
                method: "POST",
                credentials: "include"
            });

            if (response.ok) {
                allResponses = [];

                document.getElementById("guestSearch").value = "";
                document.getElementById("attendanceFilter").value = "All";

                showLogin();

                document.getElementById("loginMessage").textContent =
                    "You have logged out successfully.";
            }

        } catch (error) {
            document.getElementById("statusMessage").textContent =
                "Unable to log out. Please try again.";
        }
    }
);

// START
checkLogin();
