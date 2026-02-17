import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  StatusBar,
  Image,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PANEL_WIDTH = Math.min(280, SCREEN_WIDTH * 0.78);
const ANDROID_STATUS_PADDING = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;

export type NavScreen = 'dashboard' | 'profile' | 'trainer' | 'messages';

interface NavPanelProps {
  visible: boolean;
  onClose: () => void;
  onNavigate: (screen: NavScreen) => void;
  onLogout: () => void;
  currentScreen: NavScreen;
  unreadCount: number;
  unreadDisplay: string;
}

const NAV_ITEMS: { key: NavScreen; label: string; icon: number | 'messages' }[] = [
  { key: 'dashboard', label: 'Home', icon: require('../assets/images/icon-home.png') },
  { key: 'trainer', label: 'Trainers', icon: require('../assets/images/icon-profile.png') },
  { key: 'profile', label: 'Profile', icon: require('../assets/images/icon-trainer.png') },
  { key: 'messages', label: 'Messages', icon: 'messages' },
];
const ICON_COLOR = '#07bbc0';

function MessagesIcon() {
  return (
    <View style={iconStyles.messagesWrap}>
      <View style={iconStyles.messagesBody} />
      <View style={iconStyles.messagesTail} />
    </View>
  );
}

export default function NavPanel({
  visible,
  onClose,
  onNavigate,
  onLogout,
  currentScreen,
  unreadCount,
  unreadDisplay,
}: NavPanelProps) {
  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: visible ? 0 : -PANEL_WIDTH,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: visible ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, slideAnim, overlayAnim]);

  const handleNav = (screen: NavScreen) => {
    onClose();
    onNavigate(screen);
  };

  const handleLogout = () => {
    onClose();
    onLogout();
  };

  return (
    <>
      <Animated.View
        style={[styles.overlay, { opacity: overlayAnim }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          {
            width: PANEL_WIDTH,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Menu</Text>
        </View>
        {NAV_ITEMS.map(({ key, label, icon }) => (
          <TouchableOpacity
            key={key}
            style={[styles.navItem, currentScreen === key && styles.navItemActive]}
            onPress={() => handleNav(key)}
            activeOpacity={0.7}
          >
            <View style={styles.navItemLeft}>
              {icon === 'messages' ? (
                <MessagesIcon />
              ) : (
                <Image source={icon} style={styles.navItemIcon} resizeMode="contain" />
              )}
              <Text style={[styles.navItemText, currentScreen === key && styles.navItemTextActive]}>{label}</Text>
            </View>
            {key === 'messages' && unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadDisplay}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
        <View style={styles.divider} />
        <TouchableOpacity style={styles.navItem} onPress={handleLogout} activeOpacity={0.7}>
          <Text style={styles.navItemTextLogout}>Logout</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 14, 28, 0.6)',
    zIndex: 1000,
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#011f36',
    borderRightWidth: 1,
    borderRightColor: '#062731',
    zIndex: 1001,
    paddingTop: 56 + ANDROID_STATUS_PADDING,
    paddingHorizontal: 0,
  },
  panelHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#062731',
    marginBottom: 8,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  navItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navItemIcon: {
    width: 24,
    height: 24,
  },
  navItemActive: {
    backgroundColor: 'rgba(7, 187, 192, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#07bbc0',
  },
  navItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFF',
  },
  navItemTextActive: {
    color: '#07bbc0',
    fontWeight: '700',
  },
  navItemTextLogout: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e57373',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#062731',
    marginVertical: 8,
    marginHorizontal: 20,
  },
});

const iconStyles = StyleSheet.create({
  messagesWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesBody: {
    width: 18,
    height: 14,
    borderRadius: 3,
    backgroundColor: ICON_COLOR,
  },
  messagesTail: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderLeftColor: 'transparent',
    borderRightWidth: 5,
    borderRightColor: 'transparent',
    borderTopWidth: 6,
    borderTopColor: ICON_COLOR,
  },
});
