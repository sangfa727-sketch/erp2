#!/bin/bash
# ============================================================================
# deploy_vad.sh v2 — Stillastock ERP Production Rebuild
# ============================================================================
# Date: 2026-06-22 (session-rescue rewrite)
#
# CRITICAL DESIGN NOTE:
#   v1 of this script (rev. ~Apr 2026) embedded ChatBubble.tsx and
#   /api/stt/route.ts source code via heredoc and overwrote them on every
#   run. This caused MULTIPLE production regressions across sessions:
#     - Sprint B (Gemini Native Audio) v3 ChatBubble silently reverted to
#       browser Web Speech v1 ChatBubble whenever script was run.
#     - Sprint B's /api/voice/gemini-transcribe endpoint was bypassed in
#       favor of stale Whisper-based /api/stt/route.ts.
#     - Symptom: Burmese voice degraded to nonsense hallucinations because
#       old Whisper STT prompt had number-word priming.
#
#   v2 (this file) is REBUILD-ONLY — it edits NOTHING in /opt/erp1/src/.
#   Source code is the source of truth. Edits go in /opt/erp1/src/ directly
#   (via SCP, sed, or manual editor), THEN this script rebuilds and restarts.
#
#   DO NOT restore the heredoc embedding pattern. Future Claude sessions:
#   if you need to "deploy a code change," edit the source file first,
#   then run this script. Never bake source into the deploy script.
# ============================================================================

set -e
cd /opt/erp1

TS=$(date +%Y%m%d-%H%M)
echo "==============================================================="
echo " Stillastock ERP rebuild - $TS"
echo "==============================================================="

# Step 1: sanity check ChatBubble version
echo "[1/5] Verifying ChatBubble.tsx version..."
if ! head -3 src/components/ai/ChatBubble.tsx | grep -q "ChatBubble v3"; then
  echo "  WARNING: ChatBubble.tsx is NOT the v3 (Gemini Native Audio) version!"
  echo "  Expected header to contain 'ChatBubble v3 (2026-06-21)'."
  echo "  Current header:"
  head -3 src/components/ai/ChatBubble.tsx | sed 's/^/    /'
  echo ""
  echo "  Continue anyway? [y/N]"
  read -r CONFIRM
  if [ "$CONFIRM" != "y" ]; then
    echo "  Aborted. Restore v3 from:"
    echo "    src/components/ai/ChatBubble.tsx.bak.20260621-1030"
    exit 1
  fi
else
  echo "  OK - ChatBubble v3 detected"
fi

# Step 2: Next.js bundle build
echo "[2/5] Building Next.js production bundle..."
npm run build
echo "  OK - Next.js build complete"

# Step 3: Docker image build
echo "[3/5] Building Docker image (erp1-pos:latest)..."
docker build -t erp1-pos .
echo "  OK - Docker image built"

# Step 4: Stop and remove old container
echo "[4/5] Replacing running container..."
docker stop erp1-pos 2>/dev/null || true
docker rm erp1-pos 2>/dev/null || true
echo "  OK - Old container removed (if present)"

# Step 5: Start new container
echo "[5/5] Starting new erp1-pos container..."
docker run -d \
  --name erp1-pos \
  --env-file .env \
  -p 3000:3000 \
  -v /opt/erp1/google-stt-key.json:/app/google-stt-key.json:ro \
  --restart unless-stopped \
  erp1-pos

sleep 3
echo ""
echo "=== Container status ==="
docker logs erp1-pos --tail 10
echo ""
echo "==============================================================="
echo " Done - $(date)"
echo "==============================================================="
