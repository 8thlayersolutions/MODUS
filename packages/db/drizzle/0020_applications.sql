CREATE TABLE "application_forms" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "guild_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "open" boolean DEFAULT true NOT NULL,
  "approval_role_id" text,
  "cooldown_days" integer DEFAULT 7 NOT NULL,
  "panel_channel_id" text,
  "panel_message_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "application_forms_guild_idx" ON "application_forms" USING btree ("guild_id", "created_at");
--> statement-breakpoint
CREATE TABLE "application_submissions" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "guild_id" text NOT NULL,
  "form_id" text NOT NULL,
  "applicant_id" text NOT NULL,
  "answers" jsonb NOT NULL,
  "questions_snapshot" jsonb NOT NULL,
  "form_version" integer NOT NULL,
  "source" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "reason" text,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "application_submissions_guild_status_idx" ON "application_submissions" USING btree ("guild_id", "status", "created_at");
--> statement-breakpoint
CREATE INDEX "application_submissions_applicant_idx" ON "application_submissions" USING btree ("guild_id", "form_id", "applicant_id", "created_at");
--> statement-breakpoint
CREATE TABLE "application_audit" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "guild_id" text NOT NULL,
  "submission_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "action" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "application_audit_submission_idx" ON "application_audit" USING btree ("guild_id", "submission_id", "created_at");
