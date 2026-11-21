#!/bin/sh
# One-command local setup for macOS/Linux. Requires only Docker with Compose.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

case "${1:-}" in
    '') mobile=true ;;
    --web-only) mobile=false ;;
    *) echo 'Usage: ./start.sh [--web-only]' >&2; exit 1 ;;
esac
command -v docker >/dev/null 2>&1 || { echo 'Install and start Docker Desktop first.' >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null 2>&1 || { echo 'Start Docker Desktop, then run this command again.' >&2; exit 1; }

if [ "$mobile" = true ]; then
    # Compose parses optional .env overrides; do not execute the .env as shell code.
    LAN_IP=$(docker compose config --environment | sed -n 's/^LAN_IP=//p')
    if [ -z "$LAN_IP" ]; then
        case "$(uname -s)" in
            Darwin)
                interface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')
                LAN_IP=$(ipconfig getifaddr "${interface:-en0}" 2>/dev/null || true)
                ;;
            Linux)
                LAN_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}' || true)
                ;;
        esac
    fi
    if [ -z "$LAN_IP" ]; then
        echo 'Could not detect a network address. Connect to Wi-Fi and retry.' >&2
        echo 'Alternatively: LAN_IP=your-laptop-ip ./start.sh, or ./start.sh --web-only.' >&2
        exit 1
    fi
    export LAN_IP
    echo "Using laptop address: $LAN_IP (phone and laptop must share a network)."
    docker compose --profile mobile up --build -d --wait --wait-timeout 180
else
    docker compose up --build -d --wait --wait-timeout 180
fi

app_port=$(docker compose port app 8000 | head -n 1 | awk -F: '{print $NF}')
echo "Dashboard: http://localhost:$app_port/dashboard/"
echo "API docs:  http://localhost:$app_port/docs"
if [ "$mobile" = true ]; then
    metro_port=$(docker compose exec -T mobile printenv METRO_PORT | tr -d '\r')
    echo "Open in Expo Go: exp://$LAN_IP:$metro_port"
    echo 'Then tap Show dashboard code in the phone app and enter it in the dashboard.'
fi
echo 'Stop: docker compose --profile mobile down'
