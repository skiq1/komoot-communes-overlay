(function(global) {
  'use strict';

  const config = {
    layerIds: {
      unvisitedFill: 'zalicz-gminy-communes',
      unvisitedOutline: 'zalicz-gminy-communes-outline',
      visitedFill: 'zalicz-gminy-visited',
      visitedOutline: 'zalicz-gminy-visited-outline',
      gpxCasing: 'zalicz-gminy-gpx-casing',
      gpxLine: 'zalicz-gminy-gpx-line'
    },
    sourceIds: {
      unvisited: 'zalicz-gminy-unvisited-source',
      visited: 'zalicz-gminy-visited-source',
      gpx: 'zalicz-gminy-gpx-source'
    },
    zoom: {
      minApiZoom: 7,
      globalMaxMapZoom: 8,
      maxApiZoom: 18,
      maxCachedRequests: 40,
      boundsPaddingRatio: 0.35,
      lowZoomOutlineMaxZoom: 8,
      debounceMs: 250
    },
    styles: {
      unvisitedFill: {
        'fill-color': '#ff6b6b',
        'fill-opacity': 0.15
      },
      unvisitedOutline: {
        'line-color': '#ff6b6b',
        'line-width': 2,
        'line-opacity': 0.8
      },
      visitedFill: {
        'fill-color': '#51cf66',
        'fill-opacity': 0.1
      },
      visitedOutline: {
        'line-color': '#2f9e44',
        'line-width': 2,
        'line-opacity': 0.2
      },
      gpxCasing: {
        'line-color': '#ffffff',
        'line-width': 7,
        'line-opacity': 0.9
      },
      gpxLine: {
        'line-color': '#1c7ed6',
        'line-width': 4,
        'line-opacity': 0.95
      }
    }
  };

  const state = {
    map: null,
    communesVisible: true,
    polygons: null,
    polygonsKey: null,
    userId: null,
    userCommunesSource: 'none',
    userCommunes: new Set()
  };

  global.ZaliczGminy = {
    config,
    state,
    modules: {}
  };
})(globalThis);
