import { useSyncExternalStore } from 'react';
import { Text } from './ui/text';

/** The native input owns IME composition; only the counter subscribes to drafts. */
export function createComposerDraftStore() {
  let text = '';
  const listeners = new Set<() => void>();
  return {
    getText: () => text,
    getLength: () => text.length,
    setText: (value: string) => {
      if (value === text) return;
      const lengthChanged = value.length !== text.length;
      text = value;
      if (lengthChanged) listeners.forEach(listener => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export function ComposerCharacterCount({ store, format }: {
  store: ReturnType<typeof createComposerDraftStore>;
  format: (count: string) => string;
}) {
  const length = useSyncExternalStore(store.subscribe, store.getLength, store.getLength);
  return (
    <Text className="ml-auto px-2 font-mono text-[9px] text-terminal-muted">
      {format(length.toLocaleString())}
    </Text>
  );
}
