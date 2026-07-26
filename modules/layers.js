(function(app) {
  'use strict';

  const { layerIds, sourceIds, styles, zoom: zoomConfig } = app.config;
  const SHOW_VISITED_COMMUNES = false;
  const activeCommuneLayerIds = [
    layerIds.unvisitedFill,
    layerIds.unvisitedOutline,
    ...(SHOW_VISITED_COMMUNES ? [layerIds.visitedFill, layerIds.visitedOutline] : [])
  ];
  let latestPolygonRequestId = 0;
  let styleObserverAttached = false;
  let zoomObserverAttached = false;

  function setMapboxSource(sourceId, geojsonData) {
    const source = app.state.map.getSource(sourceId);
    if (source) {
      source.setData(geojsonData);
    } else {
      app.state.map.addSource(sourceId, { type: 'geojson', data: geojsonData });
    }
  }

  function findInsertBeforeLayer() {
    const style = app.state.map.getStyle();
    if (!style || !style.layers) return null;

    const labelTypes = ['label', 'poi', 'place', 'road-label'];
    const layer = style.layers.find(styleLayer =>
      labelTypes.some(type => styleLayer.id.toLowerCase().includes(type))
    );

    return layer ? layer.id : null;
  }

  function removeLayers() {
    for (const layerId of activeCommuneLayerIds) {
      if (app.state.map.getLayer(layerId)) app.state.map.removeLayer(layerId);
    }
  }

  function allLayersExist() {
    return activeCommuneLayerIds.every(layerId => app.state.map.getLayer(layerId));
  }

  function shouldShowCommuneOutlines() {
    return app.state.map.getZoom() > zoomConfig.lowZoomOutlineMaxZoom;
  }

  function addLayer(layerConfig, beforeLayer) {
    const layout = {
      visibility: app.state.communesVisible ? 'visible' : 'none'
    };

    app.state.map.addLayer({ ...layerConfig, layout }, beforeLayer);
  }

  function addCommunesLayers() {
    if (!app.state.map || !app.state.polygons) return;

    const { convertToGeoJSON } = app.modules.communesApi;
    const beforeLayer = findInsertBeforeLayer();

    setMapboxSource(sourceIds.visited, convertToGeoJSON(app.state.polygons, true));
    setMapboxSource(sourceIds.unvisited, convertToGeoJSON(app.state.polygons, false));

    removeLayers();

    addLayer({
      id: layerIds.unvisitedFill,
      type: 'fill',
      source: sourceIds.unvisited,
      paint: styles.unvisitedFill
    }, beforeLayer);

    addLayer({
      id: layerIds.unvisitedOutline,
      type: 'line',
      source: sourceIds.unvisited,
      paint: {
        ...styles.unvisitedOutline,
        'line-opacity': shouldShowCommuneOutlines()
          ? styles.unvisitedOutline['line-opacity']
          : 0
      }
    }, beforeLayer);

    if (SHOW_VISITED_COMMUNES) {
      addLayer({
        id: layerIds.visitedFill,
        type: 'fill',
        source: sourceIds.visited,
        paint: styles.visitedFill
      }, beforeLayer);

      addLayer({
        id: layerIds.visitedOutline,
        type: 'line',
        source: sourceIds.visited,
        paint: styles.visitedOutline
      }, beforeLayer);
    }
  }

  function updateCommunesSources() {
    if (!app.state.map || !app.state.polygons) return;

    const { convertToGeoJSON } = app.modules.communesApi;
    setMapboxSource(sourceIds.visited, convertToGeoJSON(app.state.polygons, true));
    setMapboxSource(sourceIds.unvisited, convertToGeoJSON(app.state.polygons, false));
  }

  function refreshCommunesStyles() {
    if (!app.state.map) return;

    if (allLayersExist()) {
      updateCommunesSources();
      toggleLayers(app.state.communesVisible, false);
    }
  }

  async function refreshCommunesForCurrentZoom() {
    if (!app.state.map) return;
    if (!app.state.communesVisible) return;
    updateOutlineVisibility();

    const { getPolygonRequestForMap, fetchPolygons, activatePolygons } = app.modules.communesApi;
    const request = getPolygonRequestForMap(app.state.map);

    if (request.cacheKey === app.state.polygonsKey && app.state.polygons) return;

    const requestId = ++latestPolygonRequestId;
    const polygons = await fetchPolygons(request);

    if (!app.state.communesVisible || !polygons || requestId !== latestPolygonRequestId) return;

    activatePolygons(request, polygons);

    if (allLayersExist()) {
      updateCommunesSources();
      toggleLayers(app.state.communesVisible, false);
    } else {
      addCommunesLayers();
    }
  }

  function toggleLayers(visible, refreshVisibleLayers = true) {
    app.state.communesVisible = visible;
    const visibility = visible ? 'visible' : 'none';

    for (const layerId of activeCommuneLayerIds) {
      if (app.state.map && app.state.map.getLayer(layerId)) {
        app.state.map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    }

    updateToggleButton();
    updateOutlineVisibility();

    if (visible && refreshVisibleLayers) {
      refreshCommunesForCurrentZoom();
    }
  }

  function updateOutlineVisibility() {
    if (!app.state.map) return;

    const outlineOpacity = shouldShowCommuneOutlines()
      ? styles.unvisitedOutline['line-opacity']
      : 0;

    if (app.state.map.getLayer(layerIds.unvisitedOutline)) {
      app.state.map.setPaintProperty(
        layerIds.unvisitedOutline,
        'line-opacity',
        outlineOpacity
      );
    }
  }

  function updateToggleButton() {
    const button = document.getElementById('zalicz-gminy-toggle');
    if (!button) return;

    button.style.background = app.state.communesVisible ? '#b9c0ba' : '#ffffff';
    button.setAttribute('aria-pressed', String(app.state.communesVisible));
  }

  function addToggleButton() {
    const site = globalThis.ZaliczGminySites.getCurrentSite(location);
    const mapControls = site?.controlsContainer();

    // const mapControls = document.querySelector('.maplibregl-ctrl-top-left, .mapboxgl-ctrl-top-left');
    if (!mapControls || document.getElementById('zalicz-gminy-toggle')) return;

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'maplibregl-ctrl';

    const button = document.createElement('button');
    button.id = 'zalicz-gminy-toggle';
    button.type = 'button';
    button.title = 'Pokaż/ukryj gminy';
    button.textContent = 'G';
    button.style.cssText = `
      margin-top: 1rem;
      padding: 0.5rem 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      cursor: pointer;
      line-height: 1.0125rem;
      font: 700 15px/1 Arial, sans-serif;
      color: #2f9e44;
    `;
    button.addEventListener('click', () => toggleLayers(!app.state.communesVisible));

    buttonContainer.appendChild(button);
    mapControls.appendChild(buttonContainer);
    updateToggleButton();
  }

  async function waitForStyleLoad() {
    if (!app.state.map) return;

    while (!app.state.map.isStyleLoaded()) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  function setupStyleChangeObserver() {
    if (!app.state.map || styleObserverAttached) return;

    styleObserverAttached = true;
    app.state.map.on('styledata', async () => {
      await waitForStyleLoad();
      if (!app.state.polygons) return;

      if (allLayersExist()) {
        toggleLayers(app.state.communesVisible, false);
      } else {
        addCommunesLayers();
      }

      app.modules.gpx.renderGpx();
    });
  }

  function setupZoomObserver() {
    if (!app.state.map || zoomObserverAttached) return;

    let debounceId = null;
    const scheduleRefresh = () => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(
        refreshCommunesForCurrentZoom,
        zoomConfig.debounceMs
      );
    };

    zoomObserverAttached = true;
    app.state.map.on('zoomend', scheduleRefresh);
    app.state.map.on('moveend', scheduleRefresh);
  }

  function showNotification(message) {
    const existing = document.getElementById('zalicz-gminy-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'zalicz-gminy-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #51cf66 0%, #2f9e44 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 14px;
      z-index: 999999;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
      if (notification.parentElement) notification.remove();
    }, 4000);
  }

  app.modules.layers = {
    addCommunesLayers,
    addToggleButton,
    refreshCommunesForCurrentZoom,
    refreshCommunesStyles,
    setupStyleChangeObserver,
    setupZoomObserver,
    showNotification,
    toggleLayers,
    waitForStyleLoad
  };
})(window.ZaliczGminy);
