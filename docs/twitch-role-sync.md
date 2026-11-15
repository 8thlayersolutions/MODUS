# Twitch Role Sync

All six Twitch channel roles can be mapped to an arbitrary Discord role on each server: Editor, Moderator, Lead Moderator, VIP, Artist, Business Manager. Additional mappings: Broadcaster, Connected Twitch, Follower, Any Subscriber, Tier 1/2/3.

**Automatically verifiable:** Editor, Moderator (includes Lead Moderators), VIP, Broadcaster, Follower, Subscriber and tiers, Discord-connected Twitch account.

**Not individually auto-verifiable:** Lead Moderator, Artist, Business Manager. These can be configured and displayed but must never auto-assign or revoke a role based on unverified status. Twitch does not currently publish a documented API that identifies these roles individually; Lead Moderators appear in Get Moderators without being distinguished.

Official role list: https://help.twitch.tv/s/article/Managing-Roles-for-your-Channel
Twitch API: https://dev.twitch.tv/docs/api/reference/

Each Discord member explicitly authorizes MODUS to read their existing Discord Connections; no free-text Twitch username is accepted as identity proof. The broadcaster separately authorizes Twitch read scopes. Only roles actually assigned by this module may later be automatically removed.
