CREATE TABLE IF NOT EXISTS "twitch_sync_broadcasters" (
  "guild_id" text PRIMARY KEY NOT NULL,
  "twitch_id" text NOT NULL,
  "twitch_login" text NOT NULL,
  "encrypted_token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "twitch_sync_members" (
  "guild_id" text NOT NULL,
  "discord_id" text NOT NULL,
  "twitch_id" text NOT NULL,
  "twitch_login" text NOT NULL,
  "encrypted_token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "twitch_sync_members_guild_id_discord_id_pk" PRIMARY KEY("guild_id","discord_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "twitch_sync_members_guild_idx" ON "twitch_sync_members" ("guild_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "twitch_sync_grants" (
  "guild_id" text NOT NULL,
  "discord_id" text NOT NULL,
  "role_id" text NOT NULL,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "twitch_sync_grants_guild_id_discord_id_role_id_pk" PRIMARY KEY("guild_id","discord_id","role_id")
);