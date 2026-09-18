//! Foreground-aware health, latency, and reconciliation policy.

use super::*;
use std::time::Instant;

const NORMAL_HEALTH_INTERVAL: Duration = Duration::from_secs(15);
const EINK_HEALTH_INTERVAL: Duration = Duration::from_secs(60);
const RECONCILE_INTERVAL: Duration = Duration::from_secs(120);
const NORMAL_VISIBLE_LATENCY_INTERVAL: Duration = Duration::from_secs(3);
const EINK_VISIBLE_LATENCY_INTERVAL: Duration = Duration::from_secs(15);
const RECOVERY_FAILURE_THRESHOLD: u32 = 3;

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
    worker_running: bool,
    latency_failures: u32,
    force_probe: bool,
}

pub(super) fn set_monitoring_state(
    inner: &Arc<RuntimeInner>,
    app_active: bool,
    hosts_visible: bool,
    access_locked: bool,
    is_eink: bool,
) {
    let (start_worker, became_active) = {
        let mut monitoring = inner.monitoring.lock();
        let became_active = app_active && !monitoring.app_active;
        let was_visible = monitoring.hosts_visible && !monitoring.access_locked;
        let is_visible = hosts_visible && !access_locked;
        if became_active || (!was_visible && is_visible) || monitoring.is_eink != is_eink {
            monitoring.force_probe = true;
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
                let (active, visible, is_eink, force_probe) = {
                    let monitoring = inner.monitoring.lock();
                    (
                        monitoring.app_active,
                        monitoring.hosts_visible && !monitoring.access_locked,
                        monitoring.is_eink,
                        monitoring.force_probe,
                    )
                };
                if !active {
                    drop(inner);
                    changed_notification.as_mut().await;
                    continue;
                }

                let now = Instant::now();
                let intervals = monitoring_intervals(is_eink);
                let health_due = force_probe
                    || last_health.map_or(true, |last| {
                        now.saturating_duration_since(last) >= intervals.health
                    });
                let visible_latency_due = visible && (force_probe
                    || last_visible_latency.map_or(true, |last| {
                        now.saturating_duration_since(last) >= intervals.visible_latency
                    }));
                let health_probe_due = health_due;
                if health_probe_due || visible_latency_due {
                    if health_due {
                        last_health = Some(now);
                    }
                    if visible_latency_due {
                        last_visible_latency = Some(now);
                    }
                    if force_probe {
                        inner.monitoring.lock().force_probe = false;
                    }
                    probe(inner.clone()).await;
                }

                let reconcile_due = last_reconcile.map_or(true, |last| {
                    now.saturating_duration_since(last) >= RECONCILE_INTERVAL
                });
                let needs_reconcile = {
                    let state = inner.state.lock();
                    let projection = state.host_state.projection();
                    monitoring_reconcile_needed(
                        state.connection == HostConnectionState::Connected,
                        reconcile_due,
                        health_probe_due,
                        projection.needs_resync,
                        projection.freshness == crate::host_state::HostFreshness::Fresh,
                    )
                };
                if needs_reconcile {
                    if reconcile_due {
                        last_reconcile = Some(now);
                    }
                    let _ = refresh_host_state_inner(inner).await;
                    continue;
                }

                if health_probe_due || visible_latency_due {
                    continue;
                }

                let next_deadline = [
                    last_health.map(|last| last + intervals.health),
                    visible.then(|| {
                        last_visible_latency
                            .map(|last| last + intervals.visible_latency)
                            .unwrap_or(now)
                    }),
                    (inner.state.lock().connection == HostConnectionState::Connected)
                        .then(|| {
                            last_reconcile
                                .map(|last| last + RECONCILE_INTERVAL)
                                .unwrap_or(now)
                        }),
                ]
                .into_iter()
                .flatten()
                .min();
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
    match measure_host_latency_inner(inner.clone()).await {
        Ok(measurement) => {
            inner.monitoring.lock().latency_failures = 0;
            emit(HostRuntimeEvent::LatencyMeasured {
                runtime_id: inner.id.clone(),
                measurement,
            });
        }
        Err(error) => {
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
            Duration::from_secs(15)
        );
    }

    #[test]
    fn reconciliation_interval_is_independent_of_display_policy() {
        assert_eq!(RECONCILE_INTERVAL, Duration::from_secs(120));
    }

    #[test]
    fn stale_projection_reconciles_when_health_probe_is_due() {
        assert!(monitoring_reconcile_needed(
            true, false, true, false, false,
        ));
        assert!(monitoring_reconcile_needed(
            true, false, true, true, true,
        ));
        assert!(!monitoring_reconcile_needed(
            true, false, false, true, false,
        ));
    }
}
