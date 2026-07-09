import { defineConfig } from 'astro/config';

// OBS: Vi använder AVSIKTLIGT INTE Astros inbyggda i18n-routing.
// Lokaliserade slugs skiljer sig per språk (/en/netherlands/ ↔ /nl/nederland/),
// vilket Astros i18n + @astrojs/sitemap inte kan uttrycka. Routing, hreflang
// och sitemap ägs istället av src/lib/model.ts + src/lib/seo.ts + pages/sitemap.xml.ts.
export default defineConfig({
  site: 'https://dronekoll.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: {
    build: { assetsInlineLimit: 2048 },
  },
});
