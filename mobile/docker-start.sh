#!/bin/sh
set -eu

if [ -z "${LAN_IP:-}" ] || [ "$LAN_IP" = localhost ] || [ "$LAN_IP" = 127.0.0.1 ]; then
    echo "Set LAN_IP in the root .env to your laptop's Wi-Fi/LAN IPv4 address."
    echo "Example: LAN_IP=192.168.1.42. The phone must be on the same network."
    exit 1
fi

echo "Open in Expo Go: exp://${LAN_IP}:${METRO_PORT:-8081}"
echo "Phone API: ${EXPO_PUBLIC_API_URL}"
echo "Dashboard: ${EXPO_PUBLIC_API_URL}/dashboard/"
# Expo Go checks the CLI account; LAN mode allows resolving that identity.
exec npx expo start --lan --go --port "${METRO_PORT:-8081}"
