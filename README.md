# MetaVidSave — Meta AI Video Downloader

Full-stack Node.js app to download Meta AI generated videos by share link.

## Tech Stack
- **Backend:** Node.js + Express + Puppeteer (headless Chrome)
- **Frontend:** Vanilla HTML/CSS/JS (served as static files)
- **Rate limiting:** express-rate-limit (20 req / 10 min per IP)

## Local Development

```bash
npm install
npm run dev   # uses nodemon
# open http://localhost:3000
```

## Production Deploy

### Option A — Render.com (Recommended, Free tier)
1. Push this repo to GitHub
2. Go to https://render.com → New Web Service
3. Connect your GitHub repo
4. Set:
   - **Runtime:** Docker
   - **Build Command:** *(auto from Dockerfile)*
   - **Start Command:** *(auto)*
5. Deploy → copy your `.onrender.com` URL

### Option B — Railway.app
1. Push to GitHub
2. railway.app → New Project → Deploy from GitHub
3. Set PORT=3000 in environment variables
4. Deploy

### Option C — VPS (Ubuntu)
```bash
# Install Node 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Chrome for Puppeteer
sudo apt install -y chromium-browser

# Clone & run
git clone <your-repo>
cd metavidsave
npm install --production
PORT=3000 node src/server.js

# Use PM2 to keep it alive
npm install -g pm2
pm2 start src/server.js --name metavidsave
pm2 save
```

### Option D — Fly.io
```bash
fly launch
fly deploy
```

## How It Works
1. User pastes a `meta.ai/share/m/...` link
2. Frontend POSTs to `/api/extract`
3. Backend launches headless Chrome via Puppeteer
4. Puppeteer opens the Meta AI share page
5. Intercepts network requests to find the real `.mp4` CDN URL
6. Returns the video URL to the frontend
7. Frontend shows preview + download via `/api/download` proxy

## Notes
- Puppeteer requires ~300MB RAM minimum. Use at least Render's Starter plan or a 512MB VPS.
- Meta AI share links expire — users should download promptly after generating.
- This tool is for downloading videos you generated yourself.
