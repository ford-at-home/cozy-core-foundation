#!/usr/bin/env bash
# Secret-leakage scan. Fails if secret-shaped values appear in the source tree
# or if server-only material leaks into client build output.
#
# What it looks for:
#   1. Secret-shaped literals anywhere in tracked source:
#      - Cursor API keys        crsr_<16+ chars>
#      - OpenAI-style keys      sk-<20+ chars>
#      - Supabase secret keys   sb_secret_<chars>
#      - Webhook signing keys   whsec_<16+ chars>
#      - JWTs whose payload contains "service_role"
#   2. Client build output (.output/public or dist) containing any of the
#      above or the string SUPABASE_SERVICE_ROLE_KEY.
#
# The Supabase anon/publishable key (role "anon") is expected in .env and
# client code; it is NOT a secret and is not flagged.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

# Files worth scanning: tracked text sources, excluding lockfiles and vendored deps.
scan_files() {
  git ls-files \
    | grep -vE '^(bun\.lock|package-lock\.json|deno\.lock)$' \
    | grep -vE '\.(png|jpg|jpeg|gif|webp|ico|svg|pdf|woff2?)$'
}

# sk- requires a long unbroken alphanumeric run (optionally after a known
# OpenAI prefix) so CSS custom properties like --sk-image-linear-from-pos
# don't false-positive.
patterns=(
  'crsr_[A-Za-z0-9]{16,}'
  'sk-(proj-|svcacct-|admin-)?[A-Za-z0-9]{20,}'
  'sb_secret_[A-Za-z0-9_-]+'
  'whsec_[A-Za-z0-9]{16,}'
)

echo "== scanning source tree for secret-shaped literals =="
for p in "${patterns[@]}"; do
  if hits=$(scan_files | xargs grep -nE "$p" -- 2>/dev/null); then
    echo "FAIL: pattern '$p' matched:"
    echo "$hits"
    fail=1
  fi
done

# JWT check: decode payloads of anything that looks like a JWT and reject
# service_role tokens. (Anon-role tokens are publishable and fine.)
echo "== checking embedded JWTs are not service_role =="
jwt_hits=$(scan_files | xargs grep -hoE 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' -- 2>/dev/null | sort -u || true)
if [ -n "$jwt_hits" ]; then
  while IFS= read -r jwt; do
    payload=$(printf '%s' "$jwt" | cut -d. -f2 | tr '_-' '/+')
    case $(( ${#payload} % 4 )) in
      2) payload="${payload}==" ;;
      3) payload="${payload}=" ;;
    esac
    decoded=$(printf '%s' "$payload" | base64 -d 2>/dev/null || true)
    if printf '%s' "$decoded" | grep -q 'service_role'; then
      echo "FAIL: a service_role JWT is present in the source tree."
      fail=1
    fi
  done <<< "$jwt_hits"
fi

# Client bundle check (only when a build exists).
client_out=""
if [ -d ".output/public" ]; then client_out=".output/public"; elif [ -d "dist" ]; then client_out="dist"; fi
if [ -n "$client_out" ]; then
  echo "== scanning client build output ($client_out) =="
  for p in "${patterns[@]}" 'SUPABASE_SERVICE_ROLE_KEY'; do
    if hits=$(grep -rlE "$p" "$client_out" 2>/dev/null); then
      echo "FAIL: '$p' found in client build output:"
      echo "$hits"
      fail=1
    fi
  done
else
  echo "== no client build output present; skipped bundle scan (run 'npm run build' first for full coverage) =="
fi

if [ "$fail" -ne 0 ]; then
  echo "check-secrets: FAILED"
  exit 1
fi
echo "check-secrets: OK"
