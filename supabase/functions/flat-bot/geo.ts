// География Словакии: края, города, районы Братиславы.
// Определяем край и город объявления по данным сайта, адресу, заголовку и PSČ.

export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const slug = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const REGIONS = [
  { key: "BA", name: "Bratislavský kraj", slug: "bratislavsky-kraj" },
  { key: "TT", name: "Trnavský kraj", slug: "trnavsky-kraj" },
  { key: "TN", name: "Trenčiansky kraj", slug: "trenciansky-kraj" },
  { key: "NR", name: "Nitriansky kraj", slug: "nitriansky-kraj" },
  { key: "ZA", name: "Žilinský kraj", slug: "zilinsky-kraj" },
  { key: "BB", name: "Banskobystrický kraj", slug: "banskobystricky-kraj" },
  { key: "PO", name: "Prešovský kraj", slug: "presovsky-kraj" },
  { key: "KE", name: "Košický kraj", slug: "kosicky-kraj" },
] as const;
export type Region = (typeof REGIONS)[number]["key"];

// Города Словакии (+ крупные пригороды Братиславы) и их край
const T: Record<Region, string[]> = {
  BA: ["Bratislava", "Malacky", "Modra", "Pezinok", "Senec", "Stupava", "Svätý Jur", "Bernolákovo", "Ivanka pri Dunaji",
    "Chorvátsky Grob", "Dunajská Lužná", "Most pri Bratislave", "Marianka", "Borinka", "Zohor", "Lozorno", "Limbach",
    "Slovenský Grob", "Rovinka", "Miloslavov", "Hamuliakovo", "Kalinkovo", "Viničné", "Vinosady", "Nová Dedinka",
    "Tomášov", "Veľký Biel", "Gajary", "Veľké Leváre", "Láb", "Jablonové", "Plavecký Štvrtok"],
  TT: ["Trnava", "Piešťany", "Hlohovec", "Leopoldov", "Sereď", "Galanta", "Sládkovičovo", "Dunajská Streda", "Šamorín",
    "Veľký Meder", "Gabčíkovo", "Senica", "Skalica", "Holíč", "Gbely", "Šaštín-Stráže", "Vrbové", "Smolenice",
    "Jaslovské Bohunice", "Veľký Grob", "Báč"],
  TN: ["Trenčín", "Trenčianske Teplice", "Nemšová", "Dubnica nad Váhom", "Nová Dubnica", "Ilava", "Púchov",
    "Považská Bystrica", "Nové Mesto nad Váhom", "Stará Turá", "Myjava", "Brezová pod Bradlom", "Bánovce nad Bebravou",
    "Partizánske", "Prievidza", "Bojnice", "Handlová", "Nováky"],
  NR: ["Nitra", "Vráble", "Zlaté Moravce", "Topoľčany", "Komárno", "Hurbanovo", "Kolárovo", "Nové Zámky", "Šurany",
    "Štúrovo", "Levice", "Tlmače", "Šahy", "Želiezovce", "Šaľa"],
  ZA: ["Žilina", "Rajec", "Bytča", "Kysucké Nové Mesto", "Čadca", "Turzovka", "Krásno nad Kysucou", "Martin", "Vrútky",
    "Turčianske Teplice", "Liptovský Mikuláš", "Liptovský Hrádok", "Ružomberok", "Dolný Kubín", "Tvrdošín", "Trstená",
    "Námestovo", "Terchová"],
  BB: ["Banská Bystrica", "Brezno", "Zvolen", "Detva", "Hriňová", "Žiar nad Hronom", "Žarnovica", "Nová Baňa", "Kremnica",
    "Banská Štiavnica", "Lučenec", "Fiľakovo", "Poltár", "Rimavská Sobota", "Hnúšťa", "Tisovec", "Revúca", "Jelšava",
    "Veľký Krtíš", "Modrý Kameň", "Krupina", "Dudince", "Sliač"],
  PO: ["Prešov", "Sabinov", "Lipany", "Poprad", "Svit", "Vysoké Tatry", "Kežmarok", "Spišská Belá", "Stará Ľubovňa",
    "Podolínec", "Levoča", "Spišské Podhradie", "Bardejov", "Svidník", "Stropkov", "Giraltovce", "Humenné", "Snina",
    "Medzilaborce", "Vranov nad Topľou", "Hanušovce nad Topľou"],
  KE: ["Košice", "Moldava nad Bodvou", "Medzev", "Spišská Nová Ves", "Krompachy", "Gelnica", "Rožňava", "Dobšiná",
    "Michalovce", "Veľké Kapušany", "Strážske", "Sobrance", "Trebišov", "Sečovce", "Kráľovský Chlmec", "Čierna nad Tisou"],
};

// у этих названий склонения совпадают с обычными словами (modrá — синяя)
const NO_STEM = new Set(["modra", "trnava", "sered", "stupava"]);

export type Town = { key: string; name: string; region: Region; exact: RegExp; stem: RegExp | null };
export const TOWNS: Town[] = [];
for (const [region, names] of Object.entries(T) as [Region, string[]][]) {
  for (const name of names) {
    const key = slug(name);
    if (TOWNS.some((t) => t.key === key)) continue;
    const f = fold(name).replace(/[-\s]+/g, "[\\s-]+");
    // однословные названия склоняются: Košice → Košiciach, Žilina → Žiline
    const oneWord = !/\s/.test(name) && name.length >= 5 && !NO_STEM.has(key);
    TOWNS.push({
      key, name, region,
      exact: new RegExp(`(^|[^a-z])${f}([^a-z]|$)`),
      stem: oneWord ? new RegExp(`(^|[^a-z])${fold(name).slice(0, -1)}[a-z]{0,4}([^a-z]|$)`) : null,
    });
  }
}
TOWNS.sort((a, b) => b.name.length - a.name.length); // длинные названия раньше коротких
export const townByKey = new Map(TOWNS.map((t) => [t.key, t]));

// Районы городов: [ключ, название, город, шаблон по тексту без диакритики].
// Ключи районов Братиславы без префикса (так они уже сохранены у подписчиков), Кошице — с «ke-».
export const DISTRICTS: [string, string, string, RegExp][] = [
  ["devinska-nova-ves", "Devínska Nová Ves", "bratislava", /devinsk\w* nov\w* ves|\bdnv\b/],
  ["podunajske-biskupice", "Podunajské Biskupice", "bratislava", /podunajsk\w* biskupic|\bketelec|lieskovec/],
  ["zahorska-bystrica", "Záhorská Bystrica", "bratislava", /zahorsk\w* bystric/],
  ["stare-mesto", "Staré Mesto", "bratislava", /stare mesto|starom\w*sk|stareho mesta|v centre bratislavy|\bba i\b|bratislava i\b|palisady|hradn\w* vrch|\beurovea/],
  ["ruzinov", "Ružinov", "bratislava", /ruzinov|trnavk|ostredk|\bposen|\bnivy\b|prievoz|travnik|strkovec|\bba ii\b|bratislava ii\b/],
  ["vrakuna", "Vrakuňa", "bratislava", /vrakun|dolne hony/],
  ["nove-mesto", "Nové Mesto", "bratislava", /nove mesto(?! nad)|novom\w*sk|kramare|koliba|\bmierova kolonia|jurajov dvor|\bba iii\b|bratislava iii\b/],
  ["raca", "Rača", "bratislava", /\braca\b|\bracian|krasnan|vychodne/],
  ["vajnory", "Vajnory", "bratislava", /vajnor/],
  ["karlova-ves", "Karlova Ves", "bratislava", /karlov\w* ves|dlhe diely|kutiky|\bba iv\b|bratislava iv\b/],
  ["dubravka", "Dúbravka", "bratislava", /dubravk|dubrav/],
  ["lamac", "Lamač", "bratislava", /lamac/],
  ["devin", "Devín", "bratislava", /\bdevin\b|\bdevine\b/],
  ["petrzalka", "Petržalka", "bratislava", /petrzalk|\bhaje\b|\bdvory\b|ovsist|\bluky\b|kopcan|\bba v\b|bratislava v\b/],
  ["jarovce", "Jarovce", "bratislava", /jarovc/],
  ["rusovce", "Rusovce", "bratislava", /rusovc/],
  ["cunovo", "Čunovo", "bratislava", /cunov/],
  ["ke-stare-mesto", "Staré Mesto", "kosice", /stare mesto|starom\w*sk|centrum mesta|hlavn\w* ulic/],
  ["ke-juh", "Juh", "kosice", /\bjuh\b|juzn\w* tried/],
  ["ke-sever", "Sever", "kosice", /\bsever\b/],
  ["ke-zapad", "Západ", "kosice", /\bzapad\b|\bterasa\b|\bterase\b/],
  ["ke-kvp", "Sídlisko KVP", "kosice", /\bkvp\b|klimkovic/],
  ["ke-tahanovce", "Ťahanovce", "kosice", /tahanov/],
  ["ke-nad-jazerom", "Nad jazerom", "kosice", /nad jazerom/],
  ["ke-dargovskych-hrdinov", "Dargovských hrdinov", "kosice", /dargov/],
  ["ke-lunik", "Luník IX", "kosice", /\blunik/],
  ["ke-saca", "Šaca", "kosice", /\bsac[aie]\b/],
  ["ke-peres", "Pereš", "kosice", /\bperes\b|\bperes[ia]\b/],
  ["ke-myslava", "Myslava", "kosice", /myslav/],
  ["ke-barca", "Barca", "kosice", /\bbarc[aie]\b/],
  ["ke-krasna", "Krásna", "kosice", /\bkrasn[aej]\b/],
  ["ke-kosicka-nova-ves", "Košická Nová Ves", "kosice", /kosick\w* nov\w* ves/],
  ["ke-dzungla", "Džungľa", "kosice", /dzungl/],
  ["ke-vysne-opatske", "Vyšné Opátske", "kosice", /opatsk/],
  ["ke-kavecany", "Kavečany", "kosice", /kavecan/],
  ["ke-lorincik", "Lorinčík / Poľov / Šebastovce", "kosice", /lorincik|\bpolov|sebastov/],
];
export const CITIES_WITH_DISTRICTS = new Set(DISTRICTS.map((d) => d[2]));

const BA_PSC: [RegExp, string][] = [
  [/^811/, "stare-mesto"], [/^82106/, "podunajske-biskupice"], [/^82107/, "vrakuna"], [/^821/, "ruzinov"],
  [/^83106/, "raca"], [/^831/, "nove-mesto"], [/^84101/, "dubravka"], [/^84102/, "dubravka"], [/^84103/, "lamac"],
  [/^84104/, "karlova-ves"], [/^84105/, "karlova-ves"], [/^84106/, "zahorska-bystrica"], [/^84107/, "devinska-nova-ves"],
  [/^84110/, "devin"], [/^851/, "petrzalka"],
];

// Край по PSČ — грубо, только когда город неизвестен (деревни)
const REGION_PSC: [RegExp, Region][] = [
  [/^(8[1-5]|90[0-3])/, "BA"],
  [/^(90[5689]|91[7-9]|92[0-6]|929|93[0-2])/, "TT"],
  [/^(907|91[1-6]|95[78]|97[12]|01[7-9]|020)/, "TN"],
  [/^(927|93[4-7]|94\d|95[0-6])/, "NR"],
  [/^(01[0-6]|02[1-9]|03\d)/, "ZA"],
  [/^(050|049|9[6-9]\d)/, "BB"],
  [/^(04[0-8]|05[2356]|07\d)/, "KE"],
  [/^(05[4789]|06\d|08\d|09[0-4])/, "PO"],
];

export const pscOf = (s: string | null | undefined) => {
  const m = s?.match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? m[1] + m[2] : null;
};
export function regionByPsc(psc: string | null): Region | null {
  if (!psc) return null;
  for (const [re, r] of REGION_PSC) if (re.test(psc)) return r;
  return null;
}
export function regionByName(s: string | null | undefined): Region | null {
  if (!s) return null;
  const f = fold(s);
  for (const r of REGIONS) if (f.includes(fold(r.name))) return r.key;
  return null;
}

// город по названию с сайта: «Košice-Juh» → Košice, «Bratislava - mestská časť …» → Bratislava
export function townFromName(raw: string | null | undefined): Town | null {
  if (!raw) return null;
  const f = fold(raw).trim();
  const direct = townByKey.get(slug(raw));
  if (direct) return direct;
  for (const t of TOWNS) if (t.exact.test(f)) return t;
  return null;
}

// сокращения в заголовках: «Centrum BB», «KE - Západ», «BA II»
const ALIASES: [RegExp, string][] = [
  [/\bBA\b/, "bratislava"], [/\bKE\b/, "kosice"], [/\bBB\b/, "banska-bystrica"],
  [/\bNR\b/, "nitra"], [/\bTN\b/, "trencin"], [/\bTT\b/, "trnava"], [/\bZV\b/, "zvolen"], [/\bPP\b/, "poprad"],
];

export function detectTown(texts: (string | null | undefined)[], stems = true): Town | null {
  for (const s of texts) {
    if (!s) continue;
    const f = fold(s);
    for (const t of TOWNS) if (t.exact.test(f)) return t;
  }
  for (const s of texts) {
    if (!s) continue;
    for (const [re, k] of ALIASES) if (re.test(s)) return townByKey.get(k) ?? null;
  }
  if (!stems) return null;
  for (const s of texts) {
    if (!s) continue;
    const f = fold(s);
    for (const t of TOWNS) if (t.stem?.test(f)) return t;
  }
  return null;
}

export function detectDistrict(texts: (string | null | undefined)[], psc: string | null, city = "bratislava"): string | null {
  for (const s of texts) {
    if (!s) continue;
    const f = fold(s);
    for (const [k, , c, re] of DISTRICTS) if (c === city && re.test(f)) return k;
  }
  if (psc && city === "bratislava") for (const [re, k] of BA_PSC) if (re.test(psc)) return k;
  return null;
}

export const regionName = (k: string | null) => REGIONS.find((r) => r.key === k)?.name ?? null;
export const districtName = (k: string | null) => DISTRICTS.find((d) => d[0] === k)?.[1] ?? null;
export const districtCity = (k: string | null) => DISTRICTS.find((d) => d[0] === k)?.[2] ?? null;
