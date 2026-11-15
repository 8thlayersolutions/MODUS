ALTER TABLE "application_forms" ADD COLUMN IF NOT EXISTS "reviewer_user_ids" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "application_forms" ADD COLUMN IF NOT EXISTS "reviewer_role_ids" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "application_forms" ADD COLUMN IF NOT EXISTS "submission_log_channel_id" text;
