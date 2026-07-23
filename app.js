(function(app) {
  'use strict';

  const { ACTION, MESSAGE } = globalThis.ZaliczGminyProtocol;
  const { loadUserCommunes, reloadUserCommunes, fetchPolygons,
          activatePolygons, getPolygonRequestForMap } = app.modules.communesApi;
  const { getTracksSummary, loadStoredGpx, removeGpx, renderGpx, setGpx } = app.modules.gpx;
  const { findMap } = app.modules.mapFinder;
  const {
    addCommunesLayers,
    addToggleButton,
    refreshCommunesForCurrentZoom,
    refreshCommunesStyles,
    setupStyleChangeObserver,
    setupZoomObserver,
    showNotification,
    toggleLayers,
    waitForStyleLoad
  } = app.modules.layers;

  async function handleCommand(action, data = {}) {
    if (action === ACTION.TOGGLE_COMMUNES) {
      if (!app.state.map) {
        return { success: false, error: 'Mapa nie została znaleziona' };
      }

      toggleLayers(!app.state.communesVisible);
      return { success: true, visible: app.state.communesVisible };
    }

    if (action === ACTION.RELOAD_COMMUNES) {
      try {
        await reloadUserCommunes(data.userId);
        refreshCommunesStyles();

        return {
          success: true,
          communesCount: app.state.userCommunes.size,
          userId: app.state.userId,
          userCommunesSource: app.state.userCommunesSource
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
        communesCount: app.state.userCommunes.size,
        userId: app.state.userId,
        userCommunesSource: app.state.userCommunesSource,
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
    console.log('init');
    let communesLoadError = null;

    try {
      await loadUserCommunes();
    } catch (error) {
      communesLoadError = error;
      console.error('Nie udalo się pobrac zaliczonych gmin:', error);
    }

    for (let attempt = 0; attempt < 120; attempt++) {
      const map = await findMap();
      if (!map) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      await waitForStyleLoad();

      const initialRequest = getPolygonRequestForMap(map);
      const polygons = await fetchPolygons(initialRequest);
      if (!polygons) return;

      activatePolygons(initialRequest, polygons);
      addCommunesLayers();
      addToggleButton();
      setupStyleChangeObserver();
      setupZoomObserver();
      try {
        await loadStoredGpx();
      } catch (error) {
        console.error('Nie udało się załadować zapisanego GPX:', error);
      }
      refreshCommunesForCurrentZoom();
      if (communesLoadError) {
        showNotification(`Nie udało się pobrać zaliczonych gmin: ${communesLoadError.message}`);
      } else {
        showNotification(`Załadowano gminy. Zaliczone: ${app.state.userCommunes.size}`);
      }

      console.log('Rozszerzenie gotowe');
      return;
    }

    console.log('Nie znaleziono mapy');
  }

  window.zaliczGminy = app.state;
  window.zaliczGminyToggle = () => toggleLayers(!app.state.communesVisible);
  window.zaliczGminyRenderGpx = renderGpx;

  setTimeout(init, 0);
})(window.ZaliczGminy);
