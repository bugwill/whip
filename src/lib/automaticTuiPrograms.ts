export function parseAutomaticTuiPrograms(value: string): string[] {
  return [...new Set(value.split(/\s+/).filter(Boolean))];
}

function executableName(value: string): string {
  return value.replace(/\\/g, '/').split('/').at(-1) || '';
}

export function automaticTuiProgramMatches(programs: readonly string[], names: readonly string[]): boolean {
  const allowed = new Set(programs.map(executableName));
  return names.some(name => allowed.has(executableName(name)));
}

/** Check once on pane entry; ignore results after leaving that pane. */
export function checkAutomaticTuiPrograms({
  programs, readNames, onChange,
}: {
  programs: readonly string[];
  readNames: () => Promise<string[]>;
  onChange: (enabled: boolean) => void;
}): () => void {
  let stopped = false;
  void (async () => {
    try {
      const names = await readNames();
      if (!stopped) onChange(automaticTuiProgramMatches(programs, names));
    } catch {
      if (!stopped) onChange(false);
    }
  })();
  return () => { stopped = true; };
}
