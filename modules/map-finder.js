(function(app) {
  'use strict';

  const SEARCH_LIMITS = {
    ancestors: 8,
    depth: 14,
    objects: 5000,
    propertiesPerObject: 250
  };

  function isVisibleCanvas(canvas) {
    if (!canvas.isConnected) return false;

    const bounds = canvas.getBoundingClientRect();
    const style = window.getComputedStyle(canvas);

    return bounds.width > 0 &&
      bounds.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden';
  }

  function collectMapCanvases() {
    return Array.from(document.getElementsByTagName('canvas'))
      .filter(isVisibleCanvas)
      .sort((a, b) => { // sort for largest area first
        const areaA = a.clientWidth * a.clientHeight;
        const areaB = b.clientWidth * b.clientHeight;
        return areaB - areaA;
      });
  }

  function exposesMapInterface(candidate, canvas) {
    if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) {
      return false;
    }

    try {
      const requiredMethods = ['getCanvas', 'getStyle', 'getSource', 'addSource', 'on', 'off'];
      if (!requiredMethods.every(method => typeof candidate[method] === 'function')) {
        return false;
      }

      return candidate.getCanvas() === canvas;
    } catch (error) {
      return false;
    }
  }

  function ownDataValues(object) {
    let descriptors;

    try {
      descriptors = Object.getOwnPropertyDescriptors(object);
    } catch (error) {
      return [];
    }

    const values = [];
    const names = Object.keys(descriptors).slice(0, SEARCH_LIMITS.propertiesPerObject);

    for (const name of names) {
      const descriptor = descriptors[name];

      // skip getters/setters
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;

      const value = descriptor.value;
      if (value && (typeof value === 'object' || typeof value === 'function')) {
        values.push(value);
      }
    }

    return values;
  }

  function rootsForCanvas(canvas) {
    const roots = [];
    let element = canvas;

    for (let level = 0; element && level < SEARCH_LIMITS.ancestors; level++) {
      roots.push(element);
      element = element.parentElement;
    }

    return roots;
  }

  function locateOwnerOfCanvas(canvas) {
    const seen = new WeakSet();
    const pending = rootsForCanvas(canvas).map(value => ({ value, depth: 0 }));
    let inspected = 0;

    while (pending.length > 0 && inspected < SEARCH_LIMITS.objects) {
      const entry = pending.pop();
      const candidate = entry.value;

      if (seen.has(candidate)) continue;
      seen.add(candidate);
      inspected++;

      if (exposesMapInterface(candidate, canvas)) return candidate;
      if (entry.depth >= SEARCH_LIMITS.depth) continue;

      for (const child of ownDataValues(candidate)) {
        if (!seen.has(child)) pending.push({ value: child, depth: entry.depth + 1 });
      }
    }

    return null;
  }

  async function findMap() {
    for (const canvas of collectMapCanvases()) {
      const map = locateOwnerOfCanvas(canvas);
      if (!map) continue;

      app.state.map = map;
      return map;
    }

    return null;
  }

  app.modules.mapFinder = { findMap };
})(window.ZaliczGminy);
