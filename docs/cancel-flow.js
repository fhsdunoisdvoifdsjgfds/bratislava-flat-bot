/* Управление подпиской и отмена с удержанием.
   FBCancel.manage({ access, price, onCanceled, onAction }) — шторка «Подписка»;
   отмена: почему уходите → предложение под причину → что потеряете → подтверждение.
   onAction("filters" | "digest") — пользователь выбрал альтернативу вместо отмены. */
(() => {
  "use strict";

  const T = {
    ru: {
      manage: "Подписка", price: "Стоимость", card: "Сменить карту и счета", cancel: "Отменить подписку",
      whyT: "Жаль, что уходите 😔", whyS: "Подскажите, почему — это займёт 5 секунд и поможет сделать бота лучше.",
      r: { found: ["🎉", "Уже нашёл жильё"], expensive: ["💸", "Слишком дорого"], few: ["🔍", "Мало подходящих объявлений"], noisy: ["🔔", "Слишком много уведомлений"], bug: ["🐞", "Что-то не работает"], other: ["✍️", "Другая причина"] },
      found: ["Поздравляем с новым жильём! 🎉", "Если что-то не сложится с арендой, бот поможет быстро найти новый вариант. Многие оставляют подписку ещё на месяц — на всякий случай."],
      expensive: ["Давайте дешевле 💸", "Дарим скидку 50% на следующий месяц — продолжайте узнавать о квартирах первыми почти за полцены."],
      expensiveUsed: ["Понимаем 💸", "Подписка окупается одной квартирой: хорошие варианты разбирают за 2–3 часа, а бот присылает их за 10 минут."],
      few: ["Давайте расширим поиск 🔍", "Чаще всего помогает добавить соседние города или район, поднять бюджет на 50–100 € или выбрать и комнаты, и студии."],
      noisy: ["Можно спокойнее 🔔", "Вместо каждого объявления — подборка 2 раза в день, утром и вечером. Ничего не пропустите, но и не будете отвлекаться."],
      bug: ["Расскажите, что сломалось 🐞", "Мы прочитаем и исправим. Опишите в паре слов, что не так:"],
      other: ["Расскажите подробнее ✍️", "Что нам стоит улучшить?"],
      takeDiscount: "Взять скидку 50%", widen: "Расширить поиск", toDigest: "Перейти на подборку 2 раза в день", sendStay: "Отправить и остаться",
      stay: "Остаться с подпиской", stayShort: "Остаться", goOn: "Всё равно отменить", next: "Продолжить отмену",
      lossT: "Вот что вы потеряете", lossS: "Хорошие квартиры разбирают за 2–3 часа. Без бота вы будете узнавать о них последним.",
      loss: ["⚡ Новые объявления в чат за 10 минут", "📍 Поиск по всей Словакии и районам", "📞 Телефоны и звонок в один тап", "⏰ Избранное, напоминания и карта"],
      confT: "Отменить подписку сейчас?", confS: "Доступ к приложению и уведомлениям закроется сразу. Оставшиеся дни не сохранятся.", confYes: "Да, отменить", confNo: "Нет, остаться",
      done: "Подписка отменена", stayed: "Отлично, вы с нами! 💚", discountOk: "Скидка 50% применена 🎁", err: "Не получилось. Попробуйте ещё раз.", comment: "Напишите пару слов…",
    },
    en: {
      manage: "Subscription", price: "Price", card: "Change card & invoices", cancel: "Cancel subscription",
      whyT: "Sorry to see you go 😔", whyS: "Tell us why — it takes 5 seconds and helps us improve the bot.",
      r: { found: ["🎉", "I've found a place"], expensive: ["💸", "Too expensive"], few: ["🔍", "Not enough matching listings"], noisy: ["🔔", "Too many notifications"], bug: ["🐞", "Something doesn't work"], other: ["✍️", "Another reason"] },
      found: ["Congrats on your new home! 🎉", "If the rental doesn't work out, the bot will help you find a new place fast. Many people keep the subscription one more month — just in case."],
      expensive: ["Let's make it cheaper 💸", "Here's 50% off your next month — keep being first to hear about flats for almost half the price."],
      expensiveUsed: ["We get it 💸", "One flat pays for it: good listings are gone in 2–3 hours, and the bot sends them within 10 minutes."],
      few: ["Let's widen the search 🔍", "What helps most: add nearby towns or districts, raise the budget by €50–100, or include both rooms and studios."],
      noisy: ["Let's make it calmer 🔔", "Instead of every listing — a digest twice a day, morning and evening. You won't miss anything and won't be distracted."],
      bug: ["Tell us what broke 🐞", "We'll read it and fix it. Describe the problem in a few words:"],
      other: ["Tell us more ✍️", "What should we improve?"],
      takeDiscount: "Get 50% off", widen: "Widen my search", toDigest: "Switch to a twice-daily digest", sendStay: "Send and stay",
      stay: "Keep my subscription", stayShort: "Stay", goOn: "Cancel anyway", next: "Continue canceling",
      lossT: "Here's what you'll lose", lossS: "Good flats are gone in 2–3 hours. Without the bot you'll hear about them last.",
      loss: ["⚡ New listings in your chat within 10 minutes", "📍 Search across Slovakia and districts", "📞 Phone numbers and one-tap calls", "⏰ Favourites, reminders and the map"],
      confT: "Cancel your subscription now?", confS: "Access to the app and notifications closes immediately. Remaining days are not kept.", confYes: "Yes, cancel", confNo: "No, stay",
      done: "Subscription canceled", stayed: "Great, you're staying! 💚", discountOk: "50% discount applied 🎁", err: "Something went wrong. Please try again.", comment: "A few words…",
    },
    sk: {
      manage: "Predplatné", price: "Cena", card: "Zmeniť kartu a faktúry", cancel: "Zrušiť predplatné",
      whyT: "Je nám ľúto, že odchádzate 😔", whyS: "Povedzte nám prečo — zaberie to 5 sekúnd a pomôže nám zlepšiť bota.",
      r: { found: ["🎉", "Už som našiel bývanie"], expensive: ["💸", "Príliš drahé"], few: ["🔍", "Málo vhodných inzerátov"], noisy: ["🔔", "Príliš veľa upozornení"], bug: ["🐞", "Niečo nefunguje"], other: ["✍️", "Iný dôvod"] },
      found: ["Gratulujeme k novému bývaniu! 🎉", "Ak by prenájom nevyšiel, bot vám rýchlo nájde nové. Mnohí si nechávajú predplatné ešte mesiac — pre istotu."],
      expensive: ["Dáme vám to lacnejšie 💸", "Darujeme vám zľavu 50 % na budúci mesiac — dozvedajte sa o bytoch ako prví takmer za polovicu."],
      expensiveUsed: ["Rozumieme 💸", "Predplatné sa vráti jedným bytom: dobré ponuky zmiznú za 2–3 hodiny a bot ich pošle do 10 minút."],
      few: ["Rozšírme hľadanie 🔍", "Najčastejšie pomôže pridať susedné mestá či mestské časti, zvýšiť rozpočet o 50–100 € alebo vybrať izby aj garsónky."],
      noisy: ["Dá sa to pokojnejšie 🔔", "Namiesto každého inzerátu — výber 2-krát denne, ráno a večer. Nič nezmeškáte a nebudete rušení."],
      bug: ["Povedzte, čo nefunguje 🐞", "Prečítame si to a opravíme. Opíšte problém pár slovami:"],
      other: ["Povedzte viac ✍️", "Čo by sme mali zlepšiť?"],
      takeDiscount: "Vziať zľavu 50 %", widen: "Rozšíriť hľadanie", toDigest: "Prejsť na výber 2-krát denne", sendStay: "Odoslať a zostať",
      stay: "Ponechať predplatné", stayShort: "Zostať", goOn: "Aj tak zrušiť", next: "Pokračovať v rušení",
      lossT: "Toto stratíte", lossS: "Dobré byty zmiznú za 2–3 hodiny. Bez bota sa o nich dozviete posledný.",
      loss: ["⚡ Nové inzeráty v chate do 10 minút", "📍 Hľadanie po celom Slovensku a mestských častiach", "📞 Telefóny a hovor jedným ťuknutím", "⏰ Obľúbené, pripomienky a mapa"],
      confT: "Zrušiť predplatné teraz?", confS: "Prístup k aplikácii a upozorneniam sa uzavrie okamžite. Zostávajúce dni sa nezachovajú.", confYes: "Áno, zrušiť", confNo: "Nie, zostať",
      done: "Predplatné zrušené", stayed: "Výborne, zostávate s nami! 💚", discountOk: "Zľava 50 % uplatnená 🎁", err: "Nepodarilo sa. Skúste znova.", comment: "Pár slov…",
    },
    uk: {
      manage: "Підписка", price: "Вартість", card: "Змінити картку й рахунки", cancel: "Скасувати підписку",
      whyT: "Шкода, що йдете 😔", whyS: "Підкажіть чому — це займе 5 секунд і допоможе зробити бота кращим.",
      r: { found: ["🎉", "Уже знайшов житло"], expensive: ["💸", "Занадто дорого"], few: ["🔍", "Мало відповідних оголошень"], noisy: ["🔔", "Забагато сповіщень"], bug: ["🐞", "Щось не працює"], other: ["✍️", "Інша причина"] },
      found: ["Вітаємо з новим житлом! 🎉", "Якщо з орендою щось не складеться, бот допоможе швидко знайти новий варіант. Багато хто залишає підписку ще на місяць — про всяк випадок."],
      expensive: ["Зробимо дешевше 💸", "Даруємо знижку 50% на наступний місяць — дізнавайтеся про квартири першими майже за пів ціни."],
      expensiveUsed: ["Розуміємо 💸", "Підписка окупається однією квартирою: хороші варіанти розбирають за 2–3 години, а бот надсилає їх за 10 хвилин."],
      few: ["Розширмо пошук 🔍", "Найчастіше допомагає додати сусідні міста чи райони, підняти бюджет на 50–100 € або обрати і кімнати, і студії."],
      noisy: ["Можна спокійніше 🔔", "Замість кожного оголошення — добірка 2 рази на день, вранці й увечері. Нічого не пропустите й не будете відволікатися."],
      bug: ["Розкажіть, що зламалося 🐞", "Ми прочитаємо й виправимо. Опишіть проблему кількома словами:"],
      other: ["Розкажіть докладніше ✍️", "Що нам варто покращити?"],
      takeDiscount: "Взяти знижку 50%", widen: "Розширити пошук", toDigest: "Перейти на добірку 2 рази на день", sendStay: "Надіслати й залишитися",
      stay: "Залишити підписку", stayShort: "Залишитися", goOn: "Однаково скасувати", next: "Продовжити скасування",
      lossT: "Ось що ви втратите", lossS: "Хороші квартири розбирають за 2–3 години. Без бота ви дізнаватиметеся про них останнім.",
      loss: ["⚡ Нові оголошення в чат за 10 хвилин", "📍 Пошук по всій Словаччині й районах", "📞 Телефони й дзвінок в один дотик", "⏰ Обране, нагадування й мапа"],
      confT: "Скасувати підписку зараз?", confS: "Доступ до застосунку й сповіщень закриється одразу. Залишок днів не збережеться.", confYes: "Так, скасувати", confNo: "Ні, залишитися",
      done: "Підписку скасовано", stayed: "Чудово, ви з нами! 💚", discountOk: "Знижку 50% застосовано 🎁", err: "Не вдалося. Спробуйте ще раз.", comment: "Кілька слів…",
    },
    be: {
      manage: "Падпіска", price: "Кошт", card: "Змяніць картку і рахункі", cancel: "Скасаваць падпіску",
      whyT: "Шкада, што сыходзіце 😔", whyS: "Падкажыце чаму — гэта зойме 5 секунд і дапаможа зрабіць бота лепшым.",
      r: { found: ["🎉", "Ужо знайшоў жыллё"], expensive: ["💸", "Занадта дорага"], few: ["🔍", "Мала адпаведных аб'яў"], noisy: ["🔔", "Зашмат апавяшчэнняў"], bug: ["🐞", "Нешта не працуе"], other: ["✍️", "Іншая прычына"] },
      found: ["Віншуем з новым жыллём! 🎉", "Калі з арэндай нешта не складзецца, бот дапаможа хутка знайсці новы варыянт. Многія пакідаюць падпіску яшчэ на месяц — на ўсялякі выпадак."],
      expensive: ["Зробім танней 💸", "Дорым зніжку 50% на наступны месяц — даведвайцеся пра кватэры першымі амаль за паўцаны."],
      expensiveUsed: ["Разумеем 💸", "Падпіска акупляецца адной кватэрай: добрыя варыянты разбіраюць за 2–3 гадзіны, а бот дасылае іх за 10 хвілін."],
      few: ["Пашырым пошук 🔍", "Часцей за ўсё дапамагае дадаць суседнія гарады ці раёны, падняць бюджэт на 50–100 € або выбраць і пакоі, і студыі."],
      noisy: ["Можна спакайней 🔔", "Замест кожнай аб'явы — падборка 2 разы на дзень, раніцай і ўвечары. Нічога не прапусціце і не будзеце адцягвацца."],
      bug: ["Раскажыце, што зламалася 🐞", "Мы прачытаем і выправім. Апішыце праблему некалькімі словамі:"],
      other: ["Раскажыце падрабязней ✍️", "Што нам варта палепшыць?"],
      takeDiscount: "Узяць зніжку 50%", widen: "Пашырыць пошук", toDigest: "Перайсці на падборку 2 разы на дзень", sendStay: "Адправіць і застацца",
      stay: "Пакінуць падпіску", stayShort: "Застацца", goOn: "Усё роўна скасаваць", next: "Працягнуць скасаванне",
      lossT: "Вось што вы страціце", lossS: "Добрыя кватэры разбіраюць за 2–3 гадзіны. Без бота вы будзеце даведвацца пра іх апошнім.",
      loss: ["⚡ Новыя аб'явы ў чат за 10 хвілін", "📍 Пошук па ўсёй Славакіі і раёнах", "📞 Тэлефоны і званок у адзін дотык", "⏰ Абранае, напаміны і мапа"],
      confT: "Скасаваць падпіску зараз?", confS: "Доступ да дадатку і апавяшчэнняў закрыецца адразу. Астатнія дні не захаваюцца.", confYes: "Так, скасаваць", confNo: "Не, застацца",
      done: "Падпіска скасавана", stayed: "Выдатна, вы з намі! 💚", discountOk: "Зніжка 50% ужытая 🎁", err: "Не атрымалася. Паспрабуйце яшчэ раз.", comment: "Некалькі слоў…",
    },
  };
  const lang = () => window.I18N?.getLang?.() || "en";
  const L = () => T[lang()] || T.en;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const tg = window.Telegram?.WebApp;
  const A = () => window.FBApp;

  // ---------------------------------------------------------------- шторка «Подписка»
  function manage({ access, price, onCanceled, onAction } = {}) {
    const t = L();
    const money = price ? new Intl.NumberFormat(window.I18N?.locale?.() || "en-GB", { style: "currency", currency: price.currency || "EUR" }).format(price.amount) : "";
    const s = A().sheet(`
      <h2>💳 ${esc(t.manage)}</h2>
      <p class="lead">${esc(window.FBPaywall?.status(access) || "")}</p>
      ${money ? `<div class="card2" style="margin:0 0 12px"><div class="kv"><span>${esc(t.price)}</span><b>${esc(money)} / ${esc(window.FBPaywall ? "" : "")}${price.interval === "year" ? "y" : "m"}</b></div></div>` : ""}
      <button class="btn block plain" id="fbc-card">💳 ${esc(t.card)}</button>
      <button class="fbc-cancel-link" id="fbc-cancel">${esc(t.cancel)}</button>`);
    s.querySelector("#fbc-card").onclick = async () => {
      try {
        const r = await A().api("pay");
        tg?.openLink ? tg.openLink(r.url) : window.open(r.url, "_blank");
      } catch {
        A().toast(t.err);
      }
    };
    s.querySelector("#fbc-cancel").onclick = () => {
      A().closeLayer();
      start({ access, onCanceled, onAction });
    };
  }

  // ---------------------------------------------------------------- отмена с удержанием
  function start({ access, onCanceled, onAction } = {}) {
    const t = L();
    const api = A().api;
    const haptic = A().haptic;
    let reason = null;
    const ov = document.createElement("div");
    ov.className = "fbc";
    document.body.append(ov);
    const log = (step, extra = {}) => api("cancel_flow", { step, reason, ...extra }).catch(() => {});
    const close = (msg) => {
      ov.classList.add("out");
      setTimeout(() => ov.remove(), 260);
      if (msg) A().toast(msg);
    };
    const stay = () => {
      haptic.ok();
      log("stayed");
      close(t.stayed);
    };
    const paint = (html, bind) => {
      ov.innerHTML = `<div class="fbc-wrap">${html}</div>`;
      ov.scrollTop = 0;
      bind?.();
      ov.querySelectorAll("[data-stay]").forEach((b) => (b.onclick = stay));
    };

    // 1) почему уходите
    const why = () => paint(`
      <button class="fbc-x" data-stay aria-label="×">✕</button>
      <div class="fbc-em">😔</div><h1>${esc(t.whyT)}</h1><p class="fbc-sub">${esc(t.whyS)}</p>
      <div class="fbc-reasons">${Object.entries(t.r).map(([k, [em, name]]) => `
        <button class="fbc-reason r-${k}" data-r="${k}"><span>${em}</span>${esc(name)}</button>`).join("")}</div>
      <div class="fbc-foot"><button class="fbc-btn stay" data-stay>💚 ${esc(t.stay)}</button></div>`, () => {
      ov.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => {
        haptic.soft();
        reason = b.dataset.r;
        log("reason");
        offer();
      }));
    });

    // 2) предложение под причину
    const offer = () => {
      const canDiscount = reason === "expensive" && !access?.retentionUsed && ["trialing", "active"].includes(access?.status);
      const [title, text] = reason === "expensive" ? (canDiscount ? t.expensive : t.expensiveUsed) : t[reason];
      const needText = reason === "bug" || reason === "other";
      const action = reason === "expensive" && canDiscount ? `<button class="fbc-btn gift" id="fbc-act">🎁 ${esc(t.takeDiscount)}</button>`
        : reason === "few" ? `<button class="fbc-btn blue" id="fbc-act">🔍 ${esc(t.widen)}</button>`
        : reason === "noisy" ? `<button class="fbc-btn blue" id="fbc-act">📬 ${esc(t.toDigest)}</button>`
        : reason === "bug" ? `<button class="fbc-btn blue" id="fbc-act">📨 ${esc(t.sendStay)}</button>` : "";
      paint(`
        <button class="fbc-x" data-stay aria-label="×">✕</button>
        <div class="fbc-em">${t.r[reason][0]}</div><h1>${esc(title)}</h1><p class="fbc-sub">${esc(text)}</p>
        ${needText ? `<textarea class="fbc-text" maxlength="500" placeholder="${esc(t.comment)}"></textarea>` : ""}
        <div class="fbc-foot">
          ${action}
          <button class="fbc-btn stay" data-stay>💚 ${esc(t.stay)}</button>
          <button class="fbc-btn ghost" id="fbc-next">${esc(t.next)}</button>
        </div>`, () => {
        const comment = () => ov.querySelector(".fbc-text")?.value.trim() || "";
        ov.querySelector("#fbc-next").onclick = () => {
          haptic.soft();
          log("offer_declined", { choice: comment() || null });
          loss(comment());
        };
        const act = ov.querySelector("#fbc-act");
        if (!act) return;
        act.onclick = async () => {
          haptic.tap();
          act.disabled = true;
          try {
            if (reason === "expensive") {
              const r = await api("retention_discount");
              if (r.error) throw new Error(r.error);
              log("offer_accepted", { choice: "discount" });
              haptic.ok();
              close(t.discountOk);
            } else if (reason === "few") {
              log("offer_accepted", { choice: "filters" });
              close();
              onAction?.("filters");
            } else if (reason === "noisy") {
              log("offer_accepted", { choice: "digest" });
              close();
              onAction?.("digest");
            } else if (reason === "bug") {
              log("offer_accepted", { choice: `bug: ${comment()}`.slice(0, 300) });
              close(t.stayed);
            }
          } catch {
            act.disabled = false;
            A().toast(t.err);
          }
        };
      });
    };

    // 3) что потеряете
    const loss = (comment) => paint(`
      <div class="fbc-em">⚠️</div><h1>${esc(t.lossT)}</h1><p class="fbc-sub">${esc(t.lossS)}</p>
      <ul class="fbc-loss">${t.loss.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="fbc-foot">
        <button class="fbc-btn stay big" data-stay>💚 ${esc(t.stay)}</button>
        <button class="fbc-btn ghost small" id="fbc-goon">${esc(t.goOn)}</button>
      </div>`, () => {
      ov.querySelector("#fbc-goon").onclick = () => {
        haptic.soft();
        confirm(comment);
      };
    });

    // 4) последнее подтверждение
    const confirm = (comment) => paint(`
      <div class="fbc-em">🛑</div><h1>${esc(t.confT)}</h1><p class="fbc-sub">${esc(t.confS)}</p>
      <div class="fbc-foot">
        <button class="fbc-btn stay big" data-stay>💚 ${esc(t.confNo)}</button>
        <button class="fbc-btn danger" id="fbc-yes">${esc(t.confYes)}</button>
      </div>`, () => {
      const yes = ov.querySelector("#fbc-yes");
      yes.onclick = async () => {
        yes.disabled = true;
        try {
          const r = await api("cancel", { reason, comment });
          if (r.error) throw new Error(r.error);
          tg?.HapticFeedback?.notificationOccurred?.("warning");
          close(t.done);
          onCanceled?.();
        } catch {
          yes.disabled = false;
          A().toast(t.err);
        }
      };
    });

    log("open");
    why();
  }

  window.FBCancel = { manage, start };
})();
