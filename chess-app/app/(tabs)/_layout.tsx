import { Tabs, useRouter, usePathname } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import * as a11y from '@/constants/a11y';

// mcIcon uses MaterialCommunityIcons; icon uses Ionicons
const NAV_ITEMS = [
  { name: 'index',    href: '/',          icon: 'home'      as const, mcIcon: null          },
  { name: 'reino',    href: '/reino',     icon: null,                 mcIcon: 'castle' as const },
  { name: 'profile',  href: '/profile',   icon: 'person'    as const, mcIcon: null          },
  { name: 'progress', href: '/progress',  icon: 'bar-chart' as const, mcIcon: null          },
  { name: 'settings', href: '/settings',  icon: 'settings'  as const, mcIcon: null          },
] as const;

function DesktopHeader() {
  const { colors, typography } = useTheme();
  const { t }      = useTranslation();
  const router     = useRouter();
  const pathname   = usePathname();

  return (
    <View style={[styles.header, { backgroundColor: colors.tabBar, borderBottomColor: colors.tabBarBorder }]}>
      <Text
        style={[styles.logo, { color: colors.text, fontSize: typography.size.md }]}
        {...a11y.decorative()}
        accessibilityLabel={t('a11y.nav.logo')}
        accessible
      >
        ♟ Chess Puzzles
      </Text>
      <View style={styles.nav}>
        {NAV_ITEMS.map(item => {
          const isActive = item.name === 'index'
            ? pathname === '/'
            : pathname.startsWith(`/${item.name}`);
          const iconColor = isActive ? colors.tabBarActive : colors.tabBarInactive;
          const tabLabel  = t(`tab.${item.name === 'index' ? 'feed' : item.name}`);
          return (
            <TouchableOpacity
              key={item.name}
              onPress={() => router.push(item.href)}
              style={styles.navItem}
              {...a11y.btn(tabLabel)}
              accessibilityState={{ selected: isActive }}
            >
              {item.mcIcon ? (
                <MaterialCommunityIcons name={item.mcIcon} size={16} color={iconColor} {...a11y.decorative()} />
              ) : (
                <Ionicons name={item.icon!} size={16} color={iconColor} {...a11y.decorative()} />
              )}
              <Text style={[
                styles.navLabel,
                {
                  color: iconColor,
                  fontSize: typography.size.sm,
                },
              ]}>
                {tabLabel}
              </Text>
              {isActive && (
                <View style={[styles.navIndicator, { backgroundColor: colors.accent }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t }      = useTranslation();
  const isDesktop  = useIsDesktop();

  const screenOptions = {
    headerShown: false,
    tabBarStyle: isDesktop
      ? { display: 'none' as const }
      : { backgroundColor: colors.tabBar, borderTopColor: colors.tabBarBorder },
    tabBarActiveTintColor:   colors.tabBarActive,
    tabBarInactiveTintColor: colors.tabBarInactive,
  };

  return (
    <View style={{ flex: 1 }}>
      {isDesktop && <DesktopHeader />}
      <Tabs screenOptions={screenOptions}>
        <Tabs.Screen
          name="index"
          options={{
            title: t('tab.feed'),
            tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="reino"
          options={{
            title: t('tab.reino'),
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="castle" size={24} color={color} {...a11y.decorative()} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tab.profile'),
            tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: t('tab.progress'),
            tabBarIcon: ({ color }) => <Ionicons name="bar-chart" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t('tab.settings'),
            tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  logo: {
    fontWeight: '700',
    marginRight: 'auto' as unknown as number,
  },
  nav: {
    flexDirection: 'row',
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
    position: 'relative',
  },
  navLabel: {
    fontWeight: '500',
  },
  navIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 14,
    right: 14,
    height: 2,
    borderRadius: 1,
  },
});
