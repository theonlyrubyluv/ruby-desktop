// netlify/functions/notify-approved.js
//
// This function is called by a Supabase Database Webhook whenever a row
// in the "applications" table is updated to status = 'approved'. It uses
// your Discord bot token to open a DM with the applicant's Discord user
// ID and send them an approval message.
//
// Required Netlify environment variable (you already have this):
//   DISCORD_BOT_TOKEN
//
// IMPORTANT: your bot must share a server with the applicant, or it
// cannot open a DM with them.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    console.error("Invalid webhook payload:", err);
    return { statusCode: 400, body: "Invalid payload" };
  }

  // Supabase Database Webhooks send the row data under "record"
  const record = payload.record;

  if (!record) {
    return { statusCode: 400, body: "Missing record in payload" };
  }

  // Only act on rows that are actually approved and have a discord_id
  if (record.status !== "approved") {
    return { statusCode: 200, body: "Ignored: not an approval event" };
  }

  const discordId = record.discord_id;

  if (!discordId) {
    console.error("Approved row has no discord_id:", record);
    return { statusCode: 200, body: "Ignored: no discord_id on record" };
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;

  try {
    // Step 1: open (or get) a DM channel with the user
    const dmChannelResponse = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: discordId }),
    });

    if (!dmChannelResponse.ok) {
      const errText = await dmChannelResponse.text();
      console.error("Failed to open DM channel:", errText);
      return { statusCode: 502, body: "Could not open DM channel" };
    }

    const dmChannel = await dmChannelResponse.json();

    // Step 2: send the approval message into that DM channel
    const messageText =
      record.name && record.name.trim()
        ? `hey ${record.name}, your application has been approved! 🎉 welcome in.`
        : `your application has been approved! 🎉 welcome in.`;

    const sendMessageResponse = await fetch(
      `https://discord.com/api/v10/channels/${dmChannel.id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: messageText }),
      }
    );

    if (!sendMessageResponse.ok) {
      const errText = await sendMessageResponse.text();
      console.error("Failed to send DM:", errText);
      return { statusCode: 502, body: "Could not send DM" };
    }

    return { statusCode: 200, body: "Approval DM sent" };
  } catch (err) {
    console.error("notify-approved error:", err);
    return { statusCode: 500, body: "Something went wrong sending the DM" };
  }
};
