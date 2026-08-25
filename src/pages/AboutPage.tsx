export default function AboutPage() {
  return (
    <div className="page-content">
      <h1>About</h1>
      <p>
        Marginal Data is a personal project — one person exploring how data
        and visualization actually work, one small interactive experiment at
        a time. It isn't a portfolio. It's closer to a running log: some
        stories are polished, some are rough early attempts, and both kinds
        stay up.
      </p>
      <p>
        The name is a small economics pun, on purpose. The "marginal" unit is
        the next one — the next dollar taxed, the next data point that
        changes your mind. That's roughly the spirit of this site: not
        sweeping conclusions, just actually looking at what one more chart,
        or one more way of encoding the same numbers, tells you.
      </p>
      <p>
        Found a bug, have a data source worth exploring, or just want to say
        hi? Open an issue on{" "}
        <a
          href="https://github.com/LucidZ/MarginalData"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        .
      </p>
    </div>
  );
}
