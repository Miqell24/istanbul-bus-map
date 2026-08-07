# Istanbul Public Transport — interactive map

Interactive, poster-grade map of the **Istanbul** network: the İETT bus system
(including the Metrobüs BRT), the Metro İstanbul rapid-transit and tram lines in
their official colors, and Marmaray under the Bosphorus — drawn along the real
street and track geometry.

## Live

**https://miqell24.github.io/istanbul-bus-map/** — GitHub Pages from `main:/docs`.

Data comes from **two** bundles on the İBB open data portal
([data.ibb.gov.tr](https://data.ibb.gov.tr), İBB Open Data Licence):

| bundle | modes | route_type | shapes |
|---|---|---|---|
| IETT GTFS Data | 796 bus lines | 3 | **none** |
| Public Transport GTFS Data | T1/T3/T4 trams, M1A–M9 metro, Marmaray | 0, 1 | yes |

Neither is valid GTFS as published, and each is broken differently, so
`pipeline/normalize.mjs` repairs both before anything else runs:

- **The İETT `stop_times` CSV is truncated at 1 048 575 rows** — Excel's sheet
  limit — which covers only 139 of the 1 096 lines. The same table is offered as
  a ZIP resource holding all 6.2 M rows; only that one is usable.
- İETT ships **semicolon-separated** files, the other bundle commas.
- İETT text is **double-encoded** ("KADIKÃ–Y" for KADIKÖY: UTF-8 read as cp1252
  and re-encoded); the other bundle is plain **cp1254**. Both are folded back to
  UTF-8 — this matters for line keys too, e.g. `11CÃœ` → `11CÜ`.
- İETT **coordinates lost their decimal point**: `410.191.700.005.564` is
  41.0191700005564 with the digits grouped in threes.

Build quirks worth knowing:

- **The bus feed has no shapes at all.** Every bus line is drawn by matching its
  stop sequence onto the OSM road graph (the same pseudo-matching the Rybnik
  region map uses), which is why bus mean errors sit near 7 m while the rail
  lines, which do have shapes, land under 5 m.
- **9 279 route rows collapse into 796 lines**: İETT files every itinerary
  variant as its own route under the same short name, and 300 of those lines
  have no trips at all. The line list is built from `trips.txt`, so the dormant
  ones never reach the map.
- **The province is too large for one Overpass call** — 40.78–41.48 N,
  28.00–29.91 E, about 87 × 168 km. The road network is fetched as eight tiles
  and merged at build time, with ways deduplicated by id.
- **Reading `stop_times` twice beats reading it once.** The engine used to hold
  every candidate trip's stops in memory to find the longest; at 6.2 M rows that
  is fatal, so the first pass only counts rows per trip and the second reads the
  winning trip of each line/direction.
- **Line colors**: the feed's `route_color` is empty for every line. M1A/M1B,
  M2, M3, M4, T4 and the funiculars take the `colour` tag from their OSM
  route_master relation; M5–M9, T1, T3 and Marmaray follow the operator's
  printed scheme (marked as such in `pipeline/build.mjs`).

What is **not** drawn, and why:

- **Funiculars F1–F3 and the two aerial cableways.** The feed gives only the two
  end points of each, and OSM has just fragments of the tunnels (F1 Taksim–
  Kabataş is a 120 m way for a 600 m line), so nothing can be matched.
- **The 375 minibus/dolmuş routes.** They have no line numbers — the feed keys
  them by their itinerary text ("PASABAHCE-SOGUKSU-KAVACIK"), which cannot be
  drawn as a line badge.
- **The 100 ferry routes.** A sea crossing cannot be map-matched onto a road or
  rail graph, and the map draws only matched geometry.

The rail bundle was last refreshed by İBB in 2023, so it predates M11, M12, T5
and the newest extensions; the bus bundle is from March 2026.

## Pipeline

`npm run download` fetches both bundles, the eight OSM road tiles and the rails
(Overpass), then normalizes the feeds. `npm run build` map-matches every line
(HMM/Viterbi on the OSM graphs) and writes GeoJSON to `data/out/`.
`npm run serve` hosts the map at http://localhost:8138.

Data: İBB Open Data — İETT, Metro İstanbul, TCDD · base map © OpenFreeMap /
OpenMapTiles / OpenStreetMap contributors.
