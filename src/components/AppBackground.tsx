import { Image, StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme';
import { useDisplayProfile } from '@/src/lib/displayProfile';

export function AppBackground({
  uri,
  dimming,
}: {
  uri: string | null;
  dimming: number;
}) {
  const { colors } = useTheme();
  const { isEink } = useDisplayProfile();

  return (
    <View
      accessibilityElementsHidden
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]}
    >
      {uri && !isEink ? (
        <>
          <Image
            resizeMode="cover"
            source={{ uri }}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.canvas, opacity: dimming / 100 },
            ]}
          />
        </>
      ) : null}
    </View>
  );
}
