importScripts('messages.js');

const { MESSAGE } = globalThis.ZaliczGminyProtocol;

const API_ERROR_MESSAGES = {
  INVALID_REQUEST: 'Nieprawidłowe parametry zapytania',
  INVALID_COUNTRY: 'Nieobsługiwany kraj',
  USER_NOT_FOUND: 'Nie znaleziono użytkownika'
};

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
      if (!response.ok || data.status === 'error') {
        throw new Error(API_ERROR_MESSAGES[data.code] || data.message || `HTTP ${response.status}`);
      }
      return data;
    })
    .then((data) => sendResponse({ success: true, data }))
    .catch((error) => sendResponse({ success: false, error: error.message }));

  return true;
});
