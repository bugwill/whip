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

/** Serial polling: late results from a departed pane never update the UI. */
export function monitorAutomaticTuiPrograms({
  programs, readNames, onChange, isActive = () => true,
}: {
  programs: readonly string[];
  readNames: () => Promise<string[]>;
  onChange: (enabled: boolean) => void;
  isActive?: () => boolean;
}): () => void {
  let stopped = false;
  let previousProcesses: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    if (!isActive()) {
      if (!stopped) timer = setTimeout(() => { void poll(); }, 2000);
      return;
    }
    try {
      const names = await readNames();
      if (stopped) return;
      const identity = JSON.stringify([...new Set(names.map(executableName))].sort());
      // Preserve a manual override until the foreground program changes.
      if (identity !== previousProcesses) {
        previousProcesses = identity;
        onChange(automaticTuiProgramMatches(programs, names));
      }
    } catch {
      if (stopped) return;
      if (previousProcesses !== 'unavailable') {
        previousProcesses = 'unavailable';
        onChange(false);
      }
    }
    if (!stopped) timer = setTimeout(() => { void poll(); }, 2000);
  };
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
