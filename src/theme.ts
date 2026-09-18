import { useColorScheme } from 'react-native';

import { useDisplayProfile } from './lib/displayProfile';
import type { TerminalSessionStatus } from './terminalSessions';

export const githubLightPalette = {
  canvas: '#FFFFFF',
  canvasInset: '#F6F8FA',
  surfaceRaised: '#EAEEF2',
  border: '#D0D7DE',
  foreground: '#24292F',
  foregroundMuted: '#57606A',
  foregroundSubtle: '#6E7781',
  foregroundDisabled: '#8C959F',
  accent: '#0969DA',
  green: '#1A7F37',
  red: '#CF222E',
  attention: '#9A6700',
} as const;

export const lightColors = {
  canvas: githubLightPalette.canvas,
  sidebar: githubLightPalette.canvasInset,
  surface: githubLightPalette.canvasInset,
  surfaceRaised: githubLightPalette.surfaceRaised,
  divider: githubLightPalette.border,
  text: githubLightPalette.foreground,
  textSecondary: githubLightPalette.foregroundMuted,
  textTertiary: githubLightPalette.foregroundSubtle,
  primary: githubLightPalette.accent,
  onPrimary: githubLightPalette.canvas,
  activeSurface: githubLightPalette.accent,
  activeSurfaceForeground: githubLightPalette.canvas,
  activeSurfaceAlpha: 'D6',
  controlSurface: githubLightPalette.surfaceRaised,
  disabled: githubLightPalette.foregroundDisabled,
  input: githubLightPalette.canvas,
  scrim: '#1B1F2466',
  link: githubLightPalette.accent,
  working: githubLightPalette.green,
  blocked: githubLightPalette.red,
  done: githubLightPalette.green,
  idle: githubLightPalette.foregroundSubtle,
  unknown: githubLightPalette.attention,
  warning: githubLightPalette.attention,
  error: githubLightPalette.red,
} as const;

// E-Ink displays need opaque, high-contrast surfaces. Keep semantic colors
// monochrome, but retain several dark-gray levels so secondary information is
// distinguishable without relying on color reproduction.
export const einkColors = {
  canvas: '#FFFFFF',
  sidebar: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceRaised: '#F0F0F0',
  divider: '#777777',
  text: '#000000',
  textSecondary: '#333333',
  textTertiary: '#555555',
  primary: '#000000',
  onPrimary: '#FFFFFF',
  // Active host/workspace/pane pills use a light neutral fill rather than a
  // solid black block on E-Ink screens.
  activeSurface: '#D4D4D4',
  activeSurfaceForeground: '#000000',
  // Do not let the white E-Ink canvas wash the active tab back toward white.
  activeSurfaceAlpha: 'FF',
  // Composer action buttons are a little darker than active tabs.
  controlSurface: '#CECECE',
  disabled: '#666666',
  input: '#FFFFFF',
  scrim: '#FFFFFF',
  link: '#222222',
  working: '#333333',
  blocked: '#222222',
  done: '#333333',
  idle: '#555555',
  unknown: '#444444',
  warning: '#333333',
  error: '#222222',
} as const;

export const tokyoNightPalette = {
  background: '#1A1B26',
  backgroundDark: '#16161E',
  backgroundHighlight: '#292E42',
  surface: '#24283B',
  surfaceRaised: '#414868',
  foreground: '#C0CAF5',
  foregroundDark: '#A9B1D6',
  comment: '#545C7E',
  black: '#15161E',
  red: '#F7768E',
  green: '#9ECE6A',
  yellow: '#E0AF68',
  blue: '#7AA2F7',
  magenta: '#BB9AF7',
  cyan: '#7DCFFF',
  orange: '#FF9E64',
  selection: '#283457',
  brightRed: '#FF899D',
  brightGreen: '#9FE044',
  brightYellow: '#FABA4A',
  brightBlue: '#8DB0FF',
  brightMagenta: '#C7A9FF',
  brightCyan: '#A4DAFF',
} as const;

export const darkColors = {
  canvas: tokyoNightPalette.background,
  sidebar: tokyoNightPalette.backgroundDark,
  surface: tokyoNightPalette.surface,
  surfaceRaised: tokyoNightPalette.backgroundHighlight,
  divider: tokyoNightPalette.surfaceRaised,
  text: tokyoNightPalette.foreground,
  textSecondary: tokyoNightPalette.foregroundDark,
  textTertiary: tokyoNightPalette.comment,
  primary: tokyoNightPalette.blue,
  onPrimary: tokyoNightPalette.backgroundDark,
  activeSurface: tokyoNightPalette.blue,
  activeSurfaceForeground: tokyoNightPalette.backgroundDark,
  activeSurfaceAlpha: 'D6',
  controlSurface: tokyoNightPalette.backgroundHighlight,
  disabled: tokyoNightPalette.surfaceRaised,
  input: tokyoNightPalette.surface,
  scrim: '#00000099',
  link: tokyoNightPalette.blue,
  working: tokyoNightPalette.green,
  blocked: tokyoNightPalette.red,
  done: tokyoNightPalette.green,
  idle: tokyoNightPalette.comment,
  unknown: tokyoNightPalette.yellow,
  warning: tokyoNightPalette.yellow,
  error: tokyoNightPalette.red,
} as const;

export type ThemeColors = { [Key in keyof typeof lightColors]: string };

export const terminalColors = {
  canvas: tokyoNightPalette.background,
  panel: tokyoNightPalette.backgroundDark,
  panelRaised: tokyoNightPalette.surface,
  line: tokyoNightPalette.backgroundHighlight,
  text: tokyoNightPalette.foreground,
  muted: tokyoNightPalette.foregroundDark,
  accent: tokyoNightPalette.blue,
  warning: tokyoNightPalette.yellow,
  working: darkColors.working,
  blocked: darkColors.blocked,
  done: darkColors.done,
  idle: darkColors.idle,
  unknown: darkColors.unknown,
};

// Compatibility for terminal-only components. Management UI should use useTheme().
export const colors = {
  ink: tokyoNightPalette.backgroundDark,
  panel: terminalColors.panel,
  panelRaised: terminalColors.panelRaised,
  line: terminalColors.line,
  text: terminalColors.text,
  muted: terminalColors.muted,
  acid: terminalColors.accent,
  warning: terminalColors.warning,
  working: terminalColors.working,
  blocked: terminalColors.blocked,
  done: terminalColors.done,
  idle: terminalColors.idle,
  unknown: terminalColors.unknown,
};

export function resolveTheme(scheme: 'light' | 'dark' | 'unspecified' | null | undefined): ThemeColors {
  return scheme === 'light' ? lightColors : darkColors;
}

export function useTheme() {
  const scheme = useColorScheme();
  const { isEink } = useDisplayProfile();
  const isDark = !isEink && scheme !== 'light';
  return {
    colors: isEink ? einkColors : resolveTheme(scheme),
    isDark,
    scheme: isDark ? 'dark' as const : 'light' as const,
    isEink,
  };
}

export function statusColor(status: string, palette: ThemeColors | typeof colors = colors): string {
  const key = status as 'working' | 'blocked' | 'done' | 'idle' | 'unknown';
  return palette[key] || palette.unknown;
}

export function terminalStatusColor(
  status: TerminalSessionStatus,
  palette: ThemeColors | typeof colors = colors,
): string {
  if (status === 'connected') return palette.done;
  if (status === 'connecting') return palette.working;
  if (status === 'error') return palette.blocked;
  return palette.idle;
}

/** A healthy terminal must not mask the Herdr agent state shown by a tab. */
export function sessionTabStatusColor(
  agentStatus: string,
  terminalStatus?: TerminalSessionStatus,
  palette: ThemeColors | typeof colors = colors,
): string {
  return terminalStatus && terminalStatus !== 'connected'
    ? terminalStatusColor(terminalStatus, palette)
    : statusColor(agentStatus, palette);
}

export function sessionTabGlassStyle(active: boolean, palette: ThemeColors) {
  return {
    backgroundColor: colorWithAlpha(active ? palette.activeSurface : palette.surface, active ? palette.activeSurfaceAlpha : 'B8'),
    borderColor: colorWithAlpha(active ? palette.activeSurfaceForeground : palette.text, active ? '47' : '29'),
  };
}

export function sessionAgentRailStyle(
  active: boolean,
  accent: string,
  palette: ThemeColors,
) {
  return {
    backgroundColor: colorWithAlpha(
      active ? palette.activeSurface : palette.surface,
      active ? palette.activeSurfaceAlpha : 'B8',
    ),
    borderColor: colorWithAlpha(active ? palette.activeSurfaceForeground : accent, active ? '70' : '65'),
  };
}

export function appGlassControlStyle(active: boolean, palette: ThemeColors) {
  return {
    backgroundColor: 'transparent',
    borderColor: colorWithAlpha(active ? palette.primary : palette.text, active ? 'D6' : '47'),
  };
}

export function colorWithAlpha(color: string, alpha: string): string {
  return /^#[\da-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};
