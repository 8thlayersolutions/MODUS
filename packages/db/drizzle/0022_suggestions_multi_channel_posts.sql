-- Match the existing legacy 0005 migration while tracking this change in Drizzle.
-- Safe when legacy 0005 has already been applied.
ALTER TABLE "suggestions" ADD COLUMN IF NOT EXISTS "posts" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "suggestions"
SET "posts" = jsonb_build_array(jsonb_build_object(
  'channelId', channel_id, 'messageId', message_id, 'threadId', thread_id
))
WHERE channel_id IS NOT NULL AND message_id IS NOT NULL
  AND (posts IS NULL OR posts = '[]'::jsonb);
