// In-page place search for "Your route": OSM addresses and named places bundled in
// places.json (scripts/boulder_bikenet/export_site_data.py). No geocoding service; nothing typed
// leaves the browser.
import type { LatLng } from "./routing";

export interface PlacesData {
  streets: string[];
  a: [string, number, number, number][]; // house number, street index, lat*1e5, lng*1e5
  p: [string, string, number, number][]; // name, kind, lat*1e5, lng*1e5
}

export interface Place {
  label: string;
  sub: string; // kind, or "Boulder street"
  ll: LatLng;
}

const ABBREV: Record<string, string> = {
  st: "street", ave: "avenue", av: "avenue", rd: "road", dr: "drive", ln: "lane", ct: "court", pl: "place",
  pkwy: "parkway", blvd: "boulevard", cir: "circle", hwy: "highway", trl: "trail", ter: "terrace", sq: "square",
  n: "north", s: "south", e: "east", w: "west", "&": "and",
};

export const words = (s: string) =>
  s.toLowerCase().replace(/[.,#'’()[\]/-]/g, " ").split(/\s+/).filter(Boolean).map((w) => ABBREV[w] ?? w);

// Local names OSM doesn't use. Matched against the start of the normalized query.
const NICKNAMES: [string, string][] = [
  ["cu boulder", "university of colorado boulder main campus"],
  ["cu", "university of colorado boulder main campus"],
  ["29th street mall", "twenty ninth street"],
  ["twenty ninth street mall", "twenty ninth street"],
];

function expand(q: string[]): string[] | null {
  const joined = q.join(" ");
  for (const [nick, real] of NICKNAMES)
    if (joined === nick || joined.startsWith(nick + " ")) return [...real.split(" "), ...q.slice(nick.split(" ").length)];
  return null;
}

// Every query word must be a prefix of some word in the target
const matches = (target: string[], q: string[]) => q.every((w) => target.some((t) => t.startsWith(w)));

// Named places people are likely to bike to come before bus stops and shops with the same words
const KIND_RANK: Record<string, number> = { university: 0, college: 0, neighbourhood: 1, suburb: 1, school: 1, park: 1, library: 1, supermarket: 1, hospital: 1 };

interface Entry extends Place {
  w: string[];
  rank: number;
}

export class PlaceIndex {
  private streets: { name: string; w: string[]; ll: LatLng }[];
  private addrs: { num: string; st: number; ll: LatLng }[];
  private named: Entry[];

  constructor(D: PlacesData) {
    this.addrs = D.a.map(([num, st, la, ln]) => ({ num: num.toLowerCase(), st, ll: [la / 1e5, ln / 1e5] }));
    // A street "place" sits at its middle address
    const byStreet = new Map<number, LatLng[]>();
    for (const a of this.addrs) (byStreet.get(a.st) ?? byStreet.set(a.st, []).get(a.st)!).push(a.ll);
    this.streets = D.streets.map((name, i) => {
      const pts = (byStreet.get(i) ?? []).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      return { name, w: words(name), ll: pts[Math.floor(pts.length / 2)] ?? [0, 0] };
    });
    this.named = D.p.map(([name, kind, la, ln]) => ({
      label: name, sub: kind, ll: [la / 1e5, ln / 1e5] as LatLng, w: words(name), rank: KIND_RANK[kind] ?? (kind === "bus stop" ? 3 : 2),
    }));
  }

  search(query: string, limit = 7): Place[] {
    const q = words(query);
    if (!q.length) return [];
    const out: Place[] = [];
    const nick = expand(q);
    if (nick) for (const e of this.named.filter((x) => matches(x.w, nick)).sort((x, y) => x.rank - y.rank || x.label.length - y.label.length).slice(0, 2))
      out.push({ label: e.label, sub: e.sub, ll: e.ll });
    // "1234 pearl": house number + street words
    if (/^\d/.test(q[0])) {
      const rest = q.slice(1);
      const hits = this.addrs.filter((a) => a.num.startsWith(q[0]) && (!rest.length || matches(this.streets[a.st].w, rest)));
      hits.sort((a, b) => (a.num === q[0] ? 0 : 1) - (b.num === q[0] ? 0 : 1) || a.num.length - b.num.length || +a.num - +b.num);
      for (const a of hits.slice(0, limit)) out.push({ label: `${a.num.toUpperCase()} ${this.streets[a.st].name}`, sub: "Address", ll: a.ll });
    }
    if (out.length < limit) {
      const named = this.named.filter((e) => matches(e.w, q));
      named.sort((a, b) => a.rank - b.rank || +!a.label.toLowerCase().startsWith(query.toLowerCase()) - +!b.label.toLowerCase().startsWith(query.toLowerCase()) || a.label.length - b.label.length);
      const sts = this.streets.filter((s) => matches(s.w, q)).map((s) => ({ label: s.name, sub: "Street", ll: s.ll }));
      // Streets first when the query looks like a street name ("pearl st"), otherwise places
      const streetish = q.some((w) => Object.values(ABBREV).includes(w));
      const merged = streetish ? [...sts, ...named] : [...named.slice(0, 4), ...sts, ...named.slice(4)];
      for (const e of merged) {
        if (out.length >= limit) break;
        if (out.some((o) => o.label === e.label && o.ll[0] === e.ll[0])) continue;
        out.push({ label: e.label, sub: e.sub, ll: e.ll });
      }
    }
    return out;
  }

  /** Label for a dropped pin: the nearest address within ~60 m, else "Dropped pin". */
  nearest([lat, lng]: LatLng): string {
    const kx = 85200, ky = 111000;
    let best = "", bd = 60;
    for (const a of this.addrs) {
      const d = Math.hypot((a.ll[0] - lat) * ky, (a.ll[1] - lng) * kx);
      if (d < bd) {
        bd = d;
        best = `${a.num.toUpperCase()} ${this.streets[a.st].name}`;
      }
    }
    return best ? `Near ${best}` : "Dropped pin";
  }
}
