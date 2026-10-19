"""Telegram-бот: каждые N минут проверяет сайты и присылает новые объявления.

Запуск:
    python bot.py            — работать постоянно (проверка каждые CHECK_EVERY_MIN минут)
    python bot.py --once     — одна проверка и выход (для cron / GitHub Actions)
    python bot.py --chat-id  — показать chat_id тех, кто написал боту /start
    python bot.py --dry-run  — проверить парсеры, ничего не отправляя
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import traceback
from datetime import datetime
from html import escape
from pathlib import Path

import requests

import sources
from sources import Listing


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


HERE = Path(__file__).parent
load_env(HERE / ".env")

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_IDS = [c.strip() for c in os.environ.get("TELEGRAM_CHAT_IDS", "").split(",") if c.strip()]
MAX_TOTAL = int(os.environ.get("MAX_PRICE", "650"))          # потолок «со всем»
CHECK_EVERY_MIN = int(os.environ.get("CHECK_EVERY_MIN", "10"))
RADIUS_KM = int(os.environ.get("BAZOS_RADIUS_KM", "15"))
STATE_FILE = Path(os.environ.get("STATE_FILE", HERE / "data" / "seen.json"))

# Объявления, где цена указана без энергий, пропускаем, только если сумма заведомо больше.
# Если энергии не указаны — присылаем и помечаем, пусть человек сам решит.

INCLUDED = re.compile(
    r"vr[aá]tane\s+(energi|poplatk|služ|sluz)|s\s+energiami|energie\s+v\s+cene|"
    r"v\s+cene\s+(s[uú]\s+)?(aj\s+)?energi|v[sš]etko\s+v\s+cene|all\s+(bills|utilities)\s+included|"
    r"including\s+(bills|utilities)|cena\s+je\s+kone[cč]n",
    re.I,
)
EXCLUDED = re.compile(
    r"\+\s*energi|plus\s+energi|\+\s*poplatk|plus\s+poplatk|bez\s+energi|"
    r"\+\s*služby|\+\s*sluzby|\+\s*utilities|\+\s*bills|energie\s+(navyše|navyse|zvl[aá][sš]ť)",
    re.I,
)


def fetch_all() -> tuple[list[Listing], list[str]]:
    jobs = {
        "bazos (квартиры)": lambda: sources.bazos("byt", "квартира", MAX_TOTAL, RADIUS_KM),
        "bazos (комнаты/подназем)": lambda: sources.bazos("podnajom", "комната / подназем", MAX_TOTAL, RADIUS_KM),
        "nehnutelnosti.sk": lambda: sources.nehnutelnosti(MAX_TOTAL),
        "topreality.sk": lambda: sources.topreality(MAX_TOTAL),
        "bezrealitky.sk": sources.bezrealitky,
    }
    listings, errors = [], []
    for name, fn in jobs.items():
        try:
            got = fn()
            print(f"  {name}: {len(got)}")
            listings += got
        except Exception as e:  # один сломанный сайт не должен ронять остальные
            print(f"  {name}: ОШИБКА {e}")
            traceback.print_exc()
            errors.append(f"{name}: {e}")
    return listings, errors


def fits(l: Listing) -> bool:
    if l.total is not None and l.total > MAX_TOTAL:
        return False
    return True


def utilities_note(l: Listing) -> str:
    if l.charges:
        return f"аренда {l.price} € + энергии {l.charges} € = <b>{l.total} €</b>"
    if l.charges == 0 and l.source == "bezrealitky":
        return f"<b>{l.price} €</b> (энергии не указаны отдельно)"
    if l.price is None:
        return "цена: договорная / не указана"
    if INCLUDED.search(l.text):
        return f"<b>{l.price} €</b> ✅ похоже, с энергиями"
    if EXCLUDED.search(l.text):
        return f"<b>{l.price} €</b> ⚠️ похоже, энергии сверху"
    return f"<b>{l.price} €</b> (про энергии уточнить)"


SOURCE_NAMES = {
    "bazos": "Bazoš",
    "nehnutelnosti": "Nehnuteľnosti.sk",
    "topreality": "TopReality",
    "bezrealitky": "Bezrealitky (без агентства)",
}


def format_msg(l: Listing) -> str:
    lines = [f"🏠 <b>{escape(l.title[:200])}</b>", "💶 " + utilities_note(l)]
    meta = " · ".join(x for x in [l.kind, l.location, *l.extra] if x)
    if meta:
        lines.append("📍 " + escape(meta[:250]))
    lines.append(f"🔗 <a href=\"{escape(l.url)}\">Открыть на {SOURCE_NAMES.get(l.source, l.source)}</a>")
    return "\n".join(lines)


def tg(method: str, **params):
    r = requests.post(f"https://api.telegram.org/bot{TOKEN}/{method}", json=params, timeout=30)
    if r.status_code == 429:  # слишком много сообщений подряд — подождать и повторить
        time.sleep(r.json().get("parameters", {}).get("retry_after", 5) + 1)
        return tg(method, **params)
    r.raise_for_status()
    return r.json()


def send(text: str) -> None:
    for chat in CHAT_IDS:
        try:
            tg("sendMessage", chat_id=chat, text=text, parse_mode="HTML",
               disable_web_page_preview=False)
        except Exception as e:
            print(f"  не смог отправить в {chat}: {e}")
        time.sleep(1.1)  # лимит Telegram ~1 сообщение/сек в один чат


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"seen": {}, "errors_reported": {}}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    # храним только последние 5000 ID, чтобы файл не рос бесконечно
    seen = dict(sorted(state["seen"].items(), key=lambda kv: kv[1])[-5000:])
    state["seen"] = seen
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=0))
    tmp.replace(STATE_FILE)


def check(dry_run: bool = False) -> None:
    print(f"[{datetime.now():%H:%M:%S}] проверка…")
    state = load_state()
    first_run = not state["seen"]
    listings, errors = fetch_all()

    new = []
    for l in listings:
        if l.key in state["seen"]:
            continue
        state["seen"][l.key] = int(time.time())
        if fits(l):
            new.append(l)

    if dry_run:
        for l in new[:15]:
            print("\n" + format_msg(l))
        print(f"\nвсего подходящих новых: {len(new)} (ничего не сохранено)")
        return

    if first_run:
        # не заваливаем чат сотней старых объявлений: запоминаем их молча
        send(
            f"✅ Бот запущен. Сейчас на сайтах {len(new)} подходящих объявлений до {MAX_TOTAL} €, "
            f"их я запомнил. Дальше буду присылать только новые, проверка каждые {CHECK_EVERY_MIN} мин."
        )
    else:
        for l in new:
            send(format_msg(l))
        print(f"  отправлено новых: {len(new)}")

    # Об ошибке источника сообщаем раз в 6 часов, чтобы не спамить
    now = int(time.time())
    for err in errors:
        src = err.split(":", 1)[0]
        if now - state["errors_reported"].get(src, 0) > 6 * 3600:
            send(f"⚠️ Не получилось проверить {escape(err[:300])}\nОстальные сайты работают.")
            state["errors_reported"][src] = now

    save_state(state)


def show_chat_ids() -> None:
    updates = tg("getUpdates").get("result", [])
    if not updates:
        print("Пусто. Напишите боту /start в Telegram и запустите команду ещё раз.")
    seen = set()
    for u in updates:
        chat = (u.get("message") or u.get("my_chat_member") or {}).get("chat")
        if chat and chat["id"] not in seen:
            seen.add(chat["id"])
            name = chat.get("title") or chat.get("first_name") or chat.get("username")
            print(f"chat_id = {chat['id']}   ({name})")


def main() -> None:
    args = set(sys.argv[1:])
    if "--dry-run" in args:
        check(dry_run=True)
        return
    if not TOKEN:
        sys.exit("Нет TELEGRAM_BOT_TOKEN. Скопируйте .env.example в .env и заполните.")
    if "--chat-id" in args:
        show_chat_ids()
        return
    if not CHAT_IDS:
        sys.exit("Нет TELEGRAM_CHAT_IDS. Напишите боту /start и запустите: python bot.py --chat-id")
    if "--once" in args:
        check()
        return
    while True:
        try:
            check()
        except Exception:
            traceback.print_exc()
        time.sleep(CHECK_EVERY_MIN * 60)


if __name__ == "__main__":
    main()
