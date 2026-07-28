import { Tabs, useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useIsDesktop } from '@/hooks/useIsDesktop';

const NAV_ITEMS = [
  { name: 'index',    href: '/',          icon: 'home'      as const },
  { name: 'profile',  href: '/profile',   icon: 'person'    as const },
  { name: 'progress', href: '/progress',  icon: 'bar-chart' as const },
  { name: 'settings', href: '/settings',  icon: 'settings'  as const },
] as const;

function DesktopHeader() {
  const { colors, typography } = useTheme();
  const { t }      = useTranslation();
  const router     = useRouter();
  const pathname   = usePathname();

  return (
    <View style={[styles.header, { backgroundColor: colors.tabBar, borderBottomColor: colors.tabBarBorder }]}>
      <Text style={[styles.logo, { color: colors.text, fontSize: typography.size.md }]}>
        ♟ Chess Puzzles
      </Text>
      <View style={styles.nav}>
        {NAV_ITEMS.map(item => {
          const isActive = item.name === 'index'
            ? pathname === '/'
            : pathname.startsWith(`/${item.name}`);
          return (
            <TouchableOpacity
              key={item.name}
              onPress={() => router.push(item.href)}
              style={styles.navItem}
            >
              <Ionicons
                name={item.icon}
                size={16}
                color={isActive ? colors.tabBarActive : colors.tabBarInactive}
              />
              <Text style={[
                styles.navLabel,
                {
                  color: isActive ? colors.tabBarActive : colors.tabBarInactive,
                  fontSize: typography.size.sm,
                },
              ]}>
                {t(`tab.${item.name === 'index' ? 'feed' : item.name}`)}
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
