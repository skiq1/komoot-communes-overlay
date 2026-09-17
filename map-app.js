(function(app) {
  'use strict';

  const log = globalThis.ZaliczGmineLogger.create('map-app');

  const { ACTION, MESSAGE } = globalThis.ZaliczGmineMessageProtocol;
  const { loadVisitedCommunes, reloadVisitedCommunes, fetchPolygons,
          activatePolygons, getPolygonRequestForMap } = app.modules.communesData;
  const { getTracksSummary, loadStoredGpx, removeGpx, renderGpx, setGpx } = app.modules.gpx;
  const { findMap } = app.modules.mapFinder;
  const {
    addCommuneLayers,
    addToggleButton,
    refreshCommunesForCurrentZoom,
    refreshCommuneStyles,
    setupStyleChangeObserver,
    setupZoomObserver,
    showNotification,
    toggleLayers,
    waitForStyleLoad
  } = app.modules.mapLayers;

  async function handleCommand(action, data = {}) {
    log.debug('Obsługa polecenia', { action });
    if (action === ACTION.TOGGLE_COMMUNES) {
      if (!app.state.map) {
        return { success: false, error: 'Mapa nie została znaleziona' };
      }

      toggleLayers(!app.state.communesVisible);
      return { success: true, visible: app.state.communesVisible };
    }

    if (action === ACTION.RELOAD_COMMUNES) {
      try {
        await reloadVisitedCommunes(data.userId);
        refreshCommuneStyles();

        return {
          success: true,
          visitedCommuneCount: app.state.visitedCommuneIds.size,
          userId: app.state.userId,
          visitedCommuneSource: app.state.visitedCommuneSource
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    if (action === ACTION.IMPORT_GPX) {
      try {
        const gpx = setGpx(data.text, data.name, data.id);
        return { success: true, gpx };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    if (action === ACTION.REMOVE_GPX) {
      removeGpx(data.id);
      return { success: true, gpxTracks: getTracksSummary() };
    }

    if (action === ACTION.GET_STATUS) {
      return {
        connected: !!app.state.map,
        visible: app.state.communesVisible,
        visitedCommuneCount: app.state.visitedCommuneIds.size,
        userId: app.state.userId,
        visitedCommuneSource: app.state.visitedCommuneSource,
        gpxTracks: getTracksSummary(),
        totalLoaded: app.state.polygons ? app.state.polygons.length : 0
      };
    }

    return { success: false, error: 'Nieznana akcja' };
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data.type !== MESSAGE.COMMAND) return;

    try {
      const response = await handleCommand(event.data.action, event.data.data);
      window.postMessage({
        type: MESSAGE.COMMAND_RESPONSE,
        requestId: event.data.requestId,
        response
      }, window.location.origin);
    } catch (error) {
      window.postMessage({
        type: MESSAGE.COMMAND_RESPONSE,
        requestId: event.data.requestId,
        response: { success: false, error: error.message }
      }, window.location.origin);
    }
  });

  async function init() {
    log.debug('Rozpoczęcie inicjalizacji');
    let communeLoadError = null;

    try {
      await loadVisitedCommunes();
    } catch (error) {
      communeLoadError = error;
      log.error('Nie udalo się pobrac zaliczonych gmin:', error);
    }

    for (let attempt = 0; attempt < 120; attempt++) {
      const map = await findMap();
      if (!map) {
        if (attempt % 20 === 0) log.debug('Oczekiwanie na mapę', { attempt: attempt + 1 });
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      log.debug('Znaleziono mapę', { attempt: attempt + 1 });
      await waitForStyleLoad();
      log.debug('Styl mapy gotowy');
      app.modules.plannedRoute.start();

      const initialRequest = getPolygonRequestForMap(map);
      const polygons = await fetchPolygons(initialRequest);
      if (!polygons) return;

      activatePolygons(initialRequest, polygons);
      addCommuneLayers();
      addToggleButton();
      setupStyleChangeObserver();
      setupZoomObserver();
      try {
        await loadStoredGpx();
      } catch (error) {
        log.error('Nie udało się załadować zapisanego GPX:', error);
      }
      refreshCommunesForCurrentZoom();
      if (communeLoadError) {
        showNotification(`Nie udało się pobrać zaliczonych gmin: ${communeLoadError.message}`);
      } else {
        showNotification(`Załadowano gminy. Zaliczone: ${app.state.visitedCommuneIds.size}`);
      }

      log.debug('Rozszerzenie gotowe');
      return;
    }

    log.debug('Nie znaleziono mapy');
  }

  window.zaliczGmine = app.state;
  window.zaliczGmineToggle = () => toggleLayers(!app.state.communesVisible);
  window.zaliczGmineRenderGpx = renderGpx;

  setTimeout(init, 0);
})(window.ZaliczGmine);
