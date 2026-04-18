const { Innertube } = require('youtubei.js');
const { getYouTubeClient } = require('./youtubeClient');
const ytpl = require('ytpl');

let client;


function normalizeYtplId(id) {
  return id.startsWith('VL') ? id.slice(2) : id;
}

async function getPlaylistItems(playlistId) {
  const client = getYouTubeClient();

  const playlist = await client.getPlaylist(playlistId);
  let allItems = playlist.items ?? [];
  let page = playlist;
  while (page.has_continuation) {
    page = await page.getContinuation();
    allItems = allItems.concat(page.items);
  }

  const ytplData = await ytpl(playlistId, { limit: allItems.length });
  const ytplItems = ytplData.items;
  const ytplItemsMap = new Map(
    ytplItems.map(item => [normalizeYtplId(item.id), item])
  );

  const items = await Promise.all(allItems.map(async (video) => {
    const ytplItem = ytplItemsMap.get(video.id);

    let views = video.view_count?.text
      || (video.views ? `${video.views.toLocaleString()} 回視聴` : '')
      || (ytplItem?.views ? ytplItem.views.replace('views', '回視聴') : '');

    let published = video.published?.text
      || ytplItem?.uploadedAt
      || '';

    if (!views || !published) {
      try {
        const videoInfo = await client.getInfo(video.id);
        if (!views && videoInfo.basic_info?.view_count) {
          views = `${Number(videoInfo.basic_info.view_count).toLocaleString()} 回視聴`;
        }
        if (!published && videoInfo.basic_info?.publish_date) {
          published = videoInfo.basic_info.publish_date;
        }
      } catch (err) {
        console.warn(`⚠ 補完失敗: ${video.id}`, err.message);
      }
    }

    return {
      id: video.id,
      title: video.title?.text || video.title || ytplItem?.title || '無題動画',
      author: video.author?.name || ytplItem?.author?.name || '不明',
      thumbnails: video.thumbnails || ytplItem?.thumbnails || [],
      duration: video.duration?.text || video.duration || ytplItem?.duration || '',
      isPlayable: video.isPlayable ?? true,
      viewCount: views,
      published: published
    };
  }));

  const result = {
    title: ytplData.title || playlist.title || '無題プレイリスト',
    itemCount: allItems.length,
    videos: items
  };

  console.log('✅ プレイリストタイトル:', result.title);
  console.log('✅ プレイリスト内の動画件数:', items.length);
  console.log('✅ items サンプル:', items.slice(0, 3));

  return result;
}

module.exports = {
  getPlaylistItems
};