import { BlurView } from 'expo-blur';
import { CircleEllipsis, Server, SquareTerminal, type LucideIcon } from 'lucide-react-native';
import { type RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDisplayProfile } from '@/src/lib/displayProfile';
import { cn } from '@/src/lib/utils';
import { colorWithAlpha, useTheme, type ThemeColors } from '@/src/theme';
import type { AppTab } from '@/src/types';
import { hapticPress, HerdrMark } from './app-ui';
import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { Text } from './ui/text';

interface Props {
  activeTab: AppTab;
  blurTarget: RefObject<View | null>;
  onSelect: (tab: AppTab) => void;
}

type NavigationItem = {
  tab: AppTab;
  labelKey: string;
} & ({ icon: LucideIcon } | { herdrMark: true });

const items: NavigationItem[] = [
  { tab: 'hosts', labelKey: 'nav.hosts', icon: Server },
  { tab: 'herd', labelKey: 'nav.herd', herdrMark: true },
  { tab: 'terminal', labelKey: 'nav.terminal', icon: SquareTerminal },
  { tab: 'more', labelKey: 'nav.more', icon: CircleEllipsis },
];

export function BottomNavigation({ activeTab, blurTarget, onSelect }: Props) {
  const { colors, isDark } = useTheme();
  const { isEink, isTablet } = useDisplayProfile();
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  // Four Android BlurViews recaptured the full screen whenever its tab changed,
  // compounding the release transition stall. Keep native blur on iOS only.
  const renderNativeBlur = !isEink && Platform.OS !== 'android';
  return (
    <View
      pointerEvents="box-none"
      className={cn(
        'absolute z-30 items-center justify-around bg-background',
        isTablet ? 'inset-y-0 left-0 flex-col border-r border-border' : 'inset-x-0 flex-row px-4',
      )}
      style={isTablet
        ? { width: 88, paddingTop: 12, paddingBottom: bottom }
        : { bottom: 16, height: 120 + bottom, paddingBottom: bottom }}>
      {items.map(item => {
        const active = item.tab === activeTab;
        return (
          <View className={isTablet ? 'h-[78px] w-[80px] items-center justify-center' : 'h-[68px] w-[68px] items-center justify-center'} key={item.tab}>
            <View
              pointerEvents="none"
              className={isTablet ? 'absolute h-[72px] w-[80px] rounded-md' : 'absolute h-[68px] w-[68px] rounded-full'}
              style={floatingBloomStyle(active, colors, isEink)}
            />
            {renderNativeBlur ? (
              <BlurView
                pointerEvents="none"
                blurMethod="dimezisBlurViewSdk31Plus"
                blurReductionFactor={2}
                blurTarget={blurTarget}
                intensity={active ? 34 : 26}
                tint={isDark ? 'systemUltraThinMaterialDark' : 'default'}
                style={[styles.glassSurface, Platform.OS === 'ios' ? styles.glassSurfaceWithoutEdge : floatingGlassEdgeStyle(active, colors, isEink)]}
              />
            ) : (
              <View
                pointerEvents="none"
                style={[
                  styles.glassSurface,
                  floatingGlassEdgeStyle(active, colors, isEink),
                  floatingGlassFallbackStyle(isDark, isEink),
                  isTablet && styles.tabletGlassSurface,
                  isEink && styles.einkGlassSurface,
                ]}
              />
            )}
            <Button
              accessibilityLabel={t(item.labelKey)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className={isTablet ? 'h-[72px] w-[80px] rounded-md bg-transparent p-0 dark:bg-transparent' : 'h-16 w-16 rounded-full bg-transparent p-0 dark:bg-transparent'}
              size="content"
              variant="link"
              onPress={hapticPress(() => onSelect(item.tab))}>
              <View className={cn('items-center justify-center gap-1', !isEink && !active && 'opacity-60')}>
                {'herdrMark' in item
                  ? <HerdrMark size={isTablet ? 26 : 29} />
                  : <Icon as={item.icon} size={isTablet ? 24 : 29} color={active ? colors.text : colors.textSecondary} strokeWidth={active ? 2.75 : 2} />}
                {isTablet ? <Text className="text-[12px] font-semibold text-foreground">{t(item.labelKey)}</Text> : null}
              </View>
            </Button>
          </View>
        );
      })}
    </View>
  );
}

function floatingGlassEdgeStyle(active: boolean, colors: ThemeColors, isEink: boolean) {
  const edgeColor = active ? colors.primary : colors.textSecondary;
  return {
    borderColor: isEink ? edgeColor : colorWithAlpha(edgeColor, active ? 'E0' : '8F'),
  };
}

function floatingGlassFallbackStyle(isDark: boolean, isEink: boolean) {
  return {
    backgroundColor: isEink ? '#F4F4F4' : isDark ? 'rgba(20,22,34,0.38)' : 'rgba(255,255,255,0.42)',
  } as const;
}

function floatingBloomStyle(active: boolean, colors: ThemeColors, isEink: boolean) {
  const edgeColor = active ? colors.primary : colors.textSecondary;
  return {
    backgroundColor: 'transparent',
    borderColor: isEink ? edgeColor : colorWithAlpha(edgeColor, active ? 'B8' : '73'),
    borderWidth: active ? 2 : 1,
    ...(!isEink && Platform.OS === 'ios'
      ? {
          // iOS does not render the React Native filter blur on this View.
          shadowColor: edgeColor,
          shadowOpacity: active ? 0.72 : 0.32,
          shadowRadius: active ? 10 : 6,
          shadowOffset: { width: 0, height: 0 },
        }
      : !isEink ? { filter: [{ blur: active ? 6 : 4 }] } : {}),
  } as const;
}

const styles = StyleSheet.create({
  glassSurface: {
    position: 'absolute',
    width: 64,
    height: 64,
    opacity: 0.62,
    overflow: 'hidden',
    borderRadius: 32,
    borderWidth: 1,
  },
  // The iOS material surface already has a crisp edge; the separate bloom
  // ring supplies the navigation button outline.
  glassSurfaceWithoutEdge: {
    borderColor: 'transparent',
  },
  einkGlassSurface: {
    opacity: 1,
    borderRadius: 4,
  },
  tabletGlassSurface: {
    width: 76,
    height: 72,
    borderRadius: 4,
  },
});
