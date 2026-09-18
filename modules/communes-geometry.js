(function(global) {
  'use strict';

  const cache = new WeakMap();
  const EPSILON = 1e-12;

  // Returns null on the boundary, so touching rings can still be classified.
  function* inside(point, ring) {
    let result = false;
    const [x, y] = point;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j], [bx, by] = ring[i];
      const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (Math.abs(cross) <= EPSILON &&
          x >= Math.min(ax, bx) - EPSILON && x <= Math.max(ax, bx) + EPSILON &&
          y >= Math.min(ay, by) - EPSILON && y <= Math.max(ay, by) + EPSILON) return null;
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) result = !result;
      yield;
    }
    return result;
  }

  function* enclosed(child, parent) {
    for (let i = 0; i < child.length - 1; i++) {
      const a = child[i], b = child[i + 1];
      for (const point of [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]) {
        const result = yield* inside(point, parent);
        if (result !== null) return result;
      }
    }
    return false;
  }

  // The API supplies flat rings in [lat, lng] order, without hole/part labels.
  // Nesting, not winding or input order, determines shells, holes and islands.
  function* prepare(item) {
    if (cache.has(item)) return cache.get(item);
    try {
      const raw = JSON.parse(item.c);
      if (!Array.isArray(raw) || !raw.length) throw new Error('Missing rings');
      const rings = [], entries = [];
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      for (const points of raw) {
        if (!Array.isArray(points) || points.length < 3) throw new Error('Invalid ring');
        const ring = [], bounds = [Infinity, Infinity, -Infinity, -Infinity];
        for (const point of points) {
          if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
            throw new Error('Invalid coordinate');
          }
          const [y, x] = point;
          ring.push([x, y]);
          bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
          bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
          yield;
        }
        const first = ring[0], last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
        let area = 0;
        for (let i = 1; i < ring.length; i++) {
          // Translate to the first vertex to reduce cancellation for small rings.
          area += (ring[i - 1][0] - first[0]) * (ring[i][1] - first[1]) -
            (ring[i][0] - first[0]) * (ring[i - 1][1] - first[1]);
          yield;
        }
        if (area === 0) throw new Error('Degenerate ring');
        entries.push({ ring, bounds, area: Math.abs(area), counterclockwise: area > 0, parent: null, depth: 0 });
        rings.push(ring);
        box[0] = Math.min(box[0], bounds[0]); box[1] = Math.min(box[1], bounds[1]);
        box[2] = Math.max(box[2], bounds[2]); box[3] = Math.max(box[3], bounds[3]);
      }
      for (const child of entries) {
        for (const parent of entries) {
          yield;
          if (parent.area <= child.area || (child.parent && parent.area >= child.parent.area)) continue;
          const a = child.bounds, b = parent.bounds;
          if (a[0] < b[0] || a[1] < b[1] || a[2] > b[2] || a[3] > b[3]) continue;
          if (yield* enclosed(child.ring, parent.ring)) child.parent = parent;
        }
      }
      const polygons = [];
      for (const entry of entries) {
        for (let parent = entry.parent; parent; parent = parent.parent) {
          entry.depth++;
          yield;
        }
        // GeoJSON shells wind counterclockwise; holes wind clockwise.
        if (entry.counterclockwise !== (entry.depth % 2 === 0)) entry.ring.reverse();
        if (entry.depth % 2 === 0) {
          entry.polygon = [entry.ring];
          polygons.push(entry.polygon);
        }
      }
      for (const entry of entries) {
        if (entry.depth % 2 === 1) entry.parent.polygon.push(entry.ring);
      }
      const result = { polygons, rings, box, tree: null };
      cache.set(item, result);
      return result;
    } catch {
      cache.set(item, null);
      return null;
    }
  }

  function toGeoJSON(item) {
    const job = prepare(item);
    let step;
    do { step = job.next(); } while (!step.done);
    if (!step.value) return null;
    const { polygons } = step.value;
    return polygons.length === 1
      ? { type: 'Polygon', coordinates: polygons[0] }
      : { type: 'MultiPolygon', coordinates: polygons };
  }

  global.ZaliczGmineCommunesGeometry = { prepare, toGeoJSON };
})(globalThis);
