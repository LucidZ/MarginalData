export default function PrivacyPage() {
  return (
    <div className="page-content">
      <h1>Privacy</h1>
      <p>
        This site doesn't use a cookie banner, and that's not an oversight.
      </p>
      <p>
        Analytics are handled by Umami Cloud in cookieless mode
        (<code>data-auto-track="false"</code>), so no tracking cookies are
        set and no personally identifying data is collected about your
        visit.
      </p>
      <p>
        The only client-side storage anywhere on this site lives in the{" "}
        <a href="/2025/FuelEconomyCurve">Fuel Economy Curve</a> tool, which
        caches responses from the fueleconomy.gov API in your browser's
        localStorage so repeat lookups don't have to re-fetch. Nothing in
        that cache is sent anywhere — it's functional, not tracking.
      </p>
      <p>If that ever changes, this page will change with it.</p>
    </div>
  );
}
