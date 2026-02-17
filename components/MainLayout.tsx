import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, Image } from 'react-native';
import NavPanel, { type NavScreen } from './NavPanel';
import { useUnreadMessages } from '../lib/contexts/UnreadMessagesContext';

interface MainLayoutProps {
  title: string;
  currentScreen: NavScreen;
  onNavigate: (screen: NavScreen) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function MainLayout({ title, currentScreen, onNavigate, onLogout, children }: MainLayoutProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const { unreadCount, unreadDisplay, clearUnread } = useUnreadMessages();

  const openPanel = () => {
    clearUnread();
    setPanelOpen(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.navButton} onPress={openPanel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Image source={require('../assets/images/icon-menu.png')} style={styles.navButtonIcon} resizeMode="contain" />
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadDisplay}</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.content}>
        {children}
      </View>
      <NavPanel
        visible={panelOpen}
        onClose={() => setPanelOpen(false)}
        onNavigate={onNavigate}
        onLogout={onLogout}
        currentScreen={currentScreen}
        unreadCount={unreadCount}
        unreadDisplay={unreadDisplay}
      />
    </SafeAreaView>
  );
}

const ANDROID_STATUS_PADDING = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#041527',
    paddingTop: ANDROID_STATUS_PADDING,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#062731',
    backgroundColor: '#041527',
  },
  navButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    position: 'relative',
  },
  navButtonIcon: {
    width: 24,
    height: 24,
  },
  headerBadge: {
    position: 'absolute',
    top: 4,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  headerBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  headerSpacer: { width: 52 },
  content: { flex: 1 },
});
