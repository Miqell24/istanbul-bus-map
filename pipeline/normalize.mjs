#!/usr/bin/env node
// Turns the two İBB open-data bundles into plain GTFS the pipeline can read.
// Neither of them is valid GTFS as published, and each is broken differently:
//
//   IETT (buses)              Public Transport (rail, ferry, dolmuş)
//   ------------------------  --------------------------------------
//   semicolon separated       comma separated
//   UTF-8, but double-encoded cp1254 (Turkish 8-bit)
//   coordinates as "410.19…"  ordinary decimals
//   no shapes.txt             shapes.txt present
//
// Everything below is undone here, once, so build.mjs sees two ordinary feeds
// in data/gtfs-iett/ and data/gtfs-pt/ and needs no Istanbul quirks of its own.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, openSync, readSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');

// --- cp1252 mojibake repair -------------------------------------------------
// "KADIKÃ–Y" is UTF-8 that was once decoded as cp1252 and re-encoded as UTF-8.
// Mapping the text back through cp1252 to bytes and decoding those as UTF-8
// restores "KADIKÖY". Only the 0x80–0x9F block differs from latin-1, so that
// block gets an explicit reverse table.
const CP1252_HIGH = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
};
const decoder = new TextDecoder('utf-8', { fatal: true });
function unmojibake(s) {
  if (!/[ÃÄÅÂ]/.test(s)) return s; // untouched text stays untouched
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i);
    if (c < 0x100) bytes[i] = c;
    else if (CP1252_HIGH[c] !== undefined) bytes[i] = CP1252_HIGH[c];
    else return s; // not cp1252-representable — leave the value alone
  }
  try { return decoder.decode(bytes); } catch { return s; }
}

// --- coordinates ------------------------------------------------------------
// IETT writes 41.0191700005564 as "410.191.700.005.564": the decimal point is
// gone and the digits are grouped in threes. Istanbul sits at 40–42 N / 27–30 E,
// so the point goes back after the first two digits.
function fixCoord(v) {
  const s = String(v).trim();
  if (/^-?\d+\.\d+$/.test(s) && Math.abs(Number(s)) < 180) return s; // already sane
  const d = s.replace(/[.,]/g, '');
  if (!/^\d{3,}$/.test(d)) return '';
  return (Number(d) / 10 ** (d.length - 2)).toFixed(8);
}

// --- csv --------------------------------------------------------------------
function splitLine(line, sep) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
const quote = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

function convert({ src, dst, sep, encoding, fixText, coordCols = [], drop = [] }) {
  const buf = readFileSync(join(RAW, src));
  let text = new TextDecoder(encoding).decode(buf).replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const head = splitLine(lines[0], sep).map((h) => h.trim());
  const keep = head.map((h, i) => (h && !drop.includes(h) ? i : -1)).filter((i) => i >= 0);
  const out = [keep.map((i) => head[i]).join(',')];
  for (let n = 1; n < lines.length; n++) {
    const f = splitLine(lines[n], sep);
    if (f.length < head.length) continue; // truncated row
    const row = keep.map((i) => {
      let v = (f[i] ?? '').trim();
      if (fixText) v = unmojibake(v);
      if (coordCols.includes(head[i])) v = fixCoord(v);
      return quote(v);
    });
    out.push(row.join(','));
  }
  const path = join(ROOT, dst);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, out.join('\n') + '\n');
  console.log(`${dst.padEnd(34)} ${String(out.length - 1).padStart(8)} rows`);
}

// IETT — semicolons, mojibake, mangled coordinates
for (const t of ['agency', 'calendar', 'routes', 'stops', 'trips']) {
  convert({
    src: `iett-${t}.csv`, dst: `data/gtfs-iett/${t}.txt`, sep: ';', encoding: 'utf-8',
    fixText: true, coordCols: ['stop_lat', 'stop_lon'],
  });
}
// …except stop_times, which comes from the portal's ZIP resource and is already
// ordinary comma-separated UTF-8. The CSV resource of the same table is CUT at
// 1 048 575 rows — Excel's sheet limit — and covers only 139 of the 1 096 lines,
// so it must not be used. 150 MB is too much to hold in a string: copied through
// in chunks, header checked, nothing rewritten.
{
  const src = join(RAW, 'iett-stop_times-full.csv');
  const dst = join(ROOT, 'data/gtfs-iett/stop_times.txt');
  const fd = openSync(src, 'r');
  const probe = Buffer.alloc(200);
  readSync(fd, probe, 0, 200, 0);
  closeSync(fd);
  const head = probe.toString('utf-8').split('\n')[0].trim();
  if (!/^trip_id,stop_id,stop_sequence/.test(head)) {
    throw new Error(`unexpected stop_times header: ${head}`);
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log('data/gtfs-iett/stop_times.txt      copied unchanged (from the ZIP resource)');
}
// Public transport — commas, cp1254, sane coordinates
for (const t of ['agency', 'calendar', 'frequencies', 'routes', 'shapes', 'stops', 'trips', 'stop_times']) {
  convert({
    src: `pt-${t}.csv`, dst: `data/gtfs-pt/${t}.txt`, sep: ',', encoding: 'windows-1254',
    fixText: false,
  });
}
