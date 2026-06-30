const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const code = event.queryStringParameters?.code;
  const state = event.queryStringParameters?.state; // contains supabase app row id

  if (!code) {
    return { statusCode: 400, body: 'Missing code' };
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://ruby-desktop.netlify.app/.netlify/functions/discord-auth',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token');

    // Get user info from Discord
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    // Save discord_id to the pending application in Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    if (state) {
      await supabase
        .from('applications')
        .update({ discord_id: user.id, discord_username: user.username })
        .eq('id', state);
    }

    // Redirect back to site with success
    return {
      statusCode: 302,
      headers: {
        Location: `https://ruby-desktop.netlify.app?discord_linked=1&username=${encodeURIComponent(user.username)}`,
      },
      body: '',
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 302,
      headers: { Location: 'https://ruby-desktop.netlify.app?discord_error=1' },
      body: '',
    };
  }
};
