(function(app) {
  'use strict';

  const polygonsByRequest = new Map();
  const pendingPolygonRequests = new Map();
  const { zoom: zoomConfig } = app.config;
  const { fetchResource, getStorage, setStorage } = app.modules.extensionBridge;

  const api = globalThis.createZaliczGmineApi(fetchResource);

  async function loadUserCommunesFromApi(userId) {
    const data = await api.getUserCommunes(userId, 'pl');

    const communeIds = new Set(data.items.map(item => String(item.id)));
    app.state.userCommunes = communeIds;
    app.state.userCommunesSource = 'api';
    app.state.userId = String(userId);
    setStorage({ communesCount: communeIds.size });
    return communeIds;
  }

  async function loadUserCommunes() {
    const storage = await getStorage(['zaliczGminyUserId']);
    return reloadUserCommunes(storage.zaliczGminyUserId);
  }

  async function reloadUserCommunes(userId) {
    const normalizedId = userId ? String(userId).trim() : '';
    // only numeric user ID
    if (!/^\d+$/.test(normalizedId)) {
      throw new Error('Nie ustawiono poprawnego ID użytkownika ZaliczGmine.pl');
    }

    return loadUserCommunesFromApi(normalizedId);
  }

  function getApiZoomForMapZoom(mapZoom) {
    const zoom = Number.isFinite(mapZoom) ? mapZoom : zoomConfig.minApiZoom;
    if (zoom <= zoomConfig.globalMaxMapZoom) {
      return zoomConfig.minApiZoom;
    }

    const roundedZoom = zoom > zoomConfig.minApiZoom
      ? Math.max(zoomConfig.minApiZoom + 1, Math.floor(zoom))
      : zoomConfig.minApiZoom;

    return Math.max(
      zoomConfig.minApiZoom,
      Math.min(zoomConfig.maxApiZoom, roundedZoom)
    );
  }

  function getGridPrecision(apiZoom) {
    if (apiZoom <= 9) return 1;
    if (apiZoom <= 11) return 2;
    if (apiZoom <= 13) return 3;
    return 4;
  }

  function roundToGrid(value, precision) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  function normalizeBounds(bounds) {
    const north = bounds.getNorth();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const latPadding = (north - south) * zoomConfig.boundsPaddingRatio;
    const lngPadding = (east - west) * zoomConfig.boundsPaddingRatio;

    return {
      north: north + latPadding,
      east: east + lngPadding,
      south: south - latPadding,
      west: west - lngPadding
    };
  }

  function getCacheBounds(bounds, apiZoom) {
    const precision = getGridPrecision(apiZoom);

    return {
      north: Number(roundToGrid(bounds.north, precision).toFixed(precision)),
      east: Number(roundToGrid(bounds.east, precision).toFixed(precision)),
      south: Number(roundToGrid(bounds.south, precision).toFixed(precision)),
      west: Number(roundToGrid(bounds.west, precision).toFixed(precision))
    };
  }

  function getPolygonRequestForMap(map) {
    const apiZoom = getApiZoomForMapZoom(map.getZoom());

    if (apiZoom <= zoomConfig.globalMaxMapZoom) {
      return {
        apiZoom: zoomConfig.minApiZoom,
        cacheKey: `polygons:${zoomConfig.minApiZoom}`
      };
    }

    const bounds = normalizeBounds(map.getBounds());
    const cacheBounds = getCacheBounds(bounds, apiZoom);

    return {
      apiZoom,
      bounds: cacheBounds,
      cacheKey: `polygons:${apiZoom}:${cacheBounds.north}:${cacheBounds.east}:${cacheBounds.south}:${cacheBounds.west}`
    };
  }

  function rememberPolygons(cacheKey, polygons) {
    if (polygonsByRequest.has(cacheKey)) {
      polygonsByRequest.delete(cacheKey);
    }

    polygonsByRequest.set(cacheKey, polygons);

    let attempts = 0;
    const maxAttempts = polygonsByRequest.size + 2;

    while (
      polygonsByRequest.size > zoomConfig.maxCachedRequests &&
      attempts++ < maxAttempts
    ) {
      const oldestKey = polygonsByRequest.keys().next().value;
      if (
        oldestKey === cacheKey ||
        oldestKey === app.state.polygonsKey ||
        oldestKey === `polygons:${zoomConfig.minApiZoom}`
      ) {
        const oldestPolygons = polygonsByRequest.get(oldestKey);
        polygonsByRequest.delete(oldestKey);
        polygonsByRequest.set(oldestKey, oldestPolygons);
        continue;
      }

      polygonsByRequest.delete(oldestKey);
    }
  }

  async function fetchPolygons(request) {
    if (polygonsByRequest.has(request.cacheKey)) {
      const cachedPolygons = polygonsByRequest.get(request.cacheKey);
      rememberPolygons(request.cacheKey, cachedPolygons);
      return cachedPolygons;
    }

    if (pendingPolygonRequests.has(request.cacheKey)) {
      return pendingPolygonRequests.get(request.cacheKey);
    }

    try {
      const pendingRequest = api.getPolygons(request.apiZoom, 'pl', request.bounds).then(items => {
        rememberPolygons(request.cacheKey, items);
        console.log(`Zalicz Gminy: pobrano ${items.length} gmin dla zoom=${request.apiZoom}`);
        return items;
      });

      pendingPolygonRequests.set(request.cacheKey, pendingRequest);
      return await pendingRequest;
    } catch (error) {
      console.error(`Zalicz Gminy: błąd pobierania gmin dla zoom=${request.apiZoom}:`, error);
      return null;
    } finally {
      pendingPolygonRequests.delete(request.cacheKey);
    }
  }

  function activatePolygons(request, polygons) {
    app.state.polygonsKey = request.cacheKey;
    app.state.polygons = polygons;
  }

  function convertToGeoJSON(items, filterVisited = null) {
    const features = [];

    for (const item of items) {
      try {
        const visited = app.state.userCommunes.has(String(item.i));
        if (filterVisited !== null && visited !== filterVisited) continue;

        const coordinates = JSON.parse(item.c);
        const convertedCoordinates = coordinates.map(ring =>
          ring.map(coord => [coord[1], coord[0]])
        );

        features.push({
          type: 'Feature',
          properties: {
            id: item.i,
            name: item.n,
            visited
          },
          geometry: {
            type: 'Polygon',
            coordinates: convertedCoordinates
          }
        });
      } catch (e) {
        console.warn(`Zalicz Gminy: pominięto błędny polygon gminy ${item.i}`);
      }
    }

    return { type: 'FeatureCollection', features };
  }

  app.modules.communesData = {
    loadUserCommunes,
    reloadUserCommunes,
    getApiZoomForMapZoom,
    getPolygonRequestForMap,
    fetchPolygons,
    activatePolygons,
    convertToGeoJSON
  };
})(window.ZaliczGminy);
