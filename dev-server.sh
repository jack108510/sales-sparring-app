#!/bin/bash
# Sales Sparring Dev Server
# Usage: ./dev-server.sh [build|serve|both]

cd "$(dirname "$0")"

ACTION="${1:-both}"

build() {
  echo "🔨 Building web bundle..."
  npx expo export -p web
}

serve() {
  echo "🚀 Serving on http://localhost:3000"
  echo "📱 Network: http://192.168.1.101:3000"
  serve -l 3000 -s dist
}

case "$ACTION" in
  build) build ;;
  serve) serve ;;
  both)  build && serve ;;
  *) echo "Usage: $0 [build|serve|both]" ;;
esac
