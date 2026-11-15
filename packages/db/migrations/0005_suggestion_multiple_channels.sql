-- Preserve existing suggestion links while introducing multiple destination copies.
ALTER TABLE suggestions
  ADD COLUMN IF NOT EXISTS posts JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE suggestions
SET posts = jsonb_build_array(
  jsonb_build_object(
    'channelId', channel_id,
    'messageId', message_id,
    'threadId', thread_id
  )
)
WHERE channel_id IS NOT NULL
  AND message_id IS NOT NULL
  AND (posts IS NULL OR posts = '[]'::jsonb);
