// The guided tour: credits, then one card per BikeNetKit method with how it decides, then one ride
// with the plan built. App.tsx sets the map for each step (`TOUR` order); this renders the card.
import { useEffect, type ReactNode } from "react";
import type { FixProps, NetworkData } from "./types";
import type { RouteResult } from "./routing";
import { toolFeatures } from "./networkLayers";
import { EXAMPLES, offRoad } from "./RoutePanel";
import { fmtLen, fmtMi, toolName } from "./style";

export const TOUR = ["credits", "today", "extend", "fix", "link", "agree", "ride"] as const;
export type TourStep = (typeof TOUR)[number];
export const TOUR_MI = 19; // Extend's build order shown in the tour (the page default)
export const TOUR_RIDE = 1; // EXAMPLES index: North Boulder -> CU campus

interface Paper {
  authors: string;
  title: string;
  venue: string;
  doi: string;
  tool: string;
}

const PAPERS: Partial<Record<TourStep, Paper>> = {
  extend: {
    authors: "Szell, Mimar, Perlman, Ghoshal & Sinatra",
    title: "Growing urban bicycle networks",
    venue: "Scientific Reports, 2022",
    doi: "10.1038/s41598-022-10783-y",
    tool: "GrowBikeNet",
  },
  fix: {
    authors: "Vybornova, Cunha, Gühnemann & Szell",
    title: "Automated detection of missing links in bicycle networks",
    venue: "Geographical Analysis, 2023",
    doi: "10.1111/gean.12324",
    tool: "FixBikeNet",
  },
  link: {
    authors: "Natera Orozco, Battiston, Iñiguez & Szell",
    title: "Data-driven strategies for optimal bicycle network growth",
    venue: "Royal Society Open Science, 2020",
    doi: "10.1098/rsos.201130",
    tool: "LinkBikeNet",
  },
};

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
const pct = (x: number, of: number) => `${Math.round((100 * x) / of)}%`;
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

interface Props {
  step: number;
  go: (i: number) => void;
  skip: () => void;
  finish: () => void;
  data: NetworkData;
  ride: { today: RouteResult | null; plan: RouteResult | null; loading: boolean };
}

export default function Tour({ step, go, skip, finish, data, ride }: Props) {
  const id = TOUR[step];
  const last = step === TOUR.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      if (e.key === "Escape") skip();
      else if (e.key === "ArrowRight" && !last) go(step + 1);
      else if (e.key === "ArrowLeft" && step > 0) go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, last, go, skip]);

  const feats = (t: "grow_existing" | "fix" | "link" | "agree") => toolFeatures(data, "bike", t);
  let title = "";
  let ask = "";
  let body: ReactNode = null;
  switch (id) {
    case "credits":
      title = "Built on BikeNetKit";
      body = (
        <>
          <p>
            The recommendations on this map come from{" "}
            <a href="https://bikenetkit.org" {...ext}>BikeNetKit</a>: free, open-source tools for planning bike networks, built at
            the Networks, Data and Society (NERDS) group at the IT University of Copenhagen by Michael Szell (lead), Carlson M.
            Büth, Manuel Knepper, Mariana Pessoa, Clément Sebastiao and Anastassia Vybornova.
          </p>
          <p>
            Each tool turns a published research method into software anyone can run on their own city. This tour runs three of
            them on Boulder and shows how each one decides.
          </p>
        </>
      );
      break;
    case "today":
      title = "Boulder today";
      body = (
        <>
          <p>
            The blue lines are Boulder's protected bike network: {fmtMi(data.protected_m.bike)} mi of off-street paths and
            separated tracks, as mapped in OpenStreetMap. Painted lanes and quiet streets don't count.
          </p>
          <p>Each tool asks a different question about where protection is missing.</p>
          <p className="bbn-muted bbn-small">
            Their answers are suggestions computed from map data, not plans by the city or by BikeNetKit.
          </p>
        </>
      );
      break;
    case "extend": {
      const f = feats("grow_existing");
      title = "1. Extend today's network";
      ask = "Where should the next mile go?";
      body = (
        <>
          <p>
            GrowBikeNet scatters points about a mile apart across the city, plus points every half mile along today's paths. It
            joins neighboring points into a mesh and routes each link on real streets, using existing paths where it can.
          </p>
          <p>
            Then it ranks the links by how many of the shortest trips between all the points would use each one. The busiest
            links get built first: here {list(f.slice(0, 3).map(toolName))}.
          </p>
          <p className="bbn-muted bbn-small">The map shows the first {TOUR_MI} mi of that build order.</p>
        </>
      );
      break;
    }
    case "fix": {
      const g = feats("fix")[0] as FixProps | undefined;
      title = "2. Close the worst gaps";
      ask = "Which gaps should we close first?";
      body = (
        <>
          <p>
            FixBikeNet looks for spots where protected paths come within half a mile of each other but the street between them
            has no protection at all.
          </p>
          <p>
            To rank those gaps, it simulates short rides, up to about 1.5 miles from 300 random starting spots, where an
            unprotected street counts as 1.5× its length. The gaps with the most of that riding through them come first.
          </p>
          {g && <p>Top of the list: {toolName(g)}, a {fmtLen(g.length)} gap. The card on the map opens it in Street View.</p>}
        </>
      );
      break;
    }
    case "link": {
      const f = feats("link") as { link_length: number; share_after: number }[];
      const k = f.findIndex((p) => p.share_after >= 80);
      const km = f.slice(0, k + 1).reduce((m, p) => m + p.link_length, 0);
      title = "3. Connect isolated pieces";
      ask = "How do we join up the pieces?";
      body = (
        <>
          <p>
            Boulder's protected paths aren't one network. They come in many separate pieces, from long greenways to short stubs.
          </p>
          <p>
            LinkBikeNet takes the biggest piece and the second-biggest and adds the shortest street connection between them. Then
            it repeats, joining the next-biggest piece each time, until everything connects.
          </p>
          {f[0] && k >= 0 && (
            <p>
              After the first link, {Math.round(f[0].share_after)}% of the paths form one network. {k + 1} links ({fmtMi(km)} mi)
              get it to 80%.
            </p>
          )}
        </>
      );
      break;
    }
    case "agree": {
      const f = feats("agree") as { n: number; length: number; streets: string }[];
      const all = f.filter((p) => p.n >= 3), two = f.length - all.length;
      const names = all.map((p) => p.streets).filter((s) => s !== "unnamed path");
      title = "Where the methods agree";
      body = (
        <>
          <p>
            Three tools, three different questions. Where they land on the same street, that's a strong candidate.
          </p>
          <p>
            All three pick {all.length} stretches ({fmtMi(all.reduce((m, p) => m + p.length, 0))} mi, dark green), including{" "}
            {list(names.slice(0, 4))}. Two of the three agree on {two} more.
          </p>
          <p className="bbn-muted bbn-small">This overlay is ours, not part of BikeNetKit.</p>
        </>
      );
      break;
    }
    case "ride": {
      const x = EXAMPLES[TOUR_RIDE];
      const { today: T, plan: R } = ride;
      title = "What it means for a ride";
      body = (
        <>
          <p>
            {x.a} to {x.b}, on the Balanced route style. The dashed black line is today's route; the solid one is the route with
            Extend's first {TOUR_MI} mi built, new path in green.
          </p>
          {T && R ? (
            <div className="bbn-delta">
              Off the road: {pct(offRoad(T), T.m)} today → <b>{pct(offRoad(R), R.m)}</b> with the plan
            </div>
          ) : (
            <div className="bbn-empty">{ride.loading ? "Loading Boulder's street network…" : "Couldn't route this ride."}</div>
          )}
          <p>Now try yours: pick any two places in Boulder, a route style, and any of the methods.</p>
        </>
      );
      break;
    }
  }
  const paper = PAPERS[id];

  return (
    <section className="bbn-tour" aria-label="Tour">
      <div className="bbn-tour-head">
        <span className="bbn-muted bbn-small">
          {step + 1} of {TOUR.length}
        </span>
        <button className="bbn-link bbn-small" onClick={skip}>Skip tour</button>
      </div>
      <h2>{title}</h2>
      {ask && <p className="bbn-tour-ask">{ask}</p>}
      {body}
      {paper && (
        <p className="bbn-muted bbn-small bbn-tour-cite">
          {paper.tool}, based on {paper.authors},{" "}
          <a href={`https://doi.org/${paper.doi}`} {...ext}>{paper.title}</a>, {paper.venue}.
        </p>
      )}
      {/* Stuck to the bottom of the panel, so Next stays in reach on a half-open phone sheet */}
      <div className="bbn-tour-nav">
        <button className="bbn-btn" onClick={() => go(step - 1)} disabled={step === 0}>Back</button>
        <div className="bbn-tour-dots" aria-hidden>
          {TOUR.map((s, i) => <i key={s} className={i === step ? "on" : ""} />)}
        </div>
        {last ? (
          <button className="bbn-btn bbn-btn-go" onClick={finish}>Plot your own route</button>
        ) : (
          <button className="bbn-btn bbn-btn-go" onClick={() => go(step + 1)}>Next</button>
        )}
      </div>
    </section>
  );
}
