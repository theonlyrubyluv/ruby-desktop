exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Basic auth check - only your admin panel can call this
  const authHeader = event.headers['x-admin-secret'];
  if (authHeader !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { discord_id, name } = body;
  if (!discord_id) {
    return { statusCode: 400, body: 'Missing discord_id' };
  }

  try {
    // Open a DM channel with the user
    const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: discord_id }),
    });

    const dmChannel = await dmRes.json();
    if (!dmChannel.id) throw new Error('Could not open DM channel: ' + JSON.stringify(dmChannel));

    // Send the DM
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: `💌 hi ${name || 'babe'}! your application to **ruby desktop** has been approved ♡\n\nclick here to join the server: https://discord.gg/3GuMYzJJrC\n\nwelcome 🌸`,
      }),
    });

    const msgData = await msgRes.json();
    if (!msgData.id) throw new Error('Message failed: ' + JSON.stringify(msgData));

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('send-dm error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
