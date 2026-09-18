/**
 * Synthetic, credential-free terminal-state fixtures. These are not captured
 * SSH/Codex output; they describe the explicit application editor contract
 * used by the state and input-sequence tests.
 */
export const codexPrimaryEditorReplay = {
  bufferType: 'normal' as const,
  rows: ['ab', 'quoted output', 'draft text'],
  cursor: { row: 2, col: 8 },
  editableRegion: {
    source: 'application' as const,
    mode: 'line-editor-clamped' as const,
    startRow: 0,
    endRow: 2,
    cursorRow: 2,
    cursorCol: 8,
    revision: 'synthetic-primary-1',
  },
};

export const codexAlternateEditorReplay = {
  ...codexPrimaryEditorReplay,
  bufferType: 'alternate' as const,
  editableRegion: {
    ...codexPrimaryEditorReplay.editableRegion,
    revision: 'synthetic-alternate-1',
  },
};

export const codexQuotedOutputWithoutEditorState = {
  bufferType: 'alternate' as const,
  rows: ['> quoted output', 'ordinary status', 'history-like text'],
  cursor: { row: 2, col: 4 },
};
