// Runs on postinstall. The search theme (@easyops-cn/docusaurus-search-local
// 0.55.3) hard-codes its "See all results" link as `${baseUrl}search/?q=...`,
// ignoring `trailingSlash: false`. The page is built as search.html, so a full
// load of /search/?q=... (new tab, shared link) loses the query: `docusaurus
// serve` 301s to /search without it, and GitHub Pages has no search/index.html.
// The theme's own useSearchQuery already builds `search?`; this makes the
// SearchBar match it. Drop the script once upstream fixes it.
import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const file = fileURLToPath(
  new URL(
    '../node_modules/@easyops-cn/docusaurus-search-local/dist/client/client/theme/SearchBar/SearchBar.jsx',
    import.meta.url,
  ),
);
const broken = '`${baseUrl}search/?${params.toString()}`';
const fixed = '`${baseUrl}search?${params.toString()}`';

const source = existsSync(file) ? readFileSync(file, 'utf8') : '';
if (source.includes(broken)) {
  writeFileSync(file, source.replace(broken, () => fixed));
  // The bundler's persistent cache does not notice an edited dependency.
  rmSync(fileURLToPath(new URL('../node_modules/.cache', import.meta.url)), {
    recursive: true,
    force: true,
  });
  console.log('patch-search-link: "See all results" now links to /search?q=');
} else if (!source.includes(fixed)) {
  console.error(
    'patch-search-link: the search theme no longer builds its "See all results" URL the way this script expects. Check whether /search?q= still loads with its query, then update or remove scripts/patch-search-link.mjs.',
  );
  process.exit(1);
}
