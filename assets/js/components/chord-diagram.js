/* Small SVG guitar chord box. */
(function () {
  function chordDiagram(name, size) {
    const shape = window.Music.guitarShape(name);
    if (!shape) return '';
    const w = size || 64, h = Math.round(w * 1.15);
    const padX = w * 0.14, top = h * 0.2, gridW = w - padX * 2, gridH = h - top - h * 0.06;
    const sx = gridW / 5, fy = gridH / 4;
    const played = shape.frets.filter((f) => f > 0);
    const maxF = played.length ? Math.max(...played) : 0;
    const base = maxF > 4 ? Math.min(...played) : 1;
    let s = `<svg class="chord-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-label="${name} chord shape">`;
    // nut or base-fret label
    if (base === 1) s += `<rect x="${padX}" y="${top - 3}" width="${gridW}" height="3" class="nut"/>`;
    else s += `<text x="${padX - 3}" y="${top + fy * 0.7}" class="fret-no" text-anchor="end">${base}</text>`;
    for (let i = 0; i <= 4; i++) s += `<line x1="${padX}" x2="${padX + gridW}" y1="${top + i * fy}" y2="${top + i * fy}" class="grid"/>`;
    for (let i = 0; i < 6; i++) s += `<line x1="${padX + i * sx}" x2="${padX + i * sx}" y1="${top}" y2="${top + gridH}" class="grid"/>`;
    const r = Math.min(sx, fy) * 0.36;
    if (shape.barre > 0 && base <= shape.barre) {
      const strs = shape.frets.map((f, i) => (f === shape.barre ? i : -1)).filter((i) => i >= 0);
      if (strs.length > 1) {
        const y = top + (shape.barre - base + 0.5) * fy;
        const x0 = padX + strs[0] * sx, x1 = padX + strs[strs.length - 1] * sx;
        s += `<rect x="${x0 - r}" y="${y - r}" width="${x1 - x0 + 2 * r}" height="${2 * r}" rx="${r}" class="dot"/>`;
      }
    }
    shape.frets.forEach((f, i) => {
      const x = padX + i * sx;
      if (f < 0) s += `<text x="${x}" y="${top - 6}" class="mark" text-anchor="middle">×</text>`;
      else if (f === 0) s += `<circle cx="${x}" cy="${top - 9}" r="${r * 0.7}" class="open"/>`;
      else s += `<circle cx="${x}" cy="${top + (f - base + 0.5) * fy}" r="${r}" class="dot"/>`;
    });
    return s + '</svg>';
  }
  window.chordDiagram = chordDiagram;
})();
