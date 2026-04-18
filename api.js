const axios = require('axios');
const bodyParser = require('body-parser');
const { initYouTubeClient, getYouTubeClient } = require('./youtubeClient');

let apis = null;
const MAX_API_WAIT_TIME = 3000; 
const MAX_TIME = 10000;

const FALLBACK_INVIDIOUS = [
    'https://yt.omada.cafe/',
    'https://invidious.ducks.party/',
    'https://invidious.lunivers.trade/',
    'https://invidious.nikkosphere.com/',
    'https://iv.melmac.space/',
    'https://lekker.gay/'
];

async function getapis() {
    try {
        const response = await axios.get(
            'https://raw.githubusercontent.com/wakame02/wktopu/refs/heads/main/inv.json'
        );

        const gitApis = response.data || [];

        // ✅ 固定 inv を先頭に
        apis = [...new Set([...FALLBACK_INVIDIOUS, ...gitApis])];

        console.log('データを取得しました:', apis);
    } catch (error) {
        console.error('データの取得に失敗しました:', error);
        await getapisgit();
    }
}

async function getapisgit() {
    try {
        const response = await axios.get(
            'https://raw.githubusercontent.com/wakame02/wktopu/refs/heads/main/inv.json'
        );

        const gitApis = response.data || [];

        // ✅ ここでも逆優先
        apis = [...new Set([...FALLBACK_INVIDIOUS, ...gitApis])];
    } catch (error) {
        console.error('データの取得に失敗しました:', error);

        // ❗ 完全にダメでも固定 inv は必ず使う
        apis = [...FALLBACK_INVIDIOUS];
    }

    console.log('最終的な apis:', apis);
}

async function ggvideo(videoId) {
    const startTime = Date.now();
    const instanceErrors = new Set();

    if (!apis) await getapisgit();

    for (const instance of apis) {
        try {
            const response = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: MAX_API_WAIT_TIME });
            console.log(`使ってみたURL: ${instance}/api/v1/videos/${videoId}`);

            if (response.data && response.data.formatStreams) {
                return response.data;
            } else {
                console.error(`formatStreamsが存在しない: ${instance}`);
            }
        } catch (error) {
            console.error(`エラーだよ: ${instance} - ${error.message}`);
            instanceErrors.add(instance);
        }

        if (Date.now() - startTime >= MAX_TIME) {
            throw new Error("接続がタイムアウトしました");
        }
    }

    // 💡 すべての Invidious API が失敗した場合は Innertube で直接取得
    try {
        const client = getYouTubeClient();
        const videoInfo = await client.getInfo(videoId);
        console.log('✅ Innertube から取得成功');

        // formatStreams / adaptiveFormats を整形して返す
        return {
            formatStreams: videoInfo.streamingData?.formats || [],
            adaptiveFormats: videoInfo.streamingData?.adaptiveFormats || [],
            authorId: videoInfo.author?.id,
            author: videoInfo.author?.name,
            authorThumbnails: videoInfo.author?.thumbnails,
            title: videoInfo.title,
            descriptionHtml: videoInfo.description,
            viewCount: videoInfo.stats?.views || 0,
            likeCount: videoInfo.stats?.likes || 0,
            hlsUrl: videoInfo.streamingData?.hlsManifestUrl || null
        };
    } catch (err) {
        throw new Error(`動画を取得できませんでした: ${err.message}`);
    }
}

// 日本語音声優先関数
function getPreferredAudio(audioStreams) {
    if (!audioStreams || !audioStreams.length) return null;

    // ① 日本語優先
    const jaStream = audioStreams.find(stream =>
        /(\b|%3D)(ja|jpn)(\b|%)/i.test(stream.url) ||
        /lang=ja/.test(stream.language || '') ||
        /ja/.test(stream.audioTrack?.displayName || '')
    );
    if (jaStream) return jaStream;

    // ② xtags 内オリジナル言語優先
    const originalStream = audioStreams.find(stream =>
        /acont=dubbed-auto:lang=([a-z]{2}(?:-[A-Z]{2})?)/i.test(stream.url)
    );
    if (originalStream) return originalStream;

    // ③ 韓国語優先
    const koStream = audioStreams.find(stream =>
        /(\b|%3D)(ko|kor)(\b|%)/i.test(stream.url) ||
        /lang=ko/.test(stream.language || '') ||
        /ko/.test(stream.audioTrack?.displayName || '')
    );
    if (koStream) return koStream;

    // ④ 英語以外の m4a
    const nonEnglish = audioStreams.find(stream =>
        stream.container === 'm4a' &&
        !/en|eng/i.test(stream.url) &&
        !/en|eng/i.test(stream.language || '')
    );
    if (nonEnglish) return nonEnglish;

    // ⑤ 最後の手段: 英語も含む m4a
    return audioStreams.find(stream => stream.container === 'm4a') || audioStreams[0];
}

async function getYouTube(videoId) {
    const client = getYouTubeClient();
    try {
        const videoInfo = await ggvideo(videoId);
        const formatStreams = videoInfo.formatStreams || [];
        let streamUrl = formatStreams.reverse().map(stream => stream.url)[0];
        const audioStreams = videoInfo.adaptiveFormats || [];

        const audioStream = getPreferredAudio(audioStreams);
        const audioUrl = audioStream?.url || null;

        // 🎬 タイトル関連の整理
        // 元タイトル
        const originalTitle = videoInfo.title || "";

        // Innertube の localized 情報があれば日本語タイトルとして優先
        const localizedTitle = videoInfo.localized?.title || originalTitle;

        const highstreamUrl = audioStreams
            .filter(stream => stream.container === 'webm' && stream.resolution === '1080p')
            .map(stream => stream.url)[0];

        const streamUrls = audioStreams
            .filter(stream => stream.container === 'webm' && stream.resolution)
            .map(stream => ({ url: stream.url, resolution: stream.resolution }));

        if (videoInfo.hlsUrl) {
            streamUrl = `/wkt/live/s/${videoId}`;
        }

        const fixedDescription = videoInfo.descriptionHtml
            .replace(/https?:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_\-]+)/g, '/video.html?videoId=$1')
            .replace(/\/watch\?v=([a-zA-Z0-9_\-]+)/g, '/video.html?videoId=$1');

        return {
            stream_url: streamUrl,
            highstreamUrl,
            audioUrl,
            videoId,
            channelId: videoInfo.authorId,
            channelName: videoInfo.author,
            channelImage: videoInfo.authorThumbnails?.[videoInfo.authorThumbnails.length - 1]?.url || '',
            videoTitle: localizedTitle, // 日本語優先
            videoDes: fixedDescription,
            videoViews: videoInfo.viewCount,
            likeCount: videoInfo.likeCount,
            streamUrls
        };
    } catch (error) {
        return error;
    }
}
module.exports = { 
    ggvideo, 
    getapis,
    getYouTube
};
