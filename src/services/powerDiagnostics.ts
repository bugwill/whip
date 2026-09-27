import * as WhipCore from 'react-native-whip-ssh';
import { registerPerformanceDiagnosticBackend } from './performanceTrace';

// Registered during normal runtime-manager initialization; no work until manual begin/end.
const diagnostics = WhipCore as typeof WhipCore & {
  setPowerDiagnosticsEnabled?: (enabled: boolean, reset: boolean) => void;
  powerDiagnosticsSnapshot?: () => string;
};
registerPerformanceDiagnosticBackend({
  begin: () => diagnostics.setPowerDiagnosticsEnabled?.(true, true),
  end: () => {
    diagnostics.setPowerDiagnosticsEnabled?.(false, false);
    const snapshot = diagnostics.powerDiagnosticsSnapshot?.();
    return snapshot ? (JSON.parse(snapshot) as unknown) : { available: false };
  },
});
