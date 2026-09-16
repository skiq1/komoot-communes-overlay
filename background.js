importScripts('message-protocol.js');

const { MESSAGE } = globalThis.ZaliczGminyMessageProtocol;

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Nakladka zostala zainstalowana!');
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== MESSAGE.FETCH) return false;

  fetch(request.url)
    .then(async (response) => {
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
    .catch((error) => sendResponse({ success: false, error: error.message, code: error.code, http: error.http }));

  return true;
});
