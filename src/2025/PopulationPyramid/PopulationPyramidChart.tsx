import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { YearData, HighlightedCohort } from "./types";

interface PopulationPyramidChartProps {
  data: YearData[];
  currentYear: number;
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  highlightedCohorts: HighlightedCohort[];
  onCohortClick?: (birthYear: number) => void;
}

interface CohortData {
  birthYear: number;
  age: number;
  male: number;
  female: number;
}

export const PopulationPyramidChart = ({
  data,
  currentYear,
  width,
  height,
  margin,
  highlightedCohorts,
  onCohortClick,
}: PopulationPyramidChartProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const prevYearRef = useRef<number>(currentYear);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    const svg = d3.select(svgRef.current);

    // Find current year data
    const yearData = data.find((d) => d.year === currentYear);
    if (!yearData) return;

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Detect if we're moving forward or backward in time
    const isMovingForward = currentYear > prevYearRef.current;

    // Initialize main group if it doesn't exist
    let g = svg.select<SVGGElement>("g.main-group");
    if (g.empty()) {
      g = svg
        .append("g")
        .attr("class", "main-group")
        .attr("transform", `translate(${margin.left},${margin.top})`);
    }

    // Create clipping path to hide bars outside the chart area
    const clipPathId = "pyramid-clip";
    if (svg.select(`#${clipPathId}`).empty()) {
      svg
        .append("defs")
        .append("clipPath")
        .attr("id", clipPathId)
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", innerWidth)
        .attr("height", innerHeight);
    }

    // Update clip path dimensions
    svg
      .select(`#${clipPathId} rect`)
      .attr("width", innerWidth)
      .attr("height", innerHeight);

    // Apply clipping to the main group
    g.attr("clip-path", `url(#${clipPathId})`);

    // Transform data: instead of age groups, we have birth cohorts
    const cohortData: CohortData[] = yearData.ageGroups.map((ag) => ({
      birthYear: currentYear - ag.age,
      age: ag.age,
      male: ag.male,
      female: ag.female,
    }));

    // Scales - fixed across all years for consistent comparison
    const maxPopulation = d3.max(
      data.flatMap((d) =>
        d.ageGroups.flatMap((ag) => [ag.male, ag.female])
      )
    ) || 0;

    const xScale = d3
      .scaleLinear()
      .domain([0, maxPopulation])
      .range([0, innerWidth / 2 - 10]);

    // Y scale is based on AGE position (0 at bottom, 100 at top)
    const yScale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([innerHeight, 0]);

    const barHeight = innerHeight / 101; // 101 age groups (0-100)

    // Determine transition duration based on year change
    const yearDiff = Math.abs(currentYear - prevYearRef.current);
    const transitionDuration = yearDiff === 1 ? 500 : 800;
    prevYearRef.current = currentYear;

    // Helper function to get cohort color
    const getCohortColor = (birthYear: number, defaultColor: string) => {
      const cohort = highlightedCohorts.find((c) => c.birthYear === birthYear);
      return cohort ? cohort.color : defaultColor;
    };

    const hasCohort = (birthYear: number) => {
      return highlightedCohorts.some((c) => c.birthYear === birthYear);
    };

    // Male bars (left side) - keyed by BIRTH YEAR
    const maleBars = g
      .selectAll<SVGRectElement, CohortData>(".male-bar")
      .data(cohortData, (d) => String(d.birthYear));

    // Enter: new cohorts (from bottom if moving forward, from top if backward)
    const maleEnter = maleBars
      .enter()
      .append("rect")
      .attr("class", "male-bar")
      .attr("x", (d) => innerWidth / 2 - 10 - xScale(d.male))
      .attr("y", isMovingForward ? innerHeight + barHeight : -barHeight)
      .attr("width", (d) => xScale(d.male))
      .attr("height", barHeight * 0.9)
      .attr("opacity", 0.8);

    // Update: existing cohorts aging (moving up the pyramid)
    maleBars
      .merge(maleEnter)
      .transition()
      .duration(transitionDuration)
      .ease(d3.easeLinear)
      .attr("x", (d) => innerWidth / 2 - 10 - xScale(d.male))
      .attr("y", (d) => yScale(d.age)) // This makes bars move UP as cohorts age
      .attr("width", (d) => xScale(d.male))
      .attr("height", barHeight * 0.9)
      .attr("fill", (d) => getCohortColor(d.birthYear, "#4A90E2"))
      .attr("stroke", (d) => (hasCohort(d.birthYear) ? "#333" : "none"))
      .attr("stroke-width", (d) => (hasCohort(d.birthYear) ? 2 : 0))
      .attr("opacity", 0.8);

    // Apply click handlers
    g.selectAll(".male-bar")
      .style("cursor", onCohortClick ? "pointer" : "default")
      .on("click", function(_event: any, d: any) {
        if (onCohortClick) {
          onCohortClick(d.birthYear);
        }
      });

    // Exit: cohorts leaving (to top if moving forward, to bottom if backward)
    maleBars
      .exit()
      .transition()
      .duration(transitionDuration)
      .ease(d3.easeLinear)
      .attr("y", isMovingForward ? -barHeight : innerHeight + barHeight)
      .attr("opacity", 0.8)
      .remove();

    // Female bars (right side) - keyed by BIRTH YEAR
    const femaleBars = g
      .selectAll<SVGRectElement, CohortData>(".female-bar")
      .data(cohortData, (d) => String(d.birthYear));

    // Enter: new cohorts (from bottom if moving forward, from top if backward)
    const femaleEnter = femaleBars
      .enter()
      .append("rect")
      .attr("class", "female-bar")
      .attr("x", innerWidth / 2 + 10)
      .attr("y", isMovingForward ? innerHeight + barHeight : -barHeight)
      .attr("width", (d) => xScale(d.female))
      .attr("height", barHeight * 0.9)
      .attr("opacity", 0.8);

    // Update
    femaleBars
      .merge(femaleEnter)
      .transition()
      .duration(transitionDuration)
      .ease(d3.easeLinear)
      .attr("x", innerWidth / 2 + 10)
      .attr("y", (d) => yScale(d.age)) // Bars move UP as cohorts age
      .attr("width", (d) => xScale(d.female))
      .attr("height", barHeight * 0.9)
      .attr("fill", (d) => getCohortColor(d.birthYear, "#E24A90"))
      .attr("stroke", (d) => (hasCohort(d.birthYear) ? "#333" : "none"))
      .attr("stroke-width", (d) => (hasCohort(d.birthYear) ? 2 : 0))
      .attr("opacity", 0.8);

    // Apply click handlers
    g.selectAll(".female-bar")
      .style("cursor", onCohortClick ? "pointer" : "default")
      .on("click", function(_event: any, d: any) {
        if (onCohortClick) {
          onCohortClick(d.birthYear);
        }
      });

    // Exit: cohorts leaving (to top if moving forward, to bottom if backward)
    femaleBars
      .exit()
      .transition()
      .duration(transitionDuration)
      .ease(d3.easeLinear)
      .attr("y", isMovingForward ? -barHeight : innerHeight + barHeight)
      .attr("opacity", 0.8)
      .remove();

    // Update or create axes
    const xAxisLeft = d3
      .axisBottom(xScale)
      .ticks(5)
      .tickFormat((d) => d3.format(".2s")(d as number));

    const xAxisRight = d3
      .axisBottom(xScale)
      .ticks(5)
      .tickFormat((d) => d3.format(".2s")(d as number));

    // Left X axis
    let xAxisLeftGroup = g.select<SVGGElement>("g.x-axis-left");
    if (xAxisLeftGroup.empty()) {
      xAxisLeftGroup = g
        .append("g")
        .attr("class", "x-axis-left")
        .attr("transform", `translate(0,${innerHeight})`);
    }

    xAxisLeftGroup.call(xAxisLeft);
    xAxisLeftGroup.select(".domain").remove();
    xAxisLeftGroup
      .selectAll(".tick line")
      .attr("y2", -innerHeight)
      .attr("stroke", "#ddd")
      .attr("stroke-dasharray", "2,2");
    xAxisLeftGroup.selectAll("text").attr("transform", "translate(-10,0)");

    // Right X axis
    let xAxisRightGroup = g.select<SVGGElement>("g.x-axis-right");
    if (xAxisRightGroup.empty()) {
      xAxisRightGroup = g
        .append("g")
        .attr("class", "x-axis-right")
        .attr("transform", `translate(${innerWidth / 2 + 10},${innerHeight})`);
    }

    xAxisRightGroup.call(xAxisRight);

    // Y axis (age) - show every 10 years
    const yAxis = d3
      .axisLeft(yScale)
      .tickValues([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

    let yAxisGroup = g.select<SVGGElement>("g.y-axis");
    if (yAxisGroup.empty()) {
      yAxisGroup = g
        .append("g")
        .attr("class", "y-axis")
        .attr("transform", `translate(${innerWidth / 2},0)`);
    }

    yAxisGroup.call(yAxis);
    yAxisGroup.select(".domain").remove();
    yAxisGroup.selectAll(".tick line").remove();

    // Labels - create once
    if (g.select("text.male-label").empty()) {
      g.append("text")
        .attr("class", "male-label")
        .attr("x", innerWidth / 2 - 10)
        .attr("y", -10)
        .attr("text-anchor", "end")
        .attr("font-size", "14px")
        .attr("font-weight", "bold")
        .attr("fill", "#4A90E2")
        .text("Males");
    }

    if (g.select("text.female-label").empty()) {
      g.append("text")
        .attr("class", "female-label")
        .attr("x", innerWidth / 2 + 10)
        .attr("y", -10)
        .attr("text-anchor", "start")
        .attr("font-size", "14px")
        .attr("font-weight", "bold")
        .attr("fill", "#E24A90")
        .text("Females");
    }

    if (g.select("text.age-label").empty()) {
      g.append("text")
        .attr("class", "age-label")
        .attr("x", innerWidth / 2)
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("fill", "#666")
        .text("Age");
    }

    // Year label - update every render
    if (g.select("text.year-label").empty()) {
      g.append("text")
        .attr("class", "year-label")
        .attr("x", innerWidth / 2)
        .attr("y", -35)
        .attr("text-anchor", "middle")
        .attr("font-size", "24px")
        .attr("font-weight", "bold")
        .attr("fill", "#333");
    }
    g.select("text.year-label").text(currentYear);
  }, [data, currentYear, width, height, margin, highlightedCohorts, onCohortClick]);

  return <svg ref={svgRef} width={width} height={height} />;
};
