"""Парсеры сайтов с арендой в Братиславе.

Каждый парсер возвращает список Listing. Если сайт поменял вёрстку и парсер
сломался, он бросает исключение — бот это поймает и сообщит в Telegram,
остальные источники продолжат работать.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from html import unescape

import requests
from bs4 import BeautifulSoup

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0 Safari/537.36"
)
session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Language": "sk,en;q=0.8"})


@dataclass
class Listing:
    source: str
    id: str
    title: str
    url: str
    price: int | None = None        # аренда, €/мес
    charges: int | None = None      # энергии/коммуналка, если сайт отдаёт отдельно
    location: str = ""
    kind: str = ""                  # квартира / комната и т.п.
    text: str = ""                  # кусок описания для проверки «энергии включены?»
    extra: list[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        return f"{self.source}:{self.id}"

    @property
    def total(self) -> int | None:
        if self.price is None:
            return None
        return self.price + (self.charges or 0)


def _get(url: str) -> str:
    r = session.get(url, timeout=30)
    r.raise_for_status()
    return r.text


def _int(s) -> int | None:
    if s is None:
        return None
    digits = re.sub(r"[^\d]", "", str(s))
    return int(digits) if digits else None


# ---------------------------------------------------------------- bazos.sk
# «Hľadám byt…» — это люди, которые сами ищут жильё, их пропускаем
BAZOS_SEEKER = re.compile(r"\bh[lľ]ad[aá]m(e)?\b|\bdopyt\b|\bsh[aá]n[ií]m\b", re.I)


def bazos(category: str, kind: str, max_price: int, radius_km: int) -> list[Listing]:
    """category: 'byt' (квартиры) или 'podnajom' (подназем, комнаты, совместное проживание)."""
    out: list[Listing] = []
    # 2 страницы: первые места часто заняты платными «TOP» объявлениями
    for offset in ("", "20/"):
        url = (
            f"https://reality.bazos.sk/prenajmu/{category}/{offset}"
            f"?hlokalita=81101&humkreis={radius_km}&cenado={max_price}"
        )
        soup = BeautifulSoup(_get(url), "html.parser")
        for card in soup.select("div.inzeraty"):
            a = card.select_one("h2.nadpis a")
            if not a:
                continue
            m = re.search(r"/inzerat/(\d+)/", a["href"])
            if not m:
                continue
            title = a.get_text(strip=True)
            desc_el = card.select_one(".popis")
            desc = desc_el.get_text(" ", strip=True) if desc_el else ""
            if BAZOS_SEEKER.search(title) or BAZOS_SEEKER.search(desc[:60]):
                continue
            price_el = card.select_one(".inzeratycena")
            loc_el = card.select_one(".inzeratylok")
            out.append(Listing(
                source="bazos",
                id=m.group(1),
                title=title,
                url="https://reality.bazos.sk" + a["href"],
                price=_int(price_el.get_text()) if price_el else None,
                location=loc_el.get_text(" ", strip=True) if loc_el else "",
                kind=kind,
                text=desc,
            ))
    return out


# ------------------------------------------------------- nehnutelnosti.sk
# reality.sk и byty.sk работают на той же базе, поэтому отдельно их не парсим.
def nehnutelnosti(max_price: int) -> list[Listing]:
    url = (
        "https://www.nehnutelnosti.sk/vysledky/byty/bratislava/prenajom"
        f"?priceTo={max_price}&order=NEWEST"
    )
    html = _get(url)
    items = []
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        data = json.loads(m.group(1))
        for node in data.get("@graph", [data]):
            if node.get("@type") == "SearchResultsPage":
                items = node["mainEntity"]["itemListElement"]
    if not items:
        raise RuntimeError("nehnutelnosti: не нашёл список объявлений (сменилась вёрстка?)")
    out = []
    for el in items:
        it = el["item"]
        nid = it["@id"].rsplit("/", 1)[-1]
        price = (it.get("priceSpecification") or {}).get("price")
        extra = []
        if (it.get("floorSize") or {}).get("value"):
            extra.append(f"{it['floorSize']['value']} m²")
        out.append(Listing(
            source="nehnutelnosti",
            id=nid,
            title=it.get("name", "").strip(),
            url=it.get("url", ""),
            price=_int(price),
            kind=it.get("category", "byt"),
            text=it.get("description", ""),
            extra=extra,
        ))
    return out


# ---------------------------------------------------------- topreality.sk
def topreality(max_price: int) -> list[Listing]:
    # form=3 — prenájom (аренда); типы: гарсонка, двойгарсонка, 1-, 2-izb., апартамент
    types = "".join(f"&type%5B%5D={t}" for t in (101, 108, 102, 103, 110))
    url = (
        "https://www.topreality.sk/vyhladavanie-nehnutelnosti.html?form=3"
        f"{types}&obec=c100-Bratislavsk%C3%BD+kraj&cena_do={max_price}"
        "&searchType=string&n_search=search&sort=date_desc"
    )
    soup = BeautifulSoup(_get(url), "html.parser")
    out = []
    for c in soup.select("div[data-ga4-container-item_id_generic]"):
        a = c.select_one("h2.card-title a")
        if not a:
            continue
        loc = " ".join(
            x.get_text(" ", strip=True)
            for x in c.select(".location-address, .location-city")
        )
        out.append(Listing(
            source="topreality",
            id=c["data-ga4-container-item_id_generic"],
            title=unescape(c.get("data-ga4-container-item_name", a.get_text(strip=True))),
            url=a["href"],
            price=_int(c.get("data-ga4-container-price")),
            location=loc or c.get("data-ga4-container-item_category3", ""),
            kind=c.get("data-ga4-container-item_category2", ""),
        ))
    if not out and "card-title" in str(soup):
        raise RuntimeError("topreality: карточки есть, но не распарсились")
    return out


# --------------------------------------------------------- bezrealitky.sk
def bezrealitky() -> list[Listing]:
    url = (
        "https://www.bezrealitky.sk/vypis/ponuka-prenajom/byt/bratislava"
        "?order=TIMEORDER_DESC"
    )
    html = _get(url)
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise RuntimeError("bezrealitky: нет __NEXT_DATA__")
    cache = json.loads(m.group(1))["props"]["pageProps"].get("apolloCache", {})
    out = []
    for k, v in cache.items():
        if not k.startswith("Advert:"):
            continue
        addr = next((val for key, val in v.items() if key.startswith("address")), "")
        alt = next((val for key, val in v.items() if key.startswith("imageAltText")), "")
        tags = next((val for key, val in v.items() if key.startswith("tags")), []) or []
        extra = [f"{v['surface']} m²"] if v.get("surface") else []
        if v.get("roommate"):
            extra.append("совместное проживание")
        extra += tags[:3]
        out.append(Listing(
            source="bezrealitky",
            id=str(v["id"]),
            title=alt or v.get("uri", ""),
            url=f"https://www.bezrealitky.sk/nehnutelnosti-byty-domy/{v['uri']}",
            price=_int(v.get("price")),
            charges=_int(v.get("charges")),
            location=addr,
            kind=v.get("disposition", "").replace("DISP_", "").replace("_", " ").lower(),
            extra=extra,
        ))
    return out
