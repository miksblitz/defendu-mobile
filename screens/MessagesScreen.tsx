import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { AuthController } from '../lib/controllers/AuthController';
import {
  MessageController,
  type ConversationSummary,
  type ChatMessage,
} from '../lib/controllers/MessageController';
import { useUnreadMessages } from '../lib/contexts/UnreadMessagesContext';

interface MessagesScreenProps {
  openWithUserId?: string;
  openWithUserName?: string;
  openWithUserPhoto?: string | null;
}

export default function MessagesScreen({ openWithUserId, openWithUserName, openWithUserPhoto }: MessagesScreenProps) {
  const { clearUnread } = useUnreadMessages();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedChat, setSelectedChat] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [showChatActionsModal, setShowChatActionsModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    clearUnread();
  }, [clearUnread]);

  const refreshConversations = async (uid: string) => {
    const [list, blocked] = await Promise.all([
      MessageController.getConversations(uid),
      MessageController.getBlockedUserIds(uid),
    ]);
    const blockedSet = new Set(blocked);
    setBlockedUserIds(blockedSet);
    setConversations(list.filter((c) => !blockedSet.has(c.otherUserId)));
  };

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const user = await AuthController.getCurrentUser();
        if (cancelled) return;
        if (!user) {
          setLoading(false);
          return;
        }
        setCurrentUserId(user.uid);
        const [list, blocked] = await Promise.all([
          MessageController.getConversations(user.uid),
          MessageController.getBlockedUserIds(user.uid),
        ]);
        if (cancelled) return;
        const blockedSet = new Set(blocked);
        setBlockedUserIds(blockedSet);
        let filtered = list.filter((c) => !blockedSet.has(c.otherUserId));
        if (openWithUserId && openWithUserName && !blockedSet.has(openWithUserId)) {
          const existing = list.find((c) => c.otherUserId === openWithUserId);
          if (!existing) {
            await MessageController.getOrCreateChat(
              user.uid,
              openWithUserId,
              [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Me',
              user.profilePicture || null,
              openWithUserName,
              openWithUserPhoto || null
            );
            if (cancelled) return;
            const [newList, newBlocked] = await Promise.all([
              MessageController.getConversations(user.uid),
              MessageController.getBlockedUserIds(user.uid),
            ]);
            const newBlockedSet = new Set(newBlocked);
            setBlockedUserIds(newBlockedSet);
            filtered = newList.filter((c) => !newBlockedSet.has(c.otherUserId));
          }
          const toSelect = filtered.find((c) => c.otherUserId === openWithUserId) ?? filtered[0];
          setSelectedChat(toSelect ?? null);
        }
        setConversations(filtered);
        setInitError(null);
      } catch (e) {
        console.error('MessagesScreen init:', e);
        if (!cancelled) {
          setConversations([]);
          const msg = (e as Error)?.message ?? '';
          setInitError(msg.includes('Permission denied') ? 'Unable to load messages. Please check your connection and try again.' : 'Could not load conversations.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [openWithUserId, openWithUserName, openWithUserPhoto]);

  useEffect(() => {
    if (!selectedChat?.chatId || !currentUserId) {
      setMessages([]);
      return;
    }
    setMessages([]);
    setMessagesLoading(true);
    const unsub = MessageController.subscribeMessages(selectedChat.chatId, (list) => {
      setMessages(list);
      setMessagesLoading(false);
    });
    return () => {
      unsub();
      setMessagesLoading(false);
    };
  }, [selectedChat?.chatId, currentUserId]);

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || !currentUserId || !selectedChat) return;
    try {
      await MessageController.sendMessage(selectedChat.chatId, currentUserId, text);
      setInputText('');
    } catch (e) {
      console.error('sendMessage:', e);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#07bbc0" />
      </View>
    );
  }

  // List view: show names first; tap one to open the chat
  if (!selectedChat) {
    return (
      <View style={styles.safeArea}>
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
          {initError ? (
            <Text style={styles.emptyText}>{initError}</Text>
          ) : conversations.length === 0 ? (
            <Text style={styles.emptyText}>No conversations yet.</Text>
          ) : (
            conversations.map((c) => (
              <TouchableOpacity
                key={c.chatId}
                style={styles.convItemFull}
                onPress={() => setSelectedChat(c)}
                activeOpacity={0.7}
              >
                {c.otherUserPhotoURL ? (
                  <Image source={{ uri: c.otherUserPhotoURL }} style={styles.convAvatar} />
                ) : (
                  <View style={styles.convAvatarPlaceholder}>
                    <Text style={styles.convAvatarLetter}>{c.otherUserDisplayName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.convInfo}>
                  <Text style={styles.convName} numberOfLines={1}>{c.otherUserDisplayName}</Text>
                  <Text style={styles.convPreview} numberOfLines={1}>{c.lastMessage?.text || 'No messages'}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  const handleBlockPerson = async () => {
    if (!currentUserId || !selectedChat) return;
    setActionLoading(true);
    try {
      await MessageController.blockUser(currentUserId, selectedChat.otherUserId);
      await refreshConversations(currentUserId);
      setShowChatActionsModal(false);
      setSelectedChat(null);
    } catch (e) {
      console.error('blockUser:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConversation = async () => {
    if (!currentUserId || !selectedChat) return;
    setActionLoading(true);
    try {
      await MessageController.deleteConversationForUser(currentUserId, selectedChat.chatId);
      await refreshConversations(currentUserId);
      setShowChatActionsModal(false);
      setSelectedChat(null);
    } catch (e) {
      console.error('deleteConversation:', e);
    } finally {
      setActionLoading(false);
    }
  };

  // Chat view: message thread + textbox (only after selecting a conversation)
  return (
    <View style={styles.safeArea}>
      <View style={styles.backRow}>
        <TouchableOpacity onPress={() => setSelectedChat(null)} activeOpacity={0.7} style={styles.backButtonTouch}>
          <Image source={require('../assets/images/icon-back.png')} style={styles.backIcon} resizeMode="contain" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.chatHeaderNameWrap}
          onLongPress={() => setShowChatActionsModal(true)}
          delayLongPress={500}
          activeOpacity={1}
        >
          <Text style={styles.chatHeaderName} numberOfLines={1}>{selectedChat.otherUserDisplayName}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowChatActionsModal(true)}
          style={styles.chatHeaderMenuButton}
          activeOpacity={0.7}
        >
          <Text style={styles.chatHeaderMenuIcon}>⋮</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messagesLoading && messages.length === 0 ? (
          <View style={styles.messagesLoadingWrap}>
            <ActivityIndicator size="small" color="#07bbc0" />
            <Text style={styles.messagesLoadingText}>Loading messages...</Text>
          </View>
        ) : null}
        {messages.map((m) => (
          <View
            key={m.messageId}
            style={[styles.messageBubble, m.senderId === currentUserId ? styles.messageBubbleMe : styles.messageBubbleThem]}
          >
            <Text style={styles.messageText}>{m.text}</Text>
            <Text style={styles.messageTime}>{formatTime(m.createdAt)}</Text>
          </View>
        ))}
      </ScrollView>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={styles.inputRow}
      >
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#6b8693"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={2000}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      <Modal
        visible={showChatActionsModal}
        transparent
        animationType="fade"
        onRequestClose={() => !actionLoading && setShowChatActionsModal(false)}
      >
        <Pressable style={styles.chatActionsOverlay} onPress={() => !actionLoading && setShowChatActionsModal(false)}>
          <Pressable style={styles.chatActionsCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.chatActionsTitle}>Conversation options</Text>
            <TouchableOpacity
              style={styles.chatActionsButton}
              onPress={handleBlockPerson}
              disabled={actionLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.chatActionsButtonTextDanger}>Block person</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chatActionsButton}
              onPress={handleDeleteConversation}
              disabled={actionLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.chatActionsButtonText}>Delete conversation</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chatActionsButton, styles.chatActionsButtonCancel]}
              onPress={() => setShowChatActionsModal(false)}
              disabled={actionLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.chatActionsButtonTextMuted}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#041527' },
  listScroll: { flex: 1 },
  listContent: { paddingVertical: 8, paddingBottom: 24 },
  emptyText: { color: '#6b8693', fontSize: 14, padding: 16 },
  convItemFull: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#062731',
  },
  convAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  convAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    backgroundColor: '#07bbc0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  convAvatarLetter: { color: '#041527', fontSize: 18, fontWeight: '700' },
  convInfo: { flex: 1, minWidth: 0 },
  convName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  convPreview: { color: '#6b8693', fontSize: 13, marginTop: 2 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#062731',
    backgroundColor: '#011f36',
  },
  backButtonTouch: { padding: 4, marginRight: 8 },
  backIcon: { width: 24, height: 24 },
  chatHeaderNameWrap: { flex: 1, minWidth: 0, justifyContent: 'center', paddingVertical: 12, paddingRight: 8 },
  chatHeaderName: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  chatHeaderMenuButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatHeaderMenuIcon: { color: '#FFF', fontSize: 24, fontWeight: '700', lineHeight: 24 },
  chatActionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 14, 28, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  chatActionsCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#041527',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#062731',
    padding: 24,
  },
  chatActionsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 20,
  },
  chatActionsButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#011f36',
    borderWidth: 1,
    borderColor: '#062731',
  },
  chatActionsButtonCancel: { marginTop: 8, marginBottom: 0 },
  chatActionsButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  chatActionsButtonTextDanger: { color: '#e57373', fontSize: 16, fontWeight: '600' },
  chatActionsButtonTextMuted: { color: '#6b8693', fontSize: 16, fontWeight: '600' },
  messagesScroll: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 24 },
  messagesLoadingWrap: { paddingVertical: 24, alignItems: 'center', justifyContent: 'center' },
  messagesLoadingText: { color: '#6b8693', fontSize: 14, marginTop: 8 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 8 },
  messageBubbleMe: { alignSelf: 'flex-end', backgroundColor: '#07bbc0' },
  messageBubbleThem: { alignSelf: 'flex-start', backgroundColor: '#011f36', borderWidth: 1, borderColor: '#062731' },
  messageText: { color: '#FFF', fontSize: 14 },
  messageTime: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: '#062731',
    backgroundColor: '#011f36',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#062731',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 14,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: { backgroundColor: '#07bbc0', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  sendButtonText: { color: '#041527', fontSize: 14, fontWeight: '700' },
});
