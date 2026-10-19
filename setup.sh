#!/usr/bin/env bash
# Настройка бота одной командой: ./setup.sh
# Токен вводится скрыто и сохраняется только в секретах GitHub (не в файлах и не в git).
set -euo pipefail
cd "$(dirname "$0")"

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Репозиторий: $REPO"
echo
read -rsp "Вставьте токен бота от @BotFather и нажмите Enter: " TOKEN; echo

ME=$(curl -s "https://api.telegram.org/bot${TOKEN}/getMe")
if ! echo "$ME" | grep -q '"ok":true'; then
  echo "❌ Telegram не принял токен. Проверьте, что скопировали его целиком."; exit 1
fi
BOT=$(echo "$ME" | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["username"])')
echo "✅ Бот @$BOT найден."

printf '%s' "$TOKEN" | gh secret set TELEGRAM_BOT_TOKEN --repo "$REPO"
echo "✅ Токен сохранён в секретах GitHub."
echo
echo "👉 Теперь откройте https://t.me/$BOT и нажмите Start (друг тоже может нажать)."
echo "   Жду 2 минуты…"

IDS=""
for _ in $(seq 1 24); do
  IDS=$(curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates" | python3 -c '
import sys, json
ids = []
for u in json.load(sys.stdin).get("result", []):
    c = (u.get("message") or u.get("my_chat_member") or {}).get("chat")
    if c and str(c["id"]) not in ids:
        ids.append(str(c["id"]))
print(",".join(ids))')
  [ -n "$IDS" ] && break
  sleep 5
done
if [ -z "$IDS" ]; then
  echo "❌ Не дождался /start. Нажмите Start у бота и запустите ./setup.sh ещё раз."; exit 1
fi
# даём ещё 20 секунд, чтобы успел нажать и друг
sleep 20
IDS=$(curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates" | python3 -c '
import sys, json
ids = []
for u in json.load(sys.stdin).get("result", []):
    c = (u.get("message") or u.get("my_chat_member") or {}).get("chat")
    if c and str(c["id"]) not in ids:
        ids.append(str(c["id"]))
print(",".join(ids))')
printf '%s' "$IDS" | gh secret set TELEGRAM_CHAT_IDS --repo "$REPO"
echo "✅ Получатели: $(echo "$IDS" | tr ',' '\n' | wc -l | tr -d ' ') чел."

gh workflow enable check.yml --repo "$REPO" >/dev/null 2>&1 || true
gh workflow run check.yml --repo "$REPO"
echo
echo "🚀 Бот запущен. Через 1–2 минуты в Telegram придёт «Бот запущен»,"
echo "   дальше проверка каждые ~10 минут. Логи: https://github.com/$REPO/actions"
echo "   Добавить ещё человека: он жмёт Start, вы снова запускаете ./setup.sh"
