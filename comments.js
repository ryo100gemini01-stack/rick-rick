const YouTubeJS = require("youtubei.js");
const { getYouTubeClient, initYouTubeClient } = require('./youtubeClient');

async function getComments(videoId, maxPages = 2) {
  const client = getYouTubeClient();

  try {
    let commentSection = await client.getComments(videoId);

    const topLevelComments = [];
    let page = 0;

    while (commentSection && commentSection.contents && page < maxPages) {
      for (const thread of commentSection.contents) {
        const comment = thread.comment;

        const topCommentId = comment?.comment_id || null;

        const mainComment = {
          id: topCommentId,
          text: comment?.content?.text || '',
          author: comment?.author?.name || '不明',
          authorPhoto: comment?.author?.thumbnails?.[0]?.url || null,
          likes: Number(comment?.like_count || 0),
          publishedTime: comment?.published_time || '不明',
          hasReplies: Number(comment?.reply_count || 0) > 0,
          replyCount: Number(comment?.reply_count || 0),
          replies: [],  // 空配列のまま
        };

        topLevelComments.push(mainComment);
      }

      if (commentSection.continuation) {
        commentSection = await client.getComments(videoId, commentSection.continuation);
        page++;
      } else {
        break;
      }
    }

    return topLevelComments;
  } catch (err) {
    console.error('❌ コメント取得失敗:', err.message);
    return [];
  }
}

module.exports = {
  getComments,
};