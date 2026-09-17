importScripts('logger.js', 'message-protocol.js');

const log = globalThis.ZaliczGmineLogger.create('background');

const { MESSAGE } = globalThis.ZaliczGmineMessageProtocol;

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    log.info('Nakładka została zainstalowana');
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== MESSAGE.FETCH) return false;

  const startedAt = Date.now();
  log.debug('Rozpoczęcie pobierania', { responseType: request.responseType });
  fetch(request.url)
    .then(async (response) => {
      log.debug('Odpowiedź HTTP', { status: response.status, durationMs: Date.now() - startedAt });
      if (request.responseType === 'text') {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      }
      const data = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(data?.message || `HTTP ${response.status}`), {
          code: data?.code, http: response.status
        });
      }
      return data;
    })
    .then((data) => sendResponse({ success: true, data }))
    .catch((error) => {
      log.error('Błąd pobierania', error);
      sendResponse({ success: false, error: error.message, code: error.code, http: error.http });
    });

  return true;
});
