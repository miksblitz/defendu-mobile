import { ref, get, set, update, push, onValue, off } from 'firebase/database';
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
}

function getChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
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
    };
    const summaryForOther = {
      otherUserId: currentUserId,
      otherUserDisplayName: currentUserDisplayName,
      otherUserPhotoURL: currentUserPhotoURL || '',
      lastMessage: null as { text: string; senderId: string; createdAt: number; attachment?: MessageAttachment } | null,
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
    callback: (userChats: Record<string, { lastMessage?: { senderId: string; createdAt: number } }>) => void
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

  async sendMessage(
    chatId: string,
    senderId: string,
    text: string,
    attachment?: MessageAttachment
  ): Promise<void> {
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
    await set(newRef, payload);
    await update(ref(db, `chats/${chatId}`), { lastMessage });
    const [uid1, uid2] = chatId.split('_');
    await update(ref(db, `userChats/${uid1}/${chatId}`), { lastMessage });
    await update(ref(db, `userChats/${uid2}/${chatId}`), { lastMessage });
  },
};
