document.addEventListener('DOMContentLoaded', function() {
  const { ACTION } = globalThis.ZaliczGminyProtocol;
  const communesCountEl = document.getElementById('communesCount');
  const toggleBtn = document.getElementById('toggleBtn');
  const userIdInput = document.getElementById('userIdInput');
  const saveUserIdBtn = document.getElementById('saveUserIdBtn');
  const gpxFileInput = document.getElementById('gpxFileInput');
  const chooseGpxBtn = document.getElementById('chooseGpxBtn');
  const importGpxBtn = document.getElementById('importGpxBtn');
  const removeAllGpxBtn = document.getElementById('removeAllGpxBtn');
  const gpxFileName = document.getElementById('gpxFileName');
  const gpxList = document.getElementById('gpxList');
  const gpxStatusText = document.getElementById('gpxStatusText');
  const mapStatusDot = document.getElementById('mapStatusDot');
  const mapStatusText = document.getElementById('mapStatusText');
  const statusDiv = document.getElementById('status');

  init();

  async function init() {
    loadUserId();
    loadGpxInfo();
    checkMapStatus();
  }

  function loadUserId() {
    chrome.storage.local.get(['zaliczGminyUserId'], function(result) {
      if (result.zaliczGminyUserId) {
        userIdInput.value = result.zaliczGminyUserId;
      }
    });
  }

  function loadGpxInfo() {
    chrome.storage.local.get(['zaliczGminyGpx', 'zaliczGminyGpxList'], function(result) {
      const tracks = normalizeStoredGpx(result);
      if (!Array.isArray(result.zaliczGminyGpxList) && result.zaliczGminyGpx && tracks.length) {
        setStoredGpxTracks(tracks);
        return;
      }
      renderGpxList(tracks);
    });
  }

  function normalizeStoredGpx(result) {
    if (Array.isArray(result.zaliczGminyGpxList)) {
      return result.zaliczGminyGpxList;
    }

    if (result.zaliczGminyGpx && result.zaliczGminyGpx.name) {
      return [{
        id: result.zaliczGminyGpx.id || createGpxId(),
        name: result.zaliczGminyGpx.name,
        text: result.zaliczGminyGpx.text
      }];
    }

    return [];
  }

  function createGpxId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function getStoredGpxTracks(callback) {
    chrome.storage.local.get(['zaliczGminyGpx', 'zaliczGminyGpxList'], function(result) {
      callback(normalizeStoredGpx(result));
    });
  }

  function setStoredGpxTracks(tracks, callback) {
    chrome.storage.local.set({ zaliczGminyGpxList: tracks }, function() {
      chrome.storage.local.remove(['zaliczGminyGpx'], function() {
        renderGpxList(tracks);
        if (callback) callback();
      });
    });
  }

  function renderGpxList(tracks) {
    gpxList.textContent = '';

    if (!tracks.length) {
      gpxStatusText.textContent = 'GPX będzie widoczny jako niebieska linia na mapie.';
      return;
    }

    for (const track of tracks) {
      const item = document.createElement('div');
      item.className = 'gpx-item';

      const name = document.createElement('div');
      name.className = 'gpx-item-name';
      name.textContent = track.name || 'track.gpx';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-danger gpx-item-remove';
      removeButton.textContent = 'Usuń';
      removeButton.addEventListener('click', function() {
        removeGpxTrack(track.id);
      });

      item.appendChild(name);
      item.appendChild(removeButton);
      gpxList.appendChild(item);
    }

    gpxStatusText.textContent = `Zapisane pliki GPX: ${tracks.length}`;
  }

  function readSelectedGpx(callback) {
    const file = gpxFileInput.files && gpxFileInput.files[0];

    if (!file) {
      callback(null, 'Wybierz plik GPX');
      return;
    }

    const reader = new FileReader();
    reader.onload = function() {
      callback({
        id: createGpxId(),
        name: file.name,
        text: String(reader.result || '')
      });
    };
    reader.onerror = function() {
      callback(null, 'Nie udało się odczytać pliku GPX');
    };
    reader.readAsText(file);
  }

  chooseGpxBtn.addEventListener('click', function() {
    gpxFileInput.click();
  });

  gpxFileInput.addEventListener('change', function() {
    const file = gpxFileInput.files && gpxFileInput.files[0];
    gpxFileName.textContent = file ? file.name : 'Brak pliku';
  });

  importGpxBtn.addEventListener('click', function() {
    readSelectedGpx(function(gpx, error) {
      if (error) {
        showStatus(error, 'error');
        return;
      }

      getStoredGpxTracks(function(tracks) {
        const nextTracks = tracks.concat(gpx);

        setStoredGpxTracks(nextTracks, function() {
          sendMessageToContentScript({
            action: ACTION.IMPORT_GPX,
            data: gpx
          }, function(response) {
            if (response && response.success) {
              gpxFileName.textContent = 'Brak pliku';
              gpxFileInput.value = '';
              showStatus('Dodano GPX do mapy', 'success');
            } else if (response && response.error) {
              if (response.error === 'Brak odpowiedzi ze strony Komoot') {
                showStatus('GPX zapisany', 'success');
              } else {
                setStoredGpxTracks(nextTracks.filter(track => track.id !== gpx.id));
                showStatus(response.error, 'error');
              }
            } else {
              showStatus('GPX zapisany', 'success');
            }
          });
        });
      });
    });
  });

  function removeGpxTrack(id) {
    getStoredGpxTracks(function(tracks) {
      const nextTracks = tracks.filter(track => track.id !== id);

      setStoredGpxTracks(nextTracks, function() {
        sendMessageToContentScript({
          action: ACTION.REMOVE_GPX,
          data: { id: id }
        }, function(response) {
          if (response && response.success) {
            showStatus('Usunięto GPX z mapy', 'success');
          } else {
            showStatus('Usunięto zapisany GPX', 'success');
          }
        });
      });
    });
  }

  removeAllGpxBtn.addEventListener('click', function() {
    chrome.storage.local.remove(['zaliczGminyGpx', 'zaliczGminyGpxList'], function() {
      gpxFileInput.value = '';
      gpxFileName.textContent = 'Brak pliku';
      renderGpxList([]);

      sendMessageToContentScript({ action: ACTION.REMOVE_GPX }, function(response) {
        if (response && response.success) {
          showStatus('Usunięto GPX z mapy', 'success');
        } else {
          showStatus('Usunięto zapisany GPX', 'success');
        }
      });
    });
  });

  saveUserIdBtn.addEventListener('click', function() {
    const userId = userIdInput.value.trim();

    if (userId && !/^\d+$/.test(userId)) {
      showStatus('ID użytkownika musi być liczbą', 'error');
      return;
    }

    chrome.storage.local.set({ zaliczGminyUserId: userId }, function() {
      showStatus('Zapisano ID użytkownika', 'success');

      sendMessageToContentScript({
        action: ACTION.RELOAD_COMMUNES,
        data: { userId: userId }
      }, function(response) {
        if (response?.success) {
          communesCountEl.textContent = response.communesCount;
          showStatus(`Załadowano ${response.communesCount} gmin`, 'success');
          return;
        }

        showStatus(
          response?.error || 'Nie można połączyć się z mapą Komoot',
          'error'
        );
        // loadCommunesCountFromStorage();

      });
    });
  });

  toggleBtn.addEventListener('click', function() {
    sendMessageToContentScript({ action: ACTION.TOGGLE_COMMUNES }, function(response) {
      if (response && response.success) {
        const visibleText = response.visible ? 'widoczne' : 'ukryte';
        showStatus(`Gminy są teraz ${visibleText}`, 'success');
      } else if (response && response.error) {
        showStatus(response.error, 'error');
      } else {
        showStatus('Nie można połączyć się z mapą Komoot', 'error');
      }
    });
  });

  function checkMapStatus() {
    sendMessageToContentScript({ action: ACTION.GET_STATUS }, function(response) {
      if (response && response.connected) {
        mapStatusDot.classList.add('connected');
        mapStatusDot.classList.remove('disconnected');
        mapStatusText.textContent = 'Połączono z mapą';

        if (response.communesCount !== undefined) {
          communesCountEl.textContent = response.communesCount;
        }
        if (response.userId) {
          userIdInput.value = response.userId;
        }
        if (Array.isArray(response.gpxTracks)) {
          getStoredGpxTracks(function(tracks) {
            renderGpxList(tracks.length ? tracks : response.gpxTracks);
          });
        }
      } else {
        mapStatusDot.classList.add('disconnected');
        mapStatusDot.classList.remove('connected');
        mapStatusText.textContent = 'Brak połączenia z mapą';
        communesCountEl.textContent = '-';

        // loadCommunesCountFromStorage();
      }
    });
  }

  // function loadCommunesCountFromStorage() {
  //   chrome.storage.local.get(['communesCount'], function(result) {
  //     if (result.communesCount) {
  //       communesCountEl.textContent = result.communesCount;
  //     }
  //   });
  // }

  function sendMessageToContentScript(message, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
          if (chrome.runtime.lastError) {
            console.log('Error:', chrome.runtime.lastError);
            if (callback) callback(null);
          } else {
            if (callback) callback(response);
          }
        });
      } else {
        if (callback) callback(null);
      }
    });
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    statusDiv.style.display = 'block';

    setTimeout(function() {
      statusDiv.style.display = 'none';
    }, 5000);
  }
});
