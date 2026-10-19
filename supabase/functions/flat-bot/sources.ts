// Парсеры сайтов с арендой в Братиславе и окрестностях.
// list-парсеры дают базовую карточку, detail-парсеры дочитывают фото, координаты,
// продавца и полное описание; finalize() вытаскивает из текста всё остальное.

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
  district: string | null; // ключ из DISTRICTS
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
  availableFrom: string | null; // YYYY-MM-DD
  tags: string[];
  detailed: boolean;
};

export const key = (l: Pick<Listing, "source" | "id">) => `${l.source}:${l.id}`;
export const total = (l: Listing) =>
  l.price == null ? null : l.price + (l.utilities === "extra" ? l.charges ?? 0 : 0);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

export async function get(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "sk,en;q=0.8" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
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
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function blank(source: string, id: string, url: string, title: string): Listing {
  return {
    source, id, url, title,
    price: null, charges: null, utilities: "unknown", deposit: null, commission: null,
    kind: "flat", rooms: null, area: null, floor: null, district: null, address: "",
    lat: null, lng: null, agency: null, seller: null, phones: [], emails: [], images: [],
    text: "", published: null, availableFrom: null, tags: [], detailed: false,
  };
}

// ---------------------------------------------------------------- районы
// [ключ, название, группа, шаблон по тексту без диакритики]
export const DISTRICTS: [string, string, "ba" | "okolie", RegExp][] = [
  ["devinska-nova-ves", "Devínska Nová Ves", "ba", /devinsk\w* nov\w* ves|\bdnv\b/],
  ["podunajske-biskupice", "Podunajské Biskupice", "ba", /podunajsk\w* biskupic|\bketelec|lieskovec/],
  ["zahorska-bystrica", "Záhorská Bystrica", "ba", /zahorsk\w* bystric/],
  ["stare-mesto", "Staré Mesto", "ba", /stare mesto|starom\w*sk|stareho mesta|centrum mesta|v centre bratislavy|\bba i\b|bratislava i\b|palisady|hradn\w* vrch|\beurovea/],
  ["ruzinov", "Ružinov", "ba", /ruzinov|trnavk|ostredk|\bposen|\bnivy\b|prievoz|travnik|strkovec|\bba ii\b|bratislava ii\b/],
  ["vrakuna", "Vrakuňa", "ba", /vrakun|dolne hony/],
  ["nove-mesto", "Nové Mesto", "ba", /nove mesto|novom\w*sk|kramare|koliba|\bmierova kolonia|jurajov dvor|\bba iii\b|bratislava iii\b/],
  ["raca", "Rača", "ba", /\braca\b|\bracian|krasnan|vychodne/],
  ["vajnory", "Vajnory", "ba", /vajnor/],
  ["karlova-ves", "Karlova Ves", "ba", /karlov\w* ves|dlhe diely|kutiky|\bba iv\b|bratislava iv\b/],
  ["dubravka", "Dúbravka", "ba", /dubravk|dubrav/],
  ["lamac", "Lamač", "ba", /lamac/],
  ["devin", "Devín", "ba", /\bdevin\b|\bdevine\b/],
  ["petrzalka", "Petržalka", "ba", /petrzalk|\bhaje\b|\bdvory\b|ovsist|\bluky\b|kopcan|\bba v\b|bratislava v\b/],
  ["jarovce", "Jarovce", "ba", /jarovc/],
  ["rusovce", "Rusovce", "ba", /rusovc/],
  ["cunovo", "Čunovo", "ba", /cunov/],
  ["senec", "Senec", "okolie", /\bsenec|\bsenc/],
  ["pezinok", "Pezinok", "okolie", /pezinok|pezink/],
  ["stupava", "Stupava", "okolie", /stupav/],
  ["malacky", "Malacky", "okolie", /malack/],
  ["samorin", "Šamorín", "okolie", /samorin/],
  ["ivanka", "Ivanka pri Dunaji", "okolie", /ivank\w* pri dunaji/],
  ["bernolakovo", "Bernolákovo", "okolie", /bernolakov/],
  ["chorvatsky-grob", "Chorvátsky Grob", "okolie", /chorvatsk\w* grob|\bcierna voda/],
  ["svaty-jur", "Svätý Jur", "okolie", /svaty jur|svateho jura/],
  ["modra", "Modra", "okolie", /\bmodr[ae]\b/],
  ["dunajska-luzna", "Dunajská Lužná", "okolie", /dunajsk\w* luzn/],
  ["most", "Most pri Bratislave", "okolie", /most pri bratislav/],
  ["marianka", "Marianka / Borinka", "okolie", /mariank|borink/],
  ["zahorie", "Záhorie (Zohor, Lozorno…)", "okolie", /\bzohor|lozorn|\blaksk/],
];

// Почтовые индексы → район (у bazos часто есть только PSČ)
const PSC: [RegExp, string][] = [
  [/^811/, "stare-mesto"], [/^82106/, "podunajske-biskupice"], [/^82107/, "vrakuna"], [/^821/, "ruzinov"],
  [/^83106/, "raca"], [/^83107/, "vajnory"], [/^831/, "nove-mesto"],
  [/^84101/, "dubravka"], [/^84102/, "dubravka"], [/^84103/, "lamac"], [/^84104/, "karlova-ves"],
  [/^84105/, "karlova-ves"], [/^84106/, "zahorska-bystrica"], [/^84107/, "devinska-nova-ves"], [/^84110/, "devin"],
  [/^851/, "petrzalka"], [/^90301/, "senec"], [/^90201/, "pezinok"], [/^90031/, "stupava"], [/^90101/, "malacky"],
  [/^93101/, "samorin"], [/^90028/, "ivanka"], [/^90027/, "bernolakovo"], [/^90025/, "chorvatsky-grob"],
  [/^90021/, "svaty-jur"], [/^90042/, "dunajska-luzna"],
];

export function detectDistrict(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const f = fold(t);
    for (const [k, , , re] of DISTRICTS) if (re.test(f)) return k;
  }
  for (const t of texts) {
    const psc = t?.match(/\b(\d{3})\s?(\d{2})\b/);
    if (psc) {
      const code = psc[1] + psc[2];
      for (const [re, k] of PSC) if (re.test(code)) return k;
    }
  }
  return null;
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
const RE_PRIVATE =
  /bez\s+(rk|realitk|provizi|sprostredkovatel)|sukromn\w*\s+osob|priamo\s+od\s+majitel|nie\s+som\s+(rk|realitk)|som\s+majitel|ziadna\s+provizia|neplatite\s+proviziu|no\s+(agency|commission)/;
const RE_AGENCY =
  /provizi|realitn\w*\s+kancelari|\brk\b|\bmakler|sprostredkovatelsk|odmena\s+rk|\breality\b|\breal\s+estate|\bs\.\s?r\.\s?o\./;

function parseText(l: Listing) {
  const f = fold(`${l.title}\n${l.text}`);

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
  if (l.agency == null) {
    if (RE_PRIVATE.test(f)) l.agency = false;
    else if (RE_AGENCY.test(fold(l.seller ?? "")) || RE_AGENCY.test(f)) l.agency = true;
  }
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
  else if (/garson|garzon|\bstudio\b|1\s*[-–]?\s*izb/.test(t)) l.kind = "studio";
  else if (/\d(?:[.,]5)?\s*[-–]?\s*izb|\bbyt\b|\bbytu\b|apartman|mezonet/.test(t)) l.kind = "flat";
  else if (/\bizb[auy]\b|\bizbu\b|\bizbou\b|spolubyvan|\broom\b|\blozko\b/.test(t)) l.kind = "room";
  else if (hint) l.kind = hint;
  if (l.kind === "flat" && l.rooms === 1) l.kind = "studio";
}

export function finalize(l: Listing, hint: Kind | null = null) {
  parseText(l);
  classify(l, hint);
  if (!l.district) l.district = detectDistrict(l.address, l.title, l.text.slice(0, 600));
  const all = `${l.title}\n${l.text}`;
  l.phones = [...new Set([...l.phones, ...findPhones(all)])].slice(0, 3);
  l.emails = [...new Set([...l.emails, ...findEmails(all)])];
  l.images = [...new Set(l.images.filter(Boolean))].slice(0, 20);
  return l;
}

// ---------------------------------------------------------------- bazos.sk
const SEEKER = /(^|[^\p{L}])(h[lľ]ad[aá]me?|dopyt|sh[aá]n[ií]m|kúpim)([^\p{L}]|$)/iu;

export async function bazos(category: "byt" | "podnajom", maxPrice: number, radius: number, offsets = [0, 20]) {
  const out: Listing[] = [];
  for (const offset of offsets) {
    const html = await get(
      `https://reality.bazos.sk/prenajmu/${category}/${offset ? offset + "/" : ""}?hlokalita=81101&humkreis=${radius}&cenado=${maxPrice}`,
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
      out.push(finalize(l, category === "podnajom" ? "room" : null));
    }
  }
  return out;
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

export async function nehnutelnosti(maxPrice: number, pages = [1]) {
  const out: Listing[] = [];
  for (const page of pages) {
    const html = await get(
      `https://www.nehnutelnosti.sk/vysledky/byty/bratislavsky-kraj/prenajom?priceTo=${maxPrice}&order=NEWEST` +
        (page > 1 ? `&page=${page}` : ""),
    );
    const nodes = ldBlocks(html);
    const agents = new Map<string, string>();
    for (const n of nodes) if (isType(n, "RealEstateAgent")) agents.set(n["@id"], n.name);
    const items = nodes.find((n) => isType(n, "SearchResultsPage"))?.mainEntity?.itemListElement ?? [];
    if (!items.length && page === 1) throw new Error("не нашёл список объявлений (сменилась вёрстка?)");
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
      const seller = agents.get(it.offeredBy?.["@id"]);
      if (seller) {
        l.seller = seller;
        l.agency = !/sukromn|majitel/.test(fold(seller));
      }
      const cat = fold(it.category ?? "");
      out.push(finalize(l, /garson|1 izb/.test(cat) ? "studio" : "flat"));
    }
  }
  return out;
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
  if (city) l.district = detectDistrict(city[1].replace(/-/g, " ")) ?? l.district;
  const adv = html.match(/\\"advertiser\\":\{\\"id\\":\\"[^\\]*\\",\\"name\\":\\"([^\\]+)\\"/);
  if (adv && l.seller && !l.seller.includes(" · ")) l.seller = `${decode(adv[1])} · ${l.seller}`;
}

// ---------------------------------------------------------- topreality.sk
export async function topreality(maxPrice: number, pages = [1]) {
  const types = [101, 108, 102, 103, 104, 109, 110, 107].map((t) => `&type%5B%5D=${t}`).join("");
  const out: Listing[] = [];
  for (const page of pages) {
    const html = await get(
      `https://www.topreality.sk/vyhladavanie-nehnutelnosti.html?form=3${types}` +
        `&obec=c100-Bratislavsk%C3%BD+kraj&cena_do=${maxPrice}&searchType=string&n_search=search&sort=date_desc` +
        (page > 1 ? `&page=${page}` : ""),
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
      l.district = detectDistrict(attr("item_category3"), attr("location_id"));
      const aff = attr("affiliation").trim();
      l.seller = aff || null;
      l.agency = aff ? !/sukromn/.test(fold(aff)) : null;
      l.area = num(card.match(/plocha <br \/><strong>([\d.,]+)<\/strong>/)?.[1]);
      const img = card.match(/data-src="(\/topfoto\/t\/\d+\/\d+-\d+-)\d+\.jpg/);
      if (img) l.images.push(`https://www.topreality.sk${img[1]}18.jpg`);
      const cat = fold(attr("item_category2"));
      out.push(finalize(l, /garson|1 izb/.test(cat) ? "studio" : "flat"));
    }
  }
  return out;
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

export async function bezrealitky(pages = [1]) {
  const out: Listing[] = [];
  for (const page of pages) {
    const pp = nextData(
      await get(
        "https://www.bezrealitky.sk/vypis/ponuka-prenajom/byt/bratislava?order=TIMEORDER_DESC" +
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
      out.push(finalize(l, v.roommate ? "room" : /GARS|DISP_1/.test(disp) ? "studio" : "flat"));
    }
  }
  return out;
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
  const district = l.district;
  l.phones = [];
  l.emails = [];
  l.district = null;
  finalize(l, l.kind);
  l.district = district ?? l.district;
}
