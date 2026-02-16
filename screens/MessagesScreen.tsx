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
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    clearUnread();
  }, [clearUnread]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const user = await AuthController.getCurrentUser();
      if (cancelled || !user) return;
      setCurrentUserId(user.uid);
      let list = await MessageController.getConversations(user.uid);
      if (openWithUserId && openWithUserName) {
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
          list = await MessageController.getConversations(user.uid);
        }
        const toSelect = list.find((c) => c.otherUserId === openWithUserId) ?? list[0];
        if (!cancelled) setSelectedChat(toSelect ?? null);
      } else if (list.length > 0) {
        if (!cancelled) setSelectedChat(list[0]);
      }
      if (!cancelled) {
        setConversations(list);
      }
      setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [openWithUserId, openWithUserName, openWithUserPhoto]);

  useEffect(() => {
    if (!selectedChat?.chatId || !currentUserId) return;
    const unsub = MessageController.subscribeMessages(selectedChat.chatId, (list) => {
      setMessages(list);
    });
    return () => unsub();
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

  return (
    <View style={styles.safeArea}>
      <View style={styles.body}>
        <View style={styles.conversationList}>
          {conversations.length === 0 ? (
            <Text style={styles.emptyText}>No conversations yet.</Text>
          ) : (
            conversations.map((c) => (
              <TouchableOpacity
                key={c.chatId}
                style={[styles.convItem, selectedChat?.chatId === c.chatId && styles.convItemActive]}
                onPress={() => setSelectedChat(c)}
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
        </View>
        <View style={styles.chatArea}>
          {selectedChat ? (
            <>
              <ScrollView
                ref={scrollRef}
                style={styles.messagesScroll}
                contentContainerStyle={styles.messagesContent}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              >
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
            </>
          ) : (
            <View style={styles.noChat}>
              <Text style={styles.noChatText}>Select a conversation</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#041527' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#041527' },
  body: { flex: 1, flexDirection: 'row' },
  conversationList: { width: 120, borderRightWidth: 1, borderRightColor: '#062731', paddingVertical: 8 },
  emptyText: { color: '#6b8693', fontSize: 14, padding: 16 },
  convItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#062731' },
  convItemActive: { backgroundColor: '#011f36' },
  convAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 8 },
  convAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, marginRight: 8, backgroundColor: '#07bbc0', justifyContent: 'center', alignItems: 'center' },
  convAvatarLetter: { color: '#041527', fontSize: 16, fontWeight: '700' },
  convInfo: { flex: 1, minWidth: 0 },
  convName: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  convPreview: { color: '#6b8693', fontSize: 12, marginTop: 2 },
  chatArea: { flex: 1 },
  messagesScroll: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 24 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 8 },
  messageBubbleMe: { alignSelf: 'flex-end', backgroundColor: '#07bbc0' },
  messageBubbleThem: { alignSelf: 'flex-start', backgroundColor: '#011f36', borderWidth: 1, borderColor: '#062731' },
  messageText: { color: '#FFF', fontSize: 14 },
  messageTime: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 },
  noChat: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noChatText: { color: '#6b8693', fontSize: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: '#062731', backgroundColor: '#011f36' },
  input: { flex: 1, borderWidth: 1, borderColor: '#062731', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#FFF', fontSize: 14, maxHeight: 100, marginRight: 8 },
  sendButton: { backgroundColor: '#07bbc0', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  sendButtonText: { color: '#041527', fontSize: 14, fontWeight: '700' },
});
