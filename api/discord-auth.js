// api/discord-auth.js
//
// This function handles the redirect Discord sends back after a user
// approves the OAuth request. It exchanges the temporary "code" Discord
// gives us for an access token, uses that token to look up the user's
// Discord ID + username, signs that identity, then redirects back to
// the main site with the signed info attached as URL query params.
//
// Required Vercel environment variables (same values as Netlify had):
//   DISCORD_CLIENT_ID
//   DISCORD_CLIENT_SECRET
//   DISCORD_AUTH_SECRET
//
// IMPORTANT: this must exactly match the redirect URI you register
// in the Discord Developer Portal. Update it to your new Vercel domain, e.g.:
//   https://ruby-desktop.vercel.app/api/discord-auth

const crypto = require("crypto");

// Update this to match your actual Vercel domain once deployed
const SITE_URL = "https://ruby-desktop.vercel.app";
const REDIRECT_URI = `${SITE_URL}/api/discord-auth`;

module.exports = async (req, res) => {
  const code = req.query.code;

  if (!code) {
    res.status(400).send("Missing OAuth code from Discord. Please try connecting again.");
    return;
  }

  try {
    // Step 1: exchange the code for an access token
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("Discord token exchange failed:", errText);
      res.status(502).send("Could not verify Discord login. Please try again.");
      return;
    }

    const tokenData = await tokenResponse.json();

    // Step 2: use the access token to get the user's identity
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userResponse.ok) {
      const errText = await userResponse.text();
      console.error("Discord user lookup failed:", errText);
      res.status(502).send("Could not retrieve your Discord profile. Please try again.");
      return;
    }

    const discordUser = await userResponse.json();
    const discordId = discordUser.id;
    const discordUsername = discordUser.username;

    // Step 3: sign the verified identity so the client can't be spoofed
    // into submitting an arbitrary discord_id later. api/submit-application.js
    // re-derives this signature and rejects anything that doesn't match
    // or has expired.
    const timestamp = Date.now().toString();
    const secret = process.env.DISCORD_AUTH_SECRET;
    const sig = crypto
      .createHmac("sha256", secret)
      .update(`${discordId}:${discordUsername}:${timestamp}`)
      .digest("hex");

    const redirectUrl =
      `${SITE_URL}/?discord_linked=true` +
      `&username=${encodeURIComponent(discordUsername)}` +
      `&discord_id=${encodeURIComponent(discordId)}` +
      `&ts=${encodeURIComponent(timestamp)}` +
      `&sig=${encodeURIComponent(sig)}`;

    res.writeHead(302, { Location: redirectUrl });
    res.end();
  } catch (err) {
    console.error("discord-auth error:", err);
    res.status(500).send("Something went wrong connecting your Discord account.");
  }
};
