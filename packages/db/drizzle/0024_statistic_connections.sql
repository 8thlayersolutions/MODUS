CREATE TABLE "statistic_connections" (
	"guild_id" text NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"account_name" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statistic_connections_guild_id_provider_pk" PRIMARY KEY("guild_id","provider")
);
