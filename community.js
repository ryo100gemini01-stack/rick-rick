const YouTubeJS = require('youtubei.js');
const { getYouTubeClient } = require('./youtubeClient');

// ============================================
// 🧩 JSON内のすべての "text" フィールドを再帰的に探索
// ============================================
function findAllTexts(obj) {
  let texts = [];

  if (typeof obj !== 'object' || obj === null) return texts;

  if (typeof obj.text === 'string' && obj.text.trim()) {
    texts.push(obj.text.trim());
  }

  for (const key of Object.keys(obj)) {
    texts = texts.concat(findAllTexts(obj[key]));
  }

  return texts;
}

// ============================================
// 🧠 投稿本文を抽出する
// ============================================
function extractPostText(post) {
  if (!post) return '';

  if (post.content?.text) return post.content.text;
  if (Array.isArray(post.content?.runs)) {
    return post.content.runs.map(r => r.text).join('');
  }

  const texts = findAllTexts(post);
  const candidates = texts.filter(t => t.length > 20 && !t.match(/(週前|か月前|日前|コメント|高評価)/));
  return candidates[0] || '';
}

// ============================================
// 📝 コメント本文を抽出する
// ============================================
function extractCommentText(comment) {
  if (!comment) return '';

  const texts = [];

  if (comment.content?.text) texts.push(comment.content.text);
  if (Array.isArray(comment.content?.runs)) {
    texts.push(comment.content.runs.map(r => r.text).join(''));
  }

  const recursiveTexts = findAllTexts(comment);
  texts.push(...recursiveTexts);

  const candidates = texts.filter(t => t.length > 5 && !t.match(/(週前|か月前|日前|コメント|高評価)/));
  return candidates[0] || '';
}

// ============================================
// 🗨️ コメント配列をJSONとして抽出（クラス対応版）
// ============================================
function parseComments(commentsObj) {
  if (!commentsObj) {
    console.warn("⚠️ コメントデータが未定義です");
    return [];
  }

  const contents = Array.isArray(commentsObj)
    ? commentsObj
    : commentsObj.contents || commentsObj.items || [];

  if (!Array.isArray(contents) || contents.length === 0) {
    console.warn("⚠️ コメントが空または不正です");
    return [];
  }

  return contents.map(item => {
    const c = item.comment || item.commentView || item;
    if (!c || !c.comment_id) return null;

    return {
      id: c.comment_id,
      text: c.content?.text || '',
      author: {
        name: c.author?.name || '名無し',
        url: c.author?.url || '',
        thumbnail: c.author?.thumbnails?.[0]?.url || null
      },
      published: c.published_time || '',
      likeCount: parseInt(c.like_count || '0', 10),
      isHearted: !!c.is_hearted,
      replyCount: parseInt(c.reply_count || '0', 10),
      isMember: !!c.is_member
    };
  }).filter(Boolean);
}

// ============================================
// communityから最新の投稿を抽出する関数
// ============================================
function parseCommunityPost(thread) {
  const post = thread.post;
  const text = extractPostText(post);
  const images = extractPostImages(post);

  if (images.length > 0) {
    console.log('画像URL:');
    images.forEach((url, i) => console.log(`  [${i + 1}] ${url}`));
  } else {
    console.log('画像なし');
  }

  return {
    id: post.id,
    authorName: post.author?.name,
    authorUrl: post.author?.url,
    authorThumbnail: post.author?.thumbnails?.[0]?.url || null,
    text,
    published: post.published?.text || '',
    likeCount: post.vote_count?.text || '0',
    commentCount: post.action_buttons?.reply_button?.label || '0 件',
    images
  };
}

// ============================================
// 再帰的にpostオブジェクトを探す
// ============================================
function findPostRecursive(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.post) return obj.post;
  for (const key of Object.keys(obj)) {
    const result = findPostRecursive(obj[key]);
    if (result) return result;
  }
  return null;
}

// ============================================
// communityオブジェクトから最初の投稿を取得
// ============================================
function getFirstBackstagePost(community) {
  if (Array.isArray(community.contents)) {
    for (const item of community.contents) {
      const post = findPostRecursive(item);
      if (post) return post;
    }
  }
  return findPostRecursive(community);
}

// ============================================
// 🖼️ 投稿内の画像URLをすべて抽出する
// ============================================
function extractPostImages(post) {
  const images = [];

  if (post.backstageAttachment?.backstageImageRenderer?.image?.thumbnails) {
    const thumbs = post.backstageAttachment.backstageImageRenderer.image.thumbnails;
    thumbs.forEach(t => images.push(t.url));
  }

  if (Array.isArray(post.backstageAttachments)) {
    for (const att of post.backstageAttachments) {
      const thumbList = att?.backstageImageRenderer?.image?.thumbnails || [];
      thumbList.forEach(t => images.push(t.url));
    }
  }

  if (post.attachment?.backstageImageRenderer?.image?.thumbnails) {
    const thumbs = post.attachment.backstageImageRenderer.image.thumbnails;
    thumbs.forEach(t => images.push(t.url));
  }

  if (post.attachment?.type === 'PostMultiImage' && Array.isArray(post.attachment.images)) {
    post.attachment.images.forEach(img => {
      if (Array.isArray(img.image)) {
        img.image.forEach(i => {
          if (i.url) images.push(i.url);
        });
      }
    });
  }

  return [...new Set(images)];
}

// ============================================
// チャンネルの最新コミュニティ投稿を複数取得
// ============================================
async function getLatestCommunityPost(channelId, limit = 8) {
  const client = getYouTubeClient();
  const channel = await client.getChannel(channelId);
  const community = await channel.getCommunity().catch(() => null);
  
  if (!community) {
    throw new Error('コミュニティ情報の取得に失敗しました');
  }

  function collectPosts(obj, posts = []) {
    if (!obj || typeof obj !== 'object') return posts;

    if (obj.post) {
      posts.push(obj.post);
      if (posts.length >= limit) return posts;
    }

    for (const key of Object.keys(obj)) {
      collectPosts(obj[key], posts);
      if (posts.length >= limit) break;
    }

    return posts;
  }

  const posts = collectPosts(community).slice(0, limit);

  if (posts.length === 0) {
    throw new Error('コミュニティ投稿が見つかりません');
  }

  const parsedPosts = posts.map(post => parseCommunityPost({ post }));

  console.log(`📢 最新コミュニティ投稿（最大 ${limit} 件）`);
  parsedPosts.forEach((p, i) => {
    console.log('===============================');
    console.log(`投稿 #${i + 1}`);
    console.log(`ID: ${p.id}`);
    console.log(`著者: ${p.authorName}`);
    console.log(`URL: ${p.authorUrl}`);
    console.log(`サムネ: ${p.authorThumbnail}`);
    console.log(`投稿日: ${p.published}`);
    console.log(`いいね: ${p.likeCount}`);
    console.log(`コメント数: ${p.commentCount}`);
    console.log(`本文: ${p.text}`);
  });

  return parsedPosts;
}

// ============================================
// 🕵️ コメントオブジェクトの構造を再帰的に確認する関数
// ============================================
async function printCommentStructure(commentObj, prefix = '') {
  if (!commentObj || typeof commentObj !== 'object') return;

  for (const key of Object.keys(commentObj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = commentObj[key];

    // 値の型も表示
    if (Array.isArray(value)) {
      console.log(`${path} [Array, length=${value.length}]`);
      value.forEach((item, i) => {
        printCommentStructure(item, `${path}[${i}]`);
      });
    } else if (typeof value === 'object' && value !== null) {
      console.log(`${path} [Object]`);
      printCommentStructure(value, path);
    } else {
      console.log(`${path} [${typeof value}]: ${value}`);
    }
  }
}

// ============================================
// 個別投稿の詳細を取得（本文とコメントを分離）
// ============================================
async function getPostContent(postId, channelId) {
  const client = getYouTubeClient();

  // 投稿データ本体
  const postData = await client.getPost(postId, channelId);
  const post = postData.post || postData; // ←★ 修正ポイント
  const text = extractPostText(post);
  const images = extractPostImages(post);

  // コメント取得
  console.log("📡 コメント取得開始...");
  const commentsRaw = await client.getPostComments(postId, channelId, 'TOP_COMMENTS');
  const comments = parseComments(commentsRaw);
  console.log(`✅ コメント取得完了: ${comments.length} 件`);

  console.log('===============================');
  console.log(`投稿ID: ${post.id}`);
  console.log(`投稿日: ${post.published?.text || ''}`);
  console.log(`本文: ${text}`);
  console.log(`コメント数: ${comments.length}`);

  if (comments.length > 0) {
    console.log('--- コメント ---');
    comments.forEach((c, i) => {
      console.log(`[#${i + 1}] ${c.author.name} (${c.published})`);
      console.log(`  いいね: ${c.likeCount} / ハート: ${c.isHearted}`);
      console.log(`  本文: ${c.text}`);
    });
  } else {
    console.log('コメントなし');
  }

  return {
    postId: post.id || post.backstagePostId || postData?.id || postId, // ←★ 修正
    published: post.published?.text || '',
    text,
    images,
    comments
  };
}

// ============================================
// 投稿コメントを取得
// ============================================
async function getPostComments(postId, channelId, sortBy = 'TOP_COMMENTS') {
  const client = getYouTubeClient();
  const comments = await client.getPostComments(postId, channelId, sortBy);
  return comments;
}

async function fetchPostCommentsSafely(postId, channelId) {
  const client = getYouTubeClient();
  try {
    const commentsObj = await client.getPostComments(postId, channelId, 'TOP_COMMENTS');
    const parsed = parseComments(commentsObj);
    if (parsed.length === 0) console.warn("⚠️ コメントが存在しません");
    return parsed;
  } catch (err) {
    console.error("コメント取得エラー:", err.message);
    return [];
  }
}

// ============================================
// モジュールエクスポート
// ============================================
module.exports = {
  getLatestCommunityPost,
  getPostContent,
  getPostComments,
  extractPostImages,
  printCommentStructure,
  parseComments
};