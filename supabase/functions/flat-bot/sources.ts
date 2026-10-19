// Парсеры сайтов с арендой в Братиславе (порт sources.py).

export type Listing = {
  source: string;
  id: string;
  title: string;
  url: string;
  price: number | null; // аренда, €/мес
  charges: number | null; // энергии, если сайт отдаёт их отдельно
  location: string;
  kind: string;
  text: string; // описание: из него берём телефон и пометку про энергии
  extra: string[];
  published: string | null; // YYYY-MM-DD по Братиславе
  phone?: string | null;
};

export const key = (l: Listing) => `${l.source}:${l.id}`;
export const total = (l: Listing) => (l.price == null ? null : l.price + (l.charges ?? 0));

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
  decode(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").trim();
const int = (s: unknown) => {
  const d = String(s ?? "").replace(/[^\d]/g, "");
  return d ? parseInt(d, 10) : null;
};
export const bratislavaDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(d);

// ---------------------------------------------------------------- bazos.sk
// «Hľadám byt…» — люди, которые сами ищут жильё
const SEEKER = /(^|[^\p{L}])(h[lľ]ad[aá]me?|dopyt|sh[aá]n[ií]m)([^\p{L}]|$)/iu;

export async function bazos(category: string, kind: string, max: number, radius: number) {
  const out: Listing[] = [];
  for (const offset of ["", "20/"]) {
    const html = await get(
      `https://reality.bazos.sk/prenajmu/${category}/${offset}?hlokalita=81101&humkreis=${radius}&cenado=${max}`,
    );
    for (const card of html.split('<div class="inzeraty inzeratyflex">').slice(1)) {
      const a = card.match(/<h2 class=nadpis><a href="(\/inzerat\/(\d+)\/[^"]*)">([\s\S]*?)<\/a>/);
      if (!a) continue;
      const title = strip(a[3]);
      const desc = strip(card.match(/<div class=popis>([\s\S]*?)<\/div>/)?.[1] ?? "");
      if (SEEKER.test(title) || SEEKER.test(desc.slice(0, 60))) continue;
      const d = card.match(/\[(\d{1,2})\.(\d{1,2})\.\s*(\d{4})\]/);
      out.push({
        source: "bazos",
        id: a[2],
        title,
        url: "https://reality.bazos.sk" + a[1],
        price: int(strip(card.match(/class="inzeratycena">([\s\S]*?)<\/div>/)?.[1] ?? "")),
        charges: null,
        location: strip(card.match(/class="inzeratylok">([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/\n/g, " "),
        kind,
        text: desc,
        extra: [],
        published: d ? `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}` : null,
      });
    }
  }
  return out;
}

export async function bazosDetail(l: Listing) {
  const html = await get(l.url);
  const m = html.match(/class=popisdetail>([\s\S]*?)<\/div>/);
  if (m) l.text = strip(m[1]);
}

// ------------------------------------------------------- nehnutelnosti.sk
// reality.sk и byty.sk работают на той же базе — отдельно не парсим.
export async function nehnutelnosti(max: number) {
  const html = await get(
    `https://www.nehnutelnosti.sk/vysledky/byty/bratislava/prenajom?priceTo=${max}&order=NEWEST`,
  );
  let items: any[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const data = JSON.parse(m[1]);
    for (const node of data["@graph"] ?? [data]) {
      if (node["@type"] === "SearchResultsPage") items = node.mainEntity.itemListElement;
    }
  }
  if (!items.length) throw new Error("не нашёл список объявлений (сменилась вёрстка?)");
  return items.map(({ item: it }): Listing => ({
    source: "nehnutelnosti",
    id: String(it["@id"]).split("/").pop()!,
    title: String(it.name ?? "").trim(),
    url: it.url,
    price: int(it.priceSpecification?.price),
    charges: null,
    location: "",
    kind: it.category ?? "byt",
    text: it.description ?? "",
    extra: it.floorSize?.value ? [`${it.floorSize.value} m²`] : [],
    published: it.validFrom ? bratislavaDate(new Date(it.validFrom)) : null,
  }));
}

// ---------------------------------------------------------- topreality.sk
export async function topreality(max: number) {
  const types = [101, 108, 102, 103, 110].map((t) => `&type%5B%5D=${t}`).join("");
  const html = await get(
    `https://www.topreality.sk/vyhladavanie-nehnutelnosti.html?form=3${types}` +
      `&obec=c100-Bratislavsk%C3%BD+kraj&cena_do=${max}&searchType=string&n_search=search&sort=date_desc`,
  );
  const out: Listing[] = [];
  for (const card of html.split('data-ga4-container-item_id_generic="').slice(1)) {
    const id = card.match(/^(\d+)/)?.[1];
    const href = card.match(/<h2 class="card-title[^"]*"><a href="([^"]+)"/)?.[1];
    if (!id || !href) continue;
    const attr = (n: string) => decode(card.match(new RegExp(`data-ga4-container-${n}="([^"]*)"`))?.[1] ?? "");
    const loc = [...card.matchAll(/class="location-(?:address|city)">([^<]*)</g)].map((m) => decode(m[1]).trim());
    out.push({
      source: "topreality",
      id,
      title: attr("item_name"),
      url: href,
      price: int(attr("price")),
      charges: null,
      location: loc.join(" ").replace(/\s*,\s*$/, "") || attr("item_category3"),
      kind: attr("item_category2"),
      text: "",
      extra: [],
      published: null,
    });
  }
  return out;
}

export async function toprealityDetail(l: Listing) {
  const html = await get(l.url);
  const m = html.match(/"description":\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return;
  const raw = m[1].replace(/[\n\r\t]/g, " ");
  try {
    l.text = JSON.parse(`"${raw}"`);
  } catch {
    l.text = raw;
  }
}

// --------------------------------------------------------- bezrealitky.sk
export async function bezrealitky() {
  const html = await get(
    "https://www.bezrealitky.sk/vypis/ponuka-prenajom/byt/bratislava?order=TIMEORDER_DESC",
  );
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("нет __NEXT_DATA__");
  const cache = JSON.parse(m[1]).props.pageProps.apolloCache ?? {};
  const out: Listing[] = [];
  for (const [k, v] of Object.entries<any>(cache)) {
    if (!k.startsWith("Advert:")) continue;
    const pick = (p: string) => Object.entries<any>(v).find(([kk]) => kk.startsWith(p))?.[1];
    const extra = v.surface ? [`${v.surface} m²`] : [];
    if (v.roommate) extra.push("совместное проживание");
    extra.push(...((pick("tags") ?? []) as string[]).slice(0, 3));
    out.push({
      source: "bezrealitky",
      id: String(v.id),
      title: pick("imageAltText") || v.uri,
      url: `https://www.bezrealitky.sk/nehnutelnosti-byty-domy/${v.uri}`,
      price: int(v.price),
      charges: int(v.charges),
      location: pick("address") ?? "",
      kind: String(v.disposition ?? "").replace("DISP_", "").replaceAll("_", " ").toLowerCase(),
      text: "",
      extra,
      published: null,
    });
  }
  return out;
}

// ------------------------------------------------------------- телефон
// номера самих порталов, их не показываем
const SITE_PHONES = new Set(["+421220924184", "+421220924186"]);

export function findPhone(text: string): string | null {
  const re = /(?:\+|00)\s?421[\s\-\/.]?\(?0?\)?\s?(\d{2,3})[\s\-\/.]?(\d{3})[\s\-\/.]?(\d{3,4})|(?<!\d)0(9\d{2})[\s\-\/.]?(\d{3})[\s\-\/.]?(\d{3})(?!\d)/g;
  for (const m of text.matchAll(re)) {
    const n = m[1] ? `+421${m[1]}${m[2]}${m[3]}` : `+421${m[4]}${m[5]}${m[6]}`;
    if (n.length === 13 && !SITE_PHONES.has(n)) return n;
  }
  return null;
}

export const prettyPhone = (n: string) => n.replace(/^\+421(\d{3})(\d{3})(\d{3})$/, "+421 $1 $2 $3");
