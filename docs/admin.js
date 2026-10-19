/* Админ-панель: пользователи, их настройки и действия.
   Доступ проверяет сервер (flatbot.meta.admins); здесь — только интерфейс.
   Панель видит один человек — владелец бота, поэтому тексты только на русском. */
(() => {
  "use strict";
  const A = () => window.FBApp;

  // тип события → [иконка, подпись, системное ли (бот сам что-то отправил)]
  const TYPES = {
    app_open: ["📱", "открыл приложение"],
    onboarded: ["🎉", "прошёл настройку"],
    settings: ["⚙️", "изменил настройки"],
    view: ["👀", "смотрел объявление"],
    fav_add: ["❤️", "добавил в избранное"],
    fav_remove: ["💔", "убрал из избранного"],
    hide: ["🙈", "скрыл объявление"],
    unhide: ["👁️", "вернул объявление"],
    remind_add: ["⏰", "создал напоминание"],
    remind_del: ["🗑️", "удалил напоминание"],
    notify_test: ["🧪", "запросил тестовое уведомление"],
    command: ["⌨️", "команда боту"],
    message: ["💬", "написал боту"],
    stop: ["⛔", "отписался (/stop)"],
    blocked: ["🚫", "заблокировал бота"],
    admin_granted: ["🛡️", "получил права админа"],
    notified: ["📨", "получил уведомление", true],
    notify_failed: ["⚠️", "уведомление не доставлено", true],
    digest: ["📬", "получил подборку", true],
    reminder_sent: ["🔔", "получил напоминание", true],
  };
  const LANG_FLAG = { ru: "🇷🇺", en: "🇬🇧", sk: "🇸🇰", uk: "🇺🇦", be: "🇧🇾" };
  const MODE = { instant: "сразу", digest: "подборкой", off: "уведомления выкл." };
  const KIND = { room: "комнаты", studio: "студии", flat: "квартиры", hostel: "общежития" };

  const when = (iso) => new Date(iso).toLocaleString("ru-RU", { timeZone: "Europe/Bratislava", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const dayOf = (iso) => new Date(iso).toLocaleDateString("ru-RU", { timeZone: "Europe/Bratislava", weekday: "short", day: "numeric", month: "long" });
  const initials = (n) => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  function filterLine(s) {
    const { locLabel, budgetText } = A();
    const kinds = s.kinds.length === 4 ? "любое жильё" : s.kinds.map((k) => KIND[k]).join(", ");
    const ag = s.agency === "private" ? " · частники" : s.agency === "agency" ? " · агентства" : "";
    return `${locLabel(s)} · ${kinds} · ${budgetText(s.maxTotal).toLowerCase()}${ag} · ${MODE[s.notify.mode]}`;
  }

  function detail(e) {
    const { esc } = A();
    const d = e.data || {};
    if (e.title) return esc(e.title);
    if (e.type === "settings" || e.type === "onboarded") {
      const parts = [];
      if (d.cities?.length || d.regions?.length || d.districts?.length) parts.push([...(d.cities || []), ...(d.regions || []), ...(d.districts || [])].join(", "));
      else parts.push("вся Словакия");
      if (d.maxTotal) parts.push(d.maxTotal >= 10000 ? "любая цена" : `до ${d.maxTotal} €`);
      if (d.mode) parts.push(MODE[d.mode]);
      if (d.langChanged && d.lang) parts.push(`язык ${LANG_FLAG[d.lang] || d.lang}`);
      return esc(parts.join(" · "));
    }
    if (e.type === "remind_add") return esc(`${d.note || "без заметки"} → ${when(d.at)}`);
    if (e.type === "command") return esc(d.cmd || "");
    if (e.type === "message") return esc(`«${d.text || ""}»`);
    if (e.type === "digest") return esc(`${d.n} объявлений`);
    if (e.type === "app_open" && d.platform) return esc(d.platform);
    if (e.type === "notify_failed") return esc(d.error || "");
    return "";
  }

  function eventRow(e, withUser) {
    const { esc, ago } = A();
    const [icon, label, sys] = TYPES[e.type] || ["•", e.type];
    const who = withUser ? `<b class="adm-who" data-user="${e.chat_id}">${esc(e.name || e.username || e.chat_id)}</b> ` : "";
    const key = e.data?.key;
    return `<div class="adm-ev ${sys ? "sys" : ""}" ${key ? `data-key="${esc(key)}"` : ""}>
      <span class="adm-ic">${icon}</span>
      <div class="adm-evb"><div>${who}${label}</div>${detail(e) ? `<small>${detail(e)}</small>` : ""}</div>
      <time title="${esc(when(e.created_at))}">${esc(ago(e.created_at))}</time></div>`;
  }

  // ---------------------------------------------------------------- страница
  let page, tab = "overview", users = [], q = "", evFilter = "people", liveTimer, lastId = 0;

  function open() {
    const { el, ic, pushLayer, haptic } = A();
    page = el(`<div class="page adm">
      <header class="top"><div class="top-row">
        <button class="icon-btn" data-close aria-label="Назад">${ic("back")}</button>
        <h1 class="title" style="flex:1">🛡️ Админ-панель</h1>
        <button class="icon-btn" data-refresh aria-label="Обновить">${ic("refresh")}</button></div>
        <div class="seg wide" style="margin-top:12px" id="adm-tabs">
          <button data-t="overview">Обзор</button><button data-t="users">Пользователи</button><button data-t="events">Действия</button></div>
      </header>
      <div id="adm-body" style="padding-bottom:24px"></div></div>`);
    pushLayer(page, () => {
      page.classList.add("closing");
      clearInterval(liveTimer);
    });
    page.addEventListener("click", (e) => {
      const b = e.target.closest("button, [data-user], [data-key]");
      if (!b) return;
      if (b.dataset.close != null) return A().closeLayer();
      if (b.dataset.refresh != null) return (haptic.tap(), render());
      if (b.dataset.t) {
        tab = b.dataset.t;
        haptic.soft();
        return render();
      }
      if (b.dataset.user) return openUser(Number(b.dataset.user));
      if (b.dataset.key) return A().openListing(b.dataset.key);
    });
    render();
  }

  async function render() {
    clearInterval(liveTimer);
    page.querySelectorAll("#adm-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
    const body = page.querySelector("#adm-body");
    body.innerHTML = `<div class="stats" style="margin-top:8px">${'<div class="stat"><div class="sk" style="height:46px"></div></div>'.repeat(4)}</div>`;
    try {
      if (tab === "overview") await renderOverview(body);
      else if (tab === "users") await renderUsers(body);
      else await renderEvents(body);
    } catch (e) {
      body.innerHTML = `<div class="empty"><div class="ico">🔒</div><h3>Нет доступа</h3>${e.message === "forbidden" ? "Права админа не подтверждены." : "Не удалось загрузить данные."}</div>`;
    }
  }

  async function renderOverview(body) {
    const { api, fmt, esc } = A();
    const [o, ev] = await Promise.all([api("admin_overview"), api("admin_events", { hideSystem: true })]);
    const k = o.kpi;
    const tile = (label, v, sub) => `<div class="stat"><small>${label}</small><b>${fmt(v)}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
    const maxU = Math.max(1, ...o.perDay.map((d) => d.users));
    const maxN = Math.max(1, ...o.perDay.map((d) => d.notified));
    const bars = (key, max) => `<div class="vbars">${o.perDay.map((d, i, a) => `
      <div class="vb" title="${esc(new Date(d.day).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }))}: ${d[key]}">${i === a.length - 1 ? `<span class="tip num">${d[key]}</span>` : ""}<i style="height:${(d[key] / max) * 100}%"></i><span>${new Date(d.day).getDate()}</span></div>`).join("")}</div>`;
    const maxT = Math.max(1, ...o.types.map((x) => x.n));
    body.innerHTML = `
      <div class="stats" style="margin-top:8px">
        ${tile("Пользователей", k.users, `${fmt(k.new24)} новых за 24 ч`)}
        ${tile("Активны", k.active, "не заблокировали бота")}
        ${tile("Прошли настройку", k.onboarded, k.users ? `${Math.round((k.onboarded / k.users) * 100)}% от всех` : "")}
        ${tile("За 24 часа", k.dau, `за 7 дней — ${fmt(k.wau)}`)}
        ${tile("Уведомлений", k.notified24, "отправлено за 24 ч")}
        ${tile("Новых объявлений", k.listings24, "найдено за 24 ч")}
      </div>
      <div class="group-title">Активные пользователи по дням</div>
      <div class="card2">${bars("users", maxU)}<div class="legend-note">Люди, которые что-то сделали в боте или приложении (без автоматических рассылок).</div></div>
      <div class="group-title">Отправлено уведомлений по дням</div>
      <div class="card2">${bars("notified", maxN)}</div>
      <div class="group-title">Действия за 7 дней</div>
      <div class="card2"><div class="hbars">${o.types.map((x) => `
        <div class="hbar"><span class="nm">${(TYPES[x.type] || ["•", x.type])[0]} ${esc((TYPES[x.type] || ["", x.type])[1])}</span><span class="tr"><i style="width:${(x.n / maxT) * 100}%"></i></span><span class="v">${fmt(x.n)}</span></div>`).join("") || '<span class="muted">Пока пусто</span>'}</div></div>
      <div class="group-title">Последние действия людей</div>
      <div class="group adm-list">${ev.events.slice(0, 12).map((e) => eventRow(e, true)).join("") || '<div class="cell muted">Пока пусто</div>'}</div>`;
  }

  async function renderUsers(body) {
    const { api, esc, ago, fmt } = A();
    users = (await api("admin_users")).users;
    const paint = () => {
      const f = q.toLowerCase();
      const list = users.filter((u) => !f || `${u.name} ${u.username} ${u.chat_id}`.toLowerCase().includes(f));
      body.querySelector("#adm-ulist").innerHTML = list.map((u) => `
        <button class="adm-user" data-user="${u.chat_id}">
          <span class="avatar ${u.active ? "" : "off"}">${esc(initials(u.name))}</span>
          <div class="adm-ub">
            <div class="adm-un"><b>${esc(u.name || "Без имени")}</b>${u.username ? `<span class="muted">@${esc(u.username)}</span>` : ""}${u.settings.lang ? ` ${LANG_FLAG[u.settings.lang] || ""}` : ""}</div>
            <small>${esc(filterLine(u.settings))}</small>
            <div class="pills">
              ${u.active ? "" : '<span class="pill bad">заблокировал</span>'}
              ${u.onboarded ? "" : '<span class="pill warn">не настроил</span>'}
              <span class="pill">👀 ${fmt(u.views)}</span><span class="pill">❤️ ${fmt(u.favs)}</span><span class="pill">📨 ${fmt(u.notified)}</span>${u.reminders ? `<span class="pill">⏰ ${u.reminders}</span>` : ""}
            </div>
          </div>
          <time>${esc(ago(u.last_seen_at || u.created_at))}</time>
        </button>`).join("") || '<div class="cell muted">Никого не нашлось</div>';
    };
    body.innerHTML = `
      <label class="search" style="margin:8px 16px 0">${A().ic("search")}<input id="adm-q" type="search" placeholder="Имя, @username или id" value="${esc(q)}"></label>
      <div class="count" style="padding:10px 32px 6px">${fmt(users.length)} пользователей · сначала недавно активные</div>
      <div class="group adm-list" id="adm-ulist"></div>`;
    body.querySelector("#adm-q").oninput = (e) => {
      q = e.target.value;
      paint();
    };
    paint();
  }

  async function renderEvents(body) {
    const { api } = A();
    body.innerHTML = `
      <div class="chips" style="margin:6px 0 0;padding:4px 16px">
        ${[["people", "Действия людей"], ["all", "Всё, включая рассылки"], ["view", "👀 Просмотры"], ["fav_add", "❤️ Избранное"], ["settings", "⚙️ Настройки"], ["notified", "📨 Уведомления"]]
          .map(([k, n]) => `<button class="chip ${evFilter === k ? "on" : ""}" data-f="${k}">${n}</button>`).join("")}
      </div>
      <div class="adm-live"><i></i>обновляется автоматически</div>
      <div class="group adm-list" id="adm-evs"></div>
      <div style="text-align:center"><button class="btn sm ghost" id="adm-more">Показать ещё</button></div>`;
    const params = () => (evFilter === "people" ? { hideSystem: true } : evFilter === "all" ? {} : { type: evFilter });
    const list = body.querySelector("#adm-evs");
    let oldest = 0;
    const load = async (more) => {
      const r = await api("admin_events", { ...params(), before: more ? oldest : undefined });
      if (!more) {
        list.innerHTML = r.events.map((e) => eventRow(e, true)).join("") || '<div class="cell muted">Пока пусто</div>';
        lastId = r.events[0]?.id ?? 0;
      } else list.insertAdjacentHTML("beforeend", r.events.map((e) => eventRow(e, true)).join(""));
      oldest = r.events[r.events.length - 1]?.id ?? oldest;
      body.querySelector("#adm-more").hidden = r.events.length < 80;
    };
    body.querySelector(".chips").onclick = (e) => {
      const b = e.target.closest("[data-f]");
      if (!b) return;
      evFilter = b.dataset.f;
      body.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b));
      load(false);
    };
    body.querySelector("#adm-more").onclick = () => load(true);
    await load(false);
    // «живая» лента: раз в 15 секунд подтягиваем новое сверху
    liveTimer = setInterval(async () => {
      if (!page.isConnected) return clearInterval(liveTimer);
      try {
        const r = await api("admin_events", params());
        const fresh = r.events.filter((e) => e.id > lastId);
        if (fresh.length) {
          list.insertAdjacentHTML("afterbegin", fresh.map((e) => eventRow(e, true)).join(""));
          list.querySelectorAll(".adm-ev").forEach((x, i) => i < fresh.length && x.classList.add("fresh"));
          lastId = fresh[0].id;
        }
      } catch { /* попробуем позже */ }
    }, 15000);
  }

  async function openUser(id) {
    const { api, sheet, esc, ago, fmt } = A();
    const s = sheet(`<div id="adm-u"><div class="sk" style="height:120px;margin:10px 0;border-radius:16px"></div></div>`);
    let r;
    try {
      r = await api("admin_user", { id });
    } catch {
      s.querySelector("#adm-u").innerHTML = '<div class="empty">Не удалось загрузить</div>';
      return;
    }
    const u = r.user;
    const groups = new Map();
    for (const e of r.events) {
      const d = dayOf(e.created_at);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(e);
    }
    s.querySelector("#adm-u").innerHTML = `
      <div class="adm-uhead"><span class="avatar ${u.active ? "" : "off"}">${esc(initials(u.name))}</span>
        <div><h2 style="margin:0">${esc(u.name || "Без имени")}</h2>
        <div class="muted">${u.username ? `<a href="https://t.me/${esc(u.username)}" target="_blank" rel="noopener">@${esc(u.username)}</a> · ` : ""}id ${u.chat_id}${u.settings.lang ? ` · ${LANG_FLAG[u.settings.lang] || u.settings.lang}` : ""}</div></div></div>
      <div class="pills" style="margin:10px 0 12px">
        <span class="pill ${u.active ? "good" : "bad"}">${u.active ? "активен" : "заблокировал бота"}</span>
        <span class="pill ${u.onboarded ? "good" : "warn"}">${u.onboarded ? "настройка пройдена" : "не настроил"}</span>
        <span class="pill">с ${esc(when(u.created_at))}</span>
        ${u.last_seen_at ? `<span class="pill">был ${esc(ago(u.last_seen_at))}</span>` : ""}
      </div>
      <div class="card2" style="margin:0 0 12px"><h3>🔎 Фильтр</h3><div style="font-size:14px">${esc(filterLine(u.settings))}</div></div>
      <div class="stats" style="padding:0;margin-bottom:6px">
        <div class="stat"><small>Просмотров</small><b>${fmt(u.views)}</b></div>
        <div class="stat"><small>В избранном</small><b>${fmt(u.favs)}</b></div>
        <div class="stat"><small>Уведомлений</small><b>${fmt(u.notified)}</b></div>
        <div class="stat"><small>Напоминаний</small><b>${fmt(u.reminders)}</b></div>
      </div>
      <h3 style="margin:16px 0 6px">История</h3>
      ${[...groups].map(([d, evs]) => `<div class="daylabel" style="margin:12px 4px 6px">${esc(d)}</div>
        <div class="group adm-list" style="margin:0">${evs.map((e) => eventRow(e, false)).join("")}</div>`).join("") || '<div class="muted">Пока никаких действий</div>'}`;
    s.addEventListener("click", (e) => {
      const k = e.target.closest("[data-key]");
      if (k) A().openListing(k.dataset.key);
    });
  }

  window.FBAdmin = { open };
})();
