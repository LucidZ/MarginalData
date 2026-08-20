import { useMemo, useState } from "react";
import { useData } from "./useData";
import PitchChart from "../PassingCompass/PitchChart";
import type { PitchSlot } from "../PassingCompass/PitchChart";
import { ROSTER_BY_TEAM } from "./roster";
import { POSSESSION_SHAPE_PHOTO_CREDITS } from "./photoCredits";
import "../PassingCompass/App.css";
import "./App.css";

const PITCH_LENGTH = 120;

// Photos made 22 avatars busy enough to obscure the actual shape being
// plotted, so both teams are now plain solid-color dots (kit colors, always
// on — with solid fills, unlike thin rings, two different hues are easy to
// tell apart at a glance, so there's no need to mute the defending team's
// color the way an earlier version did). The real photo swaps in to fill
// the circle on hover/tap instead of living in a separate tooltip.
const TEAM_FILL: Record<string, string> = {
  Argentina: "#9ecbf5",
  France: "#0f3b8c",
};
// Each fill needs its own contrasting label color — Argentina's light blue
// needs a dark number, France's navy needs a light one.
const TEAM_TEXT: Record<string, string> = {
  Argentina: "#0b2f52",
  France: "#ffffff",
};
// A thin cutout in the page's own background color, not a second team ring —
// just enough to separate overlapping dots.
const DOT_OUTLINE = "var(--page)";

export default function App() {
  const { data, error } = useData();
  const [possessionTeam, setPossessionTeam] = useState<string>("Argentina");

  // Every team's own recorded x is normalized to "their attacking direction
  // is +x" (see project memory) — so on a single shared pitch, only one
  // team's coordinates can be plotted as-is. The other team's x is mirrored
  // (120 - x) to land in that same shared frame; y needs no mirroring (both
  // teams' right-backs land at high y, left-backs at low y — confirmed
  // empirically, so y is already a shared, non-egocentric axis).
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
            `${player.displayName} (${team}) — ${record.position}`,
            phase === "offense" ? "On the ball" : "Without the ball",
            `${sample.n} touches averaged`,
          ],
        });
      });
    });
    return slotsOut;
  }, [data, possessionTeam, referenceTeam]);

  if (error) return <div className="pc-loading">Couldn&apos;t load match data: {error.message}</div>;
  if (!data || !referenceTeam) return <div className="pc-loading">Loading match data…</div>;

  const otherTeam = data.teams.find((t) => t !== referenceTeam)!;

  return (
    <div className="pc-root ps-root">
      <header className="pc-header">
        <h1 className="pc-title">Possession Shape</h1>
        <p className="pc-subtitle">
          2022 World Cup Final — both starting XIs at once, each player at their
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
              {t} in possession
            </button>
          ))}
        </div>
      </div>

      <div className="ps-legend">
        {data.teams.map((t) => (
          <span className="ps-legend-item" key={t}>
            <span className="ps-legend-dot" style={{ background: TEAM_FILL[t] }} />
            {t}
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
          endLabels={[`${otherTeam}'s goal`, `${referenceTeam}'s goal`]}
          orientation="landscape"
        />
      </div>

      <div className="ps-commentary">
        <p>
          One flank is far more dynamic than the other. Di María and Theo Hernández
          post the two biggest offense-to-defense swings of any outfield player in
          the match — each averaging roughly 45 meters between where they sit on the
          ball and where they sit defending, more than double their counterparts on
          the opposite side of the pitch.
        </p>
        <p>
          Even as a whole-match average, we can see how the two most dangerous attackers 
          clearly draw several defenders. Both Messi and Mbappé sit relatively isolated when their
          team doesn't have posession, but draw 2-3 defenders when they do.
        </p>
      </div>

      <p className="ps-caveat">
        Defensive averages come from far fewer touches per player than offensive
        ones, especially for attacking players (hover a circle to see the
        count) — treat a forward's defensive position as noisier than a
        defender's.
      </p>

      <p className="ps-footnote">
        Data: <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noopener noreferrer">StatsBomb open data</a>,
        {" "}2022 World Cup Final, Argentina vs. France.
      </p>

      <details className="ps-credits">
        <summary>Photo credits</summary>
        <ul>
          {POSSESSION_SHAPE_PHOTO_CREDITS.map((c) => (
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
