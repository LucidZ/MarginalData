// Runs after `vite build`. Reads the built dist/index.html as a template and
// stamps out one static index.html per route (with per-page <title>/meta/OG
// tags baked in) plus dist/sitemap.xml, so crawlers and link-preview bots
// that don't execute JS still see correct per-page metadata.
//
// Node's native TS type-stripping (unflagged since Node 23.6) lets this
// plain .mjs script import src/routes.ts directly — it only reads the
// path/title/description/image fields below, so the fact that `component`
// holds an unresolved dynamic import() to JSX-containing files is fine;
// that function is never called.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTES } from "../src/routes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const SITE_URL = "https://marginaldata.com";

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceMetaContent(html, attr, key, value) {
  const escaped = escapeHtml(value);
  const pattern = new RegExp(
    `(<meta ${attr}="${key}" content=")[^"]*("\\s*/?>)`
  );
  if (pattern.test(html)) {
    return html.replace(pattern, `$1${escaped}$2`);
  }
  // Tag not present in the template (e.g. og:image) — insert before </head>.
  return html.replace(
    "</head>",
    `    <meta ${attr}="${key}" content="${escaped}" />\n  </head>`
  );
}

function renderPage(template, route) {
  let html = template;
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(route.title)}</title>`
  );
  html = replaceMetaContent(html, "name", "description", route.description);
  html = replaceMetaContent(html, "property", "og:title", route.title);
  html = replaceMetaContent(
    html,
    "property",
    "og:description",
    route.description
  );
  html = replaceMetaContent(
    html,
    "property",
    "og:url",
    `${SITE_URL}${route.path}`
  );
  html = replaceMetaContent(html, "name", "twitter:title", route.title);
  html = replaceMetaContent(
    html,
    "name",
    "twitter:description",
    route.description
  );
  if (route.image) {
    // og:image (and twitter:image) must be absolute per spec — most
    // crawlers won't resolve a relative path against the page URL.
    const imageUrl = `${SITE_URL}${route.image}`;
    html = replaceMetaContent(html, "property", "og:image", imageUrl);
    html = replaceMetaContent(html, "property", "og:image:width", "1200");
    html = replaceMetaContent(html, "property", "og:image:height", "630");
    html = replaceMetaContent(html, "name", "twitter:image", imageUrl);
    // Template defaults to "summary" (small thumbnail); routes with a real
    // preview image get the large-card treatment instead. Routes without
    // route.image are untouched, so they keep the template's default.
    html = replaceMetaContent(html, "name", "twitter:card", "summary_large_image");
  }
  return html;
}

async function main() {
  const template = await readFile(path.join(distDir, "index.html"), "utf-8");

  for (const route of ROUTES) {
    const outDir = path.join(distDir, route.path.replace(/^\//, ""));
    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, "index.html"),
      renderPage(template, route)
    );
  }

  const sitemapUrls = [SITE_URL, ...ROUTES.map((r) => `${SITE_URL}${r.path}`)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls
    .map((url) => `  <url><loc>${url}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  await writeFile(path.join(distDir, "sitemap.xml"), sitemap);

  console.log(
    `Generated ${ROUTES.length} static route pages + sitemap.xml in dist/`
  );
}

main();
