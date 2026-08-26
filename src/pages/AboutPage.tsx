import ContactForm from "../components/ContactForm";

export default function AboutPage() {
  return (
    <div className="page-content">
      <h1>About</h1>
      <p>
        I'm Lucas Zalduendo. This page serves a scratch pad for me to noodle on some
        different data sets and ways to visualize them.
      </p>
      <p>
        The name of the page, Marginal Data, is a portmanteau of two blogs that I've
        enjoyed reading over the years: marginalrevolution.com and flowingdata.com.
        Each post, however small, aims to explore data visually in ways that can marginally improve my
        understanding of this big and complicated world we live in.
      </p>

      <h2>AI use</h2>
      <p>
        I use AI (specifically Claude, from Anthropic) to write almost all
        of the code on this site.
      </p>
      <p>
        I do not use AI to generate the data. Every number here comes from a named
        primary source. However, if you'd like to recreate a chart or visual, I would recommend
        pulling directly from the cited primary sources to avoid possible errors I may
        have imbued in the data.
      </p>
      <h2>Privacy</h2>
      <p>
        This site uses cookieless, privacy-friendly analytics (Umami)
        — no tracking cookies, no personal data stored.
      </p>

      <h2>Feedback</h2>
      <p>
        Found a bug? Open an issue on{" "}
        <a
          href="https://github.com/LucidZ/MarginalData"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        . Have a comment, data source worth exploring, or just want to say hi? Send me
        a message below, or find me on{" "}
        <a
          href="https://bsky.app/profile/marginaldata.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Bluesky
        </a>
        .
      </p>

      <h2>Contact</h2>
      <ContactForm />
    </div>
  );
}
