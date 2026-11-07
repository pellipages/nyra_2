# submit-rsvp (step 2)

Public endpoint that saves an RSVP. Browsers never write to the database
directly; they call this function, which checks everything first.

## Checks, in order
1. POST only, and the `Origin` must be in `ALLOWED_ORIGINS`
2. JSON only, max 4 KB
3. Strict validation (name 1-80, Yes/No, guests 1-20 or 0, blessing max 500,
   no control characters, no unknown fields)
4. Hidden "website" field (honeypot) filled = bot, silently ignored
5. Per-IP rate limit: 60 per 5 minutes and 150 per day (IP stored only as a salted hash). Generous on purpose: a whole family on one Wi-Fi shares one IP. Edit `RATE_LIMITS` in handler.ts
6. OPTIONAL bot check (Cloudflare Turnstile). It is OFF until you set
   `TURNSTILE_SECRET_KEY`; then a valid token from your own site is required
7. Global limit: 500 per hour (circuit breaker)
8. Insert with the secret key

The bot check is off for now, so spam defence is the honeypot, strict
validation, the origin check and the rate limits. To turn the bot check on
later: add the Turnstile widget to the form and set the secret below. Nothing
else changes.

## Secrets (Supabase dashboard: Edge Functions > Secrets)
| Name | Value |
|---|---|
| `ALLOWED_ORIGINS` | `https://your-site.vercel.app` (comma-separate more; no trailing slash, no localhost in production) |
| `IP_HASH_SALT` | Random string, 32+ characters |
| `TURNSTILE_SECRET_KEY` | OPTIONAL. Leave unset for now (bot check off) |

`SUPABASE_URL` and `SUPABASE_SECRET_KEYS` are provided automatically.
If any secret is missing the function refuses every request (fails closed).

## Deploy
```
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy submit-rsvp
```
`supabase/config.toml` turns off Supabase's built-in JWT check for this
function on purpose (guests are anonymous); the checks above replace it.

## Tests
```
deno test supabase/functions/submit-rsvp/handler_test.ts
```
