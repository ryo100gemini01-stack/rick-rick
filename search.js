const { Innertube } = require('youtubei.js');
let client = null;

const { getYouTubeClient } = require('./youtubeClient');

let previousResult = null;

const fetch = require('node-fetch');

const axios = require('axios');

async function getSuggest(query) {
  try {
    const url = `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      }
    });

    if (!Array.isArray(response.data)) {
      console.warn('response.data is not an array');
      return [];
    }

const suggestions = response.data[1]; // 2番目の要素がサジェスト配列

    return suggestions;

  } catch (error) {
    console.error('❌ サジェストエラー:', error.message);
    return [];
  }
}


async function searchVideos(query, pageToken = null) {
  const startTime = Date.now();
  const client = getYouTubeClient();

  let result;
  if (!pageToken) {
    result = await client.search(query, 'video');
    previousResult = result;
  } else {
    if (previousResult?.getContinuation) {
      result = await previousResult.getContinuation();
      previousResult = result;
    } else {
      console.warn('⚠ continuation not available');
      return { videos: [], nextPageToken: null };
    }
  }

  const videos = result?.results
    ?.filter(item => item.type === 'Video')
    ?.map(video => ({
      id: video.video_id,
      title: video.title?.text || '',
      thumbnail: video.thumbnails?.[0]?.url || '',
      author: video.author?.name || '',
      duration: video.duration?.text || '',
      viewCount: video.view_count?.text || (video.views ? `${video.views.toLocaleString()} 回視聴` : ''),
      published: video.published?.text || ''
    }));

  const elapsedTime = Date.now() - startTime;
  console.log(`🔍 検索処理完了: ${elapsedTime}ms`);

  return {
    videos,
    nextPageToken: videos.length ? 'hasMore' : null
  };
}

module.exports = {
  searchVideos,
  getSuggest
};
