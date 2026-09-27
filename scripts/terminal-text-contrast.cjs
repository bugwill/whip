/** KOReader's glyph-coverage curve: preserve 0/1, strengthen gray edges. */
function terminalTextContrastTable(value) {
  const gamma = typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(4, value)) : 1;
  return Array.from({ length: 256 }, (_, index) =>
    1 - Math.pow(1 - index / 255, gamma));
}

function createTerminalTextContrast(container) {
  const document = container.ownerDocument;
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  const filter = document.createElementNS(namespace, 'filter');
  // Sessions share a document; each session must own its filter and slider value.
  filter.id = 'whip-text-contrast-' + Math.random().toString(36).slice(2);
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  filter.setAttribute('x', '-5%');
  filter.setAttribute('y', '-25%');
  filter.setAttribute('width', '110%');
  filter.setAttribute('height', '150%');
  const transfer = document.createElementNS(namespace, 'feComponentTransfer');
  const alpha = document.createElementNS(namespace, 'feFuncA');
  alpha.setAttribute('type', 'table');
  transfer.appendChild(alpha);
  filter.appendChild(transfer);
  svg.appendChild(filter);
  container.appendChild(svg);
  let configuredGamma = null;
  return value => {
    const gamma = typeof value === 'number' && Number.isFinite(value)
      ? Math.max(1, Math.min(4, value)) : 1;
    if (gamma === configuredGamma) return;
    configuredGamma = gamma;
    alpha.setAttribute('tableValues', terminalTextContrastTable(gamma).join(' '));
    // Filter only DOM text rows: preserve images, selection overlays and layout.
    // Opaque cell backgrounds remain opaque; RGB colors are never remapped.
    container.style.setProperty('--whip-text-contrast',
      gamma === 1 ? 'none' : 'url("#' + filter.id + '")');
  };
}

module.exports = { terminalTextContrastTable, createTerminalTextContrast };
