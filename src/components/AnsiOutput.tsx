import { useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { dominantAnsiBackground, einkAnsiForeground, parseAnsi, resolvedStyle } from '../lib/ansi';
import { useTheme } from '../theme';

interface Props {
  value: string;
}

export function AnsiOutput({ value }: Props) {
  const { colors, isEink } = useTheme();
  const { t } = useTranslation();
  const scrollView = useRef<ScrollView | null>(null);
  const segments = useMemo(() => parseAnsi(value), [value]);
  const background = useMemo(
    () => isEink ? colors.canvas : dominantAnsiBackground(segments, colors.canvas),
    [colors.canvas, isEink, segments],
  );

  return (
    <ScrollView
      ref={scrollView}
      accessibilityLabel={t('pane.ansiOutput')}
      style={[styles.scroll, { backgroundColor: background }]}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => scrollView.current?.scrollToEnd({ animated: false })}>
      <Text selectable allowFontScaling={false} style={[styles.text, { color: colors.text }]}>
        {segments.map((segment, index) => {
          const style = resolvedStyle(segment.style);
          return (
            <Text
              key={`${index}-${segment.text.length}`}
              // ANSI colors are runtime data, so these styles cannot live in StyleSheet.create.
              style={{
                color: isEink ? einkAnsiForeground(style.foreground, colors.text) : style.foreground || colors.text,
                backgroundColor: isEink ? colors.canvas : style.background || background,
                fontWeight: style.bold ? '700' : '400',
                fontStyle: style.italic ? 'italic' : 'normal',
                textDecorationLine: style.underline ? 'underline' : 'none',
                opacity: isEink || !style.dim ? 1 : 0.68,
              }}>
              {segment.text}
            </Text>
          );
        })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'flex-end', padding: 10 },
  text: { fontFamily: 'monospace', fontSize: 9, lineHeight: 13 },
});
