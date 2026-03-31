const ytc = require('yt-channel-info');

async function testLimits() {
  let allVideos = [];
  try {
    let res = await ytc.getChannelVideos({ channelId: 'UCfXgUVnR7UOhr08sT1zRq5A', channelIdType: 0 });
    allVideos.push(...res.items);
    
    while(res.continuation && allVideos.length < 500) {
      res = await ytc.getChannelVideos({ continuation: res.continuation });
      allVideos.push(...res.items);
      console.log(`Fetched ${allVideos.length} so far...`);
    }
    
    console.log("Total Fetched:", allVideos.length);
  } catch(e) { console.error(e) }
}
testLimits();
