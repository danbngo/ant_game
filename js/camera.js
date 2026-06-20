// A simple 2D camera: a world-space center point plus a zoom factor.
// It maps the world (the grid, drawn in pixel coords) into the canvas viewport.

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

class Camera {
  constructor(viewportW, viewportH, worldW, worldH) {
    this.vw = viewportW;
    this.vh = viewportH;
    this.worldW = worldW;
    this.worldH = worldH;

    // World point shown at the center of the viewport.
    this.x = worldW / 2;
    this.y = worldH / 2;

    // Start zoomed so the whole nest fits, with a little margin.
    const fit = Math.min(viewportW / worldW, viewportH / worldH);
    this.zoom = fit * 0.95;
    this.minZoom = fit * 0.5;
    this.maxZoom = 8;
  }

  resize(vw, vh) {
    this.vw = vw;
    this.vh = vh;
  }

  // Apply this camera's transform to a context (call before drawing the world).
  apply(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(this.vw / 2, this.vh / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  // Convert a screen (canvas) pixel to a world pixel.
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.vw / 2) / this.zoom + this.x,
      y: (sy - this.vh / 2) / this.zoom + this.y,
    };
  }

  // Multiply zoom by `factor`, keeping the world point under (sx, sy) fixed.
  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  // Zoom toward the center of the viewport (for on-screen buttons).
  zoomCenter(factor) {
    this.zoomAt(this.vw / 2, this.vh / 2, factor);
  }
}
