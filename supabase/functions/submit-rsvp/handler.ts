// =====================================================================
// submit-rsvp: request handling logic (no network calls of its own).
// The real Turnstile / database calls are wired in index.ts, and the
// tests in handler_test.ts plug in fakes, so every rule here is tested.
//
// Order of checks (cheap and side-effect-free first):
//   1. method + allowed Origin
//   2. content type + body size
//   3. JSON shape + strict validation of every field
//   4. honeypot (silently pretend success to bots)
//   5. per-IP rate limits
//   6. OPTIONAL bot check (Cloudflare Turnstile + hostname check). It runs
//      only when a verifier is supplied; with none, steps 4, 5 and 7 are
//      the spam defence.
//   7. global rate limit (circuit breaker)
//   8. insert
// Errors never reveal internals; details go to the server log only.
// =====================================================================

export interface Config {
  allowedOrigins: string[];
  ipHashSalt: string;
}

export interface TurnstileResult {
  success: boolean;
  hostname?: string;
  unavailable?: boolean; // Cloudflare unreachable: fail closed with a retry message
}

export interface RsvpRow {
  name: string;
  attending: "Yes" | "No";
  guests: number;
  message: string;
  ip_hash: string;
}

export interface Deps {
  config: Config;
  /** Optional. When omitted, the bot check is OFF and no token is needed. */
  verifyTurnstile?: (token: string, ip: string | null) => Promise<TurnstileResult>;
  consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
  insertRsvp(row: RsvpRow): Promise<void>;
}

export const MAX_BODY_BYTES = 4096;
const ALLOWED_KEYS = new Set(["name", "attending", "guests", "message", "turnstileToken", "website"]);

// control characters (names) / control characters except newline+tab (messages)
const CONTROL_ANY = /[\u0000-\u001F\u007F-\u009F]/;
const CONTROL_NO_NEWLINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
// bidi override characters can make names look like something else in the admin table
const BIDI_TRICKS = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/;

// ---- small helpers ------------------------------------------------------

const codePointLength = (s: string) => [...s].length;

function json(
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
  extra: Record<string, string> = {},
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function readLimitedBody(req: Request, max: number): Promise<string | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && Number(declared) > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(all);
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function clientIp(req: Request): string | null {
  // Cloudflare sets cf-connecting-ip itself, so the visitor cannot forge it.
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
}

// ---- validation -----------------------------------------------------------

type Validated =
  | { ok: true; value: { name: string; attending: "Yes" | "No"; guests: number; message: string; token: string } }
  | { ok: false };

export function validate(body: Record<string, unknown>, requireToken = true): Validated {
  for (const k of Object.keys(body)) if (!ALLOWED_KEYS.has(k)) return { ok: false };

  // name
  if (typeof body.name !== "string") return { ok: false };
  const name = body.name.normalize("NFC").replace(/\s+/g, " ").trim();
  const nameLen = codePointLength(name);
  if (nameLen < 1 || nameLen > 80) return { ok: false };
  if (CONTROL_ANY.test(name) || BIDI_TRICKS.test(name)) return { ok: false };

  // attending + guests
  if (body.attending !== "Yes" && body.attending !== "No") return { ok: false };
  const attending = body.attending;
  const guests = body.guests;
  if (typeof guests !== "number" || !Number.isInteger(guests)) return { ok: false };
  if (attending === "Yes" && (guests < 1 || guests > 20)) return { ok: false };
  if (attending === "No" && guests !== 0) return { ok: false };

  // message (optional)
  let message = "";
  if (body.message !== undefined && body.message !== null) {
    if (typeof body.message !== "string") return { ok: false };
    message = body.message.normalize("NFC").replace(/\r\n?/g, "\n").trim();
    if (codePointLength(message) > 500) return { ok: false };
    if (CONTROL_NO_NEWLINE.test(message) || BIDI_TRICKS.test(message)) return { ok: false };
  }

  // bot-check token: required only when the bot check is switched on.
  // If a token is sent anyway it must still look sane.
  let token = "";
  if (body.turnstileToken !== undefined && body.turnstileToken !== null) {
    if (typeof body.turnstileToken !== "string" || body.turnstileToken.length > 2048) return { ok: false };
    token = body.turnstileToken;
  }
  if (requireToken && token.length < 1) return { ok: false };

  return { ok: true, value: { name, attending, guests, message, token } };
}

// ---- the handler ------------------------------------------------------------

export function createHandler(deps: Deps) {
  const { config } = deps;
  const allowedHostnames = new Set(config.allowedOrigins.map((o) => new URL(o).hostname));
  const botCheck = deps.verifyTurnstile;

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get("origin");
    const originAllowed = origin !== null && config.allowedOrigins.includes(origin);
    const corsOrigin = originAllowed ? origin : null;

    // 1. method + origin ---------------------------------------------------
    if (req.method === "OPTIONS") {
      if (!originAllowed) return json(403, { code: "forbidden" }, null);
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin!,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin",
        },
      });
    }
    if (req.method !== "POST") {
      return json(405, { code: "method_not_allowed" }, corsOrigin, { Allow: "POST, OPTIONS" });
    }
    if (!originAllowed) return json(403, { code: "forbidden" }, null);

    // 2. content type + size -----------------------------------------------
    const ctype = (req.headers.get("content-type") ?? "").toLowerCase();
    if (!ctype.startsWith("application/json")) {
      return json(415, { code: "unsupported_media_type" }, corsOrigin);
    }
    let raw: string | null;
    try {
      raw = await readLimitedBody(req, MAX_BODY_BYTES);
    } catch {
      return json(400, { code: "invalid_input" }, corsOrigin);
    }
    if (raw === null) return json(413, { code: "payload_too_large" }, corsOrigin);

    // 3. shape + validation ------------------------------------------------
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json(400, { code: "invalid_input" }, corsOrigin);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(400, { code: "invalid_input" }, corsOrigin);
    }
    const body = parsed as Record<string, unknown>;

    // 4. honeypot: bots fill hidden fields, humans never see them -----------
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return json(200, { ok: true }, corsOrigin);
    }

    const v = validate(body, botCheck !== undefined);
    if (!v.ok) return json(400, { code: "invalid_input" }, corsOrigin);

    try {
      // 5. per-IP rate limits ------------------------------------------------
      const ip = clientIp(req);
      const ipHash = await hashIp(ip ?? "unknown", config.ipHashSalt);

      const burstOk = await deps.consumeRateLimit(`rsvp:burst:${ipHash}`, 5, 5 * 60);
      const dayOk = burstOk && await deps.consumeRateLimit(`rsvp:day:${ipHash}`, 20, 24 * 60 * 60);
      if (!burstOk || !dayOk) {
        return json(429, { code: "rate_limited" }, corsOrigin, { "Retry-After": burstOk ? "3600" : "300" });
      }

      // 6. bot check (only if switched on) --------------------------------------
      if (botCheck) {
        const t = await botCheck(v.value.token, ip);
        if (t.unavailable) return json(503, { code: "try_again" }, corsOrigin, { "Retry-After": "30" });
        if (!t.success || !t.hostname || !allowedHostnames.has(t.hostname)) {
          return json(400, { code: "bot_check_failed" }, corsOrigin);
        }
      }

      // 7. global circuit breaker ---------------------------------------------
      const globalOk = await deps.consumeRateLimit("rsvp:global", 150, 60 * 60);
      if (!globalOk) return json(429, { code: "rate_limited" }, corsOrigin, { "Retry-After": "600" });

      // 8. save ------------------------------------------------------------------
      await deps.insertRsvp({
        name: v.value.name,
        attending: v.value.attending,
        guests: v.value.guests,
        message: v.value.message,
        ip_hash: ipHash,
      });
      return json(200, { ok: true }, corsOrigin);
    } catch (err) {
      // Log the reason for you; the guest only sees a generic message.
      console.error("submit-rsvp failed:", err instanceof Error ? err.message : "unknown error");
      return json(500, { code: "server_error" }, corsOrigin);
    }
  };
}
