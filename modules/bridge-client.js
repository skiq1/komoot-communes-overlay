(function(app, protocol) {
  'use strict';

  const { MESSAGE } = protocol;

  function createRequestId() {
    return Math.random().toString(36).slice(2);
  }

  function request(type, responseType, data, timeoutMs) {
    return new Promise((resolve, reject) => {
      const requestId = createRequestId();
      let timeoutId;

      const handler = (event) => {
        if (event.source !== window || event.origin !== window.location.origin) return;
        if (event.data.type !== responseType || event.data.requestId !== requestId) return;

        window.removeEventListener('message', handler);
        window.clearTimeout(timeoutId);

        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data);
        }
      };

      window.addEventListener('message', handler);
      window.postMessage({ type, requestId, ...data }, window.location.origin);

      timeoutId = window.setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Brak odpowiedzi rozszerzenia'));
      }, timeoutMs);
    });
  }

  //
  // Storage & fetching repository
  //
  async function fetchResource(url, responseType = 'json') {
    const message = await request(
      MESSAGE.FETCH_REQUEST,
      MESSAGE.FETCH_RESPONSE,
      { url, responseType },
      30000
    );

    if (!message.response || !message.response.success) {
      throw new Error(message.response?.error || 'Nie udało się pobrać danych');
    }

    return message.response.data;
  }

  async function getStorage(keys) {
    const message = await request(
      MESSAGE.STORAGE_GET,
      MESSAGE.STORAGE_RESPONSE,
      { keys },
      5000
    );

    return message.data || {};
  }

  function setStorage(data) {
    window.postMessage({ type: MESSAGE.STORAGE_SET, data }, window.location.origin);
  }

  app.modules.bridgeClient = {
    fetchResource,
    getStorage,
    setStorage
  };
})(window.ZaliczGminy, globalThis.ZaliczGminyProtocol);
