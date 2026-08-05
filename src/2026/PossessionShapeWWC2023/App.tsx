import { useMemo, useState } from "react";
import { useData } from "./useData";
import PitchChart from "../PassingCompass/PitchChart";
import type { PitchSlot } from "../PassingCompass/PitchChart";
import { ROSTER_BY_TEAM } from "./roster";
import { WWC2023_FINAL_PHOTO_CREDITS } from "./photoCredits";
import "../PassingCompass/App.css";
import "./App.css";

const PITCH_LENGTH = 120;

// Short display names — StatsBomb's team names carry a "Women's" suffix
// (e.g. "Spain Women's") that reads awkwardly in buttons/captions.
const TEAM_SHORT: Record<string, string> = {
  "Spain Women's": "Spain",
  "England Women's": "England",
};

// Kit colors actually worn in this final: Spain in their red home kit,
// England in their blue away kit (avoiding a clash with Spain's home shorts
// — see match reports). Solid fills, so both are easy to tell apart at a
// glance without needing a second color encoding for phase (see [[project
// -possession-shape]] v6 rationale, same as the 2022 final page).
const TEAM_FILL: Record<string, string> = {
  "Spain Women's": "#e0303d",
  "England Women's": "#2a5db0",
};
const TEAM_TEXT: Record<string, string> = {
  "Spain Women's": "#ffffff",
  "England Women's": "#ffffff",
};
// A thin cutout in the page's own background color, not a second team ring —
// just enough to separate overlapping dots.
const DOT_OUTLINE = "var(--page)";

export default function App() {
  const data = useData();
  const [possessionTeam, setPossessionTeam] = useState<string>("Spain Women's");

  // Every team's own recorded x is normalized to "their attacking direction
  // is +x" — so on a single shared pitch, only one team's coordinates can be
  // plotted as-is. The other team's x is mirrored (120 - x) to land in that
  // same shared frame; y needs no mirroring (see project memory).
  const referenceTeam = data?.teams[0];

  const slots: PitchSlot[] = useMemo(() => {
    if (!data || !referenceTeam) return [];
    const slotsOut: PitchSlot[] = [];
    data.teams.forEach((team) => {
      const roster = ROSTER_BY_TEAM[team] ?? [];
      const byName = new Map(data.players.filter((p) => p.team === team).map((p) => [p.fullName, p]));
      const phase = team === possessionTeam ? "offense" : "defense";
      const mirror = team !== referenceTeam;
      roster.forEach((player) => {
        const record = byName.get(player.fullName);
        const sample = record?.[phase];
        if (!record || !sample) return;
        slotsOut.push({
          id: `${team}:${player.fullName}`,
          x: mirror ? PITCH_LENGTH - sample.x : sample.x,
          y: sample.y,
          label: String(player.number),
          hoverPhoto: player.photo,
          state: phase,
          color: DOT_OUTLINE,
          fill: TEAM_FILL[team],
          textColor: TEAM_TEXT[team],
          tooltip: [
            `${player.displayName} (${TEAM_SHORT[team]}) — ${record.position}`,
            phase === "offense" ? "On the ball" : "Without the ball",
            `${sample.n} touches averaged`,
          ],
        });
      });
    });
    return slotsOut;
  }, [data, possessionTeam, referenceTeam]);

  if (!data || !referenceTeam) return <div className="pc-loading">Loading match data…</div>;

  const otherTeam = data.teams.find((t) => t !== referenceTeam)!;

  return (
    <div className="pc-root ps-root">
      <header className="pc-header">
        <h1 className="pc-title">Possession Shape: 2023 Women's World Cup Final</h1>
        <p className="pc-subtitle">
          Spain vs. England — both starting XIs at once, each player at their
          average on-ball location. The team in possession is shown at its
          average <strong>offensive</strong> position; the other team at its
          average <strong>defensive</strong> position.
        </p>
      </header>

      <div className="pc-controls">
        <div className="pc-toggle">
          {data.teams.map((t) => (
            <button
              key={t}
              className={`pc-toggle-btn ${possessionTeam === t ? "active" : ""}`}
              onClick={() => setPossessionTeam(t)}
            >
              {TEAM_SHORT[t]} in possession
            </button>
          ))}
        </div>
      </div>

      <div className="ps-legend">
        {data.teams.map((t) => (
          <span className="ps-legend-item" key={t}>
            <span className="ps-legend-dot" style={{ background: TEAM_FILL[t] }} />
            {TEAM_SHORT[t]}
          </span>
        ))}
        <span className="ps-legend-item ps-legend-hint">tap or hover a circle for the player</span>
      </div>

      <div className="ps-rotate-prompt" role="status">
        <span className="ps-rotate-icon" aria-hidden="true">📱</span>
        <p>Rotate your device to landscape to see the pitch.</p>
      </div>

      <div className="ps-pitch-wrap">
        <PitchChart
          triangles={[]}
          slots={slots}
          interactive={false}
          slotRadius={3.3}
          endLabels={[`${TEAM_SHORT[otherTeam]}'s goal`, `${TEAM_SHORT[referenceTeam]}'s goal`]}
          orientation="landscape"
        />
      </div>

      <div className="ps-commentary">
        <p>
          Spain had the ball far more than England — roughly a third more
          tracked touches over the match — and it shows in how much each
          team's shape has to reshuffle between phases. Spain's average
          offense-to-defense swing (about 21 meters per player) is
          noticeably bigger than England's (about 15 meters). Right-back Ona
          Batlle covers the most ground of anyone in the match, some 38
          meters between where she sits on the ball and where she recovers
          to defend — just ahead of Aitana Bonmatí at 36.
        </p>
        <p>
          The two teams' wide players on the same flank effectively marked
          each other all match: Batlle's average advanced position sits
          just 5 meters from where England's Lucy Bronze recovers to on
          defense. On the other side, Lauren Hemp's average attacking spot
          is almost dead center rather than out near the touchline — only
          2 meters from where Spain center-back Irene Paredes sits on
          defense, a sign of how often Hemp cut inside rather than hugging
          the wing.
        </p>
      </div>

      <p className="ps-caveat">
        Defensive averages come from far fewer touches per player than
        offensive ones, especially for attacking players (hover a circle to
        see the count) — treat a forward's defensive position as noisier
        than a defender's.
      </p>

      <p className="ps-footnote">
        Data: <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noopener noreferrer">StatsBomb open data</a>,
        {" "}2023 Women's World Cup Final, Spain vs. England.
      </p>

      <details className="ps-credits">
        <summary>Photo credits</summary>
        <ul>
          {WWC2023_FINAL_PHOTO_CREDITS.map((c) => (
            <li key={c.fullName}>
              {c.fullName}: photo by{" "}
              <a href={c.photographerUrl} target="_blank" rel="noopener noreferrer">{c.photographer}</a>
              {" "}(<a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">source</a>), licensed{" "}
              <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">{c.license}</a>, via Wikimedia Commons.
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
