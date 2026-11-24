# CHAOS SMP member dashboard

The dedicated VORTIQ member dashboard is at:
https://vortiq.8thlayer.cloud/minecraft/chaos-smp

It complements the WordPress Community Portal at:
https://anxietyscout.live/minecraft-dashboard/

## Features

- Minecraft Java Edition status: a cached TCP status handshake displays
  reachability, player counts, game version, and response time.
  Java DNS SRV records are supported for the advertised domain.
  Unreachable does not prove the server is offline.
- Discord identity: signs in with VORTIQ's existing Discord OAuth session.
  The current member's Guild role IDs are fetched directly from Discord.
- SMP Whitelist and SMP Verified role badges, without claiming in-game
  Minecraft account linkage or actual whitelist enrollment.
- Modrinth modpack, Copy IP, onboarding instructions, and WordPress links.
- The public status endpoint never returns player names or lists.

## Coolify: configure the VORTIQ web service

Set these VORTIQ **web** environment variables:

~~~
NUXT_CHAOS_SMP_HOST=chaos.mc.anxietyscout.live
NUXT_CHAOS_SMP_PORT=25565
NUXT_CHAOS_SMP_GUILD_ID=<CHAOS_HQ_DISCORD_GUILD_ID>
NUXT_CHAOS_SMP_WHITELIST_ROLE_ID=<SMP_Whitelist_role_ID>
NUXT_CHAOS_SMP_VERIFIED_ROLE_ID=<SMP_Verified_role_ID>
~~~

The existing NUXT_DISCORD_BOT_TOKEN must belong to a bot installed in
CHAOS HQ. Get role IDs through Discord Server Settings / Roles with
Developer Mode enabled. Do not put any bot token in NUXT_PUBLIC_* variables.

If your Minecraft server uses a non-default port and no SRV record,
set NUXT_CHAOS_SMP_PORT to the correct port.

## API endpoints

- GET /api/minecraft/chaos-smp/status: public, read-only TCP status probe;
  no private data. Status cached for about 20 seconds.
- GET /api/minecraft/chaos-smp/member: requires a sealed VORTIQ Discord
  session and verifies the signed-in user's current Discord membership
  and configured role IDs. It never accepts user or guild IDs from query
  parameters.

WordPress v0.5.0 fetches only the public status endpoint. No WordPress
account details or Discord tokens are sent to VORTIQ by WordPress.
VORTIQ requires its own Discord login; WordPress sessions do not
cross the two domains.

## Test and deploy

1. Deploy this change to the VORTIQ web service with the environment
   variables and confirm its existing Discord OAuth integration works.
2. Check that the public status endpoint returns JSON.
3. Visit /minecraft/chaos-smp while signed out: the page should show
   public status and a Discord login button.
4. Sign in with a CHAOS HQ member and check both role badges.
   Test members with no SMP role and members outside the server.
5. Revoke a Discord SMP role, refresh the member page, and ensure
   the badge disappears. Membership API failures must not grant roles.
6. If status is unavailable, check outbound TCP access from Coolify,
   Minepanel status support, Java port, DNS SRV, and firewall.
7. Publish AnxietyScout Connect v0.5.0 and view the WordPress
   Minecraft Dashboard for the read-only status card and VORTIQ link.

## Not included

The integration does not read or edit the real Minecraft whitelist,
link Minecraft UUIDs to Discord users, query player inventories, or
control Minepanel/RCON. Those require a trusted Minecraft-side agent
or documented host API and separately secured operations.

## Finding the dashboard inside VORTIQ

The CHAOS SMP portal is a website page, not a Discord bot module in the Modules grid.

For CHAOS HQ server administrators: open the CHAOS HQ guild dashboard.
The left context sidebar includes a Community tools group and a Minecraft Dashboard
link. The entry is restricted to the configured public CHAOS HQ guild ID,
which defaults to 978327073196232704 and may be overridden with
NUXT_PUBLIC_CHAOS_SMP_GUILD_ID.

For regular Minecraft members: the WordPress Minecraft Dashboard links directly
to https://vortiq.8thlayer.cloud/minecraft/chaos-smp . They do not need
VORTIQ server-management permissions to use the standalone page.

### Docker image compatibility

The CI workflow historically published ghcr.io/8thlayersolutions/modus-web:latest
but some Coolify deployments use ghcr.io/8thlayersolutions/vortiq-web:latest.
The GitHub Actions workflow now publishes BOTH image names on main and release.
They contain identical web code.

After merge, wait for the main GitHub Actions build to finish, then redeploy
the Coolify web service with a fresh image pull. A restart reusing an older
image digest will not expose the new route or navigation.

Validation:
- Open /minecraft/chaos-smp directly.
- Open /api/minecraft/chaos-smp/status and confirm a JSON status response.
- Open the CHAOS HQ server dashboard and locate Community tools / Minecraft Dashboard.
- If a direct 404 persists, check the actual running image name/digest in Coolify.
