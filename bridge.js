(function() {
  'use strict';

  const { MESSAGE } = globalThis.ZaliczGminyProtocol;
  const pageScripts = [
    'messages.js',
    'config.js',
    'modules/bridge-client.js',
    'modules/map-finder.js',
    'modules/communes.js',
    'modules/layers.js',
    'modules/gpx.js',
    'app.js'
  ];
  let scriptsLoaded = false;
  let scriptsLoading = null;
  let lastPath = location.pathname;

  function getPathWithoutLocale() {
    return location.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i, '');
  }

  function isSupportedRoute() {
    const path = getPathWithoutLocale();
    return /^\/tour\/[^/]+\/edit(?:\/|$)/.test(path) ||
      /^\/plan(?:\/|$)/.test(path);
  }

  // get communes & visited communes using background.js as a bridge, because blockade cross-origin requests
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    if (event.data.type === MESSAGE.FETCH_REQUEST) {
      const { requestId, url, responseType } = event.data;
      chrome.runtime.sendMessage({
        type: MESSAGE.FETCH,
        url,
        responseType
      }, (response) => {
        window.postMessage({
          type: MESSAGE.FETCH_RESPONSE,
          requestId,
          response,
          error: chrome.runtime.lastError?.message
        }, window.location.origin);
      });
      return;
    }

    // storage
    if (event.data.type === MESSAGE.STORAGE_GET) {
      chrome.storage.local.get(event.data.keys || null, (result) => {
        window.postMessage({
          type: MESSAGE.STORAGE_RESPONSE,
          requestId: event.data.requestId,
          data: result
        }, window.location.origin);
      });
      return;
    }

    if (event.data.type === MESSAGE.STORAGE_SET) {
      chrome.storage.local.set(event.data.data);
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!isSupportedRoute()) {
      sendResponse({
        success: false,
        connected: false,
        error: 'Rozszerzenie dziala tylko podczas planowania lub edycji trasy'
      });
      return false;
    }

    const scriptsReady = loadScripts();
    const requestId = Math.random().toString(36).slice(2);

    // setup listener for response
    const handler = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data.type !== MESSAGE.COMMAND_RESPONSE) return;
      if (event.data.requestId !== requestId) return;

      window.removeEventListener('message', handler);
      clearTimeout(timeoutId);
      sendResponse(event.data.response);
    };
    window.addEventListener('message', handler);

    // send request
    // ACTION: GET_STATUS, TOGGLE_COMMUNES, RELOAD_COMMUNES, IMPORT_GPX, REMOVE_GPX
    scriptsReady.then(() => {
      window.postMessage({
        type: MESSAGE.COMMAND,
        requestId,
        action: request.action,
        data: request.data
      }, window.location.origin);
    }).catch((error) => {
      window.removeEventListener('message', handler);
      clearTimeout(timeoutId);
      sendResponse({ success: false, error: error.message });
    });

    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', handler);
      sendResponse({ success: false, error: 'Timeout' });
    }, 5000);

    return true;
  });

  function injectScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(src);
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      (document.head || document.documentElement).appendChild(script);
    });
  }

  async function loadScripts() {
    if (scriptsLoaded) return;
    if (scriptsLoading) return scriptsLoading;
    if (!isSupportedRoute()) return;

    scriptsLoading = (async () => {
      for (const script of pageScripts) {
        await injectScript(script);
      }
      scriptsLoaded = true;
      console.log('Skrypty strony zaladowane');
    })();

    try {
      await scriptsLoading;
    } catch (error) {
      scriptsLoading = null;
      console.error('Error:', error);
      throw error;
    }
  }

  function loadScriptsIfSupported() {
    if (isSupportedRoute()) {
      loadScripts();
    }
  }

  function watchRouteChanges() {
    setInterval(() => {
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      loadScriptsIfSupported();
    }, 1000);
  }

  loadScriptsIfSupported();
  watchRouteChanges();
})();
