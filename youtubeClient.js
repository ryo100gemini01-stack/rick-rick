const { Innertube } = require('youtubei.js');

let client = null;

async function initYouTubeClient() {
  if (!client) {
    client = await Innertube.create({ lang: 'ja', location: 'JP' });
    console.log('✅ Innertube クライアント初期化完了');
  }
  return client;
}

function getYouTubeClient() {
  if (!client) {
    throw new Error('YouTube client not initialized. Call initYouTubeClient() first.');
  }
  return client;
}

module.exports = {
  initYouTubeClient,
  getYouTubeClient
};