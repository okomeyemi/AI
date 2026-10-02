# AI Control Center

1. `npm install && cp .env.example .env.local` and fill in the values.
2. `npm run dev` to test, then deploy to Vercel (HTTPS is required for PWA install).
3. Run `runner/runner.js` where `adb` can reach your device (Termux or a PC), and expose it via Tailscale Funnel or Cloudflare Tunnel. Put that URL in `RUNNER_URL`.
4. Paste your deployed URL into PWABuilder (pwabuilder.com) and download the Android package.
