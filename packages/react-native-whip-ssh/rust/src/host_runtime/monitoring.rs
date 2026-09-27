//! Foreground-aware health, latency, and reconciliation policy.

use super::*;
use std::time::Instant;

const NORMAL_HEALTH_INTERVAL: Duration = Duration::from_secs(15);
const EINK_HEALTH_INTERVAL: Duration = Duration::from_secs(60);
const RECONCILE_INTERVAL: Duration = Duration::from_secs(120);
const NORMAL_VISIBLE_LATENCY_INTERVAL: Duration = Duration::from_secs(3);
const EINK_VISIBLE_LATENCY_INTERVAL: Duration = Duration::from_secs(60);
const BACKGROUND_RECONCILE_INTERVAL: Duration = Duration::from_secs(300);
const RECOVERY_FAILURE_THRESHOLD: u32 = 3;

fn latency_ui_visible(app_active: bool, hosts_visible: bool, access_locked: bool) -> bool {
    app_active && hosts_visible && !access_locked
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MonitoringIntervals {
    health: Duration,
    visible_latency: Duration,
}

fn monitoring_intervals(is_eink: bool) -> MonitoringIntervals {
    if is_eink {
        MonitoringIntervals {
            health: EINK_HEALTH_INTERVAL,
            visible_latency: EINK_VISIBLE_LATENCY_INTERVAL,
        }
    } else {
        MonitoringIntervals {
            health: NORMAL_HEALTH_INTERVAL,
            visible_latency: NORMAL_VISIBLE_LATENCY_INTERVAL,
        }
    }
}

fn reconcile_interval(
    app_active: bool,
    events_valid: bool,
    fresh: bool,
    needs_resync: bool,
) -> Duration {
    if !app_active && events_valid && fresh && !needs_resync {
        BACKGROUND_RECONCILE_INTERVAL
    } else {
        RECONCILE_INTERVAL
    }
}

fn monitoring_probe_needed(health_due: bool, latency_due: bool, snapshot_fresh: bool) -> bool {
    latency_due || (health_due && !snapshot_fresh)
}

fn monitoring_reconcile_needed(
    connected: bool,
    reconcile_due: bool,
    health_probe_due: bool,
    needs_resync: bool,
    is_fresh: bool,
) -> bool {
    connected && (reconcile_due || (health_probe_due && (needs_resync || !is_fresh)))
}

#[derive(Debug, Default)]
pub(super) struct MonitoringState {
    pub(super) app_active: bool,
    pub(super) hosts_visible: bool,
    pub(super) access_locked: bool,
    pub(super) is_eink: bool,
    pub(super) worker_running: bool,
    latency_failures: u32,
    force_probe: bool,
    pub(super) force_reconcile: bool,
    #[cfg(test)]
    pub(super) test_due_counts: (u32, u32),
    #[cfg(test)]
    pub(super) test_actual_probes: u32,
}

pub(super) fn set_monitoring_state(
    inner: &Arc<RuntimeInner>,
    app_active: bool,
    hosts_visible: bool,
    access_locked: bool,
    is_eink: bool,
) {
    inner.agents.set_eink(is_eink);
    let (start_worker, became_active) = {
        let mut monitoring = inner.monitoring.lock();
        if monitoring.worker_running
            && monitoring.app_active == app_active
            && monitoring.hosts_visible == hosts_visible
            && monitoring.access_locked == access_locked
            && monitoring.is_eink == is_eink
        {
            return;
        }
        let became_active = app_active && !monitoring.app_active;
        let was_visible = latency_ui_visible(
            monitoring.app_active,
            monitoring.hosts_visible,
            monitoring.access_locked,
        );
        let is_visible = latency_ui_visible(app_active, hosts_visible, access_locked);
        if became_active || (!was_visible && is_visible) || monitoring.is_eink != is_eink {
            monitoring.force_probe = true;
        }
        if became_active {
            monitoring.force_reconcile = true;
        }
        monitoring.app_active = app_active;
        monitoring.hosts_visible = hosts_visible;
        monitoring.access_locked = access_locked;
        monitoring.is_eink = is_eink;
        let start_worker = if monitoring.worker_running {
            false
        } else {
            monitoring.worker_running = true;
            true
        };
        drop(monitoring);
        (start_worker, became_active)
    };
    inner.monitoring_changed.notify_waiters();
    if became_active {
        inner.reconnect_wakeup.notify_one();
    }
    if !start_worker {
        return;
    }
    let weak = Arc::downgrade(inner);
    let changed = inner.monitoring_changed.clone();
    if let Ok(runtime) = crate::runtime() {
        runtime.spawn(async move {
            let mut last_health = None;
            let mut last_reconcile = None;
            let mut last_visible_latency = None;
            loop {
                let Some(inner) = weak.upgrade() else {
                    return;
                };
                // Register before reading state so a lifecycle notification
                // cannot be lost between the check and the await.
                let changed_notification = changed.notified();
                tokio::pin!(changed_notification);
                changed_notification.as_mut().enable();
                let (visible, is_eink, app_active, force_probe, force_reconcile) = {
                    let mut monitoring = inner.monitoring.lock();
                    (
                        latency_ui_visible(monitoring.app_active, monitoring.hosts_visible, monitoring.access_locked),
                        monitoring.is_eink,
                        monitoring.app_active,
                        std::mem::take(&mut monitoring.force_probe),
                        std::mem::take(&mut monitoring.force_reconcile),
                    )
                };
                let now = Instant::now();
                let intervals = monitoring_intervals(is_eink);
                let (connected, needs_resync, fresh, events_valid, sync_in_flight) = {
                    let state = inner.state.lock();
                    let (needs_resync, fresh) = state.host_state.reconciliation_health();
                    (state.connection == HostConnectionState::Connected,
                        needs_resync, fresh,
                        state.event.as_ref().is_some_and(|event| event.active && !event.retry_running),
                        state.host_state.sync_in_flight())
                };
                let reconcile_interval = reconcile_interval(app_active, events_valid, fresh, needs_resync);
                let health_due = force_probe || last_health.map_or(true, |last| now.saturating_duration_since(last) >= intervals.health);
                let latency_due = visible && (force_probe || last_visible_latency.map_or(true, |last| now.saturating_duration_since(last) >= intervals.visible_latency));
                let reconcile_due = last_reconcile.map_or(true, |last| now.saturating_duration_since(last) >= reconcile_interval);
                // Snapshot success proves control-service health. Attempt time is
                // advanced on failure too, so stale state cannot cause a hot loop.
                let reconcile_wanted = monitoring_reconcile_needed(connected, reconcile_due || force_reconcile, health_due || force_reconcile, needs_resync, fresh);
                // An in-flight snapshot (JS refresh or gap resync) already
                // refreshes this state; a second request would only be discarded by its token.
                // Count it as this interval's reconcile so the loop cannot spin.
                let needs_reconcile = reconcile_wanted && !sync_in_flight;
                if reconcile_wanted {
                    last_reconcile = Some(now);
                }
                let mut snapshot_fresh = false;
                if needs_reconcile {
                    let snapshot = refresh_host_state_inner(inner.clone()).await;
                    snapshot_fresh = snapshot.freshness == HostFreshness::Fresh && snapshot.sync_status == HostSyncStatus::Synced;
                    if snapshot_fresh && health_due {
                        last_health = Some(Instant::now());
                        inner.monitoring.lock().latency_failures = 0;
                    }
                }
                // Visible latency still needs a timed measurement; a snapshot
                // only replaces the health probe, never the displayed RTT.
                if monitoring_probe_needed(health_due, latency_due, snapshot_fresh) {
                    #[cfg(test)] {
                        let mut monitoring = inner.monitoring.lock();
                        monitoring.test_due_counts.0 += u32::from(health_due);
                        monitoring.test_due_counts.1 += u32::from(latency_due);
                    }
                    last_health = Some(Instant::now());
                    if latency_due { last_visible_latency = last_health; }
                    if health_due { crate::power_diagnostics::record(crate::power_diagnostics::Counter::HealthProbe, 1); }
                    if latency_due { crate::power_diagnostics::record(crate::power_diagnostics::Counter::LatencyProbe, 1); }
                    probe(inner.clone()).await;
                }
                if needs_reconcile || health_due || latency_due { continue; }
                let next_deadline = [
                    last_health.map(|last| last + intervals.health),
                    visible.then(|| last_visible_latency.map(|last| last + intervals.visible_latency).unwrap_or(now)),
                    connected.then(|| last_reconcile.map(|last| last + reconcile_interval).unwrap_or(now)),
                ].into_iter().flatten().min();
                let Some(next_deadline) = next_deadline else {
                    drop(inner);
                    changed_notification.as_mut().await;
                    continue;
                };
                drop(inner);
                tokio::select! {
                    _ = tokio::time::sleep_until(tokio::time::Instant::from_std(next_deadline)) => {}
                    () = changed_notification => {}
                }
            }
        });
    } else {
        inner.monitoring.lock().worker_running = false;
    }
}

async fn probe(inner: Arc<RuntimeInner>) {
    if inner.state.lock().connection != HostConnectionState::Connected {
        return;
    }
    #[cfg(test)]
    {
        inner.monitoring.lock().test_actual_probes += 1;
    }
    crate::power_diagnostics::record(crate::power_diagnostics::Counter::ActualProbe, 1);
    match measure_host_latency_inner(inner.clone()).await {
        Ok(measurement) => {
            inner.monitoring.lock().latency_failures = 0;
            emit(HostRuntimeEvent::LatencyMeasured {
                runtime_id: inner.id.clone(),
                measurement,
            });
        }
        Err(error) => {
            crate::power_diagnostics::record(crate::power_diagnostics::Counter::ProbeFailure, 1);
            let failures = {
                let mut monitoring = inner.monitoring.lock();
                monitoring.latency_failures = monitoring.latency_failures.saturating_add(1);
                monitoring.latency_failures
            };
            if failures >= RECOVERY_FAILURE_THRESHOLD {
                inner.monitoring.lock().latency_failures = 0;
                begin_reconnect(
                    inner,
                    format!("host health check failed {failures} times: {error}"),
                    true,
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latency_ui_requires_foreground_hosts_page_and_unlocked_access() {
        for app_active in [false, true] {
            for hosts_visible in [false, true] {
                for access_locked in [false, true] {
                    assert_eq!(
                        latency_ui_visible(app_active, hosts_visible, access_locked),
                        (app_active, hosts_visible, access_locked) == (true, true, false),
                    );
                }
            }
        }
    }

    #[test]
    fn monitoring_defaults_to_background_without_polling() {
        let state = MonitoringState::default();
        assert!(!state.app_active);
        assert!(!state.hosts_visible);
        assert!(!state.is_eink);
        assert_eq!(state.latency_failures, 0);
        assert!(!state.force_probe);
    }

    #[test]
    fn monitoring_intervals_preserve_normal_and_eink_policy() {
        assert_eq!(monitoring_intervals(false).health, Duration::from_secs(15));
        assert_eq!(
            monitoring_intervals(false).visible_latency,
            Duration::from_secs(3)
        );
        assert_eq!(monitoring_intervals(true).health, Duration::from_secs(60));
        assert_eq!(
            monitoring_intervals(true).visible_latency,
            Duration::from_secs(60)
        );
    }

    #[test]
    fn only_fresh_background_event_streams_extend_reconciliation() {
        assert_eq!(
            reconcile_interval(false, true, true, false),
            Duration::from_secs(300)
        );
        for (active, events, fresh, gap) in [
            (true, true, true, false),
            (false, false, true, false),
            (false, true, false, false),
            (false, true, true, true),
        ] {
            assert_eq!(
                reconcile_interval(active, events, fresh, gap),
                Duration::from_secs(120)
            );
        }
        // An explicit foreground or event-gap force reconciles fresh state.
        assert!(monitoring_reconcile_needed(true, true, false, false, true));
    }

    #[test]
    fn health_and_visible_latency_share_one_probe_and_snapshot_reuses_health() {
        assert!(monitoring_probe_needed(true, true, false));
        assert!(!monitoring_probe_needed(true, false, true));
        assert!(monitoring_probe_needed(true, true, true));
        assert!(!monitoring_probe_needed(false, false, false));
    }

    #[test]
    fn reconciliation_interval_is_independent_of_display_policy() {
        assert_eq!(RECONCILE_INTERVAL, Duration::from_secs(120));
    }

    #[test]
    fn stale_projection_reconciles_when_health_probe_is_due() {
        assert!(monitoring_reconcile_needed(true, false, true, false, false,));
        assert!(monitoring_reconcile_needed(true, false, true, true, true,));
        assert!(!monitoring_reconcile_needed(
            true, false, false, true, false,
        ));
    }
}
