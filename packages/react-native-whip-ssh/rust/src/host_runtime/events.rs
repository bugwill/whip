//! Herdr event subscription lifecycle and host-state reconciliation.

use super::*;
use std::collections::HashSet;
use std::time::Instant;

use crate::herdr_api::{HerdrControlRequest, HerdrControlResult};
use crate::herdr_events::{
    HerdrEvent, HerdrEventError, close_herdr_event_subscription, start_replacing_on_runtime as start_events,
};
use crate::host_state::{ApplyResult, HostStateSnapshot, ResyncAction, SnapshotToken, now_ms};

pub(super) fn reconcile_control_result(
    inner: &Arc<RuntimeInner>,
    request: &HerdrControlRequest,
    result: &HerdrControlResult,
    pane_close_terminal_id: Option<&str>,
) {
    if !matches!(result, HerdrControlResult::SessionSnapshot { .. }) {
        match request {
            HerdrControlRequest::PaneSendInput { pane_id, .. }
            | HerdrControlRequest::PaneSendText { pane_id, .. }
            | HerdrControlRequest::PaneSendKeys { pane_id, .. } => inner.agents.wake_pane(pane_id),
            _ => {}
        }
    }
    if matches!(result, HerdrControlResult::SessionSnapshot { .. }) {
        return;
    }
    let outcome = {
        let mut state = inner.state.lock();
        let generation = state.generation;
        state
            .host_state
            .apply_control_result(generation, request, result)
    };
    if !matches!(outcome, ApplyResult::IgnoredStale) {
        emit_host_state(inner);
    }
    if matches!(request, HerdrControlRequest::PaneClose { .. })
        && matches!(result, HerdrControlResult::Ok)
        && !matches!(outcome, ApplyResult::IgnoredStale)
        && let Some(terminal_id) = pane_close_terminal_id
    {
        close_terminal_intent(inner, terminal_id.to_owned());
    }
    match outcome {
        ApplyResult::NeedsResync(reason) => schedule_state_resync(inner.clone(), reason),
        ApplyResult::Applied
            if matches!(
                request,
                HerdrControlRequest::WorkspaceCreate { .. }
                    | HerdrControlRequest::WorkspaceClose { .. }
                    | HerdrControlRequest::TabCreate { .. }
                    | HerdrControlRequest::TabClose { .. }
                    | HerdrControlRequest::PaneSplit { .. }
            ) =>
        {
            schedule_state_resync(
                inner.clone(),
                "control result may have changed the pane event subscription set".to_owned(),
            );
        }
        ApplyResult::Applied | ApplyResult::IgnoredStale => {}
    }
}

pub(super) fn begin_host_state_sync(inner: &RuntimeInner) -> (u64, SnapshotToken) {
    let (connection_generation, token) = {
        let mut state = inner.state.lock();
        let generation = state.generation;
        let token = state.host_state.begin_sync(generation);
        drop(state);
        (generation, token)
    };
    emit_host_state(inner);
    (connection_generation, token)
}

pub(super) async fn request_host_state_snapshot(
    inner: Arc<RuntimeInner>,
    token: SnapshotToken,
) -> ApplyResult {
    let response = control_request_inner(inner.clone(), HerdrControlRequest::SessionSnapshot).await;
    let response = match response {
        Err(error) if is_transport_control_error(&error) => {
            // Preserve the existing cold-connect behavior: retry the direct
            // stream-local channel once without repeating SSH authentication.
            control_request_inner(inner.clone(), HerdrControlRequest::SessionSnapshot).await
        }
        response => response,
    };
    let outcome = match response {
        Ok(HerdrControlResult::SessionSnapshot { snapshot }) => inner
            .state
            .lock()
            .host_state
            .complete_sync(token, snapshot, now_ms()),
        Ok(_) => inner.state.lock().host_state.fail_sync(
            token,
            "Herdr returned an unexpected result for session.snapshot".to_owned(),
        ),
        Err(error) => inner
            .state
            .lock()
            .host_state
            .fail_sync(token, error.to_string()),
    };
    emit_host_state(&inner);
    outcome
}

pub(super) async fn reconcile_host_state_subscription(
    inner: Arc<RuntimeInner>,
    connection_generation: u64,
    outcome: ApplyResult,
) {
    if matches!(outcome, ApplyResult::Applied)
        && inner.state.lock().generation == connection_generation
        && event_subscription_needs_update(&inner)
    {
        // Start the reconciliation generation before opening the subscription.
        // Events can then be buffered as soon as Herdr acknowledges the stream,
        // including events delivered before the follow-up snapshot request.
        let (reconciliation_generation, reconciliation_token) = begin_host_state_sync(&inner);
        match start_or_update_state_events(inner.clone()).await {
            Ok(()) => {
                let reconciliation =
                    request_host_state_snapshot(inner.clone(), reconciliation_token).await;
                if matches!(reconciliation, ApplyResult::Applied)
                    && inner.state.lock().generation == reconciliation_generation
                    && event_subscription_needs_update(&inner)
                {
                    schedule_state_resync(
                        inner,
                        "pane subscription set changed during snapshot reconciliation".to_owned(),
                    );
                }
            }
            Err(error) => {
                let reason = error.to_string();
                inner
                    .state
                    .lock()
                    .host_state
                    .fail_sync(reconciliation_token, reason.clone());
                event_subscription_start_failed(inner, reason);
            }
        }
    }
}

pub(super) fn event_subscription_needs_update(inner: &RuntimeInner) -> bool {
    let state = inner.state.lock();
    let pane_ids = state.host_state.pane_ids();
    state
        .event
        .as_ref()
        .is_none_or(|event| !event_subscription_current(event, &pane_ids))
}

/// An acknowledged or still-starting subscription for the same pane set needs
/// no restart; restarting an in-flight setup would only supersede it.
fn event_subscription_current(event: &EventSubscriptionRuntime, pane_ids: &[String]) -> bool {
    event.pane_ids == pane_ids && (event.active || event.starting) && !event.retry_running
}

pub(super) fn event_subscription_start_failed(inner: Arc<RuntimeInner>, reason: String) {
    inner
        .state
        .lock()
        .host_state
        .mark_needs_resync(format!("event subscription unavailable: {reason}"));
    emit_host_state(&inner);
    emit(HostRuntimeEvent::EventSubscriptionClosed {
        runtime_id: inner.id.clone(),
        reason: reason.clone(),
    });
    schedule_event_retry(inner, reason);
}

pub(super) async fn refresh_host_state_inner(inner: Arc<RuntimeInner>) -> HostStateSnapshot {
    crate::power_diagnostics::record(crate::power_diagnostics::Counter::Reconcile, 1);
    if let Err(error) = ensure_herdr_server(&inner).await {
        let (_, token) = begin_host_state_sync(&inner);
        inner
            .state
            .lock()
            .host_state
            .fail_sync(token, error.to_string());
        emit_host_state(&inner);
        return inner.state.lock().host_state.projection();
    }

    let (connection_generation, token) = begin_host_state_sync(&inner);
    let outcome = request_host_state_snapshot(inner.clone(), token).await;
    reconcile_host_state_subscription(inner.clone(), connection_generation, outcome).await;
    inner.state.lock().host_state.projection()
}

/// Coalesces a burst of gap reports into one snapshot request.
const RESYNC_COALESCE_DELAY: Duration = Duration::from_millis(250);
/// Poll interval while another snapshot is already in flight.
const RESYNC_ACTIVE_SYNC_POLL: Duration = Duration::from_millis(250);
/// Bound on waiting for someone else's snapshot before superseding it.
const RESYNC_ACTIVE_SYNC_MAX_WAIT: Duration = Duration::from_secs(15);

/// Gap recovery runs on its own task rather than the monitoring worker, so a
/// slow latency probe cannot delay it. One task per connection generation owns
/// `resync_running`; it waits for an in-flight snapshot instead of issuing a
/// duplicate, then re-checks for gaps reported while that snapshot ran.
pub(super) fn schedule_state_resync(inner: Arc<RuntimeInner>, reason: String) {
    let (should_spawn, generation) = {
        let mut state = inner.state.lock();
        (state.host_state.request_resync(reason), state.generation)
    };
    if !should_spawn {
        return;
    }
    let Ok(runtime) = crate::runtime() else {
        inner.state.lock().host_state.cancel_resync();
        return;
    };
    runtime.spawn(async move {
        tokio::time::sleep(RESYNC_COALESCE_DELAY).await;
        let mut waited = Duration::ZERO;
        loop {
            let action = {
                let mut state = inner.state.lock();
                if state.generation != generation {
                    // Connection replacement already reset the resync owner.
                    return;
                }
                if state.connection != HostConnectionState::Connected || state.explicit_disconnect
                {
                    state.host_state.cancel_resync();
                    return;
                }
                state
                    .host_state
                    .next_resync_action(waited >= RESYNC_ACTIVE_SYNC_MAX_WAIT)
            };
            match action {
                ResyncAction::Done => return,
                ResyncAction::WaitForActiveSync => {
                    tokio::time::sleep(RESYNC_ACTIVE_SYNC_POLL).await;
                    waited += RESYNC_ACTIVE_SYNC_POLL;
                }
                ResyncAction::Run => {
                    waited = Duration::ZERO;
                    let _ = refresh_host_state_inner(inner.clone()).await;
                    // Gaps reported during this snapshot are coalesced too.
                    tokio::time::sleep(RESYNC_COALESCE_DELAY).await;
                }
            }
        }
    });
}

#[derive(Debug, Default)]
pub(super) struct HerdrEventBatchResult {
    pub(super) changed: bool,
    pub(super) changed_agent_pane_ids: Vec<String>,
    pub(super) resync_reason: Option<String>,
}

pub(super) fn apply_herdr_event_batch(
    state: &mut RuntimeState,
    events: impl IntoIterator<Item = HerdrEvent>,
) -> HerdrEventBatchResult {
    let mut result = HerdrEventBatchResult::default();
    let mut changed_agent_pane_ids = HashSet::new();
    let generation = state.generation;
    for event in events {
        let changes_projection = !matches!(event, HerdrEvent::PaneOutputChanged { .. });
        let agent_pane_id = match &event {
            HerdrEvent::PaneAgentStatusChanged { pane_id, .. } => Some(pane_id.clone()),
            _ => None,
        };
        let outcome = state.host_state.apply_event(generation, event, now_ms());
        if matches!(outcome, ApplyResult::IgnoredStale) {
            continue;
        }
        result.changed |= changes_projection || matches!(outcome, ApplyResult::NeedsResync(_));
        if let Some(pane_id) = agent_pane_id {
            changed_agent_pane_ids.insert(pane_id);
        }
        if let ApplyResult::NeedsResync(reason) = outcome
            && result.resync_reason.is_none()
        {
            result.resync_reason = Some(reason);
        }
    }
    result.changed_agent_pane_ids = changed_agent_pane_ids.into_iter().collect();
    result.changed_agent_pane_ids.sort_unstable();
    result
}

/// Called by the typed event decoder with all events parsed from one transport
/// read. Rust applies the entire burst authoritatively before projecting once.
pub(crate) fn deliver_herdr_events(
    client_key: &str,
    events: Vec<HerdrEvent>,
) -> Option<Vec<HerdrEvent>> {
    let runtime = runtimes().read().get(client_key).and_then(Weak::upgrade);
    let Some(runtime) = runtime else {
        return Some(events);
    };
    let result = {
        let mut state = runtime.state.lock();
        if state.connection != HostConnectionState::Connected || state.event.is_none() {
            return None;
        }
        let result = apply_herdr_event_batch(&mut state, events);
        drop(state);
        result
    };
    for pane_id in &result.changed_agent_pane_ids {
        runtime.agents.wake_pane(pane_id);
    }
    if result.changed {
        emit_host_state(&runtime);
    }
    if let Some(reason) = result.resync_reason {
        schedule_state_resync(runtime, reason);
    }
    None
}

pub(super) fn mark_event_subscription_closed(state: &mut RuntimeState) {
    if let Some(event) = state.event.as_mut() {
        event.active = false;
        event.starting = false;
        // Invalidate a setup still awaiting start_events: its later successful
        // return must not overwrite a close callback that already ran.
        event.operation_epoch = event.operation_epoch.wrapping_add(1);
        event.retry_running = false;
    }
}

pub(crate) fn event_subscription_closed(client_key: &str, reason: String) -> bool {
    let runtime = runtimes().read().get(client_key).and_then(Weak::upgrade);
    let Some(runtime) = runtime else { return false };
    let mut state = runtime.state.lock();
    if state.event.is_none() || state.connection != HostConnectionState::Connected {
        return true;
    }
    mark_event_subscription_closed(&mut state);
    drop(state);
    schedule_state_resync(
        runtime.clone(),
        format!("event subscription closed: {reason}"),
    );
    emit_host_state(&runtime);
    emit(HostRuntimeEvent::EventSubscriptionClosed {
        runtime_id: runtime.id.clone(),
        reason: reason.clone(),
    });
    schedule_event_retry(runtime, reason);
    true
}

pub(crate) fn terminal_bridge_closed(
    client_key: &str,
    terminal_id: &str,
    bridge_id: HerdrBridgeId,
    reason: String,
) -> bool {
    let runtime = runtimes().read().get(client_key).and_then(Weak::upgrade);
    let Some(runtime) = runtime else { return false };
    if runtime.state.lock().connection != HostConnectionState::Connected {
        return true;
    }
    schedule_terminal_retry(runtime, terminal_id.to_owned(), Some(bridge_id), reason);
    true
}

pub(crate) fn terminal_kitty_keyboard_report_all_changed(
    client_key: &str,
    terminal_id: &str,
    bridge_id: HerdrBridgeId,
    enabled: bool,
) {
    let runtime = runtimes().read().get(client_key).and_then(Weak::upgrade);
    let Some(runtime) = runtime else { return };
    let mut state = runtime.state.lock();
    let current_bridge_id = state
        .terminals
        .get(terminal_id)
        .and_then(|terminal| terminal.bridge_id);
    if current_bridge_id == Some(bridge_id) {
        state
            .terminal_kitty_keyboard_report_all
            .insert(terminal_id.to_owned(), enabled);
    }
}

/// Outcome of a start that did not fail for the operation that requested it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum EventStart {
    /// The subscription is acknowledged and owned by the current operation.
    Current,
    /// A newer operation or a close callback replaced this start. The newer
    /// owner is responsible for recovery, so this is neither success nor failure.
    Superseded,
}

fn event_operation_current(state: &RuntimeState, epoch: u64, operation_epoch: u64) -> bool {
    state.epoch == epoch
        && state
            .event
            .as_ref()
            .is_some_and(|event| event.operation_epoch == operation_epoch)
}

pub(super) async fn start_desired_events(
    inner: Arc<RuntimeInner>,
    epoch: u64,
) -> Result<EventStart, HerdrEventError> {
    let (protocol, pane_ids, operation_epoch) = {
        let mut state = inner.state.lock();
        let protocol = state.protocol;
        let event = state.event.as_mut().ok_or_else(|| {
            HerdrEventError::SubscriptionUnavailable(
                "event subscription is not requested".to_owned(),
            )
        })?;
        let protocol = protocol.ok_or_else(|| {
            HerdrEventError::UnsupportedProtocol("Herdr protocol is unknown".to_owned())
        })?;
        event.active = false;
        event.starting = true;
        (protocol, event.pane_ids.clone(), event.operation_epoch)
    };
    let started = start_events(inner.herdr.clone(), protocol, pane_ids).await;
    let mut state = inner.state.lock();
    if !event_operation_current(&state, epoch, operation_epoch) {
        drop(state);
        // Only this start's own ID is closed; a replacement keeps its stream.
        if let Ok(subscription_handle) = started {
            subscription_handle.close_if_owned();
        }
        return Ok(EventStart::Superseded);
    }
    let event = state.event.as_mut().expect("current operation has an event");
    event.starting = false;
    match started {
        Ok(_) => {
            event.active = true;
            Ok(EventStart::Current)
        }
        Err(error) => Err(error),
    }
}

pub(super) async fn start_or_update_state_events(
    inner: Arc<RuntimeInner>,
) -> Result<(), HerdrEventError> {
    ensure_herdr_server(&inner)
        .await
        .map_err(|error| HerdrEventError::SubscriptionUnavailable(error.to_string()))?;
    let (epoch, changed) =
        {
            let mut state = inner.state.lock();
            let pane_ids = state.host_state.pane_ids();
            if state
                .event
                .as_ref()
                .is_some_and(|event| event_subscription_current(event, &pane_ids))
            {
                (state.epoch, false)
            } else {
                let operation_epoch = state
                    .event
                    .as_ref()
                    .map_or(1, |event| event.operation_epoch.wrapping_add(1));
                state.event = Some(EventSubscriptionRuntime {
                    active: false,
                    starting: false,
                    pane_ids,
                    operation_epoch,
                    retry_running: false,
                });
                (state.epoch, true)
            }
        };
    if !changed {
        return Ok(());
    }
    close_herdr_event_subscription(inner.id.clone());
    start_desired_events(inner, epoch).await.map(|_| ())
}

pub(super) fn schedule_event_retry(inner: Arc<RuntimeInner>, reason: String) {
    let (epoch, operation_epoch) = {
        let mut state = inner.state.lock();
        let epoch = state.epoch;
        let explicit_disconnect = state.explicit_disconnect;
        let Some(event) = state.event.as_mut() else {
            return;
        };
        if event.retry_running || explicit_disconnect {
            return;
        }
        event.active = false;
        event.starting = false;
        event.retry_running = true;
        let operation_epoch = event.operation_epoch;
        drop(state);
        (epoch, operation_epoch)
    };
    if let Ok(runtime) = crate::runtime() {
        runtime.spawn(async move {
            let started_at = Instant::now();
            let mut last_error = reason;
            for attempt in 1..=MAX_RECONNECT_ATTEMPTS {
                let delay = reconnect_delay(attempt, runtime_jitter(&inner, attempt));
                tokio::time::sleep(Duration::from_millis(delay)).await;
                {
                    let state = inner.state.lock();
                    if state.epoch != epoch
                        || state.explicit_disconnect
                        || state
                            .event
                            .as_ref()
                            .is_none_or(|event| event.operation_epoch != operation_epoch)
                    {
                        return;
                    }
                }
                close_herdr_event_subscription(inner.id.clone());
                match start_desired_events(inner.clone(), epoch).await {
                    // The replacing operation owns recovery and its own flags.
                    Ok(EventStart::Superseded) => return,
                    Ok(EventStart::Current) => {
                        let generation = {
                            let mut state = inner.state.lock();
                            if let Some(event) = state.event.as_mut() {
                                event.retry_running = false;
                            }
                            state.generation
                        };
                        emit(HostRuntimeEvent::EventSubscriptionRestored {
                            runtime_id: inner.id.clone(),
                            generation,
                        });
                        emit_diagnostic(
                            &inner,
                            RuntimeDiagnosticOperation::EventStreamRecovery,
                            started_at,
                            None,
                            None,
                            None,
                        );
                        schedule_state_resync(
                            inner.clone(),
                            "event subscription restarted after a delivery gap".to_owned(),
                        );
                        return;
                    }
                    Err(error) => last_error = error.to_string(),
                }
            }
            if let Some(event) = inner.state.lock().event.as_mut() {
                event.retry_running = false;
            }
            emit(HostRuntimeEvent::EventSubscriptionClosed {
                runtime_id: inner.id.clone(),
                reason: last_error.clone(),
            });
            emit_diagnostic(
                &inner,
                RuntimeDiagnosticOperation::EventStreamRecovery,
                started_at,
                None,
                None,
                Some(last_error),
            );
        });
    }
}
#[uniffi::export]
impl HostRuntime {
    pub async fn refresh_state(&self) -> Result<HostStateSnapshot, HostRuntimeError> {
        let inner = self.inner.clone();
        crate::runtime()
            .map_err(HostRuntimeError::SshTransportFailure)?
            .spawn(async move {
                if inner.state.lock().connection != HostConnectionState::Connected {
                    return Err(HostRuntimeError::RuntimeDisconnected(
                        "host runtime is not connected".to_owned(),
                    ));
                }
                Ok(refresh_host_state_inner(inner).await)
            })
            .await
            .map_err(|error| {
                HostRuntimeError::SshTransportFailure(format!(
                    "host state refresh task failed: {error}"
                ))
            })?
    }

    pub async fn subscribe_events(&self, pane_ids: Vec<String>) -> Result<(), HerdrEventError> {
        let inner = self.inner.clone();
        crate::runtime()
            .map_err(HerdrEventError::TransportDisconnected)?
            .spawn(async move {
                close_herdr_event_subscription(inner.id.clone());
                let epoch = {
                    let mut state = inner.state.lock();
                    let operation_epoch = state
                        .event
                        .as_ref()
                        .map_or(1, |event| event.operation_epoch.wrapping_add(1));
                    state.event = Some(EventSubscriptionRuntime {
                        active: false,
                        starting: false,
                        pane_ids,
                        operation_epoch,
                        retry_running: false,
                    });
                    state.epoch
                };
                start_desired_events(inner, epoch).await.map(|_| ())
            })
            .await
            .map_err(|error| {
                HerdrEventError::SubscriptionUnavailable(format!("host event task failed: {error}"))
            })?
    }

    pub fn unsubscribe_events(&self) {
        self.inner.state.lock().event = None;
        close_herdr_event_subscription(self.inner.id.clone());
    }
}
