(function(app) {
  'use strict';

  const KOMOOT_ROUTE_SOURCE = 'komoot_tour';
  const { layerIds, sourceIds, styles, zoom: zoomConfig } = app.config;
  let watchedMap = null;
  let debounceId = null;
  let calculationId = 0;
  const preparedCommunes = new WeakMap();
  const CALCULATION_CHUNK_SIZE = 50;

  function featuresFromSource(source) {
    if (!source || typeof source !== 'object') return [];
    const data = source._data || source.data || source._options?.data;
    if (!data || typeof data !== 'object') return [];
    if (data.type === 'FeatureCollection') return Array.isArray(data.features) ? data.features : [];
    if (data.type === 'Feature') return [data];
    if (data.type === 'LineString' || data.type === 'MultiLineString') {
      return [{ type: 'Feature', geometry: data }];
    }
    return [];
  }

  function getRouteLines() {
    if (!app.state.map) return [];
    const source = app.state.map.getSource(KOMOOT_ROUTE_SOURCE);

    return featuresFromSource(source).flatMap(feature => {
      const geometry = feature?.geometry;
      if (geometry?.type === 'LineString') return [geometry.coordinates];
      if (geometry?.type === 'MultiLineString') return geometry.coordinates;
      return [];
    }).map(line => line.filter(point =>
      Array.isArray(point) &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1])
    )).filter(line => line.length > 1);
  }

  function boundsOfPoints(points) {
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (const point of points) {
      bounds[0] = Math.min(bounds[0], point[0]);
      bounds[1] = Math.min(bounds[1], point[1]);
      bounds[2] = Math.max(bounds[2], point[0]);
      bounds[3] = Math.max(bounds[3], point[1]);
    }
    return bounds;
  }

  function boundsOverlap(a, b) {
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  }

  function orientation(a, b, c) {
    const value = (b[1] - a[1]) * (c[0] - b[0]) -
      (b[0] - a[0]) * (c[1] - b[1]);
    if (Math.abs(value) < 1e-12) return 0;
    return value > 0 ? 1 : 2;
  }

  function pointOnSegment(point, a, b) {
    return orientation(a, point, b) === 0 &&
      point[0] <= Math.max(a[0], b[0]) + 1e-12 &&
      point[0] >= Math.min(a[0], b[0]) - 1e-12 &&
      point[1] <= Math.max(a[1], b[1]) + 1e-12 &&
      point[1] >= Math.min(a[1], b[1]) - 1e-12;
  }

  function segmentsIntersect(a, b, c, d) {
    const segmentBoundsA = boundsOfPoints([a, b]);
    const segmentBoundsB = boundsOfPoints([c, d]);
    if (!boundsOverlap(segmentBoundsA, segmentBoundsB)) return false;

    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    return (o1 !== o2 && o3 !== o4) ||
      (o1 === 0 && pointOnSegment(c, a, b)) ||
      (o2 === 0 && pointOnSegment(d, a, b)) ||
      (o3 === 0 && pointOnSegment(a, c, d)) ||
      (o4 === 0 && pointOnSegment(b, c, d));
  }

  function pointInRing(point, ring) {
    let inside = false;
    for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
      const a = ring[i];
      const b = ring[previous];
      if (pointOnSegment(point, a, b)) return true;
      const crosses = (a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) /
          (b[1] - a[1]) + a[0];
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function pointInPolygon(point, rings) {
    if (!rings.length || !pointInRing(point, rings[0])) return false;
    return !rings.slice(1).some(ring => pointInRing(point, ring));
  }

  function lineIntersectsPolygon(line, lineBounds, rings, polygonBounds) {
    if (!boundsOverlap(lineBounds, polygonBounds)) return false;
    if (line.some(point => pointInPolygon(point, rings))) return true;

    for (let lineIndex = 1; lineIndex < line.length; lineIndex++) {
      const a = line[lineIndex - 1];
      const b = line[lineIndex];
      if (!boundsOverlap(boundsOfPoints([a, b]), polygonBounds)) continue;

      for (const ring of rings) {
        for (let ringIndex = 1; ringIndex < ring.length; ringIndex++) {
          if (segmentsIntersect(a, b, ring[ringIndex - 1], ring[ringIndex])) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function parseCommune(item) {
    const cacheable = item !== null && typeof item === 'object';
    if (cacheable && preparedCommunes.has(item)) return preparedCommunes.get(item);

    try {
      const rawRings = JSON.parse(item.c);
      const rings = rawRings.map(ring => ring.map(coordinate => [
        coordinate[1],
        coordinate[0]
      ]));
      const points = rings.flat();
      const commune = points.length
        ? { item, rings, bounds: boundsOfPoints(points) }
        : null;
      if (cacheable) preparedCommunes.set(item, commune);
      return commune;
    } catch (error) {
      if (cacheable) preparedCommunes.set(item, null);
      return null;
    }
  }

  function waitForIdleTime() {
    return new Promise(resolve => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(resolve, { timeout: 100 });
      } else {
        window.setTimeout(resolve, 0);
      }
    });
  }

  async function findIntersectedCommunes(lines, polygons, id) {
    const preparedLines = lines.map(line => ({
      points: line,
      bounds: boundsOfPoints(line)
    }));
    const matches = [];

    // Oddaj przeglądarce czas na narysowanie właśnie załadowanej warstwy gmin.
    await waitForIdleTime();

    for (let start = 0; start < polygons.length; start += CALCULATION_CHUNK_SIZE) {
      if (id !== calculationId) return null;

      const end = Math.min(start + CALCULATION_CHUNK_SIZE, polygons.length);
      for (let index = start; index < end; index++) {
        const item = polygons[index];
        const commune = parseCommune(item);
        if (!commune) continue;
        if (preparedLines.some(line =>
          lineIntersectsPolygon(line.points, line.bounds, commune.rings, commune.bounds)
        ) && !app.state.userCommunes.has(String(item.i))) {
          matches.push(item);
        }
      }

      if (end < polygons.length) await waitForIdleTime();
    }

    return matches;
  }

  function toGeoJson(items) {
    return {
      type: 'FeatureCollection',
      features: items.map(item => ({
        type: 'Feature',
        properties: { id: String(item.i) },
        geometry: {
          type: 'Polygon',
          coordinates: JSON.parse(item.c).map(ring =>
            ring.map(coordinate => [coordinate[1], coordinate[0]])
          )
        }
      }))
    };
  }

  function findInsertBeforeLayer() {
    const layers = app.state.map?.getStyle()?.layers || [];
    const labelWords = ['label', 'poi', 'place', 'road-label'];
    return layers.find(layer =>
      labelWords.some(word => layer.id.toLowerCase().includes(word))
    )?.id || null;
  }

  function render(items) {
    const map = app.state.map;
    if (!map || !map.isStyleLoaded()) return;
    const data = toGeoJson(items);
    const source = map.getSource(sourceIds.routeCommunes);

    if (source) source.setData(data);
    else map.addSource(sourceIds.routeCommunes, { type: 'geojson', data });

    const beforeLayer = findInsertBeforeLayer();
    const visibility = app.state.communesVisible ? 'visible' : 'none';
    if (!map.getLayer(layerIds.routeCommunesFill)) {
      map.addLayer({
        id: layerIds.routeCommunesFill,
        type: 'fill',
        source: sourceIds.routeCommunes,
        layout: { visibility },
        paint: styles.routeCommunesFill
      }, beforeLayer);
    }
    if (!map.getLayer(layerIds.routeCommunesOutline)) {
      map.addLayer({
        id: layerIds.routeCommunesOutline,
        type: 'line',
        source: sourceIds.routeCommunes,
        layout: { visibility },
        paint: styles.routeCommunesOutline
      }, beforeLayer);
    }
  }

  async function refresh() {
    const id = ++calculationId;
    const lines = getRouteLines();
    const polygons = app.state.polygons || [];
    const matches = lines.length && polygons.length
      ? await findIntersectedCommunes(lines, polygons, id)
      : [];
    if (id !== calculationId || !matches) return;

    app.state.routeCommuneIds = new Set(matches.map(item => String(item.i)));
    render(matches);
    console.log(
      `Zalicz Gminy: trasa przecina ${matches.length} gmin ` +
      `(fragmenty trasy: ${lines.length})`
    );
  }

  function scheduleRefresh() {
    window.clearTimeout(debounceId);
    // Unieważnij także obliczenie, które już trwa.
    calculationId++;
    debounceId = window.setTimeout(() => {
      refresh().catch(error => {
        console.error('Zalicz Gminy: błąd analizy trasy:', error);
      });
    }, zoomConfig.debounceMs);
  }

  function setVisible(visible) {
    const visibility = visible ? 'visible' : 'none';
    for (const layerId of [layerIds.routeCommunesFill, layerIds.routeCommunesOutline]) {
      if (app.state.map?.getLayer(layerId)) {
        app.state.map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    }
  }

  function start() {
    const map = app.state.map;
    if (!map || watchedMap === map) return;
    watchedMap = map;
    map.on('sourcedata', event => {
      if (event.sourceId === KOMOOT_ROUTE_SOURCE) scheduleRefresh();
    });
    scheduleRefresh();
  }

  app.modules.plannedRoute = { refresh, render, scheduleRefresh, setVisible, start };
})(window.ZaliczGminy);
