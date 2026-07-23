(function(app) {
  'use strict';

  const { layerIds, sourceIds, styles } = app.config;
  const { getStorage } = app.modules.bridgeClient;
  let tracks = [];

  function getNodePoints(nodes) {
    const points = [];

    for (const node of nodes) {
      const lat = Number(node.getAttribute('lat'));
      const lon = Number(node.getAttribute('lon'));

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        points.push([lon, lat]);
      }
    }

    return points;
  }

  function parseGpx(gpxText) {
    const doc = new DOMParser().parseFromString(gpxText, 'application/xml');

    if (doc.querySelector('parsererror')) {
      throw new Error('Nieprawidłowy plik GPX');
    }

    const features = [];

    for (const segment of doc.querySelectorAll('trkseg')) {
      const coordinates = getNodePoints(segment.querySelectorAll('trkpt'));
      if (coordinates.length >= 2) {
        features.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates }
        });
      }
    }

    for (const route of doc.querySelectorAll('rte')) {
      const coordinates = getNodePoints(route.querySelectorAll('rtept'));
      if (coordinates.length >= 2) {
        features.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates }
        });
      }
    }

    if (features.length === 0) {
      throw new Error('GPX nie zawiera trasy ani śladu');
    }

    return { type: 'FeatureCollection', features };
  }

  function getEmptyFeatureCollection() {
    return { type: 'FeatureCollection', features: [] };
  }

  function getGpxFeatureCollection() {
    const features = [];

    for (const track of tracks) {
      for (const feature of track.geojson.features) {
        features.push({
          ...feature,
          properties: {
            ...(feature.properties || {}),
            id: track.id,
            name: track.name
          }
        });
      }
    }

    return { type: 'FeatureCollection', features };
  }

  function removeGpxLayers() {
    if (!app.state.map) return;

    for (const layerId of [layerIds.gpxLine, layerIds.gpxCasing]) {
      if (app.state.map.getLayer(layerId)) {
        app.state.map.removeLayer(layerId);
      }
    }

    if (app.state.map.getSource(sourceIds.gpx)) {
      app.state.map.removeSource(sourceIds.gpx);
    }
  }

  function renderGpx() {
    if (!app.state.map) return;

    const data = tracks.length > 0
      ? getGpxFeatureCollection()
      : getEmptyFeatureCollection();

    const source = app.state.map.getSource(sourceIds.gpx);
    if (source) {
      source.setData(data);
    } else {
      app.state.map.addSource(sourceIds.gpx, {
        type: 'geojson',
        data
      });
    }

    if (!app.state.map.getLayer(layerIds.gpxCasing)) {
      app.state.map.addLayer({
        id: layerIds.gpxCasing,
        type: 'line',
        source: sourceIds.gpx,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: styles.gpxCasing
      });
    }

    if (!app.state.map.getLayer(layerIds.gpxLine)) {
      app.state.map.addLayer({
        id: layerIds.gpxLine,
        type: 'line',
        source: sourceIds.gpx,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: styles.gpxLine
      });
    }
  }

  function setGpx(gpxText, name, id) {
    if (!gpxText || !gpxText.trim()) {
      throw new Error('Plik GPX jest pusty');
    }

    const geojson = parseGpx(gpxText);
    const track = {
      id: id || Math.random().toString(36).slice(2),
      name: name || 'track.gpx',
      text: gpxText,
      geojson
    };

    const existingIndex = tracks.findIndex(item => item.id === track.id);
    if (existingIndex >= 0) {
      tracks[existingIndex] = track;
    } else {
      tracks.push(track);
    }

    renderGpx();

    return {
      id: track.id,
      name: track.name,
      tracksCount: geojson.features.length
    };
  }

  function removeGpx(id) {
    if (id) {
      const tracksCount = tracks.length;
      tracks = tracks.filter(track => track.id !== id);
      if (tracksCount === tracks.length && tracksCount === 1) {
        tracks = [];
      }
      renderGpx();
      return;
    }

    removeGpxLayers();
    tracks = [];
  }

  async function loadStoredGpx() {
    const storage = await getStorage(['zaliczGminyGpx', 'zaliczGminyGpxList']);
    const storedTracks = Array.isArray(storage.zaliczGminyGpxList)
      ? storage.zaliczGminyGpxList
      : (storage.zaliczGminyGpx ? [storage.zaliczGminyGpx] : []);

    tracks = [];

    for (const track of storedTracks) {
      if (!track || !track.text) continue;

      try {
        setGpx(track.text, track.name, track.id);
      } catch (error) {
        console.error(`Pominięto GPX "${track.name || 'track.gpx'}":`, error);
      }
    }

    renderGpx();
    return getTracksSummary();
  }

  function getTracksSummary() {
    return tracks.map(track => ({
      id: track.id,
      name: track.name
    }));
  }

  app.modules.gpx = {
    getTracksSummary,
    loadStoredGpx,
    removeGpx,
    renderGpx,
    setGpx
  };
})(window.ZaliczGminy);
