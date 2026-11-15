/**
 * Build a full-page OAuth initiation URL for MODUS.
 * The Discord guild is read from the dashboard route, never supplied by
 * an arbitrary query parameter or inferred by the OAuth callback.
 */
export type TwitchOAuthConnection = "broadcaster" | "member";

export function twitchOAuthConnectPath(
  kind: TwitchOAuthConnection,
  guildId: string,
  action?: "disconnect",
): string {
  if (!/^[0-9]{15,22}$/.test(guildId)) {
    throw new Error("Missing or invalid Discord guild ID");
  }
  if (action && (kind !== "member" || action !== "disconnect")) {
    throw new Error("Only member connections support disconnect");
  }

  const query = new URLSearchParams({ guild_id: guildId });
  if (action) query.set("action", action);
  return `/api/twitch-sync/${kind}/connect?${query.toString()}`;
}
