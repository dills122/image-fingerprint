import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL;
const base = process.env.SITE_BASE ?? '/site';

export default defineConfig({
  ...(site ? { site } : {}),
  base,
  output: 'static',
});
