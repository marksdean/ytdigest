import { getServiceSupabase } from '@/lib/supabaseAdmin';

/**
 * Before upserting digest rows, merge starred, user_note, and read_at from existing DB rows
 * so re-runs and agent saves do not wipe user state.
 */
export async function mergeDigestRowsFromDatabase(rows) {
  if (!rows?.length) return rows;
  const supabase = getServiceSupabase();
  const videoIds = [...new Set(rows.map((r) => r.video_id).filter(Boolean))];
  const { data: existing, error } = await supabase
    .from('digest_results')
    .select('video_id, channel, starred, user_note, read_at')
    .in('video_id', videoIds);
  if (error || !existing?.length) return rows;
  const byKey = new Map(
    existing.map((e) => [`${e.video_id}::${e.channel}`, e])
  );
  return rows.map((row) => {
    const ex = byKey.get(`${row.video_id}::${row.channel}`);
    if (!ex) return row;
    return {
      ...row,
      starred: ex.starred,
      user_note: ex.user_note,
      read_at: ex.read_at,
    };
  });
}
