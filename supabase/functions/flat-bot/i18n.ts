// Тексты бота на 5 языках: ru, en, sk, uk, be. Язык по умолчанию — английский.
// tr(lang, key, vars): подстановка {var}, множественное число по vars.n,
// запасной путь: язык → en → сам ключ. Названия мест и сайтов не переводим.

export type Lang = "ru" | "en" | "sk" | "uk" | "be";
export const LANGS: Lang[] = ["ru", "en", "sk", "uk", "be"];

export const LOCALE: Record<Lang, string> = { ru: "ru-RU", en: "en-GB", sk: "sk-SK", uk: "uk-UA", be: "be-BY" };
export const TZ = "Europe/Bratislava";

export const asLang = (x: unknown): Lang | null => (LANGS.includes(x as Lang) ? (x as Lang) : null);
export const langOr = (x: unknown, def: Lang = "en"): Lang => asLang(x) ?? def;

// language_code из Telegram: ru → ru, uk → uk, be → be, sk/cs → sk, остальное → en; нет кода — null
export function langFromCode(code: unknown): Lang | null {
  if (typeof code !== "string" || !code) return null;
  const c = code.toLowerCase().split(/[-_]/)[0];
  if (c === "ru" || c === "uk" || c === "be" || c === "sk") return c;
  if (c === "cs") return "sk";
  return "en";
}

// В ICU Deno/Supabase нет белорусского (be-BY молча превращается в английский):
// числа и даты цифрами берём из ru-RU (тот же формат), названия месяцев — свои.
const hasLocale = (loc: string) => {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([loc]).length > 0;
  } catch {
    return false;
  }
};
const BE_OK = hasLocale("be-BY");
export const intlLocale = (lang: Lang) => (lang === "be" && !BE_OK ? "ru-RU" : LOCALE[lang]);
const BE_MONTHS = ["студзеня", "лютага", "сакавіка", "красавіка", "мая", "чэрвеня", "ліпеня", "жніўня", "верасня", "кастрычніка", "лістапада", "снежня"];

export function fmtDate(lang: Lang, d: Date, opts: Intl.DateTimeFormatOptions = {}) {
  if (lang === "be" && !BE_OK && opts.month === "long") {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric" })
        .formatToParts(d).map((x) => [x.type, x.value]),
    );
    return [opts.day ? p.day : null, BE_MONTHS[Number(p.month) - 1], opts.year ? p.year : null].filter(Boolean).join(" ");
  }
  return d.toLocaleDateString(intlLocale(lang), { timeZone: TZ, ...opts });
}
export const fmtDateTime = (lang: Lang, d: Date) => d.toLocaleString(intlLocale(lang), { timeZone: TZ });

// ---------------------------------------------------------------- множественное число
type Plural = { one: string; few?: string; many?: string; other?: string };
type Entry = string | Plural;

function form(lang: Lang, n: number): "one" | "few" | "many" | "other" {
  const i = Math.abs(Math.trunc(n));
  if (!Number.isInteger(n)) return lang === "en" ? "other" : "many";
  if (lang === "en") return i === 1 ? "one" : "other";
  if (lang === "sk") return i === 1 ? "one" : i >= 2 && i <= 4 ? "few" : "many";
  // ru, uk, be
  const d = i % 10, h = i % 100;
  if (d === 1 && h !== 11) return "one";
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return "few";
  return "many";
}

const pick = (lang: Lang, p: Plural, n: number) => {
  const f = form(lang, n);
  return p[f] ?? p.many ?? p.other ?? p.few ?? p.one;
};

// ---------------------------------------------------------------- словари
const en = {
  // кнопки
  "btn.openApp": "🏠 Open the app",
  "btn.setup": "🚀 Set up search",
  "btn.editFilters": "⚙️ Edit filters",
  "btn.call": "📞 Call",
  "btn.copyNumber": "📋 Number",
  "btn.details": "📱 Details",
  "btn.onSite": "🔗 On the website",
  "btn.openListing": "🔗 Open listing",
  "btn.openAll": "📱 Open all in the app",
  "btn.pay": "💳 Pay for subscription",
  "btn.manageSub": "⚙️ Manage subscription",
  "btn.startTrial": "🎁 Start 7 days free",
  "btn.trialShort": "🎁 7 days free",
  "btn.subscribe": "💳 Subscribe",

  // типы жилья
  "kind.flat": "Flat",
  "kind.studio": "Studio / 1-room",
  "kind.room": "Room",
  "kind.hostel": "Hostel (ubytovňa)",
  "kinds.flat": "flats",
  "kinds.studio": "studios",
  "kinds.room": "rooms",
  "kinds.hostel": "hostels",
  "kinds.any": "any housing",

  // карточка объявления
  "price.negotiable": "price on request",
  "price.split": "<b>{total} €</b> = rent {price} + utilities {charges}",
  "price.included": "<b>{price} €</b> utilities included ✓",
  "price.extra": "<b>{price} €</b> + utilities (amount not stated)",
  "price.unknown": "<b>{price} €</b> · utilities: ask",
  "area": "{n} m²",
  "floor": "floor {f}",
  "agency": "🏢 Agency",
  "agency.commission": " · agency fee",
  "agency.private": "👤 Private landlord, no agency fee",
  "deposit": "🔐 Deposit {n} €",

  // подборки и напоминания
  "n.newListings": { one: "{n} new listing", other: "{n} new listings" },
  "digest.title": "📬 <b>Digest: {what}</b>",
  "digest.quiet": "🌅 <b>During quiet hours — {what}</b>",
  "digest.more": "…and {n} more",
  "reminder.title": "⏰ <b>Reminder</b>",
  "reminder.default": "You asked me to remind you.",

  // /today
  "today.none": "No matching listings in the last 24 hours yet. I’ll send them as soon as they appear.",
  "today.count": {
    one: "📅 Last 24 hours: <b>{n}</b> matching listing",
    other: "📅 Last 24 hours: <b>{n}</b> matching listings",
  },
  "today.more": ". Showing the {limit} newest, the rest are in the app.",
  "today.locked": "🔒 New listings are available with a subscription.",
  "cancel.done": "Your subscription is canceled. New listings are no longer sent and the app is locked. You can come back any time — the button below restarts it in a minute.",
  "cancel.back": "🔁 Subscribe again",
  "locked.any": "🔒 Access to the bot is available with a subscription. New listings across Slovakia within 10 minutes — subscribe to continue.",
  "retention.discountDone": "🎁 Done — your next month is 50% off. Thanks for staying!",

  // команды
  "help":
    "I look for flats and rooms all over Slovakia on bazos.sk, nehnutelnosti.sk (+reality.sk, byty.sk), " +
    "topreality.sk and bezrealitky.sk and send you new listings within 10 minutes.\n\n" +
    "In the app: cities and districts, budget, agency or private landlord, map, favourites, reminders and notification settings.\n\n" +
    "/today — listings from the last 24 hours\n/app — open the app\n/status — last check\n/stop — unsubscribe",
  "unknownCommand": "Unknown command.",
  "stop.done": "Unsubscribed. To get listings again — /start",
  "start.welcome":
    "👋 <b>Hi! I help you find a home in Slovakia faster than others.</b>\n\n" +
    "Every 10 minutes I check bazos, nehnutelnosti, topreality and bezrealitky and send new " +
    "listings here — with the price, phone number and a call button. Good offers are gone within a couple of hours, " +
    "so it matters to be the first to know.\n\n" +
    "<b>Tap the button below</b> and choose a city, budget and type of housing — it takes a minute. " +
    "After that, notifications will start arriving here.",
  "start.back": "👋 <b>Welcome back!</b>",
  "start.backPay": "👋 <b>Welcome back!</b> To get new listings again, please subscribe.",
  "status.title": "🕒 Last check: {at}\n{lines}",
  "status.never": "not yet",
  "status.flats": "flats",
  "status.rooms": "rooms",
  "status.error": "error",

  // оплата
  "pay.free": "The bot is free right now — there’s nothing to pay.",
  "pay.comp": "You have free access — there’s nothing to pay 🙂",
  "pay.manage": "Manage your subscription with the button below.",
  "pay.offer": "💳 <b>Subscription</b>: {trial}{price}. Cancel anytime.",
  "pay.trialPrefix": "first 7 days free, then ",
  "paid.ok": "✅ Done! Your subscription is active — new listings will arrive here.",
  "paid.wait": "⏳ Waiting for payment confirmation from Stripe — it usually takes a few seconds. I’ll let you know as soon as it arrives.",
  "price.month": "month",
  "price.year": "year",
  "sub.trial":
    "✅ <b>Free trial activated!</b>\n\nEverything is free for 7 days{until}. New listings will arrive here. " +
    "You can cancel your subscription anytime.",
  "sub.until": " — until {date}",
  "sub.active": "✅ <b>Subscription activated.</b> New listings will arrive here.",
  "nag.canceled":
    "⛔️ <b>Your subscription has ended.</b>\n\nNew listings are no longer sent. Subscribe again to be the first to hear about new flats.",
  "nag.failed":
    "⚠️ <b>We couldn’t charge your subscription.</b>\n\nAccess to new listings is paused. Pay now and notifications will resume right away.",

  // фильтр уведомлений
  "f.where": "📍 <b>Where:</b> {v}",
  "f.what": "🏠 <b>What:</b> {v}",
  "f.budget": "💶 <b>Budget:</b> {v}",
  "f.who": "🤝 <b>Landlord:</b> {v}",
  "f.notify": "🔔 <b>Notifications:</b> {v}",
  "f.allSlovakia": "all of Slovakia",
  "f.budgetAny": "any",
  "f.budgetMax": "up to {n} € incl. utilities",
  "f.whoAny": "everyone",
  "f.whoPrivate": "private landlords only",
  "f.whoAgency": "agencies only",
  "f.instant": "as soon as they appear",
  "f.quietExcept": " (except {from}–{to})",
  "f.digest": "as a digest at {times}",
  "f.off": "off",
  "setup.updated": "✅ <b>Notification filter updated</b>",
  "setup.welcome":
    "✅ <b>All set, notifications are on!</b>\n\n" +
    "As soon as a matching listing appears on bazos, nehnutelnosti, topreality or bezrealitky, " +
    "I’ll send it here — usually within 10 minutes of publication. Good offers are gone within hours, " +
    "so you’ll be among the first to call.",
  "setup.test": "🔔 <b>This is what a notification looks like.</b>",
  "setup.latestMany": "Latest matching listings 👇",
  "setup.latestOne": "Latest matching listing 👇",
  "setup.none": "There are no matching listings right now — I’ll write as soon as they appear.",

  // описание бота и команды в меню
  "cmd.app": "Open the app",
  "cmd.today": "Listings from the last 24 hours",
  "cmd.status": "Last check of the websites",
  "cmd.stop": "Unsubscribe",
  "bot.short": "New flats and rooms all over Slovakia within 10 minutes: 4 websites, any city, map, reminders.",
  "bot.description":
    "I look for rentals all over Slovakia — Bratislava, Košice, Žilina, Nitra and any other town — on bazos, nehnutelnosti, " +
    "topreality and bezrealitky. I send new listings within 10 minutes, with a phone number and a call button. Tap “Start”.",
} satisfies Record<string, Entry>;

export type Key = keyof typeof en;
type Dict = Partial<Record<Key, Entry>>;

const ru: Dict = {
  "btn.openApp": "🏠 Открыть приложение",
  "btn.setup": "🚀 Настроить поиск",
  "btn.editFilters": "⚙️ Изменить фильтры",
  "btn.call": "📞 Позвонить",
  "btn.copyNumber": "📋 Номер",
  "btn.details": "📱 Подробнее",
  "btn.onSite": "🔗 На сайте",
  "btn.openListing": "🔗 Открыть объявление",
  "btn.openAll": "📱 Открыть все в приложении",
  "btn.pay": "💳 Оплатить подписку",
  "btn.manageSub": "⚙️ Управлять подпиской",
  "btn.startTrial": "🎁 Начать 7 дней бесплатно",
  "btn.trialShort": "🎁 7 дней бесплатно",
  "btn.subscribe": "💳 Оформить подписку",

  "kind.flat": "Квартира",
  "kind.studio": "Студия / 1-комн.",
  "kind.room": "Комната",
  "kind.hostel": "Общежитие (ubytovňa)",
  "kinds.flat": "квартиры",
  "kinds.studio": "студии",
  "kinds.room": "комнаты",
  "kinds.hostel": "общежития",
  "kinds.any": "любое жильё",

  "price.negotiable": "цена договорная",
  "price.split": "<b>{total} €</b> = аренда {price} + энергии {charges}",
  "price.included": "<b>{price} €</b> с энергиями ✓",
  "price.extra": "<b>{price} €</b> + энергии (сумма не указана)",
  "price.unknown": "<b>{price} €</b> · про энергии уточнить",
  "area": "{n} м²",
  "floor": "{f} эт.",
  "agency": "🏢 Агентство",
  "agency.commission": " · комиссия",
  "agency.private": "👤 Частник, без комиссии",
  "deposit": "🔐 Залог {n} €",

  "n.newListings": { one: "{n} новое объявление", few: "{n} новых объявления", many: "{n} новых объявлений" },
  "digest.title": "📬 <b>Подборка: {what}</b>",
  "digest.quiet": "🌅 <b>Пока были тихие часы — {what}</b>",
  "digest.more": "…и ещё {n}",
  "reminder.title": "⏰ <b>Напоминание</b>",
  "reminder.default": "Вы просили напомнить.",

  "today.none": "За последние сутки подходящих объявлений пока нет. Как только появятся — пришлю.",
  "today.count": {
    one: "📅 За последние 24 часа: <b>{n}</b> подходящее объявление",
    few: "📅 За последние 24 часа: <b>{n}</b> подходящих объявления",
    many: "📅 За последние 24 часа: <b>{n}</b> подходящих объявлений",
  },
  "today.more": ". Показываю {limit} самых свежих, остальные — в приложении.",
  "today.locked": "🔒 Новые объявления доступны по подписке.",
  "cancel.done": "Подписка отменена. Новые объявления больше не приходят, приложение закрыто. Вернуться можно в любой момент — кнопка ниже, это займёт минуту.",
  "cancel.back": "🔁 Оформить снова",
  "locked.any": "🔒 Бот доступен по подписке. Новые объявления по всей Словакии за 10 минут — оформите подписку, чтобы продолжить.",
  "retention.discountDone": "🎁 Готово — следующий месяц со скидкой 50%. Спасибо, что остаётесь!",

  "help":
    "Я ищу квартиры и комнаты по всей Словакии на bazos.sk, nehnutelnosti.sk (+reality.sk, byty.sk), " +
    "topreality.sk и bezrealitky.sk и присылаю новые объявления в течение 10 минут.\n\n" +
    "В приложении: выбор городов и районов, бюджет, агентство или частник, карта, избранное, напоминания и настройка уведомлений.\n\n" +
    "/today — объявления за сутки\n/app — открыть приложение\n/status — последняя проверка\n/stop — отписаться",
  "unknownCommand": "Неизвестная команда.",
  "stop.done": "Отписал. Чтобы снова получать объявления — /start",
  "start.welcome":
    "👋 <b>Привет! Я помогаю найти жильё в Словакии быстрее других.</b>\n\n" +
    "Каждые 10 минут проверяю bazos, nehnutelnosti, topreality и bezrealitky и присылаю сюда новые " +
    "объявления — с ценой, телефоном и кнопкой звонка. Хорошие варианты разбирают за пару часов, " +
    "поэтому важно узнавать первым.\n\n" +
    "<b>Нажмите кнопку ниже</b>, выберите город, бюджет и тип жилья — это займёт минуту. " +
    "После этого уведомления начнут приходить сюда.",
  "start.back": "👋 <b>С возвращением!</b>",
  "start.backPay": "👋 <b>С возвращением!</b> Чтобы снова получать новые объявления, оформите подписку.",
  "status.title": "🕒 Последняя проверка: {at}\n{lines}",
  "status.never": "ещё не было",
  "status.flats": "квартиры",
  "status.rooms": "комнаты",
  "status.error": "ошибка",

  "pay.free": "Сейчас бот бесплатный — ничего оплачивать не нужно.",
  "pay.comp": "У вас бесплатный доступ — оплачивать ничего не нужно 🙂",
  "pay.manage": "Управление подпиской — по кнопке ниже.",
  "pay.offer": "💳 <b>Подписка</b>: {trial}{price}. Отменить можно в любой момент.",
  "pay.trialPrefix": "первые 7 дней бесплатно, затем ",
  "paid.ok": "✅ Готово! Подписка активна — новые объявления будут приходить сюда.",
  "paid.wait": "⏳ Ждём подтверждения оплаты от Stripe — обычно это несколько секунд. Как только придёт, напишу.",
  "price.month": "мес",
  "price.year": "год",
  "sub.trial":
    "✅ <b>Пробный период активирован!</b>\n\n7 дней всё бесплатно{until}. Новые объявления будут приходить сюда. " +
    "Отменить подписку можно в любой момент.",
  "sub.until": " — до {date}",
  "sub.active": "✅ <b>Подписка оформлена.</b> Новые объявления будут приходить сюда.",
  "nag.canceled":
    "⛔️ <b>Подписка закончилась.</b>\n\nНовые объявления больше не приходят. Оформите подписку, чтобы снова узнавать о квартирах первыми.",
  "nag.failed":
    "⚠️ <b>Не удалось списать оплату за подписку.</b>\n\nДоступ к новым объявлениям приостановлен. Оплатите — и уведомления сразу продолжат приходить.",

  "f.where": "📍 <b>Где:</b> {v}",
  "f.what": "🏠 <b>Что:</b> {v}",
  "f.budget": "💶 <b>Бюджет:</b> {v}",
  "f.who": "🤝 <b>Кто сдаёт:</b> {v}",
  "f.notify": "🔔 <b>Уведомления:</b> {v}",
  "f.allSlovakia": "вся Словакия",
  "f.budgetAny": "любой",
  "f.budgetMax": "до {n} € с энергиями",
  "f.whoAny": "все",
  "f.whoPrivate": "только частники",
  "f.whoAgency": "только агентства",
  "f.instant": "сразу, как появится",
  "f.quietExcept": " (кроме {from}–{to})",
  "f.digest": "подборкой в {times}",
  "f.off": "выключены",
  "setup.updated": "✅ <b>Фильтр уведомлений обновлён</b>",
  "setup.welcome":
    "✅ <b>Готово, уведомления включены!</b>\n\n" +
    "Как только на bazos, nehnutelnosti, topreality или bezrealitky появится подходящее объявление — " +
    "пришлю его сюда, обычно в течение 10 минут после публикации. Хорошие варианты разбирают за часы, " +
    "так что вы будете звонить одним из первых.",
  "setup.test": "🔔 <b>Так выглядит уведомление.</b>",
  "setup.latestMany": "Последние подходящие объявления 👇",
  "setup.latestOne": "Последнее подходящее объявление 👇",
  "setup.none": "Прямо сейчас подходящих объявлений нет — как только появятся, сразу напишу.",

  "cmd.app": "Открыть приложение",
  "cmd.today": "Объявления за сутки",
  "cmd.status": "Последняя проверка сайтов",
  "cmd.stop": "Отписаться",
  "bot.short": "Новые квартиры и комнаты по всей Словакии за 10 минут: 4 сайта, любые города, карта, напоминания.",
  "bot.description":
    "Ищу аренду по всей Словакии — Bratislava, Košice, Žilina, Nitra и любые другие города — на bazos, nehnutelnosti, topreality и bezrealitky. " +
    "Присылаю новые объявления в течение 10 минут, с телефоном и кнопкой звонка. Нажмите «Старт».",
};

const sk: Dict = {
  "btn.openApp": "🏠 Otvoriť aplikáciu",
  "btn.setup": "🚀 Nastaviť hľadanie",
  "btn.editFilters": "⚙️ Upraviť filtre",
  "btn.call": "📞 Zavolať",
  "btn.copyNumber": "📋 Číslo",
  "btn.details": "📱 Podrobnosti",
  "btn.onSite": "🔗 Na webe",
  "btn.openListing": "🔗 Otvoriť inzerát",
  "btn.openAll": "📱 Otvoriť všetky v aplikácii",
  "btn.pay": "💳 Zaplatiť predplatné",
  "btn.manageSub": "⚙️ Spravovať predplatné",
  "btn.startTrial": "🎁 Vyskúšať 7 dní zadarmo",
  "btn.trialShort": "🎁 7 dní zadarmo",
  "btn.subscribe": "💳 Aktivovať predplatné",

  "kind.flat": "Byt",
  "kind.studio": "Garsónka / 1-izb.",
  "kind.room": "Izba",
  "kind.hostel": "Ubytovňa",
  "kinds.flat": "byty",
  "kinds.studio": "garsónky",
  "kinds.room": "izby",
  "kinds.hostel": "ubytovne",
  "kinds.any": "akékoľvek bývanie",

  "price.negotiable": "cena dohodou",
  "price.split": "<b>{total} €</b> = nájom {price} + energie {charges}",
  "price.included": "<b>{price} €</b> s energiami ✓",
  "price.extra": "<b>{price} €</b> + energie (suma neuvedená)",
  "price.unknown": "<b>{price} €</b> · energie treba overiť",
  "area": "{n} m²",
  "floor": "poschodie {f}",
  "agency": "🏢 Realitka",
  "agency.commission": " · provízia",
  "agency.private": "👤 Súkromná osoba, bez provízie",
  "deposit": "🔐 Kaucia {n} €",

  "n.newListings": { one: "{n} nový inzerát", few: "{n} nové inzeráty", many: "{n} nových inzerátov" },
  "digest.title": "📬 <b>Výber: {what}</b>",
  "digest.quiet": "🌅 <b>Počas tichých hodín — {what}</b>",
  "digest.more": "…a ďalšie {n}",
  "reminder.title": "⏰ <b>Pripomienka</b>",
  "reminder.default": "Požiadali ste o pripomenutie.",

  "today.none": "Za posledných 24 hodín zatiaľ nie sú žiadne vhodné inzeráty. Hneď ako sa objavia, pošlem ich.",
  "today.count": {
    one: "📅 Za posledných 24 hodín: <b>{n}</b> vhodný inzerát",
    few: "📅 Za posledných 24 hodín: <b>{n}</b> vhodné inzeráty",
    many: "📅 Za posledných 24 hodín: <b>{n}</b> vhodných inzerátov",
  },
  "today.more": ". Posielam {limit} najnovších, ostatné nájdete v aplikácii.",
  "today.locked": "🔒 Nové inzeráty sú dostupné s predplatným.",
  "cancel.done": "Predplatné je zrušené. Nové inzeráty už neprichádzajú a aplikácia je zamknutá. Vrátiť sa môžete kedykoľvek — tlačidlo nižšie, zaberie to minútu.",
  "cancel.back": "🔁 Predplatiť znova",
  "locked.any": "🔒 Bot je dostupný s predplatným. Nové inzeráty z celého Slovenska do 10 minút — predplaťte si, aby ste mohli pokračovať.",
  "retention.discountDone": "🎁 Hotovo — budúci mesiac máte so zľavou 50 %. Ďakujeme, že zostávate!",

  "help":
    "Hľadám byty a izby na celom Slovensku na bazos.sk, nehnutelnosti.sk (+reality.sk, byty.sk), " +
    "topreality.sk a bezrealitky.sk a nové inzeráty posielam do 10 minút.\n\n" +
    "V aplikácii: výber miest a mestských častí, rozpočet, realitka alebo súkromník, mapa, obľúbené, pripomienky a nastavenie upozornení.\n\n" +
    "/today — inzeráty za posledných 24 hodín\n/app — otvoriť aplikáciu\n/status — posledná kontrola\n/stop — odhlásiť sa",
  "unknownCommand": "Neznámy príkaz.",
  "stop.done": "Odhlásené. Ak chcete znova dostávať inzeráty — /start",
  "start.welcome":
    "👋 <b>Vitajte! Pomôžem vám nájsť bývanie na Slovensku rýchlejšie ako ostatní.</b>\n\n" +
    "Každých 10 minút kontrolujem bazos, nehnutelnosti, topreality a bezrealitky a posielam sem nové " +
    "inzeráty — s cenou, telefónom a tlačidlom na zavolanie. Dobré ponuky zmiznú za pár hodín, " +
    "preto je dôležité dozvedieť sa o nich prvý.\n\n" +
    "<b>Stlačte tlačidlo nižšie</b> a vyberte mesto, rozpočet a typ bývania — zaberie to minútu. " +
    "Potom vám sem začnú chodiť upozornenia.",
  "start.back": "👋 <b>Vitajte späť!</b>",
  "start.backPay": "👋 <b>Vitajte späť!</b> Ak chcete znova dostávať nové inzeráty, aktivujte si predplatné.",
  "status.title": "🕒 Posledná kontrola: {at}\n{lines}",
  "status.never": "zatiaľ neprebehla",
  "status.flats": "byty",
  "status.rooms": "izby",
  "status.error": "chyba",

  "pay.free": "Bot je teraz zadarmo — nič nemusíte platiť.",
  "pay.comp": "Máte bezplatný prístup — nič nemusíte platiť 🙂",
  "pay.manage": "Predplatné spravujete tlačidlom nižšie.",
  "pay.offer": "💳 <b>Predplatné</b>: {trial}{price}. Zrušiť ho môžete kedykoľvek.",
  "pay.trialPrefix": "prvých 7 dní zadarmo, potom ",
  "paid.ok": "✅ Hotovo! Predplatné je aktívne — nové inzeráty budú chodiť sem.",
  "paid.wait": "⏳ Čakáme na potvrdenie platby od Stripe — zvyčajne to trvá pár sekúnd. Hneď ako príde, dám vám vedieť.",
  "price.month": "mesiac",
  "price.year": "rok",
  "sub.trial":
    "✅ <b>Skúšobné obdobie je aktívne!</b>\n\n7 dní je všetko zadarmo{until}. Nové inzeráty budú chodiť sem. " +
    "Predplatné môžete kedykoľvek zrušiť.",
  "sub.until": " — do {date}",
  "sub.active": "✅ <b>Predplatné je aktivované.</b> Nové inzeráty budú chodiť sem.",
  "nag.canceled":
    "⛔️ <b>Predplatné sa skončilo.</b>\n\nNové inzeráty už neprichádzajú. Obnovte predplatné, aby ste sa o bytoch znova dozvedali medzi prvými.",
  "nag.failed":
    "⚠️ <b>Platbu za predplatné sa nepodarilo strhnúť.</b>\n\nPrístup k novým inzerátom je pozastavený. Po zaplatení začnú upozornenia hneď znova chodiť.",

  "f.where": "📍 <b>Kde:</b> {v}",
  "f.what": "🏠 <b>Čo:</b> {v}",
  "f.budget": "💶 <b>Rozpočet:</b> {v}",
  "f.who": "🤝 <b>Kto prenajíma:</b> {v}",
  "f.notify": "🔔 <b>Upozornenia:</b> {v}",
  "f.allSlovakia": "celé Slovensko",
  "f.budgetAny": "akýkoľvek",
  "f.budgetMax": "do {n} € s energiami",
  "f.whoAny": "všetci",
  "f.whoPrivate": "len súkromníci",
  "f.whoAgency": "len realitky",
  "f.instant": "hneď, ako sa objavia",
  "f.quietExcept": " (okrem {from}–{to})",
  "f.digest": "výberom o {times}",
  "f.off": "vypnuté",
  "setup.updated": "✅ <b>Filter upozornení je aktualizovaný</b>",
  "setup.welcome":
    "✅ <b>Hotovo, upozornenia sú zapnuté!</b>\n\n" +
    "Hneď ako sa na bazos, nehnutelnosti, topreality alebo bezrealitky objaví vhodný inzerát, " +
    "pošlem vám ho sem — zvyčajne do 10 minút od zverejnenia. Dobré ponuky zmiznú za pár hodín, " +
    "takže budete volať medzi prvými.",
  "setup.test": "🔔 <b>Takto vyzerá upozornenie.</b>",
  "setup.latestMany": "Najnovšie vhodné inzeráty 👇",
  "setup.latestOne": "Najnovší vhodný inzerát 👇",
  "setup.none": "Momentálne tu nie sú žiadne vhodné inzeráty — hneď ako sa objavia, napíšem.",

  "cmd.app": "Otvoriť aplikáciu",
  "cmd.today": "Inzeráty za posledných 24 hodín",
  "cmd.status": "Posledná kontrola webov",
  "cmd.stop": "Odhlásiť sa",
  "bot.short": "Nové byty a izby z celého Slovenska do 10 minút: 4 weby, akékoľvek mesto, mapa, pripomienky.",
  "bot.description":
    "Hľadám prenájmy na celom Slovensku — Bratislava, Košice, Žilina, Nitra a akékoľvek iné mesto — na bazos, nehnutelnosti, " +
    "topreality a bezrealitky. Nové inzeráty posielam do 10 minút, s telefónom a tlačidlom na zavolanie. Začnite tlačidlom nižšie.",
};

const uk: Dict = {
  "btn.openApp": "🏠 Відкрити застосунок",
  "btn.setup": "🚀 Налаштувати пошук",
  "btn.editFilters": "⚙️ Змінити фільтри",
  "btn.call": "📞 Зателефонувати",
  "btn.copyNumber": "📋 Номер",
  "btn.details": "📱 Детальніше",
  "btn.onSite": "🔗 На сайті",
  "btn.openListing": "🔗 Відкрити оголошення",
  "btn.openAll": "📱 Відкрити всі в застосунку",
  "btn.pay": "💳 Оплатити підписку",
  "btn.manageSub": "⚙️ Керувати підпискою",
  "btn.startTrial": "🎁 Почати 7 днів безкоштовно",
  "btn.trialShort": "🎁 7 днів безкоштовно",
  "btn.subscribe": "💳 Оформити підписку",

  "kind.flat": "Квартира",
  "kind.studio": "Студія / 1-кімн.",
  "kind.room": "Кімната",
  "kind.hostel": "Гуртожиток (ubytovňa)",
  "kinds.flat": "квартири",
  "kinds.studio": "студії",
  "kinds.room": "кімнати",
  "kinds.hostel": "гуртожитки",
  "kinds.any": "будь-яке житло",

  "price.negotiable": "ціна договірна",
  "price.split": "<b>{total} €</b> = оренда {price} + комунальні {charges}",
  "price.included": "<b>{price} €</b> з комунальними ✓",
  "price.extra": "<b>{price} €</b> + комунальні (сума не вказана)",
  "price.unknown": "<b>{price} €</b> · про комунальні уточнити",
  "area": "{n} м²",
  "floor": "{f} пов.",
  "agency": "🏢 Агентство",
  "agency.commission": " · комісія",
  "agency.private": "👤 Власник, без комісії",
  "deposit": "🔐 Застава {n} €",

  "n.newListings": { one: "{n} нове оголошення", few: "{n} нові оголошення", many: "{n} нових оголошень" },
  "digest.title": "📬 <b>Добірка: {what}</b>",
  "digest.quiet": "🌅 <b>За тихі години — {what}</b>",
  "digest.more": "…і ще {n}",
  "reminder.title": "⏰ <b>Нагадування</b>",
  "reminder.default": "Ви просили нагадати.",

  "today.none": "За останню добу підходящих оголошень поки немає. Щойно з’являться — надішлю.",
  "today.count": {
    one: "📅 За останні 24 години: <b>{n}</b> підходяще оголошення",
    few: "📅 За останні 24 години: <b>{n}</b> підходящі оголошення",
    many: "📅 За останні 24 години: <b>{n}</b> підходящих оголошень",
  },
  "today.more": ". Показую {limit} найсвіжіших, решта — у застосунку.",
  "today.locked": "🔒 Нові оголошення доступні за підпискою.",
  "cancel.done": "Підписку скасовано. Нові оголошення більше не надходять, застосунок закрито. Повернутися можна будь-коли — кнопка нижче, це займе хвилину.",
  "cancel.back": "🔁 Оформити знову",
  "locked.any": "🔒 Бот доступний за підпискою. Нові оголошення по всій Словаччині за 10 хвилин — оформіть підписку, щоб продовжити.",
  "retention.discountDone": "🎁 Готово — наступний місяць зі знижкою 50%. Дякуємо, що залишаєтеся!",

  "help":
    "Я шукаю квартири й кімнати по всій Словаччині на bazos.sk, nehnutelnosti.sk (+reality.sk, byty.sk), " +
    "topreality.sk і bezrealitky.sk та надсилаю нові оголошення протягом 10 хвилин.\n\n" +
    "У застосунку: вибір міст і районів, бюджет, агентство чи власник, мапа, обране, нагадування та налаштування сповіщень.\n\n" +
    "/today — оголошення за добу\n/app — відкрити застосунок\n/status — остання перевірка\n/stop — відписатися",
  "unknownCommand": "Невідома команда.",
  "stop.done": "Відписав. Щоб знову отримувати оголошення — /start",
  "start.welcome":
    "👋 <b>Привіт! Я допомагаю знайти житло у Словаччині швидше за інших.</b>\n\n" +
    "Кожні 10 хвилин перевіряю bazos, nehnutelnosti, topreality і bezrealitky та надсилаю сюди нові " +
    "оголошення — з ціною, телефоном і кнопкою дзвінка. Хороші варіанти розбирають за кілька годин, " +
    "тому важливо дізнаватися першим.\n\n" +
    "<b>Натисніть кнопку нижче</b>, виберіть місто, бюджет і тип житла — це займе хвилину. " +
    "Після цього сповіщення почнуть надходити сюди.",
  "start.back": "👋 <b>З поверненням!</b>",
  "start.backPay": "👋 <b>З поверненням!</b> Щоб знову отримувати нові оголошення, оформіть підписку.",
  "status.title": "🕒 Остання перевірка: {at}\n{lines}",
  "status.never": "ще не було",
  "status.flats": "квартири",
  "status.rooms": "кімнати",
  "status.error": "помилка",

  "pay.free": "Зараз бот безкоштовний — нічого оплачувати не потрібно.",
  "pay.comp": "У вас безкоштовний доступ — нічого оплачувати не потрібно 🙂",
  "pay.manage": "Керування підпискою — за кнопкою нижче.",
  "pay.offer": "💳 <b>Підписка</b>: {trial}{price}. Скасувати можна будь-коли.",
  "pay.trialPrefix": "перші 7 днів безкоштовно, потім ",
  "paid.ok": "✅ Готово! Підписка активна — нові оголошення надходитимуть сюди.",
  "paid.wait": "⏳ Чекаємо на підтвердження оплати від Stripe — зазвичай це кілька секунд. Щойно надійде, напишу.",
  "price.month": "міс",
  "price.year": "рік",
  "sub.trial":
    "✅ <b>Пробний період активовано!</b>\n\n7 днів усе безкоштовно{until}. Нові оголошення надходитимуть сюди. " +
    "Скасувати підписку можна будь-коли.",
  "sub.until": " — до {date}",
  "sub.active": "✅ <b>Підписку оформлено.</b> Нові оголошення надходитимуть сюди.",
  "nag.canceled":
    "⛔️ <b>Підписка закінчилася.</b>\n\nНові оголошення більше не надходять. Оформіть підписку, щоб знову дізнаватися про квартири першими.",
  "nag.failed":
    "⚠️ <b>Не вдалося списати оплату за підписку.</b>\n\nДоступ до нових оголошень призупинено. Оплатіть — і сповіщення одразу надходитимуть знову.",

  "f.where": "📍 <b>Де:</b> {v}",
  "f.what": "🏠 <b>Що:</b> {v}",
  "f.budget": "💶 <b>Бюджет:</b> {v}",
  "f.who": "🤝 <b>Хто здає:</b> {v}",
  "f.notify": "🔔 <b>Сповіщення:</b> {v}",
  "f.allSlovakia": "уся Словаччина",
  "f.budgetAny": "будь-який",
  "f.budgetMax": "до {n} € з комунальними",
  "f.whoAny": "усі",
  "f.whoPrivate": "лише власники",
  "f.whoAgency": "лише агентства",
  "f.instant": "одразу, щойно з’являться",
  "f.quietExcept": " (крім {from}–{to})",
  "f.digest": "добіркою о {times}",
  "f.off": "вимкнені",
  "setup.updated": "✅ <b>Фільтр сповіщень оновлено</b>",
  "setup.welcome":
    "✅ <b>Готово, сповіщення увімкнено!</b>\n\n" +
    "Щойно на bazos, nehnutelnosti, topreality або bezrealitky з’явиться підходяще оголошення — " +
    "надішлю його сюди, зазвичай протягом 10 хвилин після публікації. Хороші варіанти розбирають за години, " +
    "тож ви телефонуватимете одним із перших.",
  "setup.test": "🔔 <b>Так виглядає сповіщення.</b>",
  "setup.latestMany": "Останні підходящі оголошення 👇",
  "setup.latestOne": "Останнє підходяще оголошення 👇",
  "setup.none": "Просто зараз підходящих оголошень немає — щойно з’являться, одразу напишу.",

  "cmd.app": "Відкрити застосунок",
  "cmd.today": "Оголошення за добу",
  "cmd.status": "Остання перевірка сайтів",
  "cmd.stop": "Відписатися",
  "bot.short": "Нові квартири й кімнати по всій Словаччині за 10 хвилин: 4 сайти, будь-які міста, мапа, нагадування.",
  "bot.description":
    "Шукаю оренду по всій Словаччині — Bratislava, Košice, Žilina, Nitra та будь-які інші міста — на bazos, nehnutelnosti, " +
    "topreality і bezrealitky. Надсилаю нові оголошення протягом 10 хвилин, з телефоном і кнопкою дзвінка. Натисніть кнопку нижче, щоб почати.",
};

const be: Dict = {
  "btn.openApp": "🏠 Адкрыць праграму",
  "btn.setup": "🚀 Наладзіць пошук",
  "btn.editFilters": "⚙️ Змяніць фільтры",
  "btn.call": "📞 Патэлефанаваць",
  "btn.copyNumber": "📋 Нумар",
  "btn.details": "📱 Падрабязней",
  "btn.onSite": "🔗 На сайце",
  "btn.openListing": "🔗 Адкрыць аб’яву",
  "btn.openAll": "📱 Адкрыць усе ў праграме",
  "btn.pay": "💳 Аплаціць падпіску",
  "btn.manageSub": "⚙️ Кіраваць падпіскай",
  "btn.startTrial": "🎁 Пачаць 7 дзён бясплатна",
  "btn.trialShort": "🎁 7 дзён бясплатна",
  "btn.subscribe": "💳 Аформіць падпіску",

  "kind.flat": "Кватэра",
  "kind.studio": "Студыя / 1-пак.",
  "kind.room": "Пакой",
  "kind.hostel": "Інтэрнат (ubytovňa)",
  "kinds.flat": "кватэры",
  "kinds.studio": "студыі",
  "kinds.room": "пакоі",
  "kinds.hostel": "інтэрнаты",
  "kinds.any": "любое жыллё",

  "price.negotiable": "цана дамоўная",
  "price.split": "<b>{total} €</b> = арэнда {price} + камунальныя {charges}",
  "price.included": "<b>{price} €</b> з камунальнымі ✓",
  "price.extra": "<b>{price} €</b> + камунальныя (сума не пазначана)",
  "price.unknown": "<b>{price} €</b> · пра камунальныя ўдакладніць",
  "area": "{n} м²",
  "floor": "{f} пав.",
  "agency": "🏢 Агенцтва",
  "agency.commission": " · камісія",
  "agency.private": "👤 Прыватная асоба, без камісіі",
  "deposit": "🔐 Заклад {n} €",

  "n.newListings": { one: "{n} новая аб’ява", few: "{n} новыя аб’явы", many: "{n} новых аб’яў" },
  "digest.title": "📬 <b>Падборка: {what}</b>",
  "digest.quiet": "🌅 <b>За ціхія гадзіны — {what}</b>",
  "digest.more": "…і яшчэ {n}",
  "reminder.title": "⏰ <b>Нагадванне</b>",
  "reminder.default": "Вы прасілі нагадаць.",

  "today.none": "За апошнія суткі адпаведных аб’яў пакуль няма. Як толькі з’явяцца — дашлю.",
  "today.count": {
    one: "📅 За апошнія 24 гадзіны: <b>{n}</b> адпаведная аб’ява",
    few: "📅 За апошнія 24 гадзіны: <b>{n}</b> адпаведныя аб’явы",
    many: "📅 За апошнія 24 гадзіны: <b>{n}</b> адпаведных аб’яў",
  },
  "today.more": ". Паказваю {limit} самых свежых, астатнія — у праграме.",
  "today.locked": "🔒 Новыя аб’явы даступныя па падпісцы.",
  "cancel.done": "Падпіска скасавана. Новыя аб’явы больш не прыходзяць, дадатак закрыты. Вярнуцца можна ў любы момант — кнопка ніжэй, гэта зойме хвіліну.",
  "cancel.back": "🔁 Аформіць зноў",
  "locked.any": "🔒 Бот даступны па падпісцы. Новыя аб’явы па ўсёй Славакіі за 10 хвілін — аформіце падпіску, каб працягнуць.",
  "retention.discountDone": "🎁 Гатова — наступны месяц са зніжкай 50%. Дзякуй, што застаяцеся!",

  "help":
    "Я шукаю кватэры і пакоі па ўсёй Славакіі на bazos.sk, nehnutelnosti.sk (+reality.sk, byty.sk), " +
    "topreality.sk і bezrealitky.sk і дасылаю новыя аб’явы на працягу 10 хвілін.\n\n" +
    "У праграме: выбар гарадоў і раёнаў, бюджэт, агенцтва ці прыватнік, карта, абранае, нагадванні і налады апавяшчэнняў.\n\n" +
    "/today — аб’явы за суткі\n/app — адкрыць праграму\n/status — апошняя праверка\n/stop — адпісацца",
  "unknownCommand": "Невядомая каманда.",
  "stop.done": "Адпісаў. Каб зноў атрымліваць аб’явы — /start",
  "start.welcome":
    "👋 <b>Прывітанне! Я дапамагаю знайсці жыллё ў Славакіі хутчэй за іншых.</b>\n\n" +
    "Кожныя 10 хвілін правяраю bazos, nehnutelnosti, topreality і bezrealitky і дасылаю сюды новыя " +
    "аб’явы — з цаной, тэлефонам і кнопкай званка. Добрыя варыянты разбіраюць за пару гадзін, " +
    "таму важна даведвацца першым.\n\n" +
    "<b>Націсніце кнопку ніжэй</b>, выберыце горад, бюджэт і тып жылля — гэта зойме хвіліну. " +
    "Пасля гэтага апавяшчэнні пачнуць прыходзіць сюды.",
  "start.back": "👋 <b>З вяртаннем!</b>",
  "start.backPay": "👋 <b>З вяртаннем!</b> Каб зноў атрымліваць новыя аб’явы, аформіце падпіску.",
  "status.title": "🕒 Апошняя праверка: {at}\n{lines}",
  "status.never": "яшчэ не было",
  "status.flats": "кватэры",
  "status.rooms": "пакоі",
  "status.error": "памылка",

  "pay.free": "Зараз бот бясплатны — нічога плаціць не трэба.",
  "pay.comp": "У вас бясплатны доступ — нічога плаціць не трэба 🙂",
  "pay.manage": "Кіраванне падпіскай — па кнопцы ніжэй.",
  "pay.offer": "💳 <b>Падпіска</b>: {trial}{price}. Скасаваць можна ў любы момант.",
  "pay.trialPrefix": "першыя 7 дзён бясплатна, потым ",
  "paid.ok": "✅ Гатова! Падпіска актыўная — новыя аб’явы будуць прыходзіць сюды.",
  "paid.wait": "⏳ Чакаем пацвярджэння аплаты ад Stripe — звычайна гэта некалькі секунд. Як толькі прыйдзе, напішу.",
  "price.month": "мес",
  "price.year": "год",
  "sub.trial":
    "✅ <b>Пробны перыяд актываваны!</b>\n\n7 дзён усё бясплатна{until}. Новыя аб’явы будуць прыходзіць сюды. " +
    "Скасаваць падпіску можна ў любы момант.",
  "sub.until": " — да {date}",
  "sub.active": "✅ <b>Падпіска аформлена.</b> Новыя аб’явы будуць прыходзіць сюды.",
  "nag.canceled":
    "⛔️ <b>Падпіска скончылася.</b>\n\nНовыя аб’явы больш не прыходзяць. Аформіце падпіску, каб зноў даведвацца пра кватэры першымі.",
  "nag.failed":
    "⚠️ <b>Не ўдалося спісаць аплату за падпіску.</b>\n\nДоступ да новых аб’яў прыпынены. Аплаціце — і апавяшчэнні адразу зноў пачнуць прыходзіць.",

  "f.where": "📍 <b>Дзе:</b> {v}",
  "f.what": "🏠 <b>Што:</b> {v}",
  "f.budget": "💶 <b>Бюджэт:</b> {v}",
  "f.who": "🤝 <b>Хто здае:</b> {v}",
  "f.notify": "🔔 <b>Апавяшчэнні:</b> {v}",
  "f.allSlovakia": "уся Славакія",
  "f.budgetAny": "любы",
  "f.budgetMax": "да {n} € з камунальнымі",
  "f.whoAny": "усе",
  "f.whoPrivate": "толькі прыватнікі",
  "f.whoAgency": "толькі агенцтвы",
  "f.instant": "адразу, як з’явяцца",
  "f.quietExcept": " (акрамя {from}–{to})",
  "f.digest": "падборкай у {times}",
  "f.off": "выключаныя",
  "setup.updated": "✅ <b>Фільтр апавяшчэнняў абноўлены</b>",
  "setup.welcome":
    "✅ <b>Гатова, апавяшчэнні ўключаныя!</b>\n\n" +
    "Як толькі на bazos, nehnutelnosti, topreality ці bezrealitky з’явіцца адпаведная аб’ява — " +
    "дашлю яе сюды, звычайна на працягу 10 хвілін пасля публікацыі. Добрыя варыянты разбіраюць за гадзіны, " +
    "так што вы будзеце тэлефанаваць адным з першых.",
  "setup.test": "🔔 <b>Так выглядае апавяшчэнне.</b>",
  "setup.latestMany": "Апошнія адпаведныя аб’явы 👇",
  "setup.latestOne": "Апошняя адпаведная аб’ява 👇",
  "setup.none": "Зараз адпаведных аб’яў няма — як толькі з’явяцца, адразу напішу.",

  "cmd.app": "Адкрыць праграму",
  "cmd.today": "Аб’явы за суткі",
  "cmd.status": "Апошняя праверка сайтаў",
  "cmd.stop": "Адпісацца",
  "bot.short": "Новыя кватэры і пакоі па ўсёй Славакіі за 10 хвілін: 4 сайты, любыя гарады, карта, нагадванні.",
  "bot.description":
    "Шукаю арэнду па ўсёй Славакіі — Bratislava, Košice, Žilina, Nitra і любыя іншыя гарады — на bazos, nehnutelnosti, " +
    "topreality і bezrealitky. Дасылаю новыя аб’явы на працягу 10 хвілін, з тэлефонам і кнопкай званка. Націсніце кнопку ніжэй, каб пачаць.",
};

const DICTS: Record<Lang, Dict> = { en, ru, sk, uk, be };

export type Vars = Record<string, string | number>;

export function tr(lang: Lang | null | undefined, key: Key, vars: Vars = {}): string {
  const want = langOr(lang);
  let from: Lang = want;
  let e = DICTS[want][key];
  if (e == null) {
    from = "en";
    e = DICTS.en[key];
  }
  if (e == null) return key;
  const s = typeof e === "string" ? e : pick(from, e, Number(vars.n ?? 0));
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// t = L(lang); t("key", { n: 3 })
export const L = (lang: Lang | null | undefined) => (key: Key, vars?: Vars) => tr(lang, key, vars);
