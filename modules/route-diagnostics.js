(function(app) {
  'use strict';

  const OWN_SOURCE_PREFIX = 'zalicz-gminy-';
  const ROUTE_WORDS = ['route', 'tour', 'track', 'planned', 'directions', 'itinerary'];
  let watchedMap = null;
  let debounceId = null;
  let lastFingerprint = '';

  function geometrySummary(geometry) {
    if (!geometry || typeof geometry !== 'object') return null;

    const lines = geometry.type === 'LineString'
      ? [geometry.coordinates]
      : geometry.type === 'MultiLineString'
        ? geometry.coordinates
        : [];
    if (!lines.length) return { type: geometry.type || 'unknown' };

    const points = lines.flat().filter(point =>
      Array.isArray(point) &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1])
    );
    const sampleIndexes = [0, Math.floor((points.length - 1) / 2), points.length - 1];

    return {
      type: geometry.type,
      lines: lines.length,
      points: points.length,
      // Three rounded points are enough to identify a route without dumping its full geometry.
      sample: [...new Set(sampleIndexes)]
        .filter(index => index >= 0 && points[index])
        .map(index => points[index].slice(0, 2).map(value => Number(value.toFixed(5))))
    };
  }

  function featuresFromGeoJson(data) {
    if (!data || typeof data !== 'object') return [];
    if (data.type === 'FeatureCollection') return Array.isArray(data.features) ? data.features : [];
    if (data.type === 'Feature') return [data];
    if (data.type && data.coordinates) return [{ type: 'Feature', geometry: data, properties: {} }];
    return [];
  }

  function inspectSourceObject(source) {
    if (!source || typeof source !== 'object') return [];

    const possibleData = [source._data, source.data, source._options?.data];
    for (const data of possibleData) {
      const features = featuresFromGeoJson(data);
      if (features.length) return features;
    }
    return [];
  }

  function candidateScore(sourceId, layerIds) {
    const text = `${sourceId} ${layerIds.join(' ')}`.toLowerCase();
    return ROUTE_WORDS.reduce(
      (score, word) => score + (text.includes(word) ? 10 : 0),
      layerIds.length
    );
  }

  function scan() {
    const map = app.state.map;
    if (!map) return { ok: false, reason: 'Nie znaleziono jeszcze mapy Komoot.' };

    const style = map.getStyle?.() || {};
    const layers = Array.isArray(style.layers) ? style.layers : [];
    const sources = style.sources || {};
    const sourceIds = new Set([
      ...Object.keys(sources),
      ...layers.map(layer => layer.source).filter(source => typeof source === 'string')
    ]);
    const candidates = [];

    for (const sourceId of sourceIds) {
      if (sourceId.startsWith(OWN_SOURCE_PREFIX)) continue;

      const sourceLayers = layers.filter(layer => layer.source === sourceId);
      const lineLayers = sourceLayers.filter(layer => layer.type === 'line');
      if (!lineLayers.length) continue;

      let features = [];
      try {
        features = inspectSourceObject(map.getSource(sourceId));
        if (!features.length && typeof map.querySourceFeatures === 'function') {
          features = map.querySourceFeatures(sourceId) || [];
        }
      } catch (error) {
        // Some vector sources require a source-layer argument. Layer metadata is still useful.
      }

      const geometries = features
        .map(feature => geometrySummary(feature?.geometry))
        .filter(summary => summary?.type === 'LineString' || summary?.type === 'MultiLineString')
        .slice(0, 8);

      candidates.push({
        sourceId,
        sourceType: sources[sourceId]?.type || map.getSource(sourceId)?.type || 'unknown',
        lineLayers: lineLayers.map(layer => ({
          id: layer.id,
          sourceLayer: layer['source-layer'] || null,
          visibility: layer.layout?.visibility || 'visible'
        })),
        score: candidateScore(sourceId, lineLayers.map(layer => layer.id)),
        lineFeaturesFound: geometries.length,
        geometries
      });
    }

    candidates.sort((a, b) =>
      b.score - a.score ||
      b.lineFeaturesFound - a.lineFeaturesFound ||
      a.sourceId.localeCompare(b.sourceId)
    );

    return {
      ok: true,
      page: `${location.origin}${location.pathname}`,
      mapEngine: map.version || map.constructor?.version || map.constructor?.name || 'unknown',
      styleName: style.name || null,
      candidateCount: candidates.length,
      candidates
    };
  }

  function print() {
    const report = scan();
    console.log('[Zalicz Gminy][diagnostyka trasy]', report);
    console.log(
      '[Zalicz Gminy] Skopiuj wynik polecenia: copy(JSON.stringify(zaliczGminyRouteDebug.scan(), null, 2))'
    );
    return report;
  }

  function scheduleScan() {
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => {
      const report = scan();
      const fingerprint = JSON.stringify(report.candidates?.map(candidate => [
        candidate.sourceId,
        candidate.lineLayers.map(layer => layer.id),
        candidate.geometries
      ]));
      if (fingerprint && fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        print();
      }
    }, 500);
  }

  function start() {
    const map = app.state.map;
    if (!map) return false;
    if (watchedMap === map) return true;
    stop();
    watchedMap = map;
    map.on('styledata', scheduleScan);
    map.on('sourcedata', scheduleScan);
    scheduleScan();
    return true;
  }

  function stop() {
    window.clearTimeout(debounceId);
    if (watchedMap) {
      watchedMap.off('styledata', scheduleScan);
      watchedMap.off('sourcedata', scheduleScan);
    }
    watchedMap = null;
  }

  app.modules.routeDiagnostics = { print, scan, start, stop };
  window.zaliczGminyRouteDebug = app.modules.routeDiagnostics;
})(window.ZaliczGminy);
