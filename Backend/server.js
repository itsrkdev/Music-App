import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import play from 'play-dl';
import { Readable } from 'node:stream';

const app = express();
app.use(cors({ exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'] }));

const cache = new Map();       // query -> { time, data }
const streamCache = new Map(); // videoId -> { time, url, mime }
const TTL = 60 * 60 * 1000;    // 1 hour
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const decode = (s = '') =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

// ---------- Health check (Render wake-up / keep-alive ke liye) ----------
app.get('/', (_req, res) => res.send('OK'));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------- Search Endpoint ----------
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]);

  if (!process.env.YT_KEY) {
    return res.status(500).json({ error: 'Server me YT_KEY set nahi hai.' });
  }

  const hit = cache.get(q);
  if (hit && Date.now() - hit.time < TTL) return res.json(hit.data);

  try {
    const url =
      'https://www.googleapis.com/youtube/v3/search' +
      `?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&maxResults=20` +
      `&q=${encodeURIComponent(q + ' song')}&key=${process.env.YT_KEY}`;

    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await r.json();
    if (!r.ok) {
      return res
        .status(r.status)
        .json({ error: data.error?.message || 'YouTube API error' });
    }

    const songs = (data.items || []).map((i) => ({
      id: i.id.videoId,
      name: decode(i.snippet.title),
      artist: decode(i.snippet.channelTitle),
      image: i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url,
    }));

    cache.set(q, { time: Date.now(), data: songs });
    res.json(songs);
  } catch (err) {
    console.error('Search Error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ---------- Direct audio URL nikalna ----------
async function getAudioInfo(videoId, force = false) {
  const cached = streamCache.get(videoId);
  if (!force && cached && Date.now() - cached.time < TTL) return cached;

  const info = await play.video_info(`https://www.youtube.com/watch?v=${videoId}`);
  const audio = info.format.filter((f) => f.mimeType && f.mimeType.startsWith('audio') && f.url);
  if (!audio.length) throw new Error('NO_AUDIO');

  // m4a (audio/mp4) sabhi browsers me chalta hai, isliye pehle wo, warna highest bitrate
  const byBitrate = (a, b) => (b.bitrate || 0) - (a.bitrate || 0);
  const mp4 = audio.filter((f) => f.mimeType.includes('audio/mp4')).sort(byBitrate);
  const best = mp4[0] || audio.sort(byBitrate)[0];

  const entry = { time: Date.now(), url: best.url, mime: best.mimeType.split(';')[0] };
  streamCache.set(videoId, entry);
  return entry;
}

async function fetchUpstream(url, range) {
  const headers = { 'User-Agent': UA };
  if (range) headers.Range = range;
  return fetch(url, { headers });
}

// ---------- Audio Stream Endpoint (proxy: browser ko audio yahin se milega) ----------
app.get('/api/stream', async (req, res) => {
  const videoId = (req.query.id || '').toString().trim();
  if (!/^[\w-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Valid Video ID chahiye.' });
  }

  try {
    let entry = await getAudioInfo(videoId);
    let upstream = await fetchUpstream(entry.url, req.headers.range);

    // URL expire / IP mismatch ho to ek baar fresh URL lekar retry
    if (!upstream.ok) {
      streamCache.delete(videoId);
      entry = await getAudioInfo(videoId, true);
      upstream = await fetchUpstream(entry.url, req.headers.range);
    }

    if (!upstream.ok || !upstream.body) {
      console.error('Upstream status:', upstream.status);
      return res.status(502).json({ error: `YouTube ne audio dene se mana kiya (${upstream.status}).` });
    }

    res.status(upstream.status); // 200 ya 206 (seek ke liye)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || entry.mime);
    res.setHeader('Accept-Ranges', 'bytes');
    const len = upstream.headers.get('content-length');
    const range = upstream.headers.get('content-range');
    if (len) res.setHeader('Content-Length', len);
    if (range) res.setHeader('Content-Range', range);

    const body = Readable.fromWeb(upstream.body);
    req.on('close', () => body.destroy());
    body.on('error', () => res.end());
    body.pipe(res);
  } catch (err) {
    console.error('Stream Error:', err);
    if (res.headersSent) return res.end();
    if (err.message === 'NO_AUDIO') return res.status(404).json({ error: 'Audio stream nahi mila.' });
    return res.status(500).json({ error: 'Audio stream extract karne me dikkat hui.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
