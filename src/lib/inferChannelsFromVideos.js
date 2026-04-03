/**
 * When the `channels` table is empty, derive channels from digest rows (same rules as the app UI).
 * Requires `channelId` (UC…) on each row; rows without it are skipped.
 *
 * @param {{ channelId?: string | null, channel?: string | null }[]} videoLikeRows
 * @returns {{ id: string, name: string, thumbnailUrl: null }[]}
 */
export function inferChannelsFromVideos(videoLikeRows) {
  const byId = new Map();
  for (const v of videoLikeRows || []) {
    const cid = v.channelId;
    if (!cid || typeof cid !== 'string') continue;
    if (!byId.has(cid)) {
      byId.set(cid, {
        id: cid,
        name: (v.channel && String(v.channel).trim()) || cid,
        thumbnailUrl: null,
      });
    }
  }
  return [...byId.values()];
}
