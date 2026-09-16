(function(global) {
  'use strict';

  const API_BASE = 'https://zaliczgmine.pl/api/';
  const API_ERROR_MESSAGES = {
    INVALID_REQUEST: 'Nieprawidłowe parametry zapytania',
    INVALID_COUNTRY: 'Nieobsługiwany kraj',
    USER_NOT_FOUND: 'Nie znaleziono użytkownika'
  };

  function fetchViaRuntime(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: global.ZaliczGminyMessageProtocol.MESSAGE.FETCH,
        url,
        responseType: 'json'
      }, response => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError || !response?.success) {
          reject(Object.assign(
            new Error(runtimeError?.message || response?.error || 'Nie udało się pobrać danych'),
            { code: response?.code, http: response?.http }
          ));
          return;
        }
        resolve(response.data);
      });
    });
  }

  // Transport returns parsed JSON and rejects with optional code/http metadata.
  function createZaliczGmineApi(fetchResource = fetchViaRuntime) {
    async function get(endpoint, params) {
      try {
        const data = await fetchResource(API_BASE + endpoint + '?' + new URLSearchParams(params));
        if (data?.status === 'error') {
          throw Object.assign(new Error(data.message || 'Błąd API'), { code: data.code });
        }
        if (data?.status !== 'success' || !Array.isArray(data.items)) {
          throw new Error('Nieprawidłowa odpowiedź z API');
        }
        return data;
      } catch (error) {
        if (Object.hasOwn(API_ERROR_MESSAGES, error.code)) {
          error.message = API_ERROR_MESSAGES[error.code];
        }
        throw error;
      }
    }

    return {
      async searchUsers(query) {
        return (await get('usersearch', { q: query })).items;
      },
      getUserCommunes(userId, country) {
        return get('usercommunes', { user_id: userId, country });
      },
      async getPolygons(zoom, country, bounds) {
        const params = { zoom, country };
        if (bounds) params.bounds = JSON.stringify(bounds);
        return (await get('geompolygons', params)).items;
      }
    };
  }

  global.createZaliczGmineApi = createZaliczGmineApi;
})(globalThis);
