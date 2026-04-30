import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  StatusBar,
  Image,
  PanResponder,
} from 'react-native';
import NavPanel, { type NavScreen } from './NavPanel';
import { useUnreadMessages } from '../lib/contexts/UnreadMessagesContext';

const SWIPE_MIN_DX = 50;

interface MainLayoutProps {
  title: string;
  currentScreen: NavScreen;
  onNavigate: (screen: NavScreen) => void;
  onLogout: () => void;
  onOpenTopUp?: () => void;
  creditsBalance?: number;
  headerLeft?: 'menu' | 'back' | 'none';
  onHeaderBack?: () => void;
  children: React.ReactNode;
  /** Optional right-side header element (e.g. Trainer Registration button) */
  headerRight?: React.ReactNode;
  /** Hide menu icon and disable nav panel interactions on specific screens */
  hideNavButton?: boolean;
  /** Hide credits strip for immersive screens */
  hideCreditsBar?: boolean;
}

export default function MainLayout({
  title,
  currentScreen,
  onNavigate,
  onLogout,
  onOpenTopUp,
  creditsBalance = 500,
  headerLeft = 'menu',
  onHeaderBack,
  children,
  headerRight,
  hideNavButton = false,
  hideCreditsBar = false,
}: MainLayoutProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const { unreadCount, unreadDisplay } = useUnreadMessages();

  const openPanel = useCallback(() => {
    if (hideNavButton) return;
    setPanelOpen(true);
  }, [hideNavButton]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (hideNavButton) return false;
        const startX = gestureState.moveX - gestureState.dx;
        return gestureState.dx > 18 && startX < 55;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (hideNavButton) return;
        if (gestureState.dx >= SWIPE_MIN_DX) openPanel();
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.container} {...panResponder.panHandlers}>
      <View style={[styles.header, hideNavButton ? styles.headerNoDivider : null]}>
        {hideNavButton || headerLeft === 'none' ? (
          <View style={styles.headerSpacer} />
        ) : headerLeft === 'back' ? (
          <TouchableOpacity
            style={styles.navButton}
            onPress={onHeaderBack}
            disabled={!onHeaderBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Image source={require('../assets/images/icon-back.png')} style={styles.navButtonIcon} resizeMode="contain" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.navButton} onPress={openPanel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Image source={require('../assets/images/icon-menu.png')} style={styles.navButtonIcon} resizeMode="contain" />
            {unreadCount > 0 ? (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{unreadDisplay}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}
        {title ? <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text> : <View style={styles.headerTitle} />}
        {headerRight != null ? headerRight : <View style={styles.headerSpacer} />}
      </View>
      {!hideCreditsBar && (
        <View style={styles.creditsBar}>
          <Text style={styles.creditsLabel}>DEFENDU CREDITS: {creditsBalance}</Text>
          <TouchableOpacity
            style={styles.creditsPlusButton}
            onPress={onOpenTopUp}
            activeOpacity={0.8}
            disabled={!onOpenTopUp}
            accessibilityRole="button"
            accessibilityLabel="Top up credits"
          >
            <Text style={styles.creditsPlusText}>+</Text>
          </TouchableOpacity>
        </View>
      )}
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
  headerNoDivider: {
    borderBottomWidth: 0,
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
  creditsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#041527',
    borderBottomWidth: 0,
    gap: 8,
  },
  creditsLabel: {
    color: '#07bbc0',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  creditsPlusButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#07bbc0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditsPlusText: {
    color: '#041527',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 15,
  },
  content: { flex: 1 },
});
