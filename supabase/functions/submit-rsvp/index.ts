// submit-rsvp: wires the tested handler to the real Turnstile and database.
// Settings come from Edge Function secrets (never from code):
//   ALLOWED_ORIGINS       e.g. https://your-site.vercel.app,https://yourdomain.com
//   IP_HASH_SALT          long random string
//   TURNSTILE_SECRET_KEY  OPTIONAL. Leave unset to run without a bot check;
//                         set it later (plus the widget on the form) to switch it on.
// SUPABASE_URL and SUPABASE_SECRET_KEYS are provided by Supabase itself.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createHandler, type Deps } from "./handler.ts";

function secretKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const key = JSON.parse(raw)["default"];
      if (typeof key === "string" && key) return key;
    } catch { /* fall through to the legacy variable */ }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("No Supabase secret key available to the function");
}

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
const ipHashSalt = Deno.env.get("IP_HASH_SALT") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

const problems: string[] = [];
if (allowedOrigins.length === 0) problems.push("ALLOWED_ORIGINS");
for (const o of allowedOrigins) {
  try {
    const u = new URL(o);
    if (u.origin !== o) problems.push(`ALLOWED_ORIGINS entry "${o}" must look like https://example.com (no path, no trailing slash)`);
  } catch {
    problems.push(`ALLOWED_ORIGINS entry "${o}" is not a valid origin`);
  }
}
if (ipHashSalt.length < 16) problems.push("IP_HASH_SALT (at least 16 characters)");
if (!supabaseUrl) problems.push("SUPABASE_URL");

if (!turnstileSecret) {
  console.warn("submit-rsvp: bot check (Turnstile) is OFF. Honeypot, validation and rate limits are active.");
}

if (problems.length > 0) {
  // Fail closed: refuse every request until the settings are fixed.
  console.error("submit-rsvp is misconfigured:", problems.join("; "));
  Deno.serve(() =>
    new Response(JSON.stringify({ code: "server_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  );
} else {
  const supabase = createClient(supabaseUrl, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const deps: Deps = {
    config: { allowedOrigins, ipHashSalt },

    verifyTurnstile: !turnstileSecret ? undefined : async (token, ip) => {
      try {
        const form = new URLSearchParams({ secret: turnstileSecret, response: token });
        if (ip) form.set("remoteip", ip);
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return { success: false, unavailable: true };
        const data = await res.json();
        return { success: data?.success === true, hostname: typeof data?.hostname === "string" ? data.hostname : undefined };
      } catch {
        return { success: false, unavailable: true };
      }
    },

    async consumeRateLimit(key, limit, windowSeconds) {
      const { data, error } = await supabase.rpc("consume_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window: `${windowSeconds} seconds`,
      });
      if (error) throw new Error(`rate limiter: ${error.message}`);
      return data === true;
    },

    async insertRsvp(row) {
      const { error } = await supabase.from("rsvps").insert(row);
      if (error) throw new Error(`insert: ${error.message}`);
    },
  };

  Deno.serve(createHandler(deps));
}
