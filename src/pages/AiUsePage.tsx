export default function AiUsePage() {
  return (
    <div className="page-content">
      <h1>AI Use</h1>
      <p>
        AI (specifically Claude, from Anthropic) assists with writing code
        and building visualizations on this site.
      </p>
      <p>
        It does not generate the data. Every number here comes from a named
        primary source — Treasury, FRED, StatsBomb, the EPA,
        fueleconomy.gov, and others credited in each story's own sources
        section — and is checked against that source before it ships.
      </p>
      <p>
        The analysis, the framing, and the editorial calls — what a chart
        emphasizes, what story it tells — are mine. AI is a tool for
        building faster, not a stand-in for judgment.
      </p>
    </div>
  );
}
