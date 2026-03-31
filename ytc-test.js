const ytc = require('yt-channel-info');
async function run() {
  const payload = {
    channelId: 'UCfXgUVnR7UOhr08sT1zRq5A',
    channelIdType: 0,
    sortBy: 'newest'
  };
  try {
    const res = await ytc.getChannelVideos(payload);
    console.log("Fetched:", res.items.length);
    console.log("First:", res.items[0].publishedText);
  } catch (err) { console.error(err) }
}
run();
