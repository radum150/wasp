import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Conversation } from '@wasp/types';
import { useChatStore } from '../../../store/chat';
import { useAuthStore } from '../../../store/auth';
import { formatDistanceToNowStrict } from 'date-fns';

function ConversationItem({
  conversation,
  currentUserId,
  onPress,
}: {
  conversation: Conversation;
  currentUserId: string;
  onPress: () => void;
}) {
  const initials = conversation.name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <TouchableOpacity style={styles.conversationItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationName} numberOfLines={1}>
            {conversation.name}
          </Text>
          {conversation.lastMessageAt && (
            <Text style={styles.conversationTime}>
              {formatDistanceToNowStrict(conversation.lastMessageAt, { addSuffix: false })}
            </Text>
          )}
        </View>
        <View style={styles.conversationFooter}>
          <Text style={styles.conversationPreview} numberOfLines={1}>
            {conversation.lastMessagePreview ?? 'No messages yet'}
          </Text>
          {conversation.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ChatListScreen() {
  const conversations = useChatStore((s) => s.conversations);
  const currentUser = useAuthStore((s) => s.user);
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>WASP</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/settings')}>
          <Text style={styles.headerAction}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor="#9CA3AF"
        />
      </View>

      {/* Conversations */}
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationItem
            conversation={item}
            currentUserId={currentUser?.id ?? ''}
            onPress={() => router.push(`/(app)/chat/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>
              Search for a user to start a new conversation
            </Text>
          </View>
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab}>
        <Text style={styles.fabIcon}>✏️</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  headerAction: { fontSize: 22 },
  searchContainer: { paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: {
    backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 8, fontSize: 15, color: '#111827',
  },
  conversationItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#22c55e',
    alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0,
  },
  avatarText: { color: 'white', fontWeight: '700', fontSize: 16 },
  conversationContent: { flex: 1 },
  conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  conversationName: { flex: 1, fontWeight: '600', fontSize: 15, color: '#111827', marginRight: 8 },
  conversationTime: { fontSize: 12, color: '#9CA3AF' },
  conversationFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  conversationPreview: { flex: 1, fontSize: 13, color: '#6B7280', marginRight: 8 },
  unreadBadge: {
    backgroundColor: '#22c55e', borderRadius: 12, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  unreadText: { color: 'white', fontSize: 11, fontWeight: '700' },
  separator: { height: 1, backgroundColor: '#F9FAFB', marginLeft: 76 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#374151', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  fabIcon: { fontSize: 24 },
});
