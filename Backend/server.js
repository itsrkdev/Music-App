import express from 'express';
import cors from 'cors';
import axios from 'axios';
import 'dotenv/config';

const app = express();

// CORS for all origins (Netlify, Vercel, Localhost)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Backup API endpoints list
const API_ENDPOINTS = [
  'https://saavn.dev/api',
  'https://jiosaavn-api-beta-three.vercel.app/api',
  'https://saavn.me'
];

const fetchWithFallback = async (path, params) => {
  for (const baseUrl of API_ENDPOINTS) {
    try {
      const url = `${baseUrl}${path}`;
      const res = await axios.get(url, { params, timeout: 5000 });
      if (res.data) return res.data;
    } catch (err) {
      console.log(`Failed on ${baseUrl}, trying next...`);
    }
  }
  throw new Error('All API endpoints blocked or unreachable.');
};

// ---------- Search Endpoint ----------
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || 'Bollywood Hits').toString().trim();

  try {
    const data = await fetchWithFallback('/search/songs', { query: q, limit: 20 });
    const results = data?.data?.results || data?.results || [];

    const songs = results.map((song) => {
      let downloadUrl = '';
      if (Array.isArray(song.downloadUrl)) {
        downloadUrl = song.downloadUrl[song.downloadUrl.length - 1]?.url || song.downloadUrl[0]?.url;
      } else if (song.media_url) {
        downloadUrl = song.media_url;
      }

      let image = '';
      if (Array.isArray(song.image)) {
        image = song.image[song.image.length - 1]?.url || song.image[0]?.url;
      } else if (song.image) {
        image = song.image;
      }

      return {
        id: song.id,
        name: song.name ? song.name.replace(/&quot;/g, '"').replace(/&#039;/g, "'") : (song.song || 'Unknown Track'),
        artist: song.primaryArtists || song.singers || 'Unknown Artist',
        image: image || 'https://via.placeholder.com/300x300?text=Music',
        streamUrl: downloadUrl
      };
    });

    res.json(songs);
  } catch (err) {
    console.error("Search Error:", err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ---------- Stream Endpoint ----------
app.get('/api/stream', async (req, res) => {
  const songId = (req.query.id || '').toString().trim();
  if (!songId) return res.status(400).json({ error: 'Song ID required' });

  try {
    const data = await fetchWithFallback('/songs', { ids: songId });
    const songData = data?.data?.[0] || data?.[0];

    if (songData) {
      let streamUrl = '';
      if (Array.isArray(songData.downloadUrl)) {
        streamUrl = songData.downloadUrl[songData.downloadUrl.length - 1]?.url;
      } else if (songData.media_url) {
        streamUrl = songData.media_url;
      }

      if (streamUrl) return res.json({ url: streamUrl });
    }
    
    return res.status(404).json({ error: 'Audio stream not found' });
  } catch (err) {
    console.error("Stream Fetch Error:", err.message);
    res.status(500).json({ error: 'Failed to fetch audio stream' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
