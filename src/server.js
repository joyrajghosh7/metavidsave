const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { extractMetaVideo } = require('./extractor');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting: 20 requests per 10 minutes per IP
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Please wait a few minutes and try again.' }
});
app.use('/api/', limiter);

// ── API: Extract video ──
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid URL.' });
  }

  // Validate it's a Meta AI share link
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format.' });
  }

  const hostname = parsed.hostname.replace(/^www\./, '');
  if (hostname !== 'meta.ai' && !hostname.endsWith('.meta.ai')) {
    return res.status(400).json({ error: 'Only Meta AI share links are supported (meta.ai/share/...).' });
  }

  try {
    console.log(`[extract] ${url}`);
    const result = await extractMetaVideo(url);
    console.log(`[extract] success → ${result.videoUrl}`);
    return res.json(result);
  } catch (err) {
    console.error(`[extract] error:`, err.message);
    return res.status(500).json({
      error: err.message || 'Failed to extract video. The link may be expired or private.'
    });
  }
});

// ── API: Proxy download (avoids CORS issues on client) ──
app.get('/api/download', async (req, res) => {
  const { url, filename } = req.query;

  if (!url) return res.status(400).send('Missing url');

  // Only allow proxying meta.ai CDN URLs
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).send('Invalid url'); }

  const allowed = ['scontent.cdninstagram.com', 'video.xx.fbcdn.net', 'video.facebookusercontent.com',
    'z-m-scontent.xx.fbcdn.net', 'scontent.fbcdn.net'];
  const isAllowed = allowed.some(d => parsed.hostname.endsWith(d)) ||
    parsed.hostname.includes('fbcdn') || parsed.hostname.includes('cdninstagram');

  if (!isAllowed) {
    return res.status(403).send('Proxy not allowed for this domain.');
  }

  try {
    const axios = require('axios');
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.meta.ai/'
      },
      timeout: 30000
    });

    const fname = filename || 'meta-ai-video.mp4';
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    response.data.pipe(res);
  } catch (err) {
    console.error('[download proxy] error:', err.message);
    res.status(500).send('Failed to proxy video download.');
  }
});

// ── Serve frontend for all other routes ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ MetaVidSave running on http://localhost:${PORT}`);
});
