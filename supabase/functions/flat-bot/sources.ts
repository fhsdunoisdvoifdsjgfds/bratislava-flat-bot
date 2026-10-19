// Парсеры сайтов с арендой по всей Словакии.
// list-парсеры дают базовую карточку, detail-парсеры дочитывают фото, координаты,
// продавца и полное описание; finalize() вытаскивает из текста всё остальное.

import * as G from "./geo.ts";
export { DISTRICTS, REGIONS, TOWNS } from "./geo.ts";

export type Kind = "flat" | "studio" | "room" | "hostel";

export type Listing = {
  source: string;
  id: string;
  url: string;
  title: string;
  price: number | null; // аренда, €/мес
  charges: number | null; // энергии/поплатки, €/мес
  utilities: "included" | "extra" | "unknown";
  deposit: number | null; // залог, €
  commission: boolean | null; // есть ли комиссия агентства
  kind: Kind;
  rooms: number | null;
  area: number | null; // м²
  floor: string | null;
  region: string | null; // край: BA, TT, TN, NR, ZA, BB, PO, KE
  city: string | null; // ключ города (slug)
  cityName: string | null; // название города для показа
  district: string | null; // район Братиславы (ключ из DISTRICTS)
  address: string;
  lat: number | null;
  lng: number | null;
  agency: boolean | null; // null — не удалось определить
  seller: string | null;
  phones: string[];
  emails: string[];
  images: string[];
  text: string;
  published: string | null; // YYYY-MM-DD
  publishedAt?: string | null; // точное время, если сайт его отдаёт
  availableFrom: string | null; // YYYY-MM-DD
  tags: string[];
  detailed: boolean;
  shortTerm?: boolean; // посуточно, отпуск, спа — такие не показываем
};

export const key = (l: Pick<Listing, "source" | "id">) => `${l.source}:${l.id}`;
export const total = (l: Listing) =>
  l.price == null ? null : l.price + (l.utilities === "extra" ? l.charges ?? 0 : 0);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

export async function get(url: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "sk,en;q=0.8" },
      signal: AbortSignal.timeout(25_000),
    });
    if (r.ok) return await r.text();
    // сайты иногда отвечают 502/503 — один повтор через пару секунд
    if (r.status >= 500 && attempt === 0) {
      await r.body?.cancel();
      await new Promise((res) => setTimeout(res, 2000));
      continue;
    }
    throw new Error(`HTTP ${r.status}`);
  }
}

// постраничный обход: ошибка первой страницы — ошибка источника,
// ошибка следующих (404 за концом выдачи, 502) — просто конец обхода
async function pages<T>(list: T[], fetchPage: (p: T) => Promise<Listing[]>) {
  const out: Listing[] = [];
  for (const [i, p] of list.entries()) {
    try {
      const got = await fetchPage(p);
      out.push(...got);
      if (i > 0 && !got.length) break;
    } catch (e) {
      if (i === 0) throw e;
      console.error("page", p, String(e));
      break;
    }
  }
  return out;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
export const strip = (s: string) =>
  decode(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const int = (s: unknown) => {
  const d = String(s ?? "").replace(/[^\d]/g, "");
  return d ? parseInt(d, 10) : null;
};
const num = (s: unknown) => {
  const n = parseFloat(String(s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
export const bratislavaDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(d);
const fold = G.fold;

function blank(source: string, id: string, url: string, title: string): Listing {
  return {
    source, id, url, title,
    price: null, charges: null, utilities: "unknown", deposit: null, commission: null,
    kind: "flat", rooms: null, area: null, floor: null, region: null, city: null, cityName: null, district: null, address: "",
    lat: null, lng: null, agency: null, seller: null, phones: [], emails: [], images: [],
    text: "", published: null, availableFrom: null, tags: [], detailed: false,
  };
}

// ---------------------------------------------------------------- местоположение
// hint — город/край, которые сайт отдал явно; остальное ищем в адресе, заголовке и PSČ
export function locate(l: Listing, hint: { city?: string | null; region?: string | null } = {}) {
  const psc = G.pscOf(l.address);
  let town = G.townFromName(hint.city) ?? G.detectTown([l.address, l.title], false);
  // район Братиславы в адресе/заголовке — значит, это Братислава (а не «Trnavská cesta» → Trnava)
  if (!town || town.key === "bratislava") {
    const d = G.detectDistrict([l.address, l.title], psc?.startsWith("8") ? psc : null);
    if (d) {
      l.district = l.district ?? d;
      town = G.townByKey.get("bratislava")!;
    }
  }
  town ??= G.detectTown([l.title], true);
  // сайт сказал «Košický kraj», а в заголовке «Trnavská ulica» — верим сайту
  if (town && hint.region && !hint.city && town.region !== hint.region) town = null;
  if (town) {
    l.city = town.key;
    l.cityName = town.name;
    l.region = town.region;
  } else if (hint.city) {
    // деревня, которой нет в справочнике: оставляем как есть
    const name = hint.city.replace(/\s*\d{3}\s?\d{2}\s*$/, "").trim();
    l.city = G.slug(name) || null;
    l.cityName = name || null;
  }
  l.region ??= (hint.region as string) ?? G.regionByName(l.address) ?? G.regionByPsc(psc);
  if (l.city && G.CITIES_WITH_DISTRICTS.has(l.city) && !l.district) {
    l.district = G.detectDistrict([l.address, l.title, l.text.slice(0, 600)], psc?.startsWith("8") ? psc : null, l.city);
  }
  if (l.district && G.districtCity(l.district) !== l.city) l.district = null;
}

// ---------------------------------------------------------------- телефоны и почта
const SITE_PHONES = new Set(["+421220924184", "+421220924186", "+421220924185"]);

export function findPhones(text: string): string[] {
  const re =
    /(?:\+|00)\s?421[\s\-\/.]?\(?0?\)?\s?(\d{2,3})[\s\-\/.]?(\d{3})[\s\-\/.]?(\d{3,4})|(?<!\d)0(9\d{2})[\s\-\/.]?(\d{3})[\s\-\/.]?(\d{3})(?!\d)|(?:\+|00)\s?420[\s\-\/.]?(\d{3})[\s\-\/.]?(\d{3})[\s\-\/.]?(\d{3})/g;
  const out = new Set<string>();
  for (const m of text.matchAll(re)) {
    const n = m[1] ? `+421${m[1]}${m[2]}${m[3]}` : m[4] ? `+421${m[4]}${m[5]}${m[6]}` : `+420${m[7]}${m[8]}${m[9]}`;
    if (n.length === 13 && !SITE_PHONES.has(n)) out.add(n);
  }
  return [...out].slice(0, 3);
}
export const findEmails = (text: string) =>
  [...new Set(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi) ?? [])]
    .filter((e) => !/nehnutelnosti|topreality|bazos|bezrealitky/i.test(e))
    .slice(0, 2);
export const prettyPhone = (n: string) => n.replace(/^\+(\d{3})(\d{3})(\d{3})(\d{3})$/, "+$1 $2 $3 $4");

// ---------------------------------------------------------------- разбор текста
const RE_INCLUDED =
  /vratane\s+(energi|poplatk|sluz|vsetk)|s\s+energiami|energie\s+(su\s+)?v\s+cene|v\s+cene\s+(su\s+)?(aj\s+)?(energi|poplatk|sluz)|vsetko\s+v\s+cene|all\s+(bills|utilities)\s+included|including\s+(bills|utilities)|cena\s+je\s+konecn|\bkomplet\b|\bvcetne\s+energi|bez\s+dalsich\s+poplatkov/;
const RE_EXTRA =
  /\+\s*energi|plus\s+energi|\+\s*poplatk|plus\s+poplatk|bez\s+energi|\+\s*sluzby|\+\s*utilities|\+\s*bills|energie\s+(navyse|zvlast|samostatne)|\+\s*zalohy\s+na\s+energi|\+\s*naklady/;
// ---------------------------------------------------------------- агентство или частник
// Баллы: > 0 — агентство, < 0 — частник. Сначала ищем явные слова частника
// («RK nevolať» содержит «RK», но означает как раз владельца).
const PRIVATE_STRONG =
  /\b(rk|realitk\w*|realitn\w* kancelari\w*)\s*(prosim\s*)?(ne)?volat\b|nevolajte|nie\s+som\s+(rk|realitk|makler)|bez\s+(rk|realitk\w*|sprostredkovatel\w*|maklera)\b|sukromn\w*\s+(osob|inzer|majitel)|priamo\s+od\s+majitel|som\s+(majitel|vlastnik)|ako\s+majitel|prenajimam\s+(svoj|moj)|ponukam\s+(svoj|moj)|majitel\s+(bytu\s+)?ponuka|no\s+agenc|without\s+agenc|owner\s+direct/;
const AGENCY_TEXT: [RegExp, number][] = [
  [/vyhradn\w*\s+(suhlas|poveren|zastup|zmluv)|poveren\w*\s+majitel|exkluzivn\w*/, 4],
  [/realitn\w*\s+kancelari|nasa\s+(spolocnost|kancelaria|realitk)|zmluv\w*\s+o\s+sprostredkovan|sprostredkovatelsk/, 4],
  [/\bmakler|maklerk|kontakt\w*\s+na\s+makler|realitn\w*\s+(agent|maklér|specialist)/, 3],
  [/provizi|odmena\s+(rk|kancelari)|\+\s*rk\b/, 2],
  [/\bid\s+(inzeratu|ponuky|nehnutelnosti)|cislo\s+ponuky|kod\s+ponuky|referencne\s+cislo/, 2],
  [/\bponukame\b|\bvieme\s+vam\b|\bkontaktujte\s+nas\b|\bnasu\s+ponuku\b/, 1],
  [/\brk\b|\breality\b|\breal\s+estate/, 1],
];
// имя продавца, похожее на фирму: «NETreal.TK», «TRIANGEL real», «JKV GROUP s.r.o.»
const AGENCY_NAME =
  /real|estate|invest|propert|broker|makler|consult|develop|group|partner|holding|byty|bytov|domov|home|house|residen|s\.?\s?r\.?\s?o|\ba\.\s?s\.|spol\.|\brk\b|\.(sk|tk|cz|com|eu|net)\b|kancelari/;
// «Michal», «Peter Opet», «Kokoškova D.» — похоже на обычного человека
const PERSON_NAME = /^[\p{Lu}][\p{Ll}]+(\s+[\p{Lu}][\p{Ll}]*\.?){0,2}$/u;

function classifyAgency(l: Listing): boolean | null {
  const f = fold(`${l.title}\n${l.text}`);
  const seller = fold(l.seller ?? "");
  if (PRIVATE_STRONG.test(f)) return false;
  let score = 0;
  if (seller && AGENCY_NAME.test(seller)) score += 4;
  for (const [re, w] of AGENCY_TEXT) if (re.test(f)) score += w;
  if (/\bponukam\b/.test(f)) score -= 1; // «ponúkam» — от первого лица, чаще пишут частники
  if (score >= 2) return true;
  // на Bazoši частники пишут под своим именем; без признаков агентства считаем частником
  if (l.source === "bazos" && l.detailed && l.seller && PERSON_NAME.test(l.seller.trim()) && score <= 0) return false;
  return score <= -1 ? false : null;
}

// Посуточная/краткосрочная аренда и отдых: «50 €/noc», «na dovolenku», «wellness», «chata v Tatrách»
const SHORT_STRONG =
  /(€|eur)\s*\/?\s*(za\s+)?(noc|nocu|osobu\s*\/\s*noc|den|deň)\b|\/\s*noc\b|\bza\s+noc\b|\bna\s+noc\b|\bnocl\w*|prenocovan|\bper\s+night\b|\bnightly\b|airbnb|booking\.com|na\s+hodiny|hodinov\w*\s+prenaj|\bdovolenk|\brekreac|\bwellness|\bkupele\b|\bkupeloch\b|\bkupeln\w*\s+(pobyt|mest)|\btermal|\bspa\b|chalup|\bchat[ayu]\b|\bzrub|\bvikendov|ubytovanie\s+v\s+sukromi|turistick\w*\s+ubytovan|\bpenzion|apartman\w*\s+(pri\s+mori|v\s+tatrach|pri\s+jazere)|\bsvadb|\boslav[aeuy]\b|teambuilding/;
// не жильё: офисы, склады, гаражи, торговые помещения (только по заголовку)
const NON_RESIDENTIAL =
  /nebytov|obchodn\w*\s+priestor|kancelar|\bsklad|\bgaraz|parkovac\w*\s+miest|masazn|ordinaci|prevadzk|komercn/;
const SHORT_SOFT = /kratkodob|short[-\s]?term|na\s+par\s+dni|na\s+(1|jeden|2|dva)\s+(den|dni|noc)/;

function isShortTerm(l: Listing) {
  const head = fold(l.title);
  const f = fold(`${l.title}\n${l.text}`);
  if (SHORT_STRONG.test(head)) return true;
  // «byt s garážou» — это квартира; нежильё — только если о жилье в заголовке ни слова
  const housing = /\bbyt|\bbyty|\bizb|garson|garzon|\bgar\.|apartman|\bstudio|\bdom\b|\bbyvan|\blozk|ubytovan|\bflat|\broom/;
  if (NON_RESIDENTIAL.test(head) && !housing.test(head)) return true;
  // в тексте: сильный признак, если не сказано, что это долгосрочно
  if (SHORT_STRONG.test(f) && !/dlhodob|long[-\s]?term|na\s+dlhsi\s+cas|minimalne\s+(na\s+)?\d+\s+mesia/.test(f)) return true;
  if (SHORT_SOFT.test(f) && !/dlhodob|long[-\s]?term/.test(f)) return true;
  return false;
}

function parseText(l: Listing) {
  const f = fold(`${l.title}\n${l.text}`);
  if (!l.shortTerm) l.shortTerm = isShortTerm(l);

  if (l.utilities === "unknown") {
    if (RE_EXTRA.test(f)) l.utilities = "extra";
    else if (RE_INCLUDED.test(f)) l.utilities = "included";
  }
  // сумма энергий, если она написана в тексте
  if (l.charges == null && l.utilities !== "included") {
    const m = f.match(/(?:energi\w*|poplatk\w*|sluzby|zalohy na energie)[^\d\n]{0,25}(\d{2,3})\s*(?:€|eur|,-)/);
    if (m && +m[1] >= 20 && +m[1] <= 400) {
      l.charges = +m[1];
      if (l.utilities === "unknown") l.utilities = "extra";
    }
  }
  if (l.deposit == null) {
    const m = f.match(/(?:zaloh\w*|depozit\w*|kauci\w*|zabezpek\w*|deposit)[^\d\n]{0,30}(\d[\d ]{1,5})\s*(?:€|eur|,-)/);
    if (m) l.deposit = int(m[1]);
    else {
      const k = f.match(/(?:zaloh\w*|depozit\w*|kauci\w*)[^\n]{0,30}?(\d|jeden|jedna|dva|dve|tri)\s*(?:mesacn\w*\s*)?(?:najm|najom|mesiac)/);
      const mult: Record<string, number> = { jeden: 1, jedna: 1, dva: 2, dve: 2, tri: 3 };
      if (k && l.price) l.deposit = (mult[k[1]] ?? +k[1]) * l.price;
    }
  }
  if (l.commission == null) {
    if (/bez\s+provizi|ziadna\s+provizia|neplatite\s+proviziu|provizi\w*\s*(?:je\s*)?(?:0|nula)\b/.test(f)) l.commission = false;
    else if (/provizi|odmena\s+rk/.test(f)) l.commission = true;
  }
  if (l.agency == null) l.agency = classifyAgency(l);
  if (l.commission == null && l.agency === false) l.commission = false;

  if (l.area == null) {
    const m = f.match(/(\d{2,3}(?:[.,]\d)?)\s*(?:m2|m²|m\s?2\b|metrov)/);
    const a = m ? num(m[1]) : null;
    if (a && a >= 8 && a <= 250) l.area = a;
  }
  if (l.rooms == null) {
    const m = f.match(/\b([1-5])([.,]5)?\s*[-–]?\s*(?:izb|i\.\s|room)/);
    if (m) l.rooms = +m[1] + (m[2] ? 0.5 : 0);
  }
  if (/\b(ihned|od ihned|okamzite|immediately)\b/.test(f)) l.tags.push("свободно сразу");
  if (/zvierat\w* (su )?(vitan|povolen|ok)|pet friendly|domace zvierata ok/.test(f)) l.tags.push("можно с животными");
  if (/parkovan|garaz/.test(f)) l.tags.push("парковка");
  if (/balkon|loggi|lodzi|terasa/.test(f)) l.tags.push("балкон / терраса");
  if (/zariaden|vybaven/.test(f) && !/nezariaden/.test(f)) l.tags.push("с мебелью");
  if (/novostavb/.test(f)) l.tags.push("новостройка");
  l.tags = [...new Set(l.tags)].slice(0, 6);
}

function classify(l: Listing, hint: Kind | null) {
  const t = fold(l.title);
  const f = fold(`${l.title}\n${l.text.slice(0, 400)}`);
  if (/ubytovn|ubytovanie pre (pracovn|robotn)|robotnick|\bhostel/.test(f)) l.kind = "hostel";
  // «Izba na prenájom v novom byte» — комната, хотя в заголовке есть «byt»
  else if (/^\W*(prenajom\s+|prenajmem\s+|ponukam\s+)?(samostatn\w*\s+|zariaden\w*\s+|pekn\w*\s+|velk\w*\s+|mal\w*\s+)?izb[auy]\b|spolubyvan|\blozk[oa]\b/.test(t) ||
    (/\bizb[auy]\s+(na|v|pre|s)\b/.test(t) && !/\d(?:[.,]5)?\s*[-–]?\s*izb\w*\s+(byt|na\s+prenajom)/.test(t))) l.kind = "room";
  else if (/garson|garzon|\bstudio\b|1\s*[-–]?\s*izb/.test(t)) l.kind = "studio";
  else if (/\d(?:[.,]5)?\s*[-–]?\s*izb|\bbyt\b|\bbytu\b|apartman|mezonet/.test(t)) l.kind = "flat";
  else if (/\bizb[auy]\b|\bizbu\b|\bizbou\b|spolubyvan|\broom\b|\blozko\b/.test(t)) l.kind = "room";
  else if (hint) l.kind = hint;
  if (l.kind === "flat" && l.rooms === 1) l.kind = "studio";
}

export function finalize(l: Listing, hint: Kind | null = null) {
  parseText(l);
  classify(l, hint);
  if (!l.city && !l.region) locate(l); // местоположение ещё не определяли
  const all = `${l.title}\n${l.text}`;
  l.phones = [...new Set([...l.phones, ...findPhones(all)])].slice(0, 3);
  l.emails = [...new Set([...l.emails, ...findEmails(all)])];
  l.images = [...new Set(l.images.filter(Boolean))].slice(0, 20);
  return l;
}

// ---------------------------------------------------------------- bazos.sk
const SEEKER = /(^|[^\p{L}])(h[lľ]ad[aá]me?|dopyt|sh[aá]n[ií]m|kúpim)([^\p{L}]|$)/iu;

export function bazos(category: "byt" | "podnajom", offsets = [0, 20]) {
  return pages(offsets, async (offset) => {
    const out: Listing[] = [];
    const html = await get(
      `https://reality.bazos.sk/prenajmu/${category}/${offset ? offset + "/" : ""}`,
    );
    for (const card of html.split('<div class="inzeraty inzeratyflex">').slice(1)) {
      const a = card.match(/<h2 class=nadpis><a href="(\/inzerat\/(\d+)\/[^"]*)">([\s\S]*?)<\/a>/);
      if (!a) continue;
      const l = blank("bazos", a[2], "https://reality.bazos.sk" + a[1], strip(a[3]));
      l.text = strip(card.match(/<div class=popis>([\s\S]*?)<\/div>/)?.[1] ?? "");
      if (SEEKER.test(l.title) || SEEKER.test(l.text.slice(0, 60))) continue;
      const d = card.match(/\[(\d{1,2})\.(\d{1,2})\.\s*(\d{4})\]/);
      if (d) l.published = `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
      l.price = int(strip(card.match(/class="inzeratycena">([\s\S]*?)<\/div>/)?.[1] ?? ""));
      l.address = strip(card.match(/class="inzeratylok">([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/\n/g, " ");
      const img = card.match(/https:\/\/www\.bazos\.sk\/img\/1t\/(\d+)\/(\d+)\.jpg/);
      if (img) l.images.push(`https://www.bazos.sk/img/1/${img[1]}/${img[2]}.jpg`);
      locate(l, { city: l.address.replace(/\s*\d{3}\s?\d{2}\s*$/, "") });
      out.push(finalize(l, category === "podnajom" ? "room" : null));
    }
    return out;
  });
}

export async function bazosDetail(l: Listing) {
  const html = await get(l.url);
  const desc = html.match(/class=popisdetail>([\s\S]*?)<\/div>/);
  if (desc) l.text = strip(desc[1]);
  const seller = html.match(/Meno:[\s\S]{0,200}?class="paction">([^<]+)</);
  if (seller) l.seller = decode(seller[1]).trim();
  const geo = html.match(/google\.com\/maps\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (geo) [l.lat, l.lng] = [+geo[1], +geo[2]];
  const imgs = [...html.matchAll(new RegExp(`img/(\\d+)/(\\d+)/${l.id}\\.jpg`, "g"))]
    .map((m) => [+m[1], m[2]] as const)
    .sort((a, b) => a[0] - b[0]);
  if (imgs.length) l.images = [...new Set(imgs.map(([n, d]) => `https://www.bazos.sk/img/${n}/${d}/${l.id}.jpg`))];
}

// ------------------------------------------------------- nehnutelnosti.sk
// reality.sk и byty.sk работают на той же базе — отдельно не парсим.
function ldBlocks(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const d = JSON.parse(m[1]);
      out.push(...(d["@graph"] ?? [d]));
    } catch { /* битый блок пропускаем */ }
  }
  return out;
}
const isType = (n: any, t: string) => (Array.isArray(n["@type"]) ? n["@type"].includes(t) : n["@type"] === t);

export function nehnutelnosti(region: G.Region, pageList = [1]) {
  const r = G.REGIONS.find((x) => x.key === region)!;
  return pages(pageList, async (page) => {
    const out: Listing[] = [];
    const html = await get(
      `https://www.nehnutelnosti.sk/vysledky/byty/${r.slug}/prenajom?order=NEWEST` + (page > 1 ? `&page=${page}` : ""),
    );
    const nodes = ldBlocks(html);
    const agents = new Map<string, string>();
    for (const n of nodes) if (isType(n, "RealEstateAgent")) agents.set(n["@id"], n.name);
    const items = nodes.find((n) => isType(n, "SearchResultsPage"))?.mainEntity?.itemListElement ?? [];
    if (!items.length && page === 1) throw new Error("не нашёл список объявлений (сменилась вёрстка?)");
    if (page > 1) await new Promise((res) => setTimeout(res, 500)); // не дёргаем сайт слишком часто
    for (const { item: it } of items) {
      const l = blank("nehnutelnosti", String(it["@id"]).split("/").pop()!, it.url, String(it.name ?? "").trim());
      l.price = int(it.priceSpecification?.price);
      l.text = it.description ?? "";
      l.area = num(it.floorSize?.value);
      l.rooms = typeof it.numberOfRooms === "number" ? it.numberOfRooms : null;
      l.images = (Array.isArray(it.image) ? it.image : it.image ? [it.image] : [])
        .map((i: any) => (typeof i === "string" ? i : i?.url ?? i?.contentUrl))
        .filter((u: unknown) => typeof u === "string");
      l.published = it.validFrom ? bratislavaDate(new Date(it.validFrom)) : null;
      l.publishedAt = it.validFrom ?? null;
      const seller = agents.get(it.offeredBy?.["@id"]);
      if (seller) {
        l.seller = seller;
        l.agency = !/sukromn|majitel/.test(fold(seller));
      }
      const cat = fold(it.category ?? "");
      locate(l, { region });
      out.push(finalize(l, /garson|1 izb/.test(cat) ? "studio" : "flat"));
    }
    return out;
  });
}

export async function nehnutelnostiDetail(l: Listing) {
  const html = await get(l.url);
  const prod = ldBlocks(html).find((n) => isType(n, "Product") && n.image);
  if (prod) {
    const imgs = (Array.isArray(prod.image) ? prod.image : [])
      .map((i: any) => (typeof i === "string" ? i : i?.url ?? i?.contentUrl))
      .filter((u: unknown) => typeof u === "string");
    if (imgs.length > l.images.length) l.images = imgs.slice(0, 20);
    if (prod.floorLevel) l.floor = String(prod.floorLevel);
    if (prod.geo?.latitude) [l.lat, l.lng] = [num(prod.geo.latitude), num(prod.geo.longitude)];
    const a = prod.address;
    if (a?.streetAddress || a?.addressLocality) l.address = [a.streetAddress, a.addressLocality].filter(Boolean).join(", ");
  }
  if (l.lat == null) {
    // точка самого объявления (дальше на странице идут точки POI — магазины, остановки)
    const g = html.match(/\\"point\\":\{\\"latitude\\":([0-9.]+),\\"longitude\\":([0-9.]+)/);
    if (g) [l.lat, l.lng] = [+g[1], +g[2]];
  }
  const street = html.match(/\\"street\\":\\"([^\\]{2,60})\\",\\"point\\"/);
  if (street && !l.address) l.address = decode(street[1]);
  const city = html.match(/\\"city\\":\\"([a-z-]+)\\",\\"category\\"/);
  if (city) {
    // slug вида bratislava-ruzinov, kosice-juh, banska-bystrica
    const words = city[1].split("-");
    const town = G.townByKey.get(city[1]) ?? G.townByKey.get(words[0]) ?? G.townByKey.get(words.slice(0, 2).join("-"));
    if (town) Object.assign(l, { city: town.key, cityName: town.name, region: town.region });
    if (town && G.CITIES_WITH_DISTRICTS.has(town.key)) {
      l.district = G.detectDistrict([words.slice(town.key.split("-").length).join(" ")], null, town.key) ?? l.district;
    }
  }
  const adv = html.match(/\\"advertiser\\":\{\\"id\\":\\"[^\\]*\\",\\"name\\":\\"([^\\]+)\\"/);
  if (adv && l.seller && !l.seller.includes(" · ")) l.seller = `${decode(adv[1])} · ${l.seller}`;
}

// ---------------------------------------------------------- topreality.sk
export function topreality(pageList = [1]) {
  const types = [101, 108, 102, 103, 104, 109, 110, 107].map((t) => `&type%5B%5D=${t}`).join("");
  return pages(pageList, async (page) => {
    const out: Listing[] = [];
    // страницы у topreality — в пути: vyhladavanie-nehnutelnosti-2.html
    const html = await get(
      `https://www.topreality.sk/vyhladavanie-nehnutelnosti${page > 1 ? `-${page}` : ""}.html?form=3${types}` +
        `&searchType=string&n_search=search&sort=date_desc`,
    );
    for (const card of html.split('data-ga4-container-item_id_generic="').slice(1)) {
      const id = card.match(/^(\d+)/)?.[1];
      const href = card.match(/<h2 class="card-title[^"]*"><a href="([^"]+)"/)?.[1];
      if (!id || !href) continue;
      const attr = (n: string) => decode(card.match(new RegExp(`data-ga4-container-${n}="([^"]*)"`))?.[1] ?? "");
      const l = blank("topreality", id, href, attr("item_name"));
      l.price = int(attr("price"));
      const loc = [...card.matchAll(/class="location-(?:address|city|district)">([^<]*)</g)].map((m) => decode(m[1]).trim());
      l.address = loc.join(" ").replace(/\s*,\s*$/, "") || attr("location_id");
      const cat3 = attr("item_category3"); // «Košice-Juh», «Bratislava-Ružinov», «Zvolen»
      const head = cat3.split("-")[0];
      locate(l, { city: G.townFromName(head) ? head : cat3, region: G.regionByName(attr("location_id")) });
      if (l.city && G.CITIES_WITH_DISTRICTS.has(l.city)) l.district = G.detectDistrict([cat3.slice(head.length)], null, l.city) ?? l.district;
      const aff = attr("affiliation").trim();
      l.seller = aff || null;
      l.agency = aff ? !/sukromn/.test(fold(aff)) : null;
      l.area = num(card.match(/plocha <br \/><strong>([\d.,]+)<\/strong>/)?.[1]);
      const img = card.match(/data-src="(\/topfoto\/t\/\d+\/\d+-\d+-)\d+\.jpg/);
      if (img) l.images.push(`https://www.topreality.sk${img[1]}18.jpg`);
      const cat = fold(attr("item_category2"));
      out.push(finalize(l, /garson|1 izb/.test(cat) ? "studio" : "flat"));
    }
    return out;
  });
}

export async function toprealityDetail(l: Listing) {
  const html = await get(l.url);
  const m = html.match(/"description":\s*"((?:[^"\\]|\\.)*)"/);
  if (m) {
    const raw = m[1].replace(/[\n\r\t]/g, " ");
    try {
      l.text = JSON.parse(`"${raw}"`);
    } catch {
      l.text = raw;
    }
  }
  const geo = html.match(/data-gpsx="(4[78]\.\d+)"\s*data-gpsy="(1[67]\.\d+)"/);
  if (geo) [l.lat, l.lng] = [+geo[1], +geo[2]];
  const nums = new Map<number, string>();
  for (const g of html.matchAll(new RegExp(`/topfoto/t/(\\d+)/${l.id}-(\\d+)-\\d+\\.jpg`, "g"))) nums.set(+g[2], g[1]);
  if (nums.size) {
    l.images = [...nums.entries()].sort((a, b) => a[0] - b[0])
      .map(([n, dir]) => `https://www.topreality.sk/topfoto/t/${dir}/${l.id}-${n}-18.jpg`);
  }
}

// --------------------------------------------------------- bezrealitky.sk
function nextData(html: string) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("нет __NEXT_DATA__");
  return JSON.parse(m[1]).props.pageProps;
}
const pick = (v: any, p: string) => Object.entries<any>(v).find(([k]) => k.startsWith(p))?.[1];

export function bezrealitky(pageList = [1]) {
  return pages(pageList, async (page) => {
    const out: Listing[] = [];
    const pp = nextData(
      await get(
        "https://www.bezrealitky.sk/vypis/ponuka-prenajom/byt?order=TIMEORDER_DESC" +
          (page > 1 ? `&page=${page}` : ""),
      ),
    );
    const cache = pp.apolloCache ?? {};
    for (const [k, v] of Object.entries<any>(cache)) {
      if (!k.startsWith("Advert:")) continue;
      const l = blank("bezrealitky", String(v.id), `https://www.bezrealitky.sk/nehnutelnosti-byty-domy/${v.uri}`,
        pick(v, "imageAltText") || v.uri);
      l.price = int(v.price);
      l.charges = int(v.charges) || null;
      l.utilities = l.charges ? "extra" : "unknown";
      l.area = num(v.surface);
      l.address = pick(v, "address") ?? "";
      l.lat = v.gps?.lat ?? null;
      l.lng = v.gps?.lng ?? null;
      l.agency = false;
      l.commission = false;
      l.shortTerm = !!v.shortTerm;
      l.seller = "Владелец (bezrealitky)";
      const disp = String(v.disposition ?? "");
      const r = disp.match(/DISP_(\d)/);
      if (r) l.rooms = +r[1];
      const imgUrl = (ref: any) => {
        const img = cache[ref?.__ref] ?? ref ?? {};
        return img[`url({"filter":"RECORD_MAIN"})`] ?? pick(img, "url");
      };
      for (const ref of pick(v, "publicImages") ?? []) l.images.push(imgUrl(ref));
      if (!l.images.length && v.mainImage) l.images.push(imgUrl(v.mainImage));
      l.tags.push(...((pick(v, "tags") ?? []) as string[]).slice(0, 3));
      // «Ulica, Bratislava - mestská časť Staré Mesto - Oblasť…, Bratislavský kraj»
      const parts = l.address.split(", ");
      locate(l, { city: parts.length > 2 ? parts[parts.length - 2].split(" - ")[0] : null, region: G.regionByName(l.address) });
      out.push(finalize(l, v.roommate ? "room" : /GARS|DISP_1/.test(disp) ? "studio" : "flat"));
    }
    return out;
  });
}

export async function bezrealitkyDetail(l: Listing) {
  const a = nextData(await get(l.url)).origAdvert;
  if (!a) return;
  l.text = a.descriptionByLocale || a.description || l.text;
  l.deposit = a.deposit || l.deposit;
  if (a.availableFrom) l.availableFrom = bratislavaDate(new Date(a.availableFrom * 1000));
  if (a.etage != null) l.floor = a.totalFloors ? `${a.etage} из ${a.totalFloors}` : String(a.etage);
  const imgs = (a.publicImages ?? []).map((i: any) => i?.url ?? pick(i ?? {}, "url")).filter((u: unknown) => typeof u === "string");
  if (imgs.length) l.images = imgs;
  if (a.petFriendly) l.tags.push("можно с животными");
}

// ---------------------------------------------------------------- дочитать карточку
export async function detail(l: Listing) {
  if (l.source === "bazos") await bazosDetail(l);
  else if (l.source === "nehnutelnosti") await nehnutelnostiDetail(l);
  else if (l.source === "topreality") await toprealityDetail(l);
  else if (l.source === "bezrealitky") await bezrealitkyDetail(l);
  l.detailed = true;
  // после полного описания пересчитываем то, что зависит от текста
  l.phones = [];
  l.emails = [];
  if (l.city && G.CITIES_WITH_DISTRICTS.has(l.city) && !l.district) locate(l, { city: l.cityName ?? l.city });
  finalize(l, l.kind);
}
