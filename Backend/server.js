import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
app.use(cors());

const cache = new Map(); // query -> { time, data } (quota bachane ke liye)
const TTL = 60 * 60 * 1000; // 1 hour

const decode = (s = '') =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
