// netlify/functions/submit-application.js
//
// Receives the application form data from the client, INCLUDING whatever
// discord_id/username/signature the client claims to have. It only ever
// trusts discord_id if the signature (created by discord-auth.js right
// after a real Discord OAuth exchange) checks out and hasn't expired.
// It then performs the actual insert into Supabase using the service
// role key, so this is the one place that decides what's "verified" —
// the client itself is never trusted for that.
//
// Required Netlify environment variables:
//   DISCORD_AUTH_SECRET        (same secret used in discord-auth.js)
//   SUPABASE_URL                (e.g. https://xxxx.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY   (Project Settings -> API -> service_role key.
//                                 NEVER expose this one client-side.)

const crypto = require("crypto");

const SIG_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

function verifyDiscordSignature(discordId, username, ts, sig) {
  if (!discordId || !username || !ts || !sig) return false;

  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > SIG_MAX_AGE_MS) return false;

  const secret = process.env.DISCORD_AUTH_SECRET;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${discordId}:${username}:${ts}`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request data" }) };
  }

  const {
    name, birthday, timezone, referral, reason, support_method,
    discord_username, discord_id, discord_ts, discord_sig,
  } = payload;

  if (!name || !birthday || !timezone || !referral || !reason || !support_method) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  // Age check (defense in depth even though the client already checks this)
  const dob = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  if (!Number.isFinite(age) || age < 18) {
    return { statusCode: 400, body: JSON.stringify({ error: "Must be 18+" }) };
  }

  // Only trust discord_id if it comes with a valid, fresh signature.
  // Otherwise it's dropped — an unverified username can still be stored
  // as free text, but it will never be treated as a real Discord link.
  const verified = verifyDiscordSignature(discord_id, discord_username, discord_ts, discord_sig);
  const trustedDiscordId = verified ? discord_id : null;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server misconfigured" }) };
  }

  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        name, birthday, timezone, referral, reason,
        support_method,
        discord_username: discord_username || null,
        discord_id: trustedDiscordId,
        status: "pending",
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error("Supabase insert failed:", errText);
      return { statusCode: 502, body: JSON.stringify({ error: "Could not save application" }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error("submit-application error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Something went wrong" }) };
  }
};
