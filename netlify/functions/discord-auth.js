// netlify/functions/discord-auth.js
//
// This function handles the redirect Discord sends back after a user
// approves the OAuth request. It exchanges the temporary "code" Discord
// gives us for an access token, uses that token to look up the user's
// Discord ID + username, then redirects them to your application form
// with that info attached as URL query params.
//
// Required Netlify environment variables (you already have these):
//   DISCORD_CLIENT_ID
//   DISCORD_CLIENT_SECRET
//
// IMPORTANT: this must exactly match the redirect URI you registered
// in the Discord Developer Portal:
//   https://ruby-desktop.netlify.app/.netlify/functions/discord-auth

const REDIRECT_URI = "https://ruby-desktop.netlify.app/.netlify/functions/discord-auth";

// Where to send the user after we've got their Discord info.
// Change this to whatever page hosts your actual application form.
const APPLICATION_FORM_PATH = "/apply.html";

exports.handler = async (event) => {
  const code = event.queryStringParameters && event.queryStringParameters.code;

  if (!code) {
    return {
      statusCode: 400,
      body: "Missing OAuth code from Discord. Please try connecting again.",
    };
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
      return {
        statusCode: 502,
        body: "Could not verify Discord login. Please try again.",
      };
    }

    const tokenData = await tokenResponse.json();

    // Step 2: use the access token to get the user's identity
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userResponse.ok) {
      const errText = await userResponse.text();
      console.error("Discord user lookup failed:", errText);
      return {
        statusCode: 502,
        body: "Could not retrieve your Discord profile. Please try again.",
      };
    }

    const discordUser = await userResponse.json();
    const discordId = discordUser.id;
    const discordUsername = discordUser.username;

    // Step 3: redirect to the application form with discord info attached
    const redirectUrl = `${APPLICATION_FORM_PATH}?discord_id=${encodeURIComponent(
      discordId
    )}&discord_username=${encodeURIComponent(discordUsername)}`;

    return {
      statusCode: 302,
      headers: { Location: redirectUrl },
      body: "",
    };
  } catch (err) {
    console.error("discord-auth error:", err);
    return {
      statusCode: 500,
      body: "Something went wrong connecting your Discord account.",
    };
  }
};
