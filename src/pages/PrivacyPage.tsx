import ContactForm from "../components/ContactForm";

export default function PrivacyPage() {
  return (
    <div className="page-content">
      <h1>Privacy Policy</h1>

      <h2>Who operates this site</h2>
      <p>
        Marginal Data is written and maintained by Lucas Zalduendo ("I,"
        "me"), who is the data controller for the purposes described below.
        Use the contact form at the bottom of this page for any
        privacy-related request.
      </p>

      <h2>Analytics</h2>
      <p>
        I use Umami, a privacy-focused analytics platform, to understand
        aggregate traffic to this site — page views, referrers, and general
        visitor counts. Umami is configured in cookieless mode
        (<code>data-auto-track="false"</code>): it sets no tracking cookies
        and does not store your IP address. Analytics data is processed and
        stored within the EU (Germany), under a Data Processing Agreement
        with Umami.
      </p>
      <p>
        Because no cookies or comparable tracking technology are used, no
        cookie consent banner is required, and this data is processed on the
        basis of legitimate interest under GDPR Art. 6(1)(f) — understanding
        site traffic at an aggregate level, in a way that doesn't identify
        individual visitors.
      </p>

      <h2>Local storage</h2>
      <p>
        The only client-side storage anywhere on this site lives in the{" "}
        <a href="/2025/FuelEconomyCurve">Fuel Economy Curve</a> tool, which
        caches responses from the fueleconomy.gov API in your browser's
        localStorage so repeat lookups don't have to re-fetch. Nothing in
        that cache is transmitted anywhere — it's functional, not tracking.
      </p>

      <h2>Your rights</h2>
      <p>
        Since this site doesn't collect personally identifying information
        in the first place, there is typically nothing to access, correct,
        or delete. If you believe that's not the case for you, or have any
        other privacy question, reach out below and I'll respond.
      </p>

      <h2>Changes</h2>
      <p>If my data practices change, this page will change with them.</p>

      <h2>Contact</h2>
      <ContactForm />
    </div>
  );
}
