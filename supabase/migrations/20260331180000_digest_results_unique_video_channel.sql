-- Unique pair required for PostgREST upsert(..., { onConflict: 'video_id,channel' })
-- Safe to re-run: skips if index already exists
create unique index if not exists digest_results_video_id_channel_uidx
  on digest_results (video_id, channel);
