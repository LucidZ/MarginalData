import { useState, useRef, useEffect, useMemo } from "react";
import { scaleLinear } from "d3";

interface Point {
  dem: number; // 0-1
  rep: number; // 0-1
  una: number; // 0-1
}

interface TranslatorDimensions {
  width: number;
  height: number;
}

const GOLD = "#d4a800";
const WHITE = "#ffffff";

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function ternCoords(dem: number, rep: number, una: number, W: number, H: number) {
  const tot = dem + rep + una;
  const r = rep / tot;
  const u = una / tot;
  return { x: (r + u / 2) * W, y: (1 - u) * H };
}

function demRepUnaFromTernCoords(
  x: number,
  y: number,
  W: number,
  H: number
): { dem: number; rep: number; una: number } | null {
  const u = 1 - y / H;
  if (u < 0 || u > 1) return null;

  const r = x / W - u / 2;
  if (r < 0 || r > 1) return null;

  const dem = 1 - r - u;
  if (dem < 0 || dem > 1) return null;

  return { dem, rep: r, una: u };
}

function demRepUnaFromCartesian(
  x: number,
  y: number,
  W: number,
  H: number
): { dem: number; rep: number; una: number } | null {
  const xScale = scaleLinear().domain([1, 0]).range([0, W]);
  const yScale = scaleLinear().domain([0, 1]).range([H, 0]);

  const pctDemOfMajor = xScale.invert(x);
  const pctMinor = yScale.invert(y);

  if (pctDemOfMajor < 0 || pctDemOfMajor > 1) return null;
  if (pctMinor < 0 || pctMinor > 1) return null;

  const majorTotal = 1 - pctMinor;
  const dem = pctDemOfMajor * majorTotal;
  const rep = (1 - pctDemOfMajor) * majorTotal;
  const una = pctMinor;

  return { dem, rep, una };
}

export default function TernaryCartesianTranslator() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<TranslatorDimensions>({
    width: 800,
    height: 400,
  });

  const initialPoints = useMemo(() => {
    // Gold point: R 80%, 70% unaffiliated
    const goldMajorTotal = 1 - 0.7;
    const gold: Point = {
      dem: 0.2 * goldMajorTotal, // 20% D of major party
      rep: 0.8 * goldMajorTotal, // 80% R of major party
      una: 0.7,
    };

    // White point: R 60%, 20% unaffiliated
    const whiteMajorTotal = 1 - 0.2;
    const white: Point = {
      dem: 0.4 * whiteMajorTotal, // 40% D of major party
      rep: 0.6 * whiteMajorTotal, // 60% R of major party
      una: 0.2,
    };

    return { gold, white };
  }, []);

  const [points, setPoints] = useState<{ gold: Point; white: Point }>(initialPoints);
  const [dragging, setDragging] = useState<"gold" | "white" | "line" | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const el = entries[0];
      if (el) {
        const w = Math.min(el.contentRect.width, 1000);
        const h = w * 0.5;
        setDimensions({ width: w, height: h });
      }
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const chartWidth = dimensions.width / 2 - 20;
  const chartHeight = dimensions.height - 60;
  const margin = { top: 30, right: 20, bottom: 40, left: 50 };
  const innerWidth = chartWidth - margin.left - margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;

  const ternMargin = { top: 30, right: 20, bottom: 40, left: 20 };
  const triW = chartWidth - ternMargin.left - ternMargin.right;
  const triH = (triW * Math.sqrt(3)) / 2;

  const xScale = scaleLinear().domain([1, 0]).range([0, innerWidth]);
  const yScale = scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  const handleMouseDown = (pointKey: "gold" | "white") => (e: React.MouseEvent<SVGCircleElement>) => {
    setDragging(pointKey);
  };

  const handleLineMouseDown = (e: React.MouseEvent<SVGLineElement>) => {
    setDragging("line");
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  useEffect(() => {
    if (!dragging || !svgRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (dragging === "line" && dragStart) {
        const deltaX = x - dragStart.x;
        const deltaY = y - dragStart.y;

        setPoints((prev) => {
          const prevGoldTern = ternCoords(prev.gold.dem, prev.gold.rep, prev.gold.una, triW, triH);
          const prevWhiteTern = ternCoords(prev.white.dem, prev.white.rep, prev.white.una, triW, triH);
          const prevGoldCartX = xScale(prev.gold.dem / (prev.gold.dem + prev.gold.rep));
          const prevGoldCartY = yScale(prev.gold.una);
          const prevWhiteCartX = xScale(prev.white.dem / (prev.white.dem + prev.white.rep));
          const prevWhiteCartY = yScale(prev.white.una);

          let newGold = prev.gold;
          let newWhite = prev.white;

          const isLeftChart = dragStart.x < dimensions.width / 2;

          if (isLeftChart) {
            const goldTernX = prevGoldTern.x + deltaX;
            const goldTernY = prevGoldTern.y + deltaY;
            const whiteTernX = prevWhiteTern.x + deltaX;
            const whiteTernY = prevWhiteTern.y + deltaY;

            const goldResult = demRepUnaFromTernCoords(goldTernX, goldTernY, triW, triH);
            const whiteResult = demRepUnaFromTernCoords(whiteTernX, whiteTernY, triW, triH);

            if (goldResult && whiteResult) {
              newGold = goldResult;
              newWhite = whiteResult;
              setDragStart({ x, y });
            }
          } else {
            const goldCartX = prevGoldCartX + deltaX;
            const goldCartY = prevGoldCartY + deltaY;
            const whiteCartX = prevWhiteCartX + deltaX;
            const whiteCartY = prevWhiteCartY + deltaY;

            const goldResult = demRepUnaFromCartesian(goldCartX, goldCartY, innerWidth, innerHeight);
            const whiteResult = demRepUnaFromCartesian(whiteCartX, whiteCartY, innerWidth, innerHeight);

            if (goldResult && whiteResult) {
              newGold = goldResult;
              newWhite = whiteResult;
              setDragStart({ x, y });
            }
          }

          return { gold: newGold, white: newWhite };
        });
      } else {
        const isLeftChart = x < dimensions.width / 2;

        if (isLeftChart) {
          const chartX = x - ternMargin.left;
          const chartY = y - ternMargin.top;

          const result = demRepUnaFromTernCoords(chartX, chartY, triW, triH);
          if (result) {
            setPoints((prev) => ({
              ...prev,
              [dragging]: { dem: result.dem, rep: result.rep, una: result.una },
            }));
          }
        } else {
          const chartX = x - (dimensions.width / 2 + margin.left);
          const chartY = y - margin.top;

          const result = demRepUnaFromCartesian(chartX, chartY, innerWidth, innerHeight);
          if (result) {
            setPoints((prev) => ({
              ...prev,
              [dragging]: { dem: result.dem, rep: result.rep, una: result.una },
            }));
          }
        }
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
      setDragStart(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, dragStart, dimensions.width, ternMargin, triW, triH, margin, innerWidth, innerHeight]);

  const goldTernCoords = ternCoords(
    points.gold.dem,
    points.gold.rep,
    points.gold.una,
    triW,
    triH
  );
  const whiteTernCoords = ternCoords(
    points.white.dem,
    points.white.rep,
    points.white.una,
    triW,
    triH
  );

  const goldCartesianX = xScale(points.gold.dem / (points.gold.dem + points.gold.rep));
  const goldCartesianY = yScale(points.gold.una);
  const whiteCartesianX = xScale(points.white.dem / (points.white.dem + points.white.rep));
  const whiteCartesianY = yScale(points.white.una);

  const xTicks = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0];
  const yTicks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

  function xTickLabel(t: number): string {
    if (t === 0.5) return "Even";
    if (t === 0) return "100% R";
    if (t === 1) return "100% D";
    if (t > 0.5) return `D ${Math.round(t * 100)}%`;
    return `R ${Math.round((1 - t) * 100)}%`;
  }

  return (
    <div className="va-translator-section">
      <h2 className="va-translator-title">Ternary : Cartesian Translator</h2>
      <p className="va-translator-desc">
        Grab and move either point or the line connecting them to see how it translates between coordinate systems.
      </p>

      <div className="va-translator-container" ref={containerRef}>
        <svg width={dimensions.width} height={dimensions.height} ref={svgRef}>
          {/* Left: Ternary Chart */}
          <g transform={`translate(${ternMargin.left},${ternMargin.top})`}>
            <path
              d={`M ${triW / 2} 0 L ${triW} ${triH} L 0 ${triH} Z`}
              fill="none"
              stroke="#ccc"
              strokeWidth={1.5}
            />

            {/* 50/50 center reference triangle */}
            <path
              d={`M ${triW / 4} ${triH / 2} L ${(3 * triW) / 4} ${triH / 2} L ${triW / 2} ${triH} Z`}
              fill="none"
              stroke="#ccc"
              strokeWidth={1.5}
            />

            <text
              x={triW / 4 - 10}
              y={triH - 20}
              textAnchor="end"
              className="va-tern-edge-label va-tern-edge-label-dem"
            >
              ← 100% D
            </text>
            <text
              x={triW - 8}
              y={triH + 18}
              textAnchor="end"
              className="va-tern-edge-label va-tern-edge-label-rep"
            >
              100% R →
            </text>
            <text
              x={triW / 2 + 20}
              y={-8}
              textAnchor="start"
              className="va-tern-edge-label va-tern-edge-label-una"
            >
              ↑ 100% U
            </text>

            <line
              x1={goldTernCoords.x}
              y1={goldTernCoords.y}
              x2={whiteTernCoords.x}
              y2={whiteTernCoords.y}
              stroke="#aaa"
              strokeWidth={2}
              cursor="grab"
              onMouseDown={handleLineMouseDown}
              style={{ pointerEvents: "auto" }}
              opacity={0.6}
            />

            <circle
              cx={goldTernCoords.x}
              cy={goldTernCoords.y}
              r={7}
              fill={GOLD}
              stroke="#333"
              strokeWidth={2}
              cursor="grab"
              onMouseDown={handleMouseDown("gold")}
              style={{ pointerEvents: "auto" }}
            />
            <circle
              cx={whiteTernCoords.x}
              cy={whiteTernCoords.y}
              r={7}
              fill={WHITE}
              stroke="#333"
              strokeWidth={2}
              cursor="grab"
              onMouseDown={handleMouseDown("white")}
              style={{ pointerEvents: "auto" }}
            />
          </g>

          {/* Right: Cartesian Chart */}
          <g transform={`translate(${dimensions.width / 2 + margin.left},${margin.top})`}>
            {yTicks.map((t) => (
              <line
                key={`y-${t}`}
                x1={0}
                x2={innerWidth}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke="#e8e8e8"
                strokeWidth={1}
              />
            ))}
            {xTicks.map((t) => (
              <line
                key={`x-${t}`}
                x1={xScale(t)}
                x2={xScale(t)}
                y1={0}
                y2={innerHeight}
                stroke="#e8e8e8"
                strokeWidth={1}
              />
            ))}

            <line
              x1={xScale(0.5)}
              x2={xScale(0.5)}
              y1={0}
              y2={innerHeight}
              stroke="#ccc"
              strokeWidth={1.5}
              strokeDasharray="4,3"
            />

            <line
              x1={goldCartesianX}
              y1={goldCartesianY}
              x2={whiteCartesianX}
              y2={whiteCartesianY}
              stroke="#aaa"
              strokeWidth={2}
              cursor="grab"
              onMouseDown={handleLineMouseDown}
              style={{ pointerEvents: "auto" }}
              opacity={0.6}
            />

            <circle
              cx={goldCartesianX}
              cy={goldCartesianY}
              r={7}
              fill={GOLD}
              stroke="#333"
              strokeWidth={2}
              cursor="grab"
              onMouseDown={handleMouseDown("gold")}
              style={{ pointerEvents: "auto" }}
            />
            <circle
              cx={whiteCartesianX}
              cy={whiteCartesianY}
              r={7}
              fill={WHITE}
              stroke="#333"
              strokeWidth={2}
              cursor="grab"
              onMouseDown={handleMouseDown("white")}
              style={{ pointerEvents: "auto" }}
            />

            <g transform={`translate(0,${innerHeight})`}>
              <line x1={0} x2={innerWidth} stroke="#aaa" />
              {xTicks.map((t) => (
                <g key={t} transform={`translate(${xScale(t)},0)`}>
                  <line y2={5} stroke="#aaa" />
                  <text
                    y={18}
                    textAnchor="middle"
                    className="va-tick-label"
                    fontSize="10"
                  >
                    {xTickLabel(t)}
                  </text>
                </g>
              ))}
            </g>

            <g>
              <line y1={0} y2={innerHeight} stroke="#aaa" />
              {yTicks.map((t) => (
                <g key={t} transform={`translate(0,${yScale(t)})`}>
                  <line x2={-5} stroke="#aaa" />
                  <text
                    x={-8}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="va-tick-label"
                    fontSize="10"
                  >
                    {`${Math.round(t * 100)}%`}
                  </text>
                </g>
              ))}
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
