#!/bin/bash
# FilmBooth Launcher — Mac / Linux

set -e

echo ""
echo "  ========================================="
echo "    FILMBOOTH - Starting up..."
echo "  ========================================="
echo ""

# Cek Node.js
if ! command -v node &> /dev/null; then
    echo "  [ERROR] Node.js tidak ditemukan!"
    echo "  Download di: https://nodejs.org"
    exit 1
fi

# Install dependencies kalau belum ada
if [ ! -d "node_modules" ]; then
    echo "  [1/3] Installing dependencies..."
    npm install
    echo ""
fi

# Start node server di background
echo "  [1/3] Starting Node.js server..."
node server.js &
NODE_PID=$!
sleep 2

# Cek ngrok
if ! command -v ngrok &> /dev/null; then
    echo "  [!] ngrok tidak ditemukan. Mode lokal (LAN) saja."
    echo "      Install ngrok di: https://ngrok.com/download"
    echo ""
    echo "  [2/3] Skipping ngrok..."
    echo "  [3/3] Opening browser..."
    # Buka browser
    if command -v open &> /dev/null; then
        open http://localhost:3000       # macOS
    elif command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:3000   # Linux
    fi
    echo ""
    echo "  Server jalan di http://localhost:3000"
    echo "  (Tekan Ctrl+C untuk matiin)"
    wait $NODE_PID
    exit 0
fi

echo "  [2/3] Starting ngrok tunnel..."
ngrok http 3000 &
NGROK_PID=$!
sleep 3

echo "  [3/3] Opening browser..."
if command -v open &> /dev/null; then
    open http://localhost:3000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
fi

echo ""
echo "  ========================================="
echo "    FilmBooth sudah jalan!"
echo "  ========================================="
echo ""
echo "  Browser sudah terbuka otomatis."
echo "  Klik 'Remote Cam' lalu scan QR dari HP."
echo ""
echo "  (Tekan Ctrl+C untuk matiin semua)"
echo ""

# Cleanup waktu Ctrl+C
cleanup() {
    echo ""
    echo "  Mematikan server..."
    kill $NODE_PID 2>/dev/null
    kill $NGROK_PID 2>/dev/null
    echo "  Done."
    exit 0
}
trap cleanup INT TERM

wait
