import express from 'express';
import cors from 'cors';
import axios from 'axios';
import 'dotenv/config';

const app = express();

// Enable CORS for all incoming requests
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Multi-fallback Working JioSaavn & Alternative Endpoints
const API_ENDPOINTS = [
  'https://saavn.dev/api',
  'https://jiosavan-api.vercel.app/api',
  'https://jiosaavn-api-beta-three.vercel.app/api',
  'https://saavn.me/api'
];

// Helper Function with longer timeout and fallback handling
const fetchWithFallback = async (path, params) => {
  let lastError = null;
  
  for (const baseUrl of API_ENDPOINTS) {
    try {
      const url = `${baseUrl}${path}`;
      console.log(`Fetching from: ${url}`);
      const res = await axios.get(url, { params, timeout: 15000 });
      
      if (res.data && (res.data.data || res.data.results || res.data.status === 'SUCCESS')) {
        return res.data;
      }
    } catch (err) {
      console.log(`Failed endpoint ${baseUrl}: ${err.message}`);
      lastError = err;
    }
  }
  throw lastError || new Error('All music sources failed');
};

// ---------- Search Endpoint ----------
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || 'Bollywood Hits').toString().trim();

  try {
    const data = await fetchWithFallback('/search/songs', { query: q, limit: 20 });
    
    // Normalize API Response structure across different instances
    const results = data?.data?.results || data?.data || data?.results || [];

    if (!Array.isArray(results) || results.length === 0) {
      return res.json([]);
    }

    const songs = results.map((song) => {
      // Audio Link Extraction
      let downloadUrl = '';
      if (Array.isArray(song.downloadUrl) && song.downloadUrl.length > 0) {
        downloadUrl = song.downloadUrl[song.downloadUrl.length - 1]?.url || song.downloadUrl[0]?.url;
      } else if (typeof song.downloadUrl === 'string') {
        downloadUrl = song.downloadUrl;
      } else if (song.media_url) {
        downloadUrl = song.media_url;
      }

      // Thumbnail Extraction
      let image = '';
      if (Array.isArray(song.image) && song.image.length > 0) {
        image = song.image[song.image.length - 1]?.url || song.image[0]?.url;
      } else if (typeof song.image === 'string') {
        image = song.image;
      }

      return {
        id: song.id,
        name: song.name ? song.name.replace(/&quot;/g, '"').replace(/&#039;/g, "'") : (song.song || 'Unknown Track'),
        artist: song.primaryArtists || song.singers || song.artist || 'Unknown Artist',
        image: image || 'https://via.placeholder.com/300x300?text=Music',
        streamUrl: downloadUrl
      };
    });

    return res.json(songs);
  } catch (err) {
    console.error("Search Error Detail:", err.message);
    return res.status(500).json({ error: 'Server connects, but music provider APIs are down or timing out.' });
  }
});

// ---------- Stream Endpoint ----------
app.get('/api/stream', async (req, res) => {
  const songId = (req.query.id || '').toString().trim();
  if (!songId) return res.status(400).json({ error: 'Song ID required' });

  try {
    const data = await fetchWithFallback('/songs', { ids: songId });
    const songData = data?.data?.[0] || data?.data || data?.[0];

    if (songData) {
      let streamUrl = '';
      if (Array.isArray(songData.downloadUrl) && songData.downloadUrl.length > 0) {
        streamUrl = songData.downloadUrl[songData.downloadUrl.length - 1]?.url;
      } else if (songData.media_url) {
        streamUrl = songData.media_url;
      }

      if (streamUrl) return res.json({ url: streamUrl });
    }
    
    return res.status(404).json({ error: 'Audio stream not found' });
  } catch (err) {
    console.error("Stream Fetch Error:", err.message);
    return res.status(500).json({ error: 'Failed to fetch audio stream' });
  }
});

// Root route for Health Check
app.get('/', (req, res) => {
  res.send('Vibe Music Backend is running live!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
