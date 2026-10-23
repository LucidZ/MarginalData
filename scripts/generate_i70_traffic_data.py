#!/usr/bin/env python3
"""
Generate days.json for the I-70 mountain traffic toy (/2026/I70Traffic).

See .claude/i70-traffic-poc-spec.md. Proof of concept only: hourly vehicle
counts at four continuous counters between Copper Mountain and Genesee, for a
handful of hand-picked contrasting days.

Sources:
  CDOT OTIS (dtdapps.codot.gov/otis/TrafficData) - undocumented, unauthenticated
    JSON API behind the Traffic Data Explorer. One request per station per day.
    Direction "P" = eastbound (increasing milepost, toward Denver),
    "S" = westbound (toward the mountains). No CORS, hence this script.
  NOAA NCEI GHCN-Daily (Access Data Service, no key) - SNOW/PRCP/SNWD for the
    day before, the day, and the day after, at three corridor stations. Stored
    alongside each day so the "snowy"/"clear" labels can be checked.
    Co-op stations report in the morning, so a day's SNOW mostly fell the
    previous evening/overnight; snow that falls during the day itself shows up
    in the NEXT day's report. That's why D+1 is included.

How the slot days were picked (2026-10-23):
  - Weekends/Wednesdays, Dec-Mar (winter) and Jun-Aug (summer), 2022-12 to
    2026-09, skipping +/-3 days around MLK, Presidents', Memorial, July 4,
    Labor Day, Thanksgiving, and Dec 20 - Jan 4.
  - "Clear" = PRCP 0.00 at all three weather stations on D-1, D and D+1.
  - "Snowy" = >= 3" new snow at Dillon or Georgetown in D's or D+1's report.
  - Then dropped any day with a missing counter (2023-01-28: no Tunnel WB;
    2023-07-15: no Genesee; 2026-03-07: no Copper) and preferred pairs with
    similar Tunnel totals within one season.

Usage:
    python scripts/generate_i70_traffic_data.py
    python scripts/generate_i70_traffic_data.py --skip-download  # reuse cache

Output:
    File: public/data/i70-traffic/days.json
"""

import argparse
import datetime as dt
import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "i70_traffic" / "raw"
OUT_PATH = ROOT / "public" / "data" / "i70-traffic" / "days.json"

OTIS_BASE = "https://dtdapps.codot.gov/otis/API/TRANSYS"
NOAA_URL = (
    "https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries"
    "&stations={station}&startDate={start}&endDate={end}"
    "&dataTypes=SNOW,PRCP,SNWD&units=standard&format=json"
)

# Days to compare. Add a day by adding a line; slot is free text the page
# shows as a group, "anchor" for the two reference days.
DAYS = [
    {
        "date": "2023-02-04",
        "label": "Winter Sat, clear",
        "slot": "winter-sat-clear",
        "note": "Dry at Dillon, Georgetown and Loveland Basin Fri-Sun (PRCP 0.00 all three days). Same season as the snowy Saturday, similar Tunnel totals.",
    },
    {
        "date": "2023-03-11",
        "label": "Winter Sat, snowy",
        "slot": "winter-sat-snowy",
        "note": "Dillon 1 E reported 4.0\" new snow Sat morning and 3.0\" more Sun morning (so snow fell during Saturday too); Georgetown 3.0\" Sat; Loveland Basin snow depth 57\" -> 63\". Mid-March, so possibly spring-break traffic.",
    },
    {
        "date": "2023-03-08",
        "label": "Winter Wed, clear",
        "slot": "winter-wed-clear",
        "note": "Dry at all three weather stations Tue-Thu. Same week as the snowy Saturday.",
    },
    {
        "date": "2023-07-29",
        "label": "Summer Sat, clear",
        "slot": "summer-sat-clear",
        "note": "Dry at all three weather stations Fri-Sun. (2023-07-15 was the first pick but Genesee has no data that day.)",
    },
    {
        "date": "2023-08-09",
        "label": "Summer Wed, clear",
        "slot": "summer-wed-clear",
        "note": "Dry at all three weather stations Tue-Thu.",
    },
    {
        "date": "2020-04-12",
        "label": "COVID lockdown Sun",
        "slot": "anchor",
        "note": "Easter Sunday under Colorado's stay-at-home order. Certain free flow: Tunnel EB total only 3.6k.",
    },
    {
        "date": "2020-01-05",
        "label": "End of New Year's weekend",
        "slot": "anchor",
        "note": "Sunday after the record New Year's ski weekend. Probably jammed: Twin Tunnels EB flat at ~3,800/hr from 11am to 6pm.",
    },
    # Alternate snowy/clear pair, not in v1: adjacent Saturdays, but snow
    # halved the volume (Tunnel WB 9.8k vs 20.2k), so it's mostly a
    # "people stayed home" comparison rather than a shape one.
    # {"date": "2025-12-06", "label": "Early-winter Sat, snowy", "slot": "winter-sat-snowy",
    #  "note": "Dillon 5.5\" Sat report + 3.5\" Sun report; Georgetown 1.7\" + 5.2\"."},
    # {"date": "2025-12-13", "label": "Early-winter Sat, clear", "slot": "winter-sat-clear",
    #  "note": "Dry at all three weather stations Fri-Sun."},
]

# West -> east. "mp" is where the counter is drawn on the road strip, a point
# inside the station's segment (begRef-endRef from the stations endpoint).
STATIONS = [
    {"id": "000119", "name": "Copper Mountain", "mp": 195.0},
    {"id": "000106", "name": "Eisenhower Tunnel", "mp": 213.5},
    {"id": "000120", "name": "Twin Tunnels", "mp": 242.0},
    {"id": "000107", "name": "Genesee", "mp": 255.0},
]

WEATHER_STATIONS = [
    {"id": "USC00052281", "name": "Dillon 1 E"},
    {"id": "USC00053261", "name": "Georgetown"},
    {"id": "USS0005K05S", "name": "Loveland Basin (SNOTEL)"},
]


def fetch_json(url: str, cache: Path, skip_download: bool):
    if cache.exists():
        return json.loads(cache.read_text())
    if skip_download:
        raise SystemExit(f"--skip-download but no cache at {cache}")
    with urllib.request.urlopen(url, timeout=60) as r:
        text = r.read().decode()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(text)
    time.sleep(0.3)
    return json.loads(text)


def fetch_stations(skip_download: bool) -> dict:
    url = f"{OTIS_BASE}/GetTrafficStationsByRouteRefs/070A/175/260/false/true.json"
    rows = fetch_json(url, RAW_DIR / "stations.json", skip_download)
    return {r["stationId"]: r for r in rows}


def fetch_hourly(station: str, date: str, skip_download: bool):
    y, m, d = (int(x) for x in date.split("-"))
    url = f"{OTIS_BASE}/GetDailyTrafficVolumeForStationByDay/{station}/true/{y}-{m}-{d}.json"
    return fetch_json(url, RAW_DIR / f"{station}_{date}.json", skip_download)


def parse_dir(rows, code: str):
    """24 ints (None per missing hour), or None if the direction is absent."""
    for r in rows:
        if r.get("dir") == code:
            out = []
            for h in range(24):
                v = r.get(f"h{h}")
                out.append(None if v in (None, "") else int(str(v).replace(",", "")))
            return out
    return None


def fetch_weather(skip_download: bool) -> dict:
    """{station_id: {date: {SNOW, PRCP, SNWD}}} covering every DAYS entry +/-1."""
    dates = [dt.date.fromisoformat(d["date"]) for d in DAYS]
    start = (min(dates) - dt.timedelta(days=1)).isoformat()
    end = (max(dates) + dt.timedelta(days=1)).isoformat()
    out = {}
    for ws in WEATHER_STATIONS:
        url = NOAA_URL.format(station=ws["id"], start=start, end=end)
        rows = fetch_json(url, RAW_DIR / f"noaa_{ws['id']}_{start}_{end}.json", skip_download)
        out[ws["id"]] = {
            r["DATE"]: {k: (float(r[k]) if r.get(k) not in (None, "") else None) for k in ("SNOW", "PRCP", "SNWD")}
            for r in rows
        }
    return out


def weather_for(day: str, weather: dict) -> list:
    d0 = dt.date.fromisoformat(day)
    out = []
    for ws in WEATHER_STATIONS:
        for off in (-1, 0, 1):
            d = (d0 + dt.timedelta(days=off)).isoformat()
            rec = weather[ws["id"]].get(d, {})
            out.append({"station": ws["name"], "date": d, **{k.lower(): rec.get(k) for k in ("SNOW", "PRCP", "SNWD")}})
    return out


def fmt_total(series):
    if series is None:
        return "    none"
    if any(v is None for v in series):
        return f"{sum(v for v in series if v is not None):>6}*"
    return f"{sum(series):>7}"


def peak(series):
    if series is None or all(v is None for v in series):
        return "  -"
    h = max(range(24), key=lambda i: series[i] if series[i] is not None else -1)
    return f"{h:>3}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-download", action="store_true", help="reuse data/i70_traffic/raw/ cache")
    args = ap.parse_args()

    meta = fetch_stations(args.skip_download)
    stations = []
    for s in STATIONS:
        m = meta[s["id"]]
        assert m["begRef"] <= s["mp"] <= m["endRef"], f"{s['id']} mp {s['mp']} outside {m['begRef']}-{m['endRef']}"
        stations.append({**s, "desc": m["desc"], "segment": [m["begRef"], m["endRef"]]})

    weather = fetch_weather(args.skip_download)

    days = []
    for d in DAYS:
        counts = {}
        for s in STATIONS:
            rows = fetch_hourly(s["id"], d["date"], args.skip_download)
            counts[s["id"]] = {"eb": parse_dir(rows, "P"), "wb": parse_dir(rows, "S")}
        days.append({
            "date": d["date"],
            "weekday": dt.date.fromisoformat(d["date"]).strftime("%a"),
            "label": d["label"],
            "slot": d["slot"],
            "note": d["note"],
            "weather": weather_for(d["date"], weather),
            "counts": counts,
        })

    out = {
        "generated": dt.date.today().isoformat(),
        "source": "CDOT OTIS Traffic Data Explorer (dtdapps.codot.gov/otis), continuous counters, hourly volume by direction; weather from NOAA NCEI GHCN-Daily",
        "stations": stations,
        "weatherStations": WEATHER_STATIONS,
        "days": days,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT_PATH.relative_to(ROOT)} ({OUT_PATH.stat().st_size / 1024:.1f} KB)\n")

    # Sanity table: daily total and peak hour per station x direction.
    # * = total over the hours present (some hours missing).
    print(f"{'date':<10} {'day':<3}  {'station':<17} {'WB total':>8} {'pk':>3}  {'EB total':>8} {'pk':>3}")
    for d in days:
        for s in STATIONS:
            c = d["counts"][s["id"]]
            print(f"{d['date']:<10} {d['weekday']:<3}  {s['name']:<17} {fmt_total(c['wb']):>8} {peak(c['wb'])}  {fmt_total(c['eb']):>8} {peak(c['eb'])}")
        print()


if __name__ == "__main__":
    main()
