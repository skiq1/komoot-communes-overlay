importScripts('messages.js');

const { MESSAGE } = globalThis.ZaliczGminyProtocol;

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Nakladka zostala zainstalowana!');
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== MESSAGE.FETCH) return false;

  fetch(request.url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return request.responseType === 'text' ? response.text() : response.json();
    })
    .then((data) => sendResponse({ success: true, data }))
    .catch((error) => sendResponse({ success: false, error: error.message }));

  return true;
});
