// Seeds the podcast library for the podcast shots (run.sh section 2c): every show in
// fixtures/podcasts.json becomes <root>/<folder>/ with the files a Bridge leaves there,
// with no Bridge involved:
//   - feed.json (feed.json v1, as docs-developers/bridge/podcasts.md describes it), dated
//     back from now, so the newest episodes are always within Home's 14 days,
//   - cover.jpg (a gradient with the show's name, ffmpeg),
//   - one short silent mp3 per episode (ffmpeg), each with the fetch pin a Bridge writes
//     once it has the file (generation 1, sha256, bytes and duration read from that file),
//     except the episodes marked `absent`: no file and no pin, so the server lists them
//     as not on the server and playing one asks for a fetch.
// The folder is rebuilt on every run (the dates move). The server only reads it.
//
//   node seed-podcasts.mjs <root>
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';

import {DAY, FIXTURES, HOUR, ffmpeg, silence} from './lib.mjs';

const root = process.argv[2];
if (!root) {
  console.error('usage: node seed-podcasts.mjs <root>');
  process.exit(1);
}
const {shows} = JSON.parse(readFileSync(path.join(FIXTURES, 'podcasts.json'), 'utf8'));

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// RFC 3339 without milliseconds, as the Bridge writes it.
const stamp = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

// A font for the covers' text (drawtext needs a file on macOS); without one the cover
// is the gradient alone.
const FONT = [
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
].find((f) => existsSync(f));

// The title on a few short lines (drawtext doesn't wrap).
function wrap(text, width = 14) {
  const lines = [];
  for (const word of text.split(' ')) {
    const last = lines.at(-1);
    if (last && `${last} ${word}`.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.join('\n');
}

function cover(file, show, dir) {
  const [c0, c1] = show.colors;
  const gradient = `gradients=s=600x600:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=600:y1=600:nb_colors=2:speed=0`;
  const args = ['-f', 'lavfi', '-i', gradient, '-frames:v', '1'];
  if (FONT) {
    // Text from files, so no character in a name needs drawtext escaping.
    const titleFile = path.join(dir, '.cover-title.txt');
    const authorFile = path.join(dir, '.cover-author.txt');
    writeFileSync(titleFile, wrap(show.title));
    writeFileSync(authorFile, show.author.toUpperCase());
    const font = `fontfile='${FONT}'`;
    args.push('-vf', [
      `drawtext=${font}:textfile='${titleFile}':fontcolor=white:fontsize=64:line_spacing=10:x=48:y=h-th-64`,
      `drawtext=${font}:textfile='${authorFile}':fontcolor=white@0.8:fontsize=24:x=48:y=56`,
    ].join(','));
  }
  args.push('-q:v', '3', file);
  const ok = ffmpeg(args);
  for (const f of ['.cover-title.txt', '.cover-author.txt']) rmSync(path.join(dir, f), {force: true});
  if (!ok) throw new Error(`ffmpeg could not make ${file}`);
}

// The audio's length as ffprobe reads it, in ms.
function durationMs(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
    encoding: 'utf8',
  });
  const seconds = Number(r.stdout.trim());
  if (r.status !== 0 || !(seconds > 0)) throw new Error(`ffprobe could not read ${file}`);
  return Math.round(seconds * 1000);
}

const now = Date.now();
rmSync(root, {recursive: true, force: true});
let files = 0;
let absent = 0;
for (const show of shows) {
  const dir = path.join(root, show.folder);
  mkdirSync(dir, {recursive: true});
  const name = slug(show.title);
  const feedUrl = `https://feeds.example.com/${name}.xml`;
  const coverFile = path.join(dir, 'cover.jpg');
  cover(coverFile, show, dir);
  const oldest = Math.max(...show.episodes.map((e) => e.days_ago));
  const subscribed = now - (oldest + 2) * DAY;
  const episodes = show.episodes.map((e) => {
    const published = now - e.days_ago * DAY;
    const id = sha256(`${show.folder}\n${e.title}`).slice(0, 16);
    const rel = `${show.folder}/${stamp(published).slice(0, 10)}-${id.slice(0, 10)}.mp3`;
    let fetch = null;
    let length = e.minutes * 60 * 16000; // what a 128 kbps enclosure would weigh
    if (!e.absent) {
      const file = path.join(root, rel);
      if (!silence(file, e.minutes * 60, {title: e.title, artist: show.author, album: show.title})) {
        throw new Error(`ffmpeg could not make ${file}`);
      }
      const bytes = statSync(file).size;
      length = bytes;
      fetch = {
        generation: 1,
        sha256: sha256(readFileSync(file)),
        bytes,
        duration_ms: durationMs(file),
        content_type: 'audio/mpeg',
        fetched_at: stamp(Math.min(now, published + HOUR)),
        deleted_at: '',
        timeline_changed: false,
        codec: 'mp3',
      };
      files++;
    } else {
      absent++;
    }
    return {
      id,
      guid: `urn:audiosilo-shots:${name}:${id}`,
      path: rel,
      title: e.title,
      published: stamp(published),
      description: e.description ?? '',
      season: e.season ?? null,
      episode: e.episode ?? null,
      episode_type: e.episode_type ?? 'full',
      explicit: false,
      duration_seconds: e.minutes * 60,
      enclosure: {url: `https://media.example.com/${name}/${id}.mp3`, type: 'audio/mpeg', length},
      chapters_url: '',
      transcripts: [],
      first_seen: stamp(Math.max(subscribed, published)),
      removed_at: '',
      fetch,
    };
  });
  const feed = {
    version: 1,
    generator: 'audiosilo-docs/screenshots',
    show_id: sha256(show.folder).slice(0, 16),
    feed_url: feedUrl,
    feed_url_sha256: sha256(feedUrl),
    previous_feed_url_sha256: [],
    private: false,
    feed_host: 'feeds.example.com',
    subscribed_at: stamp(subscribed),
    updated_at: stamp(now),
    show: {
      title: show.title,
      author: show.author,
      description: show.description,
      link: `https://example.com/${name}`,
      language: 'en',
      type: show.type,
      explicit: false,
      categories: [],
      podcast_guid: '',
      image: {file: 'cover.jpg', source_sha256: sha256(readFileSync(coverFile)), fetched_at: stamp(subscribed)},
    },
    episodes,
  };
  writeFileSync(path.join(dir, 'feed.json'), JSON.stringify(feed, null, 2) + '\n');
}
console.log(`  ✓ ${shows.length} shows, ${files} episode files, ${absent} episodes not on the server`);
