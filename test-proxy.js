const channelId = 'UCfXgUVnR7UOhr08sT1zRq5A'; 
// I will not use the API key directly in case it requires env vars, I will hit the live URL of the vercel proxy since it's already deployed with the key!
async function run() {
  const url = `https://ytdigest-rg7y45dms-mdps-projects.vercel.app/api/youtube?channelId=${channelId}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) console.error(data.error);
  console.log("Total fetched:", data.videos?.length);
  if (data.videos?.length > 0) {
    console.log("First:", data.videos[0].title, data.videos[0].publishedAt);
    console.log("Last:", data.videos[data.videos.length-1].title, data.videos[data.videos.length-1].publishedAt);
  }
}
run();
