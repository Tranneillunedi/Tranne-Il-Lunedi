#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="ptsltidnlbnzlyvdtnbo"
APP_ID="6547826d-804c-4a15-aa8b-3b6627ec28c2"

command -v supabase >/dev/null 2>&1 || {
  echo "Errore: installa prima Supabase CLI." >&2
  exit 1
}

read -rsp "Incolla la OneSignal REST API Key: " ONESIGNAL_KEY
echo
read -rsp "Scegli un CRON_SECRET lungo e casuale: " CRON_SECRET
echo

supabase link --project-ref "$PROJECT_REF"
supabase secrets set \
  ONESIGNAL_APP_ID="$APP_ID" \
  ONESIGNAL_REST_API_KEY="$ONESIGNAL_KEY" \
  CRON_SECRET="$CRON_SECRET"
supabase functions deploy process-notifications --no-verify-jwt
supabase functions deploy send-broadcast --no-verify-jwt

echo "Deploy completato. Ora crea il Cron ogni minuto come spiegato in LEGGIMI-V27-BACKEND-NOTIFICHE.md"
