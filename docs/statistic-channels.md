# Statistic Channels

MODUS can show live statistics in Discord voice-channel names. Open **Dashboard → Server → Modules → Statistic Channels**. Choose a statistic, select an existing voice channel (its permissions remain untouched), or create a dedicated locked voice channel in any existing category. Click **Save statistic channels** to activate updates. Removing a counter does not delete its Discord channel.

Use `{value}` in the name template, for example `👥┃Members: {value}`. Normal numbers are grouped with commas; compact notation displays `1.2K`, `1.5M`, etc. The editor has a sample preview (not live data). Create up to 40 active or paused counters per guild; each must have a distinct destination channel. Refresh is configurable from 10 minutes to 24 hours. The worker changes only names that differ and retains the last successful value on provider errors. `/statistics refresh` is subject to the configured cooldown; `/statistics status` lists counters.

## Sources

- **Discord:** membership, bots/humans, presence and role membership, boosts, roles/channels, voice occupancy, video/screensharing, custom emojis, stickers, scheduled events, server age and recent joins (current members; today uses UTC). Without the privileged Presence Intent, online/offline use Discord's approximate counts; invisible users appear offline. To enable exact visible presence breakdowns, enable Presence Intent for the Discord application, then set `STATISTICS_ENABLE_PRESENCES=true` on the bot. Some counts require the existing Members intent.
- **Twitch:** enter a channel login for live status/viewers/game/title, using `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` on the bot. Followers, subscribers and sub points reuse the broadcaster connected under **Twitch Role Sync**, including the existing read scopes and `BOT_API_SECRET` / `PUBLIC_WEB_URL`. Follower counters accept a Twitch login and use the API's public aggregate count; subscriber and points counters automatically use the authorized broadcaster. The Twitch Role Sync mappings themselves do not have to be configured.
- **YouTube:** enable YouTube Data API v3 and provide `YOUTUBE_API_KEY` on the bot. Enter a channel ID or `@handle`. Counts are API-reported; hidden subscriber counts are unavailable, and public subscriber counts may be rounded.
- **TikTok:** configure Login Kit in TikTok for Developers and obtain `user.info.basic` and `user.info.stats` scope approval. Add the dashboard's `/api/statistic-channels/tiktok/callback` HTTPS redirect URI and set `NUXT_TIKTOK_CLIENT_KEY`, `NUXT_TIKTOK_CLIENT_SECRET`, and a stable `NUXT_STATISTIC_ENCRYPTION_KEY` (32-byte hex, e.g. `openssl rand -hex 32`) on the web service. Click **Connect TikTok** in the statistics module, approve access, then add followers/following/likes/videos counters. MODUS stores encrypted OAuth tokens by guild outside public settings; rotating refresh tokens are persisted under a database lock. Reauthorize if the grant expires or is revoked.
- **GitHub:** public repo stars, forks, watchers and open issues/PRs using `owner/repo`; no token required. API limits may affect very large installations.
- **Minecraft:** public Java and Bedrock server status, online players, capacity and player/capacity ratio using the public mcstatus.io API. Supply a host with optional port, such as `chaos.mc.anxietyscout.live`. If offline the status changes, but unavailable player counts retain their previous names.
- **Modrinth:** public project downloads and followers, using the project's ID or slug.
- **Custom:** any static text or number, such as a goal or milestone. No arbitrary URL fetch is permitted.

## Example

- `👥┃Members: {value}` — Total members
- `🟢┃Online: {value}` — Online members
- `⚫┃Offline: {value}` — Offline members
- `🟣┃Twitch: {value}` — Twitch followers
- `🔴┃YouTube: {value}` — YouTube subscribers
- `🎵┃TikTok: {value}` — TikTok followers
- `⛏️┃Chaos SMP: {value}` — Minecraft Java players / capacity
- `📦┃Modpack: {value}` — Modrinth project downloads

The bot needs permission to manage destination channels. Created counters inherit category visibility while denying Connect (Discord administrators can bypass channel permission denies). If the deployment has opted into automatic permission fixes, the existing audit system may grant MODUS the access needed to rename configured channels. A worker is leased per owning Discord shard, preventing duplicate periodic updates. All configuration is in existing module settings; the additive `statistic_connections` migration stores only private social OAuth credentials. Deploy the migration-capable bot before the dashboard.
