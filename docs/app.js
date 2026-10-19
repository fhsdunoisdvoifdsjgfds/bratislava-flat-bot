/* Мини-приложение «Квартиры Братислава» для Telegram.
   Без сборки: один файл, ванильный JS. Данные — API облачной функции flat-bot. */
(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;
  const inTG = !!(tg && tg.initData);
  const API = "https://nnkhlnzjkwtcjvzyubzc.supabase.co/functions/v1/flat-bot";
  const CALL_URL = (n) => `${API}?action=call&n=${encodeURIComponent(n)}`;
  const BA_CENTER = [48.1486, 17.1077];

  // ---------------------------------------------------------------- утилиты
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const el = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("fb_" + k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("fb_" + k, JSON.stringify(v));
      } catch { /* приватный режим */ }
    },
  };
  const haptic = {
    tap: () => tg?.HapticFeedback?.impactOccurred?.("light"),
    soft: () => tg?.HapticFeedback?.selectionChanged?.(),
    ok: () => tg?.HapticFeedback?.notificationOccurred?.("success"),
    err: () => tg?.HapticFeedback?.notificationOccurred?.("error"),
  };
  const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("ru-RU"));
  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
  };
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 90) return "только что";
    if (s < 3600) return `${Math.round(s / 60)} мин назад`;
    if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
    const d = Math.round(s / 86400);
    return d === 1 ? "вчера" : `${d} ${plural(d, "день", "дня", "дней")} назад`;
  }
  const dateRu = (d, opts) => new Date(d).toLocaleString("ru-RU", { timeZone: "Europe/Bratislava", ...opts });
  const dayKey = (d) => dateRu(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  function dayLabel(d) {
    const k = dayKey(d);
    if (k === dayKey(Date.now())) return "Сегодня";
    if (k === dayKey(Date.now() + 86400000)) return "Завтра";
    if (k === dayKey(Date.now() - 86400000)) return "Вчера";
    return dateRu(d, { weekday: "long", day: "numeric", month: "long" });
  }
  const timeRu = (d) => dateRu(d, { hour: "2-digit", minute: "2-digit" });
  function untilText(d) {
    let m = Math.round((new Date(d) - Date.now()) / 60000);
    if (m <= 0) return "сейчас";
    if (m < 60) return `через ${m} мин`;
    const h = Math.floor(m / 60);
    m %= 60;
    if (h < 24) return `через ${h} ч${m ? ` ${m} мин` : ""}`;
    const dd = Math.round(h / 24);
    return `через ${dd} ${plural(dd, "день", "дня", "дней")}`;
  }

  // ---------------------------------------------------------------- иконки
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    heart: '<path d="M12 20s-7-4.4-9.2-8.6C1.2 8.3 3 4.5 6.6 4.5c2.1 0 3.4 1.2 5.4 3.2 2-2 3.3-3.2 5.4-3.2 3.6 0 5.4 3.8 3.8 6.9C19 15.6 12 20 12 20z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    chart: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    cards: '<rect x="3" y="3" width="18" height="12" rx="2.5"/><path d="M3 19h18M3 22h11"/>',
    list: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="3" y="14" width="7" height="6" rx="1.5"/><path d="M14 6h7M14 9h4M14 16h7M14 19h4"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3 3.5M6.6 6.6C4.3 8.1 3 12 3 12s4 6 9 6a9 9 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    translate: '<path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c-1 4-4 7-7 8"/><path d="m13 21 4-9 4 9M14.5 18h5"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    msg: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5"/>',
    sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
  };
  const ic = (n, fill = false) =>
    `<svg viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

  // ---------------------------------------------------------------- справочники
  const KINDS = [
    { k: "room", em: "🛏️", name: "Комната", short: "Комнаты", hint: "отдельная комната, совместное проживание" },
    { k: "studio", em: "🛋️", name: "Студия / 1-комн.", short: "Студии", hint: "гарсонка или 1-izbový byt" },
    { k: "flat", em: "🏢", name: "Квартира", short: "Квартиры", hint: "1,5 комнаты и больше" },
    { k: "hostel", em: "🏨", name: "Общежитие", short: "Ubytovňa", hint: "ubytovňa: дёшево, заселение быстро" },
  ];
  const KIND = Object.fromEntries(KINDS.map((x) => [x.k, x]));
  const SOURCES = { bazos: "Bazoš", nehnutelnosti: "Nehnuteľnosti", topreality: "TopReality", bezrealitky: "Bezrealitky" };
  const SORTS = [
    { k: "new", name: "Сначала новые", hint: "по времени публикации" },
    { k: "cheap", name: "Сначала дешёвые", hint: "по цене с энергиями" },
    { k: "deal", name: "Выгоднее рынка", hint: "насколько дешевле медианы района" },
    { k: "m2", name: "Дешевле за м²", hint: "цена за квадратный метр" },
  ];
  const AGENCY = [
    { k: "any", em: "🤝", name: "Все объявления", hint: "и частники, и агентства" },
    { k: "private", em: "👤", name: "Без агентства", hint: "без комиссии, напрямую с владельцем" },
    { k: "agency", em: "🏢", name: "Только агентства", hint: "больше выбор, обычно есть комиссия" },
  ];
  const districtName = (k) => st.districts.find((d) => d.key === k)?.name ?? null;

  // ---------------------------------------------------------------- состояние
  const st = {
    boot: null,
    me: null,
    defaults: null,
    settings: null,
    filters: null,
    sort: store.get("sort", "new"),
    view: store.get("view", "cards"),
    q: "",
    tab: "feed",
    districts: [],
    favs: new Set(store.get("favs", [])),
    feed: { items: [], total: 0, offset: 0, loading: false, done: false, gen: 0 },
    lastCheck: null,
  };
  const filtersFrom = (s) => ({
    kinds: [...s.kinds], minTotal: s.minTotal, maxTotal: s.maxTotal, agency: s.agency,
    districts: [...s.districts], withPhone: s.withPhone, withPhoto: s.withPhoto, onlyNew: false,
  });

  // ---------------------------------------------------------------- API
  async function api(op, data = {}) {
    const r = await fetch(`${API}?action=api`, {
      method: "POST",
      body: JSON.stringify({ op, initData: tg?.initData || "", ...data }),
    });
    if (r.status === 401) throw Object.assign(new Error("auth"), { auth: true });
    const j = await r.json();
    if (j?.error) throw new Error(j.error);
    return j;
  }
  function needAuth() {
    if (inTG) return false;
    toast("Откройте приложение через бота в Telegram, чтобы это работало");
    haptic.err();
    return true;
  }

  // ---------------------------------------------------------------- тост
  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  async function copy(text, label = "Скопировано") {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = el(`<textarea style="position:fixed;opacity:0"></textarea>`);
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    haptic.ok();
    toast(label);
  }
  function call(phone) {
    haptic.tap();
    // в Android-клиенте tel: из WebView не открывается — идём через внешний редирект
    if (tg?.platform === "android") tg.openLink(CALL_URL(phone));
    else location.href = "tel:" + phone;
  }
  const openLink = (url) => (tg ? tg.openLink(url) : window.open(url, "_blank"));

  // ---------------------------------------------------------------- слои (шторки, страницы)
  const layers = [];
  function pushLayer(node, onClose) {
    $("#layer").append(node);
    layers.push({ node, onClose });
    syncBack();
    return node;
  }
  function closeLayer() {
    const top = layers.pop();
    if (!top) return;
    top.onClose?.(); // запускает анимацию закрытия
    setTimeout(() => top.node.remove(), 220);
    syncBack();
  }
  function syncBack() {
    if (!tg?.BackButton) return;
    layers.length ? tg.BackButton.show() : tg.BackButton.hide();
  }
  tg?.BackButton?.onClick(() => closeLayer());

  function sheet(html, { onClose } = {}) {
    const wrap = el(`<div><div class="scrim"></div><div class="sheet"><div class="grab"></div>${html}</div></div>`);
    wrap.style.position = "fixed";
    wrap.style.inset = "0";
    wrap.style.zIndex = "60";
    const s = $(".sheet", wrap);
    $(".scrim", wrap).onclick = () => closeLayer();
    // свайп вниз закрывает шторку
    let y0 = null;
    s.addEventListener("touchstart", (e) => (y0 = s.scrollTop <= 0 ? e.touches[0].clientY : null), { passive: true });
    s.addEventListener("touchmove", (e) => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) s.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    s.addEventListener("touchend", (e) => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0;
      s.style.transform = "";
      y0 = null;
      if (dy > 110) closeLayer();
    });
    pushLayer(wrap, onClose);
    const layer = layers[layers.length - 1];
    const origClose = layer.onClose;
    layer.onClose = () => {
      s.classList.add("closing");
      $(".scrim", wrap).style.opacity = "0";
      $(".scrim", wrap).style.transition = "opacity .2s";
      origClose?.();
    };
    return s;
  }

  // ---------------------------------------------------------------- карточки объявлений
  function priceInfo(it) {
    const total = it.total ?? it.price;
    let util;
    if (it.price == null) util = "цена договорная";
    else if (it.utilities === "included") util = "с энергиями ✓";
    else if (it.utilities === "extra" && it.charges) util = `вкл. энергии ${it.charges} €`;
    else if (it.utilities === "extra") util = "+ энергии";
    else util = "энергии — уточнить";
    return { total, util };
  }
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Bratislava" });
  // у объявлений из первичной подгрузки точного времени нет — показываем дату
  const when = (it) =>
    it.seeded ? (it.published ? (String(it.published).slice(0, 10) === today() ? "сегодня" : dateRu(it.published, { day: "numeric", month: "short" })) : "ранее") : ago(it.posted_at);
  const isNew = (it) =>
    it.seeded ? !!it.published && String(it.published).slice(0, 10) === today() : Date.now() - new Date(it.posted_at) < 86400000;
  function pillsHTML(it, compact = false) {
    const p = [];
    if (it.deal != null && it.deal <= -8) p.push(`<span class="pill good">${ic("spark")}−${Math.abs(it.deal)}% к рынку</span>`);
    else if (it.deal != null && it.deal >= 15 && !compact) p.push(`<span class="pill warn">+${it.deal}% к рынку</span>`);
    if (it.agency === false) p.push(`<span class="pill good">Без агентства</span>`);
    else if (it.agency === true && !compact) p.push(`<span class="pill">Агентство</span>`);
    if (it.has_phone) p.push(`<span class="pill acc">${ic("phone")}${compact ? "" : "Телефон"}</span>`);
    return p.join("");
  }
  function metaHTML(it) {
    const parts = [
      districtName(it.district),
      KIND[it.kind]?.name,
      it.area ? `${fmt(it.area)} м²` : null,
    ].filter(Boolean);
    return parts.map((x) => `<span>${esc(x)}</span>`).join("");
  }
  const imgTag = (src, alt = "") =>
    src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  const noImg = (it) => `<div class="noimg">${KIND[it.kind]?.em ?? "🏠"}</div>`;

  function cardHTML(it, mode = st.view) {
    const { total, util } = priceInfo(it);
    const fav = st.favs.has(it.key);
    const favBtn = `<span class="fav ${fav ? "on" : ""}" data-fav="${esc(it.key)}" role="button" aria-label="В избранное">${ic("heart", fav)}</span>`;
    if (mode === "list") {
      return `<button class="card row" data-open="${esc(it.key)}">
        <div class="thumb">${noImg(it)}${imgTag(it.img)}</div>
        <div class="info">
          <div class="p num">${total != null ? fmt(total) + " €" : "?"}${isNew(it) ? '<span class="badge new">NEW</span>' : ""}</div>
          <div class="ttl">${esc(it.title)}</div>
          <div class="meta">${metaHTML(it)}</div>
          <div class="pills">${pillsHTML(it, true)}<span class="pill">${esc(when(it))}</span></div>
        </div>
      </button>`;
    }
    const tile = mode === "grid";
    return `<button class="card ${tile ? "tile" : ""}" data-open="${esc(it.key)}">
      <div class="ph">${noImg(it)}${imgTag(it.img, it.title)}
        <div class="badges">${isNew(it) ? '<span class="badge new">NEW</span>' : ""}${tile ? "" : `<span class="badge src">${esc(SOURCES[it.source] ?? it.source)}</span>`}</div>
        ${favBtn}
        <div class="price num"><b>${total != null ? fmt(total) + " €" : "?"}</b>${tile ? "" : `<small>/мес</small><span class="util">${esc(util)}</span>`}</div>
        ${!tile && it.img_count > 1 ? `<span class="pcount">📷 ${it.img_count}</span>` : ""}
      </div>
      <div class="body">
        <div class="ttl">${esc(it.title)}</div>
        <div class="meta">${tile ? `<span>${esc(districtName(it.district) ?? KIND[it.kind]?.name ?? "")}</span>` : metaHTML(it) + `<span>${esc(when(it))}</span>`}</div>
        ${tile ? "" : `<div class="pills">${pillsHTML(it)}</div>`}
      </div>
    </button>`;
  }

  // делегирование кликов по карточкам
  document.addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      e.stopPropagation();
      e.preventDefault();
      toggleFav(fav.dataset.fav);
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) {
      haptic.tap();
      openListing(open.dataset.open);
    }
  });

  async function toggleFav(key, force) {
    const on = force ?? !st.favs.has(key);
    on ? st.favs.add(key) : st.favs.delete(key);
    store.set("favs", [...st.favs]);
    haptic[on ? "ok" : "soft"]();
    $$(`[data-fav="${CSS.escape(key)}"]`).forEach((b) => {
      b.classList.toggle("on", on);
      b.innerHTML = b.matches(".icon-btn") ? ic("heart", on) : ic("heart", on);
    });
    updateTabBadges();
    if (on) toast("Добавлено в избранное");
    if (inTG) api("fav", { key, on }).catch(() => toast("Не удалось сохранить"));
  }

  // ---------------------------------------------------------------- таббар
  const TABS = [
    { k: "feed", name: "Поиск", icon: "home" },
    { k: "favs", name: "Избранное", icon: "heart" },
    { k: "rem", name: "Напомнить", icon: "bell" },
    { k: "market", name: "Рынок", icon: "chart" },
    { k: "settings", name: "Настройки", icon: "gear" },
  ];
  function renderTabs() {
    const nav = $("#tabbar");
    nav.hidden = false;
    nav.innerHTML = TABS.map((t) => `<button data-tab="${t.k}" class="${st.tab === t.k ? "on" : ""}">${ic(t.icon, st.tab === t.k && t.k === "favs")}<span>${t.name}</span></button>`).join("");
    nav.onclick = (e) => {
      const b = e.target.closest("[data-tab]");
      if (!b) return;
      haptic.soft();
      if (b.dataset.tab === st.tab) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      go(b.dataset.tab);
    };
    updateTabBadges();
  }
  function updateTabBadges() {
    const set = (tab, n) => {
      const b = $(`#tabbar [data-tab="${tab}"]`);
      if (!b) return;
      $(".cnt", b)?.remove();
      if (n) b.append(el(`<span class="cnt">${n > 99 ? "99+" : n}</span>`));
    };
    set("rem", st.me?.counts?.reminders ?? 0);
  }
  function go(tab) {
    st.tab = tab;
    renderTabs();
    window.scrollTo(0, 0);
    destroyMap();
    ({ feed: renderFeed, favs: renderFavs, rem: renderReminders, market: renderMarket, settings: renderSettings })[tab]();
  }

  // ---------------------------------------------------------------- таймер проверки
  // сайты проверяются по cron каждые 10 минут (:00, :10, …), обработка ~40 секунд
  const CYCLE = 10 * 60 * 1000;
  const nextCheck = () => Math.ceil((Date.now() - 40000) / CYCLE) * CYCLE + 40000;
  function timerHTML() {
    return `<button class="timer" id="timer" aria-label="До следующей проверки">
      <svg viewBox="0 0 36 36"><circle class="ring-bg" cx="18" cy="18" r="15" fill="none" stroke-width="4"/>
      <circle class="ring" cx="18" cy="18" r="15" fill="none" stroke-width="4" stroke-dasharray="94.25" stroke-dashoffset="0"/></svg>
      <span><span class="muted">проверка</span><b id="timer-t">--:--</b></span></button>`;
  }
  let lastTick = 0, checkSeen = nextCheck();
  setInterval(() => {
    const t = $("#timer-t");
    const now = Date.now();
    const next = nextCheck();
    if (next !== checkSeen) {
      // наступила новая проверка — через несколько секунд смотрим, что появилось
      checkSeen = next;
      setTimeout(checkForNew, 5000);
    }
    if (!t) return;
    const left = Math.max(0, next - now);
    t.textContent = `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}`;
    const ring = $("#timer .ring");
    if (ring) ring.style.strokeDashoffset = String(94.25 * (left / CYCLE));
    if (now - lastTick > 30000) {
      lastTick = now;
      const sub = $("#subline");
      if (sub && st.lastCheck) sub.textContent = subline();
    }
  }, 1000);
  const subline = () => `4 сайта · обновлено ${st.lastCheck ? ago(st.lastCheck.at) : "—"}`;

  async function checkForNew() {
    try {
      const b = await api("bootstrap");
      st.lastCheck = b.lastCheck;
      if (st.tab !== "feed" || st.sort !== "new" || st.view === "map") return;
      const r = await api("feed", { filters: { ...st.filters, q: st.q }, sort: "new", limit: 24 });
      const known = new Set(st.feed.items.map((i) => i.key));
      const fresh = r.items.filter((i) => !known.has(i.key));
      if (fresh.length) {
        haptic.ok();
        const b2 = $("#newbar");
        if (b2) {
          b2.hidden = false;
          b2.innerHTML = `${ic("spark")} ${fresh.length} ${plural(fresh.length, "новое объявление", "новых объявления", "новых объявлений")} — показать`;
        }
        $("#timer")?.classList.add("pulse");
      }
    } catch { /* сеть — попробуем в следующий раз */ }
  }

  // ---------------------------------------------------------------- лента
  function activeFilterCount() {
    const f = st.filters, d = st.defaults;
    let n = 0;
    if (f.kinds.length !== 4) n++;
    if (f.maxTotal !== d.maxTotal || f.minTotal) n++;
    if (f.agency !== "any") n++;
    if (f.districts.length) n++;
    if (f.withPhone) n++;
    if (f.withPhoto) n++;
    return n;
  }
  function chipsHTML() {
    const f = st.filters;
    const n = activeFilterCount();
    const kindLabel = f.kinds.length === 4 ? "Любое жильё" : f.kinds.map((k) => KIND[k].short).join(", ");
    return `
      <button class="chip ${n ? "on" : ""}" data-act="filters">${ic("sliders")}Фильтры${n ? `<span class="dot">${n}</span>` : ""}</button>
      <button class="chip" data-act="filters">${esc(kindLabel)}${ic("down")}</button>
      <button class="chip" data-act="filters">${f.minTotal ? `${fmt(f.minTotal)}–` : "до "}${fmt(f.maxTotal)} €${ic("down")}</button>
      <button class="chip ${f.districts.length ? "on" : ""}" data-act="districts">${ic("pin")}${f.districts.length ? `${f.districts.length} ${plural(f.districts.length, "район", "района", "районов")}` : "Все районы"}</button>
      <button class="chip ${f.agency === "private" ? "on" : ""}" data-toggle="private">👤 Без агентства</button>
      <button class="chip ${f.onlyNew ? "on" : ""}" data-toggle="onlyNew">🆕 За 24 часа</button>
      <button class="chip ${f.withPhone ? "on" : ""}" data-toggle="withPhone">${ic("phone")}С телефоном</button>
      <button class="chip ${f.withPhoto ? "on" : ""}" data-toggle="withPhoto">📷 С фото</button>`;
  }
  const VIEWS = [["cards", "cards"], ["list", "list"], ["grid", "grid"], ["map", "map"]];

  function renderFeed() {
    const scr = $("#screen");
    scr.innerHTML = `
      <header class="top flat">
        <div class="top-row">
          <div style="flex:1;min-width:0"><h1 class="title">Жильё в Братиславе</h1><div class="subtitle" id="subline">${esc(subline())}</div></div>
          ${timerHTML()}
        </div>
        <label class="search">${ic("search")}<input id="q" type="search" placeholder="Улица, район, слово из описания" value="${esc(st.q)}" enterkeyhint="search"></label>
      </header>
      <div class="stickybar" id="feedtop">
        <div class="chips" id="chips">${chipsHTML()}</div>
        <div class="bar" style="padding:8px 0 2px">
          <button class="sort" data-act="sort">${ic("sort")}${esc(SORTS.find((s) => s.k === st.sort)?.name)}</button>
          <div class="seg" id="views">${VIEWS.map(([k, i]) => `<button data-view="${k}" class="${st.view === k ? "on" : ""}" aria-label="${k}">${ic(i)}</button>`).join("")}</div>
        </div>
      </div>
      ${inTG ? "" : `<div class="banner">ℹ️<div><b>Режим просмотра</b>Откройте приложение через бота, чтобы сохранялись избранное, напоминания и уведомления.</div></div>`}
      <button class="chip on" id="newbar" hidden style="margin:6px auto 0;display:flex"></button>
      <div class="bar"><span class="count" id="count">Загружаю…</span></div>
      <div id="feed" class="feed ${st.view}"></div>
      <div id="sentinel" style="height:40px"></div>`;

    $("#newbar").onclick = () => {
      $("#newbar").hidden = true;
      $("#timer")?.classList.remove("pulse");
      loadFeed(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    $("#timer").onclick = () => toast(`Сайты проверяются каждые 10 минут. ${st.lastCheck ? "Последняя проверка " + ago(st.lastCheck.at) : ""}`);
    let qt;
    $("#q").oninput = (e) => {
      clearTimeout(qt);
      qt = setTimeout(() => {
        st.q = e.target.value;
        loadFeed(true);
      }, 350);
    };
    $("#chips").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      haptic.soft();
      if (b.dataset.act === "filters") openFilters();
      else if (b.dataset.act === "districts") openDistricts(st.filters.districts, (d) => {
        st.filters.districts = d;
        refreshChips();
        loadFeed(true);
      });
      else if (b.dataset.toggle) {
        const k = b.dataset.toggle;
        if (k === "private") st.filters.agency = st.filters.agency === "private" ? "any" : "private";
        else st.filters[k] = !st.filters[k];
        refreshChips();
        loadFeed(true);
      }
    };
    $("[data-act=sort]").onclick = openSort;
    $("#views").onclick = (e) => {
      const b = e.target.closest("[data-view]");
      if (!b || b.dataset.view === st.view) return;
      haptic.soft();
      st.view = b.dataset.view;
      store.set("view", st.view);
      $$("#views button").forEach((x) => x.classList.toggle("on", x === b));
      $("#feed").className = `feed ${st.view}`;
      if (st.view === "map") renderMapView();
      else {
        destroyMap();
        $("#feed").innerHTML = st.feed.items.map((i) => cardHTML(i)).join("");
        if (!st.feed.items.length) loadFeed(true);
      }
    };

    const io = new IntersectionObserver((ents) => {
      if (ents[0].isIntersecting && st.view !== "map") loadFeed(false);
    }, { rootMargin: "600px" });
    io.observe($("#sentinel"));
    if (st.view === "map") renderMapView();
    else loadFeed(true);
  }
  function refreshChips() {
    const c = $("#chips");
    if (c) c.innerHTML = chipsHTML();
  }

  async function loadFeed(reset) {
    const f = st.feed;
    if (st.view === "map") {
      renderMapView();
      return;
    }
    if (!reset && (f.loading || f.done)) return;
    const gen = reset ? ++f.gen : f.gen;
    if (reset) {
      Object.assign(f, { items: [], offset: 0, done: false });
      $("#feed").innerHTML = skeletons(st.view);
    }
    f.loading = true;
    try {
      const r = await api("feed", { filters: { ...st.filters, q: st.q }, sort: st.sort, offset: f.offset, limit: 24 });
      if (gen !== f.gen) return;
      if (reset) $("#feed").innerHTML = "";
      f.items.push(...r.items);
      f.total = r.total;
      f.offset += r.items.length;
      f.done = r.items.length < 24;
      $("#feed").insertAdjacentHTML("beforeend", r.items.map((i) => cardHTML(i)).join(""));
      $("#count").textContent = f.total
        ? `${fmt(f.total)} ${plural(f.total, "объявление", "объявления", "объявлений")} за 30 дней`
        : "";
      if (!f.items.length) $("#feed").innerHTML = emptyHTML();
    } catch (e) {
      if (gen === f.gen) $("#feed").innerHTML = `<div class="empty"><div class="ico">📡</div><h3>Нет связи</h3>Не получилось загрузить объявления.<br><br><button class="btn sm ghost" onclick="location.reload()">${ic("refresh")}Повторить</button></div>`;
    } finally {
      if (gen === f.gen) f.loading = false;
    }
  }
  const emptyHTML = () => `<div class="empty"><div class="ico">🔍</div><h3>Ничего не нашлось</h3>Попробуйте расширить бюджет, добавить районы или убрать часть фильтров.<br><br><button class="btn sm ghost" data-reset>Сбросить фильтры</button></div>`;
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-reset]")) return;
    st.filters = filtersFrom(st.defaults);
    st.q = "";
    renderFeed();
  });
  function skeletons(view) {
    const one = view === "list"
      ? `<div class="card row"><div class="thumb sk"></div><div class="info"><div class="sk" style="height:20px;width:40%"></div><div class="sk" style="height:14px;width:90%"></div><div class="sk" style="height:12px;width:60%"></div></div></div>`
      : `<div class="card ${view === "grid" ? "tile" : ""}"><div class="ph sk" style="border-radius:0"></div><div class="body"><div class="sk" style="height:16px;width:85%"></div><div class="sk" style="height:12px;width:55%;margin-top:8px"></div></div></div>`;
    return one.repeat(view === "grid" ? 6 : 4);
  }

  function openSort() {
    haptic.soft();
    const s = sheet(`<h2>Сортировка</h2><div class="opts" style="margin-top:12px">${SORTS.map((o) => `
      <button class="opt row-opt ${st.sort === o.k ? "on" : ""}" data-k="${o.k}"><div style="flex:1"><b>${o.name}</b><small>${o.hint}</small></div><span class="tick">${ic("check")}</span></button>`).join("")}</div>`);
    s.onclick = (e) => {
      const b = e.target.closest("[data-k]");
      if (!b) return;
      st.sort = b.dataset.k;
      store.set("sort", st.sort);
      haptic.soft();
      closeLayer();
      const sb = $("[data-act=sort]");
      if (sb) sb.innerHTML = ic("sort") + esc(SORTS.find((x) => x.k === st.sort).name);
      loadFeed(true);
    };
  }

  // ---------------------------------------------------------------- фильтры
  function budgetHTML(min, max, id = "b") {
    return `<div class="budget"><span id="${id}-min">${min ? fmt(min) + " –" : "до"}</span><b class="num" id="${id}-max">${fmt(max)}</b><span>€ в месяц</span></div>
      <div class="range2" id="${id}-range"><div class="track"></div><div class="fill"></div>
        <input type="range" min="0" max="1000" step="10" value="${min}" aria-label="Минимум">
        <input type="range" min="100" max="1000" step="10" value="${max}" aria-label="Максимум"></div>
      <div class="mlabels"><span>0 €</span><span>1 000 €</span></div>`;
  }
  function bindBudget(root, id, state) {
    const [a, b] = $$(`#${id}-range input`, root);
    const fill = $(`#${id}-range .fill`, root);
    const upd = () => {
      let lo = +a.value, hi = +b.value;
      if (lo > hi - 50) {
        lo = hi - 50;
        a.value = lo;
      }
      state.minTotal = lo;
      state.maxTotal = hi;
      $(`#${id}-min`, root).textContent = lo ? `${fmt(lo)} –` : "до";
      $(`#${id}-max`, root).textContent = fmt(hi);
      fill.style.left = `${(lo / 1000) * 100}%`;
      fill.style.right = `${100 - (hi / 1000) * 100}%`;
    };
    a.oninput = () => (haptic.soft(), upd());
    b.oninput = () => (haptic.soft(), upd());
    upd();
  }
  function kindsHTML(sel) {
    return `<div class="opts two">${KINDS.map((k) => `
      <button class="opt ${sel.includes(k.k) ? "on" : ""}" data-kind="${k.k}"><span class="tick">${ic("check")}</span><div class="em">${k.em}</div><b>${k.name}</b><small>${k.hint}</small></button>`).join("")}</div>`;
  }
  function bindKinds(root, state) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-kind]");
      if (!b) return;
      haptic.soft();
      const k = b.dataset.kind;
      const has = state.kinds.includes(k);
      if (has && state.kinds.length === 1) return toast("Нужен хотя бы один тип жилья");
      state.kinds = has ? state.kinds.filter((x) => x !== k) : [...state.kinds, k];
      b.classList.toggle("on", !has);
    });
  }
  function agencyHTML(sel) {
    return `<div class="opts">${AGENCY.map((a) => `
      <button class="opt row-opt ${sel === a.k ? "on" : ""}" data-agency="${a.k}"><div class="em">${a.em}</div><div style="flex:1"><b>${a.name}</b><small>${a.hint}</small></div><span class="tick">${ic("check")}</span></button>`).join("")}</div>`;
  }
  function bindAgency(root, state) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-agency]");
      if (!b) return;
      haptic.soft();
      state.agency = b.dataset.agency;
      $$("[data-agency]", root).forEach((x) => x.classList.toggle("on", x === b));
    });
  }

  function openFilters() {
    const f = structuredClone(st.filters);
    const s = sheet(`
      <h2>Фильтры</h2><p class="lead">Применяются к ленте. Можно сохранить их и для уведомлений.</p>
      <div class="group-title" style="margin:6px 0 8px">Бюджет с энергиями</div>
      <div class="card2" style="margin:0 0 6px">${budgetHTML(f.minTotal, f.maxTotal, "fb")}</div>
      <div class="group-title" style="margin:16px 0 8px">Что ищем</div>${kindsHTML(f.kinds)}
      <div class="group-title" style="margin:16px 0 8px">Кто сдаёт</div>${agencyHTML(f.agency)}
      <div class="group-title" style="margin:16px 0 8px">Районы и города</div>
      <button class="cell card2" style="margin:0" id="f-d"><span class="lbl">${f.districts.length ? esc(f.districts.map(districtName).join(", ")) : "Все районы и окрестности"}</span>${ic("chev").replace("<svg", '<svg class="chev"')}</button>
      <div class="group" style="margin:16px 0 0">
        ${switchCell("withPhone", "📞", "#12a46c", "Только с телефоном", "можно сразу позвонить", f.withPhone)}
        ${switchCell("withPhoto", "📷", "#7a5cff", "Только с фото", "", f.withPhoto)}
      </div>
      <div class="sheet-foot" style="flex-direction:column">
        <button class="btn block" id="f-apply">Показать</button>
        ${inTG ? `<button class="btn block ghost" id="f-save">${ic("bell")}Применить и сохранить для уведомлений</button>` : ""}
      </div>`);
    bindBudget(s, "fb", f);
    bindKinds(s, f);
    bindAgency(s, f);
    $$("input[data-sw]", s).forEach((i) => (i.onchange = () => (f[i.dataset.sw] = i.checked, haptic.soft())));
    $("#f-d", s).onclick = () => openDistricts(f.districts, (d) => {
      f.districts = d;
      $("#f-d .lbl", s).textContent = d.length ? d.map(districtName).join(", ") : "Все районы и окрестности";
    });
    const apply = () => {
      st.filters = { ...f, onlyNew: st.filters.onlyNew };
      closeLayer();
      refreshChips();
      loadFeed(true);
    };
    $("#f-apply", s).onclick = apply;
    const save = $("#f-save", s);
    if (save) save.onclick = async () => {
      apply();
      const { onlyNew, ...rest } = f;
      st.settings = { ...st.settings, ...rest };
      await saveSettings();
      toast("Уведомления будут приходить по этим фильтрам");
    };
  }
  function switchCell(key, em, color, title, sub, on) {
    return `<label class="cell"><span class="ic" style="background:${color}">${em}</span><span class="lbl">${title}${sub ? `<small>${sub}</small>` : ""}</span>
      <span class="switch"><input type="checkbox" data-sw="${key}" ${on ? "checked" : ""}><span></span></span></label>`;
  }

  function openDistricts(selected, onDone) {
    let sel = new Set(selected);
    const groups = [["ba", "Братислава"], ["okolie", "Окрестности"]];
    const s = sheet(`
      <h2>Районы и города</h2><p class="lead">Ничего не выбрано — ищем везде. В скобках — объявлений за 30 дней.</p>
      <label class="search" style="margin:0 0 4px">${ic("search")}<input id="dq" type="search" placeholder="Найти район"></label>
      <div class="dgroups">${groups.map(([g, name]) => `
        <h4>${name}<button data-all="${g}">выбрать все</button></h4>
        <div class="dchips">${st.districts.filter((d) => d.group === g).sort((a, b) => b.n - a.n).map((d) => `
          <button class="chip ${sel.has(d.key) ? "on" : ""}" data-d="${d.key}" data-name="${esc(d.name.toLowerCase())}">${esc(d.name)} <small>${d.n}</small></button>`).join("")}</div>`).join("")}
      </div>
      <div class="sheet-foot"><button class="btn plain" id="d-clear">Везде</button><button class="btn" style="flex:1" id="d-ok">Готово</button></div>`);
    const paint = () => $$("[data-d]", s).forEach((b) => b.classList.toggle("on", sel.has(b.dataset.d)));
    s.addEventListener("click", (e) => {
      const d = e.target.closest("[data-d]");
      const all = e.target.closest("[data-all]");
      if (d) {
        haptic.soft();
        sel.has(d.dataset.d) ? sel.delete(d.dataset.d) : sel.add(d.dataset.d);
        paint();
      } else if (all) {
        haptic.soft();
        const keys = st.districts.filter((x) => x.group === all.dataset.all).map((x) => x.key);
        const allOn = keys.every((k) => sel.has(k));
        keys.forEach((k) => (allOn ? sel.delete(k) : sel.add(k)));
        paint();
      }
    });
    $("#dq", s).oninput = (e) => {
      const q = e.target.value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
      $$("[data-d]", s).forEach((b) => (b.hidden = q && !b.dataset.name.normalize("NFD").replace(/\p{M}/gu, "").includes(q)));
    };
    $("#d-clear", s).onclick = () => {
      sel = new Set();
      paint();
    };
    $("#d-ok", s).onclick = () => {
      onDone([...sel]);
      closeLayer();
    };
  }

  // ---------------------------------------------------------------- карта (Leaflet)
  let leaflet, map, mapMarkers = [];
  function loadLeaflet() {
    if (leaflet) return leaflet;
    leaflet = new Promise((res, rej) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.append(css);
      const js = document.createElement("script");
      js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      js.onload = () => res(window.L);
      js.onerror = rej;
      document.head.append(js);
    });
    return leaflet;
  }
  const isDark = () => (tg ? tg.colorScheme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  function tiles(L, node) {
    node?.classList.toggle("dark-tiles", isDark());
    return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    });
  }
  function destroyMap() {
    map?.remove();
    map = null;
    $(".mapwrap")?.remove();
    $(".mapcard")?.remove();
  }
  async function renderMapView() {
    const feed = $("#feed");
    feed.innerHTML = "";
    $("#count").textContent = "Загружаю карту…";
    destroyMap();
    window.scrollTo(0, 0);
    const top = $("#feedtop").getBoundingClientRect().bottom;
    const wrap = el(`<div class="mapwrap" style="top:${top}px"><div id="map" style="height:100%"></div></div>`);
    document.body.append(wrap);
    try {
      const [L, r] = await Promise.all([loadLeaflet(), api("map", { filters: { ...st.filters, q: st.q } })]);
      if (st.view !== "map" || !document.body.contains(wrap)) return;
      map = L.map("map", { zoomControl: false, attributionControl: true }).setView(BA_CENTER, 12);
      tiles(L, $("#map")).addTo(map);
      mapMarkers = r.points.map((p) => {
        const m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: "", html: `<div class="mappin" data-k="${esc(p.key)}">${p.total != null ? fmt(p.total) + " €" : "?"}</div>`, iconSize: [0, 0] }),
        }).addTo(map);
        m.on("click", () => showMapCard(p.key));
        return m;
      });
      if (r.points.length) map.fitBounds(r.points.map((p) => [p.lat, p.lng]), { padding: [40, 40], maxZoom: 14 });
      $("#count").textContent = `${r.points.length} ${plural(r.points.length, "объявление", "объявления", "объявлений")} с точкой на карте`;
      map.on("click", () => $(".mapcard")?.remove());
    } catch {
      $("#count").textContent = "Карта не загрузилась";
    }
  }
  async function showMapCard(key) {
    haptic.tap();
    $$(".mappin.sel").forEach((x) => x.classList.remove("sel"));
    $(`.mappin[data-k="${CSS.escape(key)}"]`)?.classList.add("sel");
    $(".mapcard")?.remove();
    const c = el(`<div class="mapcard"><div class="card row"><div class="thumb sk"></div><div class="info"><div class="sk" style="height:18px;width:50%"></div></div></div></div>`);
    document.body.append(c);
    try {
      const r = await api("listing", { key });
      const it = { ...r.item, img: r.item.images?.[0], has_phone: r.item.phones?.length > 0, posted_at: r.item.posted_at };
      c.innerHTML = cardHTML(it, "list");
    } catch {
      c.remove();
    }
  }
  async function miniMap(node, lat, lng) {
    try {
      const L = await loadLeaflet();
      const m = L.map(node, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false })
        .setView([lat, lng], 15);
      tiles(L, node).addTo(m);
      L.circleMarker([lat, lng], { radius: 9, color: "#fff", weight: 3, fillColor: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2f6bff", fillOpacity: 1 }).addTo(m);
    } catch { /* без карты */ }
  }

  // ---------------------------------------------------------------- карточка объявления
  async function openListing(key) {
    const page = el(`<div class="page"><div style="aspect-ratio:4/3" class="sk"></div><div style="padding:20px 16px"><div class="sk" style="height:30px;width:40%"></div><div class="sk" style="height:18px;width:90%;margin-top:12px"></div><div class="sk" style="height:120px;margin-top:20px;border-radius:16px"></div></div></div>`);
    pushLayer(page, () => {
      page.classList.add("closing");
      if (location.hash) history.replaceState(null, "", location.pathname);
    });
    history.replaceState(null, "", `#l=${encodeURIComponent(key)}`);
    let r;
    try {
      r = await api("listing", { key });
    } catch {
      page.innerHTML = `<div class="empty" style="padding-top:120px"><div class="ico">🫥</div><h3>Объявление не найдено</h3>Возможно, его уже сняли.<br><br><button class="btn sm ghost" id="x">Назад</button></div>`;
      $("#x", page).onclick = closeLayer;
      return;
    }
    if (r.fav) st.favs.add(key);
    renderListing(page, r);
  }

  const TEMPLATE = (title) =>
    `Dobrý deň, píšem ohľadom inzerátu „${title}“. Mám vážny záujem o prenájom. ` +
    `Môžem sa nasťahovať ihneď a zálohu viem zaplatiť hneď pri podpise zmluvy. ` +
    `Kedy by bola možná obhliadka? Ďakujem a prajem pekný deň.`;

  function renderListing(page, r) {
    const it = r.item;
    const key = it.key;
    const fav = st.favs.has(key);
    const total = it.total ?? it.price;
    const imgs = (it.images ?? []).filter(Boolean);
    const dName = districtName(it.district);
    const perM2 = total && it.area ? Math.round(total / it.area) : null;
    const moveIn = it.price ? (it.deposit ?? it.price) + (total ?? it.price) + (it.commission ? it.price : 0) : null;

    // цена: разбивка
    const rows = [];
    if (it.price != null) rows.push(["Аренда", `${fmt(it.price)} €`]);
    if (it.utilities === "extra") rows.push(["Энергии", it.charges ? `${fmt(it.charges)} €` : "не указаны — уточнить"]);
    else if (it.utilities === "included") rows.push(["Энергии", "включены ✓"]);
    else rows.push(["Энергии", "не понятно — уточнить"]);
    if (it.deposit) rows.push(["Залог (кауция)", `${fmt(it.deposit)} €`]);
    rows.push(["Комиссия агентства", it.commission === true ? "есть (обычно 1 аренда)" : it.commission === false ? "нет ✓" : "неизвестно"]);
    if (perM2) rows.push(["Цена за м²", `${perM2} €`]);

    // сравнение с рынком
    let market = "";
    if (r.median && total) {
      const diff = Math.round((total / r.median - 1) * 100);
      const lo = Math.min(total, r.median) * 0.7, hi = Math.max(total, r.median) * 1.3;
      const pos = (v) => `${((v - lo) / (hi - lo)) * 100}%`;
      const scope = r.medianScope === "district" && dName ? `${KIND[it.kind]?.short.toLowerCase()} в районе ${dName}` : `${KIND[it.kind]?.short.toLowerCase()} по всему региону`;
      market = `<div class="market">
        <div style="font-size:14px">${diff <= -3 ? `<b style="color:var(--good)">На ${-diff}% дешевле</b>` : diff >= 3 ? `<b style="color:var(--warn)">На ${diff}% дороже</b>` : "<b>Около средней цены</b>"} медианы — ${fmt(r.median)} € (${esc(scope)}, ${r.medianN} ${plural(r.medianN, "объявление", "объявления", "объявлений")})</div>
        <div class="mtrack"><div class="mtick" style="left:${pos(r.median)}"><span>медиана ${fmt(r.median)}</span></div><div class="mdot" style="left:${pos(total)}"></div></div>
        <div class="mlabels"><span>дешевле</span><span>дороже</span></div></div>`;
    }

    const facts = [
      ["Тип", KIND[it.kind]?.name],
      ["Комнат", it.rooms ? String(it.rooms).replace(".", ",") : null],
      ["Площадь", it.area ? `${fmt(it.area)} м²` : null],
      ["Этаж", it.floor],
      ["Район", dName],
      ["Свободно с", it.availableFrom ? dateRu(it.availableFrom, { day: "numeric", month: "long" }) : null],
      ["Опубликовано", it.published ? dateRu(it.published, { day: "numeric", month: "long" }) : ago(it.posted_at)],
      ["Источник", SOURCES[it.source]],
    ].filter(([, v]) => v);

    const sellerKind = it.agency === true ? "Агентство недвижимости" : it.agency === false ? "Частное лицо" : "Тип продавца не указан";
    const initials = (it.seller || sellerKind).replace(/[^\p{L} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
    const contacts = `
      <div class="contact"><div class="avatar">${esc(initials)}</div><div class="who"><b>${esc(it.seller || "Контакт из объявления")}</b><small>${esc(sellerKind)}${it.commission ? " · есть комиссия" : ""}</small></div>
        ${it.agency === false ? '<span class="pill good">без комиссии</span>' : it.agency === true ? '<span class="pill">RK</span>' : ""}</div>
      ${(it.phones ?? []).map((p) => `
        <div class="contact"><div class="who"><b class="ph num">${esc(p.replace(/^\+(\d{3})(\d{3})(\d{3})(\d{3})$/, "+$1 $2 $3 $4"))}</b><small>телефон из объявления</small></div>
          <button class="round ghost" data-copy="${esc(p)}" aria-label="Скопировать номер">${ic("copy")}</button>
          <button class="round call" data-call="${esc(p)}" aria-label="Позвонить">${ic("phone")}</button></div>`).join("")}
      ${(it.emails ?? []).map((m) => `
        <div class="contact"><div class="who"><b style="font-size:15px">${esc(m)}</b><small>e-mail</small></div>
          <button class="icon-btn" data-copy="${esc(m)}">${ic("copy")}</button>
          <a class="btn sm ghost" href="mailto:${esc(m)}?subject=${encodeURIComponent(it.title)}&body=${encodeURIComponent(TEMPLATE(it.title))}">${ic("mail")}Написать</a></div>`).join("")}
      ${!(it.phones ?? []).length ? `<div class="contact"><div class="who"><small>${it.source === "bazos" ? "Bazoš показывает номер только после входа — откройте объявление на сайте и нажмите «zobraziť číslo»." : it.source === "bezrealitky" ? "На Bezrealitky написать владельцу можно через сайт после входа." : "Телефон в тексте не указан — свяжитесь через сайт."}</small></div></div>` : ""}
      <div style="display:grid;gap:8px;margin-top:8px">
        <button class="btn sm plain block" data-template>${ic("msg")}Скопировать сообщение продавцу (SK)</button>
        <button class="btn sm plain block" data-site>${ic("ext")}Открыть объявление на сайте</button>
      </div>`;

    page.innerHTML = `
      <div class="dtop"><button class="icon-btn" data-close aria-label="Назад">${ic("back")}</button>
        <div class="right"><button class="icon-btn" data-share aria-label="Поделиться">${ic("share")}</button>
        <button class="icon-btn ${fav ? "on" : ""}" data-fav="${esc(key)}" aria-label="В избранное">${ic("heart", fav)}</button></div></div>
      <div class="gwrap">
        <div class="gallery" id="gal">${imgs.length ? imgs.map((u, i) => `<img src="${esc(u)}" alt="Фото ${i + 1}" ${i > 1 ? 'loading="lazy"' : ""} referrerpolicy="no-referrer" onerror="this.remove()">`).join("") : `<div style="width:100%;display:grid;place-items:center;font-size:80px;opacity:.4">${KIND[it.kind]?.em ?? "🏠"}</div>`}</div>
        ${imgs.length > 1 ? `<span class="gcount" id="gc">1 / ${imgs.length}</span>` : ""}
      </div>
      <div class="dsheet">
        <div class="dhead">
          <div class="dprice num"><b>${total != null ? fmt(total) + " €" : "Договорная"}</b><span>в месяц${it.utilities === "included" || (it.utilities === "extra" && it.charges) ? " с энергиями" : ""}</span></div>
          <div class="dtitle">${esc(it.title)}</div>
          <div class="meta">${[dName, it.address && it.address !== dName ? it.address : null].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("")}</div>
          <div class="pills">${pillsHTML({ ...it, has_phone: (it.phones ?? []).length > 0, deal: r.median && total ? Math.round((total / r.median - 1) * 100) : null })}
            ${(it.tags ?? []).map((t) => `<span class="pill">${esc(t)}</span>`).join("")}</div>
        </div>

        <div class="card2"><h3>💶 Цена</h3>${rows.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>`).join("")}
          ${total != null ? `<div class="kv total"><span>Итого в месяц</span><b>${fmt(total)} €</b></div>` : ""}
          ${moveIn ? `<div class="kv"><span>Нужно на заезд ≈</span><b>${fmt(moveIn)} €</b></div><div class="legend-note">залог + первый месяц${it.commission ? " + комиссия (≈ 1 аренда)" : ""}</div>` : ""}
          ${market}</div>

        <div class="card2"><h3>📇 Контакты</h3>${contacts}</div>

        <div class="card2"><h3>🏷️ Параметры</h3><div class="facts">${facts.map(([k, v]) => `<div class="fact"><small>${k}</small><b>${esc(v)}</b></div>`).join("")}</div></div>

        ${it.text ? `<div class="card2"><h3>📝 Описание <button class="sort" style="margin-left:auto;font-size:13px" data-tr>${ic("translate")}Перевести</button></h3>
          <div class="desc ${it.text.length > 420 ? "clamp" : ""}" id="desc">${esc(it.text)}</div>
          ${it.text.length > 420 ? `<button class="sort" style="margin-top:8px" data-more>Показать полностью ${ic("down")}</button>` : ""}</div>` : ""}

        ${it.lat ? `<div class="card2"><h3>📍 На карте</h3><div class="muted" style="font-size:13.5px">${esc(it.address || dName || "")}</div><div class="minimap" id="mm"></div>
          <button class="sort" style="margin-top:10px" data-gmaps>${ic("ext")}Открыть в Google Maps</button></div>` : ""}

        ${r.reminders?.length ? `<div class="card2"><h3>⏰ Напоминания</h3>${r.reminders.map((x) => `<div class="kv"><span>${esc(x.note || "Напоминание")}</span><b>${x.sent ? "отправлено" : esc(dayLabel(x.remind_at) + ", " + timeRu(x.remind_at))}</b></div>`).join("")}</div>` : ""}

        ${r.similar?.length ? `<div class="group-title" style="margin:20px 32px 10px">Похожие рядом</div><div class="hscroll">${r.similar.map((s) => cardHTML(s, "cards")).join("")}</div>` : ""}

        <div style="padding:16px 16px 0"><button class="btn sm plain block" data-hide>${ic("eyeoff")}Скрыть это объявление из ленты</button></div>
      </div>
      <div class="actionbar">
        <button class="btn sq ${fav ? "" : "plain"}" data-fav="${esc(key)}" aria-label="В избранное">${ic("heart", fav)}</button>
        <button class="btn plain" data-remind>${ic("clock")}Напомнить</button>
        ${(it.phones ?? []).length ? `<button class="btn good" data-call="${esc(it.phones[0])}">${ic("phone")}Позвонить</button>` : `<button class="btn" data-site>${ic("ext")}Открыть сайт</button>`}
      </div>`;

    const gal = $("#gal", page);
    if (gal && imgs.length > 1) {
      gal.addEventListener("scroll", () => {
        const i = Math.round(gal.scrollLeft / gal.clientWidth) + 1;
        const gc = $("#gc", page);
        if (gc) gc.textContent = `${i} / ${gal.children.length}`;
      }, { passive: true });
    }
    if (it.lat) miniMap($("#mm", page), it.lat, it.lng);

    page.onclick = (e) => {
      const t = e.target.closest("button, a");
      if (!t) return;
      if (t.dataset.close != null) closeLayer();
      else if (t.dataset.call) call(t.dataset.call);
      else if (t.dataset.copy) copy(t.dataset.copy, "Скопировано: " + t.dataset.copy);
      else if (t.dataset.template != null) copy(TEMPLATE(it.title), "Текст на словацком скопирован — вставьте в сообщение");
      else if (t.dataset.site != null) openLink(it.url);
      else if (t.dataset.gmaps != null) openLink(`https://www.google.com/maps/search/?api=1&query=${it.lat},${it.lng}`);
      else if (t.dataset.tr != null) openLink(`https://translate.google.com/?sl=sk&tl=ru&op=translate&text=${encodeURIComponent(it.text.slice(0, 4500))}`);
      else if (t.dataset.more != null) {
        $("#desc", page).classList.remove("clamp");
        t.remove();
      } else if (t.dataset.remind != null) openRemind(key, it.title);
      else if (t.dataset.share != null) share(it);
      else if (t.dataset.hide != null) hideListing(key);
      else if (t.dataset.fav) {
        const on = st.favs.has(key);
        $$("[data-fav].btn", page).forEach((b) => b.classList.toggle("plain", on));
      }
    };
  }

  function share(it) {
    const link = `https://t.me/share/url?url=${encodeURIComponent(it.url)}&text=${encodeURIComponent(`${it.title} — ${fmt(it.total ?? it.price)} €/мес`)}`;
    haptic.tap();
    if (tg) tg.openTelegramLink(link);
    else window.open(link, "_blank");
  }
  async function hideListing(key) {
    if (needAuth()) return;
    await api("hide", { key });
    haptic.ok();
    closeLayer();
    $$(`[data-open="${CSS.escape(key)}"]`).forEach((c) => c.remove());
    st.feed.items = st.feed.items.filter((i) => i.key !== key);
    toast("Скрыто — больше не покажем");
  }

  // ---------------------------------------------------------------- напоминания
  function presets() {
    const now = new Date();
    const at = (h, m = 0, addDays = 0) => {
      // время по Братиславе: считаем через смещение локальной зоны
      const d = new Date(now);
      d.setDate(d.getDate() + addDays);
      const local = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Bratislava" }));
      const diff = d - local;
      local.setHours(h, m, 0, 0);
      return new Date(+local + diff);
    };
    const evening = at(19);
    const list = [
      { name: "Через 30 минут", at: new Date(+now + 30 * 60000) },
      { name: "Через 1 час", at: new Date(+now + 60 * 60000) },
      { name: "Через 3 часа", at: new Date(+now + 3 * 3600000) },
      evening - now > 30 * 60000 ? { name: "Сегодня вечером", at: evening } : { name: "Завтра вечером", at: at(19, 0, 1) },
      { name: "Завтра утром", at: at(9, 0, 1) },
      { name: "Через 2 дня", at: at(10, 0, 2) },
    ];
    return list.map((p) => ({ ...p, hint: `${dayLabel(p.at).toLowerCase()}, ${timeRu(p.at)}` }));
  }
  function openRemind(key, title) {
    if (needAuth()) return;
    const ps = presets();
    let chosen = ps[1].at;
    const s = sheet(`
      <h2>⏰ Напомнить</h2><p class="lead">${title ? `Бот пришлёт это объявление в чат в выбранное время.` : "Бот пришлёт сообщение в чат в выбранное время."}</p>
      ${title ? `<div class="card2" style="margin:0 0 14px;font-size:14px">${esc(title)}</div>` : ""}
      <div class="presets">${ps.map((p, i) => `<button class="preset ${i === 1 ? "on" : ""}" data-i="${i}"><b>${p.name}</b><small>${esc(p.hint)}</small></button>`).join("")}</div>
      <label class="cell card2" style="margin:0 0 12px;gap:10px"><span class="lbl">Своё время</span><input type="datetime-local" id="r-dt" style="width:auto"></label>
      <textarea id="r-note" maxlength="300" placeholder="Заметка: например «позвонить хозяину после 17:00»"></textarea>
      <div class="dchips" style="margin-top:8px">${["Позвонить", "Посмотреть квартиру", "Отправить документы", "Ответить на сообщение"].map((t) => `<button class="chip" data-note="${t}">${t}</button>`).join("")}</div>
      <div class="sheet-foot"><button class="btn block" id="r-save">${ic("bell")}Напомнить ${esc(ps[1].hint)}</button></div>`);
    const btn = $("#r-save", s);
    const setChosen = (d) => {
      chosen = d;
      btn.innerHTML = `${ic("bell")}Напомнить ${esc(dayLabel(d).toLowerCase())}, ${esc(timeRu(d))}`;
    };
    s.addEventListener("click", (e) => {
      const p = e.target.closest("[data-i]");
      const n = e.target.closest("[data-note]");
      if (p) {
        haptic.soft();
        $$("[data-i]", s).forEach((x) => x.classList.toggle("on", x === p));
        $("#r-dt", s).value = "";
        setChosen(ps[+p.dataset.i].at);
      } else if (n) {
        haptic.soft();
        $("#r-note", s).value = n.dataset.note;
      }
    });
    $("#r-dt", s).onchange = (e) => {
      const d = new Date(e.target.value);
      if (isNaN(d)) return;
      $$("[data-i]", s).forEach((x) => x.classList.remove("on"));
      setChosen(d);
    };
    btn.onclick = async () => {
      if (chosen < Date.now()) return toast("Это время уже прошло");
      btn.disabled = true;
      try {
        await api("remind", { key, at: chosen.toISOString(), note: $("#r-note", s).value.trim() });
        haptic.ok();
        if (st.me) st.me.counts.reminders = (st.me.counts.reminders ?? 0) + 1;
        updateTabBadges();
        closeLayer();
        toast(`Напомню ${dayLabel(chosen).toLowerCase()} в ${timeRu(chosen)}`);
        if (st.tab === "rem") renderReminders();
      } catch {
        btn.disabled = false;
        toast("Не получилось сохранить напоминание");
      }
    };
  }

  async function renderReminders(filter = store.get("remFilter", "up")) {
    const scr = $("#screen");
    scr.innerHTML = `
      <header class="top"><div class="top-row"><h1 class="title">Напоминания</h1>
        <button class="btn sm" id="r-new">${ic("plus")}Новое</button></div>
        <div class="seg wide" style="margin-top:12px" id="r-f">
          <button data-f="up" class="${filter === "up" ? "on" : ""}">Предстоящие</button>
          <button data-f="done" class="${filter === "done" ? "on" : ""}">Прошедшие</button>
          <button data-f="all" class="${filter === "all" ? "on" : ""}">Все</button></div></header>
      <div id="r-list"><div class="group"><div class="rem"><div class="when sk" style="height:48px"></div><div class="what"><div class="sk" style="height:16px;width:70%"></div></div></div></div></div>`;
    $("#r-new").onclick = () => openRemind(null, null);
    $("#r-f").onclick = (e) => {
      const b = e.target.closest("[data-f]");
      if (!b) return;
      haptic.soft();
      store.set("remFilter", b.dataset.f);
      renderReminders(b.dataset.f);
    };
    if (!inTG) {
      $("#r-list").innerHTML = `<div class="empty"><div class="ico">⏰</div><h3>Напоминания живут в боте</h3>Откройте приложение через Telegram-бота — тогда бот сможет написать вам в нужное время.</div>`;
      return;
    }
    let items;
    try {
      items = (await api("reminders")).items;
    } catch {
      $("#r-list").innerHTML = `<div class="empty"><div class="ico">📡</div><h3>Нет связи</h3></div>`;
      return;
    }
    if (st.me) st.me.counts.reminders = items.filter((i) => !i.sent).length;
    updateTabBadges();
    const shown = items.filter((i) => (filter === "up" ? !i.sent : filter === "done" ? i.sent : true));
    if (!shown.length) {
      $("#r-list").innerHTML = `<div class="empty"><div class="ico">${filter === "done" ? "📭" : "🔔"}</div><h3>${filter === "done" ? "Пока пусто" : "Нет напоминаний"}</h3>
        Откройте любое объявление и нажмите «Напомнить» — бот пришлёт его в нужное время, чтобы вы не забыли позвонить или сходить на просмотр.</div>`;
      return;
    }
    const groups = new Map();
    for (const i of shown) {
      const k = dayLabel(i.remind_at);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    }
    $("#r-list").innerHTML = [...groups].map(([day, list]) => `
      <div class="daylabel">${esc(day)}</div>
      <div class="group">${list.map((i) => `
        <div class="rem ${i.sent ? "done" : ""}">
          <div class="when"><b>${esc(timeRu(i.remind_at))}</b><small>${i.sent ? "готово" : esc(untilText(i.remind_at).replace("через ", ""))}</small></div>
          <div class="what"><b>${esc(i.note || (i.key ? "Посмотреть объявление" : "Напоминание"))}</b>
            ${i.key ? `<button class="lst" data-open="${esc(i.key)}" style="width:100%;text-align:left">${i.img ? `<img src="${esc(i.img)}" alt="" referrerpolicy="no-referrer">` : ""}<span><b class="num">${i.total != null ? fmt(i.total) + " €" : ""}</b> ${esc(i.title ?? "")}</span></button>` : ""}
          </div>
          <button class="icon-btn" data-del="${i.id}" aria-label="Удалить" style="box-shadow:none;background:none;color:var(--hint)">${ic("trash")}</button>
        </div>`).join("")}</div>`).join("");
    $("#r-list").onclick = async (e) => {
      const d = e.target.closest("[data-del]");
      if (!d) return;
      haptic.tap();
      await api("remind_del", { id: d.dataset.del });
      d.closest(".rem").remove();
      toast("Напоминание удалено");
      if (st.me) st.me.counts.reminders = Math.max(0, (st.me.counts.reminders ?? 1) - 1);
      updateTabBadges();
    };
  }

  // ---------------------------------------------------------------- избранное
  async function renderFavs() {
    const scr = $("#screen");
    scr.innerHTML = `<header class="top"><div class="top-row"><h1 class="title">Избранное</h1></div><div class="subtitle" id="fav-sub">&nbsp;</div></header>
      <div id="fav-list" class="feed list">${skeletons("list")}</div>`;
    let items = [];
    try {
      if (inTG) items = (await api("favorites")).items;
      else {
        // вне Telegram — подтягиваем по ключам из localStorage
        const keys = [...st.favs].slice(0, 30);
        items = (await Promise.all(keys.map((k) => api("listing", { key: k }).catch(() => null)))).filter(Boolean)
          .map((r) => ({ ...r.item, img: r.item.images?.[0], has_phone: r.item.phones?.length > 0 }));
      }
    } catch {
      $("#fav-list").innerHTML = `<div class="empty"><div class="ico">📡</div><h3>Нет связи</h3></div>`;
      return;
    }
    st.favs = new Set(items.map((i) => i.key));
    store.set("favs", [...st.favs]);
    $("#fav-sub").textContent = items.length ? `${items.length} ${plural(items.length, "объявление", "объявления", "объявлений")}` : "";
    $("#fav-list").innerHTML = items.length
      ? items.map((i) => cardHTML(i, "list")).join("")
      : `<div class="empty"><div class="ico">💛</div><h3>Здесь будут понравившиеся</h3>Нажмите ♡ на карточке, чтобы сохранить объявление и вернуться к нему позже — например, после звонка.</div>`;
  }

  // ---------------------------------------------------------------- рынок
  async function renderMarket() {
    const scr = $("#screen");
    scr.innerHTML = `<header class="top"><div class="top-row"><h1 class="title">Рынок аренды</h1></div><div class="subtitle">Братислава и окрестности · последние 30 дней</div></header>
      <div class="stats">${'<div class="stat"><div class="sk" style="height:46px"></div></div>'.repeat(4)}</div>`;
    let s;
    try {
      s = await api("stats");
    } catch {
      scr.insertAdjacentHTML("beforeend", `<div class="empty"><div class="ico">📡</div><h3>Нет связи</h3></div>`);
      return;
    }
    const T = s.totals ?? {};
    const kindStats = Object.fromEntries((s.byKind ?? []).map((k) => [k.kind, k]));
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const maxD = Math.max(...(s.byDistrict ?? []).map((d) => +d.median), 1);
    const maxDay = Math.max(...(s.perDay ?? []).map((d) => d.n), 1);
    const maxSrc = Math.max(...(s.bySource ?? []).map((d) => d.n), 1);
    const cheapest = (s.byDistrict ?? [])[0];
    const budget = st.settings?.maxTotal ?? 650;
    const okDistricts = (s.byDistrict ?? []).filter((d) => d.median <= budget).length;

    scr.innerHTML = `<header class="top"><div class="top-row"><h1 class="title">Рынок аренды</h1></div><div class="subtitle">Братислава и окрестности · последние 30 дней</div></header>
      <div class="stats">
        <div class="stat"><small>Объявлений</small><b>${fmt(T.total)}</b><span>за 30 дней</span></div>
        <div class="stat"><small>Новых</small><b>${fmt(T.new24)}</b><span>за последние 24 ч</span></div>
        <div class="stat"><small>Без агентства</small><b>${pct(T.private, T.total)}%</b><span>${fmt(T.private)} объявлений</span></div>
        <div class="stat"><small>С телефоном</small><b>${pct(T.with_phone, T.total)}%</b><span>можно сразу звонить</span></div>
      </div>

      <div class="group-title">Медиана с энергиями</div>
      <div class="stats">${KINDS.filter((k) => kindStats[k.k]).map((k) => `
        <div class="stat"><small>${k.em} ${k.name}</small><b>${fmt(kindStats[k.k].median)} €</b><span>от ${fmt(kindStats[k.k].min)} € · ${kindStats[k.k].n} шт.</span></div>`).join("")}</div>

      ${cheapest ? `<div class="card2" style="margin-top:14px"><h3>💡 Подсказка</h3><div style="font-size:14.5px">Дешевле всего студии и квартиры в районе <b>${esc(districtName(cheapest.district) ?? "—")}</b> — медиана ${fmt(cheapest.median)} €. В ваш бюджет ${fmt(budget)} € медиана укладывается в ${okDistricts} ${plural(okDistricts, "районе", "районах", "районах")} из ${(s.byDistrict ?? []).length}.</div></div>` : ""}

      <div class="group-title">Студии и квартиры: медиана по районам</div>
      <div class="card2"><div class="hbars" id="hb">${(s.byDistrict ?? []).map((d) => `
        <button class="hbar" data-d="${esc(d.district ?? "")}" title="${esc(`${districtName(d.district) ?? "Не определён"}: ${fmt(d.median)} €, ${d.n} объявлений`)}">
          <span class="nm">${esc(districtName(d.district) ?? "Не определён")}</span>
          <span class="tr"><i style="width:${(d.median / maxD) * 100}%"></i></span><span class="v">${fmt(d.median)} €</span></button>`).join("")}</div>
        <div class="legend-note">Нажмите на район, чтобы открыть его объявления. Только районы с 3+ объявлениями.</div></div>

      <div class="group-title">Новые объявления по дням</div>
      <div class="card2"><div class="vbars">${(s.perDay ?? []).map((d, i, a) => `
        <div class="vb" title="${esc(dateRu(d.day, { day: "numeric", month: "long" }))}: ${d.n}">${i === a.length - 1 || (d.n === maxDay && i < a.length - 2) ? `<span class="tip num">${d.n}</span>` : ""}<i style="height:${(d.n / maxDay) * 100}%"></i><span>${new Date(d.day).getDate()}</span></div>`).join("")}</div>
        <div class="legend-note">Подписаны максимум и сегодняшний день. Нажмите и удерживайте столбик, чтобы увидеть число.</div></div>

      <div class="group-title">Откуда объявления</div>
      <div class="card2"><div class="hbars">${(s.bySource ?? []).map((d) => `
        <div class="hbar"><span class="nm">${esc(SOURCES[d.source] ?? d.source)}</span><span class="tr"><i style="width:${(d.n / maxSrc) * 100}%"></i></span><span class="v">${fmt(d.n)}</span></div>`).join("")}</div></div>
      <div style="height:12px"></div>`;
    $("#hb").onclick = (e) => {
      const b = e.target.closest("[data-d]");
      if (!b || !b.dataset.d) return;
      haptic.tap();
      st.filters.districts = [b.dataset.d];
      st.filters.kinds = ["studio", "flat"];
      go("feed");
    };
  }

  // ---------------------------------------------------------------- настройки
  async function saveSettings(onboarded = false) {
    store.set("settings", st.settings);
    if (!inTG) return;
    try {
      const r = await api("settings", { settings: st.settings, onboarded });
      st.settings = r.settings;
      if (st.me) st.me.onboarded = st.me.onboarded || onboarded;
    } catch {
      toast("Не получилось сохранить на сервере");
    }
  }

  function renderSettings() {
    const s = structuredClone(st.settings);
    const n = s.notify;
    const name = st.me?.name || tg?.initDataUnsafe?.user?.first_name || "Гость";
    const scr = $("#screen");
    const modeHint = { instant: "каждое новое объявление — сразу", digest: "подборкой в выбранное время", off: "уведомления выключены" };
    scr.innerHTML = `
      <header class="top"><div class="top-row"><h1 class="title">Настройки</h1></div></header>
      <div class="group"><div class="cell"><div class="avatar">${esc(name[0] ?? "?")}</div><div class="lbl"><b>${esc(name)}</b><small>${inTG ? (n.mode === "off" ? "Уведомления выключены" : "Уведомления включены · " + modeHint[n.mode]) : "Режим просмотра — откройте через бота"}</small></div></div></div>

      <div class="group-title">Что присылать</div>
      <div class="group-note">Эти фильтры работают и для уведомлений бота, и для ленты по умолчанию.</div>
      <div class="group"><div class="cell col">${kindsHTML(s.kinds)}</div></div>
      <div class="group"><div class="cell col"><span class="muted" style="font-size:13px">Бюджет с энергиями</span>${budgetHTML(s.minTotal, s.maxTotal, "sb")}</div></div>
      <div class="group">
        <button class="cell" id="s-d"><span class="ic" style="background:#ff8a3d">📍</span><span class="lbl">Районы и города<small id="s-dl">${s.districts.length ? esc(s.districts.map(districtName).join(", ")) : "везде"}</small></span>${ic("chev").replace("<svg", '<svg class="chev"')}</button>
        ${switchCell("withPhone", "📞", "#12a46c", "Только с телефоном", "", s.withPhone)}
        ${switchCell("withPhoto", "📷", "#7a5cff", "Только с фото", "", s.withPhoto)}
      </div>
      <div class="group"><div class="cell col">${agencyHTML(s.agency)}</div></div>

      <div class="group-title">Уведомления</div>
      <div class="group"><div class="cell col">
        <div class="seg wide" id="s-mode">${[["instant", "⚡ Сразу"], ["digest", "📬 Подборкой"], ["off", "🔕 Выкл"]].map(([k, t]) => `<button data-m="${k}" class="${n.mode === k ? "on" : ""}">${t}</button>`).join("")}</div>
        <small class="muted" id="s-mh" style="margin-top:8px">${modeHint[n.mode]}</small></div>
        <div class="cell col" id="s-times" ${n.mode === "digest" ? "" : "hidden"}><span>Время подборок</span>
          <div class="dchips" style="margin-top:8px" id="s-tl"></div>
          <div style="display:flex;gap:8px;margin-top:10px"><input type="time" id="s-tnew" value="21:00"><button class="btn sm ghost" id="s-tadd">${ic("plus")}Добавить</button></div></div>
        ${switchCell("quiet", "🌙", "#5856d6", "Тихие часы", "ночью не беспокоить — пришлю утром одной подборкой", n.quiet.on)}
        <div class="cell" id="s-q" ${n.quiet.on ? "" : "hidden"}><span class="lbl">С</span><input type="time" id="s-qf" value="${n.quiet.from}" style="width:auto"><span class="lbl" style="flex:none">до</span><input type="time" id="s-qt" value="${n.quiet.to}" style="width:auto"></div>
        <button class="cell" id="s-test"><span class="ic" style="background:#2f6bff">🔔</span><span class="lbl">Отправить тестовое уведомление</span></button>
      </div>

      <div class="group-title">Прочее</div>
      <div class="group">
        <button class="cell" id="s-onb"><span class="ic" style="background:#12a46c">✨</span><span class="lbl">Пройти настройку заново</span>${ic("chev").replace("<svg", '<svg class="chev"')}</button>
        <div class="cell"><span class="ic" style="background:#8a90a2">ℹ️</span><span class="lbl">Источники<small>bazos.sk, nehnutelnosti.sk (+ reality.sk, byty.sk), topreality.sk, bezrealitky.sk · проверка каждые 10 минут</small></span></div>
      </div>
      <div style="padding:6px 16px 16px"><button class="btn block" id="s-save">${ic("check")}Сохранить</button></div>`;

    const root = scr;
    bindKinds(root, s);
    bindBudget(root, "sb", s);
    bindAgency(root, s);
    $$("input[data-sw]", root).forEach((i) => (i.onchange = () => {
      haptic.soft();
      if (i.dataset.sw === "quiet") {
        n.quiet.on = i.checked;
        $("#s-q").hidden = !i.checked;
      } else s[i.dataset.sw] = i.checked;
    }));
    $("#s-d").onclick = () => openDistricts(s.districts, (d) => {
      s.districts = d;
      $("#s-dl").textContent = d.length ? d.map(districtName).join(", ") : "везде";
    });
    $("#s-mode").onclick = (e) => {
      const b = e.target.closest("[data-m]");
      if (!b) return;
      haptic.soft();
      n.mode = b.dataset.m;
      $$("#s-mode button").forEach((x) => x.classList.toggle("on", x === b));
      $("#s-mh").textContent = modeHint[n.mode];
      $("#s-times").hidden = n.mode !== "digest";
    };
    const paintTimes = () => {
      n.digestTimes.sort();
      $("#s-tl").innerHTML = n.digestTimes.map((t) => `<button class="chip on" data-t="${t}">${t} <span class="x">${ic("x")}</span></button>`).join("");
    };
    paintTimes();
    $("#s-tl").onclick = (e) => {
      const b = e.target.closest("[data-t]");
      if (!b) return;
      if (n.digestTimes.length === 1) return toast("Нужно хотя бы одно время");
      n.digestTimes = n.digestTimes.filter((t) => t !== b.dataset.t);
      haptic.soft();
      paintTimes();
    };
    $("#s-tadd").onclick = () => {
      const v = $("#s-tnew").value;
      if (!v || n.digestTimes.includes(v)) return;
      if (n.digestTimes.length >= 6) return toast("Максимум 6 подборок в день");
      n.digestTimes.push(v);
      haptic.soft();
      paintTimes();
    };
    $("#s-qf").onchange = (e) => (n.quiet.from = e.target.value);
    $("#s-qt").onchange = (e) => (n.quiet.to = e.target.value);
    $("#s-test").onclick = async () => {
      if (needAuth()) return;
      try {
        await api("notify_test");
        haptic.ok();
        toast("Отправил — проверьте чат с ботом");
      } catch {
        toast("Не получилось. Нажмите «Старт» в чате с ботом");
      }
    };
    $("#s-onb").onclick = () => onboarding(true);
    $("#s-save").onclick = async () => {
      st.settings = s;
      st.filters = filtersFrom(s);
      await saveSettings();
      haptic.ok();
      toast(inTG ? "Сохранено ✓" : "Сохранено на этом устройстве");
    };
  }

  // ---------------------------------------------------------------- онбординг
  function onboarding(again = false) {
    const s = structuredClone(st.settings);
    let step = 0, dir = 1;
    const ov = el(`<div class="onb"><div class="onb-top"><div class="onb-progress"><i></i></div><button class="onb-skip">Пропустить</button></div>
      <div class="onb-body"></div><div class="onb-foot"></div></div>`);
    $("#layer").append(ov);
    const steps = [
      {
        html: () => `
          <div class="hero"><i></i><i></i><i></i><span class="big">🏠</span><span class="floaty" style="left:22px;top:20px">🔑</span><span class="floaty" style="right:24px;bottom:22px;animation-delay:-2s">📍</span></div>
          <h1>Найдём жильё в Братиславе быстрее остальных</h1>
          <p class="lead">Я слежу за сайтами с арендой и присылаю новые объявления, пока их не разобрали.</p>
          <div class="features">
            <div class="feature"><span class="fi">⚡</span><div><b>Каждые 10 минут</b><span>bazos, nehnutelnosti (+reality, byty), topreality, bezrealitky</span></div></div>
            <div class="feature"><span class="fi">📞</span><div><b>Звонок в один тап</b><span>телефоны и контакты прямо из описания</span></div></div>
            <div class="feature"><span class="fi">💶</span><div><b>Честная цена</b><span>с энергиями, залогом, комиссией и сравнением с рынком</span></div></div>
            <div class="feature"><span class="fi">⏰</span><div><b>Напоминания</b><span>не забудете перезвонить или сходить на просмотр</span></div></div>
          </div>`,
        next: "Начать",
      },
      {
        html: () => `<h1>Что ищем?</h1><p class="lead">Можно выбрать несколько вариантов.</p>${kindsHTML(s.kinds)}`,
        bind: (r) => bindKinds(r, s),
      },
      {
        html: () => `<h1>Какой бюджет?</h1><p class="lead">Считаю цену <b>вместе с энергиями</b>, если они указаны в объявлении.</p>
          <div class="card2" style="margin:0;padding:20px 16px">${budgetHTML(s.minTotal, s.maxTotal, "ob")}</div>
          <div class="dchips" style="margin-top:14px">${[400, 500, 650, 800].map((v) => `<button class="chip" data-quick="${v}">до ${v} €</button>`).join("")}</div>`,
        bind: (r) => {
          bindBudget(r, "ob", s);
          r.addEventListener("click", (e) => {
            const b = e.target.closest("[data-quick]");
            if (!b) return;
            haptic.soft();
            $$("#ob-range input", r)[1].value = b.dataset.quick;
            $$("#ob-range input", r)[1].dispatchEvent(new Event("input"));
          });
        },
      },
      {
        html: () => `<h1>Где искать?</h1><p class="lead">Ничего не выбрано — ищу по всей Братиславе и окрестностям.</p>
          <div class="dgroups">${[["ba", "Братислава"], ["okolie", "Окрестности · с машиной или поездом"]].map(([g, nm]) => `
            <h4>${nm}<button data-all="${g}">все</button></h4><div class="dchips">${st.districts.filter((d) => d.group === g).sort((a, b) => b.n - a.n).map((d) => `
            <button class="chip ${s.districts.includes(d.key) ? "on" : ""}" data-d="${d.key}">${esc(d.name)} <small>${d.n}</small></button>`).join("")}</div>`).join("")}</div>`,
        bind: (r) => r.addEventListener("click", (e) => {
          const d = e.target.closest("[data-d]");
          const all = e.target.closest("[data-all]");
          if (d) {
            haptic.soft();
            s.districts = s.districts.includes(d.dataset.d) ? s.districts.filter((x) => x !== d.dataset.d) : [...s.districts, d.dataset.d];
          } else if (all) {
            const keys = st.districts.filter((x) => x.group === all.dataset.all).map((x) => x.key);
            const on = keys.every((k) => s.districts.includes(k));
            s.districts = on ? s.districts.filter((k) => !keys.includes(k)) : [...new Set([...s.districts, ...keys])];
          } else return;
          $$("[data-d]", r).forEach((b) => b.classList.toggle("on", s.districts.includes(b.dataset.d)));
        }),
      },
      {
        html: () => `<h1>С агентством или без?</h1><p class="lead">Агентства обычно берут комиссию — около одной месячной аренды. Частники — нет, но их объявления разбирают быстрее.</p>${agencyHTML(s.agency)}`,
        bind: (r) => bindAgency(r, s),
      },
      {
        html: () => `<h1>Как присылать?</h1><p class="lead">Новые объявления приходят в чат с ботом.</p>
          <div class="opts">${[["instant", "⚡", "Сразу", "каждое новое объявление в течение 10 минут — лучший вариант, когда жильё нужно срочно"], ["digest", "📬", "Подборкой", "2–3 раза в день в удобное время"], ["off", "🔕", "Не присылать", "буду смотреть сам в приложении"]].map(([k, em, t, h]) => `
            <button class="opt row-opt ${s.notify.mode === k ? "on" : ""}" data-m="${k}"><div class="em">${em}</div><div style="flex:1"><b>${t}</b><small>${h}</small></div><span class="tick">${ic("check")}</span></button>`).join("")}</div>
          <div class="group" style="margin:16px 0 0">${switchCell("quiet", "🌙", "#5856d6", "Тихие часы 23:00–07:00", "ночью не беспокоить", s.notify.quiet.on)}</div>`,
        bind: (r) => {
          r.addEventListener("click", (e) => {
            const b = e.target.closest("[data-m]");
            if (!b) return;
            haptic.soft();
            s.notify.mode = b.dataset.m;
            $$("[data-m]", r).forEach((x) => x.classList.toggle("on", x === b));
          });
          $("input[data-sw=quiet]", r).onchange = (e) => (s.notify.quiet.on = e.target.checked);
        },
      },
      {
        html: () => `<div class="hero" style="height:150px"><i></i><i></i><i></i><span class="big" style="font-size:70px">🎉</span></div>
          <div class="big-count"><b class="num" id="ob-count">…</b><span class="muted">подходящих объявлений прямо сейчас</span></div>
          <div class="summary">
            <div class="kv" style="padding:10px 16px"><span>Ищем</span><b>${esc(s.kinds.length === 4 ? "любое жильё" : s.kinds.map((k) => KIND[k].short).join(", "))}</b></div>
            <div class="kv" style="padding:10px 16px"><span>Бюджет</span><b>${s.minTotal ? fmt(s.minTotal) + "–" : "до "}${fmt(s.maxTotal)} €</b></div>
            <div class="kv" style="padding:10px 16px"><span>Где</span><b>${s.districts.length ? `${s.districts.length} ${plural(s.districts.length, "район", "района", "районов")}` : "везде"}</b></div>
            <div class="kv" style="padding:10px 16px"><span>Агентства</span><b>${AGENCY.find((a) => a.k === s.agency).name}</b></div>
            <div class="kv" style="padding:10px 16px"><span>Уведомления</span><b>${{ instant: "сразу", digest: "подборкой", off: "выключены" }[s.notify.mode]}</b></div>
          </div>`,
        bind: async () => {
          try {
            const r = await api("feed", { filters: filtersFrom(s), limit: 1 });
            $("#ob-count").textContent = fmt(r.total);
          } catch {
            $("#ob-count").textContent = "—";
          }
        },
        next: "Смотреть объявления",
      },
    ];
    const finish = async () => {
      st.settings = s;
      st.filters = filtersFrom(s);
      store.set("onboarded", true);
      haptic.ok();
      ov.classList.add("closing");
      ov.style.transition = "opacity .25s";
      ov.style.opacity = "0";
      setTimeout(() => ov.remove(), 250);
      tg?.BackButton?.offClick?.(onBack);
      syncBack();
      // разрешение писать в чат — нужно, если приложение открыли не из бота
      if (inTG && s.notify.mode !== "off" && tg.requestWriteAccess) {
        try {
          tg.requestWriteAccess();
        } catch { /* старый клиент */ }
      }
      await saveSettings(true);
      go("feed");
    };
    const onBack = () => {
      if (step > 0) {
        dir = -1;
        step--;
        paint();
      }
    };
    const paint = () => {
      const st0 = steps[step];
      $(".onb-progress i", ov).style.width = `${((step + 1) / steps.length) * 100}%`;
      $(".onb-skip", ov).hidden = step === steps.length - 1;
      const body = $(".onb-body", ov);
      body.innerHTML = `<div class="onb-step ${dir < 0 ? "back" : ""}">${st0.html()}</div>`;
      body.scrollTop = 0;
      st0.bind?.(body);
      $(".onb-foot", ov).innerHTML = `${step > 0 ? `<button class="btn plain" style="flex:0 0 56px" id="ob-back" aria-label="Назад">${ic("back")}</button>` : ""}<button class="btn" id="ob-next">${st0.next ?? "Дальше"}</button>`;
      $("#ob-next", ov).onclick = () => {
        haptic.tap();
        if (step === steps.length - 1) return finish();
        dir = 1;
        step++;
        paint();
      };
      $("#ob-back", ov)?.addEventListener("click", onBack);
      if (tg?.BackButton) step > 0 ? tg.BackButton.show() : tg.BackButton.hide();
    };
    tg?.BackButton?.onClick(onBack);
    $(".onb-skip", ov).onclick = () => {
      step = steps.length - 1;
      paint();
    };
    if (again) haptic.tap();
    paint();
  }

  // ---------------------------------------------------------------- старт
  async function start() {
    if (tg) {
      tg.ready();
      tg.expand();
      tg.disableVerticalSwipes?.();
      try {
        tg.setHeaderColor?.("secondary_bg_color");
        tg.setBackgroundColor?.("secondary_bg_color");
        tg.setBottomBarColor?.("secondary_bg_color");
      } catch { /* старый клиент */ }
      if (inTG) document.documentElement.dataset.tg = "";
      const applyScheme = () => {
        if (tg.colorScheme === "dark") document.documentElement.dataset.dark = "";
        else delete document.documentElement.dataset.dark;
      };
      applyScheme();
      tg.onEvent?.("themeChanged", applyScheme);
    }
    $("#screen").innerHTML = `<header class="top"><h1 class="title">Жильё в Братиславе</h1></header><div class="feed">${skeletons("cards")}</div>`;
    try {
      st.boot = await api("bootstrap");
    } catch {
      $("#screen").innerHTML = `<div class="empty" style="padding-top:120px"><div class="ico">📡</div><h3>Нет связи с сервером</h3>Проверьте интернет и попробуйте снова.<br><br><button class="btn sm" onclick="location.reload()">${ic("refresh")}Обновить</button></div>`;
      return;
    }
    st.me = st.boot.me;
    st.defaults = st.boot.defaults;
    st.districts = st.boot.districts;
    st.lastCheck = st.boot.lastCheck;
    st.settings = st.me?.settings ?? store.get("settings", null) ?? structuredClone(st.defaults);
    st.filters = filtersFrom(st.settings);
    if (st.me) {
      st.favs = new Set(st.me.favorites);
      store.set("favs", st.me.favorites);
    }
    renderTabs();
    go("feed");
    const onboarded = st.me ? st.me.onboarded : store.get("onboarded", false);
    if (!onboarded) onboarding();

    // ссылка на конкретное объявление: #l=bazos:123 или start_param бота
    const fromHash = new URLSearchParams(location.hash.slice(1)).get("l");
    const fromStart = tg?.initDataUnsafe?.start_param?.startsWith("l_") ? tg.initDataUnsafe.start_param.slice(2).replace("_", ":") : null;
    const key = fromHash || fromStart;
    if (key && onboarded) openListing(key);
  }
  start();
})();
