import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'poseSkeletonOverlayEnabled';

type Ctx = {
  skeletonVisible: boolean;
  setSkeletonVisible: (value: boolean) => void;
};

const PoseSkeletonContext = createContext<Ctx | null>(null);

export function PoseSkeletonProvider({ children }: { children: React.ReactNode }) {
  const [skeletonVisible, setSkeletonVisibleState] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw === '0') setSkeletonVisibleState(false);
      else if (raw === '1') setSkeletonVisibleState(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSkeletonVisible = useCallback((value: boolean) => {
    setSkeletonVisibleState(value);
    AsyncStorage.setItem(STORAGE_KEY, value ? '1' : '0').catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ skeletonVisible, setSkeletonVisible }),
    [skeletonVisible, setSkeletonVisible]
  );

  return <PoseSkeletonContext.Provider value={value}>{children}</PoseSkeletonContext.Provider>;
}

export function usePoseSkeletonOverlay(): Ctx {
  const ctx = useContext(PoseSkeletonContext);
  if (!ctx) {
    return {
      skeletonVisible: true,
      setSkeletonVisible: () => {},
    };
  }
  return ctx;
}
