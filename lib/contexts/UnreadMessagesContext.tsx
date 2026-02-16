import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthController from '../controllers/AuthController';
import { MessageController } from '../controllers/MessageController';

const STORAGE_KEY = 'messagesLastReadAt';
const MAX_BADGE = 99;

type UserChatsSnapshot = Record<string, { lastMessage?: { senderId: string; createdAt: number } }>;

type UnreadContextValue = {
  unreadCount: number;
  unreadDisplay: string;
  clearUnread: () => Promise<void>;
};

const UnreadMessagesContext = createContext<UnreadContextValue | undefined>(undefined);

export function UnreadMessagesProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState<number>(0);
  const [userChats, setUserChats] = useState<UserChatsSnapshot>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      const user = await AuthController.getCurrentUser();
      if (!mounted) return;
      setUid(user?.uid ?? null);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!uid) {
      setUserChats({});
      return undefined;
    }
    const unsub = MessageController.subscribeUserChats(uid, (snapshot) => {
      setUserChats(snapshot || {});
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const t = raw ? parseInt(raw, 10) : 0;
        if (!isNaN(t)) setLastReadAt(t);
      } catch {
        setLastReadAt(0);
      }
    })();
  }, [uid]);

  const clearUnread = useCallback(async () => {
    const now = Date.now();
    setLastReadAt(now);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, String(now));
    } catch (e) {
      console.warn('UnreadMessages: failed to persist lastReadAt', e);
    }
  }, []);

  const unreadCount = (() => {
    if (!uid) return 0;
    let count = 0;
    for (const chatId of Object.keys(userChats)) {
      const entry = userChats[chatId];
      const lm = entry?.lastMessage;
      if (lm && lm.senderId !== uid && lm.createdAt > lastReadAt) count += 1;
    }
    return count;
  })();

  const cappedCount = unreadCount > MAX_BADGE ? MAX_BADGE : unreadCount;
  const unreadDisplay = unreadCount > MAX_BADGE ? '99+' : String(cappedCount);

  const value: UnreadContextValue = {
    unreadCount: cappedCount,
    unreadDisplay,
    clearUnread,
  };

  return (
    <UnreadMessagesContext.Provider value={value}>
      {children}
    </UnreadMessagesContext.Provider>
  );
}

export function useUnreadMessages(): UnreadContextValue {
  const ctx = useContext(UnreadMessagesContext);
  if (ctx === undefined) {
    return {
      unreadCount: 0,
      unreadDisplay: '0',
      clearUnread: async () => {},
    };
  }
  return ctx;
}
