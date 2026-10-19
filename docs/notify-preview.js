/* Превью уведомления для онбординга и настроек: показывает, как объявление
   прилетит в чат с ботом, и почему это быстрее, чем сидеть на сайтах.
   window.FBNotifyPreview.mount(el, lang?) — нарисовать и проиграть анимацию. */
(() => {
  "use strict";

  const T = {
    ru: {
      title: "Узнавайте о квартирах первыми",
      sub: "Новое объявление приходит в чат через 5–10 минут после публикации — пока остальные ещё обновляют сайты.",
      bot: "Аренда в Словакии", botSub: "бот",
      listing: "2-izbový byt s balkónom, Ružinov",
      price: "<b>620 €</b> с энергиями ✓",
      place: "📍 Bratislava · Ružinov · 52 м²",
      who: "👤 Частник, без комиссии",
      kb: ["📞 Позвонить", "📋 Номер", "📱 Подробнее", "🔗 На сайте"],
      line: [["14:02", "объявление опубликовано на bazos.sk"], ["14:08", "уже у вас в Telegram — можно звонить ⚡"], ["вечером", "его увидят те, кто ищет вручную"]],
    },
    en: {
      title: "Be the first to know",
      sub: "New listings land in your chat 5–10 minutes after they're posted — while everyone else is still refreshing websites.",
      bot: "Rentals in Slovakia", botSub: "bot",
      listing: "2-izbový byt s balkónom, Ružinov",
      price: "<b>€620</b> utilities included ✓",
      place: "📍 Bratislava · Ružinov · 52 m²",
      who: "👤 Private owner, no fee",
      kb: ["📞 Call", "📋 Number", "📱 Details", "🔗 Website"],
      line: [["14:02", "listing posted on bazos.sk"], ["14:08", "already in your Telegram — call now ⚡"], ["evening", "people searching by hand finally see it"]],
    },
    sk: {
      title: "Dozviete sa o bytoch ako prví",
      sub: "Nový inzerát vám príde do chatu 5–10 minút po zverejnení — kým ostatní ešte obnovujú stránky.",
      bot: "Prenájom na Slovensku", botSub: "bot",
      listing: "2-izbový byt s balkónom, Ružinov",
      price: "<b>620 €</b> vrátane energií ✓",
      place: "📍 Bratislava · Ružinov · 52 m²",
      who: "👤 Súkromná osoba, bez provízie",
      kb: ["📞 Zavolať", "📋 Číslo", "📱 Detail", "🔗 Na webe"],
      line: [["14:02", "inzerát zverejnený na bazos.sk"], ["14:08", "už je vo vašom Telegrame — môžete volať ⚡"], ["večer", "uvidia ho tí, čo hľadajú ručne"]],
    },
    uk: {
      title: "Дізнавайтеся про квартири першими",
      sub: "Нове оголошення приходить у чат через 5–10 хвилин після публікації — поки інші ще оновлюють сайти.",
      bot: "Оренда у Словаччині", botSub: "бот",
      listing: "2-izbový byt s balkónom, Ružinov",
      price: "<b>620 €</b> з енергіями ✓",
      place: "📍 Bratislava · Ružinov · 52 м²",
      who: "👤 Власник, без комісії",
      kb: ["📞 Подзвонити", "📋 Номер", "📱 Детальніше", "🔗 На сайті"],
      line: [["14:02", "оголошення опубліковано на bazos.sk"], ["14:08", "вже у вашому Telegram — можна дзвонити ⚡"], ["увечері", "його побачать ті, хто шукає вручну"]],
    },
    be: {
      title: "Даведвайцеся пра кватэры першымі",
      sub: "Новае аб'ява прыходзіць у чат праз 5–10 хвілін пасля публікацыі — пакуль іншыя яшчэ абнаўляюць сайты.",
      bot: "Арэнда ў Славакіі", botSub: "бот",
      listing: "2-izbový byt s balkónom, Ružinov",
      price: "<b>620 €</b> з энергіяй ✓",
      place: "📍 Bratislava · Ružinov · 52 м²",
      who: "👤 Уласнік, без камісіі",
      kb: ["📞 Патэлефанаваць", "📋 Нумар", "📱 Падрабязней", "🔗 На сайце"],
      line: [["14:02", "аб'ява апублікавана на bazos.sk"], ["14:08", "ужо ў вашым Telegram — можна тэлефанаваць ⚡"], ["увечары", "яе ўбачаць тыя, хто шукае ўручную"]],
    },
  };

  const pick = (lang) => T[lang] || T[(window.I18N && window.I18N.getLang && window.I18N.getLang()) || "ru"] || T.ru;
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function html(lang) {
    const t = pick(lang);
    return `<div class="fbn">
      <div class="fbn-head"><span class="fbn-bolt">⚡</span><div><b>${t.title}</b><span>${t.sub}</span></div></div>
      <div class="fbn-chat" aria-hidden="true">
        <div class="fbn-bar"><span class="fbn-ava">🏠</span><div><b>${t.bot}</b><small>${t.botSub}</small></div></div>
        <div class="fbn-body"><div class="fbn-typing"><i></i><i></i><i></i></div></div>
      </div>
      <div class="fbn-line">${t.line.map(([tm, tx], i) => `
        <div class="fbn-step ${i === 1 ? "me" : ""}"><span class="tm">${tm}</span><span class="dot"></span><span class="tx">${tx}</span></div>`).join("")}</div>
    </div>`;
  }

  function message(t) {
    return `<div class="fbn-msg">
      <div class="fbn-bubble">
        <div class="fbn-photo"><span class="new">NEW</span><span class="win"></span><span class="sofa">🛋️</span><span class="plant">🪴</span></div>
        <div class="fbn-text"><div class="t">🏠 ${t.listing}</div>💶 ${t.price}<br>${t.place}<br>${t.who}<br>☎️ +421 9•• ••• •••</div>
        <div class="fbn-time">14:08</div>
      </div>
      <div class="fbn-kb">${t.kb.map((k) => `<span>${k}</span>`).join("")}</div>
    </div>`;
  }

  function mount(el, lang) {
    if (!el) return;
    const t = pick(lang);
    el.innerHTML = html(lang);
    const body = el.querySelector(".fbn-body");
    const show = () => {
      if (body.isConnected) body.innerHTML = message(t);
    };
    if (reduce()) show();
    else setTimeout(show, 1100);
  }

  window.FBNotifyPreview = { html, mount };
})();
