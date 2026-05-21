# FlashBooth v8 — Deploy ke Railway

## Deploy (5 menit)

### Cara 1 — via GitHub (direkomendasikan)
1. Push folder ini ke GitHub (repo baru)
2. Buka [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Pilih repo → Railway auto-detect Node.js dan deploy
4. Dapat URL: `https://flashbooth-xxx.up.railway.app`

### Cara 2 — via Railway CLI
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

## Cara Pakai Setelah Deploy
1. Buka URL Railway di **PC/laptop** (browser apa saja)
2. Klik **Mulai** → QR code muncul
3. Scan QR dengan **HP** (tidak perlu WiFi sama!)
4. Tap **Aktifkan Kamera** di HP
5. Kamera HP streaming ke PC ✓

## Catatan
- Railway free tier: 500 jam/bulan (cukup untuk pemakaian normal)
- WebSocket didukung penuh di Railway
- HP & PC bisa beda jaringan karena pakai HTTPS + TURN
