const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;
const http = require('http');
const server = http.createServer(app);

// YouTube API 関連の関数
const { getYouTube } = require('./api');
const { getComments } = require('./comments');
const { getCommentReplies } = require('./youtubeService');
const { searchVideos, getSuggest } = require('./search');
const { getPlaylistItems } = require('./playlist');
const { getChannelDetails } = require('./channel');
const {
  getLatestCommunityPost,
  getPostContent,
  getPostComments,
  extractPostImages,
  printCommentStructure,
  parseComments
} = require('./community');

connectEarthquakeWS((quakeData) => {
  const quake = quakeData.earthquake;
  if (!quake) return;

  const payload = {
    time: quake.originTime,
    magnitude: quake.hypocenter?.magnitude,
    depth: quake.hypocenter?.depth,
    place: quake.hypocenter?.name,
    maxScale: quake.maxScale,
    tsunami: quake.domesticTsunami
  };

  earthquakeWSS.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
});

// 🔸 動画情報 + コメント一覧取得
app.get('/api/video/:id', async (req, res) => {
  try {
    const videoId = req.params.id;
    const videoData = await getYouTube(videoId);
    const comments = await getComments(videoId);

    if (videoData instanceof Error) throw videoData;

    res.json({
      ...videoData,
      comments
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'エラーが発生しました' });
  }
});

app.get('/api/playlist/:playlistId', async (req, res) => {
  const { playlistId } = req.params;
  try {
    const playlistData = await getPlaylistItems(playlistId);
    res.json(playlistData);
  } catch (err) {
    console.error('❌ プレイリスト取得エラー:', err);
    res.status(500).json({ error: 'プレイリスト取得に失敗しました' });
  }
});

app.get('/playlist', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'playlist.html'));
});

// 🔸 検索ページ
app.get('/search', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'search.html'));
});

// 🔸 個別コミュニティ投稿ページ
app.get('/post', async (req, res) => {
  const postId = req.query.postId;
  const channelId = req.query.channelId;

  if (!postId || !channelId) {
    return res.status(400).send('postId と channelId は必須です');
  }

  try {
    // 投稿情報をまず取得
    const posts = await getLatestCommunityPost(channelId, 50); // 50件取得して該当IDを探す
    const post = posts.find(p => p.id === postId || p.postId === postId || p.backstagePostId === postId);

    if (!post) return res.status(404).send('投稿が見つかりません');

    // 本文とコメントを取得
    const postContent = await getPostContent(postId, channelId);
    const safePostContent = postContent || {};

    // 画像抽出は post オブジェクトから
// 画像抽出は post オブジェクトから
const images = extractPostImages(post);

// コメント整形（safePostContent から）
const comments = (safePostContent.comments || []).map(c => ({
  author: c.author?.name || '名無し',
  text: c.text || '',
  likes: Number(c.likeCount || c.vote_count || c.likes || 0),
  isHearted: c.isHearted || c.is_hearted || false,
  published: c.published || ''
}));

console.log('✅ コメント取得完了:', comments.length, '件');
console.log('===============================');
console.log('投稿ID:', post.postId || post.id);
console.log('投稿日:', post.published);
console.log('本文:', post.text);
console.log('コメント数:', comments.length);
console.log('--- コメント ---');

comments.forEach((c, i) => {
  console.log(
    `[#${i + 1}] ${c.author} (${c.published})\n  いいね: ${c.likes} / ハート: ${c.isHearted}\n  本文: ${c.text}`
  );
});

    res.json({
      postId: post.id || post.postId,
      published: safePostContent.published || post.published || '',
      text: safePostContent.text || post.text || '', // post オブジェクトから fallback
      images,
      comments
    });
    
  } catch (err) {
    console.error('❌ 投稿取得エラー:', err);
    res.status(500).send('投稿の取得に失敗しました');
  }
});

app.get('/channel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'channel.html'));
});

app.get('/api/channel', async (req, res) => {
  const channelId = req.query.channelId;
  if (!channelId) return res.status(400).json({ error: 'channelId が必要です' });

  const info = await getChannelDetails(channelId);
  if (!info) return res.status(500).json({ error: 'チャンネル情報の取得に失敗しました' });

  res.json(info);
});


// 🔸 検索API
app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  const token = req.query.pageToken;

  try {
    const result = await searchVideos(q, token);
    res.json(result); 
  } catch (err) {
    console.error('❌ 検索エラー:', err);
    res.status(500).json({ error: '検索エラーが発生しました' });
  }
});

// 🔸 サジェストAPI
app.get('/api/suggest', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  try {
    const suggestions = await getSuggest(q);
    return res.json(suggestions);
  } catch (e) {
    console.error('❌ サジェストエラー:', e);
    return res.json([]);
  }
});

app.get('/api/community', async (req, res) => {
  const channelId = req.query.channelId;
  const limit = parseInt(req.query.limit || '5', 10);

  if (!channelId)
    return res.status(400).json({ error: 'channelId が必要です' });

  try {
    const posts = await getLatestCommunityPost(channelId, limit);
    res.json(posts);
  } catch (err) {
    console.error('❌ コミュニティ取得エラー:', err);
    res.status(500).json({ error: err.message });
  }
});


// 🔸 コミュニティ投稿 + コメント取得
app.get('/api/channel-post', async (req, res) => {
  const channelId = req.query.channelId;
  const limit = parseInt(req.query.limit || '5', 10);
  if (!channelId) return res.status(400).json({ error: 'channelId が必要です' });

  try {
    const posts = await getLatestCommunityPost(channelId, limit);
    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: 'コミュニティ投稿が見つかりません' });
    }

    // 各投稿の本文＋コメントを並列取得
    const detailedPosts = await Promise.all(
      posts.map(async (post) => {
        const postId = post.id || post.postId || post.backstagePostId;
        if (!postId) {
          console.warn('⚠ 投稿IDが見つかりません。', post);
          return null;
        }

        // 本文＋コメント取得
        const [postContent] = await Promise.allSettled([
          getPostContent(postId, channelId)
        ]);

        const safePostContent =
          postContent.status === 'fulfilled' ? postContent.value : {};

        // 🔹 投稿から画像URLを抽出
        const images = extractPostImages(post);

        return {
          postId,
          published: safePostContent.published || post.published || '',
          text: safePostContent.text || post.text || '',
          images: safePostContent.images || post.images || [],
          comments: (safePostContent.comments || []).map(c => ({
            author: c.author?.name || '名無し',
            text: c.text || '',
            likes: c.likeCount || c.vote_count || c.likes || 0,
            isHearted: c.isHearted || c.is_hearted || false
          }))
        };
      })
    );

    const validPosts = detailedPosts.filter(Boolean);

    res.json({
      channelId,
      total: validPosts.length,
      posts: validPosts
    });

  } catch (err) {
    console.error('❌ コミュニティ投稿取得エラー:', err);
    res.status(500).json({ error: '投稿またはコメントの取得に失敗しました' });
  }
});

// 🔸 個別コミュニティ投稿コメント取得API
app.get('/api/postComments', async (req, res) => {
  const postId = req.query.postId;
  const channelId = req.query.channelId;

  if (!postId || !channelId) {
    return res.status(400).json({ error: 'postId と channelId が必要です' });
  }

  try {
    console.log(`📥 コメント取得: postId=${postId}, channelId=${channelId}`);

    // community.js の安全な取得関数
    const comments = await getPostComments(postId, channelId, 'TOP_COMMENTS');
    const parsed = parseComments(comments);

    console.log(`📤 抽出コメント数: ${parsed.length}`);
    res.json(parsed);

  } catch (err) {
    console.error("❌ コメント取得エラー:", err);
    res.status(500).json({ error: 'コメント取得に失敗しました' });
  }
});
const { initYouTubeClient } = require('./youtubeClient'); // ここ！
const { initClient } = require('./youtubeService'); // 追加・確認

server.listen(PORT, async () => {
  await initYouTubeClient();
  await initClient();
  console.log(`✅ サーバー起動: http://localhost:${PORT}`);

  const comments = await getPostComments(
    "Ugkxh7KMUGvqIxin7h-8lvkxcpg4KeYATrZ-",
    "UCerAfp_7xAMwFZpN6izmEiQ"
  );

  console.log("📡 コメントオブジェクト型:", comments.constructor?.name);
  console.log("📊 contents の型:", typeof comments.contents, "配列長:", comments.contents?.length ?? "N/A");

  const parsed = parseComments(comments);
  console.log(`✅ 抽出完了 (${parsed.length} 件)`);
  console.log(JSON.stringify(parsed.slice(0, 2), null, 2));
});