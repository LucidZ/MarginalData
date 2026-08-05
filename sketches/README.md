# Sketches

Standalone, self-contained exploratory charts — each is a single HTML file
with its data embedded inline, viewable by opening it directly in a browser.
No build step, not wired into the site's routing. These are early-stage
explorations, not finished stories; promote one to `src/` if it earns a page.

## Property rights & GDP

Prompted by Daron Acemoglu's "institutions as a fundamental cause of
development" thesis.

- **`property-rights-gdp.html`** — cross-country scatter of World Bank Rule
  of Law scores (WGI) against GDP per capita (PPP), 193 countries, 2023.
  r=0.71, r²≈0.50. Highlights resource-rich autocracies that outperform their
  institutions score (Russia, Belarus, Turkmenistan, Qatar, Guyana) and small
  remote Pacific states that underperform theirs (Micronesia, Kiribati,
  Tuvalu, Solomon Islands, Vanuatu).
  Data: `scripts/generate_property_rights_gdp_data.py`.

- **`ajr-settler-mortality-iv.html`** — replicates the actual causal
  identification strategy from Acemoglu, Johnson & Robinson (2001),
  "The Colonial Origins of Comparative Development" (AER): colonial settler
  mortality instrumenting for institutions, on their 64-country base sample.
  Three panels (first stage, reduced form, naive OLS vs. 2SLS) reproduce
  their headline result — instrumenting moves the institutions→income slope
  from 0.52 (naive OLS) to 0.94 (2SLS).
  Data: `scripts/generate_ajr_settler_mortality_iv_data.py`.
  Caveats worth reading before citing this uncritically: Sachs's (2003)
  disease-environment critique of the exclusion restriction, and Albouy's
  (2012, *AER*) critique of the underlying mortality data quality — both are
  called out on the chart itself.
