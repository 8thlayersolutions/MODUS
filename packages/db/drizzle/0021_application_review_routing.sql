ALTER TABLE "application_forms" ADD COLUMN "reviewer_user_ids" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "application_forms" ADD COLUMN "reviewer_role_ids" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "application_forms" ADD COLUMN "submission_log_channel_id" text;
