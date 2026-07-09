/**
 * Zonkartan — lazy Leaflet-ö (ramverksfri).
 *
 * Renderare: Leaflet + Carto Voyager-RASTER = appens egen ljusa baskarta
 * (map_screen.dart:941) → webbkartan ser ut som appen. ~42KB gz, laddas
 * dynamiskt FÖRST vid synlighet/interaktion — aldrig i sidans kritiska väg.
 *
 * Config (data-map-config, byggs av build-manifest + sidmallen):
 * {
 *   bounds: [[latMin,lonMin],[latMax,lonMax]],
 *   attribution: "IenW ED-269 · …",
 *   layers: [{ id, url, gzBytes, typeProp, zoneKeyDefault, defaultOn, label }],
 *   styles: { KEY: { fill, stroke, width } },   // bara landets typer
 *   titles: { KEY: "CTR — kontrollzon" }        // classifier_strings, sidans språk
 * }
 *
 * Load-UX: Σ defaultOn gzBytes ≤ 1,5 MB → auto vid synlighet; annars (eller
 * vid Save-Data) klick-knapp. Zonrendering i app-paritet: stora zoner målas
 * först (små överst). Scrollhjuls-zoom först efter klick (ingen scrollfälla).
 */

interface LayerCfg {
  id: string;
  url: string;
  gzBytes: number;
  typeProp: string | null;
  zoneKeyDefault?: string;
  defaultOn: boolean;
  label?: string;
}
interface ZoneStyle {
  fill: string;
  stroke: string;
  width: number;
}
interface MapCfg {
  bounds: [[number, number], [number, number]];
  attribution?: string;
  layers: LayerCfg[];
  styles: Record<string, ZoneStyle>;
  titles: Record<string, string>;
}

const host = document.getElementById('zone-map');
const rawCfg = host?.dataset.mapConfig;

if (host && rawCfg) {
  const cfg: MapCfg = JSON.parse(rawCfg);
  const AUTO_BUDGET = 1_500_000;
  const conn = (navigator as any).connection;
  const saveData = conn?.saveData === true;
  const defaultBytes = cfg.layers
    .filter((l) => l.defaultOn)
    .reduce((sum, l) => sum + (l.gzBytes || 0), 0);
  const auto = !saveData && defaultBytes <= AUTO_BUDGET;

  let booted = false;
  const boot = () => {
    if (booted) return;
    booted = true;
    init().catch(() => {
      host.innerHTML = `<div class="mapframe__skeleton"><p class="small" style="padding:1rem;text-align:center">${host.dataset.msgError ?? ''}</p></div>`;
    });
  };

  if (auto) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          boot();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(host);
  } else {
    // Klick-att-ladda: knapp med storleksangivelse
    const mb = Math.max(0.1, defaultBytes / 1_000_000).toFixed(1);
    const btn = document.createElement('button');
    btn.className = 'zonemap-loadbtn';
    btn.textContent = (host.dataset.msgLoadTemplate ?? 'Load zones ({mb} MB)').replace('{mb}', mb);
    btn.addEventListener('click', boot, { once: true });
    host.appendChild(btn);
  }

  async function init() {
    // @ts-expect-error — CSS-import hanteras av Vite
    await import('leaflet/dist/leaflet.css');
    const L = (await import('leaflet')).default;

    host!.querySelector('.mapframe__skeleton')?.remove();
    host!.querySelector('.zonemap-loadbtn')?.remove();

    const map = L.map(host!, {
      preferCanvas: true,
      scrollWheelZoom: false, // aktiveras vid klick — ingen scrollfälla
      zoomSnap: 0.5,
    });
    map.on('click', () => map.scrollWheelZoom.enable());
    map.fitBounds(cfg.bounds, { padding: [12, 12] });

    // Appens ljusa baskarta (map_screen.dart:941) — samma värld som i appen.
    L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' +
        (cfg.attribution ? ` · ${cfg.attribution}` : ''),
      maxZoom: 19,
    }).addTo(map);

    const resolveKey = (props: Record<string, unknown>, layer: LayerCfg): string => {
      const raw =
        (layer.typeProp && (props[layer.typeProp] as string)) ||
        (props['_zoneType'] as string) ||
        (props['type'] as string) ||
        layer.zoneKeyDefault ||
        'DEFAULT';
      const key = String(raw).toUpperCase();
      if (cfg.styles[key]) return key;
      const stripped = key.replace(/_[A-Z]{2}$/, '');
      return cfg.styles[stripped] ? stripped : 'DEFAULT';
    };

    const popupHtml = (props: Record<string, unknown>, key: string): string => {
      const esc = (s: unknown) =>
        String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
      const rows: string[] = [];
      const title = cfg.titles[key] ?? cfg.titles[key.replace(/_[A-Z]{2}$/, '')] ?? key;
      rows.push(`<strong>${esc(title)}</strong>`);
      const name = props['name'] ?? props['identifier'] ?? props['Name'];
      if (name) rows.push(esc(name));
      const lo = props['lowerLimit'];
      const hi = props['upperLimit'];
      if (lo !== undefined || hi !== undefined)
        rows.push(`${lo ?? '—'} – ${hi ?? '—'} ${esc(props['uom'] ?? '')}`);
      if (props['authority']) rows.push(`<span class="small">${esc(props['authority'])}</span>`);
      const msg = props['message'];
      if (typeof msg === 'string' && msg.trim()) rows.push(`<span class="small">${esc(msg.slice(0, 280))}</span>`);
      return rows.join('<br>');
    };

    // Grov geometriyta för ritordning (stora först → små överst, appens regel)
    const roughArea = (geom: any): number => {
      let minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
      const walk = (coords: any) => {
        if (typeof coords[0] === 'number') {
          const [lo, la] = coords;
          if (la < minLa) minLa = la;
          if (la > maxLa) maxLa = la;
          if (lo < minLo) minLo = lo;
          if (lo > maxLo) maxLo = lo;
        } else coords.forEach(walk);
      };
      if (geom?.coordinates) walk(geom.coordinates);
      return (maxLa - minLa) * (maxLo - minLo);
    };

    const loadLayer = async (layer: LayerCfg, index = 0) => {
      const res = await fetch(layer.url);
      if (!res.ok) throw new Error(`${layer.id}: HTTP ${res.status}`);
      const gj = await res.json();
      if (Array.isArray(gj.features)) {
        gj.features.sort((a: any, b: any) => roughArea(b.geometry) - roughArea(a.geometry));
      }
      // Eget pane per lager → zonerna kan tona in lagervis efter baskartan
      // ("Luftrum i rörelse"). Reduced-motion nollar transitionen via global CSS.
      const paneName = `zones-${layer.id}`;
      const pane = map.getPane(paneName) ?? map.createPane(paneName);
      pane.style.opacity = '0';
      pane.style.transition = 'opacity 350ms cubic-bezier(0.215, 0.61, 0.355, 1)';
      const renderer = L.canvas({ pane: paneName });
      L.geoJSON(gj, {
        pane: paneName,
        renderer,
        style: (feature) => {
          const key = resolveKey(feature?.properties ?? {}, layer);
          const s = cfg.styles[key] ?? cfg.styles['DEFAULT'];
          return { color: s.stroke, weight: s.width, fillColor: s.fill, fillOpacity: 1, opacity: 1 };
        },
        onEachFeature: (feature, lyr) => {
          const key = resolveKey(feature.properties ?? {}, layer);
          lyr.bindPopup(popupHtml(feature.properties ?? {}, key), { maxWidth: 280 });
        },
        // Punkter (heliports m.m.) → små cirkelmarkörer i zonens färg
        pointToLayer: (feature, latlng) => {
          const key = resolveKey(feature.properties ?? {}, layer);
          const s = cfg.styles[key] ?? cfg.styles['DEFAULT'];
          return L.circleMarker(latlng, { pane: paneName, renderer, radius: 5, color: s.stroke, weight: 1.5, fillColor: s.fill, fillOpacity: 1 });
        },
      }).addTo(map);
      setTimeout(() => { pane.style.opacity = '1'; }, 80 + index * 120);
    };

    await Promise.allSettled(
      cfg.layers.filter((l) => l.defaultOn).map((l, i) => loadLayer(l, i)),
    );

    // Extra lager bakom checkboxar (Leaflets inbyggda lagerkontroll, lazy fetch)
    const extras = cfg.layers.filter((l) => !l.defaultOn);
    if (extras.length > 0) {
      const control = L.control.layers(undefined, {}, { collapsed: true, position: 'topright' });
      for (const layer of extras) {
        const group = L.layerGroup();
        let fetched = false;
        group.on('add', () => {
          if (fetched) return;
          fetched = true;
          fetch(layer.url)
            .then((r) => r.json())
            .then((gj) => {
              if (Array.isArray(gj.features))
                gj.features.sort((a: any, b: any) => roughArea(b.geometry) - roughArea(a.geometry));
              L.geoJSON(gj, {
                style: (f) => {
                  const key = resolveKey(f?.properties ?? {}, layer);
                  const s = cfg.styles[key] ?? cfg.styles['DEFAULT'];
                  return { color: s.stroke, weight: s.width, fillColor: s.fill, fillOpacity: 1, opacity: 1 };
                },
                onEachFeature: (f, lyr) => {
                  const key = resolveKey(f.properties ?? {}, layer);
                  lyr.bindPopup(popupHtml(f.properties ?? {}, key), { maxWidth: 280 });
                },
              }).addTo(group);
            })
            .catch(() => {});
        });
        const mb = layer.gzBytes ? ` (~${Math.max(0.1, layer.gzBytes / 1_000_000).toFixed(1)} MB)` : '';
        control.addOverlay(group, `${layer.label ?? layer.id}${mb}`);
      }
      control.addTo(map);
    }
  }
}

export {};
