(function(global) {
  'use strict';

  const EPSILON = 1e-12;
  const prepared = new WeakMap();
  const overlaps = (a, b) => a[0] <= b[2] + EPSILON && a[2] + EPSILON >= b[0] &&
    a[1] <= b[3] + EPSILON && a[3] + EPSILON >= b[1];
  const bounds = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]),
    Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (p, a, b) => Math.abs(cross(a, b, p)) <= EPSILON && overlaps(bounds(p, p), bounds(a, b));

  function intersects(a, b, c, d) {
    const abC = cross(a, b, c), abD = cross(a, b, d);
    const cdA = cross(c, d, a), cdB = cross(c, d, b);
    return ((abC > EPSILON && abD < -EPSILON || abC < -EPSILON && abD > EPSILON) &&
      (cdA > EPSILON && cdB < -EPSILON || cdA < -EPSILON && cdB > EPSILON)) ||
      onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
  }

  // A linear-time bounding-volume tree preserves the locality of consecutive
  // route/ring segments. No sorting or external spatial-index dependency needed.
  function* buildTree(segments) {
    let level = segments;
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 8) {
        const children = level.slice(i, i + 8);
        const box = [Infinity, Infinity, -Infinity, -Infinity];
        for (const child of children) {
          box[0] = Math.min(box[0], child.box[0]); box[1] = Math.min(box[1], child.box[1]);
          box[2] = Math.max(box[2], child.box[2]); box[3] = Math.max(box[3], child.box[3]);
        }
        next.push({ box, children });
        yield;
      }
      level = next;
    }
    return level[0] || null;
  }

  function* prepare(item) {
    if (prepared.has(item)) return prepared.get(item);
    let rings;
    try {
      rings = JSON.parse(item.c);
      if (!Array.isArray(rings) || !rings.length) return null;
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      for (const ring of rings) {
        if (!Array.isArray(ring) || ring.length < 3) return null;
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i];
          if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
          ring[i] = [p[1], p[0]];
          box[0] = Math.min(box[0], p[1]); box[1] = Math.min(box[1], p[0]);
          box[2] = Math.max(box[2], p[1]); box[3] = Math.max(box[3], p[0]);
          yield;
        }
      }
      const result = { rings, box, tree: null };
      prepared.set(item, result);
      return result;
    } catch {
      prepared.set(item, null);
      return null;
    }
  }

  // Boundary touches count as intersections, including hole boundaries.
  function* contains(point, rings) {
    let outer = false, hole = false;
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j], b = ring[i];
        if (onSegment(point, a, b)) return true;
        if ((a[1] > point[1]) !== (b[1] > point[1]) &&
          point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        yield;
      }
      if (r === 0) outer = inside;
      else hole ||= inside;
    }
    return outer && !hole;
  }

  function* treesIntersect(route, polygon) {
    const stack = [[route, polygon]];
    while (stack.length) {
      const [a, b] = stack.pop();
      yield;
      if (!a || !b || !overlaps(a.box, b.box)) continue;
      if (a.children) {
        for (const child of a.children) stack.push([child, b]);
      } else if (b.children) {
        for (const child of b.children) stack.push([a, child]);
      } else if (intersects(a.a, a.b, b.a, b.b)) return true;
    }
    return false;
  }

  function* findMatches(lines, polygons) {
    const segments = [];
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        segments.push({ a: line[i - 1], b: line[i], box: bounds(line[i - 1], line[i]) });
        yield;
      }
    }
    const route = yield* buildTree(segments);
    const matches = [];
    if (!route) return matches;
    for (const item of polygons) {
      yield;
      const polygon = yield* prepare(item);
      if (!polygon || !overlaps(route.box, polygon.box)) continue;
      let hit = false;
      for (const line of lines) {
        if (overlaps(bounds(line[0], line[0]), polygon.box) && (yield* contains(line[0], polygon.rings))) {
          hit = true;
          break;
        }
      }
      if (!hit) {
        // Build the edge index only for nearby polygons whose containment test
        // did not already succeed. Distant communes never need an edge tree.
        if (!polygon.tree) {
          const edges = [];
          for (const ring of polygon.rings) {
            for (let i = 0; i < ring.length; i++) {
              const a = ring[i], b = ring[(i + 1) % ring.length];
              edges.push({ a, b, box: bounds(a, b) });
              yield;
            }
          }
          polygon.tree = yield* buildTree(edges);
        }
        hit = yield* treesIntersect(route, polygon.tree);
      }
      if (hit) matches.push(item);
    }
    return matches;
  }

  // Work is interruptible even inside a complex polygon, not only between communes.
  async function calculate(lines, polygons, cancelled = () => false) {
    const job = findMatches(lines, polygons);
    let deadline = performance.now() + 6;
    for (let steps = 0; ; steps++) {
      if (cancelled()) return null;
      const result = job.next();
      if (result.done) return result.value;
      if (steps % 128 === 0 && performance.now() >= deadline) {
        await new Promise(resolve => setTimeout(resolve, 0));
        deadline = performance.now() + 6;
      }
    }
  }

  global.ZaliczGminyRouteGeometry = { calculate };
})(globalThis);
