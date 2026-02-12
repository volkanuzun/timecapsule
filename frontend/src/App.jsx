import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import logo from './assets/logo.svg';

const initialForm = {
  title: '',
  type: 'text',
  textContent: '',
  publishAt: '',
  email: '',
  file: null
};

const typeCopy = {
  text: {
    title: 'Write it in words',
    description: 'A note, poem, or confession. Keep it timeless.'
  },
  image: {
    title: 'Seal a photo',
    description: 'A snapshot that only opens in the future.'
  },
  audio: {
    title: 'Capture your voice',
    description: 'A whispered promise, a song, or a story.'
  }
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const buildApiUrl = (path) => {
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
};

const normalizeType = (value) => {
  if (typeof value === 'string') return value.toLowerCase();
  if (typeof value === 'number') {
    return ['text', 'image', 'audio'][value] ?? 'text';
  }
  return 'text';
};

const formatTypeLabel = (value) => {
  const normalized = normalizeType(value);
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value < 10 && index > 0 ? 1 : 0)} ${units[index]}`;
};

const formatDuration = (seconds) => {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
};

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_MB = 50;
const MAX_RECORD_SECONDS = 30;

const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

const getOutputType = (file) => {
  if (!file) return 'image/jpeg';
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return file.type;
  }
  return 'image/jpeg';
};

const getCroppedBlob = async (imageSrc, pixelCrop, outputType) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), outputType, 0.92);
  });
};

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [preview, setPreview] = useState({ url: '', type: '' });
  const [rawFile, setRawFile] = useState(null);
  const [croppedFile, setCroppedFile] = useState(null);
  const [imageSrc, setImageSrc] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const waveformRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordSupported, setRecordSupported] = useState(true);
  const [audioDuration, setAudioDuration] = useState(null);
  const recorderRef = useRef(null);
  const recordTimerRef = useRef(null);
  const recordTimeoutRef = useRef(null);
  const recordStreamRef = useRef(null);
  const recordAbortRef = useRef(false);

  const activeType = useMemo(() => typeCopy[form.type], [form.type]);

  useEffect(() => {
    const supported =
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia;
    setRecordSupported(supported);
  }, []);

  useEffect(() => {
    void loadMessages();
  }, []);

  useEffect(() => {
    if (!form.file || form.type === 'text') {
      setPreview({ url: '', type: '' });
      return;
    }

    const url = URL.createObjectURL(form.file);
    setPreview({ url, type: form.type });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [form.file, form.type]);

  useEffect(() => {
    if (!rawFile || form.type !== 'image') {
      setImageSrc('');
      return;
    }

    const url = URL.createObjectURL(rawFile);
    setImageSrc(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [rawFile, form.type]);

  useEffect(() => {
    if (form.type !== 'audio' || !form.file) {
      clearWaveform();
      setAudioDuration(null);
      return;
    }

    void drawWaveform(form.file);
  }, [form.type, form.file]);

  const loadMessages = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch(buildApiUrl('/api/messages/public'));
      if (!response.ok) {
        throw new Error('Failed to load messages.');
      }
      const data = await response.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch (error) {
      setLoadError(error?.message ?? 'Unable to load messages.');
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const stopRecording = useCallback((discard = false) => {
    if (discard) {
      recordAbortRef.current = true;
    }

    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    if (recordTimeoutRef.current) {
      clearTimeout(recordTimeoutRef.current);
      recordTimeoutRef.current = null;
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else if (recordStreamRef.current) {
      recordStreamRef.current.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;
    }

    if (discard) {
      setRecordSeconds(0);
    }

    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      stopRecording(true);
    };
  }, [stopRecording]);

  const startRecording = async () => {
    if (!recordSupported) {
      setStatus({ type: 'error', message: 'Recording is not supported in this browser.' });
      return;
    }

    if (isRecording) return;

    try {
      recordAbortRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks = [];

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((track) => track.stop());
        recordStreamRef.current = null;
        recorderRef.current = null;

        if (recordAbortRef.current) {
          recordAbortRef.current = false;
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > MAX_AUDIO_BYTES) {
          setStatus({ type: 'error', message: `Audio must be ${MAX_AUDIO_MB}MB or less.` });
          return;
        }

        const extension = (blob.type.split('/')[1] || 'webm').replace('x-', '');
        const fileName = `voice-${Date.now()}.${extension}`;
        const file = new File([blob], fileName, { type: blob.type || 'audio/webm' });
        handleFileSelected(file);
      });

      setStatus({ type: 'idle', message: '' });
      setIsRecording(true);
      setRecordSeconds(0);
      recorder.start();

      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((seconds) => {
          const next = seconds + 1;
          if (next >= MAX_RECORD_SECONDS) {
            stopRecording();
            return MAX_RECORD_SECONDS;
          }
          return next;
        });
      }, 1000);

      recordTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, MAX_RECORD_SECONDS * 1000);
    } catch (error) {
      setStatus({ type: 'error', message: 'Unable to access the microphone.' });
      stopRecording(true);
    }
  };

  const resetFileState = () => {
    stopRecording(true);
    setRawFile(null);
    setCroppedFile(null);
    setPreview({ url: '', type: '' });
    setImageSrc('');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setRecordSeconds(0);
    setAudioDuration(null);
  };

  const handleFileSelected = (file) => {
    if (!file) return;

    if (recorderRef.current && recorderRef.current.state === 'recording') {
      stopRecording(true);
    }

    if (form.type === 'image' && !file.type.startsWith('image/')) {
      setStatus({ type: 'error', message: 'Please upload an image file.' });
      return;
    }

    if (form.type === 'audio' && !file.type.startsWith('audio/')) {
      setStatus({ type: 'error', message: 'Please upload an audio file.' });
      return;
    }

    if (form.type === 'audio' && file.size > MAX_AUDIO_BYTES) {
      setStatus({ type: 'error', message: `Audio must be ${MAX_AUDIO_MB}MB or less.` });
      return;
    }

    setStatus({ type: 'idle', message: '' });
    setRawFile(form.type === 'image' ? file : null);
    setCroppedFile(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    updateForm({ file });
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    handleFileSelected(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragActive(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    handleFileSelected(file);
  };

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const applyCrop = async () => {
    if (!imageSrc || !croppedAreaPixels || !rawFile) return;

    try {
      const outputType = getOutputType(rawFile);
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, outputType);
      if (!blob) {
        throw new Error('Unable to crop image.');
      }

      const extension = outputType.split('/')[1] ?? 'jpg';
      const baseName = rawFile.name.replace(/\.[^/.]+$/, '');
      const fileName = `${baseName}-cropped.${extension}`;
      const nextFile = new File([blob], fileName, { type: outputType });

      setCroppedFile(nextFile);
      updateForm({ file: nextFile });
    } catch (error) {
      setStatus({ type: 'error', message: 'Unable to crop the image.' });
    }
  };

  const resetCrop = () => {
    if (!rawFile) return;
    setCroppedFile(null);
    updateForm({ file: rawFile });
  };

  const drawWaveform = async (file) => {
    const canvas = waveformRef.current;
    if (!canvas) return;

    const width = canvas.clientWidth || 360;
    const height = 120;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f9f4ee';
    ctx.fillRect(0, 0, width, height);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      setAudioDuration(audioBuffer.duration);
      const rawData = audioBuffer.getChannelData(0);
      const samples = Math.min(width, 600);
      const blockSize = Math.max(1, Math.floor(rawData.length / samples));
      const filteredData = new Float32Array(samples);

      for (let i = 0; i < samples; i += 1) {
        let sum = 0;
        const start = i * blockSize;
        for (let j = 0; j < blockSize; j += 1) {
          sum += Math.abs(rawData[start + j] || 0);
        }
        filteredData[i] = sum / blockSize;
      }

      const max = Math.max(...filteredData);
      const multiplier = max > 0 ? 1 / max : 1;
      const mid = height / 2;
      const step = width / samples;

      ctx.strokeStyle = '#f25c54';
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let i = 0; i < samples; i += 1) {
        const x = i * step;
        const amplitude = filteredData[i] * multiplier * (height * 0.4);
        ctx.moveTo(x, mid - amplitude);
        ctx.lineTo(x, mid + amplitude);
      }

      ctx.stroke();
      await audioContext.close();
    } catch (error) {
      setAudioDuration(null);
      ctx.fillStyle = '#f25c54';
      ctx.font = '14px Space Grotesk, sans-serif';
      ctx.fillText('Waveform unavailable', 12, 24);
    }
  };

  const clearWaveform = () => {
    const canvas = waveformRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ type: 'idle', message: '' });

    if (!form.title.trim() || !form.publishAt) {
      setStatus({ type: 'error', message: 'Please add a title and a future release date.' });
      return;
    }

    if (form.type === 'text' && !form.textContent.trim()) {
      setStatus({ type: 'error', message: 'Add a text message for your capsule.' });
      return;
    }

    if (form.type !== 'text' && !form.file) {
      setStatus({ type: 'error', message: 'Add a file to seal inside the capsule.' });
      return;
    }

    const payload = new FormData();
    payload.append('title', form.title.trim());
    payload.append('type', form.type);
    payload.append('publishAt', new Date(form.publishAt).toISOString());

    if (form.email.trim()) {
      payload.append('email', form.email.trim());
    }

    if (form.type === 'text') {
      payload.append('textContent', form.textContent.trim());
    } else if (form.file) {
      payload.append('file', form.file);
    }

    try {
      setStatus({ type: 'loading', message: 'Sealing your capsule...' });
      const response = await fetch(buildApiUrl('/api/messages'), {
        method: 'POST',
        body: payload
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? 'Unable to create your capsule.');
      }

      setStatus({ type: 'success', message: 'Your capsule is sealed. We will open it on schedule.' });
      setForm(initialForm);
      resetFileState();
      await loadMessages();
    } catch (error) {
      setStatus({ type: 'error', message: error?.message ?? 'Something went wrong.' });
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <img src={logo} alt="TimeCapsule logo" className="logo" />
      </div>
      <header className="hero">
        <div className="hero-content">
          <p className="eyebrow">Time Capsule</p>
          <h1>Send a message to the future.</h1>
          <p className="lead">
            Seal a thought, a photo, or a voice memo. Pick the exact moment it should open, and we’ll reveal it
            publicly when the time comes.
          </p>
          <div className="hero-actions">
            <a className="primary" href="#create">
              Create a capsule
            </a>
            <a className="secondary" href="#public">
              View public releases
            </a>
          </div>
          <div className="stats">
            <div>
              <span>Open windows</span>
              <strong>24/7</strong>
            </div>
            <div>
              <span>Message types</span>
              <strong>Text · Image · Audio</strong>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="orb" />
          <div className="orb secondary" />
          <div className="glass-card">
            <p className="label">Next capsule opens</p>
            <p className="time">Tomorrow at 08:30</p>
            <p className="caption">A promise from the past, ready to be seen.</p>
          </div>
        </div>
      </header>

      <main>
        <section id="create" className="panel">
          <div className="panel-header">
            <h2>Seal a capsule</h2>
            <p>Every capsule needs a title, a release moment, and the memory inside.</p>
          </div>
          <div className="panel-grid">
            <form className="capsule-form" onSubmit={handleSubmit}>
              <label>
                Capsule title
                <input
                  type="text"
                  placeholder="The night we met"
                  value={form.title}
                  onChange={(event) => updateForm({ title: event.target.value })}
                />
              </label>

              <div className="type-switch">
                <span>Capsule type</span>
                <div className="type-options">
                  {['text', 'image', 'audio'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={form.type === type ? 'active' : ''}
                      onClick={() => {
                        updateForm({ type, file: null, textContent: '' });
                        resetFileState();
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="type-details">
                <h3>{activeType.title}</h3>
                <p>{activeType.description}</p>
              </div>

              {form.type === 'text' ? (
                <label>
                  Your message
                  <textarea
                    rows="5"
                    placeholder="Write your future self a note..."
                    value={form.textContent}
                    onChange={(event) => updateForm({ textContent: event.target.value })}
                  />
                </label>
              ) : (
                <label
                  className={`file-input dropzone ${isDragActive ? 'active' : ''}`}
                  onDragEnter={handleDragOver}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  Upload {form.type}
                  {form.type === 'audio' && ` (max ${MAX_AUDIO_MB}MB)`}
                  <input
                    type="file"
                    accept={form.type === 'image' ? 'image/*' : 'audio/*'}
                    onChange={handleFileChange}
                  />
                  <span>
                    {form.file
                      ? form.file.name
                      : 'Drop your file here or click to choose one.'}
                  </span>
                </label>
              )}

              {form.type === 'audio' && (
                <div className={`record-panel ${isRecording ? 'active' : ''}`}>
                  <div>
                    <p>Record up to {MAX_RECORD_SECONDS} seconds</p>
                    <span className="hint">We will stop the recording automatically.</span>
                  </div>
                  <div className="record-actions">
                    <button
                      type="button"
                      onClick={isRecording ? () => stopRecording() : startRecording}
                      disabled={!recordSupported}
                    >
                      {isRecording ? 'Stop recording' : 'Record audio'}
                    </button>
                    <span className="timer">
                      {recordSeconds}s / {MAX_RECORD_SECONDS}s
                    </span>
                  </div>
                  {!isRecording && audioDuration != null && (
                    <span className="record-duration">
                      Recorded duration: {formatDuration(audioDuration)}
                    </span>
                  )}
                  {!recordSupported && (
                    <p className="status error">Recording is not supported in this browser.</p>
                  )}
                </div>
              )}

              {form.type === 'image' && rawFile && imageSrc && (
                <div className="cropper">
                  <p>Crop your image</p>
                  <div className="cropper-frame">
                    <Cropper
                      image={imageSrc}
                      crop={crop}
                      zoom={zoom}
                      aspect={1}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                    />
                  </div>
                  <div className="cropper-controls">
                    <label>
                      Zoom
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.1"
                        value={zoom}
                        onChange={(event) => setZoom(Number(event.target.value))}
                      />
                    </label>
                    <div className="cropper-actions">
                      <button type="button" onClick={applyCrop} disabled={!croppedAreaPixels}>
                        Apply crop
                      </button>
                      {croppedFile && (
                        <button type="button" className="ghost" onClick={resetCrop}>
                          Use original
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {form.type !== 'text' && form.file && preview.url && (
                <div className="preview">
                  <p>Upload preview</p>
                  {form.type === 'image' ? (
                    <img src={preview.url} alt="Preview" />
                  ) : (
                    <>
                      <canvas ref={waveformRef} className="waveform" height="120" />
                      <audio controls src={preview.url} />
                    </>
                  )}
                  <span className="meta">
                    {form.file.name} · {formatBytes(form.file.size)}
                    {form.type === 'audio' && ` · ${formatDuration(audioDuration)}`}
                  </span>
                </div>
              )}

              <div className="inline-fields">
                <label>
                  Release date &amp; time
                  <input
                    type="datetime-local"
                    value={form.publishAt}
                    onChange={(event) => updateForm({ publishAt: event.target.value })}
                  />
                </label>
                <label>
                  Email (optional)
                  <input
                    type="email"
                    placeholder="you@email.com"
                    value={form.email}
                    onChange={(event) => updateForm({ email: event.target.value })}
                  />
                </label>
              </div>

              <button className="submit" type="submit" disabled={status.type === 'loading'}>
                {status.type === 'loading' ? 'Sealing...' : 'Seal this capsule'}
              </button>
              {status.message && (
                <p className={`status ${status.type}`}>{status.message}</p>
              )}
            </form>

            <div className="panel-aside">
              <div className="aside-card">
                <h3>How it works</h3>
                <ul>
                  <li>We store your capsule encrypted.</li>
                  <li>When the time arrives, it appears below for everyone.</li>
                </ul>
              </div>
              <div className="aside-card highlight">
                <h3>Get notified</h3>
                <p>Leave an email and we’ll send a message the moment your capsule becomes public.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="public" className="panel public">
          <div className="panel-header">
            <h2>Public releases</h2>
            <p>Capsules that have reached their moment are revealed here.</p>
          </div>
          <div className="public-grid">
            {loading && <p className="status loading">Loading capsules...</p>}
            {loadError && <p className="status error">{loadError}</p>}
            {!loading && !loadError && messages.length === 0 && (
              <p className="status idle">No capsules have opened yet. Be the first.</p>
            )}
            {messages.map((message) => {
              const type = normalizeType(message.type);
              return (
                <article key={message.id} className="capsule-card">
                  <div className="card-header">
                    <span className="badge">{formatTypeLabel(message.type)}</span>
                    <span className="date">Opened {formatDateTime(message.publishAt)}</span>
                  </div>
                  <h3>{message.title}</h3>
                  {type === 'text' && <p>{message.textContent}</p>}
                  {type === 'image' && message.mediaUrl && (
                    <img src={message.mediaUrl} alt={message.title} />
                  )}
                  {type === 'audio' && message.mediaUrl && (
                    <audio controls src={message.mediaUrl} />
                  )}
                  <div className="card-footer">
                    <span>Sealed {formatDateTime(message.createdAt)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>Built for the future.</p>
      </footer>
    </div>
  );
}
