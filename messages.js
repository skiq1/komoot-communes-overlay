(function(global) {
  'use strict';

  const MESSAGE = Object.freeze({
    // bridge.js -> background.js
    FETCH: 'ZALICZ_GMINY_FETCH',

    // strona <-> bridge.js
    FETCH_REQUEST: 'ZALICZ_GMINY_FETCH_REQUEST',
    FETCH_RESPONSE: 'ZALICZ_GMINY_FETCH_RESPONSE',

    STORAGE_GET: 'ZALICZ_GMINY_STORAGE_GET',
    STORAGE_SET: 'ZALICZ_GMINY_STORAGE_SET',
    STORAGE_RESPONSE: 'ZALICZ_GMINY_STORAGE_RESPONSE',

    // popup.js <-> bridge.js <-> app.js
    COMMAND: 'ZALICZ_GMINY_COMMAND',
    COMMAND_RESPONSE: 'ZALICZ_GMINY_COMMAND_RESPONSE'
  });

  // command actions
  const ACTION = Object.freeze({
    GET_STATUS: 'getStatus',
    TOGGLE_COMMUNES: 'toggleCommunes',
    RELOAD_COMMUNES: 'reloadUserCommunes',
    IMPORT_GPX: 'importGpx',
    REMOVE_GPX: 'removeGpx'
  });

  global.ZaliczGminyProtocol = Object.freeze({
    MESSAGE,
    ACTION
  });
})(globalThis);
