// api/notify-approved.js
//
// This function is called by a Supabase Database Webhook whenever a row
// in the "applications" table is updated to status = 'approved'. It uses
// your Discord bot token to open a DM with the applicant's Discord user
// ID and send them an approval message.
//
// Required Vercel environment variable:
//   DISCORD_BOT_TOKEN
//
// IMPORTANT: your bot must share a server with the applicant, or it
// cannot open a DM with them.
//
// IMPORTANT: after moving to Vercel, update the webhook URL in your
// Supabase Database Webhook settings to point at:
//   https://ruby-desktop.vercel.app/api/notify-approved

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload = req.body || {};
  const record = payload.record;

  if (!record) {
    res.status(400).json({ error: "Missing record in payload" });
    return;
  }

  if (record.status !== "approved") {
    res.status(200).json({ message: "Ignored: not an approval event" });
    return;
  }

  const discordId = record.discord_id;

  if (!discordId) {
    console.error("Approved row has no discord_id:", record);
    res.status(200).json({ message: "Ignored: no discord_id on record" });
    return;
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;

  try {
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
      res.status(502).json({ error: "Could not open DM channel" });
      return;
    }

    const dmChannel = await dmChannelResponse.json();

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
      res.status(502).json({ error: "Could not send DM" });
      return;
    }

    res.status(200).json({ message: "Approval DM sent" });
  } catch (err) {
    console.error("notify-approved error:", err);
    res.status(500).json({ error: "Something went wrong sending the DM" });
  }
};
