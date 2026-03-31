const { YouTube } = require("youtube-sr");

async function test() {
  try {
    const channel = await YouTube.getChannel("https://www.youtube.com/channel/UCLn-p0U5rD5q0EemikmX6_w");
    console.log("Channel found:", channel.name);
    
    const vids = await channel.fetchVideos(500);
    console.log("Fetched", vids.length, "videos!");
  } catch (err) {
    console.error("Error fetching channel:", err);
  }
}
test();
