import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthController from '../controllers/AuthController';
import { MessageController } from '../controllers/MessageController';
import { messagesLastSeenStorageKey } from '../controllers/localUserCache';

const MAX_BADGE = 99;

type UserChatsSnapshot = Record<string, { lastMessage?: { senderId: string; createdAt: number }; unreadCount?: number }>;

type UnreadContextValue = {
  unreadCount: number;
  unreadDisplay: string;
  unreadByChatId: Record<string, number>;
  clearAllUnread: () => Promise<void>;
  clearChatUnread: (chatId: string) => Promise<void>;
  setActiveChatId: (chatId: string | null) => void;
};

const UnreadMessagesContext = createContext<UnreadContextValue | undefined>(undefined);

export function UnreadMessagesProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [userChats, setUserChats] = useState<UserChatsSnapshot>({});
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [unreadByChatState, setUnreadByChatState] = useState<Record<string, number>>({});
  const lastSeenByChatRef = useRef<Record<string, number>>({});
  const unreadByChatRef = useRef<Record<string, number>>({});
  const hydratedRef = useRef(false);
  const activeChatIdRef = useRef<string | null>(null);

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
    // Hydrate last-seen timestamps so badge survives reloads.
    hydratedRef.current = false;
    lastSeenByChatRef.current = {};
    unreadByChatRef.current = {};
    setUnreadTotal(0);
    setUnreadByChatState({});
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(messagesLastSeenStorageKey(uid));
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as { lastSeenByChatId?: Record<string, unknown>; unreadByChatId?: Record<string, unknown> };
          const lastSeenMap: Record<string, number> = {};
          const unreadMap: Record<string, number> = {};
          for (const [k, v] of Object.entries(parsed?.lastSeenByChatId || {})) {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) lastSeenMap[String(k)] = n;
          }
          for (const [k, v] of Object.entries(parsed?.unreadByChatId || {})) {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) unreadMap[String(k)] = Math.floor(n);
          }
          lastSeenByChatRef.current = lastSeenMap;
          unreadByChatRef.current = unreadMap;
          setUnreadByChatState(unreadMap);
          let total = 0;
          for (const n of Object.values(unreadMap)) total += Number(n) || 0;
          setUnreadTotal(total);
        }
      } catch {
        lastSeenByChatRef.current = {};
      } finally {
        hydratedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  const persistLocalUnread = useCallback(() => {
    if (!uid) return;
    const payload = {
      lastSeenByChatId: lastSeenByChatRef.current || {},
      unreadByChatId: unreadByChatRef.current || {},
    };
    AsyncStorage.setItem(messagesLastSeenStorageKey(uid), JSON.stringify(payload)).catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setUserChats({});
      return undefined;
    }
    // Defer subscription so dashboard modules/progress load first; badge updates shortly after.
    let unsub: (() => void) | undefined;
    const id = setTimeout(() => {
      unsub = MessageController.subscribeUserChats(uid, (snapshot) => {
        const next = snapshot || {};
        setUserChats(next);

        // If we haven't hydrated yet, don't compute unread (avoids false increments on launch).
        if (!hydratedRef.current) return;

        let dirty = false;
        const lastSeen = lastSeenByChatRef.current;
        const unreadByChat = unreadByChatRef.current;

        for (const chatId of Object.keys(next)) {
          const lm = next[chatId]?.lastMessage;
          if (!lm) continue;
          // Don't auto-clear unread just because we sent a message — unread should only clear when user opens chat.
          if (lm.senderId === uid) continue;
          const prevSeen = lastSeen[chatId] ?? 0;
          if (lm.createdAt > prevSeen) {
            // If user is currently viewing this chat, don't count it as unread.
            if (activeChatIdRef.current !== chatId) {
              // Each distinct lastMessage update counts as one new incoming message.
              unreadByChat[chatId] = (unreadByChat[chatId] ?? 0) + 1;
            }
            lastSeen[chatId] = lm.createdAt;
            dirty = true;
          }
        }

        if (dirty) {
          let total = 0;
          for (const n of Object.values(unreadByChat)) {
            const v = Number(n);
            if (Number.isFinite(v) && v > 0) total += v;
          }
          setUnreadTotal(total);
          setUnreadByChatState({ ...unreadByChat });
          persistLocalUnread();
        }
      });
    }, 400);
    return () => {
      clearTimeout(id);
      unsub?.();
    };
  }, [uid]);

  const clearAllUnread = useCallback(async () => {
    // Local badge reset (works even if DB rules deny cross-user writes).
    unreadByChatRef.current = {};
    setUnreadByChatState({});
    setUnreadTotal(0);
    persistLocalUnread();
    try {
      if (uid) await MessageController.clearAllUnread(uid);
    } catch (e) {
      console.warn('UnreadMessages: failed to clear unread', e);
    }
  }, [persistLocalUnread, uid]);

  const clearChatUnread = useCallback(async (chatId: string) => {
    if (!chatId) return;
    const unreadByChat = unreadByChatRef.current;
    const prev = Number(unreadByChat[chatId] ?? 0) || 0;
    if (prev > 0) {
      unreadByChat[chatId] = 0;
      unreadByChatRef.current = unreadByChat;
      setUnreadByChatState({ ...unreadByChat });
      setUnreadTotal((t) => Math.max(0, t - prev));
      persistLocalUnread();
    }
    try {
      if (uid) await MessageController.markChatRead(uid, chatId);
    } catch {}
  }, [persistLocalUnread, uid]);

  const setActiveChatId = useCallback((chatId: string | null) => {
    activeChatIdRef.current = chatId;
  }, []);

  const unreadCount = uid ? unreadTotal : 0;

  const cappedCount = unreadCount > MAX_BADGE ? MAX_BADGE : unreadCount;
  const unreadDisplay = unreadCount > MAX_BADGE ? '99+' : String(cappedCount);

  const value: UnreadContextValue = useMemo(() => ({
    unreadCount: cappedCount,
    unreadDisplay,
    unreadByChatId: unreadByChatState,
    clearAllUnread,
    clearChatUnread,
    setActiveChatId,
  }), [cappedCount, unreadDisplay, unreadByChatState, clearAllUnread, clearChatUnread, setActiveChatId]);

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
      unreadByChatId: {},
      clearAllUnread: async () => {},
      clearChatUnread: async () => {},
      setActiveChatId: () => {},
    };
  }
  return ctx;
}
