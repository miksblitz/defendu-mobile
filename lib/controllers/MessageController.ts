import { ref, get, set, update, push, remove, onValue, off, runTransaction } from 'firebase/database';
import { db } from '../config/firebaseConfig';

export interface MessageAttachment {
  url: string;
  type: 'image' | 'document';
  name?: string;
}

export interface ChatMessage {
  messageId: string;
  senderId: string;
  text: string;
  createdAt: number;
  attachment?: MessageAttachment;
}

export interface ConversationSummary {
  chatId: string;
  otherUserId: string;
  otherUserDisplayName: string;
  otherUserPhotoURL: string | null;
  lastMessage: { text: string; senderId: string; createdAt: number; attachment?: MessageAttachment } | null;
  unreadCount?: number;
}

function getChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

async function getChatBlockedMap(chatId: string): Promise<Record<string, boolean>> {
  try {
    const snap = await get(ref(db, `chats/${chatId}/blocked`));
    if (!snap.exists()) return {};
    const raw = snap.val() as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      out[String(k)] = Boolean(v);
    }
    return out;
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (msg.includes('Permission denied')) return {};
    throw e;
  }
}

async function getUserBlockedSet(uid: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const [primarySnap, legacySnap] = await Promise.all([
      get(ref(db, `users/${uid}/blockedUsers`)),
      get(ref(db, `userBlockedUsers/${uid}`)),
    ]);
    if (primarySnap.exists()) {
      for (const k of Object.keys(primarySnap.val() || {})) out.add(k);
    }
    if (legacySnap.exists()) {
      for (const k of Object.keys(legacySnap.val() || {})) out.add(k);
    }
  } catch (error) {
    const msg = (error as Error)?.message ?? '';
    if (!msg.includes('Permission denied')) throw error;
  }
  return out;
}

export const MessageController = {
  getChatId(uid1: string, uid2: string) {
    return getChatId(uid1, uid2);
  },

  async getOrCreateChat(
    currentUserId: string,
    otherUserId: string,
    currentUserDisplayName: string,
    currentUserPhotoURL: string | null,
    otherUserDisplayName: string,
    otherUserPhotoURL: string | null
  ): Promise<string> {
    const chatId = getChatId(currentUserId, otherUserId);
    const chatRef = ref(db, `chats/${chatId}`);
    const snapshot = await get(chatRef);

    const summaryForCurrent = {
      otherUserId,
      otherUserDisplayName,
      otherUserPhotoURL: otherUserPhotoURL || '',
      lastMessage: null as { text: string; senderId: string; createdAt: number; attachment?: MessageAttachment } | null,
      unreadCount: 0,
    };
    const summaryForOther = {
      otherUserId: currentUserId,
      otherUserDisplayName: currentUserDisplayName,
      otherUserPhotoURL: currentUserPhotoURL || '',
      lastMessage: null as { text: string; senderId: string; createdAt: number; attachment?: MessageAttachment } | null,
      unreadCount: 0,
    };

    if (!snapshot.exists()) {
      await set(chatRef, {
        participants: { [currentUserId]: true, [otherUserId]: true },
        participantInfo: {
          [currentUserId]: { displayName: currentUserDisplayName, photoURL: currentUserPhotoURL || '' },
          [otherUserId]: { displayName: otherUserDisplayName, photoURL: otherUserPhotoURL || '' },
        },
        lastMessage: null,
        createdAt: Date.now(),
      });
      await set(ref(db, `userChats/${currentUserId}/${chatId}`), summaryForCurrent);
      await set(ref(db, `userChats/${otherUserId}/${chatId}`), summaryForOther);
    } else {
      const data = snapshot.val();
      const participantInfo = data.participantInfo || {};
      const updates: Record<string, { displayName: string; photoURL: string }> = {};
      if (!participantInfo[currentUserId]) {
        updates[currentUserId] = { displayName: currentUserDisplayName, photoURL: currentUserPhotoURL || '' };
      }
      if (!participantInfo[otherUserId]) {
        updates[otherUserId] = { displayName: otherUserDisplayName, photoURL: otherUserPhotoURL || '' };
      }
      if (Object.keys(updates).length > 0) {
        await update(ref(db, `chats/${chatId}/participantInfo`), updates);
      }
      const myEntryRef = ref(db, `userChats/${currentUserId}/${chatId}`);
      if (!(await get(myEntryRef)).exists()) {
        await set(myEntryRef, summaryForCurrent);
      } else {
        await update(myEntryRef, {
          otherUserDisplayName,
          otherUserPhotoURL: otherUserPhotoURL || '',
        });
      }
      await update(ref(db, `userChats/${otherUserId}/${chatId}`), {
        otherUserId: currentUserId,
        otherUserDisplayName: currentUserDisplayName,
        otherUserPhotoURL: currentUserPhotoURL || '',
      });
    }
    return chatId;
  },

  async getConversations(currentUserId: string): Promise<ConversationSummary[]> {
    const userChatsRef = ref(db, `userChats/${currentUserId}`);
    const snapshot = await get(userChatsRef);
    if (!snapshot.exists()) return [];
    const userChats = snapshot.val();
    const list: ConversationSummary[] = [];
    for (const chatId of Object.keys(userChats)) {
      const entry = userChats[chatId];
      list.push({
        chatId,
        otherUserId: entry.otherUserId,
        otherUserDisplayName: entry.otherUserDisplayName || 'Unknown',
        otherUserPhotoURL: entry.otherUserPhotoURL || null,
        lastMessage: entry.lastMessage ? { ...entry.lastMessage, attachment: entry.lastMessage.attachment } : null,
        unreadCount: Number(entry.unreadCount ?? 0) || 0,
      });
    }
    list.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || 0;
      const bTime = b.lastMessage?.createdAt || 0;
      return bTime - aTime;
    });
    return list;
  },

  async getMessages(chatId: string): Promise<ChatMessage[]> {
    const messagesRef = ref(db, `chats/${chatId}/messages`);
    const snapshot = await get(messagesRef);
    if (!snapshot.exists()) return [];
    const raw = snapshot.val();
    const messages: ChatMessage[] = [];
    for (const messageId of Object.keys(raw)) {
      const m = raw[messageId];
      messages.push({
        messageId,
        senderId: m.senderId,
        text: m.text,
        createdAt: m.createdAt,
        attachment: m.attachment,
      });
    }
    messages.sort((a, b) => a.createdAt - b.createdAt);
    return messages;
  },

  subscribeUserChats(
    currentUserId: string,
    callback: (userChats: Record<string, { lastMessage?: { senderId: string; createdAt: number }; unreadCount?: number }>) => void
  ): () => void {
    const userChatsRef = ref(db, `userChats/${currentUserId}`);
    const unsub = onValue(userChatsRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback({});
        return;
      }
      callback(snapshot.val() || {});
    });
    return () => off(userChatsRef);
  },

  subscribeMessages(chatId: string, callback: (messages: ChatMessage[]) => void): () => void {
    const messagesRef = ref(db, `chats/${chatId}/messages`);
    const unsub = onValue(messagesRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      const raw = snapshot.val();
      const messages: ChatMessage[] = [];
      for (const messageId of Object.keys(raw)) {
        const m = raw[messageId];
        messages.push({
          messageId,
          senderId: m.senderId,
          text: m.text,
          createdAt: m.createdAt,
          attachment: m.attachment,
        });
      }
      messages.sort((a, b) => a.createdAt - b.createdAt);
      callback(messages);
    });
    return () => off(messagesRef);
  },

  subscribeChatBlocked(
    chatId: string,
    callback: (blockedByUserId: Record<string, boolean>) => void
  ): () => void {
    const blockedRef = ref(db, `chats/${chatId}/blocked`);
    const unsub = onValue(blockedRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback({});
        return;
      }
      const raw = snapshot.val() as Record<string, unknown>;
      const out: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(raw || {})) out[String(k)] = Boolean(v);
      callback(out);
    });
    return () => off(blockedRef);
  },

  async sendMessage(
    chatId: string,
    senderId: string,
    text: string,
    attachment?: MessageAttachment
  ): Promise<void> {
    const [uid1, uid2] = chatId.split('_');
    const otherUserId = uid1 === senderId ? uid2 : uid1;
    if (!otherUserId) {
      throw new Error('Invalid chat participants');
    }
    const blockedMap = await getChatBlockedMap(chatId);
    if (Object.values(blockedMap).some(Boolean)) {
      throw new Error('You cannot send messages in this chat because one of you is blocked.');
    }

    // Fallback safety if chat-level block node isn't readable/writable in a given ruleset.
    const [senderBlockedSet, otherBlockedSet] = await Promise.all([getUserBlockedSet(senderId), getUserBlockedSet(otherUserId)]);
    if (senderBlockedSet.has(otherUserId) || otherBlockedSet.has(senderId)) {
      throw new Error('You cannot send messages in this chat because one of you is blocked.');
    }

    const messagesRef = ref(db, `chats/${chatId}/messages`);
    const newRef = push(messagesRef);
    const messageId = newRef.key;
    if (!messageId) throw new Error('Failed to create message');
    const createdAt = Date.now();
    const payload: Record<string, unknown> = { senderId, text, createdAt };
    if (attachment) payload.attachment = attachment;
    const lastMessage = attachment
      ? { senderId, text: text || (attachment.type === 'image' ? '[Image]' : '[Document]'), createdAt, attachment }
      : { senderId, text, createdAt };
    // Always try to write the message itself first.
    await set(newRef, payload);

    // Best-effort: update chat lastMessage + conversation summaries.
    // Some RTDB rulesets deny writes to shared chat nodes or to other users' `userChats`.
    const ignorePermissionDenied = (e: unknown) => {
      const msg = (e as Error)?.message ?? '';
      return msg.includes('PERMISSION_DENIED') || msg.includes('Permission denied') || msg.includes('permission_denied');
    };

    try {
      await update(ref(db, `chats/${chatId}`), { lastMessage });
    } catch (e) {
      if (!ignorePermissionDenied(e)) throw e;
    }

    // Update sender's own conversation summary (usually allowed).
    try {
      await update(ref(db, `userChats/${senderId}/${chatId}`), { lastMessage, unreadCount: 0 });
    } catch (e) {
      if (!ignorePermissionDenied(e)) throw e;
    }

    // Update receiver summary (often denied by strict rules; ignore if so).
    try {
      await update(ref(db, `userChats/${otherUserId}/${chatId}`), { lastMessage });
    } catch (e) {
      if (!ignorePermissionDenied(e)) throw e;
    }
  },

  async markChatRead(currentUserId: string, chatId: string): Promise<void> {
    await update(ref(db, `userChats/${currentUserId}/${chatId}`), { unreadCount: 0, lastReadAt: Date.now() });
  },

  async clearAllUnread(currentUserId: string): Promise<void> {
    try {
      const snap = await get(ref(db, `userChats/${currentUserId}`));
      if (!snap.exists()) return;
      const rows = snap.val() as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const chatId of Object.keys(rows || {})) {
        patch[`${chatId}/unreadCount`] = 0;
        patch[`${chatId}/lastReadAt`] = Date.now();
      }
      if (Object.keys(patch).length) {
        await update(ref(db, `userChats/${currentUserId}`), patch);
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('Permission denied')) return;
      throw e;
    }
  },

  /** Remove this conversation from the current user's list. Messages remain for the other user. */
  async deleteConversationForUser(currentUserId: string, chatId: string): Promise<void> {
    await remove(ref(db, `userChats/${currentUserId}/${chatId}`));
  },

  /** Block a user (add to blocked list). Conversation history remains visible. */
  async blockUser(currentUserId: string, otherUserId: string): Promise<void> {
    const chatId = getChatId(currentUserId, otherUserId);
    // Store blocks under users/{uid}/blockedUsers where user-scoped write rules commonly exist.
    await Promise.all([
      set(ref(db, `users/${currentUserId}/blockedUsers/${otherUserId}`), true),
      set(ref(db, `chats/${chatId}/blocked/${currentUserId}`), true),
    ]);
  },

  /** Unblock a user (remove from blocked list). */
  async unblockUser(currentUserId: string, otherUserId: string): Promise<void> {
    const chatId = getChatId(currentUserId, otherUserId);

    // The only required unblock is the user-scoped path (commonly permitted by RTDB rules).
    // Other cleanup paths are best-effort because some rulesets deny deletes on legacy/shared nodes.
    await remove(ref(db, `users/${currentUserId}/blockedUsers/${otherUserId}`));

    // Legacy node cleanup (ignore permission denied).
    remove(ref(db, `userBlockedUsers/${currentUserId}/${otherUserId}`)).catch(() => {});

    // Shared chat-level flag cleanup: try delete; if denied, try setting false; else ignore.
    remove(ref(db, `chats/${chatId}/blocked/${currentUserId}`))
      .catch((e) => {
        const msg = (e as Error)?.message ?? '';
        if (msg.includes('Permission denied')) {
          return set(ref(db, `chats/${chatId}/blocked/${currentUserId}`), false);
        }
        throw e;
      })
      .catch(() => {});
  },

  async getBlockedUserIds(currentUserId: string): Promise<string[]> {
    return Array.from(await getUserBlockedSet(currentUserId));
  },

  async getBlockStatus(currentUserId: string, otherUserId: string): Promise<{
    blockedByMe: boolean;
    blockedByOther: boolean;
  }> {
    const chatId = getChatId(currentUserId, otherUserId);
    const blockedMap = await getChatBlockedMap(chatId);
    const blockedByMe = Boolean(blockedMap?.[currentUserId]);
    const blockedByOther = Boolean(blockedMap?.[otherUserId]);
    if (blockedByMe || blockedByOther) {
      return { blockedByMe, blockedByOther };
    }

    const [mine, theirs] = await Promise.all([
      getUserBlockedSet(currentUserId),
      getUserBlockedSet(otherUserId),
    ]);
    const derived = {
      blockedByMe: mine.has(otherUserId),
      blockedByOther: theirs.has(currentUserId),
    };

    // Best-effort backfill so chat-level blocking becomes authoritative going forward.
    if (derived.blockedByMe) {
      set(ref(db, `chats/${chatId}/blocked/${currentUserId}`), true).catch(() => {});
    }
    if (derived.blockedByOther) {
      set(ref(db, `chats/${chatId}/blocked/${otherUserId}`), true).catch(() => {});
    }

    return derived;
  },
};
