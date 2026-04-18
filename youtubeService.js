const { Innertube } = require('youtubei.js');
let client = null;

async function initClient() {
  client = await Innertube.create({ lang: 'ja', location: 'JP' });
}

async function getCommentReplies(videoId, commentId) {
  if (!client) await initClient();

  try {
    const repliesSection = await client.getCommentReplies(videoId, commentId);

    if (!repliesSection?.contents) {
      throw new Error("返信セクションが見つかりませんでした");
    }

    return repliesSection.contents.map(reply => {
      const r = reply.comment;
      return {
        id: r?.id,
        text: r?.content?.text || '',
        author: r?.author?.name || '不明',
        authorPhoto: r?.author?.thumbnails?.[0]?.url || null,
        likes: r?.like_count || 0,
        publishedTime: r?.published || null
      };
    });
  } catch (err) {
    console.error('❌ 返信取得失敗:', err.message);
    return [];
  }
}


module.exports = {
  initClient,
  getCommentReplies,
};