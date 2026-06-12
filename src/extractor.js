const puppeteer = require('puppeteer');

/**
 * Launches a headless browser, opens the Meta AI share page,
 * intercepts network requests to find the real video URL,
 * and returns it along with metadata.
 */
async function extractMetaVideo(shareUrl) {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--memory-pressure-off',
        '--js-flags=--max-old-space-size=128'
      ]
    });

    const page = await browser.newPage();

    // Spoof a real browser user-agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    });

    // Collect intercepted video URLs
    const videoUrls = [];
    const videoPatterns = [
      /\.mp4(\?|$)/i,
      /video\/mp4/i,
      /fbcdn\.net.*\.mp4/i,
      /cdninstagram\.com.*\.mp4/i,
      /video\.xx\.fbcdn/i,
      /scontent.*fbcdn/i
    ];

    // Method 1: Intercept network requests for video files
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      const resourceType = req.resourceType();

      // Capture video/media requests
      if (resourceType === 'media' || videoPatterns.some(p => p.test(url))) {
        if (!videoUrls.includes(url)) {
          videoUrls.push(url);
        }
      }

      // Block unnecessary resources to speed up loading
      if (['font', 'image', 'stylesheet'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Method 2: Also catch responses with video content-type
    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('video/') && !videoUrls.includes(url)) {
        videoUrls.push(url);
      }
    });

    // Navigate to the share page
    await page.goto(shareUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait a bit for lazy-loaded video to kick in
    await new Promise(r => setTimeout(r, 3000));

    // Method 3: Scrape video src from DOM
    const domVideos = await page.evaluate(() => {
      const sources = [];
      document.querySelectorAll('video').forEach(v => {
        if (v.src) sources.push(v.src);
        v.querySelectorAll('source').forEach(s => { if (s.src) sources.push(s.src); });
      });
      // Also look in __DATA__ / JSON blobs in scripts
      document.querySelectorAll('script[type="application/json"], script').forEach(s => {
        const text = s.textContent || '';
        const matches = text.match(/https:\/\/[^"'\\]+\.mp4[^"'\\]*/g);
        if (matches) sources.push(...matches);
      });
      return [...new Set(sources)];
    });

    domVideos.forEach(u => { if (!videoUrls.includes(u)) videoUrls.push(u); });

    // Method 4: Scroll / trigger autoplay to force video load
    if (videoUrls.length === 0) {
      await page.evaluate(() => window.scrollTo(0, 300));
      await new Promise(r => setTimeout(r, 2000));

      const afterScrollVideos = await page.evaluate(() => {
        const sources = [];
        document.querySelectorAll('video').forEach(v => {
          if (v.src) sources.push(v.src);
          v.querySelectorAll('source').forEach(s => { if (s.src) sources.push(s.src); });
        });
        return [...new Set(sources)];
      });
      afterScrollVideos.forEach(u => { if (!videoUrls.includes(u)) videoUrls.push(u); });
    }

    // Method 5: Try clicking play button if exists
    if (videoUrls.length === 0) {
      try {
        await page.click('[aria-label="Play"], [data-testid="video-play-button"], .play-button');
        await new Promise(r => setTimeout(r, 2000));
      } catch {}
    }

    // Get page title for metadata
    const title = await page.title().catch(() => 'Meta AI Video');

    await browser.close();
    browser = null;

    // Filter: prefer actual CDN video URLs over blob: or data:
    // Exclude image/thumbnail URLs (jpg, png, webp) even if hosted on fbcdn/cdninstagram
    const imagePattern = /\.(jpe?g|png|webp|gif)(\?|$)/i;
    const realUrls = videoUrls.filter(u =>
      u.startsWith('http') &&
      !u.startsWith('blob:') &&
      !u.startsWith('data:') &&
      !imagePattern.test(u) &&
      (u.includes('.mp4') || /video\.[a-z0-9-]*\.fbcdn\.net/i.test(u) || /scontent[^/]*\.(?:fbcdn|cdninstagram)\.(?:com|net)/i.test(u))
    );

    if (realUrls.length === 0) {
      // If no video found, check if we found any media at all
      if (videoUrls.length > 0) {
        throw new Error('Video found but URL format not supported. The link may require login.');
      }
      throw new Error('No video found on this page. The link may be expired, private, or not a video share link.');
    }

    // Pick the best quality URL (usually the longest URL or highest resolution)
    // Prefer HD: look for urls with 'hd' or higher resolution indicators
    let bestUrl = realUrls[0];
    for (const u of realUrls) {
      if (u.includes('_hd') || u.includes('hd_src') || u.includes('1280') || u.includes('720')) {
        bestUrl = u;
        break;
      }
    }

    // Extract share ID for filename
    const shareId = shareUrl.match(/\/share\/m\/([^/?#]+)/)?.[1] || Date.now().toString();
    const filename = `meta-ai-${shareId}.mp4`;

    return {
      videoUrl: bestUrl,
      allUrls: realUrls,
      filename,
      title: title.replace(' - Meta AI', '').trim() || 'Meta AI Video',
      shareId
    };

  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    throw err;
  }
}

module.exports = { extractMetaVideo };