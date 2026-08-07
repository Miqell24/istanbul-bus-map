#!/usr/bin/env bash
# Downloads input data: two İBB GTFS bundles, OSM networks (Overpass), MapLibre.
# Everything is cached — re-running only fetches what is missing.
#
# TWO bundles from the İBB open data portal (data.ibb.gov.tr, CKAN):
#   * "IETT GTFS Data"            — the bus network (no shapes)
#   * "Public Transport GTFS Data"— metro, tram, funicular, Marmaray, ferries
#                                   and the minibus/dolmuş lines (with shapes)
# Both are published as loose CSV resources rather than a GTFS zip, and neither
# is valid GTFS as it stands; pipeline/normalize.mjs repairs them (see there).
#
# NOTE on stop_times: the IETT table is offered twice, as CSV and as ZIP. The
# CSV is CUT at 1 048 575 rows — Excel's sheet limit — and covers only 139 of
# the 1 096 lines. Only the ZIP holds the whole 6.2 M-row table.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw data/osm web/vendor

IETT=https://data.ibb.gov.tr/dataset/8540e256-6df5-4719-85bc-e64e91508ede/resource
PT=https://data.ibb.gov.tr/dataset/121a9892-7945-419a-9b89-49f6083926df/resource

get() { # get <url> <dest>
  [ -s "$2" ] && return 0
  echo "-- $(basename "$2")"
  curl -fL --retry 3 --max-time 900 -o "$2" "$1"
}

# 1) GTFS — IETT (buses)
if [ ! -f data/gtfs-iett/routes.txt ]; then
  echo "== İBB open data: IETT (buses) =="
  get "$IETT/df13606d-194b-4587-b868-39ecdc5f8769/download/agency.csv"   data/raw/iett-agency.csv
  get "$IETT/6c9623b1-3858-4b37-b936-8ffa78de2a69/download/calendar.csv" data/raw/iett-calendar.csv
  get "$IETT/46dbe388-c8c2-45c4-ac72-c06953de56a2/download/routes.csv"   data/raw/iett-routes.csv
  get "$IETT/2299bc82-983b-4bdf-8520-5cef8c555e29/download/stops.csv"    data/raw/iett-stops.csv
  get "$IETT/7ff49bdd-b0d2-4a6e-9392-b598f77f5070/download/trips.csv"    data/raw/iett-trips.csv
  get "$IETT/80401c1c-c240-4a32-8f40-ef697100a681/download/stop_times.zip" data/raw/iett-stop_times.zip
  unzip -o -q data/raw/iett-stop_times.zip -d data/raw
  mv -f data/raw/stop_times.txt data/raw/iett-stop_times-full.csv
fi

# 2) GTFS — rail, ferry and dolmuş
if [ ! -f data/gtfs-pt/routes.txt ]; then
  echo "== İBB open data: public transport (rail, ferry, dolmuş) =="
  get "$PT/42ae499d-ae9c-4906-ac5c-96e0c155e00b/download/agency.csv"      data/raw/pt-agency.csv
  get "$PT/c84ca913-29ac-4f15-87cd-076aef3dccd6/download/calendar.csv"    data/raw/pt-calendar.csv
  get "$PT/a4c86ce6-64da-41e2-9584-5d83b5fb895c/download/frequencies.csv" data/raw/pt-frequencies.csv
  get "$PT/36b554c7-cae0-4b7e-978f-fc6a43664e88/download/routes.csv"      data/raw/pt-routes.csv
  get "$PT/83317085-aa56-41b0-9447-ea579567f2cb/download/shapes.csv"      data/raw/pt-shapes.csv
  get "$PT/ac646b83-3b6f-4ca2-afb4-9071ab44d9af/download/stop_times.csv"  data/raw/pt-stop_times.csv
  get "$PT/d1f7c258-bbc1-406f-9ab2-7a7c1797c673/download/stops.csv"       data/raw/pt-stops.csv
  get "$PT/dcee1700-e59f-4a5f-8009-f602045a4507/download/trips.csv"       data/raw/pt-trips.csv
fi

# 2b) repair both bundles into ordinary GTFS
if [ ! -f data/gtfs-iett/routes.txt ] || [ ! -f data/gtfs-pt/routes.txt ]; then
  echo "== normalizing =="
  node pipeline/normalize.mjs
fi

# 3) OSM roadways. The service area spans the whole province — 40.78–41.48 N,
#    28.00–29.91 E, roughly 87 × 168 km, five times the area of any sibling
#    city. One Overpass call for that box runs out of memory on the public
#    instances, so the box is fetched as EIGHT tiles (2 rows × 4 columns) and
#    merged at build time (ways are deduplicated by id).
LATS=(40.74 41.13 41.52)
LONS=(27.94 28.44 28.94 29.44 29.96)
HW='^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|busway|construction|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$'
for r in 0 1; do
  for c in 0 1 2 3; do
    f="data/osm/istanbul-r${r}c${c}.json"
    [ -s "$f" ] && continue
    S=${LATS[$r]}; N=${LATS[$((r+1))]}; W=${LONS[$c]}; E=${LONS[$((c+1))]}
    echo "== Overpass (roads) tile r${r}c${c}: $S,$W,$N,$E =="
    Q="[out:json][timeout:900];way($S,$W,$N,$E)[\"highway\"~\"$HW\"];out geom;"
    ok=0
    for EP in "https://overpass-api.de/api/interpreter" \
              "https://maps.mail.ru/osm/tools/overpass/api/interpreter" \
              "https://overpass.kumi.systems/api/interpreter"; do
      echo "-- $EP"
      if curl -fsS --max-time 1800 -o "$f" --data-urlencode "data=$Q" "$EP" \
         && grep -q '"elements"' "$f"; then
        ok=1; break
      fi
    done
    [ "$ok" = 1 ] || { echo "Overpass: all mirrors failed on tile r${r}c${c}" >&2; rm -f "$f"; exit 1; }
    du -sh "$f"
  done
done

# 3b) OSM rails — metro, tram, funicular, Marmaray and the mainline corridors.
#     Rails are sparse enough for a single call over the whole box.
if [ ! -f data/osm/istanbul-rail.json ]; then
  echo "== Overpass (rails) =="
  QT='[out:json][timeout:900];way(40.74,27.94,41.52,29.96)["railway"~"^(subway|tram|light_rail|rail|funicular|monorail|narrow_gauge|construction)$"];out geom;'
  ok=0
  for EP in "https://overpass-api.de/api/interpreter" \
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter" \
            "https://overpass.kumi.systems/api/interpreter"; do
    echo "-- $EP"
    if curl -fsS --max-time 900 -o data/osm/istanbul-rail.json --data-urlencode "data=$QT" "$EP" \
       && grep -q '"elements"' data/osm/istanbul-rail.json; then
      ok=1; break
    fi
  done
  [ "$ok" = 1 ] || { echo "Overpass (rails): all mirrors failed" >&2; exit 1; }
fi

# 4) MapLibre GL (vendored, no CDN at runtime)
if [ ! -f web/vendor/maplibre-gl.js ]; then
  echo "== MapLibre GL =="
  curl -fL --retry 3 -o web/vendor/maplibre-gl.js  https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js
  curl -fL --retry 3 -o web/vendor/maplibre-gl.css https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css
fi

echo "OK — data ready:"
du -sh data/raw data/gtfs-iett data/gtfs-pt data/osm 2>/dev/null || true
