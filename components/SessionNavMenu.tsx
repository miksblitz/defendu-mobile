import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const NAV_ICON = require('../assets/images/NavIconBlue.png');
const PAUSE_ICON = require('../assets/images/pauseicon.png');
const PLAY_ICON = require('../assets/images/playicon.png');
const RESTART_ICON = require('../assets/images/restarticon.png');
/** Same asset as the old top-left quit control (CategoryPracticeSessionScreen `iconButton`). */
const QUIT_ICON = require('../assets/images/logouticon.png');

const PANEL_W = 196;
/** Aligns with top row; trigger is 44px like prev/next module buttons. */
const PANEL_TOP = 48;

export type SessionNavMenuProps = {
  /** Position the trigger (e.g. absolute top / left). */
  containerStyle?: StyleProp<ViewStyle>;
  onQuit: () => void;
  onRestart?: () => void;
  restartVisible?: boolean;
  pauseVisible?: boolean;
  paused?: boolean;
  onTogglePause?: () => void;
};

export default function SessionNavMenu({
  containerStyle,
  onQuit,
  onRestart,
  restartVisible = false,
  pauseVisible = false,
  paused = false,
  onTogglePause,
}: SessionNavMenuProps) {
  const [open, setOpen] = useState(false);
  const slide = useRef(new Animated.Value(-PANEL_W)).current;

  const close = useCallback(() => {
    Animated.timing(slide, {
      toValue: -PANEL_W,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setOpen(false));
  }, [slide]);

  const openMenu = useCallback(() => {
    setOpen(true);
    slide.setValue(-PANEL_W);
    Animated.timing(slide, {
      toValue: 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide]);

  const toggle = useCallback(() => {
    if (open) close();
    else openMenu();
  }, [open, close, openMenu]);

  useEffect(() => {
    if (!open) slide.setValue(-PANEL_W);
  }, [open, slide]);

  const handleQuit = useCallback(() => {
    close();
    setTimeout(onQuit, 230);
  }, [close, onQuit]);

  const handleRestart = useCallback(() => {
    if (!onRestart) return;
    close();
    setTimeout(onRestart, 230);
  }, [close, onRestart]);

  const handlePauseTap = useCallback(() => {
    onTogglePause?.();
  }, [onTogglePause]);

  return (
    <View style={[styles.host, containerStyle]} pointerEvents="box-none">
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Session menu"
      >
        <Image source={NAV_ICON} style={styles.navIcon} resizeMode="contain" />
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close menu" />
          <Animated.View style={[styles.panel, { top: PANEL_TOP, transform: [{ translateX: slide }] }]}>
            {restartVisible && onRestart ? (
              <Pressable style={styles.row} onPress={handleRestart} accessibilityRole="button" accessibilityLabel="Restart">
                <Image source={RESTART_ICON} style={styles.rowIcon} resizeMode="contain" />
                <Text style={styles.rowLabel}>Restart</Text>
              </Pressable>
            ) : null}
            {pauseVisible && onTogglePause ? (
              <Pressable style={styles.row} onPress={handlePauseTap} accessibilityRole="button" accessibilityLabel={paused ? 'Resume' : 'Pause'}>
                <Image source={paused ? PLAY_ICON : PAUSE_ICON} style={styles.rowIcon} resizeMode="contain" />
                <Text style={styles.rowLabel}>{paused ? 'Resume' : 'Pause'}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.row} onPress={handleQuit} accessibilityRole="button" accessibilityLabel="Quit">
              <Image source={QUIT_ICON} style={styles.quitIcon} resizeMode="contain" />
              <Text style={styles.rowLabel}>Quit</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    zIndex: 200,
  },
  /** Matches CategoryPracticeSessionScreen `iconButton` (prev / next module). */
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(1, 31, 54, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(7, 187, 192, 0.25)',
  },
  navBtnPressed: { opacity: 0.88 },
  navIcon: { width: 22, height: 22 },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    position: 'absolute',
    left: 0,
    width: PANEL_W,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: 'rgba(4, 21, 39, 0.97)',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: 'rgba(7, 187, 192, 0.32)',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  rowIcon: { width: 22, height: 22, marginRight: 12 },
  /** Logout glyph: same tint as `iconButtonImage` on session prev/next controls. */
  quitIcon: { width: 22, height: 22, marginRight: 12, tintColor: '#07bbc0', opacity: 0.95 },
  rowLabel: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
