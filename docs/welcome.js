/* Экран приветствия и выбора языка (первый запуск).
   API: window.FBWelcome.show({ current }) -> Promise<'ru'|'en'|'sk'|'uk'|'be'>
        window.FBWelcome.LANGS -> [{ code, name, flagSvg, en }]
   Без зависимостей; стили — welcome.css (классы fbw-*). */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- флаги
     viewBox 28x20, скругление rx=4 через clipPath, тонкая внутренняя рамка. */
  const flag = (id, body) =>
    `<svg class="fbw-flagsvg" viewBox="0 0 28 20" width="28" height="20" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><clipPath id="fbw-cp-${id}"><rect width="28" height="20" rx="4"/></clipPath></defs>` +
    `<g clip-path="url(#fbw-cp-${id})">${body}</g>` +
    `<rect x=".5" y=".5" width="27" height="19" rx="3.5" fill="none" stroke="rgba(0,0,0,.14)"/></svg>`;

  const FLAG_RU = flag("ru",
    `<rect width="28" height="20" fill="#fff"/><rect y="6.67" width="28" height="6.67" fill="#0039a6"/><rect y="13.33" width="28" height="6.67" fill="#d52b1e"/>`);

  const FLAG_GB = flag("gb",
    `<rect width="28" height="20" fill="#012169"/>` +
    `<path d="M0 0L28 20M28 0L0 20" stroke="#fff" stroke-width="4.2"/>` +
    `<path d="M0 0L14 10M28 20L14 10" stroke="#c8102e" stroke-width="1.5" transform="translate(-.7 .9)"/>` +
    `<path d="M28 0L14 10M0 20L14 10" stroke="#c8102e" stroke-width="1.5" transform="translate(.7 .9)"/>` +
    `<path d="M14 0V20M0 10H28" stroke="#fff" stroke-width="6.4"/>` +
    `<path d="M14 0V20M0 10H28" stroke="#c8102e" stroke-width="3.6"/>`);

  // Словакия: триколор + герб (красный щит, белый двойной крест, синие холмы)
  const FLAG_SK = flag("sk",
    `<rect width="28" height="20" fill="#fff"/><rect y="6.67" width="28" height="6.67" fill="#0b4ea2"/><rect y="13.33" width="28" height="6.67" fill="#ee1c25"/>` +
    `<defs><clipPath id="fbw-cp-sk-sh"><path d="M5.2 4.2H13.8V10.6C13.8 13.6 11.7 15.3 9.5 16.4 7.3 15.3 5.2 13.6 5.2 10.6Z"/></clipPath></defs>` +
    `<path d="M5.2 4.2H13.8V10.6C13.8 13.6 11.7 15.3 9.5 16.4 7.3 15.3 5.2 13.6 5.2 10.6Z" fill="#ee1c25" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<g clip-path="url(#fbw-cp-sk-sh)" fill="#0b4ea2"><circle cx="6.9" cy="15.6" r="2.2"/><circle cx="12.1" cy="15.6" r="2.2"/><circle cx="9.5" cy="14.1" r="2.3"/></g>` +
    `<g fill="#fff"><rect x="9" y="5.6" width="1" height="7.6"/><rect x="7.6" y="7" width="3.8" height=".95"/><rect x="6.9" y="8.9" width="5.2" height="1"/></g>`);

  const FLAG_UA = flag("ua",
    `<rect width="28" height="10" fill="#0057b7"/><rect y="10" width="28" height="10" fill="#ffd700"/>`);

  // Беларусь: красный/зелёный + упрощённый орнамент у древка
  const diamonds = [2, 6, 10, 14, 18]
    .map((y) => `<path d="M1.75 ${y - 1.7}L2.95 ${y}L1.75 ${y + 1.7}L.55 ${y}Z"/>`).join("");
  const FLAG_BY = flag("by",
    `<rect width="28" height="20" fill="#c8313e"/><rect y="13.33" width="28" height="6.67" fill="#4aa657"/>` +
    `<rect width="3.5" height="20" fill="#fff"/><g fill="#c8313e">${diamonds}</g>`);

  const LANGS = [
    { code: "ru", name: "Русский", en: "Russian", flagSvg: FLAG_RU },
    { code: "en", name: "English", en: "English", flagSvg: FLAG_GB },
    { code: "sk", name: "Slovenčina", en: "Slovak", flagSvg: FLAG_SK },
    { code: "uk", name: "Українська", en: "Ukrainian", flagSvg: FLAG_UA },
    { code: "be", name: "Беларуская", en: "Belarusian", flagSvg: FLAG_BY },
  ];
  const CODES = LANGS.map((l) => l.code);

  /* ---------------------------------------------------------------- тексты */
  const T = {
    ru: {
      app: "Аренда в Словакии",
      title: "Привет! Найдём жильё в Словакии быстрее других",
      sub: "Каждые 10 минут проверяем 4 сайта объявлений и сразу присылаем новые квартиры и комнаты в чат.",
      pick: "Выберите язык",
      cta: "Продолжить",
      names: { ru: "Русский", en: "Английский", sk: "Словацкий", uk: "Украинский", be: "Белорусский" },
    },
    en: {
      app: "Rentals in Slovakia",
      title: "Hi! Let’s find you a place in Slovakia before anyone else",
      sub: "Every 10 minutes we check 4 listing sites and send new flats and rooms straight to your chat.",
      pick: "Choose your language",
      cta: "Continue",
      names: { ru: "Russian", en: "English", sk: "Slovak", uk: "Ukrainian", be: "Belarusian" },
    },
    sk: {
      app: "Prenájom na Slovensku",
      title: "Ahoj! Nájdeme ti bývanie na Slovensku skôr ako ostatní",
      sub: "Každých 10 minút prezrieme 4 realitné portály a nové byty a izby ti hneď pošleme do chatu.",
      pick: "Vyber si jazyk",
      cta: "Pokračovať",
      names: { ru: "Ruština", en: "Angličtina", sk: "Slovenčina", uk: "Ukrajinčina", be: "Bieloruština" },
    },
    uk: {
      app: "Оренда у Словаччині",
      title: "Привіт! Знайдемо житло у Словаччині швидше за інших",
      sub: "Кожні 10 хвилин перевіряємо 4 сайти оголошень і одразу надсилаємо нові квартири та кімнати в чат.",
      pick: "Оберіть мову",
      cta: "Продовжити",
      names: { ru: "Російська", en: "Англійська", sk: "Словацька", uk: "Українська", be: "Білоруська" },
    },
    be: {
      app: "Арэнда ў Славакіі",
      title: "Прывітанне! Знойдзем жыллё ў Славакіі хутчэй за іншых",
      sub: "Кожныя 10 хвілін правяраем 4 сайты абвестак і адразу дасылаем новыя кватэры і пакоі ў чат.",
      pick: "Абярыце мову",
      cta: "Працягнуць",
      names: { ru: "Руская", en: "Англійская", sk: "Славацкая", uk: "Украінская", be: "Беларуская" },
    },
  };

  /* ---------------------------------------------------------------- утилиты */
  const tg = () => (window.Telegram && window.Telegram.WebApp) || null;
  const haptic = (fn, arg) => {
    try {
      const h = tg() && tg().HapticFeedback;
      if (h && typeof h[fn] === "function") h[fn](arg);
    } catch (_) { /* старый клиент */ }
  };
  const reduced = () => {
    try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; }
  };

  function normalize(code) {
    if (!code) return null;
    const c = String(code).toLowerCase().split(/[-_]/)[0];
    if (CODES.includes(c)) return c;
    if (c === "cs") return "sk";
    if (c === "ua") return "uk";
    if (c === "by") return "be";
    return null;
  }

  function detect() {
    let code = null;
    try { code = tg() && tg().initDataUnsafe && tg().initDataUnsafe.user && tg().initDataUnsafe.user.language_code; } catch (_) { /* нет TG */ }
    let lang = normalize(code);
    if (!lang) {
      const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || [];
      for (const l of list) { lang = normalize(l); if (lang) break; }
    }
    return lang || "en";
  }

  // подпись под родным названием: имя языка на текущем языке интерфейса,
  // а если совпадает с родным — английское название
  function secondary(rowCode, ui) {
    const local = T[ui].names[rowCode];
    const row = LANGS.find((l) => l.code === rowCode);
    if (local.toLowerCase() !== row.name.toLowerCase()) return local;
    return rowCode === "en" ? "International" : row.en;
  }

  const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ARROW = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  /* ---------------------------------------------------------------- экран */
  let active = null; // { promise }

  function show(opts) {
    if (active) return active.promise;
    const options = opts || {};
    let lang = normalize(options.current) || detect();

    const root = document.createElement("div");
    root.className = "fbw";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "fbw-title");
    root.innerHTML = `
      <div class="fbw-wrap">
        <div class="fbw-scroll">
          <header class="fbw-hero">
            <span class="fbw-blob fbw-blob1" aria-hidden="true"></span>
            <span class="fbw-blob fbw-blob2" aria-hidden="true"></span>
            <div class="fbw-brand"><span class="fbw-brand-dot" aria-hidden="true"></span><span class="fbw-t" data-k="app"></span></div>
            <div class="fbw-art" aria-hidden="true">
              <span class="fbw-ring"></span><span class="fbw-ring fbw-ring2"></span>
              <span class="fbw-tile"><span class="fbw-house">🏠</span></span>
              <span class="fbw-fly fbw-fly-key">🔑</span>
              <span class="fbw-fly fbw-fly-pin">📍</span>
              <span class="fbw-fly fbw-fly-bell">🔔</span>
              <span class="fbw-spark fbw-spark1"></span><span class="fbw-spark fbw-spark2"></span><span class="fbw-spark fbw-spark3"></span>
            </div>
            <h1 class="fbw-title fbw-t" id="fbw-title" data-k="title"></h1>
            <p class="fbw-sub fbw-t" data-k="sub"></p>
          </header>
          <section class="fbw-sheet">
            <div class="fbw-label fbw-t" id="fbw-pick" data-k="pick"></div>
            <div class="fbw-list" role="group" aria-labelledby="fbw-pick">
              ${LANGS.map((l, i) => `
                <button type="button" class="fbw-opt" data-code="${l.code}" lang="${l.code}" style="--i:${i}" aria-pressed="false">
                  <span class="fbw-flag">${l.flagSvg}</span>
                  <span class="fbw-names"><b>${l.name}</b><small class="fbw-sec"></small></span>
                  <span class="fbw-ck">${CHECK}</span>
                </button>`).join("")}
            </div>
          </section>
        </div>
        <footer class="fbw-foot">
          <button type="button" class="fbw-cta"><span class="fbw-t" data-k="cta"></span>${ARROW}</button>
        </footer>
      </div>`;

    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));

    function render(animate) {
      const t = T[lang];
      root.setAttribute("lang", lang);
      $$(".fbw-t").forEach((el) => {
        const k = el.getAttribute("data-k");
        if (el.textContent === t[k]) return;
        el.textContent = t[k];
        if (animate && !reduced()) {
          el.classList.remove("fbw-swap");
          void el.offsetWidth; // перезапуск анимации
          el.classList.add("fbw-swap");
        }
      });
      $$(".fbw-opt").forEach((b) => {
        const on = b.getAttribute("data-code") === lang;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.querySelector(".fbw-sec").textContent = secondary(b.getAttribute("data-code"), lang);
      });
      $(".fbw-cta").setAttribute("aria-label", t.cta);
    }

    render(false);

    let resolveFn;
    const promise = new Promise((res) => { resolveFn = res; });
    active = { promise };

    $(".fbw-list").addEventListener("click", (e) => {
      const b = e.target.closest(".fbw-opt");
      if (!b) return;
      const code = b.getAttribute("data-code");
      if (code === lang) return;
      lang = code;
      haptic("selectionChanged");
      render(true);
    });

    // стрелки вверх/вниз переключают язык
    $(".fbw-list").addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const opts = $$(".fbw-opt");
      const i = opts.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const next = opts[(i + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length];
      next.focus();
      next.click();
    });

    let done = false;
    $(".fbw-cta").addEventListener("click", () => {
      if (done) return;
      done = true;
      haptic("impactOccurred", "light");
      root.classList.add("fbw-out");
      const finish = () => {
        if (!root.isConnected) return;
        root.remove();
        document.documentElement.classList.remove("fbw-lock");
        active = null;
        resolveFn(lang);
      };
      if (reduced()) finish();
      else {
        root.addEventListener("animationend", (e) => { if (e.target === root) finish(); });
        setTimeout(finish, 600); // запасной вариант
      }
    });

    document.documentElement.classList.add("fbw-lock");
    document.body.appendChild(root);
    return promise;
  }

  window.FBWelcome = { show, LANGS };
})();
