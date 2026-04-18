const YouTubeJS = require('youtubei.js');
const { getYouTubeClient } = require('./youtubeClient');

let client = null;

async function getChannelDetails(channelIdOrUrl, maxVideos = 8) {
  const client = getYouTubeClient();

  try {
    const channel = await client.getChannel(channelIdOrUrl);
    const metadata = channel?.metadata || {};

    // --- parseVideo を先に定義 ---
    const parseVideo = (v) => {
      const durationOverlay = v.thumbnail_overlays?.find(o => o.type === 'ThumbnailOverlayTimeStatus');
      const duration = durationOverlay?.text || v.duration?.text || null;

      return {
        title: v.title?.text || 'タイトル不明',
        videoId: v.id || v.video_id,
        url: `video.html?videoId=${v.id || v.video_id}`,
        thumbnail: v.thumbnails?.[0]?.url || null,
        duration,
        views: v.view_count?.text || v.short_view_count?.text || v.views?.text || '再生数不明',
        published: v.published?.text || '投稿日不明',
      };
    };

    // --- 最新動画取得 ---
    const videosResult = await channel.getVideos();
    console.log('getVideos keys:', Object.keys(videosResult));

    // 安全に配列を取得
    const videoItems =
      videosResult?.items ??
      videosResult?.videos ??
      videosResult?.contents ??
      [];

    console.log('最新動画数:', videoItems.length);

// 最新動画取得済み
const parsedLatest = videoItems.slice(0, maxVideos).map(parseVideo);

// タイトルだけ確認
console.log('=== 最新動画タイトル一覧 ===');
parsedLatest.forEach((v, i) => {
  console.log(`${i + 1}. ${v.title} (${v.published})`);
});

    // --- shelves 由来の動画（参考用） ---
    const rawShelves = Array.isArray(channel?.shelves) ? channel.shelves : [];
    let videosRaw = [];
    for (const shelf of rawShelves) {
      if (shelf?.content?.items) {
        const items = shelf.content.items
          .map(item => item.content || item)
          .filter(v => v && (v.type === 'Video' || v.type === 'GridVideo') && v.video_id);
        videosRaw.push(...items);
      }
      if (videosRaw.length >= maxVideos) break;
    }
    const parsedVideos = videosRaw.slice(0, maxVideos).map(parseVideo);

    // --- 登録者数取得（簡略化） ---
    const metadataRows = channel?.header?.content?.metadata?.metadata_rows || [];
    let subscriberCount = '非公開';
    for (const row of metadataRows) {
      const parts = row?.metadata_parts || row?.contents || [];
      for (const part of parts) {
        const text = part?.text?.text || part?.text;
        if (text && text.includes('登録者')) {
          subscriberCount = text;
          break;
        }
      }
    }

    // --- アバター画像（最大サイズ） ---
    let avatar = null;
    if (Array.isArray(metadata.avatar)) {
      avatar = metadata.avatar.reduce((prev, curr) =>
        (curr.width > (prev.width || 0) ? curr : prev), metadata.avatar[0]
      )?.url;
    }

    // --- バナー画像（最大サイズ） ---
    let banner = null;
    const bannerImages = channel?.header?.content?.banner?.image;
    if (Array.isArray(bannerImages)) {
      banner = bannerImages.reduce((prev, curr) =>
        (curr.width > prev.width ? curr : prev), bannerImages[0]
      )?.url;
    }

    // --- プレイリスト用サムネイル処理 ---
    const shelfSections = await Promise.all((channel.shelves || []).map(async shelf => {
      const shelfTitle = shelf.title?.text || '無題のセクション';
      const shelfItems = shelf.content?.items || [];

      const browseId = shelf.endpoint?.payload?.browseId || '';
      const isPlaylistShelf = browseId.startsWith('VL') || browseId.startsWith('PL');

      let playlists = [];

      if (isPlaylistShelf) {
        const playlistId = browseId.replace(/^VL/, '');

        let thumbnail = null;
        let videoCount = '';

        try {
          const playlist = await client.getPlaylist(playlistId, { client: 'WEB' });

          const firstVideo = playlist.videos?.[0];
          if (firstVideo?.thumbnails?.length > 0) {
            thumbnail = firstVideo.thumbnails[0].url;
          }
          videoCount = `${playlist.videos.length}本の動画`;
        } catch (err) {
          console.warn(`⚠️ プレイリスト取得失敗: ${playlistId}`, err.message);
        }

        playlists.push({
          title: shelfTitle,
          playlistId,
          url: `playlist.html?list=${playlistId}`,
          thumbnail,
          videoCount,
        });
      }

      const videos = shelfItems
        .filter(v => v.type?.endsWith('Video'))
        .map(parseVideo);

      return {
        title: shelfTitle,
        videos,
        playlists
      };
    }));

    return {
      id: metadata.channel_id || null,
      name: metadata.title || '不明',
      description: metadata.description || '',
      url: metadata.url || '',
      avatar,
      banner,
      subscriberCount,
      latestVideos: parsedLatest, // ← 最新動画
      videos: parsedVideos,       // shelves由来
      shelves: shelfSections
    };

  } catch (err) {
    console.error('❌ チャンネル情報取得失敗:', err.message);
    return null;
  }
}

module.exports = {
  getChannelDetails,
};