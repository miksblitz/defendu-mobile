/**
 * StartupScreen
 * Animated tile intro with logo; tap to continue to login.
 */
import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Image, TouchableWithoutFeedback } from 'react-native';

// --- Constants ---
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TILE_ROWS = 8;
const TILE_COLS = 8;
const TILE_WIDTH = SCREEN_WIDTH / TILE_COLS;
const TILE_HEIGHT = SCREEN_HEIGHT / TILE_ROWS;
const SLIDE_DURATION = 320;

// --- Types ---
interface TileData {
  anim: Animated.Value;
  rotation: number;
  translateX: number;
  translateY: number;
}

interface StartupScreenProps {
  onFinish?: () => void;
}

// --- Component ---
export default function StartupScreen({ onFinish }: StartupScreenProps) {
  const [tiles, setTiles] = useState<TileData[][]>([]);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const transitioning = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const tileData: TileData[][] = [];
    for (let row = 0; row < TILE_ROWS; row++) {
      tileData[row] = [];
      for (let col = 0; col < TILE_COLS; col++) {
        tileData[row][col] = {
          anim: new Animated.Value(1),
          rotation: Math.random() * 360,
          translateX: (Math.random() - 0.5) * SCREEN_WIDTH * 1.5,
          translateY: (Math.random() - 0.5) * SCREEN_HEIGHT * 1.5,
        };
      }
    }
    setTiles(tileData);

    const startTilesTransition = (data: TileData[][]) => {
      const animations: Animated.CompositeAnimation[] = [];
      for (let row = 0; row < TILE_ROWS; row++) {
        for (let col = 0; col < TILE_COLS; col++) {
          const delay = (row * TILE_COLS + col) * 12;
          animations.push(
            Animated.timing(data[row][col].anim, {
              toValue: 0,
              duration: 380,
              delay,
              useNativeDriver: true,
            })
          );
        }
      }
      Animated.parallel(animations).start();
    };

    const timer = setTimeout(() => startTilesTransition(tileData), 1200);
    return () => clearTimeout(timer);
  }, []);

  const handlePress = () => {
    if (transitioning.current) return;
    transitioning.current = true;
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: SLIDE_DURATION,
      useNativeDriver: true,
    }).start(() => {
      onFinishRef.current?.();
    });
  };

  return (
    <TouchableWithoutFeedback onPress={handlePress}>
      <Animated.View
        style={[
          styles.container,
          {
            transform: [
              {
                translateX: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -SCREEN_WIDTH],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/images/defendulogo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.tapToStart}>Tap to start</Text>
        </View>

        {tiles.length > 0 && (
          <View style={styles.tilesContainer} pointerEvents="none">
            {tiles.map((row, rowIndex) =>
              row.map((tile, colIndex) => (
                <Animated.View
                  key={`${rowIndex}-${colIndex}`}
                  style={[
                    styles.tile,
                    {
                      left: colIndex * TILE_WIDTH,
                      top: rowIndex * TILE_HEIGHT,
                      opacity: tile.anim,
                      transform: [
                        {
                          scale: tile.anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 1],
                          }),
                        },
                        {
                          rotate: tile.anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [`${tile.rotation}deg`, '0deg'],
                          }),
                        },
                        {
                          translateX: tile.anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [tile.translateX, 0],
                          }),
                        },
                        {
                          translateY: tile.anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [tile.translateY, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ))
            )}
          </View>
        )}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '90%',
    height: '90%',
    maxWidth: 400,
    maxHeight: 400,
  },
  tapToStart: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  tilesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  tile: {
    position: 'absolute',
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    backgroundColor: '#000000',
  },
});
