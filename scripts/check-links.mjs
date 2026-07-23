#!/usr/bin/env node
/**
 * Intern länkkontroll (REPO-BUILD / DoD "check:links"): verifierar att varje
 * intern href/src i den byggda sajten (dist/) pekar på en fil eller ett
 * ankarmål som faktiskt finns. Externa (http://…) länkar hoppas — de täcks
 * inte av ett statiskt bygge. Fail-closed: exit 1 vid brutna länkar.
 *
 * Kör: npm run build:offline && npm run check:links
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
if (!existsSync(DIST)) {
  console.error('dist/ saknas — kör npm run build:offline först');
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

// Finns målet? Prova fil, katalog/index.html, och .html-suffix (Astro-slugs).
function targetExists(absNoHash) {
  if (existsSync(absNoHash)) {
    if (statSync(absNoHash).isDirectory()) return existsSync(join(absNoHash, 'index.html'));
    return true;
  }
  if (existsSync(absNoHash + '.html')) return true;
  if (existsSync(join(absNoHash, 'index.html'))) return true;
  return false;
}

const htmlFiles = walk(DIST);
const broken = [];
let checked = 0;

// Samla id-attribut per fil (för #ankar-kontroll)
const idCache = new Map();
function idsOf(file) {
  if (idCache.has(file)) return idCache.get(file);
  const html = readFileSync(file, 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  idCache.set(file, ids);
  return ids;
}

const attrRe = /(?:href|src)="([^"]+)"/g;
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(attrRe)) {
    const raw = m[1];
    // Hoppa externa (http/https/protokoll-relativa), mailto/tel/data och tomma.
    if (raw === '' || /^(https?:)?\/\//.test(raw) || /^(mailto:|tel:|data:):?/.test(raw)) continue;
    checked++;
    const [pathPart, hash] = raw.split('#');
    if (pathPart === '') {
      // ren #ankare på samma sida
      if (hash && !idsOf(file).has(hash)) broken.push(`${rel(file)} → #${hash} (ankare saknas)`);
      continue;
    }
    // Absolut (från dist-roten) eller relativ
    const abs = pathPart.startsWith('/')
      ? join(DIST, pathPart)
      : resolve(dirname(file), pathPart);
    if (!targetExists(abs)) {
      broken.push(`${rel(file)} → ${raw} (mål saknas)`);
    }
  }
}

function rel(f) {
  return f.slice(DIST.length + 1);
}

if (broken.length) {
  console.error(`✗ ${broken.length} brutna interna länkar (av ${checked} kontrollerade):`);
  for (const b of broken.slice(0, 40)) console.error(`  - ${b}`);
  if (broken.length > 40) console.error(`  … +${broken.length - 40} fler`);
  process.exit(1);
}
console.log(`✓ ${checked} interna länkar kontrollerade i ${htmlFiles.length} sidor — 0 brutna`);
