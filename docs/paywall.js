/* Экран подписки: 7 дней бесплатно, затем помесячно через Stripe.
   FBPaywall.show({ access, price, onUnlocked }) — полноэкранный слой; закрывается, когда доступ открыт.
   FBPaywall.status(access) — короткая подпись статуса для настроек. Тексты на 5 языках. */
(() => {
  "use strict";

  const T = {
    ru: {
      badge: "7 дней бесплатно", title: "Узнавайте о жилье первыми", sub: "Подписка открывает новые объявления по всей Словакии — в приложении и в чате с ботом.",
      b: ["⚡ Новые объявления в чат за 10 минут", "📍 Любые города и районы Словакии", "📞 Телефоны, контакты и звонок в один тап", "⏰ Напоминания, избранное и карта"],
      today: "Сегодня", todayV: "0 €", after: "Через 7 дней", per: "мес", cancel: "Отменить можно в любой момент — команда /pay в боте.",
      email: "Почта", emailHint: "Пришлём чеки, и по ней проверяется подписка", emailBad: "Проверьте почту",
      ctaTrial: "Начать 7 дней бесплатно", cta: "Оформить подписку", ctaPay: "Оплатить подписку",
      check: "Уже оплатили? Проверить подписку", waiting: "Ждём подтверждение от Stripe…", waitingSub: "Оплата открылась в браузере. Когда закончите — вернитесь сюда, доступ откроется сам.",
      ok: "Готово! Доступ открыт 🎉", notFound: "Подписка пока не найдена. Если только что оплатили — подождите минуту.",
      pastDue: "Не удалось списать оплату", pastDueSub: "Новые объявления на паузе. Оплатите — и всё сразу заработает.",
      canceled: "Подписка закончилась", canceledSub: "Оформите снова, чтобы получать новые объявления.",
      secure: "Безопасная оплата через Stripe", err: "Не получилось открыть оплату. Попробуйте ещё раз.",
      st: { free: "Бесплатный доступ", comp: "Бесплатный доступ", admin: "Админ — бесплатно", trialing: "Пробный период до {d}", active: "Активна до {d}", activeCancel: "Активна до {d}, не продлится", past_due: "Оплата не прошла", unpaid: "Оплата не прошла", canceled: "Закончилась", none: "Не оформлена" },
      row: "Подписка",
    },
    en: {
      badge: "7 days free", title: "Be the first to know", sub: "A subscription unlocks new listings across Slovakia — in the app and in the bot chat.",
      b: ["⚡ New listings in your chat within 10 minutes", "📍 Any city or district in Slovakia", "📞 Phone numbers and one-tap calls", "⏰ Reminders, favourites and the map"],
      today: "Today", todayV: "€0", after: "After 7 days", per: "mo", cancel: "Cancel any time — /pay command in the bot.",
      email: "Email", emailHint: "For receipts — your subscription is linked to it", emailBad: "Please check the email",
      ctaTrial: "Start 7 days free", cta: "Subscribe", ctaPay: "Pay for subscription",
      check: "Already paid? Check subscription", waiting: "Waiting for Stripe to confirm…", waitingSub: "Checkout opened in your browser. When you're done, come back — access unlocks automatically.",
      ok: "Done! Access unlocked 🎉", notFound: "No subscription found yet. If you just paid, wait a minute.",
      pastDue: "Payment failed", pastDueSub: "New listings are paused. Pay and everything resumes right away.",
      canceled: "Subscription ended", canceledSub: "Subscribe again to keep getting new listings.",
      secure: "Secure payment via Stripe", err: "Couldn't open checkout. Please try again.",
      st: { free: "Free access", comp: "Free access", admin: "Admin — free", trialing: "Trial until {d}", active: "Active until {d}", activeCancel: "Active until {d}, won't renew", past_due: "Payment failed", unpaid: "Payment failed", canceled: "Ended", none: "Not subscribed" },
      row: "Subscription",
    },
    sk: {
      badge: "7 dní zadarmo", title: "Dozviete sa o bývaní ako prví", sub: "Predplatné odomkne nové inzeráty z celého Slovenska — v aplikácii aj v chate s botom.",
      b: ["⚡ Nové inzeráty v chate do 10 minút", "📍 Akékoľvek mesto a mestská časť", "📞 Telefóny, kontakty a hovor jedným ťuknutím", "⏰ Pripomienky, obľúbené a mapa"],
      today: "Dnes", todayV: "0 €", after: "Po 7 dňoch", per: "mes.", cancel: "Zrušiť môžete kedykoľvek — príkaz /pay v bote.",
      email: "E-mail", emailHint: "Pošleme doklady a podľa neho overujeme predplatné", emailBad: "Skontrolujte e-mail",
      ctaTrial: "Začať 7 dní zadarmo", cta: "Predplatiť", ctaPay: "Zaplatiť predplatné",
      check: "Už ste zaplatili? Overiť predplatné", waiting: "Čakáme na potvrdenie od Stripe…", waitingSub: "Platba sa otvorila v prehliadači. Keď skončíte, vráťte sa sem — prístup sa odomkne sám.",
      ok: "Hotovo! Prístup odomknutý 🎉", notFound: "Predplatné zatiaľ nenájdené. Ak ste práve platili, počkajte minútu.",
      pastDue: "Platba neprešla", pastDueSub: "Nové inzeráty sú pozastavené. Zaplaťte a všetko hneď pobeží.",
      canceled: "Predplatné skončilo", canceledSub: "Predplaťte znova, aby ste dostávali nové inzeráty.",
      secure: "Bezpečná platba cez Stripe", err: "Platbu sa nepodarilo otvoriť. Skúste znova.",
      st: { free: "Prístup zadarmo", comp: "Prístup zadarmo", admin: "Admin — zadarmo", trialing: "Skúšobné obdobie do {d}", active: "Aktívne do {d}", activeCancel: "Aktívne do {d}, nepredĺži sa", past_due: "Platba neprešla", unpaid: "Platba neprešla", canceled: "Skončilo", none: "Nepredplatené" },
      row: "Predplatné",
    },
    uk: {
      badge: "7 днів безкоштовно", title: "Дізнавайтеся про житло першими", sub: "Підписка відкриває нові оголошення по всій Словаччині — у застосунку та в чаті з ботом.",
      b: ["⚡ Нові оголошення в чат за 10 хвилин", "📍 Будь-які міста й райони Словаччини", "📞 Телефони, контакти й дзвінок в один дотик", "⏰ Нагадування, обране й мапа"],
      today: "Сьогодні", todayV: "0 €", after: "Через 7 днів", per: "міс", cancel: "Скасувати можна будь-коли — команда /pay у боті.",
      email: "Пошта", emailHint: "Надішлемо чеки, і за нею перевіряється підписка", emailBad: "Перевірте пошту",
      ctaTrial: "Почати 7 днів безкоштовно", cta: "Оформити підписку", ctaPay: "Оплатити підписку",
      check: "Уже оплатили? Перевірити підписку", waiting: "Чекаємо підтвердження від Stripe…", waitingSub: "Оплата відкрилася в браузері. Коли закінчите — поверніться сюди, доступ відкриється сам.",
      ok: "Готово! Доступ відкрито 🎉", notFound: "Підписку поки не знайдено. Якщо щойно оплатили — зачекайте хвилину.",
      pastDue: "Не вдалося списати оплату", pastDueSub: "Нові оголошення на паузі. Оплатіть — і все одразу запрацює.",
      canceled: "Підписка закінчилася", canceledSub: "Оформіть знову, щоб отримувати нові оголошення.",
      secure: "Безпечна оплата через Stripe", err: "Не вдалося відкрити оплату. Спробуйте ще раз.",
      st: { free: "Безкоштовний доступ", comp: "Безкоштовний доступ", admin: "Адмін — безкоштовно", trialing: "Пробний період до {d}", active: "Активна до {d}", activeCancel: "Активна до {d}, не продовжиться", past_due: "Оплата не пройшла", unpaid: "Оплата не пройшла", canceled: "Закінчилася", none: "Не оформлена" },
      row: "Підписка",
    },
    be: {
      badge: "7 дзён бясплатна", title: "Даведвайцеся пра жыллё першымі", sub: "Падпіска адкрывае новыя аб'явы па ўсёй Славакіі — у дадатку і ў чаце з ботам.",
      b: ["⚡ Новыя аб'явы ў чат за 10 хвілін", "📍 Любыя гарады і раёны Славакіі", "📞 Тэлефоны, кантакты і званок у адзін дотык", "⏰ Напаміны, абранае і мапа"],
      today: "Сёння", todayV: "0 €", after: "Праз 7 дзён", per: "мес", cancel: "Скасаваць можна ў любы момант — каманда /pay у боце.",
      email: "Пошта", emailHint: "Дашлём чэкі, і па ёй правяраецца падпіска", emailBad: "Праверце пошту",
      ctaTrial: "Пачаць 7 дзён бясплатна", cta: "Аформіць падпіску", ctaPay: "Аплаціць падпіску",
      check: "Ужо аплацілі? Праверыць падпіску", waiting: "Чакаем пацвярджэння ад Stripe…", waitingSub: "Аплата адкрылася ў браўзеры. Калі скончыце — вярніцеся сюды, доступ адкрыецца сам.",
      ok: "Гатова! Доступ адкрыты 🎉", notFound: "Падпіску пакуль не знойдзена. Калі толькі што аплацілі — пачакайце хвіліну.",
      pastDue: "Не атрымалася спісаць аплату", pastDueSub: "Новыя аб'явы на паўзе. Аплаціце — і ўсё адразу запрацуе.",
      canceled: "Падпіска скончылася", canceledSub: "Аформіце зноў, каб атрымліваць новыя аб'явы.",
      secure: "Бяспечная аплата праз Stripe", err: "Не атрымалася адкрыць аплату. Паспрабуйце яшчэ раз.",
      st: { free: "Бясплатны доступ", comp: "Бясплатны доступ", admin: "Адмін — бясплатна", trialing: "Пробны перыяд да {d}", active: "Актыўная да {d}", activeCancel: "Актыўная да {d}, не падоўжыцца", past_due: "Аплата не прайшла", unpaid: "Аплата не прайшла", canceled: "Скончылася", none: "Не аформлена" },
      row: "Падпіска",
    },
  };
  const LOC = { ru: "ru-RU", en: "en-GB", sk: "sk-SK", uk: "uk-UA", be: "be-BY" };
  const lang = () => (window.I18N?.getLang?.() || "ru");
  const L = () => T[lang()] || T.ru;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const tg = window.Telegram?.WebApp;
  const haptic = (k) => { try { k === "ok" ? tg?.HapticFeedback?.notificationOccurred("success") : tg?.HapticFeedback?.impactOccurred("light"); } catch { /* */ } };

  const money = (p) => p ? new Intl.NumberFormat(LOC[lang()], { style: "currency", currency: p.currency || "EUR" }).format(p.amount) : "7,99 €";
  const dateStr = (d) => new Date(d).toLocaleDateString(LOC[lang()], { day: "numeric", month: "long", timeZone: "Europe/Bratislava" });

  function status(a) {
    const t = L().st;
    if (!a) return "";
    if (["free", "comp", "admin"].includes(a.reason)) return t[a.reason];
    if (a.status === "trialing" && a.trialEnd) return t.trialing.replace("{d}", dateStr(a.trialEnd));
    if (a.status === "active" && a.periodEnd) return (a.cancelAtPeriodEnd ? t.activeCancel : t.active).replace("{d}", dateStr(a.periodEnd));
    return t[a.status] || t.none;
  }

  let open = null;
  function show({ access, price, onUnlocked } = {}) {
    if (open) return open;
    const api = window.FBApp.api;
    const t = L();
    const blocked = ["past_due", "unpaid"].includes(access?.status);
    const ended = ["canceled", "incomplete_expired", "paused"].includes(access?.status);
    const trial = access?.trialAvailable !== false && !blocked;
    const cta = blocked ? t.ctaPay : trial ? t.ctaTrial : t.cta;
    const ov = document.createElement("div");
    ov.className = "fbp";
    ov.innerHTML = `
      <div class="fbp-hero">
        <span class="fbp-badge">${esc(blocked ? "⚠️" : ended ? "⛔️" : "🎁")} ${esc(blocked ? t.pastDue : ended ? t.canceled : trial ? t.badge : t.row)}</span>
        <div class="fbp-lock">🔓</div>
        <h1>${esc(blocked ? t.pastDue : ended ? t.canceled : t.title)}</h1>
        <p>${esc(blocked ? t.pastDueSub : ended ? t.canceledSub : t.sub)}</p>
      </div>
      <div class="fbp-body">
        <ul class="fbp-list">${t.b.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        ${trial ? `<div class="fbp-plan">
          <div><span>${esc(t.today)}</span><b>${esc(t.todayV)}</b></div>
          <div><span>${esc(t.after)}</span><b>${esc(money(price))} <small>/ ${esc(t.per)}</small></b></div>
        </div>` : `<div class="fbp-plan one"><div><span>${esc(t.row)}</span><b>${esc(money(price))} <small>/ ${esc(t.per)}</small></b></div></div>`}
        <label class="fbp-email"><span>${esc(t.email)}</span>
          <input type="email" inputmode="email" autocomplete="email" placeholder="name@example.com" value="${esc(access?.email || "")}">
          <small>${esc(t.emailHint)}</small></label>
        <p class="fbp-note">🔒 ${esc(t.secure)}. ${esc(t.cancel)}</p>
      </div>
      <div class="fbp-foot">
        <button class="fbp-cta">${esc(cta)}</button>
        <button class="fbp-check">${esc(t.check)}</button>
      </div>`;
    document.body.append(ov);
    document.documentElement.classList.add("fbp-lock-scroll");
    const input = ov.querySelector("input");
    const ctaBtn = ov.querySelector(".fbp-cta");
    const checkBtn = ov.querySelector(".fbp-check");
    const foot = ov.querySelector(".fbp-foot");
    let poll = null;

    return (open = new Promise((resolve) => {
      const done = () => {
        clearInterval(poll);
        document.removeEventListener("visibilitychange", onVisible);
        haptic("ok");
        foot.innerHTML = `<div class="fbp-ok">${esc(t.ok)}</div>`;
        setTimeout(() => {
          ov.classList.add("out");
          setTimeout(() => (ov.remove(), document.documentElement.classList.remove("fbp-lock-scroll")), 300);
          open = null;
          onUnlocked?.();
          resolve(true);
        }, 900);
      };
      const check = async (quiet) => {
        try {
          const r = await api("sub_check");
          if (r.access?.ok) return done();
          if (!quiet) window.FBApp.toast(t.notFound);
        } catch {
          if (!quiet) window.FBApp.toast(t.notFound);
        }
      };
      const onVisible = () => document.visibilityState === "visible" && poll && check(true);
      ctaBtn.onclick = async () => {
        const email = input.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          input.classList.add("bad");
          input.focus();
          window.FBApp.toast(t.emailBad);
          return;
        }
        input.classList.remove("bad");
        haptic();
        ctaBtn.disabled = true;
        let r = null;
        try {
          r = await api("pay", { email });
          if (!r.url) throw new Error(r.error || "no url");
          tg?.openLink ? tg.openLink(r.url) : window.open(r.url, "_blank");
          ctaBtn.innerHTML = `<span class="fbp-spin"></span>${esc(t.waiting)}`;
          ov.querySelector(".fbp-note").textContent = t.waitingSub;
          // ждём вебхук: опрашиваем статус и проверяем при возврате в Telegram
          clearInterval(poll);
          poll = setInterval(() => check(true), 4000);
          document.addEventListener("visibilitychange", onVisible);
          setTimeout(() => (ctaBtn.disabled = false), 4000);
        } catch {
          ctaBtn.disabled = false;
          window.FBApp.toast(r?.error === "bad_email" ? t.emailBad : t.err);
        }
      };
      checkBtn.onclick = () => (haptic(), check(false));
    }));
  }

  window.FBPaywall = { show, status, label: () => L().row };
})();
