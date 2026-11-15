# Stream Schedule

This MODUS module generates a weekly recurring Twitch stream calendar, with one-off date replacements or cancellations. The current week is generated at read time; no cron, extra container, or migration is required.

Setup: open Dashboard > Server > Modules > Stream Schedule, add your recurring streams, configure IANA timezone (for example America/Chicago), add any exceptions, enable public publishing, and save.

Discord: /schedule displays the current week; /schedule weeks_ahead:1 shows next week.

Public HTML: GET /embed/stream-schedule/:guild_id
Public JSON: GET /api/public/stream-schedule/:guild_id

The HTML endpoint supports optional URL query overrides: accent, bg, fg, card, muted (six-digit hex colors); layout=grid or list; compact, showOff, header, images (true/false); and week=0..12.

In Elementor's HTML widget:

<iframe title="Stream schedule" src="https://modusbot.io/embed/stream-schedule/YOUR_GUILD_ID" width="100%" height="680" style="border:0;border-radius:1rem;max-width:100%" loading="lazy" referrerpolicy="no-referrer"></iframe>

Replace YOUR_GUILD_ID with your actual server ID. The iframe refreshes every five minutes and follows the new calendar week automatically. Date changes are reflected after saving in MODUS. The public endpoints are disabled unless both the module and Publish toggle are enabled.

The module does not automatically import or sync Twitch's own schedule, create Discord scheduled events, or detect whether Twitch is live. Dates at nonexistent wall-clock times during the spring DST transition return a null UTC start in the JSON feed.

## Discord channel embeds

The dashboard now has **Discord Schedule Embed** settings. Select a text or announcement channel, choose a custom title, optional description, hex color, optional HTTPS banner, footer, and whether to include off-days or use inline day fields.

Click **Save & Publish Embed**. MODUS creates one message (or updates the previously tracked message) with the current calendar week, Discord-local timestamps, and linked streams. The message URL is shown on the dashboard. **Update Published Embed** applies changes immediately. **Remove Published Embed** deletes the tracked message and disables further updates.

When **Automatically update every 5 minutes** is enabled, each bot gateway shard updates only its own guilds' already-published messages, including when the calendar moves to a new week. It doesn't post a new message or ping roles when the schedule changes. The worker stops updating when the Stream Schedule module is disabled.

The publication pointer is stored separately in the existing `guild_configs` table under `stream-schedule-publication`. No migration is required. Manually deleted messages can be recreated from the dashboard's Publish button. The bot needs **View Channel**, **Send Messages**, and **Embed Links** in the selected channel. Website publishing is independent of Discord publishing.
