/* Мини-приложение «Аренда в Словакии» для Telegram.
   Без сборки: один файл, ванильный JS. Данные — API облачной функции flat-bot. */
(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;
  const inTG = !!(tg && tg.initData);
  const API = "https://nnkhlnzjkwtcjvzyubzc.supabase.co/functions/v1/flat-bot";
  const CALL_URL = (n) => `${API}?action=call&n=${encodeURIComponent(n)}`;
  const SK_CENTER = [48.67, 19.7];
  const NO_LIMIT = 10000; // «до 10 000 €» = без ограничения сверху

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
  // ---------------------------------------------------------------- локализация (i18n.js)
  const I18N = window.I18N;
  const t = (k, v) => I18N.t(k, v);
  const tp = (k, n, v) => I18N.tp(k, n, v);
  const locale = () => I18N.locale();
  const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString(locale()));
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 90) return t("ago.now");
    if (s < 3600) return t("ago.min", { n: Math.round(s / 60) });
    if (s < 86400) return t("ago.h", { n: Math.round(s / 3600) });
    const d = Math.round(s / 86400);
    return d === 1 ? t("ago.yesterday") : tp("ago.days", d);
  }
  const dateFmt = (d, opts) => new Date(d).toLocaleString(locale(), { timeZone: "Europe/Bratislava", ...opts });
  const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/Bratislava" });
  // mid = внутри фразы («напомню завтра в 9:00») — со строчной буквы
  function dayLabel(d, mid = false) {
    const k = dayKey(d);
    const sfx = mid ? "_lc" : "";
    if (k === dayKey(Date.now())) return t("day.today" + sfx);
    if (k === dayKey(Date.now() + 86400000)) return t("day.tomorrow" + sfx);
    if (k === dayKey(Date.now() - 86400000)) return t("day.yesterday" + sfx);
    return dateFmt(d, { weekday: "long", day: "numeric", month: "long" });
  }
  const timeFmt = (d) => dateFmt(d, { hour: "2-digit", minute: "2-digit" });
  // сколько осталось: short — без «через» («5 мин»), иначе «через 5 мин»
  function untilText(d, short = false) {
    let m = Math.round((new Date(d) - Date.now()) / 60000);
    if (m <= 0) return t("dur.now");
    let s;
    if (m < 60) s = t("dur.min", { m });
    else {
      const h = Math.floor(m / 60);
      m %= 60;
      s = h < 24 ? (m ? t("dur.hm", { h, m }) : t("dur.h", { h })) : tp("dur.days", Math.round(h / 24));
    }
    return short ? s : t("dur.in", { d: s });
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
  // тексты справочников — геттеры, чтобы при смене языка всё перерисовывалось само
  const localized = (prefix, items, fields) =>
    items.map((o) => {
      for (const f of fields) Object.defineProperty(o, f, { get: () => t(`${prefix}.${o.k}.${f}`), enumerable: true });
      return o;
    });
  const KINDS = localized("kind", [
    { k: "room", em: "🛏️" },
    { k: "studio", em: "🛋️" },
    { k: "flat", em: "🏢" },
    { k: "hostel", em: "🏨" },
  ], ["name", "short", "tiny", "hint"]);
  const KIND = Object.fromEntries(KINDS.map((x) => [x.k, x]));
  // сервер присылает часть тегов по-русски — переводим известные, остальные как есть
  const TAG_KEYS = { "свободно сразу": "now", "можно с животными": "pets", "парковка": "parking", "балкон / терраса": "balcony", "с мебелью": "furnished", "новостройка": "newBuild" };
  const tagText = (s) => (TAG_KEYS[s] ? t("tag." + TAG_KEYS[s]) : s);
  const SOURCES = { bazos: "Bazoš", nehnutelnosti: "Nehnuteľnosti", topreality: "TopReality", bezrealitky: "Bezrealitky" };
  const SORTS = localized("sort", [{ k: "new" }, { k: "cheap" }, { k: "deal" }, { k: "m2" }], ["name", "hint"]);
  const AGENCY = localized("agency", [
    { k: "any", em: "🤝" },
    { k: "private", em: "👤" },
    { k: "agency", em: "🏢" },
  ], ["name", "short", "hint"]);
  // география: края, города, районы (приходят из bootstrap)
  const geo = { regions: [], cities: [], districts: [] };
  const cityName = (k) => geo.cities.find((c) => c.key === k)?.name ?? null;
  const regionName = (k) => geo.regions.find((r) => r.key === k)?.name ?? null;
  const districtName = (k) => geo.districts.find((d) => d.key === k)?.name ?? null;
  const districtCity = (k) => geo.districts.find((d) => d.key === k)?.city ?? null;
  const placeOf = (it) => [cityName(it.city) ?? it.city_name ?? it.cityName, districtName(it.district)].filter(Boolean).join(" · ") || null;
  const locEmpty = (f) => !f.regions?.length && !f.cities?.length && !f.districts?.length;
  function locLabel(f) {
    const parts = [
      ...(f.cities ?? []).map(cityName),
      ...(f.districts ?? []).map((d) => `${cityName(districtCity(d))} · ${districtName(d)}`),
      ...(f.regions ?? []).map(regionName),
    ].filter(Boolean);
    if (!parts.length) return t("loc.all");
    return parts.length <= 2 ? parts.join(", ") : t("loc.more", { first: parts[0], n: parts.length - 1 });
  }

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
    regions: [...(s.regions ?? [])], cities: [...(s.cities ?? [])], districts: [...(s.districts ?? [])], withPhone: s.withPhone, withPhoto: s.withPhoto, onlyNew: false,
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
    toast(t("toast.needAuth"));
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

  async function copy(text, label = t("toast.copied")) {
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
    wrap.style.zIndex = "90";
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
    if (it.price == null) util = t("util.negotiable");
    else if (it.utilities === "included") util = t("util.included");
    else if (it.utilities === "extra" && it.charges) util = t("util.extraSum", { sum: fmt(it.charges) });
    else if (it.utilities === "extra") util = t("util.extra");
    else util = t("util.unknown");
    return { total, util };
  }
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Bratislava" });
  // у объявлений из первичной подгрузки точного времени нет — показываем дату
  const when = (it) =>
    it.seeded ? (it.published ? (String(it.published).slice(0, 10) === today() ? t("when.today") : dateFmt(it.published, { day: "numeric", month: "short" })) : t("when.earlier")) : ago(it.posted_at);
  const isNew = (it) =>
    it.seeded ? !!it.published && String(it.published).slice(0, 10) === today() : Date.now() - new Date(it.posted_at) < 86400000;
  function pillsHTML(it, compact = false) {
    const p = [];
    if (it.deal != null && it.deal <= -8) p.push(`<span class="pill good">${ic("spark")}${esc(t("pill.dealLow", { n: Math.abs(it.deal) }))}</span>`);
    else if (it.deal != null && it.deal >= 15 && !compact) p.push(`<span class="pill warn">${esc(t("pill.dealHigh", { n: it.deal }))}</span>`);
    if (it.agency === false) p.push(`<span class="pill good">${esc(t("pill.private"))}</span>`);
    else if (it.agency === true && !compact) p.push(`<span class="pill">${esc(t("pill.agency"))}</span>`);
    if (it.has_phone) p.push(`<span class="pill acc">${ic("phone")}${compact ? "" : esc(t("pill.phone"))}</span>`);
    return p.join("");
  }
  function metaHTML(it) {
    const parts = [
      placeOf(it),
      KIND[it.kind]?.name,
      it.area ? t("unit.m2", { n: fmt(it.area) }) : null,
    ].filter(Boolean);
    return parts.map((x) => `<span>${esc(x)}</span>`).join("");
  }
  const imgTag = (src, alt = "") =>
    src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  const noImg = (it) => `<div class="noimg">${KIND[it.kind]?.em ?? "🏠"}</div>`;

  function cardHTML(it, mode = st.view) {
    const { total, util } = priceInfo(it);
    const fav = st.favs.has(it.key);
    const favBtn = `<span class="fav ${fav ? "on" : ""}" data-fav="${esc(it.key)}" role="button" aria-label="${esc(t("a11y.fav"))}">${ic("heart", fav)}</span>`;
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
        <div class="price num"><b>${total != null ? fmt(total) + " €" : "?"}</b>${tile ? "" : `<small>${esc(t("unit.perMonth"))}</small><span class="util">${esc(util)}</span>`}</div>
        ${!tile && it.img_count > 1 ? `<span class="pcount">📷 ${it.img_count}</span>` : ""}
      </div>
      <div class="body">
        <div class="ttl">${esc(it.title)}</div>
        <div class="meta">${tile ? `<span>${esc(placeOf(it) ?? KIND[it.kind]?.name ?? "")}</span>` : metaHTML(it) + `<span>${esc(when(it))}</span>`}</div>
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
    if (on) toast(t("toast.favAdded"));
    if (inTG) api("fav", { key, on }).catch(() => toast(t("toast.saveFail")));
  }

  // ---------------------------------------------------------------- таббар
  const TABS = [
    { k: "feed", icon: "home" },
    { k: "favs", icon: "heart" },
    { k: "rem", icon: "bell" },
    { k: "market", icon: "chart" },
    { k: "settings", icon: "gear" },
  ];
  function renderTabs() {
    const nav = $("#tabbar");
    nav.hidden = false;
    nav.innerHTML = TABS.map((x) => `<button data-tab="${x.k}" class="${st.tab === x.k ? "on" : ""}">${ic(x.icon, st.tab === x.k && x.k === "favs")}<span>${esc(t("tab." + x.k))}</span></button>`).join("");
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
  function go(tab, { keepDraft = false } = {}) {
    st.tab = tab;
    renderTabs();
    window.scrollTo(0, 0);
    destroyMap();
    if (tab === "settings") return renderSettings({ keepDraft });
    ({ feed: renderFeed, favs: renderFavs, rem: renderReminders, market: renderMarket })[tab]();
  }

  // ---------------------------------------------------------------- таймер проверки
  // сайты проверяются по cron каждые 10 минут (:00, :10, …), обработка ~40 секунд
  const CYCLE = 10 * 60 * 1000;
  const nextCheck = () => Math.ceil((Date.now() - 40000) / CYCLE) * CYCLE + 40000;
  function timerHTML() {
    return `<button class="timer" id="timer" aria-label="${esc(t("a11y.timer"))}">
      <svg viewBox="0 0 36 36"><circle class="ring-bg" cx="18" cy="18" r="15" fill="none" stroke-width="4"/>
      <circle class="ring" cx="18" cy="18" r="15" fill="none" stroke-width="4" stroke-dasharray="94.25" stroke-dashoffset="0"/></svg>
      <span><span class="muted">${esc(t("timer.label"))}</span><b id="timer-t">--:--</b></span></button>`;
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
  const subline = () => t("feed.subline", { ago: st.lastCheck ? ago(st.lastCheck.at) : "—" });

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
          b2.innerHTML = `${ic("spark")} ${esc(tp("feed.newbar", fresh.length))}`;
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
    if (!locEmpty(f)) n++;
    if (f.withPhone) n++;
    if (f.withPhoto) n++;
    return n;
  }
  function chipsHTML() {
    const f = st.filters;
    const n = activeFilterCount();
    const kindLabel = f.kinds.length === 4 ? t("chip.anyKind") : f.kinds.map((k) => KIND[k].short).join(", ");
    return `
      <button class="chip ${n ? "on" : ""}" data-act="filters">${ic("sliders")}${esc(t("chip.filters"))}${n ? `<span class="dot">${n}</span>` : ""}</button>
      <button class="chip" data-act="filters">${esc(kindLabel)}${ic("down")}</button>
      <button class="chip ${locEmpty(f) ? "" : "on"}" data-act="loc">${ic("pin")}${esc(locLabel(f))}</button>
      <button class="chip" data-act="filters">${esc(budgetText(f.maxTotal))}${ic("down")}</button>
      <button class="chip ${f.agency === "private" ? "on" : ""}" data-toggle="private">👤 ${esc(t("chip.private"))}</button>
      <button class="chip ${f.onlyNew ? "on" : ""}" data-toggle="onlyNew">🆕 ${esc(t("chip.new24"))}</button>
      <button class="chip ${f.withPhone ? "on" : ""}" data-toggle="withPhone">${ic("phone")}${esc(t("chip.withPhone"))}</button>
      <button class="chip ${f.withPhoto ? "on" : ""}" data-toggle="withPhoto">📷 ${esc(t("chip.withPhoto"))}</button>`;
  }
  const VIEWS = [["cards", "cards"], ["list", "list"], ["grid", "grid"], ["map", "map"]];

  function renderFeed() {
    const scr = $("#screen");
    scr.innerHTML = `
      <header class="top flat">
        <div class="top-row">
          <div style="flex:1;min-width:0"><h1 class="title"><button class="loc-title" data-act="loc" id="loc-title"><span>${esc(locLabel(st.filters))}</span>${ic("down")}</button></h1><div class="subtitle" id="subline">${esc(subline())}</div></div>
          ${timerHTML()}
        </div>
        <label class="search">${ic("search")}<input id="q" type="search" placeholder="${esc(t("feed.searchPh"))}" value="${esc(st.q)}" enterkeyhint="search"></label>
      </header>
      <div class="stickybar" id="feedtop">
        <div class="chips" id="chips">${chipsHTML()}</div>
        <div class="bar" style="padding:8px 0 2px">
          <button class="sort" data-act="sort">${ic("sort")}${esc(SORTS.find((s) => s.k === st.sort)?.name)}</button>
          <div class="seg" id="views">${VIEWS.map(([k, i]) => `<button data-view="${k}" class="${st.view === k ? "on" : ""}" aria-label="${esc(t("view." + k))}">${ic(i)}</button>`).join("")}</div>
        </div>
      </div>
      ${inTG ? "" : `<div class="banner">ℹ️<div><b>${esc(t("banner.title"))}</b>${esc(t("banner.text"))}</div></div>`}
      <button class="chip on" id="newbar" hidden style="margin:6px auto 0;display:flex"></button>
      <div class="bar"><span class="count" id="count">${esc(t("feed.loading"))}</span></div>
      <div id="feed" class="feed ${st.view}"></div>
      <div id="sentinel" style="height:40px"></div>`;

    $("#newbar").onclick = () => {
      $("#newbar").hidden = true;
      $("#timer")?.classList.remove("pulse");
      loadFeed(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    $("#timer").onclick = () => toast(`${t("toast.timer")} ${st.lastCheck ? t("toast.timerLast", { ago: ago(st.lastCheck.at) }) : ""}`);
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
      else if (b.dataset.act === "loc") openLocation(st.filters, afterLoc);
      else if (b.dataset.toggle) {
        const k = b.dataset.toggle;
        if (k === "private") st.filters.agency = st.filters.agency === "private" ? "any" : "private";
        else st.filters[k] = !st.filters[k];
        refreshChips();
        loadFeed(true);
      }
    };
    $("#loc-title").onclick = () => (haptic.soft(), openLocation(st.filters, afterLoc));
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
    const t = $("#loc-title span");
    if (t) t.textContent = locLabel(st.filters);
  }
  function afterLoc() {
    refreshChips();
    loadFeed(true);
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
      $("#count").textContent = f.total ? tp("feed.count", f.total, { n: fmt(f.total) }) : "";
      if (!f.items.length) $("#feed").innerHTML = emptyHTML();
    } catch (e) {
      if (gen === f.gen) $("#feed").innerHTML = `<div class="empty"><div class="ico">📡</div><h3>${esc(t("err.noNet"))}</h3>${esc(t("err.feed"))}<br><br><button class="btn sm ghost" onclick="location.reload()">${ic("refresh")}${esc(t("btn.retry"))}</button></div>`;
    } finally {
      if (gen === f.gen) f.loading = false;
    }
  }
  const emptyHTML = () => `<div class="empty"><div class="ico">🔍</div><h3>${esc(t("empty.feed.title"))}</h3>${esc(t("empty.feed.text"))}<br><br><button class="btn sm ghost" data-reset>${esc(t("btn.resetFilters"))}</button></div>`;
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
    const s = sheet(`<h2>${esc(t("sort.title"))}</h2><div class="opts" style="margin-top:12px">${SORTS.map((o) => `
      <button class="opt row-opt ${st.sort === o.k ? "on" : ""}" data-k="${o.k}"><div style="flex:1"><b>${esc(o.name)}</b><small>${esc(o.hint)}</small></div><span class="tick">${ic("check")}</span></button>`).join("")}</div>`);
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
  // ---------------------------------------------------------------- бюджет: один ползунок до 10 000 €
  // шкала нелинейная: первая половина — до 1 000 €, дальше крупнее шаг
  const BP = [[0, 100], [500, 1000], [800, 3000], [1000, NO_LIMIT]];
  function posToVal(p) {
    for (let i = 0; i < BP.length - 1; i++) {
      const [p0, v0] = BP[i], [p1, v1] = BP[i + 1];
      if (p <= p1) {
        const v = v0 + ((p - p0) / (p1 - p0)) * (v1 - v0);
        const step = v < 1000 ? 10 : v < 3000 ? 50 : 500;
        return Math.min(NO_LIMIT, Math.round(v / step) * step);
      }
    }
    return NO_LIMIT;
  }
  function valToPos(v) {
    for (let i = 0; i < BP.length - 1; i++) {
      const [p0, v0] = BP[i], [p1, v1] = BP[i + 1];
      if (v <= v1) return Math.round(p0 + ((Math.max(v, v0) - v0) / (v1 - v0)) * (p1 - p0));
    }
    return 1000;
  }
  const budgetText = (v) => (v >= NO_LIMIT ? t("budget.any") : t("budget.upTo", { sum: fmt(v) }));
  function budgetHTML(max, id = "b") {
    return `<div class="budget"><span>${esc(t("budget.upToWord"))}</span><b class="num" id="${id}-v">${max >= NO_LIMIT ? fmt(NO_LIMIT) + "+" : fmt(max)}</b><span>${esc(t("budget.perMonth"))}</span></div>
      <input type="range" class="brange" id="${id}-r" min="0" max="1000" step="1" value="${valToPos(max)}" aria-label="${esc(t("a11y.budget"))}">
      <div class="bscale"><span style="left:0">100 €</span><span style="left:50%">${fmt(1000)}</span><span style="left:100%">${fmt(NO_LIMIT)} €</span></div>
      <div class="quick">${[400, 650, 1000, 2000, NO_LIMIT].map((v) => `<button class="chip" data-bq="${v}">${esc(v >= NO_LIMIT ? t("budget.noLimit") : t("budget.upTo", { sum: fmt(v) }))}</button>`).join("")}</div>`;
  }
  function bindBudget(root, id, state, onChange) {
    const r = $(`#${id}-r`, root);
    const upd = (v) => {
      state.maxTotal = v;
      state.minTotal = 0;
      $(`#${id}-v`, root).textContent = v >= NO_LIMIT ? fmt(NO_LIMIT) + "+" : fmt(v);
      r.style.setProperty("--p", `${+r.value / 10}%`);
      $$("[data-bq]", root).forEach((b) => b.classList.toggle("on", +b.dataset.bq === v));
      onChange?.();
    };
    r.oninput = () => {
      haptic.soft();
      upd(posToVal(+r.value));
    };
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-bq]");
      if (!b || !root.contains(r)) return;
      haptic.soft();
      r.value = valToPos(+b.dataset.bq);
      upd(+b.dataset.bq);
    });
    upd(state.maxTotal);
  }
  const kinds4HTML = (sel) => `<div class="kinds4">${KINDS.map((k) => `
    <button class="${sel.includes(k.k) ? "on" : ""}" data-kind="${k.k}"><span class="e">${k.em}</span><span>${esc(k.short)}<small>${esc(k.tiny)}</small></span></button>`).join("")}</div>`;
  const agencySegHTML = (sel) => `<div class="seg3">${AGENCY.map((a) => `
    <button class="${sel === a.k ? "on" : ""}" data-agency="${a.k}"><span class="e">${a.em}</span>${esc(a.short)}</button>`).join("")}</div>`;
  function kindsHTML(sel) {
    return `<div class="opts two">${KINDS.map((k) => `
      <button class="opt ${sel.includes(k.k) ? "on" : ""}" data-kind="${k.k}"><span class="tick">${ic("check")}</span><div class="em">${k.em}</div><b>${esc(k.name)}</b><small>${esc(k.hint)}</small></button>`).join("")}</div>`;
  }
  function bindKinds(root, state) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-kind]");
      if (!b) return;
      haptic.soft();
      const k = b.dataset.kind;
      const has = state.kinds.includes(k);
      if (has && state.kinds.length === 1) return toast(t("toast.needKind"));
      state.kinds = has ? state.kinds.filter((x) => x !== k) : [...state.kinds, k];
      b.classList.toggle("on", !has);
    });
  }
  function agencyHTML(sel) {
    return `<div class="opts">${AGENCY.map((a) => `
      <button class="opt row-opt ${sel === a.k ? "on" : ""}" data-agency="${a.k}"><div class="em">${a.em}</div><div style="flex:1"><b>${esc(a.name)}</b><small>${esc(a.hint)}</small></div><span class="tick">${ic("check")}</span></button>`).join("")}</div>`;
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
      <h2>${esc(t("filters.title"))}</h2><p class="lead">${esc(t("filters.lead"))}</p>
      <div class="group-title" style="margin:6px 0 8px">${esc(t("filters.budget"))}</div>
      <div class="card2" style="margin:0 0 6px">${budgetHTML(f.maxTotal, "fb")}</div>
      <div class="group-title" style="margin:16px 0 8px">${esc(t("filters.what"))}</div>${kindsHTML(f.kinds)}
      <div class="group-title" style="margin:16px 0 8px">${esc(t("filters.who"))}</div>${agencyHTML(f.agency)}
      <div class="group-title" style="margin:16px 0 8px">${esc(t("loc.title"))}</div>
      <button class="cell card2" style="margin:0" id="f-d"><span class="ic" style="background:#ff8a3d">📍</span><span class="lbl">${esc(locLabel(f))}</span>${ic("chev").replace("<svg", '<svg class="chev"')}</button>
      <div class="group" style="margin:16px 0 0">
        ${switchCell("withPhone", "📞", "#12a46c", t("filters.onlyPhone"), t("filters.onlyPhoneSub"), f.withPhone)}
        ${switchCell("withPhoto", "📷", "#7a5cff", t("filters.onlyPhoto"), "", f.withPhoto)}
      </div>
      <div class="sheet-foot" style="flex-direction:column">
        <button class="btn block" id="f-apply">${esc(t("btn.show"))}</button>
        ${inTG ? `<button class="btn block ghost" id="f-save">${ic("bell")}${esc(t("filters.saveNotify"))}</button>` : ""}
      </div>`);
    bindBudget(s, "fb", f);
    bindKinds(s, f);
    bindAgency(s, f);
    $$("input[data-sw]", s).forEach((i) => (i.onchange = () => (f[i.dataset.sw] = i.checked, haptic.soft())));
    $("#f-d", s).onclick = () => openLocation(f, () => ($("#f-d .lbl", s).textContent = locLabel(f)));
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
      toast(t("toast.filtersSaved"));
    };
  }
  function switchCell(key, em, color, title, sub, on) {
    return `<label class="cell"><span class="ic" style="background:${color}">${em}</span><span class="lbl">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ""}</span>
      <span class="switch"><input type="checkbox" data-sw="${key}" ${on ? "checked" : ""}><span></span></span></label>`;
  }

  // ---------------------------------------------------------------- выбор местоположения
  // Сначала город, потом (если у города есть районы) — районы. Выбор хранится как
  // { regions, cities, districts }: объявление подходит, если совпало хоть что-то; всё пусто — вся Словакия.
  const hasDistricts = (c) => geo.districts.some((d) => d.city === c);
  const normQ = (s) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  function locPicker(root, sel, onChange) {
    let view = null; // ключ города, если открыт экран его районов
    let q = "";
    let showAll = {};
    const changed = () => {
      haptic.soft();
      onChange?.();
    };
    const cityOn = (c) => sel.cities.includes(c) || geo.districts.some((d) => d.city === c && sel.districts.includes(d.key));
    const total = geo.regions.reduce((a, r) => a + r.n, 0);
    const row = (c) => {
      const on = cityOn(c.key);
      const dist = hasDistricts(c.key);
      const picked = geo.districts.filter((d) => d.city === c.key && sel.districts.includes(d.key)).length;
      return `<button class="crow ${on ? "on" : ""} ${c.n ? "" : "zero"}" data-c="${esc(c.key)}">
        <span class="nm">${esc(c.name)}${dist ? `<small>${esc(picked ? tp("loc.districts", picked) : sel.cities.includes(c.key) ? t("loc.wholeCityLc") : t("loc.hasDistricts"))}</small>` : ""}</span>
        <span class="n">${c.n || ""}</span>
        ${dist ? `<span class="go">${ic("chev")}</span>` : `<span class="ck">${ic("check")}</span>`}</button>`;
    };

    function selectedChips() {
      const chips = [
        ...sel.regions.map((r) => [`r:${r}`, regionName(r)]),
        ...sel.cities.map((c) => [`c:${c}`, cityName(c)]),
        ...sel.districts.map((d) => [`d:${d}`, `${cityName(districtCity(d))} · ${districtName(d)}`]),
      ];
      return chips.length
        ? `<div class="loc-sel">${chips.map(([k, n]) => `<button class="chip on" data-x="${esc(k)}">${esc(n ?? "")}<span class="x">${ic("x")}</span></button>`).join("")}</div>`
        : "";
    }

    function citiesHTML() {
      const empty = locEmpty(sel);
      let list;
      if (q) {
        const hits = geo.cities.filter((c) => normQ(c.name).includes(q)).slice(0, 40);
        list = hits.length ? `<div class="clist">${hits.map(row).join("")}</div>` : `<div class="muted" style="padding:16px 4px">${esc(t("loc.nothing"))}</div>`;
      } else {
        const popular = geo.cities.filter((c) => c.n).slice(0, 8);
        list = `<div class="loc-h">${esc(t("loc.popular"))}</div><div class="clist">${popular.map(row).join("")}</div>
          <div class="loc-h">${esc(t("loc.byRegion"))}</div>
          ${geo.regions.map((r) => {
            const cs = geo.cities.filter((c) => c.region === r.key);
            const visible = showAll[r.key] ? cs : cs.filter((c) => c.n);
            const whole = sel.regions.includes(r.key);
            return `<details class="reg" data-reg="${r.key}" ${openRegs.has(r.key) ? "open" : ""}>
              <summary>${ic("chev")}<span>${esc(r.name)}</span><span class="n">${r.n}</span><span class="sp"></span>
                <button class="whole ${whole ? "on" : ""}" data-r="${r.key}">${whole ? "✓ " : ""}${esc(t("loc.wholeRegion"))}</button></summary>
              <div class="clist in">${visible.map(row).join("")}</div>
              ${cs.length > visible.length ? `<button class="sort" style="margin:2px 14px 12px" data-more="${r.key}">${esc(tp("loc.moreCities", cs.length - visible.length))}</button>` : ""}
            </details>`;
          }).join("")}`;
      }
      return `<button class="bigopt ${empty ? "on" : ""}" data-sk><span class="e">🇸🇰</span><span class="t"><b>${esc(t("loc.all"))}</b><small>${esc(tp("loc.allSub", total, { n: fmt(total) }))}</small></span><span class="ck">${ic("check")}</span></button>
        <label class="search" style="margin:12px 0 0">${ic("search")}<input id="lp-q" type="search" placeholder="${esc(t("loc.searchPh"))}" value="${esc(q)}"></label>
        ${selectedChips()}
        <div id="lp-list">${list}</div>`;
    }

    function districtsHTML(c) {
      const city = geo.cities.find((x) => x.key === c);
      const ds = geo.districts.filter((d) => d.city === c).sort((a, b) => b.n - a.n);
      const whole = sel.cities.includes(c);
      return `<button class="sort" data-back style="margin:2px 0 10px">${ic("back")}${esc(t("loc.allCities"))}</button>
        <h3 style="margin:0 0 12px;font-size:22px">${esc(city?.name ?? c)}</h3>
        <button class="bigopt ${whole ? "on" : ""}" data-whole="${esc(c)}"><span class="e">🏙️</span><span class="t"><b>${esc(t("loc.wholeCity"))}</b><small>${esc(tp("loc.wholeCitySub", city?.n ?? 0, { n: fmt(city?.n ?? 0) }))}</small></span><span class="ck">${ic("check")}</span></button>
        <div class="loc-h">${esc(t("loc.onlyDistricts"))}</div>
        <div class="dchips">${ds.map((d) => `<button class="chip ${sel.districts.includes(d.key) ? "on" : ""} ${d.n ? "" : "zero"}" data-d="${d.key}">${esc(d.name)} <small>${d.n}</small></button>`).join("")}</div>
        <button class="btn block" data-back style="margin-top:18px">${esc(t("btn.done"))}</button>`;
    }

    const openRegs = new Set();
    function paint() {
      root.innerHTML = view ? districtsHTML(view) : citiesHTML();
      const inp = $("#lp-q", root);
      if (inp) inp.oninput = (e) => {
        q = normQ(e.target.value.trim());
        const sel0 = inp.selectionStart;
        paint();
        const i2 = $("#lp-q", root);
        i2.focus();
        i2.setSelectionRange(sel0, sel0);
      };
    }
    root.addEventListener("toggle", (e) => {
      const d = e.target.closest?.("[data-reg]");
      if (d) d.open ? openRegs.add(d.dataset.reg) : openRegs.delete(d.dataset.reg);
    }, true);
    root.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t || !root.contains(t)) return;
      const rm = (arr, v) => arr.splice(0, arr.length, ...arr.filter((x) => x !== v));
      if (t.dataset.sk != null) {
        sel.regions.length = sel.cities.length = sel.districts.length = 0;
      } else if (t.dataset.r) {
        e.preventDefault(); // не сворачивать край
        const r = t.dataset.r;
        if (sel.regions.includes(r)) rm(sel.regions, r);
        else {
          sel.regions.push(r);
          // города этого края уже входят в «весь край»
          for (const c of geo.cities.filter((c) => c.region === r)) rm(sel.cities, c.key);
          for (const d of geo.districts.filter((d) => geo.cities.find((c) => c.key === d.city)?.region === r)) rm(sel.districts, d.key);
        }
      } else if (t.dataset.c) {
        const c = t.dataset.c;
        if (hasDistricts(c)) {
          view = c;
          haptic.tap();
          paint();
          root.scrollIntoView?.({ block: "start" });
          return;
        }
        sel.cities.includes(c) ? rm(sel.cities, c) : sel.cities.push(c);
      } else if (t.dataset.whole) {
        const c = t.dataset.whole;
        if (sel.cities.includes(c)) rm(sel.cities, c);
        else {
          sel.cities.push(c);
          for (const d of geo.districts.filter((d) => d.city === c)) rm(sel.districts, d.key);
        }
      } else if (t.dataset.d) {
        const d = t.dataset.d;
        if (sel.districts.includes(d)) rm(sel.districts, d);
        else {
          sel.districts.push(d);
          rm(sel.cities, districtCity(d)); // выбран район — значит, не весь город
        }
      } else if (t.dataset.x) {
        const [kind, k] = [t.dataset.x[0], t.dataset.x.slice(2)];
        rm(kind === "r" ? sel.regions : kind === "c" ? sel.cities : sel.districts, k);
      } else if (t.dataset.more) {
        showAll[t.dataset.more] = true;
        paint();
        return;
      } else if (t.dataset.back != null) {
        view = null;
        haptic.tap();
        paint();
        return;
      } else return;
      changed();
      paint();
    });
    paint();
  }

  // количество объявлений под фильтры — для кнопок «Готово · N» и онбординга
  let countTimer, countSeq = 0;
  function liveCount(filters, cb) {
    clearTimeout(countTimer);
    const seq = ++countSeq;
    countTimer = setTimeout(async () => {
      try {
        const r = await api("feed", { filters, limit: 1 });
        if (seq === countSeq) cb(r.total);
      } catch { /* без счётчика */ }
    }, 250);
  }

  function openLocation(target, onDone) {
    const sel = { regions: [...target.regions], cities: [...target.cities], districts: [...target.districts] };
    const s = sheet(`<h2>${esc(t("loc.title"))}</h2><p class="lead">${esc(t("loc.lead"))}</p>
      <div id="lp"></div>
      <div class="sheet-foot"><button class="btn block" id="lp-ok">${esc(t("btn.show"))}</button></div>`);
    const ok = $("#lp-ok", s);
    const upd = () => liveCount({ ...st.filters, ...sel }, (n) => (ok.textContent = tp("loc.showN", n, { n: fmt(n) })));
    locPicker($("#lp", s), sel, upd);
    upd();
    ok.onclick = () => {
      Object.assign(target, sel);
      onDone();
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
    $("#count").textContent = t("map.loading");
    destroyMap();
    window.scrollTo(0, 0);
    const top = $("#feedtop").getBoundingClientRect().bottom;
    const wrap = el(`<div class="mapwrap" style="top:${top}px"><div id="map" style="height:100%"></div></div>`);
    document.body.append(wrap);
    try {
      const [L, r] = await Promise.all([loadLeaflet(), api("map", { filters: { ...st.filters, q: st.q } })]);
      if (st.view !== "map" || !document.body.contains(wrap)) return;
      map = L.map("map", { zoomControl: false, attributionControl: true }).setView(SK_CENTER, 7);
      tiles(L, $("#map")).addTo(map);
      mapMarkers = r.points.map((p) => {
        const m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: "", html: `<div class="mappin" data-k="${esc(p.key)}">${p.total != null ? fmt(p.total) + " €" : "?"}</div>`, iconSize: [0, 0] }),
        }).addTo(map);
        m.on("click", () => showMapCard(p.key));
        return m;
      });
      if (r.points.length) map.fitBounds(r.points.map((p) => [p.lat, p.lng]), { padding: [40, 40], maxZoom: 14 });
      $("#count").textContent = tp("map.count", r.points.length, { n: fmt(r.points.length) });
      map.on("click", () => $(".mapcard")?.remove());
    } catch {
      $("#count").textContent = t("map.fail");
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
      const r = await api("listing", { key, peek: true }); // превью на карте — не «просмотр»
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
      page.innerHTML = `<div class="empty" style="padding-top:120px"><div class="ico">🫥</div><h3>${esc(t("listing.notFound"))}</h3>${esc(t("listing.notFoundText"))}<br><br><button class="btn sm ghost" id="x">${esc(t("btn.back"))}</button></div>`;
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
    const dName = placeOf(it);
    const perM2 = total && it.area ? Math.round(total / it.area) : null;
    const moveIn = it.price ? (it.deposit ?? it.price) + (total ?? it.price) + (it.commission ? it.price : 0) : null;

    // цена: разбивка
    const rows = [];
    if (it.price != null) rows.push([t("price.rent"), `${fmt(it.price)} €`]);
    if (it.utilities === "extra") rows.push([t("price.utilities"), it.charges ? `${fmt(it.charges)} €` : t("price.utilNotStated")]);
    else if (it.utilities === "included") rows.push([t("price.utilities"), t("price.utilIncluded")]);
    else rows.push([t("price.utilities"), t("price.utilUnclear")]);
    if (it.deposit) rows.push([t("price.deposit"), `${fmt(it.deposit)} €`]);
    rows.push([t("price.commission"), it.commission === true ? t("price.commYes") : it.commission === false ? t("price.commNo") : t("price.commUnknown")]);
    if (perM2) rows.push([t("price.perM2"), `${fmt(perM2)} €`]);

    // сравнение с рынком
    let market = "";
    if (r.median && total) {
      const diff = Math.round((total / r.median - 1) * 100);
      const lo = Math.min(total, r.median) * 0.7, hi = Math.max(total, r.median) * 1.3;
      const pos = (v) => `${((v - lo) / (hi - lo)) * 100}%`;
      const kindLc = (KIND[it.kind]?.short ?? "").toLowerCase();
      const scope = r.medianScope === "city" && it.cityName ? t("market.scopeCity", { kind: kindLc, city: it.cityName }) : t("market.scopeAll", { kind: kindLc });
      const mv = { median: fmt(r.median), scope: esc(scope), count: esc(tp("n.listings", r.medianN, { n: fmt(r.medianN) })), "/b": "</b>" };
      const line = diff <= -3 ? t("market.lineCheaper", { ...mv, n: -diff, b: '<b style="color:var(--good)">' })
        : diff >= 3 ? t("market.linePricier", { ...mv, n: diff, b: '<b style="color:var(--warn)">' })
        : t("market.lineAround", { ...mv, b: "<b>" });
      market = `<div class="market">
        <div style="font-size:14px">${line}</div>
        <div class="mtrack"><div class="mtick" style="left:${pos(r.median)}"><span>${esc(t("market.medianMark", { sum: fmt(r.median) }))}</span></div><div class="mdot" style="left:${pos(total)}"></div></div>
        <div class="mlabels"><span>${esc(t("market.cheaperLbl"))}</span><span>${esc(t("market.pricierLbl"))}</span></div></div>`;
    }

    const rooms = it.rooms ? (isFinite(+it.rooms) ? (+it.rooms).toLocaleString(locale(), { maximumFractionDigits: 1 }) : String(it.rooms)) : null;
    const facts = [
      [t("fact.type"), KIND[it.kind]?.name],
      [t("fact.rooms"), rooms],
      [t("fact.area"), it.area ? t("unit.m2", { n: fmt(it.area) }) : null],
      [t("fact.floor"), it.floor],
      [t("fact.district"), dName],
      [t("fact.available"), it.availableFrom ? dateFmt(it.availableFrom, { day: "numeric", month: "long" }) : null],
      [t("fact.published"), it.published ? dateFmt(it.published, { day: "numeric", month: "long" }) : ago(it.posted_at)],
      [t("fact.source"), SOURCES[it.source]],
    ].filter(([, v]) => v);

    const sellerKind = it.agency === true ? t("seller.agency") : it.agency === false ? t("seller.private") : t("seller.unknown");
    const initials = (it.seller || sellerKind).replace(/[^\p{L} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
    const noPhoneNote = it.source === "bazos" ? t("contact.bazos") : it.source === "bezrealitky" ? t("contact.bezrealitky") : t("contact.noPhone");
    const contacts = `
      <div class="contact"><div class="avatar">${esc(initials)}</div><div class="who"><b>${esc(it.seller || t("seller.contact"))}</b><small>${esc(sellerKind)}${it.commission ? ` · ${esc(t("seller.hasCommission"))}` : ""}</small></div>
        ${it.agency === false ? `<span class="pill good">${esc(t("pill.noCommission"))}</span>` : it.agency === true ? '<span class="pill">RK</span>' : ""}</div>
      ${(it.phones ?? []).map((p) => `
        <div class="contact"><div class="who"><b class="ph num">${esc(p.replace(/^\+(\d{3})(\d{3})(\d{3})(\d{3})$/, "+$1 $2 $3 $4"))}</b><small>${esc(t("contact.phoneFrom"))}</small></div>
          <button class="round ghost" data-copy="${esc(p)}" aria-label="${esc(t("a11y.copyNumber"))}">${ic("copy")}</button>
          <button class="round call" data-call="${esc(p)}" aria-label="${esc(t("a11y.call"))}">${ic("phone")}</button></div>`).join("")}
      ${(it.emails ?? []).map((m) => `
        <div class="contact"><div class="who"><b style="font-size:15px">${esc(m)}</b><small>${esc(t("contact.email"))}</small></div>
          <button class="icon-btn" data-copy="${esc(m)}">${ic("copy")}</button>
          <a class="btn sm ghost" href="mailto:${esc(m)}?subject=${encodeURIComponent(it.title)}&body=${encodeURIComponent(TEMPLATE(it.title))}">${ic("mail")}${esc(t("btn.write"))}</a></div>`).join("")}
      ${!(it.phones ?? []).length ? `<div class="contact"><div class="who"><small>${esc(noPhoneNote)}</small></div></div>` : ""}
      <div style="display:grid;gap:8px;margin-top:8px">
        <button class="btn sm plain block" data-template>${ic("msg")}${esc(t("contact.template"))}</button>
        <button class="btn sm plain block" data-site>${ic("ext")}${esc(t("contact.openSite"))}</button>
      </div>`;

    page.innerHTML = `
      <div class="dtop"><button class="icon-btn" data-close aria-label="${esc(t("a11y.back"))}">${ic("back")}</button>
        <div class="right"><button class="icon-btn" data-share aria-label="${esc(t("a11y.share"))}">${ic("share")}</button>
        <button class="icon-btn ${fav ? "on" : ""}" data-fav="${esc(key)}" aria-label="${esc(t("a11y.fav"))}">${ic("heart", fav)}</button></div></div>
      <div class="gwrap">
        <div class="gallery" id="gal">${imgs.length ? imgs.map((u, i) => `<img src="${esc(u)}" alt="${esc(t("listing.photoN", { n: i + 1 }))}" ${i > 1 ? 'loading="lazy"' : ""} referrerpolicy="no-referrer" onerror="this.remove()">`).join("") : `<div style="width:100%;display:grid;place-items:center;font-size:80px;opacity:.4">${KIND[it.kind]?.em ?? "🏠"}</div>`}</div>
        ${imgs.length > 1 ? `<span class="gcount" id="gc">1 / ${imgs.length}</span>` : ""}
      </div>
      <div class="dsheet">
        <div class="dhead">
          <div class="dprice num"><b>${total != null ? fmt(total) + " €" : esc(t("listing.negotiable"))}</b><span>${esc(t(it.utilities === "included" || (it.utilities === "extra" && it.charges) ? "listing.perMonthUtil" : "listing.perMonth"))}</span></div>
          <div class="dtitle">${esc(it.title)}</div>
          <div class="meta">${[dName, it.address && it.address !== dName ? it.address : null].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("")}</div>
          <div class="pills">${pillsHTML({ ...it, has_phone: (it.phones ?? []).length > 0, deal: r.median && total ? Math.round((total / r.median - 1) * 100) : null })}
            ${(it.tags ?? []).map((x) => `<span class="pill">${esc(tagText(x))}</span>`).join("")}</div>
        </div>

        <div class="card2"><h3>💶 ${esc(t("listing.price"))}</h3>${rows.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}
          ${total != null ? `<div class="kv total"><span>${esc(t("listing.totalMonth"))}</span><b>${fmt(total)} €</b></div>` : ""}
          ${moveIn ? `<div class="kv"><span>${esc(t("listing.moveIn"))}</span><b>${fmt(moveIn)} €</b></div><div class="legend-note">${esc(t(it.commission ? "listing.moveInNoteComm" : "listing.moveInNote"))}</div>` : ""}
          ${market}</div>

        <div class="card2"><h3>📇 ${esc(t("listing.contacts"))}</h3>${contacts}</div>

        <div class="card2"><h3>🏷️ ${esc(t("listing.facts"))}</h3><div class="facts">${facts.map(([k, v]) => `<div class="fact"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div></div>

        ${it.text ? `<div class="card2"><h3>📝 ${esc(t("listing.desc"))} ${I18N.getLang() === "sk" ? "" : `<button class="sort" style="margin-left:auto;font-size:13px" data-tr>${ic("translate")}${esc(t("listing.translate"))}</button>`}</h3>
          <div class="desc ${it.text.length > 420 ? "clamp" : ""}" id="desc">${esc(it.text)}</div>
          ${it.text.length > 420 ? `<button class="sort" style="margin-top:8px" data-more>${esc(t("listing.showAll"))} ${ic("down")}</button>` : ""}</div>` : ""}

        ${it.lat ? `<div class="card2"><h3>📍 ${esc(t("listing.onMap"))}</h3><div class="muted" style="font-size:13.5px">${esc(it.address || dName || "")}</div><div class="minimap" id="mm"></div>
          <button class="sort" style="margin-top:10px" data-gmaps>${ic("ext")}${esc(t("listing.gmaps"))}</button></div>` : ""}

        ${r.reminders?.length ? `<div class="card2"><h3>⏰ ${esc(t("listing.reminders"))}</h3>${r.reminders.map((x) => `<div class="kv"><span>${esc(x.note || t("rem.default"))}</span><b>${esc(x.sent ? t("rem.sent") : dayLabel(x.remind_at) + ", " + timeFmt(x.remind_at))}</b></div>`).join("")}</div>` : ""}

        ${r.similar?.length ? `<div class="group-title" style="margin:20px 32px 10px">${esc(t("listing.similar"))}</div><div class="hscroll">${r.similar.map((s) => cardHTML(s, "cards")).join("")}</div>` : ""}

        <div style="padding:16px 16px 0"><button class="btn sm plain block" data-hide>${ic("eyeoff")}${esc(t("listing.hide"))}</button></div>
      </div>
      <div class="actionbar">
        <button class="btn sq ${fav ? "" : "plain"}" data-fav="${esc(key)}" aria-label="${esc(t("a11y.fav"))}">${ic("heart", fav)}</button>
        <button class="btn plain" data-remind>${ic("clock")}${esc(t("btn.remind"))}</button>
        ${(it.phones ?? []).length ? `<button class="btn good" data-call="${esc(it.phones[0])}">${ic("phone")}${esc(t("btn.call"))}</button>` : `<button class="btn" data-site>${ic("ext")}${esc(t("btn.toSite"))}</button>`}
      </div>`;

    const dtop = $(".dtop", page);
    page.addEventListener("scroll", () => dtop.classList.toggle("solid", page.scrollTop > page.clientWidth * 0.62), { passive: true });
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
      const b = e.target.closest("button, a");
      if (!b) return;
      if (b.dataset.close != null) closeLayer();
      else if (b.dataset.call) call(b.dataset.call);
      else if (b.dataset.copy) copy(b.dataset.copy, t("toast.copiedVal", { v: b.dataset.copy }));
      else if (b.dataset.template != null) copy(TEMPLATE(it.title), t("toast.templateCopied"));
      else if (b.dataset.site != null) openLink(it.url);
      else if (b.dataset.gmaps != null) openLink(`https://www.google.com/maps/search/?api=1&query=${it.lat},${it.lng}`);
      else if (b.dataset.tr != null) openLink(`https://translate.google.com/?sl=sk&tl=${I18N.getLang()}&op=translate&text=${encodeURIComponent(it.text.slice(0, 4500))}`);
      else if (b.dataset.more != null) {
        $("#desc", page).classList.remove("clamp");
        b.remove();
      } else if (b.dataset.remind != null) openRemind(key, it.title);
      else if (b.dataset.share != null) share(it);
      else if (b.dataset.hide != null) hideListing(key);
      else if (b.dataset.fav) {
        const on = st.favs.has(key);
        $$("[data-fav].btn", page).forEach((b) => b.classList.toggle("plain", on));
      }
    };
  }

  function share(it) {
    const link = `https://t.me/share/url?url=${encodeURIComponent(it.url)}&text=${encodeURIComponent(t("share.text", { title: it.title, price: fmt(it.total ?? it.price) }))}`;
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
    toast(t("toast.hidden"));
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
      { name: t("rem.in30"), at: new Date(+now + 30 * 60000) },
      { name: t("rem.in1h"), at: new Date(+now + 60 * 60000) },
      { name: t("rem.in3h"), at: new Date(+now + 3 * 3600000) },
      evening - now > 30 * 60000 ? { name: t("rem.tonight"), at: evening } : { name: t("rem.tomorrowEve"), at: at(19, 0, 1) },
      { name: t("rem.tomorrowMorn"), at: at(9, 0, 1) },
      { name: t("rem.in2d"), at: at(10, 0, 2) },
    ];
    return list.map((p) => ({ ...p, hint: `${dayLabel(p.at, true)}, ${timeFmt(p.at)}` }));
  }
  function openRemind(key, title) {
    if (needAuth()) return;
    const ps = presets();
    let chosen = ps[1].at;
    const notes = ["call", "view", "docs", "reply"].map((k) => t("rem.note." + k));
    const s = sheet(`
      <h2>⏰ ${esc(t("rem.title"))}</h2><p class="lead">${esc(t(title ? "rem.leadListing" : "rem.leadPlain"))}</p>
      ${title ? `<div class="card2" style="margin:0 0 14px;font-size:14px">${esc(title)}</div>` : ""}
      <div class="presets">${ps.map((p, i) => `<button class="preset ${i === 1 ? "on" : ""}" data-i="${i}"><b>${esc(p.name)}</b><small>${esc(p.hint)}</small></button>`).join("")}</div>
      <label class="cell card2" style="margin:0 0 12px;gap:10px"><span class="lbl">${esc(t("rem.custom"))}</span><input type="datetime-local" id="r-dt" style="width:auto"></label>
      <textarea id="r-note" maxlength="300" placeholder="${esc(t("rem.notePh"))}"></textarea>
      <div class="dchips" style="margin-top:8px">${notes.map((x) => `<button class="chip" data-note="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      <div class="sheet-foot"><button class="btn block" id="r-save">${ic("bell")}${esc(t("rem.saveBtn", { when: ps[1].hint }))}</button></div>`);
    const btn = $("#r-save", s);
    const setChosen = (d) => {
      chosen = d;
      btn.innerHTML = `${ic("bell")}${esc(t("rem.saveBtn", { when: `${dayLabel(d, true)}, ${timeFmt(d)}` }))}`;
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
      if (chosen < Date.now()) return toast(t("toast.remPast"));
      btn.disabled = true;
      try {
        await api("remind", { key, at: chosen.toISOString(), note: $("#r-note", s).value.trim() });
        haptic.ok();
        if (st.me) st.me.counts.reminders = (st.me.counts.reminders ?? 0) + 1;
        updateTabBadges();
        closeLayer();
        toast(t("toast.remSet", { day: dayLabel(chosen, true), time: timeFmt(chosen) }));
        if (st.tab === "rem") renderReminders();
      } catch {
        btn.disabled = false;
        toast(t("toast.remFail"));
      }
    };
  }

  async function renderReminders(filter = store.get("remFilter", "up")) {
    const scr = $("#screen");
    scr.innerHTML = `
      <header class="top"><div class="top-row"><h1 class="title">${esc(t("rem.header"))}</h1>
        <button class="btn sm" id="r-new">${ic("plus")}${esc(t("btn.new"))}</button></div>
        <div class="seg wide" style="margin-top:12px" id="r-f">
          ${["up", "done", "all"].map((k) => `<button data-f="${k}" class="${filter === k ? "on" : ""}">${esc(t("rem.f." + k))}</button>`).join("\n          ")}</div></header>
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
      $("#r-list").innerHTML = `<div class="empty"><div class="ico">⏰</div><h3>${esc(t("rem.botTitle"))}</h3>${esc(t("rem.botText"))}</div>`;
      return;
    }
    let items;
    try {
      items = (await api("reminders")).items;
    } catch {
      $("#r-list").innerHTML = `<div class="empty"><div class="ico">📡</div><h3>${esc(t("err.noNet"))}</h3></div>`;
      return;
    }
    if (st.me) st.me.counts.reminders = items.filter((i) => !i.sent).length;
    updateTabBadges();
    const shown = items.filter((i) => (filter === "up" ? !i.sent : filter === "done" ? i.sent : true));
    if (!shown.length) {
      $("#r-list").innerHTML = `<div class="empty"><div class="ico">${filter === "done" ? "📭" : "🔔"}</div><h3>${esc(t(filter === "done" ? "rem.emptyDone" : "rem.emptyUp"))}</h3>
        ${esc(t("rem.emptyText"))}</div>`;
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
          <div class="when"><b>${esc(timeFmt(i.remind_at))}</b><small>${esc(i.sent ? t("rem.done") : untilText(i.remind_at, true))}</small></div>
          <div class="what"><b>${esc(i.note || t(i.key ? "rem.viewListing" : "rem.default"))}</b>
            ${i.key ? `<button class="lst" data-open="${esc(i.key)}" style="width:100%;text-align:left">${i.img ? `<img src="${esc(i.img)}" alt="" referrerpolicy="no-referrer">` : ""}<span><b class="num">${i.total != null ? fmt(i.total) + " €" : ""}</b> ${esc(i.title ?? "")}</span></button>` : ""}
          </div>
          <button class="icon-btn" data-del="${i.id}" aria-label="${esc(t("a11y.delete"))}" style="box-shadow:none;background:none;color:var(--hint)">${ic("trash")}</button>
        </div>`).join("")}</div>`).join("");
    $("#r-list").onclick = async (e) => {
      const d = e.target.closest("[data-del]");
      if (!d) return;
      haptic.tap();
      await api("remind_del", { id: d.dataset.del });
      d.closest(".rem").remove();
      toast(t("toast.remDeleted"));
      if (st.me) st.me.counts.reminders = Math.max(0, (st.me.counts.reminders ?? 1) - 1);
      updateTabBadges();
    };
  }

  // ---------------------------------------------------------------- избранное
  async function renderFavs() {
    const scr = $("#screen");
    scr.innerHTML = `<header class="top"><div class="top-row"><h1 class="title">${esc(t("favs.title"))}</h1></div><div class="subtitle" id="fav-sub">&nbsp;</div></header>
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
      $("#fav-list").innerHTML = `<div class="empty"><div class="ico">📡</div><h3>${esc(t("err.noNet"))}</h3></div>`;
      return;
    }
    st.favs = new Set(items.map((i) => i.key));
    store.set("favs", [...st.favs]);
    $("#fav-sub").textContent = items.length ? tp("n.listings", items.length) : "";
    $("#fav-list").innerHTML = items.length
      ? items.map((i) => cardHTML(i, "list")).join("")
      : `<div class="empty"><div class="ico">💛</div><h3>${esc(t("favs.emptyTitle"))}</h3>${esc(t("favs.emptyText"))}</div>`;
  }

  // ---------------------------------------------------------------- рынок
  async function renderMarket() {
    const scr = $("#screen");
    const head = `<header class="top"><div class="top-row"><h1 class="title">${esc(t("market.title"))}</h1></div><div class="subtitle">${esc(t("market.sub"))}</div></header>`;
    scr.innerHTML = `${head}
      <div class="stats">${'<div class="stat"><div class="sk" style="height:46px"></div></div>'.repeat(4)}</div>`;
    let s;
    try {
      s = await api("stats");
    } catch {
      scr.insertAdjacentHTML("beforeend", `<div class="empty"><div class="ico">📡</div><h3>${esc(t("err.noNet"))}</h3></div>`);
      return;
    }
    const T = s.totals ?? {};
    const kindStats = Object.fromEntries((s.byKind ?? []).map((k) => [k.kind, k]));
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const byCity = s.byCity ?? [];
    const maxD = Math.max(...byCity.map((d) => +d.median), 1);
    const maxDay = Math.max(...(s.perDay ?? []).map((d) => d.n), 1);
    const maxSrc = Math.max(...(s.bySource ?? []).map((d) => d.n), 1);
    const cheapest = byCity[0];
    const budget = st.settings?.maxTotal ?? 650;
    const okCities = byCity.filter((d) => d.median <= budget).length;

    scr.innerHTML = `${head}
      <div class="stats">
        <div class="stat"><small>${esc(t("stat.listings"))}</small><b>${fmt(T.total)}</b><span>${esc(t("stat.in30"))}</span></div>
        <div class="stat"><small>${esc(t("stat.new"))}</small><b>${fmt(T.new24)}</b><span>${esc(t("stat.in24"))}</span></div>
        <div class="stat"><small>${esc(t("stat.private"))}</small><b>${pct(T.private, T.total)}%</b><span>${esc(tp("n.listings", T.private ?? 0, { n: fmt(T.private) }))}</span></div>
        <div class="stat"><small>${esc(t("stat.withPhone"))}</small><b>${pct(T.with_phone, T.total)}%</b><span>${esc(t("stat.canCall"))}</span></div>
      </div>

      <div class="group-title">${esc(t("market.medianUtil"))}</div>
      <div class="stats">${KINDS.filter((k) => kindStats[k.k]).map((k) => `
        <div class="stat"><small>${k.em} ${esc(k.name)}</small><b>${fmt(kindStats[k.k].median)} €</b><span>${esc(t("market.kindLine", { min: fmt(kindStats[k.k].min), n: fmt(kindStats[k.k].n) }))}</span></div>`).join("")}</div>

      ${cheapest ? `<div class="card2" style="margin-top:14px"><h3>💡 ${esc(t("market.tipTitle"))}</h3><div style="font-size:14.5px">${esc(t("market.tip", { city: "\u0000", median: fmt(cheapest.median) })).replace("\u0000", `<b>${esc(cheapest.city_name)}</b>`)}${budget < NO_LIMIT ? " " + esc(tp("market.tipBudget", okCities, { budget: fmt(budget), total: byCity.length })) : ""}</div></div>` : ""}

      <div class="group-title">${esc(t("market.byCity"))}</div>
      <div class="card2"><div class="hbars" id="hb">${byCity.map((d) => `
        <button class="hbar" data-d="${esc(d.city)}" title="${esc(t("market.barTitle", { city: d.city_name, median: fmt(d.median), count: tp("n.listings", d.n, { n: fmt(d.n) }) }))}">
          <span class="nm">${esc(d.city_name)}</span>
          <span class="tr"><i style="width:${(d.median / maxD) * 100}%"></i></span><span class="v">${fmt(d.median)} €</span></button>`).join("")}</div>
        <div class="legend-note">${esc(t("market.byCityNote"))}</div></div>

      <div class="group-title">${esc(t("market.perDay"))}</div>
      <div class="card2"><div class="vbars">${(s.perDay ?? []).map((d, i, a) => `
        <div class="vb" title="${esc(dateFmt(d.day, { day: "numeric", month: "long" }))}: ${d.n}">${i === a.length - 1 || (d.n === maxDay && i < a.length - 2) ? `<span class="tip num">${d.n}</span>` : ""}<i style="height:${(d.n / maxDay) * 100}%"></i><span>${new Date(d.day).getDate()}</span></div>`).join("")}</div>
        <div class="legend-note">${esc(t("market.perDayNote"))}</div></div>

      <div class="group-title">${esc(t("market.sources"))}</div>
      <div class="card2"><div class="hbars">${(s.bySource ?? []).map((d) => `
        <div class="hbar"><span class="nm">${esc(SOURCES[d.source] ?? d.source)}</span><span class="tr"><i style="width:${(d.n / maxSrc) * 100}%"></i></span><span class="v">${fmt(d.n)}</span></div>`).join("")}</div></div>
      <div style="height:12px"></div>`;
    $("#hb").onclick = (e) => {
      const b = e.target.closest("[data-d]");
      if (!b || !b.dataset.d) return;
      haptic.tap();
      Object.assign(st.filters, { regions: [], cities: [b.dataset.d], districts: [], kinds: ["studio", "flat"] });
      go("feed");
    };
  }

  // ---------------------------------------------------------------- настройки
  async function saveSettings(onboarded = false) {
    st.settings = { ...st.settings, lang: I18N.getLang() };
    store.set("settings", st.settings);
    if (!inTG) return;
    try {
      const r = await api("settings", { settings: st.settings, onboarded });
      st.settings = r.settings;
      if (st.me) st.me.onboarded = st.me.onboarded || onboarded;
    } catch {
      toast(t("toast.serverSaveFail"));
    }
  }

  // ---------------------------------------------------------------- язык
  const langInfo = (code) => {
    const w = window.FBWelcome?.LANGS?.find((l) => l.code === code);
    const base = I18N.LANGS.find((l) => l.code === code);
    return { code, name: w?.name ?? base?.name ?? code, flag: w?.flagSvg ?? "" };
  };
  // смена языка: сохраняем, перерисовываем таббар и текущую вкладку
  function setLanguage(code, { save = false } = {}) {
    const prev = I18N.getLang();
    const lang = I18N.setLang(code);
    document.documentElement.lang = lang;
    document.title = t("app.title");
    if (st.settings) st.settings = { ...st.settings, lang };
    if (save) saveSettings();
    if (lang !== prev && st.defaults && !$("#tabbar").hidden) go(st.tab, { keepDraft: true });
    return lang;
  }
  function openLanguage() {
    haptic.soft();
    const cur = I18N.getLang();
    const s = sheet(`<h2>${esc(t("settings.lang"))}${cur === "en" ? "" : " / Language"}</h2><div class="opts" style="margin-top:12px">${I18N.CODES.map(langInfo).map((l) => `
      <button class="opt row-opt ${cur === l.code ? "on" : ""}" data-lang="${l.code}">${l.flag ? `<span class="lang-flag">${l.flag}</span>` : ""}<div style="flex:1"><b>${esc(l.name)}</b></div><span class="tick">${ic("check")}</span></button>`).join("")}</div>`);
    s.onclick = (e) => {
      const b = e.target.closest("[data-lang]");
      if (!b) return;
      haptic.soft();
      closeLayer();
      if (b.dataset.lang !== cur) setLanguage(b.dataset.lang, { save: true });
    };
  }

  let settingsDraft = null; // несохранённые правки настроек переживают смену языка
  function renderSettings({ keepDraft = false } = {}) {
    const s = keepDraft && settingsDraft ? settingsDraft : structuredClone(st.settings);
    settingsDraft = s;
    const n = s.notify;
    const name = st.me?.name || tg?.initDataUnsafe?.user?.first_name || t("settings.guest");
    const scr = $("#screen");
    const modeHint = (m) => t("modeHint." + m);
    const lang = langInfo(I18N.getLang());
    scr.innerHTML = `
      <header class="top"><div class="top-row"><h1 class="title">${esc(t("settings.title"))}</h1></div></header>
      <div class="group"><div class="cell"><div class="avatar">${esc(name[0] ?? "?")}</div><div class="lbl"><b>${esc(name)}</b><small>${esc(inTG ? (n.mode === "off" ? t("settings.notifOff") : t("settings.notifOn", { hint: modeHint(n.mode) })) : t("settings.viewMode"))}</small></div></div></div>

      <div class="group">
        <button class="cell" id="s-lang"><span class="ic lang-ic" style="background:${lang.flag ? "none" : "#2f6bff"}">${lang.flag || "🌐"}</span><span class="lbl">${esc(t("settings.lang"))}${I18N.getLang() === "en" ? "" : " / Language"}<small>${esc(lang.name)}</small></span>${ic("chev").replace("<svg", '<svg class="chev"')}</button>
      </div>

      <div class="group-title">${esc(t("settings.what"))}</div>
      <div class="group-note">${esc(t("settings.whatNote"))}</div>
      <div class="group"><div class="cell col">${kindsHTML(s.kinds)}</div></div>
      <div class="group"><div class="cell col"><span class="muted" style="font-size:13px">${esc(t("filters.budget"))}</span>${budgetHTML(s.maxTotal, "sb")}</div></div>
      <div class="group">
        <button class="cell" id="s-d"><span class="ic" style="background:#ff8a3d">📍</span><span class="lbl">${esc(t("loc.title"))}<small id="s-dl">${esc(locLabel(s))}</small></span>${ic("chev").replace("<svg", '<svg class="chev"')}</button>
        ${switchCell("withPhone", "📞", "#12a46c", t("filters.onlyPhone"), "", s.withPhone)}
        ${switchCell("withPhoto", "📷", "#7a5cff", t("filters.onlyPhoto"), "", s.withPhoto)}
      </div>
      <div class="group"><div class="cell col">${agencyHTML(s.agency)}</div></div>

      <div class="group-title">${esc(t("settings.notif"))}</div>
      <div class="group"><div class="cell col">
        <div class="seg wide" id="s-mode">${[["instant", "⚡"], ["digest", "📬"], ["off", "🔕"]].map(([k, em]) => `<button data-m="${k}" class="${n.mode === k ? "on" : ""}">${em} ${esc(t("mode." + k))}</button>`).join("")}</div>
        <small class="muted" id="s-mh" style="margin-top:8px">${esc(modeHint(n.mode))}</small></div>
        <div class="cell col" id="s-times" ${n.mode === "digest" ? "" : "hidden"}><span>${esc(t("settings.digestTimes"))}</span>
          <div class="dchips" style="margin-top:8px" id="s-tl"></div>
          <div style="display:flex;gap:8px;margin-top:10px"><input type="time" id="s-tnew" value="21:00"><button class="btn sm ghost" id="s-tadd">${ic("plus")}${esc(t("btn.add"))}</button></div></div>
        ${switchCell("quiet", "🌙", "#5856d6", t("settings.quiet"), t("settings.quietSub"), n.quiet.on)}
        <div class="cell" id="s-q" ${n.quiet.on ? "" : "hidden"}><span class="lbl">${esc(t("settings.from"))}</span><input type="time" id="s-qf" value="${n.quiet.from}" style="width:auto"><span class="lbl" style="flex:none">${esc(t("settings.to"))}</span><input type="time" id="s-qt" value="${n.quiet.to}" style="width:auto"></div>
        <button class="cell" id="s-preview"><span class="ic" style="background:linear-gradient(135deg,#ffb020,#ff6a3d)">⚡</span><span class="lbl">${esc(t("settings.preview"))}</span>${ic("chev").replace("<svg", '<svg class="chev"')}</button>
        <button class="cell" id="s-test"><span class="ic" style="background:#2f6bff">🔔</span><span class="lbl">${esc(t("settings.test"))}</span></button>
      </div>

      <div class="group-title">${esc(t("settings.other"))}</div>
      <div class="group">
        <button class="cell" id="s-onb"><span class="ic" style="background:#12a46c">✨</span><span class="lbl">${esc(t("settings.redo"))}</span>${ic("chev").replace("<svg", '<svg class="chev"')}</button>
        ${st.me?.isAdmin ? `<button class="cell" id="s-admin"><span class="ic" style="background:#1c2333">🛡️</span><span class="lbl">Админ-панель<small>пользователи и их действия — видно только вам</small></span>${ic("chev").replace("<svg", '<svg class="chev"')}</button>` : ""}
      </div>
      <div style="padding:6px 16px 16px"><button class="btn block" id="s-save">${ic("check")}${esc(t("btn.save"))}</button></div>`;

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
    $("#s-d").onclick = () => openLocation(s, () => ($("#s-dl").textContent = locLabel(s)));
    $("#s-mode").onclick = (e) => {
      const b = e.target.closest("[data-m]");
      if (!b) return;
      haptic.soft();
      n.mode = b.dataset.m;
      $$("#s-mode button").forEach((x) => x.classList.toggle("on", x === b));
      $("#s-mh").textContent = modeHint(n.mode);
      $("#s-times").hidden = n.mode !== "digest";
    };
    const paintTimes = () => {
      n.digestTimes.sort();
      $("#s-tl").innerHTML = n.digestTimes.map((x) => `<button class="chip on" data-t="${x}">${x} <span class="x">${ic("x")}</span></button>`).join("");
    };
    paintTimes();
    $("#s-tl").onclick = (e) => {
      const b = e.target.closest("[data-t]");
      if (!b) return;
      if (n.digestTimes.length === 1) return toast(t("toast.needTime"));
      n.digestTimes = n.digestTimes.filter((x) => x !== b.dataset.t);
      haptic.soft();
      paintTimes();
    };
    $("#s-tadd").onclick = () => {
      const v = $("#s-tnew").value;
      if (!v || n.digestTimes.includes(v)) return;
      if (n.digestTimes.length >= 6) return toast(t("toast.maxDigests"));
      n.digestTimes.push(v);
      haptic.soft();
      paintTimes();
    };
    $("#s-qf").onchange = (e) => (n.quiet.from = e.target.value);
    $("#s-qt").onchange = (e) => (n.quiet.to = e.target.value);
    $("#s-preview").onclick = () => {
      haptic.tap();
      const sh = sheet(`<div id="np-sheet" style="padding-top:6px"></div>
        <div class="sheet-foot"><button class="btn block" id="np-test">🔔 ${esc(t("settings.test"))}</button></div>`);
      window.FBNotifyPreview?.mount($("#np-sheet", sh), I18N.getLang());
      $("#np-test", sh).onclick = () => (closeLayer(), $("#s-test")?.click());
    };
    $("#s-test").onclick = async () => {
      if (needAuth()) return;
      try {
        await api("notify_test");
        haptic.ok();
        toast(t("toast.testSent"));
      } catch {
        toast(t("toast.testFail"));
      }
    };
    $("#s-lang").onclick = openLanguage;
    $("#s-onb").onclick = () => onboarding();
    $("#s-admin")?.addEventListener("click", () => (haptic.tap(), window.FBAdmin?.open()));
    $("#s-save").onclick = async () => {
      st.settings = s;
      st.filters = filtersFrom(s);
      settingsDraft = null;
      await saveSettings();
      haptic.ok();
      toast(t(inTG ? "toast.saved" : "toast.savedLocal"));
    };
  }

  // ---------------------------------------------------------------- онбординг: 3 коротких шага
  function onboarding() {
    const s = structuredClone(st.settings);
    let step = 0, count = null;
    const STEPS = [
      { em: "📍", h: t("onb.s1.h"), p: t("onb.s1.p") },
      { em: "🏠", h: t("onb.s2.h"), p: t("onb.s2.p") },
      { em: "🔔", h: t("onb.s3.h"), p: t("onb.s3.p") },
    ];
    const ov = el(`<div class="onb3">
      <div class="onb3-hero"><div class="onb3-bar">${STEPS.map(() => "<i></i>").join("")}<button id="ob-skip">${esc(t("onb.skip"))}</button></div>
        <div class="onb3-head"><span class="em"></span><div><h1></h1><p></p></div></div></div>
      <div class="onb3-body"></div>
      <div class="onb3-foot"><button class="btn plain back" id="ob-back" aria-label="${esc(t("a11y.back"))}">${ic("back")}</button><button class="btn" id="ob-next"></button></div></div>`);
    $("#layer").append(ov);
    const body = $(".onb3-body", ov);
    const next = $("#ob-next", ov);

    const label = () => {
      const n = count == null ? "" : `<small>· ${esc(tp("onb.variants", count, { n: fmt(count) }))}</small>`;
      next.innerHTML = esc(t(step < STEPS.length - 1 ? "onb.next" : "onb.start")) + n;
    };
    const recount = () => liveCount(filtersFrom(s), (n) => {
      count = n;
      label();
    });

    function render(dir = 1) {
      const S0 = STEPS[step];
      $$(".onb3-bar i", ov).forEach((x, i) => x.classList.toggle("on", i <= step));
      $(".onb3-head .em", ov).textContent = S0.em;
      $(".onb3-head h1", ov).textContent = S0.h;
      $(".onb3-head p", ov).textContent = S0.p;
      $("#ob-back", ov).hidden = step === 0;
      $("#ob-skip", ov).hidden = step === STEPS.length - 1;
      body.innerHTML = `<div class="onb-step ${dir < 0 ? "back" : ""}"></div>`;
      const b = body.firstChild;
      body.scrollTop = 0;
      if (step === 0) {
        locPicker(b, s, recount);
      } else if (step === 1) {
        b.innerHTML = `<div class="label">${esc(t("onb.kind"))}</div>${kinds4HTML(s.kinds)}
          <div class="label" style="margin-top:20px">${esc(t("onb.budget"))}</div><div class="card2" style="padding:16px">${budgetHTML(s.maxTotal, "ob")}</div>
          <div class="label" style="margin-top:20px">${esc(t("filters.who"))}</div>${agencySegHTML(s.agency)}
          <div class="muted" style="font-size:12.5px;margin-top:8px">${esc(t("onb.agencyNote"))}</div>`;
        bindKinds(b, s);
        b.addEventListener("click", (e) => e.target.closest("[data-kind]") && recount());
        bindBudget(b, "ob", s, recount);
        bindAgency(b, s);
        b.addEventListener("click", (e) => e.target.closest("[data-agency]") && recount());
      } else {
        const modes = [
          ["instant", "⚡", t("mode.instant"), t("onb.mode.instantHint")],
          ["digest", "📬", t("mode.digest"), t("onb.mode.digestHint")],
          ["off", "🔕", t("onb.mode.off"), t("onb.mode.offHint")],
        ];
        b.innerHTML = `<div id="ob-np" style="margin-bottom:18px"></div><div class="opts">${modes.map(([k, em, name, h]) => `
            <button class="opt row-opt ${s.notify.mode === k ? "on" : ""}" data-m="${k}"><div class="em">${em}</div><div style="flex:1"><b>${esc(name)}</b><small>${esc(h)}</small></div><span class="tick">${ic("check")}</span></button>`).join("")}</div>
          <div class="group" style="margin:14px 0 0">${switchCell("quiet", "🌙", "#5856d6", t("onb.quiet"), t("onb.quietSub"), s.notify.quiet.on)}</div>
          <div class="card2" style="margin-top:14px;font-size:14px"><b>${esc(t("onb.yourSearch"))}</b> ${esc(locLabel(s))} · ${esc(s.kinds.length === 4 ? t("onb.anyKind") : s.kinds.map((k) => KIND[k].short.toLowerCase()).join(", "))} · ${esc(budgetText(s.maxTotal).toLowerCase())}${s.agency === "private" ? ` · ${esc(t("onb.private"))}` : s.agency === "agency" ? ` · ${esc(t("onb.agency"))}` : ""}</div>`;
        window.FBNotifyPreview?.mount($("#ob-np", b), I18N.getLang());
        b.addEventListener("click", (e) => {
          const m = e.target.closest("[data-m]");
          if (!m) return;
          haptic.soft();
          s.notify.mode = m.dataset.m;
          $$("[data-m]", b).forEach((x) => x.classList.toggle("on", x === m));
        });
        $("input[data-sw=quiet]", b).onchange = (e) => (s.notify.quiet.on = e.target.checked);
      }
      if (tg?.BackButton) step > 0 ? tg.BackButton.show() : tg.BackButton.hide();
      label();
    }

    const back = () => {
      if (step === 0) return;
      step--;
      haptic.tap();
      render(-1);
    };
    async function finish() {
      st.settings = s;
      st.filters = filtersFrom(s);
      store.set("onboarded", true);
      haptic.ok();
      tg?.BackButton?.offClick?.(back);
      ov.style.transition = "opacity .25s";
      ov.style.opacity = "0";
      setTimeout(() => ov.remove(), 260);
      syncBack();
      if (inTG && s.notify.mode !== "off" && tg.requestWriteAccess) {
        try {
          tg.requestWriteAccess();
        } catch { /* старый клиент */ }
      }
      await saveSettings(true);
      go("feed");
    }
    next.onclick = () => {
      haptic.tap();
      if (step === STEPS.length - 1) return finish();
      step++;
      render(1);
    };
    $("#ob-back", ov).onclick = back;
    $("#ob-skip", ov).onclick = finish;
    tg?.BackButton?.onClick(back);
    render();
    recount();
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
    document.documentElement.lang = I18N.getLang();
    document.title = t("app.title");
    $("#screen").innerHTML = `<header class="top"><h1 class="title">${esc(t("app.title"))}</h1></header><div class="feed">${skeletons("cards")}</div>`;
    try {
      st.boot = await api("bootstrap", { platform: tg?.platform ?? "web" });
    } catch {
      $("#screen").innerHTML = `<div class="empty" style="padding-top:120px"><div class="ico">📡</div><h3>${esc(t("err.server"))}</h3>${esc(t("err.serverText"))}<br><br><button class="btn sm" onclick="location.reload()">${ic("refresh")}${esc(t("btn.reload"))}</button></div>`;
      return;
    }
    st.me = st.boot.me;
    st.defaults = st.boot.defaults;
    Object.assign(geo, { regions: st.boot.regions, cities: st.boot.cities, districts: st.boot.districts });
    st.lastCheck = st.boot.lastCheck;
    st.settings = st.me?.settings ?? store.get("settings", null) ?? structuredClone(st.defaults);
    st.filters = filtersFrom(st.settings);
    if (st.me) {
      st.favs = new Set(st.me.favorites);
      store.set("favs", st.me.favorites);
    }
    const onboarded = st.me ? st.me.onboarded : store.get("onboarded", false);
    // язык: локальный выбор → сохранённый на сервере → экран приветствия для новичков
    if (!I18N.hasSaved() && I18N.norm(st.me?.settings?.lang)) setLanguage(st.me.settings.lang);
    if (!I18N.hasSaved() && !onboarded && window.FBWelcome?.show) {
      try {
        setLanguage(await window.FBWelcome.show({ current: I18N.getLang() }));
      } catch { /* экран приветствия не открылся — остаёмся на текущем языке */ }
    }
    renderTabs();
    go("feed");
    if (!onboarded) onboarding();

    // ссылка на конкретное объявление: #l=bazos:123 или start_param бота
    const fromHash = new URLSearchParams(location.hash.slice(1)).get("l");
    const fromStart = tg?.initDataUnsafe?.start_param?.startsWith("l_") ? tg.initDataUnsafe.start_param.slice(2).replace("_", ":") : null;
    const key = fromHash || fromStart;
    if (key && onboarded) openListing(key);
  }
  // для админ-панели (admin.js): небольшой набор внутренних помощников
  window.FBApp = { api, pushLayer, closeLayer, sheet, toast, haptic, el, esc, $, $$, fmt, ago, ic, openListing, locLabel, budgetText };
  start();
})();
