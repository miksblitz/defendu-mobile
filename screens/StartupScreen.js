import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Image } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TILE_ROWS = 8;
const TILE_COLS = 8;
const TILE_WIDTH = SCREEN_WIDTH / TILE_COLS;
const TILE_HEIGHT = SCREEN_HEIGHT / TILE_ROWS;

export default function StartupScreen({ onFinish }) {
  const [tiles, setTiles] = useState([]);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Matches web (tabs)/index: black tiles cover screen → 2s → tile animation reveals logo → logo stays 5s → go to login
  useEffect(() => {
    const tileData = [];
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

    const startTilesTransition = (data) => {
      const animations = [];
      for (let row = 0; row < TILE_ROWS; row++) {
        for (let col = 0; col < TILE_COLS; col++) {
          const delay = (row * TILE_COLS + col) * 15;
          animations.push(
            Animated.timing(data[row][col].anim, {
              toValue: 0,
              duration: 400,
              delay,
              useNativeDriver: true,
            })
          );
        }
      }
      Animated.parallel(animations).start(() => {
        // Logo stays for 5 seconds (same as web), then go to login
        setTimeout(() => {
          onFinishRef.current?.();
        }, 5000);
      });
    };

    const timer = setTimeout(() => startTilesTransition(tileData), 2000);
    return () => clearTimeout(timer);
  }, []); // Run once on mount so startup animation always plays

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Image
          source={require('../assets/images/defendulogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
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
    </View>
  );
}

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
