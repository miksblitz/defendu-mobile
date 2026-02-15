import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';

interface ToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

export default function Toast({ message, visible, onHide, duration = 3000 }: ToastProps) {
  const progressAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      progressAnim.setValue(1);
      Animated.timing(progressAnim, {
        toValue: 0,
        duration,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onHide?.());
        }
      });
    }
  }, [visible, duration, opacityAnim, progressAnim, onHide]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          opacity: opacityAnim,
          transform: [
            {
              translateY: opacityAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.toastContent}>
        <Image
          source={require('../assets/images/defendulogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.message}>{message}</Text>
      </View>
      <Animated.View
        style={[
          styles.progressBar,
          {
            width: progressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['100%', '0%'],
            }),
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#041527',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#09AEC3',
    padding: 16,
    minWidth: 280,
    maxWidth: 350,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  message: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 4,
    backgroundColor: '#09AEC3',
  },
});
