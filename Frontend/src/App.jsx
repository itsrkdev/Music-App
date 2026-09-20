import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Play, Pause, Search, Music, SkipBack, SkipForward, Volume2, VolumeX, Loader2 } from 'lucide-react';
import './App.css';

const API = import.meta.env.VITE_API_URL;

function App() {
  const [query, setQuery] = useState('Bollywood Hits');
  const [songs, setSongs] = useState([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [loading, setLoading] = useState(false);
  const [songLoading, setSongLoading] = useState(false);
  const [error, setError] = useState('');

  const audioRef = useRef(null);
  const songsRef = useRef([]);
  const indexRef = useRef(null);

  useEffect(() => { songsRef.current = songs; }, [songs]);
  useEffect(() => { indexRef.current = currentSongIndex; }, [currentSongIndex]);

  // ---------- Search Songs ----------
  const fetchSongs = async (searchQuery) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get(`${API}/api/search`, { params: { q: searchQuery } });
      if (Array.isArray(data)) {
        setSongs(data);
        if (data.length === 0) setError('Koi song nahi mila.');
      } else {
        setError(data?.error || 'Kuch galat hua.');
      }
    } catch (err) {
      setError('Server se connect nahi ho paya. Backend chal raha hai?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSongs(query);
  }, []);

  // ---------- Play/Pause Song ----------
  const playSong = async (index) => {
    const song = songsRef.current[index];
    if (!song) return;

    if (indexRef.current === index && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
      return;
    }

    setCurrentSongIndex(index);
    indexRef.current = index;
    setSongLoading(true);
    setIsPlaying(false);
    setError('');

    try {
      let streamUrl = song.streamUrl;

      // Agar streamUrl direct nahi mila toh /api/stream se laayein
      if (!streamUrl) {
        const { data } = await axios.get(`${API}/api/stream`, { params: { id: song.id } });
        streamUrl = data?.url;
      }

      if (streamUrl && audioRef.current) {
        audioRef.current.src = streamUrl;
        audioRef.current.volume = volume;
        await audioRef.current.play();
        setIsPlaying(true);
      } else {
        setError('Song stream load nahi ho saka.');
      }
    } catch (err) {
      console.error("Play Error:", err);
      setError('Song play karne me dikkat hui.');
    } finally {
      setSongLoading(false);
    }
  };

  const handleNext = () => {
    const i = indexRef.current;
    if (i !== null && i < songsRef.current.length - 1) playSong(i + 1);
  };

  const handlePrev = () => {
    const i = indexRef.current;
    if (i !== null && i > 0) playSong(i - 1);
  };

  // ---------- Audio Controls ----------
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime || 0);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = t;
      setCurrentTime(t);
    }
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  };

  const formatTime = (time) => {
    if (!time || isNaN(time)) return '0:00';
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
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleNext}
        onError={() => setError('Audio playback interrupted.')}
      />

      <header className="app-header">
        <Music size={28} />
        <span>VibeMusic App</span>
      </header>

      {/* Category Filters */}
      <div className="filter-container">
        {['Bollywood Hits', 'Hindi Songs', 'Bhojpuri Hits', 'English Songs', 'Pawan Singh', 'Arijit Singh'].map((category) => (
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

      {loading && <p style={{ textAlign: 'center', color: '#b3b3b3' }}>Loading...</p>}
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
              src={song.image || 'https://via.placeholder.com/300x300?text=Music'}
              alt=""
              className="song-img"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = 'https://via.placeholder.com/300x300?text=Music';
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
            <img
              src={currentSong.image || 'https://via.placeholder.com/300x300?text=Music'}
              alt=""
              className="player-img"
            />
            <div>
              <h4 className="song-title">{currentSong.name}</h4>
              <p className="song-artist">{currentSong.artist}</p>
            </div>
          </div>

          <div style={{ flex: 1, maxWidth: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <SkipBack size={20} onClick={handlePrev} style={{ cursor: 'pointer', opacity: currentSongIndex === 0 ? 0.4 : 1 }} />
              
              <button className="player-play-btn" onClick={() => playSong(currentSongIndex)} disabled={songLoading}>
                {songLoading ? (
                  <Loader2 size={20} className="animate-spin" />
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