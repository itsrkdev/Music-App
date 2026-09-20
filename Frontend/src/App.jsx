import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Play, Pause, Search, Music, SkipBack, SkipForward, Volume2, VolumeX, Loader2 } from 'lucide-react';
import './App.css';

const API = (import.meta.env.VITE_API_URL ;

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#282828"/><text x="150" y="160" font-size="24" fill="#b3b3b3" text-anchor="middle" font-family="sans-serif">Music</text></svg>'
  );

const CATEGORIES = ['Bollywood Hits', 'Hindi Songs', 'Bhojpuri Hits', 'English Songs', 'Pawan Singh', 'Arijit Singh'];

const PLAYER_BLOCKED_MSG =
  'YouTube player load nahi hua. Network/firewall ya adblock check karein (dusra network try karein).';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Render free tier cold start ke liye timeout + retry
async function searchWithRetry(q, onWaking, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const { data } = await axios.get(`${API}/api/search`, { params: { q }, timeout: 60000 });
      return data;
    } catch (err) {
      if (err.response) throw err;
      if (i === tries - 1) throw err;
      onWaking();
      await sleep(4000);
    }
  }
}

// YouTube IFrame API ek baar load karna (block hone par reject)
let ytApiPromise = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => {
      ytApiPromise = null;
      reject(new Error('YT API blocked'));
    };
    document.head.appendChild(tag);

    // Firewall "blocked" page deta hai to onerror nahi chalta, isliye timeout
    setTimeout(() => {
      if (!(window.YT && window.YT.Player)) {
        ytApiPromise = null;
        reject(new Error('YT API timeout'));
      }
    }, 8000);
  });
  return ytApiPromise;
}

function App() {
  const [query, setQuery] = useState('Bollywood Hits');
  const [songs, setSongs] = useState([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Loading...');
  const [songLoading, setSongLoading] = useState(false);
  const [error, setError] = useState('');

  const playerRef = useRef(null);
  const readyRef = useRef(false);
  const apiFailedRef = useRef(false);
  const pendingRef = useRef(null);
  const loadTimerRef = useRef(null);
  const songsRef = useRef([]);
  const indexRef = useRef(null);
  const volumeRef = useRef(0.5);
  const searchIdRef = useRef(0);
  const playNextRef = useRef(() => {});

  useEffect(() => { songsRef.current = songs; }, [songs]);
  useEffect(() => { indexRef.current = currentSongIndex; }, [currentSongIndex]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  const clearLoadTimer = () => clearTimeout(loadTimerRef.current);

  // ---------- YouTube Player setup ----------
  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player('yt-player', {
          height: '200',
          width: '200',
          playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: () => {
              readyRef.current = true;
              playerRef.current.setVolume(volumeRef.current * 100);
              if (pendingRef.current) {
                playerRef.current.loadVideoById(pendingRef.current);
                pendingRef.current = null;
              }
            },
            onStateChange: (e) => {
              const S = window.YT.PlayerState;
              if (e.data === S.PLAYING) {
                clearLoadTimer();
                setIsPlaying(true);
                setSongLoading(false);
                setDuration(playerRef.current.getDuration() || 0);
              } else if (e.data === S.PAUSED) {
                setIsPlaying(false);
              } else if (e.data === S.BUFFERING) {
                setSongLoading(true);
              } else if (e.data === S.CUED) {
                playerRef.current.playVideo(); // autoplay atak gaya ho to dhakka do
              } else if (e.data === S.ENDED) {
                setIsPlaying(false);
                playNextRef.current();
              }
            },
            onError: (e) => {
              clearLoadTimer();
              setSongLoading(false);
              setIsPlaying(false);
              // 101/150: embed allow nahi, 100: video hata diya gaya
              setError(
                [101, 150].includes(e.data)
                  ? 'Is song ka owner embed allow nahi karta. Dusra song try karein.'
                  : 'Song play nahi ho paya. Dusra song try karein.'
              );
            },
          },
        });
      })
      .catch(() => {
        apiFailedRef.current = true;
        setError(PLAYER_BLOCKED_MSG);
      });
    return () => {
      cancelled = true;
      clearLoadTimer();
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
    };
  }, []);

  // Progress bar ke liye time poll karna
  useEffect(() => {
    if (!isPlaying) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (p && readyRef.current) {
        setCurrentTime(p.getCurrentTime() || 0);
        setDuration(p.getDuration() || 0);
      }
    }, 500);
    return () => clearInterval(t);
  }, [isPlaying]);

  // ---------- Search Songs ----------
  const fetchSongs = async (searchQuery) => {
    const myId = ++searchIdRef.current;
    setLoading(true);
    setLoadingMsg('Loading...');
    setError(apiFailedRef.current ? PLAYER_BLOCKED_MSG : '');
    try {
      const data = await searchWithRetry(searchQuery, () =>
        setLoadingMsg('Server wake ho raha hai, 30-60 sec lag sakte hain...')
      );
      if (myId !== searchIdRef.current) return;
      if (Array.isArray(data)) {
        setSongs(data);
        if (data.length === 0) setError('Koi song nahi mila.');
      } else {
        setError(data?.error || 'Kuch galat hua.');
      }
    } catch (err) {
      if (myId !== searchIdRef.current) return;
      console.error('Search API Error:', err);
      if (err.response) {
        setError(err.response.data?.error || `Server error (${err.response.status})`);
      } else {
        setError('Server se connect nahi ho paya. Backend wake-up ho raha hai, thodi der baad try karein.');
      }
    } finally {
      if (myId === searchIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSongs(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Play/Pause Song ----------
  const playSong = (index) => {
    const song = songsRef.current[index];
    if (!song) return;

    if (apiFailedRef.current) {
      setCurrentSongIndex(index);
      indexRef.current = index;
      setError(PLAYER_BLOCKED_MSG);
      return;
    }

    const p = playerRef.current;

    // Same song: toggle
    if (indexRef.current === index && p && readyRef.current) {
      const state = p.getPlayerState();
      if (state === window.YT.PlayerState.PLAYING) p.pauseVideo();
      else p.playVideo();
      return;
    }

    setCurrentSongIndex(index);
    indexRef.current = index;
    setSongLoading(true);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError('');

    // Spinner hamesha na ghumta rahe: 12 sec me start na ho to error dikhao
    clearLoadTimer();
    loadTimerRef.current = setTimeout(() => {
      setSongLoading(false);
      setError(
        readyRef.current
          ? 'Song start nahi ho paya. Play button dobara dabao ya dusra song try karein.'
          : PLAYER_BLOCKED_MSG
      );
    }, 12000);

    if (p && readyRef.current) {
      p.loadVideoById(song.id);
    } else {
      pendingRef.current = song.id;
    }
  };

  const handleNext = () => {
    const i = indexRef.current;
    if (i !== null && i < songsRef.current.length - 1) playSong(i + 1);
  };
  playNextRef.current = handleNext;

  const handlePrev = () => {
    const i = indexRef.current;
    if (i !== null && i > 0) playSong(i - 1);
  };

  // ---------- Controls ----------
  const handleSeek = (e) => {
    const t = parseFloat(e.target.value);
    if (playerRef.current && readyRef.current) {
      playerRef.current.seekTo(t, true);
      setCurrentTime(t);
    }
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (playerRef.current && readyRef.current) playerRef.current.setVolume(v * 100);
  };

  const formatTime = (time) => {
    if (!time || isNaN(time) || !isFinite(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) fetchSongs(query);
  };

  const currentSong = currentSongIndex !== null ? songs[currentSongIndex] : null;

  return (
    <div className="app-container">
      {/* Lagbhag invisible YouTube player (display:none ya bahut door offscreen nahi) */}
      <div
        style={{ position: 'fixed', right: 0, bottom: 0, width: 200, height: 200, opacity: 0.01, pointerEvents: 'none', zIndex: -1 }}
        aria-hidden="true"
      >
        <div id="yt-player" />
      </div>

      <header className="app-header">
        <Music size={28} />
        <span>VibeMusic App</span>
      </header>

      {/* Category Filters */}
      <div className="filter-container">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            className={`filter-btn ${query === category ? 'active' : ''}`}
            onClick={() => {
              setQuery(category);
              fetchSongs(category);
            }}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Hindi, English, Bhojpuri songs..."
        />
        <button type="submit" className="search-btn">
          <Search size={18} />
        </button>
      </form>

      {loading && <p style={{ textAlign: 'center', color: '#b3b3b3' }}>{loadingMsg}</p>}
      {error && <p style={{ textAlign: 'center', color: '#ff6b6b' }}>{error}</p>}

      {/* Songs Grid */}
      <div className="songs-grid">
        {songs.map((song, index) => (
          <div
            key={song.id || index}
            className={`song-card ${currentSongIndex === index ? 'playing' : ''}`}
            onClick={() => playSong(index)}
          >
            <img
              src={song.image || PLACEHOLDER}
              alt={song.name}
              className="song-img"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = PLACEHOLDER;
              }}
            />
            <h4 className="song-title">{song.name}</h4>
            <p className="song-artist">{song.artist}</p>
          </div>
        ))}
      </div>

      {/* Bottom Player Bar */}
      {currentSong && (
        <div className="player-bar">
          <div className="player-info">
            <img src={currentSong.image || PLACEHOLDER} alt={currentSong.name} className="player-img" />
            <div>
              <h4 className="song-title">{currentSong.name}</h4>
              <p className="song-artist">{currentSong.artist}</p>
            </div>
          </div>

          <div style={{ flex: 1, maxWidth: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <SkipBack size={20} onClick={handlePrev} style={{ cursor: 'pointer', opacity: currentSongIndex === 0 ? 0.4 : 1 }} />

              <button className="player-play-btn" onClick={() => playSong(currentSongIndex)}>
                {songLoading ? (
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                ) : isPlaying ? (
                  <Pause size={20} />
                ) : (
                  <Play size={20} />
                )}
              </button>

              <SkipForward size={20} onClick={handleNext} style={{ cursor: 'pointer', opacity: currentSongIndex === songs.length - 1 ? 0.4 : 1 }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', fontSize: '12px', color: '#b3b3b3' }}>
              <span>{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="any"
                value={currentTime}
                onChange={handleSeek}
                style={{ flex: 1, accentColor: '#1db954', cursor: 'pointer' }}
              />
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b3b3b3', minWidth: '120px' }}>
            {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              style={{ width: '80px', accentColor: '#1db954', cursor: 'pointer' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
