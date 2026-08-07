// Frontend: MapLibre GL + OpenFreeMap vector tiles (positron) + ZTM line layers
// in the visual logic of a classic printed network map.
const KMK = '#0059a9';
const KMK_DARK = '#00294f';
const TROLLEY_GREEN = '#149a3f';
const MLINE_YELLOW = '#e8a000';
// Narrow label face. Arial Narrow itself cannot be used: MapLibre text comes from
// pre-rendered glyph PBFs on a font server, and no server hosts that licensed
// font — Roboto Condensed is the hosted narrow equivalent (with Greek coverage).
const NARROW = 'roboto_condensed_regular';
const NARROW_BOLD = 'roboto_condensed_bold';

let map;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function init() {
  // The OpenFreeMap glyph server only hosts Noto Sans, so the style is fetched
  // and its glyphs endpoint swapped to VersaTiles, which serves BOTH Noto Sans
  // (for the base style) and Roboto Condensed (for our labels). VersaTiles names
  // stacks in snake_case and has no Noto Sans Italic — remap the base style's
  // fonts (italic degrades to regular, cosmetic only).
  const style = await (await fetch('https://tiles.openfreemap.org/styles/positron')).json();
  style.glyphs = 'https://tiles.versatiles.org/assets/glyphs/{fontstack}/{range}.pbf';
  const FONT_MAP = {
    'Noto Sans Regular': 'noto_sans_regular',
    'Noto Sans Bold': 'noto_sans_bold',
    'Noto Sans Italic': 'noto_sans_regular',
  };
  // "Paper map" recolor of the pale positron base — the look of the printed KMK
  // poster: warm tinted districts, green parks, real-blue water, pale-yellow
  // motorways, darker street names, brown-gray railways.
  const BASE_RECOLOR = {
    background: { 'background-color': '#e8e4d8' },
    landuse_residential: { 'fill-color': '#e6d2c2' },
    park: { 'fill-color': '#c4dfa4' },
    landcover_wood: { 'fill-color': '#b3d295' },
    water: { 'fill-color': '#9dc2e0' },
    waterway: { 'line-color': '#9dc2e0' },
    building: { 'fill-color': '#dccdb9', 'fill-outline-color': '#c9b8a2' },
    road_area_pier: { 'fill-color': '#e8e4d8' },
    road_pier: { 'line-color': '#e8e4d8' },
    'aeroway-area': { 'fill-color': '#f0ece0' },
    'aeroway-runway': { 'line-color': '#f0ece0' },
    'aeroway-taxiway': { 'line-color': '#d8d2c2' },
    'aeroway-runway-casing': { 'line-color': '#d8d2c2' },
    highway_path: { 'line-color': '#d9d3c3' },
    highway_minor: { 'line-color': '#fdfcf6' },
    highway_major_casing: { 'line-color': '#c8bfab' },
    highway_major_inner: { 'line-color': '#fffdf6' },
    highway_major_subtle: { 'line-color': 'hsla(38,25%,74%,0.69)' },
    highway_motorway_casing: { 'line-color': '#c2b28e' },
    highway_motorway_inner: { 'line-color': '#f8e9b0' },
    highway_motorway_subtle: { 'line-color': 'hsla(45,45%,70%,0.55)' },
    highway_motorway_bridge_casing: { 'line-color': '#c2b28e' },
    highway_motorway_bridge_inner: { 'line-color': '#f8e9b0' },
    tunnel_motorway_casing: { 'line-color': '#d3cab4' },
    tunnel_motorway_inner: { 'line-color': '#efe8d2' },
    railway: { 'line-color': '#a2968a' },
    railway_dashline: { 'line-color': '#f4efe2' },
    railway_service: { 'line-color': '#a2968a' },
    railway_service_dashline: { 'line-color': '#f4efe2' },
    railway_transit: { 'line-color': '#a2968a' },
    railway_transit_dashline: { 'line-color': '#f4efe2' },
    boundary_3: { 'line-color': '#a89f8e' },
    boundary_2: { 'line-color': '#a89f8e' },
    'highway-name-minor': { 'text-color': '#3c3a34', 'text-halo-color': '#f4efe2' },
    'highway-name-major': { 'text-color': '#3c3a34', 'text-halo-color': '#f4efe2' },
    'highway-name-path': { 'text-color': '#8a8171' },
  };
  // Stock positron holds street names back (minor z15+, major z12.2) — far too
  // late for a transit map, where the streets carry the content. Pull them in
  // earlier (minor stays at 13: the tiles only carry minor names from there)
  // and halve the 250 px default spacing so long streets repeat their name
  // instead of showing it once. They still lose collisions to line numbers and
  // stop names, by design.
  const BASE_MINZOOM = { 'highway-name-minor': 13, 'highway-name-major': 13 };
  const BASE_SPACING = { 'highway-name-minor': 130, 'highway-name-major': 130 };
  for (const l of style.layers) {
    const tf = l.layout && l.layout['text-font'];
    if (Array.isArray(tf)) l.layout['text-font'] = tf.map((f) => FONT_MAP[f] || f);
    const o = BASE_RECOLOR[l.id];
    if (o) l.paint = { ...l.paint, ...o };
    if (BASE_MINZOOM[l.id]) l.minzoom = BASE_MINZOOM[l.id];
    if (BASE_SPACING[l.id]) l.layout = { ...l.layout, 'symbol-spacing': BASE_SPACING[l.id] };
    // road-number shields (433, S11…) read as line badges on a transit map
    if (/shield/.test(l.id)) l.layout = { ...l.layout, visibility: 'none' };
  }
  map = new maplibregl.Map({
    container: 'map',
    style,
    center: [29.0000, 41.0300],
    zoom: 9.8,
    attributionControl: false,
  });
  window.__map = map; // debug/test hook (jumpTo, queryRenderedFeatures)
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), 'bottom-left');
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Timetables: İBB Open Data — İETT, Metro İstanbul, TCDD' }));

  const [meta] = await Promise.all([
    fetch('data/meta.json').then((r) => r.json()),
    // Do not hang on 'load' (one stuck tile blocks it forever) —
    // a loaded style is enough, tiles catch up in the background.
    new Promise((res) => {
      if (map.loaded()) return res();
      map.once('load', res);
      const t = setInterval(() => {
        if (map.isStyleLoaded()) { clearInterval(t); res(); }
      }, 400);
    }),
  ]);

  // Panel (English, minimal): legend + mode toggles + expandable clickable line list.
  const nBus = meta.lines.filter((l) => l.mode === 'bus').length;
  // Marmaray counts with the metro: it is drawn metro-style and sits under the
  // same toggle (see METRO_KEY in the pipeline)
  const nMetro = meta.lines.filter((l) => l.mode === 'tram' && /^(M[0-9]|Marmaray)/i.test(l.line)).length;
  const nTram = meta.lines.filter((l) => l.mode === 'tram').length - nMetro;
  document.getElementById('count').textContent = `(${nBus} bus · ${nTram} tram · ${nMetro} metro & Marmaray)`;
  document.getElementById('stamp').textContent = new Date(meta.generatedAt).toLocaleDateString('en-GB');
  document.getElementById('chips').innerHTML = meta.lines
    .map((l) => `<button class="chip" data-line="${esc(l.line)}" style="background:${esc(l.color)}">${esc(l.line)}</button>`)
    .join(' ');

  // Line layers go below the base style labels (street names stay readable).
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

  // Strokes come from the merged-streets layer (one stroke per roadway regardless
  // of line count — the KMK map logic), not from overlapping per-line routes.
  map.addSource('streets', { type: 'geojson', data: 'data/streets.geojson' });
  map.addSource('stops', { type: 'geojson', data: 'data/stops.geojson' });

  // Trams/trolleybuses drawn with the same logic as buses (both tracks at their
  // true OSM positions). Metro is the exception: a WIDE translucent ribbon with
  // no white casing, laid over the street network like on printed transit maps.
  const metroC = ['==', ['get', 'metro'], 1];
  map.addLayer({
    id: 'route-casing', type: 'line', source: 'streets',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.2, 14, 4.6, 17, 9],
      'line-opacity': ['case', metroC, 0, 1],
    },
  }, firstSymbol);
  map.addLayer({
    id: 'route-line', type: 'line', source: 'streets',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['coalesce', ['get', 'color'], KMK],
      'line-width': ['interpolate', ['linear'], ['zoom'],
        10, ['case', metroC, 3, 1.1],
        14, ['case', metroC, 7, 2.3],
        17, ['case', metroC, 14, 4.5]],
      'line-opacity': ['case', metroC, 0.4, 1],
    },
  }, firstSymbol);
  // Shared bus+trolleybus roadways: green dashes over the navy stroke, so the
  // alternation reads as "both ride here". Trolleybus-only roadways are simply
  // green via properties.color from the pipeline.
  map.addLayer({
    id: 'route-trolley-dash', type: 'line', source: 'streets',
    filter: ['==', ['get', 'trolley'], 'mix'],
    layout: { 'line-join': 'round', 'line-cap': 'butt' },
    paint: {
      'line-color': TROLLEY_GREEN,
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.1, 14, 2.3, 17, 4.5],
      'line-dasharray': [1.6, 2.2],
    },
  }, firstSymbol);

  // Shared metroline+bus roadways: amber dashes over the navy stroke —
  // same convention as the trolleybus overlay above.
  map.addLayer({
    id: 'route-mline-dash', type: 'line', source: 'streets',
    filter: ['==', ['get', 'mline'], 'mix'],
    layout: { 'line-join': 'round', 'line-cap': 'butt' },
    paint: {
      'line-color': MLINE_YELLOW,
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.1, 14, 2.3, 17, 4.5],
      'line-dasharray': [1.6, 2.2],
    },
  }, firstSymbol);

  // Line numbers: pipeline points carry the street bearing (angle) — the text is
  // rotated PARALLEL to the road and offset sideways in text space (anchor bottom
  // + offset), so it stands BESIDE the roadway along its course, never on the stroke.
  // A shared bus+rail corridor = one segment: the metro/tram row (in that line's
  // own color — M1 green, M2 red, M3 azure, tram purple) above the bus row.
  const TRAM_RED = '#d6212b';
  const railColor = ['coalesce', ['get', 'color'], TRAM_RED];
  const numberField = ['case', ['has', 'busLines'],
    ['format',
      ['get', 'lines'], { 'text-color': railColor },
      '\n', {},
      ['get', 'busLines'], { 'text-color': KMK }],
    ['format', ['get', 'lines'], {}]];
  map.addSource('labels', { type: 'geojson', data: 'data/labels.geojson' });
  const numbersLayout = {
    'text-field': numberField,
    'text-font': [NARROW_BOLD],
    'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9, 14, 11.5, 17, 14.5],
    'text-rotate': ['get', 'angle'],
    'text-rotation-alignment': 'map',
    // 'auto' inherits pitch-alignment 'map', and that path in MapLibre 5.6 kills
    // rotated point symbols (0 rendered); the map has no pitch anyway
    'text-pitch-alignment': 'viewport',
    'text-anchor': 'bottom',
    'text-offset': [0, -0.6],
    // Long rows WRAP into a stacked block (the printed-KMK convention). This
    // also matters for collisions: MapLibre boxes rotated text as if unrotated,
    // so a long single-line row beside a N-S street owns a wide horizontal bar
    // and dies against anything placed earlier — wrapped blocks survive.
    'text-max-width': 10,
    'text-line-height': 1.15,
  };
  const numbersPaint = { 'text-color': ['coalesce', ['get', 'color'], KMK], 'text-halo-color': '#ffffff', 'text-halo-width': 2 };
  // Every label is collision-managed (allow-overlap turned whole districts into
  // digit soup — user report, twice). Numbers still win against stop names
  // because their layers sit ABOVE them in the style: MapLibre places symbols
  // top-most layer first, so numbers claim their spot and names yield. Repeats
  // (extra:1) exist only on very long avenues, emitted sparsely by the pipeline,
  // and rank BELOW the once-per-street anchors.
  const NUM_LAYERS = [
    { id: 'street-numbers-low', minzoom: 11, maxzoom: 13, cond: ['!', ['has', 'extra']] },
    { id: 'street-numbers', minzoom: 13, cond: ['!', ['has', 'extra']] },
    { id: 'street-numbers-extra', minzoom: 13, cond: ['has', 'extra'] },
  ];
  for (const d of NUM_LAYERS) {
    const def = {
      id: d.id, type: 'symbol', source: 'labels',
      minzoom: d.minzoom,
      filter: d.cond,
      layout: { ...numbersLayout },
      paint: { ...numbersPaint },
    };
    if (d.maxzoom) def.maxzoom = d.maxzoom;
    map.addLayer(def);
  }

  // Stops as HALF-DISCS: flat edge lying on the line, bulge pointing to the
  // pole's side of the street (angle from the pipeline). Canvas-drawn icon per
  // color pair — regular: white fill + colored rim; terminus: filled + dark rim.
  const PALETTE = [
    [KMK, KMK_DARK], [TROLLEY_GREEN, '#0a5121'], [MLINE_YELLOW, '#7d5600'],
    ['#009550', '#00512b'], ['#e30613', '#7c060e'], ['#1e9cd7', '#0d567a'],
    ['#7d2b8b', '#45164e'], ['#d6212b', '#7c1116'],
    // Istanbul rapid-transit line colors — exactly as the pipeline emits them
    // from RAIL_COLORS; a color missing here degrades to the darken() fallback
    // icon, so keep the two lists in sync
    ['#E32726', '#7E1515'], // M1A / M1B
    ['#009A4C', '#005429'], // M2 / M2A
    ['#00A8E1', '#005C7B'], // M3 / M3A
    ['#E91E76', '#801041'], // M4
    ['#7B3F9E', '#442257'], // M5
    ['#A3843C', '#594821'], // M6
    ['#B0208C', '#61114D'], // M7
    ['#00A19A', '#005854'], // M8
    ['#F2B705', '#856403'], // M9
    ['#005EB8', '#003465'], // T1
    ['#8C5A2B', '#4D3218'], // T3
    ['#E87400', '#7F4000'], // T4
    ['#7A745A', '#434032'], // F1–F3
    ['#00539F', '#002E57'], // Marmaray
  ];
  const discIcon = (fill, rim, half) => {
    const S = 48;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    x.beginPath();
    // half: upper semicircle (bulge up at angle 0); full: whole disc (metro)
    x.arc(S / 2, S / 2, 15, half ? Math.PI : 0, 2 * Math.PI);
    if (half) x.closePath();
    x.fillStyle = fill; x.fill();
    x.lineWidth = 5; x.lineJoin = 'round'; x.strokeStyle = rim; x.stroke();
    return x.getImageData(0, 0, S, S);
  };
  // Terminus badge box: translucent rounded rectangle rimmed in the line color;
  // registered as a STRETCHABLE image so icon-text-fit wraps it around any number.
  const badgeBox = (rim) => {
    const W = 26, H = 20, LW = 2.5;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.beginPath();
    x.roundRect(LW / 2 + 0.5, LW / 2 + 0.5, W - LW - 1, H - LW - 1, 5);
    x.fillStyle = 'rgba(255,255,255,0.72)'; x.fill();
    x.lineWidth = LW; x.strokeStyle = rim; x.stroke();
    return x.getImageData(0, 0, W, H);
  };
  const addStopIcons = (m) => {
    for (const [c, cd] of PALETTE) {
      m.addImage('stop-' + c, discIcon('#ffffff', c, true), { pixelRatio: 2 });
      m.addImage('stop-' + c + '-t', discIcon(c, cd, true), { pixelRatio: 2 });
      m.addImage('dot-' + c, discIcon('#ffffff', c, false), { pixelRatio: 2 });
      m.addImage('dot-' + c + '-t', discIcon(c, cd, false), { pixelRatio: 2 });
      m.addImage('badge-' + c, badgeBox(c), {
        pixelRatio: 2,
        stretchX: [[10, 16]], stretchY: [[8, 12]], content: [6, 4, 20, 16],
      });
    }
    // Safety net: a line color the palette misses must never strip a badge of
    // its box or a station of its dot again — generate the icon on demand,
    // deriving the dark rim from the color itself.
    const darken = (hex) => '#' + (hex.match(/[0-9a-f]{2}/gi) || [])
      .map((h) => Math.round(parseInt(h, 16) * 0.45).toString(16).padStart(2, '0')).join('');
    m.on('styleimagemissing', (e) => {
      const g = /^(stop|dot|badge)-(#[0-9a-f]{6})(-t)?$/.exec(e.id);
      if (!g || m.hasImage(e.id)) return;
      const [, kind, c, t] = g;
      if (kind === 'badge') {
        m.addImage(e.id, badgeBox(c), {
          pixelRatio: 2,
          stretchX: [[10, 16]], stretchY: [[8, 12]], content: [6, 4, 20, 16],
        });
      } else {
        m.addImage(e.id, discIcon(t ? c : '#ffffff', t ? darken(c) : c, kind === 'stop'), { pixelRatio: 2 });
      }
    });
  };
  addStopIcons(map);
  map.addLayer({
    id: 'stops-dots', type: 'symbol', source: 'stops',
    minzoom: 11,
    layout: {
      // metro stations and TERMINI are ALWAYS full discs; ordinary street stops
      // are half-discs with the bulge on the pole's side of the roadway
      'icon-image': ['concat',
        ['case', ['any', ['==', ['get', 'metro'], 1], ['==', ['get', 'terminus'], 1]], 'dot-', 'stop-'],
        ['coalesce', ['get', 'color'], KMK],
        ['case', ['==', ['get', 'terminus'], 1], '-t', '']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.34, 14, 0.62, 17, 1.05],
      'icon-rotate': ['get', 'angle'],
      'icon-rotation-alignment': 'map',
      // same MapLibre pitfall as rotated text: pitch-alignment must be explicit
      'icon-pitch-alignment': 'viewport',
      'icon-allow-overlap': true,
    },
  });
  map.addLayer({
    id: 'stops-names', type: 'symbol', source: 'stops',
    minzoom: 13,
    // metro station names live in their own top-priority layer (see below)
    filter: ['all', ['!=', ['get', 'terminus'], 1], ['!=', ['get', 'metro'], 1], ['==', ['get', 'label'], 1]],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': [NARROW],
      'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10.5, 17, 13.5],
      // 8 candidate anchors: in the densest blocks (badge complexes, terminus
      // names) the four straight ones are all taken and the name must be able
      // to dodge diagonally — a stop without its name is a hard error here
      'text-variable-anchor': ['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
      'text-radial-offset': 0.75,
      'text-justify': 'auto',
    },
    paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-halo-width': 1.7 },
  });
  map.addLayer({
    id: 'stops-terminus-names', type: 'symbol', source: 'stops',
    // below z13 only — from z13 the terminus names ride with the badge
    // complexes (pipeline-reserved rows, never dropped), see below
    minzoom: 10.5, maxzoom: 13,
    filter: ['all', ['==', ['get', 'terminus'], 1], ['!=', ['get', 'metro'], 1], ['==', ['get', 'label'], 1]],
    layout: {
      // terminus: name only — the terminating lines render as boxed badges in
      // their own layer (grid under the dot)
      'text-field': ['get', 'name'],
      'text-font': [NARROW_BOLD],
      'text-size': ['interpolate', ['linear'], ['zoom'], 10.5, 11, 17, 14.5],
      // radial 1.15: at the heaviest nodes (Kaponiera) 0.9 em left no free
      // spot between the badge complex below and the neighbour's name above
      'text-variable-anchor': ['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
      'text-radial-offset': 1.15,
      'text-justify': 'auto',
    },
    paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  });
  // Every metro station is labeled, always: the tunnels run under busy avenues,
  // so in the shared stop-name layer their names lost the collision fight against
  // bus stops and street numbers. Own layer + moveLayer to the very top = first in
  // symbol placement, so these names are never dropped.
  // Terminus stations drop out from z13: their badge complex already prints the
  // station name in its reserved rows, and the doubled label overprinted the dot
  // (Helwan wore three "Helwan"s).
  const metroNamesDef = (id, extra) => ({
    id, type: 'symbol', source: 'stops',
    ...extra,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': [NARROW_BOLD],
      'text-size': ['interpolate', ['linear'], ['zoom'], 11.5, 10.5, 17, 14],
      // diagonals included: a station next to a badge complex (Sadat vs the
      // Abdel Moneim Riad grid) must be able to slide the name past it
      'text-variable-anchor': ['left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
      'text-radial-offset': 0.9,
      'text-justify': 'auto',
    },
    paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  });
  map.addLayer(metroNamesDef('stops-metro-names', {
    minzoom: 11.5, maxzoom: 13,
    filter: ['all', ['==', ['get', 'metro'], 1], ['==', ['get', 'label'], 1]],
  }));
  map.addLayer(metroNamesDef('stops-metro-names-hi', {
    minzoom: 13,
    filter: ['all', ['==', ['get', 'metro'], 1], ['==', ['get', 'label'], 1], ['!=', ['get', 'terminus'], 1]],
  }));
  // Terminus line badges: one small translucent box per line, laid out as a
  // centered grid below the loop (offsets precomputed by the pipeline). The same
  // badges exist in several ZOOM BANDS — in each band the pipeline fused the grids
  // that would collide at that scale into one complex, so only the band matching
  // the current zoom is drawn.
  map.addSource('badges', { type: 'geojson', data: 'data/badges.geojson' });
  const BADGE_BANDS = meta.badgeBands || [[13, 14], [14, 15], [15, 16.5], [16.5, 22]];
  // legacy data without `band` passes every band filter — the disjoint zoom
  // ranges still draw it exactly once, so a stale badges.geojson degrades to the
  // unfused layout instead of an empty map
  const bandC = (b) => ['any', ['!', ['has', 'band']], ['==', ['get', 'band'], b]];
  // CONSTANT text size per band layer — never zoom-interpolated. MapLibre fits
  // the icon-text-fit box at the tile-layout text size but renders the text at
  // the interpolated size, so at fractional zooms the em grid offsets diverge
  // and the drift accumulates row by row: in a 15-row Cairo complex the bottom
  // numbers escaped their boxes entirely (and exports always render at
  // fractional zooms). One number per band = layout and render always agree.
  const BADGE_EM = [7.7, 8.1, 8.7, 9.5, 10];
  const NAME_EM = [9.7, 10.3, 11, 11.9, 12.5];
  const BADGE_LAYERS = BADGE_BANDS.map(([z0, z1], b) => {
    const id = 'stops-terminus-badges-' + b;
    map.addLayer({
      id, type: 'symbol', source: 'badges',
      minzoom: z0, maxzoom: z1,
      filter: ['all', bandC(b), ['has', 'line']],
      layout: {
        'text-field': ['get', 'line'],
        'text-font': [NARROW_BOLD],
        // × sc: crowded complexes arrive pre-shrunk from the pipeline — the
        // per-feature constant keeps layout and render in agreement (the same
        // guarantee as the per-band constant; only ZOOM-interpolated sizes
        // drift against icon-text-fit)
        'text-size': ['*', BADGE_EM[b] ?? 10, ['coalesce', ['get', 'sc'], 1]],
        'text-offset': ['get', 'off'],
        'icon-image': ['concat', 'badge-', ['coalesce', ['get', 'color'], KMK]],
        'icon-text-fit': 'both',
        // top/bottom padding is deliberately uneven: the text box MapLibre fits
        // the icon around includes descender space digits never use (~0.12 em),
        // so a symmetric padding leaves the number hugging the TOP edge of the
        // box — measured on canvas pixels and split back evenly.
        'icon-text-fit-padding': [2.1, 3.5, 0.9, 3.5],
        // a grid must stay complete — a collision-hidden middle badge would read
        // as a data bug, so badges win overlap unconditionally (the pipeline is
        // what keeps separate grids from landing on top of each other)
        'text-allow-overlap': true,
        'icon-allow-overlap': true,
      },
      paint: { 'text-color': ['coalesce', ['get', 'colorDark'], KMK_DARK] },
    });
    return id;
  });
  // Terminus names from z13 up: pipeline-emitted rows riding right above each
  // badge complex, drawn unconditionally like the boxes themselves — so a
  // loop can NEVER be nameless, even at the most saturated nodes where the
  // collision-based layer (kept for z<13) always lost.
  const BADGE_NAME_LAYERS = BADGE_BANDS.map(([z0, z1], b) => {
    const id = 'stops-terminus-names-grid-' + b;
    map.addLayer({
      id, type: 'symbol', source: 'badges',
      minzoom: z0, maxzoom: z1,
      filter: ['all', bandC(b), ['has', 'name']],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': [NARROW_BOLD],
        'text-size': ['*', NAME_EM[b] ?? 12.5, ['coalesce', ['get', 'sc'], 1]],
        'text-anchor': 'bottom',
        'text-offset': ['get', 'off'],
        // pinned so the wrap matches the pipeline's row-height estimate
        'text-max-width': 10,
        'text-line-height': 1.1,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
    });
    return id;
  });
  // Collision-priority ladder — symbol placement runs the TOP layer first, so
  // the stacking below IS the priority order. Top → bottom:
  //   terminus badge grids  — placed unconditionally; first so the layers
  //                           below can dodge the complexes
  //   metro station names   — 8 variable anchors, dodge the badge grids
  //   arterial-name clone   — the 11.5–13 band, see below
  //   terminus names        — the bold anchors of the network
  //   stop names            — MANDATORY: a stop must never lose its name to a
  //                           line number (numbers repeat along the street and
  //                           reappear a block further; a stop name cannot)
  //   line numbers          — once-per-street anchors above the repeats
  //   arterial street names — street names live ON the axis, numbers 0.6 em
  //                           beside it: with names placed first their dense
  //                           repeats grazed the number blocks and emptied
  //                           whole corridors, so names FILL GAPS instead
  //   minor street names
  //   stop dots, then the rest of the base style
  if (map.getLayer('highway-name-minor')) map.moveLayer('highway-name-minor');
  if (map.getLayer('highway-name-major')) map.moveLayer('highway-name-major');
  for (const d of [...NUM_LAYERS].reverse()) map.moveLayer(d.id);
  map.moveLayer('stops-names');
  map.moveLayer('stops-terminus-names');
  // Below z13 arterial names need to outrank even the numbers — the
  // wall-to-wall low-zoom number labels otherwise leave the city unnamed
  // (measured at z12.5: 36 arterial names in the tiles, 4 rendered). A CLONE
  // of the arterial layer covers the 11.5–13 band up here; from z13 the
  // original (below the numbers) takes over.
  const majorDef = style.layers.find((l) => l.id === 'highway-name-major');
  if (majorDef) map.addLayer({ ...majorDef, id: 'highway-name-major-low', minzoom: 11.5, maxzoom: 13 });
  map.moveLayer('stops-metro-names');
  map.moveLayer('stops-metro-names-hi');
  // Badges LAST (= top of the ladder): they draw unconditionally either way,
  // but registering their rectangles first lets the metro names' variable
  // anchors dodge the complexes — Sadat printed straight across the Abdel
  // Moneim Riad grid when the names placed first and could not see it.
  for (const id of [...BADGE_LAYERS, ...BADGE_NAME_LAYERS]) map.moveLayer(id);

  // Mode filters (bus/tram/metro) + line selection: clicking a chip shows only
  // that line's route with all of its stops (properties.arr carry the lists).
  // Metro rides the 'tram' mode slot in the data but answers to its OWN
  // toggle — its features (runs, stops, boxes, number labels) carry metro:1
  // and complex name rows carry 'metro' in their modes string.
  // mline defaults to the presence of its toggle: this city has no amber
  // metroline category, and a stuck-true mline kept the ladder's handed-over
  // bus numbers visible in the trams-only view (numField never switched to
  // tramOnlyNumbers because (B || M) stayed true)
  const state = { bus: true, tram: true, metro: true, mline: !!document.getElementById('toggle-mline'), selected: null };
  const busOnlyNumbers = ['case', ['has', 'busLines'],
    ['format', ['get', 'busLines'], { 'text-color': KMK }],
    ['format', ['get', 'lines'], {}]];
  const tramOnlyNumbers = ['format', ['get', 'lines'], {}];
  function applyFilters() {
    const modes = [state.bus ? 'bus' : null, state.tram ? 'tram' : null].filter(Boolean);
    const modeC = ['in', ['get', 'mode'], ['literal', modes]];
    const selC = state.selected ? ['in', state.selected, ['get', 'arr']] : true;
    // metrolines are an INDEPENDENT category: three bus sub-worlds — plain
    // buses (no mline flag), pure metroline runs (mline=all) and shared
    // corridors (mline=mix, part of BOTH networks, so either toggle keeps them)
    const B = state.bus, M = state.mline;
    // trams and metro share mode 'tram' in the data but split on the metro:1
    // flag — each arm follows its own toggle
    const railModeC = ['any',
      state.tram ? ['all', ['==', ['get', 'mode'], 'tram'], ['!', ['has', 'metro']]] : false,
      state.metro ? ['all', ['==', ['get', 'mode'], 'tram'], ['==', ['get', 'metro'], 1]] : false];
    const busRunC = ['any',
      B ? ['!', ['has', 'mline']] : false,
      M ? ['==', ['get', 'mline'], 'all'] : false,
      (B || M) ? ['==', ['get', 'mline'], 'mix'] : false];
    const runModeC = ['any',
      ['all', ['==', ['get', 'mode'], 'bus'], busRunC],
      railModeC];
    const stopSubC = ['any',
      B ? ['!', ['has', 'mstop']] : false,
      M ? ['==', ['get', 'mstop'], 'all'] : false,
      (B || M) ? ['==', ['get', 'mstop'], 'mix'] : false];
    const stopModeC = ['any',
      ['all', ['==', ['get', 'mode'], 'bus'], stopSubC],
      railModeC];
    const boxSubC = ['any',
      B ? ['!=', ['get', 'color'], MLINE_YELLOW] : false,
      M ? ['==', ['get', 'color'], MLINE_YELLOW] : false];
    const boxModeC = ['any',
      ['all', ['==', ['get', 'mode'], 'bus'], boxSubC],
      railModeC];
    const busLblC = ['any',
      B ? ['!=', ['get', 'color'], MLINE_YELLOW] : false,
      M ? ['any', ['==', ['get', 'color'], MLINE_YELLOW], ['has', 'mLines']] : false];
    // metroline-only view paints shared corridors and their trimmed number
    // rows amber, so the network reads as one continuous system
    map.setPaintProperty('route-line', 'line-color', M && !B
      ? ['case', ['==', ['get', 'mline'], 'mix'], MLINE_YELLOW, ['coalesce', ['get', 'color'], KMK]]
      : ['coalesce', ['get', 'color'], KMK]);
    map.setFilter('route-casing', ['all', runModeC, selC]);
    map.setFilter('route-line', ['all', runModeC, selC]);
    map.setFilter('route-trolley-dash', ['all', ['==', ['get', 'trolley'], 'mix'], runModeC, selC]);
    map.setFilter('route-mline-dash', M && B
      ? ['all', ['==', ['get', 'mline'], 'mix'], selC]
      : ['==', ['get', 'mline'], 'never']);
    map.setFilter('stops-dots', ['all', stopModeC, selC]);
    // with a line selected, names of ALL its stops (no label clustering)
    const lblC = state.selected ? true : ['==', ['get', 'label'], 1];
    map.setFilter('stops-names', ['all', ['!=', ['get', 'terminus'], 1], ['!=', ['get', 'metro'], 1], stopModeC, selC, lblC]);
    map.setFilter('stops-terminus-names', ['all', ['==', ['get', 'terminus'], 1], ['!=', ['get', 'metro'], 1], stopModeC, selC, lblC]);
    map.setFilter('stops-metro-names', ['all', ['==', ['get', 'metro'], 1], stopModeC, selC, lblC]);
    map.setFilter('stops-metro-names-hi', ['all', ['==', ['get', 'metro'], 1], ['!=', ['get', 'terminus'], 1], stopModeC, selC, lblC]);
    // with a line selected only ITS badge stays at the loop
    BADGE_LAYERS.forEach((id, b) => {
      map.setFilter(id, ['all', bandC(b), ['has', 'line'], boxModeC,
        state.selected ? ['==', ['get', 'line'], state.selected] : true]);
    });
    // complex name rows follow: shown while any of the complex's modes is on
    // ('in' does substring search on the "bus,tram" string), and with a line
    // selected only complexes where that line terminates keep their name
    const nameModeC = ['any',
      state.tram ? ['in', 'tram', ['get', 'modes']] : false,
      state.metro ? ['in', 'metro', ['get', 'modes']] : false,
      ['all', ['in', 'bus', ['get', 'modes']], ['any',
        B ? ['!', ['has', 'msome']] : false,
        M ? ['==', ['get', 'mall'], 1] : false,
        (B || M) ? ['all', ['==', ['get', 'msome'], 1], ['!=', ['get', 'mall'], 1]] : false]]];
    BADGE_NAME_LAYERS.forEach((id, b) => {
      map.setFilter(id, ['all', bandC(b), ['has', 'name'], nameModeC,
        state.selected ? ['in', state.selected, ['get', 'arr']] : true]);
    });
    let numC, numField;
    const lblModeC = ['any',
      ['all', ['==', ['get', 'mode'], 'bus'], busLblC],
      railModeC];
    if ((B || M) && !state.tram) {
      // trams hidden: shared corridor labels (mode=tram with busLines) must
      // stay, but they show only the bus part; metro rows (metro:1, never
      // carrying busLines) keep following their own toggle
      numC = ['all', ['any',
        ['all', ['==', ['get', 'mode'], 'bus'], busLblC],
        ['has', 'busLines'],
        state.metro ? ['all', ['==', ['get', 'mode'], 'tram'], ['==', ['get', 'metro'], 1]] : false], selC];
      numField = busOnlyNumbers;
    } else {
      numC = ['all', lblModeC, selC];
      numField = state.tram && !(B || M) ? tramOnlyNumbers : numberField;
    }
    // with only one bus network on, mixed rows shrink to their relevant half
    if (B && !M) numField = ['case', ['all', ['==', ['get', 'mode'], 'bus'], ['has', 'nmLines']], ['format', ['get', 'nmLines'], {}], numField];
    if (M && !B) numField = ['case', ['all', ['==', ['get', 'mode'], 'bus'], ['has', 'mLines']], ['format', ['get', 'mLines'], {}], numField];
    const numPaint = M && !B
      ? ['case', ['has', 'mLines'], MLINE_YELLOW, ['coalesce', ['get', 'color'], KMK]]
      : ['coalesce', ['get', 'color'], KMK];
    for (const d of NUM_LAYERS) {
      map.setFilter(d.id, ['all', d.cond, numC]);
      map.setLayoutProperty(d.id, 'text-field', numField);
      map.setPaintProperty(d.id, 'text-color', numPaint);
    }
  }
  document.getElementById('chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    state.selected = state.selected === b.dataset.line ? null : b.dataset.line;
    document.querySelectorAll('#chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.line === state.selected));
    applyFilters();
  });
  // null-safe: this region's panel only carries the bus toggle (no metro or
  // metroline categories here)
  for (const [id, key] of [['toggle-bus', 'bus'], ['toggle-tram', 'tram'], ['toggle-metro', 'metro'], ['toggle-mline', 'mline']]) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', (e) => { state[key] = e.target.checked; applyFilters(); });
  }
  applyFilters();

  // POSTER-mode PNG export (the look of the official printed KMK city map),
  // three entry points sharing one engine: the CURRENT VIEW, a hand-drawn
  // RECTANGLE, or the WHOLE NETWORK. The requested bbox is rendered in TILES
  // on a hidden map instance and stitched into one image whose long edge
  // targets MAX_OUT pixels — the GPU texture limit constrains a single tile
  // only, not the whole. The zoom is chosen so the bbox exactly fills that
  // budget (DETAIL first: a wider area simply renders at a bigger absolute
  // size instead of losing labels); once the zoom would pass Z_CAP — where the
  // style stops adding content — the leftover budget turns into text pixel
  // density (ratio up to 2, sharp when zooming the file). The PAD overlap
  // reconciles labels at tile seams. map.getStyle() carries the FULL user
  // state: bus/tram filters, selected line, QA overlay.
  const btnView = document.getElementById('export-png');
  const btnArea = document.getElementById('export-area');
  const btnAll = document.getElementById('export-all');
  const exportBusy = (on) => [btnView, btnArea, btnAll].forEach((b) => { b.disabled = on; });
  // Scales the outputs of a size value (plain number, interpolate stops, case
  // branches) by f — used to blow up the symbology for the area poster.
  const scaleOut = (v, f) => {
    if (typeof v === 'number') return v * f;
    if (Array.isArray(v)) {
      if (v[0] === 'interpolate') return v.map((x, i) => (i >= 3 && i % 2 === 0 ? scaleOut(x, f) : x));
      if (v[0] === 'case') return v.map((x, i) => ((i >= 2 && i % 2 === 0) || i === v.length - 1 ? scaleOut(x, f) : x));
      if (v[0] === '*') {
        // badge sizes are ['*', const, per-feature sc] — boost the constant
        const i = v.findIndex((x, j) => j > 0 && typeof x === 'number');
        return i > 0 ? v.map((x, j) => (j === i ? x * f : x)) : ['*', f, v];
      }
    }
    return v;
  };
  // Area-poster styling: every label (street/stop names, numbers, badges),
  // the stop discs and the transit strokes grow by f while the base street
  // grid keeps its scale — the KMK look, where the typography dominates the
  // geometry. All em-based offsets (badge grids, radial offsets) follow the
  // font size automatically.
  const boostStyle = (st, f) => {
    st = JSON.parse(JSON.stringify(st));
    for (const l of st.layers) {
      if (l.type === 'symbol') {
        if (l.layout && l.layout['text-size']) l.layout['text-size'] = scaleOut(l.layout['text-size'], f);
        if (l.layout && l.layout['icon-size']) l.layout['icon-size'] = scaleOut(l.layout['icon-size'], f);
        if (l.paint && l.paint['text-halo-width']) l.paint['text-halo-width'] = scaleOut(l.paint['text-halo-width'], f);
      }
      if (/^route-/.test(l.id) && l.paint && l.paint['line-width']) {
        l.paint['line-width'] = scaleOut(l.paint['line-width'], f);
      }
    }
    // Poster passes only (boostStyle never runs on the WYSIWYG current-view
    // export): arterial street names move ABOVE the transit numbers. On the
    // whole-map sheet (~z13.9) the wall-to-wall number labels otherwise win
    // every collision and the poster ships without a single street name
    // (user report). Stop names, terminus names and the badge grids still
    // outrank them — only the endlessly repeating numbers yield.
    const mi = st.layers.findIndex((l) => l.id === 'highway-name-major');
    if (mi >= 0) {
      const [major] = st.layers.splice(mi, 1);
      let last = -1;
      st.layers.forEach((l, i) => { if (/^street-numbers/.test(l.id)) last = i; });
      st.layers.splice(last >= 0 ? last + 1 : st.layers.length, 0, major);
    }
    return st;
  };
  async function exportBBox(bbox, btn, doneLabel, opts) {
    exportBusy(true);
    const setLbl = (t) => { btn.textContent = t; };
    const PAD = 200;          // CSS px of tile overlap
    const MAX_OUT = window.__exportMaxOut || 16384; // px of the long edge (2D canvas limit)
    // web-mercator fractions of the world covered by the bbox
    const mx = (lng) => (lng + 180) / 360;
    const my = (lat) => {
      const s = Math.sin((lat * Math.PI) / 180);
      return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    };
    const fx = mx(bbox[2]) - mx(bbox[0]);
    const fy = my(bbox[1]) - my(bbox[3]); // mercator y grows southward
    // the zoom at which the long edge lands exactly on MAX_OUT css px
    const zFit = Math.log2(MAX_OUT / (512 * Math.max(fx, fy)));
    let Z;
    if (opts && opts.wysiwyg) {
      // WYSIWYG mode (current view): render at the SCREEN's own zoom — the
      // sheet shows exactly what the user sees, same framing, same
      // stroke-to-label proportions — and the whole budget goes into pixel
      // density (up to 4×), so opened at 100% everything is BIGGER than on
      // screen, never smaller. (The earlier detail-first boost made routes
      // and labels come out tiny relative to the sheet — user report.)
      Z = Math.min(map.getZoom(), 17.3);
    } else {
      // poster mode (whole map, selected area): the bbox fills MAX_OUT at
      // whatever zoom that lands on (~z13.9 for the full network), capped at
      // z15.3 — past that the geometry inflates faster than the text; the
      // leftover budget becomes pixel density
      Z = Math.min(zFit, Math.max(15.3, Math.min(map.getZoom(), 17.3)));
    }
    const RATIO = Math.min(4, Math.max(1, 2 ** (zFit - Z)));
    // big tile = fewer passes, but the tile canvas (contCSS × RATIO device px)
    // must fit the GPU limit — 4096 is the universal floor (this machine's
    // too: measured), so size the tile to keep the request inside it and the
    // ratio real. Actual density is still measured after creation.
    const contCSS = Math.max(1024, Math.floor(4096 / RATIO));
    const tileCSS = contCSS - 2 * PAD;
    // mercator in world pixels at zoom Z (base style tile = 512 px)
    const world = 512 * 2 ** Z;
    const W = Math.round(fx * world), H = Math.round(fy * world); // CSS px of the whole
    const cols = Math.ceil(W / tileCSS), rows = Math.ceil(H / tileCSS);
    const tlx = mx(bbox[0]) * world, tly = my(bbox[3]) * world;
    const px2ll = (x, y) => {
      const n = Math.PI - (2 * Math.PI * y) / world;
      return [(x / world) * 360 - 180, (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))];
    };
    const div = document.createElement('div');
    div.style.cssText = `position:fixed;left:-100000px;top:0;width:${contCSS}px;height:${contCSS}px;`;
    document.body.appendChild(div);
    let m2 = null;
    try {
      m2 = new maplibregl.Map({
        container: div,
        style: opts && opts.boost ? boostStyle(map.getStyle(), opts.boost) : map.getStyle(),
        center: px2ll(tlx + W / 2, tly + H / 2), zoom: Z,
        pixelRatio: RATIO, preserveDrawingBuffer: true, antialias: true,
        attributionControl: false, interactive: false, fadeDuration: 0,
      });
      // canvas-drawn stop icons are not part of the style — re-register them
      addStopIcons(m2);
      const idle = () => new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('tile render timeout')), 45000);
        m2.once('idle', () => { clearTimeout(t); res(); });
      });
      await idle(); // full style load
      // ACTUAL tile pixel density: the GPU can silently clamp the canvas below
      // contCSS×RATIO — stitching geometry uses the MEASURED value, otherwise the
      // crops land in wrong places (reported as "cut-off squares" with blank space).
      const SR = m2.getCanvas().width / contCSS;
      const out = document.createElement('canvas');
      out.width = Math.round(W * SR);
      out.height = Math.round(H * SR);
      const ctx = out.getContext('2d');
      let k = 0;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          setLbl(`Rendering ${++k}/${rows * cols}…`);
          const x0 = i * tileCSS, y0 = j * tileCSS;
          const w = Math.min(tileCSS, W - x0), h = Math.min(tileCSS, H - y0);
          m2.jumpTo({ center: px2ll(tlx + x0 + w / 2, tly + y0 + h / 2), zoom: Z });
          m2.triggerRepaint(); // a jumpTo to the same spot would not emit idle
          await idle();
          ctx.drawImage(m2.getCanvas(),
            ((contCSS - w) / 2) * SR, ((contCSS - h) / 2) * SR, w * SR, h * SR,
            x0 * SR, y0 * SR, w * SR, h * SR);
        }
      }
      setLbl('Saving…');
      // attribution baked into the image (the DOM bar is not part of the canvas)
      const fs = Math.max(16, Math.round(out.width / 130));
      ctx.font = `${fs}px sans-serif`;
      ctx.textBaseline = 'bottom';
      const txt = '© OpenStreetMap contributors · OpenFreeMap · GTFS: İBB Open Data (İETT, Metro İstanbul, TCDD)';
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.fillRect(out.width - tw - fs, out.height - fs * 1.7, tw + fs, fs * 1.7);
      ctx.fillStyle = '#333333';
      ctx.fillText(txt, out.width - tw - fs / 2, out.height - fs * 0.4);
      const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
      if (!blob) throw new Error('toBlob returned null (out of memory?)');
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const a = document.createElement('a');
      a.download = `istanbul-transit_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}_${out.width}x${out.height}.png`;
      a.href = URL.createObjectURL(blob);
      if (!window.__exportNoSave) a.click(); // test hook: render without downloading
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      // QA trace: thumbnail of the whole + 1:1 center crop (tile stitching check)
      const mk = (w2, h2, draw) => {
        const c = document.createElement('canvas');
        c.width = w2; c.height = h2;
        draw(c.getContext('2d'));
        return c.toDataURL('image/png');
      };
      const th = Math.round(400 * out.height / out.width);
      window.__lastExport = {
        width: out.width, height: out.height, tiles: rows * cols, sr: Math.round(SR * 100) / 100, bytes: blob.size,
        z: Math.round(Z * 100) / 100, ratio: Math.round(RATIO * 100) / 100,
        thumb: mk(400, th, (c2) => c2.drawImage(out, 0, 0, 400, th)),
        crop: mk(400, 400, (c2) => c2.drawImage(out, (out.width - 400) / 2, (out.height - 400) / 2, 400, 400, 0, 0, 400, 400)),
      };
    } catch (e) {
      console.error('Export failed', e);
      setLbl('Export failed — see console');
      await new Promise((res) => setTimeout(res, 2500));
    }
    if (m2) try { m2.remove(); } catch (e) { /* the canvas may be gone already */ }
    div.remove();
    exportBusy(false);
    setLbl(doneLabel);
  }

  // Rectangle selection for "select area": crosshair + rubber band; the map
  // holds still while dragging. Esc — or a sub-8 px drag — cancels.
  function selectArea() {
    return new Promise((resolve) => {
      const cont = map.getContainer();
      const box = document.getElementById('area-box');
      const hint = document.getElementById('area-hint');
      hint.style.display = 'block';
      cont.style.cursor = 'crosshair';
      map.dragPan.disable(); map.boxZoom.disable(); map.doubleClickZoom.disable();
      let p0 = null;
      const pt = (e) => {
        const r = cont.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };
      const move = (e) => {
        if (!p0) return;
        const p = pt(e);
        Object.assign(box.style, {
          display: 'block',
          left: Math.min(p0[0], p[0]) + 'px', top: Math.min(p0[1], p[1]) + 'px',
          width: Math.abs(p[0] - p0[0]) + 'px', height: Math.abs(p[1] - p0[1]) + 'px',
        });
      };
      const finish = (result) => {
        cont.removeEventListener('mousedown', down);
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        window.removeEventListener('keydown', key);
        box.style.display = 'none';
        hint.style.display = 'none';
        cont.style.cursor = '';
        map.dragPan.enable(); map.boxZoom.enable(); map.doubleClickZoom.enable();
        resolve(result);
      };
      const down = (e) => { p0 = pt(e); e.preventDefault(); };
      const up = (e) => {
        if (!p0) return;
        const p = pt(e);
        if (Math.abs(p[0] - p0[0]) < 8 || Math.abs(p[1] - p0[1]) < 8) return finish(null);
        const a = map.unproject(p0), b = map.unproject(p);
        finish([Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)]);
      };
      const key = (e) => { if (e.key === 'Escape') finish(null); };
      cont.addEventListener('mousedown', down);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      window.addEventListener('keydown', key);
    });
  }

  btnView.addEventListener('click', () => {
    if (btnView.disabled) return;
    const b = map.getBounds();
    exportBBox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], btnView,
      'Export PNG — current view', { wysiwyg: true });
  });
  btnArea.addEventListener('click', async () => {
    if (btnArea.disabled) return;
    const bbox = await selectArea();
    if (bbox) exportBBox(bbox, btnArea, 'Export PNG — select area', { boost: 1.4 });
  });
  btnAll.addEventListener('click', () => {
    if (btnAll.disabled) return;
    // the data bbox plus a hair of margin, so badge grids at the edge survive
    const [w, s, e, n] = meta.bbox;
    const dx = (e - w) * 0.015, dy = (n - s) * 0.015;
    // boost 1.25: labels grow for legibility when zooming INTO the PNG, and
    // stay just under the complex-separation margin (band edge z13.0 vs the
    // poster's ~z13.35+ render — spacing factor 2^0.35 ≈ 1.27).
    exportBBox([w - dx, s - dy, e + dx, n + dy], btnAll, 'Export PNG — whole map', { boost: 1.25 });
  });

  // Raw GTFS trace — for matching QA; lazy-loaded on first toggle
  // (a large file with all lines included).
  document.getElementById('toggle-shape').addEventListener('change', (e) => {
    if (e.target.checked && !map.getSource('gtfs-shape')) {
      map.addSource('gtfs-shape', { type: 'geojson', data: 'data/gtfs-shape.geojson' });
      map.addLayer({
        id: 'gtfs-shape-line', type: 'line', source: 'gtfs-shape',
        paint: { 'line-color': '#e6003c', 'line-width': 1.8, 'line-dasharray': [2, 2] },
      });
    } else if (map.getLayer('gtfs-shape-line')) {
      map.setLayoutProperty('gtfs-shape-line', 'visibility', e.target.checked ? 'visible' : 'none');
    }
  });

  map.on('click', 'stops-dots', (e) => {
    const f = e.features[0];
    const p = f.properties;
    const label = p.lines.includes(',') ? 'lines' : 'line';
    new maplibregl.Popup({ closeButton: false, offset: 10 })
      .setLngLat(f.geometry.coordinates)
      .setHTML(`<strong>${esc(p.name)}</strong>${p.terminus ? ' · terminus' : ''}<br>${label}: ${esc(p.lines)}`)
      .addTo(map);
  });
  map.on('mouseenter', 'stops-dots', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'stops-dots', () => (map.getCanvas().style.cursor = ''));

  // NOT fitBounds(meta.bbox): single regional lines reach deep into Ilfov, so
  // fitting the data bbox would open on countryside with the city as a small
  // core. Open on the two shores around the Bosphorus instead.
  map.jumpTo({ center: [29.0050, 41.0250], zoom: 10.6 });
}

init().catch((err) => {
  console.error(err);
  document.getElementById('footer').textContent = 'Data loading error: ' + err.message;
});
