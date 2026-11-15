# Twitch Role Sync — Setup and Operation

The MODUS Twitch Role Sync feature uses each member's **existing Discord Settings → Connections → Twitch** link. Members click an authorization link and grant MODUS the Discord `identify connections` scopes; they never need to re-enter their Twitch password or username.

## Supported mapping entries

Automatic: Twitch-connected, broadcaster, editor, moderator (including Lead Moderator), VIP, follower, any subscriber, Tier 1, Tier 2, Tier 3.

Mapped but **not automatically verified or granted**: Lead Moderator (cannot distinguish from Moderator), Artist, Business Manager. Do not use these mappings to grant privileged roles automatically.

## Set up on Coolify

The **web** service needs:

- `NUXT_PUBLIC_BASE_URL`: the public HTTPS origin for MODUS, for example `https://modusbot.io`
- `NUXT_PUBLIC_DISCORD_CLIENT_ID` and `NUXT_DISCORD_CLIENT_SECRET`: existing MODUS Discord OAuth application
- `NUXT_DISCORD_BOT_TOKEN`: existing bot token
- `NUXT_TWITCH_CLIENT_ID`: Twitch application client ID
- `NUXT_TWITCH_CLIENT_SECRET`: Twitch application client secret
- `NUXT_TWITCH_SYNC_ENCRYPTION_KEY`: **one shared 64-character hex key representing 32 random bytes**; preserve between deployments
- `NUXT_BOT_API_SECRET`: private shared secret used to authenticate internal synchronization requests
- `NUXT_DATABASE_URL`: existing Postgres URL

The **bot** service needs `BOT_API_SECRET` with the **same** value as the web's `NUXT_BOT_API_SECRET`, plus `PUBLIC_WEB_URL` pointing to the web HTTPS origin. Keep all secrets server-side. Never commit real credentials.

In the Discord Developer Portal, add an OAuth redirect URI:

`https://modusbot.io/api/twitch-sync/member/callback`

In the Twitch Developer Console, register the redirect URI:

`https://modusbot.io/api/twitch-sync/broadcaster/callback`

Both URLs must use your actual `NUXT_PUBLIC_BASE_URL` origin.

Run the regular Drizzle migration command before deploying new images:

```sh
pnpm --filter @modus/db db:migrate
```

The schema adds `twitch_sync_broadcasters`, `twitch_sync_members`, and `twitch_sync_grants`. The OAuth access and refresh tokens are encrypted at rest using AES-256-GCM. Back up `NUXT_TWITCH_SYNC_ENCRYPTION_KEY`; losing the key invalidates stored authorizations.

## Configure

1. Open the Twitch Role Sync module for your Discord server.
2. Set the broadcaster's Twitch login and map each status to a managed Discord role (or choose No role).
3. Ensure MODUS has **Manage Roles**, and its top role is above every role it will assign.
4. Click **Connect broadcaster** and authorize Twitch's read-only scopes: `channel:read:editors`, `channel:read:vips`, `moderation:read`, `moderator:read:followers`, `channel:read:subscriptions`.
5. Share the **member connection link** from the dashboard. Each member authorizes Discord Connections access once.
6. MODUS reconciles on the selected interval, starting after its initial worker delay. The worker needs the dashboard endpoint reachable via `PUBLIC_WEB_URL`.

The worker only removes roles with a recorded Twitch Sync grant; existing roles not granted by the module are never claimed. On API errors and revoked authorizations it skips reconciliation without treating the failure as evidence of lost status.

## Notes

- The broadcaster must have the appropriate Twitch subscription API access. If Twitch rejects a check, the member is skipped rather than incorrectly stripped of roles.
- Disabling stale-role removal keeps previously granted roles when eligibility expires; enabling it allows verified removals.
- If the Twitch account linked to a Discord account changes, the member must re-authorize MODUS so the new Twitch ID can be trusted.
- For large servers, monitor Twitch and Discord API rate limits before lowering the sync interval.

Docs: https://dev.twitch.tv/docs/api/reference/ and https://help.twitch.tv/s/article/Managing-Roles-for-your-Channel
