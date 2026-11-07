// Run with:  deno test supabase/functions/submit-rsvp/handler_test.ts
import assert from "node:assert/strict";
import { createHandler, MAX_BODY_BYTES, type Deps, type RsvpRow, type TurnstileResult } from "./handler.ts";

const SITE = "https://nyra-test.vercel.app";

function setup(over: Partial<{
  botCheck: boolean; // default true; false = Turnstile switched off
  turnstile: TurnstileResult;
  limits: (key: string) => boolean;
  insertThrows: boolean;
}> = {}) {
  const calls = { turnstile: [] as { token: string; ip: string | null }[], limits: [] as string[], inserts: [] as RsvpRow[] };
  const deps: Deps = {
    config: { allowedOrigins: [SITE, "https://nyra.example.com"], ipHashSalt: "test-salt-1234567890" },
    verifyTurnstile: over.botCheck === false ? undefined : (token, ip) => {
      calls.turnstile.push({ token, ip });
      return Promise.resolve(over.turnstile ?? { success: true, hostname: "nyra-test.vercel.app" });
    },
    consumeRateLimit: (key) => {
      calls.limits.push(key);
      return Promise.resolve(over.limits ? over.limits(key) : true);
    },
    insertRsvp: (row) => {
      if (over.insertThrows) return Promise.reject(new Error("db exploded: secret-detail-123"));
      calls.inserts.push(row);
      return Promise.resolve();
    },
  };
  return { handle: createHandler(deps), calls };
}

const good = { name: "Anil Kumar", attending: "Yes", guests: 2, message: "Congratulations!", turnstileToken: "tok", website: "" };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://x.supabase.co/functions/v1/submit-rsvp", {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/json", "cf-connecting-ip": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const code = async (r: Response) => (await r.json()).code;

// ---- transport rules ------------------------------------------------------
Deno.test("preflight from allowed origin is accepted with exact origin (not *)", async () => {
  const { handle } = setup();
  const r = await handle(new Request("https://x/f", { method: "OPTIONS", headers: { origin: SITE } }));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), SITE);
});
Deno.test("preflight from unknown origin is refused", async () => {
  const { handle } = setup();
  const r = await handle(new Request("https://x/f", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
  assert.equal(r.status, 403);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});
Deno.test("GET is refused", async () => {
  const { handle } = setup();
  assert.equal((await handle(new Request("https://x/f", { method: "GET", headers: { origin: SITE } }))).status, 405);
});
Deno.test("POST without Origin is refused with no side effects", async () => {
  const { handle, calls } = setup();
  const req = new Request("https://x/f", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(good) });
  assert.equal((await handle(req)).status, 403);
  assert.equal(calls.limits.length + calls.turnstile.length + calls.inserts.length, 0);
});
Deno.test("POST from unknown origin is refused", async () => {
  const { handle, calls } = setup();
  assert.equal((await handle(post(good, { origin: "https://evil.example" }))).status, 403);
  assert.equal(calls.inserts.length, 0);
});
Deno.test("wrong content type is refused", async () => {
  const { handle } = setup();
  assert.equal((await handle(post(good, { "content-type": "text/plain" }))).status, 415);
});
Deno.test("oversized body is refused (declared and streamed)", async () => {
  const { handle } = setup();
  const big = JSON.stringify({ ...good, message: "a".repeat(MAX_BODY_BYTES + 10) });
  assert.equal((await handle(post(big))).status, 413);
  const streamed = new Request("https://x/f", {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/json" },
    body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } }),
    // @ts-ignore needed by Deno for streaming request bodies
    duplex: "half",
  });
  assert.equal((await handle(streamed)).status, 413);
});
Deno.test("broken JSON, arrays, null and invalid UTF-8 are refused", async () => {
  const { handle } = setup();
  for (const b of ["{not json", "[]", "null", "42"]) assert.equal((await handle(post(b))).status, 400, b);
  const bad = new Request("https://x/f", { method: "POST", headers: { origin: SITE, "content-type": "application/json" }, body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]) });
  assert.equal((await handle(bad)).status, 400);
});

// ---- happy path --------------------------------------------------------------
Deno.test("valid RSVP is saved once, with hashed IP, after bot check", async () => {
  const { handle, calls } = setup();
  const r = await handle(post(good));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(r.headers.get("access-control-allow-origin"), SITE);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(calls.inserts.length, 1);
  const row = calls.inserts[0];
  assert.equal(row.name, "Anil Kumar");
  assert.match(row.ip_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(row).includes("203.0.113.7"), "raw IP must never be stored");
  assert.deepEqual(calls.turnstile, [{ token: "tok", ip: "203.0.113.7" }]);
});
Deno.test("'No' with 0 guests is saved; message is optional", async () => {
  const { handle, calls } = setup();
  const r = await handle(post({ name: "Priya", attending: "No", guests: 0, turnstileToken: "t" }));
  assert.equal(r.status, 200);
  assert.equal(calls.inserts[0].message, "");
});
Deno.test("Telugu and emoji names are accepted; length counts characters", async () => {
  const { handle, calls } = setup();
  assert.equal((await handle(post({ ...good, name: "నైరా ❤️ Reddy" }))).status, 200);
  assert.equal(calls.inserts.length, 1);
  const eighty = "😀".repeat(80);
  assert.equal((await handle(post({ ...good, name: eighty }))).status, 200);
  assert.equal((await handle(post({ ...good, name: eighty + "😀" }))).status, 400);
});
Deno.test("messages keep newlines (CRLF normalised) and are trimmed", async () => {
  const { handle, calls } = setup();
  await handle(post({ ...good, message: "  Line one\r\nLine two  " }));
  assert.equal(calls.inserts[0].message, "Line one\nLine two");
});
Deno.test("HTML in a name is stored as plain text, not executed or altered", async () => {
  const { handle, calls } = setup();
  await handle(post({ ...good, name: "<img src=x onerror=alert(1)>" }));
  assert.equal(calls.inserts[0].name, "<img src=x onerror=alert(1)>");
});

// ---- validation: every bad input is refused BEFORE any side effect ------------------
const bad: [string, Record<string, unknown>][] = [
  ["missing name", { ...good, name: undefined }],
  ["empty name", { ...good, name: "   " }],
  ["81-char name", { ...good, name: "n".repeat(81) }],
  ["name is a number", { ...good, name: 5 }],
  ["control char in name", { ...good, name: "bad\u0007name" }],
  ["newline in name collapses but null byte does not", { ...good, name: "a\u0000b" }],
  ["bidi override in name", { ...good, name: "Anil \u202Egnirts" }],
  ["attending Maybe", { ...good, attending: "Maybe" }],
  ["attending lowercase", { ...good, attending: "yes" }],
  ["attending boolean", { ...good, attending: true }],
  ["Yes with 0 guests", { ...good, guests: 0 }],
  ["Yes with 21 guests", { ...good, guests: 21 }],
  ["Yes with 1.5 guests", { ...good, guests: 1.5 }],
  ["guests as string", { ...good, guests: "2" }],
  ["negative guests", { ...good, guests: -1 }],
  ["No with 2 guests", { ...good, attending: "No", guests: 2 }],
  ["guests NaN-like", { ...good, guests: null }],
  ["501-char message", { ...good, message: "m".repeat(501) }],
  ["message not a string", { ...good, message: { a: 1 } }],
  ["control char in message", { ...good, message: "hi\u0001there" }],
  ["missing token", { ...good, turnstileToken: undefined }],
  ["empty token", { ...good, turnstileToken: "" }],
  ["huge token", { ...good, turnstileToken: "t".repeat(2049) }],
  ["unknown extra field", { ...good, isAdmin: true }],
  ["attempt to set created_at", { ...good, created_at: "2020-01-01" }],
  ["attempt to set id", { ...good, id: "x" }],
];
for (const [label, body] of bad) {
  Deno.test(`rejects: ${label}`, async () => {
    const { handle, calls } = setup();
    const r = await handle(post(body));
    assert.equal(r.status, 400);
    assert.equal(await code(r), "invalid_input");
    assert.equal(calls.limits.length + calls.turnstile.length + calls.inserts.length, 0, "no side effects");
  });
}

// ---- bots ------------------------------------------------------------------------------
Deno.test("honeypot filled: fake success, nothing saved, no Turnstile call", async () => {
  const { handle, calls } = setup();
  const r = await handle(post({ ...good, website: "http://spam.example" }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(calls.inserts.length + calls.turnstile.length + calls.limits.length, 0);
});
Deno.test("failed bot check: refused, nothing saved", async () => {
  const { handle, calls } = setup({ turnstile: { success: false } });
  const r = await handle(post(good));
  assert.equal(r.status, 400);
  assert.equal(await code(r), "bot_check_failed");
  assert.equal(calls.inserts.length, 0);
});
Deno.test("token solved on a DIFFERENT website is refused", async () => {
  const { handle, calls } = setup({ turnstile: { success: true, hostname: "evil.example" } });
  assert.equal(await code(await handle(post(good))), "bot_check_failed");
  assert.equal(calls.inserts.length, 0);
});
Deno.test("success without hostname is refused", async () => {
  const { handle } = setup({ turnstile: { success: true } });
  assert.equal(await code(await handle(post(good))), "bot_check_failed");
});
Deno.test("Cloudflare down: fail closed with 503 and nothing saved", async () => {
  const { handle, calls } = setup({ turnstile: { success: false, unavailable: true } });
  const r = await handle(post(good));
  assert.equal(r.status, 503);
  assert.equal(calls.inserts.length, 0);
});

// ---- rate limits -------------------------------------------------------------------------
Deno.test("burst limit hit: 429 + Retry-After, no Turnstile call, nothing saved", async () => {
  const { handle, calls } = setup({ limits: (k) => !k.startsWith("rsvp:burst:") });
  const r = await handle(post(good));
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "300");
  assert.equal(calls.turnstile.length + calls.inserts.length, 0);
});
Deno.test("daily limit hit: 429", async () => {
  const { handle, calls } = setup({ limits: (k) => !k.startsWith("rsvp:day:") });
  assert.equal((await handle(post(good))).status, 429);
  assert.equal(calls.inserts.length, 0);
});
Deno.test("global circuit breaker: 429 after the bot check passes", async () => {
  const { handle, calls } = setup({ limits: (k) => k !== "rsvp:global" });
  assert.equal((await handle(post(good))).status, 429);
  assert.equal(calls.inserts.length, 0);
});
Deno.test("rate-limit keys use the hashed IP only", async () => {
  const { handle, calls } = setup();
  await handle(post(good));
  for (const k of calls.limits) assert.ok(!k.includes("203.0.113.7"));
  assert.ok(calls.limits.every((k) => k.length <= 128));
});
Deno.test("different IPs get different keys; same IP gets same key", async () => {
  const a = setup(), b = setup(), a2 = setup();
  await a.handle(post(good, { "cf-connecting-ip": "198.51.100.1" }));
  await b.handle(post(good, { "cf-connecting-ip": "198.51.100.2" }));
  await a2.handle(post(good, { "cf-connecting-ip": "198.51.100.1" }));
  assert.notEqual(a.calls.limits[0], b.calls.limits[0]);
  assert.equal(a.calls.limits[0], a2.calls.limits[0]);
});
Deno.test("a forged X-Forwarded-For header cannot change the rate-limit key", async () => {
  const a = setup(), b = setup();
  await a.handle(post(good, { "x-forwarded-for": "1.1.1.1" }));
  await b.handle(post(good, { "x-forwarded-for": "2.2.2.2" }));
  assert.equal(a.calls.limits[0], b.calls.limits[0]);
});

// ---- failures never leak -------------------------------------------------------------------
Deno.test("database failure: generic 500, internals not leaked", async () => {
  const { handle } = setup({ insertThrows: true });
  const r = await handle(post(good));
  assert.equal(r.status, 500);
  const text = await r.text();
  assert.equal(JSON.parse(text).code, "server_error");
  assert.ok(!text.includes("secret-detail-123") && !text.includes("exploded"));
});
Deno.test("errors from an allowed origin carry CORS so the form can show a message", async () => {
  const { handle } = setup();
  const r = await handle(post({ ...good, name: "" }));
  assert.equal(r.headers.get("access-control-allow-origin"), SITE);
});

// ---- bot check switched OFF (no Cloudflare for now) --------------------------------------
const noToken = { name: "Anil Kumar", attending: "Yes", guests: 2, message: "Hi", website: "" };

Deno.test("bot check OFF: RSVP without any token is saved", async () => {
  const { handle, calls } = setup({ botCheck: false });
  const r = await handle(post(noToken));
  assert.equal(r.status, 200);
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.turnstile.length, 0);
});
Deno.test("bot check OFF: a token that is sent anyway is ignored, not required to be real", async () => {
  const { handle, calls } = setup({ botCheck: false });
  assert.equal((await handle(post({ ...noToken, turnstileToken: "whatever" }))).status, 200);
  assert.equal(calls.turnstile.length, 0);
  assert.equal(calls.inserts.length, 1);
});
Deno.test("bot check OFF: an absurd token is still refused", async () => {
  const { handle, calls } = setup({ botCheck: false });
  assert.equal((await handle(post({ ...noToken, turnstileToken: "t".repeat(2049) }))).status, 400);
  assert.equal((await handle(post({ ...noToken, turnstileToken: 123 }))).status, 400);
  assert.equal(calls.inserts.length, 0);
});
Deno.test("bot check OFF: honeypot still catches bots", async () => {
  const { handle, calls } = setup({ botCheck: false });
  const r = await handle(post({ ...noToken, website: "http://spam.example" }));
  assert.equal(r.status, 200);
  assert.equal(calls.inserts.length + calls.limits.length, 0);
});
Deno.test("bot check OFF: rate limits still apply (burst, daily, global)", async () => {
  for (const prefix of ["rsvp:burst:", "rsvp:day:", "rsvp:global"]) {
    const { handle, calls } = setup({ botCheck: false, limits: (k) => !k.startsWith(prefix) });
    assert.equal((await handle(post(noToken))).status, 429, prefix);
    assert.equal(calls.inserts.length, 0, prefix);
  }
});
Deno.test("bot check OFF: validation, origin and size rules are unchanged", async () => {
  const { handle, calls } = setup({ botCheck: false });
  assert.equal((await handle(post({ ...noToken, guests: 0 }))).status, 400);
  assert.equal((await handle(post({ ...noToken, isAdmin: true }))).status, 400);
  assert.equal((await handle(post(noToken, { origin: "https://evil.example" }))).status, 403);
  assert.equal(calls.inserts.length, 0);
});
Deno.test("bot check ON again: a missing token is refused", async () => {
  const { handle, calls } = setup({ botCheck: true });
  assert.equal((await handle(post(noToken))).status, 400);
  assert.equal(calls.inserts.length, 0);
});
