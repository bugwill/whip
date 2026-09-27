//! Opt-in in-memory counters. No logging, persistence, timers, or UI events.
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

static ENABLED: AtomicBool = AtomicBool::new(false);
static COUNTERS: [AtomicU64; 10] = [const { AtomicU64::new(0) }; 10];
#[derive(Clone, Copy)]
pub(crate) enum Counter {
    HealthProbe,
    LatencyProbe,
    Reconcile,
    ProbeFailure,
    Reconnect,
    OpenCodeCursor,
    OpenCodeNoChange,
    OpenCodeCursorMicros,
    OpenCodeVisibleMicros,
    ActualProbe,
}
pub(crate) fn enabled() -> bool {
    ENABLED.load(Ordering::Relaxed)
}
pub(crate) fn record(counter: Counter, amount: u64) {
    if enabled() {
        COUNTERS[counter as usize].fetch_add(amount, Ordering::Relaxed);
    }
}
/// Reset explicitly at the start of a diagnostic scene. Disabled by default.
#[uniffi::export]
pub fn set_power_diagnostics_enabled(enabled: bool, reset: bool) {
    ENABLED.store(false, Ordering::Relaxed);
    if reset {
        for counter in &COUNTERS {
            counter.store(0, Ordering::Relaxed);
        }
    }
    ENABLED.store(enabled, Ordering::Relaxed);
}
/// Snapshot once at scene completion; durations are totals in microseconds.
/// Visible latency is cursor query start to transcript application, not remote
/// creation to screen paint, which requires remote/device instrumentation.
#[uniffi::export]
pub fn power_diagnostics_snapshot() -> String {
    let names = [
        "healthProbeDue",
        "latencyProbeDue",
        "reconcile",
        "probeFailure",
        "reconnect",
        "openCodeCursor",
        "openCodeNoChange",
        "openCodeCursorMicros",
        "openCodeVisibleMicros",
        "actualProbe",
    ];
    let values = names
        .into_iter()
        .zip(&COUNTERS)
        .map(|(name, counter)| (name, counter.load(Ordering::Relaxed)))
        .collect::<std::collections::BTreeMap<_, _>>();
    serde_json::to_string(&values).unwrap_or_default()
}
