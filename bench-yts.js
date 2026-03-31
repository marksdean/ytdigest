const yts = require('yt-search');
async function run() {
  const t0 = Date.now();
  const playlist = await yts({ listId: 'UUfXgUVnR7UOhr08sT1zRq5A' });
  const videos = playlist.videos.slice(0, 30);
  console.log(`Playlist fetched in ${Date.now()-t0}ms`);
  
  const dt0 = Date.now();
  const detailed = await Promise.all(videos.map(v => yts({ videoId: v.videoId }).catch(e => null)));
  console.log(`Details fetched in ${Date.now()-dt0}ms`);
  
  const valid = detailed.filter(Boolean);
  console.log(`Valid details: ${valid.length}`);
  if(valid[0]) console.log(`Sample: ${valid[0].uploadDate}`);
}
run();
