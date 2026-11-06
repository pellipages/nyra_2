
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database(path.join(__dirname, "rsvp.db"));

// CORS
app.use(cors({
    origin: [
        "http://localhost:8000",
        "http://localhost:8001"
    ],
    credentials: true
}));

app.use(express.json());

// SESSION
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 2 * 60 * 60 * 1000
    }
}));

// CHECK ENVIRONMENT VARIABLES
if (
    !process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD ||
    !process.env.SESSION_SECRET
) {
    throw new Error(
        "Please configure ADMIN_USERNAME, ADMIN_PASSWORD and SESSION_SECRET in .env"
    );
}

const adminPasswordHash = bcrypt.hashSync(
    process.env.ADMIN_PASSWORD,
    12
);

// CREATE RSVP TABLE
db.exec(`
    CREATE TABLE IF NOT EXISTS rsvps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        attending TEXT NOT NULL,
        guests INTEGER NOT NULL,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// CHECK ADMIN LOGIN
function requireAdmin(req, res, next) {
    if (req.session.admin) {
        return next();
    }

    res.status(401).json({
        error: "Please log in first"
    });
}

// ADMIN LOGIN
app.post("/api/login", (req, res, next) => {
    const { username, password } = req.body;

    if (
        username !== process.env.ADMIN_USERNAME ||
        typeof password !== "string" ||
        !bcrypt.compareSync(password, adminPasswordHash)
    ) {
        return res.status(401).json({
            error: "Invalid username or password"
        });
    }

    req.session.regenerate(err => {
        if (err) return next(err);

        req.session.admin = true;

        req.session.save(err => {
            if (err) return next(err);

            res.json({
                success: true,
                message: "Login successful"
            });
        });
    });
});

// CHECK LOGIN STATUS
app.get("/api/auth/status", (req, res) => {
    res.json({
        loggedIn: !!req.session.admin
    });
});

// ADMIN LOGOUT
app.post("/api/logout", requireAdmin, (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({
                error: "Logout failed"
            });
        }

        res.clearCookie("connect.sid");

        res.json({
            success: true
        });
    });
});

// PUBLIC RSVP SUBMISSION
app.post("/api/rsvp", (req, res) => {
    const { name, attending, guests, message } = req.body;

    if (
        typeof name !== "string" ||
        !name.trim() ||
        !["Yes", "No"].includes(attending) ||
        !Number.isInteger(guests) ||
        guests < 0 ||
        guests > 20 ||
        (attending === "Yes" && guests < 1) ||
        (attending === "No" && guests !== 0)
    ) {
        return res.status(400).json({
            error: "Please enter valid RSVP details"
        });
    }

    const result = db.prepare(`
        INSERT INTO rsvps (name, attending, guests, message)
        VALUES (?, ?, ?, ?)
    `).run(
        name.trim(),
        attending,
        guests,
        typeof message === "string" ? message.trim() : ""
    );

    res.json({
        success: true,
        message: "RSVP submitted successfully!",
        id: result.lastInsertRowid
    });
});

// DELETE RSVP RESPONSE (ADMIN ONLY)
app.delete("/api/rsvps/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            error: "Invalid response ID"
        });
    }

    const result = db.prepare(
        "DELETE FROM rsvps WHERE id = ?"
    ).run(id);

    if (result.changes === 0) {
        return res.status(404).json({
            error: "RSVP response not found"
        });
    }

    res.json({
        success: true,
        message: "RSVP response deleted successfully"
    });
});

// PROTECTED ADMIN RESPONSES
app.get("/api/rsvps", requireAdmin, (req, res) => {
    const responses = db.prepare(
        "SELECT * FROM rsvps ORDER BY id DESC"
    ).all();

    res.json(responses);
});

// START SERVER
app.listen(5000, () => {
    console.log("RSVP server running at http://localhost:5000");
});
