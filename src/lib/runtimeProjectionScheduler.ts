export type RuntimeProjectionPriority = 'urgent' | 'transition';

/** Gates automatic projections without copying any Rust-owned host state. */
export function createRuntimeProjectionScheduler<View = undefined>(
  project: (view: View | undefined, priority: RuntimeProjectionPriority) => void,
  initiallyActive: boolean,
) {
  let active = initiallyActive;
  let dirty = false;
  return {
    request(view?: View, priority: RuntimeProjectionPriority = 'urgent') {
      dirty = true;
      if (active) {
        project(view, priority);
        dirty = false;
      }
    },
    setActive(next: boolean) {
      active = next;
      if (active && dirty) {
        // Resume and notification navigation read the result immediately.
        project(undefined, 'urgent');
        dirty = false;
      }
    },
    committed() { dirty = false; },
  };
}

/** Navigation and recovery must see the projection before React schedules its render. */
export function publishRuntimeProjection<State>(
  stateRef: { current: State },
  next: State,
  publish: (state: State) => void,
): void {
  stateRef.current = next;
  publish(next);
}
