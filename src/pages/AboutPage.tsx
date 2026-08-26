import ContactForm from "../components/ContactForm";

export default function AboutPage() {
  return (
    <div className="page-content">
      <h1>About</h1>
      <p>
        Hi, I'm Lucas. This page serves a scratch pad for me to noodle on some
        different data sets and ways to visualize them. The name of the page,
        Marginal Data, roughly reflects the spirit of the site: every
        post, however small, is a new data set or visualization hopefully eliciting a
         new insight or understanding of the world we live in.
      </p>
      <p>
        Found a bug? Open an issue on{" "}
        <a
          href="https://github.com/LucidZ/MarginalData"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        . Have a data source worth exploring, or just want to say hi? Send me
        a message below.
      </p>

      <h2>Contact</h2>
      <ContactForm />
    </div>
  );
}
