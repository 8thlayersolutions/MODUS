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
