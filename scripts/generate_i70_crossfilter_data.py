#!/usr/bin/env python3
"""
Generate the data for the I-70 Eisenhower Tunnel crossfilter explorer.

See .claude/i70-tunnel-crossfilter-spec.md for the gameplan this serves.

Sources (both public, no key):

  CDOT OTIS annual endpoint - one counter's whole year of hourly,
  by-direction counts in one request:
    /GetDailyTrafficVolumeForStationByYear/{station}/{year}.csv
  Columns: COUNTSTATIONID, COUNTDATE (YYYYMMDD), COUNTDIR (P|S), HOUR0..23.
  I-70: P = eastbound (toward Denver), S = westbound (toward the mountains).
  Berthoud (US-40): P = toward I-70/Denver, S = toward Winter Park. In the
  page S is "wb" for both: the direction away from Denver.
  Days with no data are missing rows. Missing HOURS come back as 0, so
  every page-counter row with a 0 hour is re-checked against the per-day
  endpoint, which leaves missing hours blank:
    /GetDailyTrafficVolumeForStationByDay/{station}/true/{YYYY-M-D}.json

  NOAA NCEI GHCN-Daily (daily-summaries) - SNOW / PRCP / SNWD at
  Dillon 1 E (primary), Georgetown (fallback), Loveland Basin SNOTEL
  (PRCP/SNWD only, last resort). The co-op stations report at ~08:00, so
  day D's report covers ~08:00 D-1 -> 08:00 D:
    snowOvernight = SNOW in D's report
    snowDay       = SNOW in D+1's report
    precipDay     = PRCP in D+1's report
    snowDepth     = SNWD in D's report

The page shows three counters (COUNTERS): Twin Tunnels (000120), on I-70
west of where US-6 joins, so it carries both Denver feeders; the Tunnel
(000106); and US-40 below Berthoud Pass (000223), which carries everything
driving from Denver to Winter Park and never touches the Tunnel. Copper
Mountain and Genesee are downloaded into the cache for later work.

The API is fetched one request at a time, >= 1 s apart, with a logged
10/20/30 s backoff on errors. Every raw response is cached in
data/i70_crossfilter/raw/.

Usage:
    python scripts/generate_i70_crossfilter_data.py
    python scripts/generate_i70_crossfilter_data.py --skip-download  # cache only

Output:
    public/data/i70-crossfilter/days.json  - columnar, one entry per day; shared
                                             fields at the top, per-counter ones
                                             under "counters"
    public/data/i70-crossfilter/hours.bin  - Uint16 little-endian, 65535 = missing:
                                             per counter (in "counters" order)
                                             wb[days*24] then eb[days*24]
"""

import argparse
import csv
import json
import statistics
import struct
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "i70_crossfilter" / "raw"
OUT_DIR = ROOT / "public" / "data" / "i70-crossfilter"

OTIS = "https://dtdapps.codot.gov/otis/API/TRANSYS"
NOAA = "https://www.ncei.noaa.gov/access/services/data/v1"

STATIONS = {
    "000106": "Eisenhower Tunnel",
    "000223": "US-40 below Berthoud Pass",
    "000119": "Copper Mountain",
    "000120": "Twin Tunnels",
    "000107": "Genesee",
}
# The counters in the page, in hours.bin order: (id, station, name, title).
# Twin Tunnels is the trunk (west of the US-6 junction, so it carries both
# Denver feeders); it splits into the Tunnel, Berthoud and everything else.
COUNTERS = [
    ("twin", "000120", "Twin Tunnels", "Every hour through the Twin Tunnels"),
    ("tunnel", "000106", "Eisenhower Tunnel", "Every hour through the Eisenhower Tunnel"),
    ("berthoud", "000223", "Berthoud Pass (US-40)", "Every hour over Berthoud Pass"),
]
WX_STATIONS = {
    "USC00052281": "Dillon 1 E",
    "USC00053261": "Georgetown",
    "USS0005K05S": "Loveland Basin SNOTEL",
}
# Per-field fallback order. SNOTEL has no SNOW, and its day is midnight to
# midnight rather than the co-op morning report, so it is only a last resort.
WX_ORDER = {
    "SNOW": ["USC00052281", "USC00053261"],
    "PRCP": ["USC00052281", "USC00053261", "USS0005K05S"],
    "SNWD": ["USC00052281", "USC00053261", "USS0005K05S"],
}
WX_CODES = {"USC00052281": "dillon", "USC00053261": "georgetown", "USS0005K05S": "loveland"}

START = date(1996, 1, 1)
END = date(2026, 9, 30)  # last day OTIS had as of 2026-10-21
YEARS = range(START.year, END.year + 1)
MISSING = 65535

# ---------------------------------------------------------------- download

_last_request = 0.0


def fetch(url: str, dest: Path, skip_download: bool) -> Path | None:
    """Fetch url into dest unless cached. One request at a time, >= 1 s apart."""
    global _last_request
    if dest.exists():
        return dest
    if skip_download:
        return None
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt, backoff in enumerate([10, 20, 30, None]):
        wait = 1.1 - (time.time() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "marginaldata.com research"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                body = resp.read()
            dest.write_bytes(body)
            print(f"  fetched {dest.relative_to(RAW_DIR)} ({len(body) / 1024:.0f} KB)", flush=True)
            return dest
        except Exception as e:  # noqa: BLE001 - log and back off on anything
            if backoff is None:
                print(f"  FAILED {url}: {e}", flush=True)
                return None
            print(f"  error on {url}: {e} - retrying in {backoff}s", flush=True)
            time.sleep(backoff)
    return None


def otis_year_path(station: str, year: int) -> Path:
    return RAW_DIR / "otis" / station / f"{year}.csv"


def otis_day_path(station: str, d: date) -> Path:
    return RAW_DIR / "otis_day" / station / f"{d.isoformat()}.json"


def noaa_path(station: str, year: int) -> Path:
    return RAW_DIR / "noaa" / station / f"{year}.json"


def download_annual(skip: bool) -> None:
    print("OTIS annual files")
    for station in STATIONS:
        for year in YEARS:
            fetch(f"{OTIS}/GetDailyTrafficVolumeForStationByYear/{station}/{year}.csv",
                  otis_year_path(station, year), skip)


def download_weather(skip: bool) -> None:
    print("NOAA GHCN-Daily")
    for station in WX_STATIONS:
        for year in YEARS:
            end = min(date(year, 12, 31), END + timedelta(days=1))
            url = (f"{NOAA}?dataset=daily-summaries&stations={station}"
                   f"&startDate={year}-01-01&endDate={end.isoformat()}"
                   "&dataTypes=SNOW,PRCP,SNWD&units=standard&format=json&includeAttributes=true")
            fetch(url, noaa_path(station, year), skip)


# ---------------------------------------------------------------- traffic


def read_annual(station: str) -> dict[tuple[date, str], list[int | None]]:
    """(date, 'P'|'S') -> 24 hourly counts (zeros not yet resolved)."""
    rows = {}
    for year in YEARS:
        path = otis_year_path(station, year)
        if not path.exists():
            print(f"  ! missing cache {path.relative_to(ROOT)}")
            continue
        with path.open(newline="") as f:
            for r in csv.DictReader(f):
                d = date(int(r["COUNTDATE"][:4]), int(r["COUNTDATE"][4:6]), int(r["COUNTDATE"][6:]))
                rows[(d, r["COUNTDIR"])] = [int(r[f"HOUR{h}"]) for h in range(24)]
    return rows


def parse_day_value(v: str) -> int | None:
    v = (v or "").replace(",", "").strip()
    return int(v) if v else None


def resolve_zeros(station: str, rows, skip: bool) -> dict:
    """Re-check every row containing a 0 against the per-day endpoint.

    Blank per-day = missing. A real "0" per-day stays 0. Returns stats.
    """
    zero_days = sorted({d for (d, _), hrs in rows.items() if 0 in hrs})
    stats = Counter()
    real_zero_examples = []
    print(f"Per-day zero checks ({station}): {sum(1 for hrs in rows.values() if 0 in hrs)} rows"
          f" on {len(zero_days)} days")
    for d in zero_days:
        url = f"{OTIS}/GetDailyTrafficVolumeForStationByDay/{station}/true/{d.year}-{d.month}-{d.day}.json"
        path = fetch(url, otis_day_path(station, d), skip)
        if path is None:
            stats["days_unchecked"] += 1
            continue
        per_day = {r["dir"]: r for r in json.loads(path.read_text())}
        for direction in "PS":
            hrs = rows.get((d, direction))
            if hrs is None or 0 not in hrs:
                continue
            stats["rows_checked"] += 1
            pd = per_day.get(direction)
            row_missing = row_real = 0
            for h in range(24):
                if hrs[h] != 0:
                    continue
                v = parse_day_value(pd[f"h{h}"]) if pd else None
                if v is None:
                    hrs[h] = None
                    row_missing += 1
                elif v == 0:
                    row_real += 1
                else:  # per-day disagrees with annual; trust per-day
                    hrs[h] = v
                    stats["hours_disagree"] += 1
            stats["hours_missing"] += row_missing
            stats["hours_real_zero"] += row_real
            if row_missing:
                stats["rows_with_missing"] += 1
            if row_real:
                stats["rows_with_real_zero"] += 1
                if len(real_zero_examples) < 8:
                    real_zero_examples.append(f"{d} {direction}: {hrs}")
    stats["real_zero_examples"] = real_zero_examples
    return stats


# OTIS never reports a 0 hour: the per-day endpoint leaves it blank, the
# same as an outage (checked 2026-10-28: 1,735 rows across both page
# counters, not one real "0"). On US-40 the blanks pile up at 1-3 AM, so
# most are empty roads, not outages. A blank night hour (10 PM - 6 AM)
# whose nearest recorded hours on both sides are both quiet is taken as 0.
NIGHT_HOURS = {22, 23, 0, 1, 2, 3, 4, 5}
QUIET = 10  # vehicles/hour
MAX_ZERO_RUN = 4


def fill_quiet_zeros(rows) -> Counter:
    stats = Counter()
    for hrs in rows.values():
        h = 0
        while h < 24:
            if hrs[h] is not None:
                h += 1
                continue
            end = h
            while end + 1 < 24 and hrs[end + 1] is None:
                end += 1
            before = hrs[h - 1] if h > 0 else None
            after = hrs[end + 1] if end < 23 else None
            run = range(h, end + 1)
            quiet = [v for v in (before, after) if v is not None]
            # At the start or end of the day only one neighbor exists.
            if (all(x in NIGHT_HOURS for x in run) and end - h + 1 <= MAX_ZERO_RUN
                    and quiet and all(v <= QUIET for v in quiet)
                    and (len(quiet) == 2 or h == 0 or end == 23)):
                for x in run:
                    hrs[x] = 0
                stats["hours_zeroed"] += end - h + 1
                stats["runs_zeroed"] += 1
            else:
                stats["hours_left_missing"] += end - h + 1
            h = end + 1
    return stats


# ---------------------------------------------------------------- weather


def read_weather() -> dict[str, dict[date, dict]]:
    out = {}
    obs_times = Counter()
    for station in WX_STATIONS:
        by_day = {}
        for year in YEARS:
            path = noaa_path(station, year)
            if not path.exists():
                continue
            for r in json.loads(path.read_text() or "[]"):
                d = date.fromisoformat(r["DATE"])
                vals = {}
                for k in ("SNOW", "PRCP", "SNWD"):
                    if r.get(k) not in (None, ""):
                        vals[k] = float(r[k])
                by_day[d] = vals
                if station == "USC00052281" and r.get("PRCP_ATTRIBUTES"):
                    obs_times[r["PRCP_ATTRIBUTES"].split(",")[-1] or "?"] += 1
        out[station] = by_day
    print(f"Dillon observation times (PRCP attribute): {dict(obs_times.most_common(5))}")
    return out


def weather_value(wx, d: date, field: str) -> tuple[float | None, str | None]:
    for station in WX_ORDER[field]:
        v = wx[station].get(d, {}).get(field)
        if v is not None:
            return v, station
    return None, None


# ---------------------------------------------------------------- holidays


def nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    d = date(year, month, 1)
    d += timedelta(days=(weekday - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)


def last_weekday(year: int, month: int, weekday: int) -> date:
    d = date(year, month + 1, 1) - timedelta(days=1)
    return d - timedelta(days=(d.weekday() - weekday) % 7)


DOW = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def holidays_for_year(year: int) -> dict[date, tuple[str, str]]:
    """date -> (holiday, holidayPos).

    Monday holidays (MLK, Presidents, Memorial, Labor): Fri before -> Mon.
    Thanksgiving: Wed -> Sun. July 4: the observed federal holiday plus the
    weekend it joins (Fri-Mon for a Monday holiday, Thu-Sun for a Friday
    one); midweek, just July 4. holidayPos is the weekday name for all of
    these. xmas_ny: Dec 20 -> Jan 2, holidayPos = "MM-DD".
    """
    out = {}

    def span(first: date, last: date, name: str):
        d = first
        while d <= last:
            out[d] = (name, DOW[d.weekday()])
            d += timedelta(days=1)

    for name, mon in [
        ("mlk", nth_weekday(year, 1, 0, 3)),
        ("presidents", nth_weekday(year, 2, 0, 3)),
        ("memorial", last_weekday(year, 5, 0)),
        ("labor", nth_weekday(year, 9, 0, 1)),
    ]:
        span(mon - timedelta(days=3), mon, name)

    thanks = nth_weekday(year, 11, 3, 4)
    span(thanks - timedelta(days=1), thanks + timedelta(days=3), "thanksgiving")

    j4 = date(year, 7, 4)
    wd = j4.weekday()
    if wd in (5, 6, 0):  # Sat (observed Fri), Sun (observed Mon), Mon
        observed = j4 - timedelta(days=1) if wd == 5 else j4 + timedelta(days=1) if wd == 6 else j4
    else:
        observed = j4
    if observed.weekday() == 0:
        span(observed - timedelta(days=3), observed, "july4")
    elif observed.weekday() == 4:
        span(observed - timedelta(days=1), observed + timedelta(days=2), "july4")
    else:
        span(j4, j4, "july4")

    for d in [date(year, 12, day) for day in range(20, 32)] + [date(year, 1, 1), date(year, 1, 2)]:
        out[d] = ("xmas_ny", d.strftime("%m-%d"))
    return out


# ---------------------------------------------------------------- build


def percentile(values: list[int], p: float) -> float:
    s = sorted(values)
    k = (len(s) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def build_counter(station: str, rows, days: list[date], skip: bool) -> dict:
    """Hourly arrays and per-day fields for one page counter. Prints its checks."""
    print(f"\n=== {station} {STATIONS[station]}")
    zstats = resolve_zeros(station, rows, skip)
    print(f"  rows with a 0 checked per-day: {zstats['rows_checked']}"
          f" ({zstats['days_unchecked']} days not checkable - no cache)")
    print(f"  rows where a 0 was really missing: {zstats['rows_with_missing']}"
          f" ({zstats['hours_missing']} hours)")
    print(f"  rows with a real per-day \"0\": {zstats['rows_with_real_zero']}"
          f" ({zstats['hours_real_zero']} hours); per-day disagreed with annual on"
          f" {zstats['hours_disagree']} nonzero hours")
    for ex in zstats["real_zero_examples"]:
        print(f"    {ex}")
    q = fill_quiet_zeros(rows)
    print(f"  quiet night blanks taken as 0: {q['hours_zeroed']} hours in {q['runs_zeroed']} runs;"
          f" {q['hours_left_missing']} blank hours left missing")

    n = len(days)
    idx = {d: i for i, d in enumerate(days)}
    wb = [[None] * 24 for _ in range(n)]
    eb = [[None] * 24 for _ in range(n)]
    for (d, direction), hrs in rows.items():
        if d in idx:
            (wb if direction == "S" else eb)[idx[d]] = hrs

    print("\nMissing days (no row in either direction) / incomplete days per year")
    for year in YEARS:
        yd = [i for i, d in enumerate(days) if d.year == year]
        none = sum(1 for i in yd if all(v is None for v in wb[i]) and all(v is None for v in eb[i]))
        incomplete = sum(1 for i in yd if None in wb[i] or None in eb[i])
        print(f"  {year}: {len(yd)} days, {none} with no data, {incomplete} incomplete")

    # --- per-year ceilings (99.5th pct of hourly counts, per direction)
    print("\nPer-year ceiling = 99.5th pct of hourly counts (max in brackets)")
    ceilings = {}
    for year in YEARS:
        line = f"  {year}:"
        for name, arr in (("WB", wb), ("EB", eb)):
            vals = [v for i, d in enumerate(days) if d.year == year for v in arr[i] if v is not None]
            c = percentile(vals, 0.995) if vals else None
            ceilings[(year, name)] = c
            line += f"  {name} {c:6.0f} [{max(vals):5d}]" if vals else f"  {name}   n/a"
        print(line + ("  (partial year)" if year == END.year else ""))

    # --- closures: a 9am-6pm hour < 5% of that hour's median for the same
    # direction, weekday and month (medians over all years)
    med = {}
    buckets = defaultdict(list)
    for i, d in enumerate(days):
        for name, arr in (("WB", wb), ("EB", eb)):
            for h in range(9, 18):
                v = arr[i][h]
                if v is not None:
                    buckets[(name, d.weekday(), d.month, h)].append(v)
    for k, vals in buckets.items():
        med[k] = statistics.median(vals)
    closure = [False] * n
    closure_detail = {}
    for i, d in enumerate(days):
        for name, arr in (("WB", wb), ("EB", eb)):
            for h in range(9, 18):
                v = arr[i][h]
                if v is not None and v < 0.05 * med[(name, d.weekday(), d.month, h)]:
                    closure[i] = True
                    closure_detail.setdefault(i, []).append(f"{name} {h}:00={v}")
    print(f"\nClosures flagged: {sum(closure)} days. Examples:")
    for i in sorted(closure_detail)[-12:]:
        print(f"  {days[i]} {DOW[days[i].weekday()]}: {', '.join(closure_detail[i][:4])}")

    def total(hrs):
        return None if None in hrs else sum(hrs)

    def saturated(i, arr, name):
        c = ceilings[(days[i].year, name)]
        return 0 if c is None else sum(1 for v in arr[i] if v is not None and v >= 0.9 * c)

    net_flow = [None] * n
    running = None
    for i, d in enumerate(days):
        wd = d.weekday()
        if wd == 4:
            running = 0
        if wd in (4, 5, 6) and running is not None:
            if None in wb[i] or None in eb[i]:
                running = None
            else:
                running += sum(wb[i]) - sum(eb[i])
            net_flow[i] = running
        else:
            running = None

    return {
        "wb": wb,
        "eb": eb,
        "cols": {
            "ceilings": {str(y): {"wb": round(ceilings[(y, "WB")] or 0), "eb": round(ceilings[(y, "EB")] or 0)}
                         for y in YEARS},
            "wbTotal": [total(wb[i]) for i in range(n)],
            "ebTotal": [total(eb[i]) for i in range(n)],
            "wbSaturated": [saturated(i, wb, "WB") for i in range(n)],
            "ebSaturated": [saturated(i, eb, "EB") for i in range(n)],
            "closure": [int(c) for c in closure],
            "netFlow": net_flow,
            "complete": [int(None not in wb[i] and None not in eb[i]) for i in range(n)],
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-download", action="store_true", help="use the cache only")
    args = ap.parse_args()
    skip = args.skip_download

    download_annual(skip)
    download_weather(skip)

    # --- per-station coverage (every cached counter)
    print("\nRows per station x year (one row = day x direction)")
    print("  year  " + "  ".join(f"{s}" for s in STATIONS))
    annual = {s: read_annual(s) for s in STATIONS}
    for year in YEARS:
        counts = [sum(1 for (d, _) in annual[s] if d.year == year) for s in STATIONS]
        print(f"  {year}  " + "  ".join(f"{c:6d}" for c in counts))

    days = []
    d = START
    while d <= END:
        days.append(d)
        d += timedelta(days=1)

    counters = [(cid, station, name, title, build_counter(station, annual[station], days, skip))
                for cid, station, name, title in COUNTERS]

    # --- weather
    wx = read_weather()
    snow_overnight, snow_day, precip_day, snow_depth, wx_station = [], [], [], [], []
    for d in days:
        so, st = weather_value(wx, d, "SNOW")
        sd, _ = weather_value(wx, d + timedelta(days=1), "SNOW")
        pdv, st_p = weather_value(wx, d + timedelta(days=1), "PRCP")
        dep, st_d = weather_value(wx, d, "SNWD")
        snow_overnight.append(so)
        snow_day.append(sd)
        precip_day.append(pdv)
        snow_depth.append(dep)
        wx_station.append(WX_CODES[st or st_d or st_p] if (st or st_d or st_p) else None)

    print("\nWeather coverage per year: % of days with a value [stations supplying snowOvernight]")
    print("  year  snowOvn snowDay precip  depth   source of snowOvernight")
    for year in YEARS:
        yi = [i for i, d in enumerate(days) if d.year == year]

        def pct(arr):
            return 100 * sum(arr[i] is not None for i in yi) / len(yi)

        src = Counter()
        for i in yi:
            _, st = weather_value(wx, days[i], "SNOW")
            src[WX_CODES.get(st, "none")] += 1
        print(f"  {year}  {pct(snow_overnight):6.1f}  {pct(snow_day):6.1f} {pct(precip_day):6.1f}"
              f" {pct(snow_depth):6.1f}   " + ", ".join(f"{k} {v}" for k, v in src.most_common()))

    # --- per-day fields shared by every counter
    hol = {}
    for year in range(START.year - 1, END.year + 2):
        hol.update(holidays_for_year(year))

    out = {
        "start": START.isoformat(),
        "end": END.isoformat(),
        "partialYear": END.year,
        "holidays": ["none", "mlk", "presidents", "memorial", "july4", "labor", "thanksgiving", "xmas_ny"],
        "wxStations": ["dillon", "georgetown", "loveland"],
        "holiday": [], "holidayPos": [],
        "snowOvernight": snow_overnight, "snowDay": snow_day,
        "precipDay": precip_day, "snowDepth": snow_depth,
        "wxStation": [],
        "counters": [{"id": cid, "station": station, "name": name, "title": title, **c["cols"]}
                     for cid, station, name, title, c in counters],
    }
    for i, d in enumerate(days):
        h, pos = hol.get(d, ("none", ""))
        out["holiday"].append(out["holidays"].index(h))
        out["holidayPos"].append(pos)
        out["wxStation"].append(out["wxStations"].index(wx_station[i]) if wx_station[i] else -1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "days.json").write_text(json.dumps(out, separators=(",", ":")))
    with (OUT_DIR / "hours.bin").open("wb") as f:
        for *_, c in counters:
            for arr in (c["wb"], c["eb"]):
                flat = [MISSING if v is None else v for hrs in arr for v in hrs]
                f.write(struct.pack(f"<{len(flat)}H", *flat))

    for p in sorted(OUT_DIR.iterdir()):
        print(f"wrote {p.relative_to(ROOT)} ({p.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    sys.exit(main())
