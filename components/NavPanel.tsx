import React, { useEffect, useRef, useState } from 'react';
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
  Modal,
  Pressable,
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
const BG_DARK = '#011f36';
const BG_PANEL = '#041527';
const BORDER = '#062731';
const TEXT_WHITE = '#FFF';
const TEXT_MUTED = '#6b8693';
const ACCENT = '#07bbc0';
const ACCENT_DARK = '#041527';

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
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);

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

  const handleLogoutPress = () => setLogoutConfirmVisible(true);
  const handleLogoutCancel = () => setLogoutConfirmVisible(false);
  const handleLogoutConfirm = () => {
    setLogoutConfirmVisible(false);
    onClose();
    onLogout?.();
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
        <View style={styles.quoteSpacer} />
        <View style={[styles.quoteBlockWrapper, styles.quoteBlock]}>
          <Text style={styles.quoteMark}>"</Text>
          <Text style={styles.quoteText}>
            I fear not the man who has practiced 10,000 kicks once, but I fear the man who has practiced one kick 10,000 times.
          </Text>
          <Text style={styles.quoteAttribution}>— Bruce Lee</Text>
          <View style={styles.logoutRow}>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogoutPress} activeOpacity={0.7}>
              <Image source={require('../assets/images/logouticon.png')} style={styles.logoutIcon} resizeMode="contain" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      <Modal
        visible={logoutConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={handleLogoutCancel}
      >
        <Pressable style={styles.logoutModalOverlay} onPress={handleLogoutCancel}>
          <Pressable style={styles.logoutModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.logoutModalTitle}>Log out</Text>
            <Text style={styles.logoutModalMessage}>Are you sure you want to log out?</Text>
            <View style={styles.logoutModalActions}>
              <TouchableOpacity
                style={styles.logoutModalBtnCancel}
                onPress={handleLogoutCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.logoutModalBtnCancelText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutModalBtnConfirm}
                onPress={handleLogoutConfirm}
                activeOpacity={0.7}
              >
                <Text style={styles.logoutModalBtnConfirmText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    flex: 1,
    flexDirection: 'column',
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
  logoutRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  logoutIcon: {
    width: 24,
    height: 24,
    tintColor: ICON_COLOR,
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
  quoteSpacer: { height: 20 },
  quoteBlockWrapper: { marginBottom: 16 },
  quoteBlock: {
    marginHorizontal: 12,
    paddingLeft: 16,
    paddingRight: 20,
    paddingVertical: 20,
    paddingBottom: 16 + ANDROID_STATUS_PADDING,
    borderTopWidth: 1,
    borderTopColor: 'rgba(7, 187, 192, 0.2)',
    borderLeftWidth: 3,
    borderLeftColor: '#07bbc0',
    backgroundColor: 'rgba(7, 187, 192, 0.06)',
  },
  quoteMark: {
    fontSize: 40,
    fontWeight: '800',
    color: 'rgba(7, 187, 192, 0.45)',
    lineHeight: 40,
    marginBottom: -12,
  },
  quoteText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.95)',
    lineHeight: 22,
    letterSpacing: 0.4,
  },
  quoteAttribution: {
    fontSize: 12,
    fontWeight: '800',
    color: '#07bbc0',
    marginTop: 14,
    letterSpacing: 1.5,
  },
  logoutModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 14, 28, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoutModalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: BG_PANEL,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    alignItems: 'center',
  },
  logoutModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_WHITE,
    marginBottom: 10,
    textAlign: 'center',
  },
  logoutModalMessage: {
    fontSize: 15,
    color: TEXT_MUTED,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  logoutModalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  logoutModalBtnCancel: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: BG_DARK,
    minWidth: 80,
    alignItems: 'center',
  },
  logoutModalBtnCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_MUTED,
  },
  logoutModalBtnConfirm: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: ACCENT,
    minWidth: 80,
    alignItems: 'center',
  },
  logoutModalBtnConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: ACCENT_DARK,
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
