import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import auth from "@react-native-firebase/auth";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { io } from "socket.io-client";
import { defaultApiUrl, getContacts, getConversation, healthCheck, registerUser } from "./src/api";
import { demoUser, languageName, languages } from "./src/constants";

const storageKeys = {
  apiUrl: "translation-chat:api-url",
  user: "translation-chat:user"
};

export default function App() {
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [draftApiUrl, setDraftApiUrl] = useState(defaultApiUrl);
  const [connection, setConnection] = useState("checking");
  const [screen, setScreen] = useState("register");
  const [form, setForm] = useState(demoUser);
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState("");
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [call, setCall] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const socketRef = useRef(null);

  const activeContact = selectedContact || contacts[0] || null;

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    checkServer(apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    if (!user || !authToken) return undefined;

    const socket = io(apiUrl, {
      auth: {
        token: authToken,
        userId: user.id
      },
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;
    socket.emit("user:online", { userId: user.id });

    socket.on("connect", () => setConnection("online"));
    socket.on("disconnect", () => setConnection("offline"));
    socket.on("contacts:update", (allUsers) => {
      setContacts(allUsers.filter((item) => item.id !== user.id));
    });
    socket.on("message:new", (message) => {
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current;
        return [...current, message];
      });
    });
    socket.on("call:incoming", (payload) => {
      setCall({
        mode: payload.type || "voice",
        direction: "incoming",
        name: payload.senderName || "Contact",
        muted: false,
        speaker: false,
        video: payload.type === "video"
      });
    });

    return () => socket.disconnect();
  }, [apiUrl, authToken, user]);

  useEffect(() => {
    if (!user || !authToken) return;
    loadContacts();
  }, [apiUrl, authToken, user]);

  useEffect(() => {
    if (!user || !activeContact || !authToken) return;
    loadConversation(activeContact.id);
  }, [apiUrl, authToken, user, activeContact?.id]);

  const filteredContacts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) => contact.name.toLowerCase().includes(query));
  }, [contacts, searchText]);

  const visibleMessages = useMemo(() => {
    if (!user || !activeContact) return [];
    return messages.filter((message) => {
      const sent = message.senderId === user.id && message.receiverId === activeContact.id;
      const received = message.senderId === activeContact.id && message.receiverId === user.id;
      return sent || received;
    });
  }, [activeContact, messages, user]);

  async function restoreSession() {
    const [storedUrl, storedUser] = await Promise.all([
      AsyncStorage.getItem(storageKeys.apiUrl),
      AsyncStorage.getItem(storageKeys.user)
    ]);
    if (storedUrl) {
      setApiUrl(storedUrl);
      setDraftApiUrl(storedUrl);
    }
    if (storedUser) {
      const firebaseUser = auth().currentUser;
      if (firebaseUser) {
        setAuthToken(await firebaseUser.getIdToken());
        setUser(JSON.parse(storedUser));
        setScreen("chat");
      } else {
        await AsyncStorage.removeItem(storageKeys.user);
      }
    }
  }

  async function checkServer(url) {
    setConnection("checking");
    try {
      await healthCheck(url);
      setConnection("online");
    } catch {
      setConnection("offline");
    }
  }

  async function loadContacts() {
    try {
      const result = await getContacts(apiUrl, user.id, authToken);
      setContacts(result.contacts);
      setSelectedContact((current) => current || result.contacts[0] || null);
    } catch (error) {
      Alert.alert("Contacts", error.message);
    }
  }

  async function loadConversation(contactId) {
    try {
      const result = await getConversation(apiUrl, user.id, contactId, authToken);
      setMessages(result.messages);
    } catch (error) {
      Alert.alert("Conversation", error.message);
    }
  }

  async function handleSendOtp() {
    if (!form.name.trim() || !form.emailOrPhone.trim()) {
      Alert.alert("Missing details", "Enter your name and phone number.");
      return;
    }

    setIsLoading(true);
    try {
      const confirmation = await auth().signInWithPhoneNumber(form.emailOrPhone.trim());
      setConfirmationResult(confirmation);
      setOtp("");
      setScreen("verify");
    } catch (error) {
      Alert.alert("OTP failed", error.message || "Unable to send OTP. Check Firebase phone auth setup.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerify() {
    if (!confirmationResult) {
      Alert.alert("OTP", "Send OTP again before verifying.");
      return;
    }

    setIsLoading(true);
    try {
      const credential = await confirmationResult.confirm(otp.trim());
      const token = await credential.user.getIdToken();
      const result = await registerUser(
        apiUrl,
        {
          ...form,
          emailOrPhone: credential.user.phoneNumber || form.emailOrPhone
        },
        token
      );
      setAuthToken(token);
      setUser(result.user);
      await AsyncStorage.setItem(storageKeys.user, JSON.stringify(result.user));
      setScreen("chat");
    } catch (error) {
      Alert.alert("Registration failed", error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function sendMessage() {
    const text = messageText.trim();
    if (!text || !user || !activeContact) return;

    socketRef.current?.emit("message:send", {
      receiverId: activeContact.id,
      text
    });
    setMessageText("");
  }

  function startCall(mode) {
    if (!activeContact || !user) return;
    socketRef.current?.emit("call:signal", {
      type: mode,
      receiverId: activeContact.id
    });
    setCall({
      mode,
      direction: "outgoing",
      name: activeContact.name,
      muted: false,
      speaker: false,
      video: mode === "video"
    });
  }

  async function saveApiUrl() {
    const normalized = draftApiUrl.trim().replace(/\/$/, "");
    setApiUrl(normalized);
    await AsyncStorage.setItem(storageKeys.apiUrl, normalized);
    setSettingsOpen(false);
  }

  async function logout() {
    socketRef.current?.disconnect();
    await auth().signOut().catch(() => undefined);
    await AsyncStorage.removeItem(storageKeys.user);
    setUser(null);
    setAuthToken("");
    setConfirmationResult(null);
    setMessages([]);
    setContacts([]);
    setSelectedContact(null);
    setScreen("register");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {screen === "chat" && user ? (
        <ChatScreen
          activeContact={activeContact}
          call={call}
          connection={connection}
          filteredContacts={filteredContacts}
          messageText={messageText}
          messages={visibleMessages}
          searchText={searchText}
          setCall={setCall}
          setMessageText={setMessageText}
          setSearchText={setSearchText}
          setSelectedContact={setSelectedContact}
          setSettingsOpen={setSettingsOpen}
          startCall={startCall}
          sendMessage={sendMessage}
          user={user}
        />
      ) : (
        <AuthScreen
          connection={connection}
          form={form}
          isLoading={isLoading}
          otp={otp}
          screen={screen}
          setForm={setForm}
          setOtp={setOtp}
          setScreen={setScreen}
          onSendOtp={handleSendOtp}
          onVerify={handleVerify}
        />
      )}

      <SettingsModal
        apiUrl={draftApiUrl}
        connection={connection}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLogout={logout}
        onSave={saveApiUrl}
        setApiUrl={setDraftApiUrl}
      />
    </SafeAreaView>
  );
}

function AuthScreen({ connection, form, isLoading, otp, screen, setForm, setOtp, setScreen, onSendOtp, onVerify }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.authWrap} keyboardShouldPersistTaps="handled">
        <View style={styles.logoMark}>
          <Ionicons name="language" size={30} color="#ffffff" />
        </View>
        <Text style={styles.appName}>Translation Chat</Text>
        <Text style={styles.heroTitle}>Talk naturally across Hindi and English.</Text>
        <ConnectionPill status={connection} />

        {screen === "register" ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Create account</Text>
            <Field label="Name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
            <Field
              keyboardType="phone-pad"
              label="Phone number"
              value={form.emailOrPhone}
              onChangeText={(emailOrPhone) => setForm({ ...form, emailOrPhone })}
            />
            <LanguageSelector
              label="Mother tongue"
              value={form.motherTongue}
              onChange={(motherTongue) => setForm({ ...form, motherTongue })}
            />
            <LanguageSelector
              label="I understand"
              value={form.understands}
              onChange={(understands) => setForm({ ...form, understands })}
            />
            <PrimaryButton icon="send" label="Send OTP" onPress={onSendOtp} />
          </View>
        ) : (
          <View style={styles.panel}>
            <Pressable style={styles.backButton} onPress={() => setScreen("register")}>
              <Ionicons name="arrow-back" size={19} color="#2f5f8f" />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <Text style={styles.panelTitle}>Verify phone</Text>
            <Text style={styles.mutedText}>Enter the SMS OTP sent by Firebase.</Text>
            <Field
              keyboardType="number-pad"
              label="OTP"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
              placeholder="123456"
            />
            <PrimaryButton
              icon="shield-checkmark"
              isLoading={isLoading}
              label="Verify and continue"
              onPress={onVerify}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ChatScreen({
  activeContact,
  call,
  connection,
  filteredContacts,
  messageText,
  messages,
  searchText,
  setCall,
  setMessageText,
  setSearchText,
  setSelectedContact,
  setSettingsOpen,
  startCall,
  sendMessage,
  user
}) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <View style={styles.chatHeader}>
        <View>
          <Text style={styles.headerKicker}>Real-time translation</Text>
          <Text style={styles.headerTitle}>{activeContact?.name || "Contacts"}</Text>
        </View>
        <View style={styles.headerActions}>
          <ConnectionPill status={connection} compact />
          <IconButton icon="settings-outline" onPress={() => setSettingsOpen(true)} />
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#6b7b8f" />
        <TextInput
          placeholder="Search contacts"
          placeholderTextColor="#8b99aa"
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      <FlatList
        data={filteredContacts}
        horizontal
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.contactRail}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.contactChip, activeContact?.id === item.id && styles.contactChipActive]}
            onPress={() => setSelectedContact(item)}
          >
            <Avatar label={item.avatar} online={item.online} />
            <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.contactLang}>{languageName[item.motherTongue]}</Text>
          </Pressable>
        )}
      />

      <View style={styles.conversationTop}>
        <View>
          <Text style={styles.conversationName}>{activeContact?.name || "Select contact"}</Text>
          <Text style={styles.conversationMeta}>
            {activeContact ? `${languageName[user.motherTongue]} to ${languageName[activeContact.motherTongue]}` : "No active chat"}
          </Text>
        </View>
        <View style={styles.row}>
          <IconButton icon="call-outline" onPress={() => startCall("voice")} />
          <IconButton icon="videocam-outline" onPress={() => startCall("video")} />
        </View>
      </View>

      <FlatList
        data={messages}
        inverted
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={<EmptyConversation />}
        renderItem={({ item }) => <MessageBubble message={item} mine={item.senderId === user.id} />}
      />

      <View style={styles.composer}>
        <IconButton icon="mic-outline" />
        <TextInput
          editable={Boolean(activeContact)}
          multiline
          placeholder="Type a message..."
          placeholderTextColor="#8997a8"
          style={styles.composerInput}
          value={messageText}
          onChangeText={setMessageText}
        />
        <IconButton icon="send" emphasized onPress={sendMessage} />
      </View>

      <CallModal call={call} setCall={setCall} />
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message, mine }) {
  const primary = mine ? message.originalText : message.translatedText;
  const secondary = mine ? message.translatedText : message.originalText;

  return (
    <View style={[styles.messageBubble, mine ? styles.mineBubble : styles.theirBubble]}>
      <Text style={[styles.messageText, mine && styles.mineMessageText]}>{primary}</Text>
      <Text style={[styles.translationText, mine && styles.mineTranslationText]}>
        {languageName[message.sourceLanguage]} to {languageName[message.targetLanguage]} · {secondary}
      </Text>
    </View>
  );
}

function CallModal({ call, setCall }) {
  if (!call) return null;

  function toggle(key) {
    setCall((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <Modal animationType="slide" transparent visible>
      <View style={styles.modalBackdrop}>
        <View style={styles.callSheet}>
          <View style={styles.callAvatar}>
            <Ionicons name={call.mode === "video" ? "videocam" : "call"} size={34} color="#ffffff" />
          </View>
          <Text style={styles.callTitle}>{call.direction === "incoming" ? "Incoming" : "Calling"} {call.name}</Text>
          <Text style={styles.callSubtitle}>Speech, translation, and playback controls are ready for native call integration.</Text>
          <View style={styles.callControls}>
            <IconButton active={call.muted} icon={call.muted ? "mic-off" : "mic-outline"} onPress={() => toggle("muted")} />
            <IconButton active={call.speaker} icon="volume-high-outline" onPress={() => toggle("speaker")} />
            <IconButton active={call.video} icon="videocam-outline" onPress={() => toggle("video")} />
            <IconButton danger icon="call" onPress={() => setCall(null)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SettingsModal({ apiUrl, connection, isOpen, onClose, onLogout, onSave, setApiUrl }) {
  return (
    <Modal animationType="fade" transparent visible={isOpen}>
      <View style={styles.modalBackdrop}>
        <View style={styles.settingsSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.panelTitle}>Settings</Text>
            <IconButton icon="close" onPress={onClose} />
          </View>
          <ConnectionPill status={connection} />
          <Field
            autoCapitalize="none"
            label="API server"
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="http://192.168.1.10:4000"
          />
          <Text style={styles.mutedText}>Use your computer LAN IP for a physical phone. Android emulator can use 10.0.2.2.</Text>
          <PrimaryButton icon="save-outline" label="Save server" onPress={onSave} />
          <Pressable style={styles.logoutButton} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={18} color="#b42318" />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function LanguageSelector({ label, value, onChange }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segmented}>
        {languages.map((language) => (
          <Pressable
            key={language.code}
            style={[styles.segment, value === language.code && styles.segmentActive]}
            onPress={() => onChange(language.code)}
          >
            <Text style={[styles.segmentText, value === language.code && styles.segmentTextActive]}>{language.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#8b99aa" style={styles.input} {...props} />
    </View>
  );
}

function PrimaryButton({ icon, isLoading, label, onPress }) {
  return (
    <Pressable disabled={isLoading} style={styles.primaryButton} onPress={onPress}>
      {isLoading ? <ActivityIndicator color="#ffffff" /> : <Ionicons name={icon} size={19} color="#ffffff" />}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function IconButton({ active, danger, emphasized, icon, onPress }) {
  return (
    <Pressable
      style={[
        styles.iconButton,
        emphasized && styles.iconButtonEmphasized,
        active && styles.iconButtonActive,
        danger && styles.iconButtonDanger
      ]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={19} color={emphasized || danger ? "#ffffff" : "#2f5f8f"} />
    </Pressable>
  );
}

function Avatar({ label, online }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{label || "U"}</Text>
      <View style={[styles.onlineDot, online && styles.onlineDotActive]} />
    </View>
  );
}

function ConnectionPill({ compact, status }) {
  const online = status === "online";
  const checking = status === "checking";
  return (
    <View style={[styles.connectionPill, compact && styles.connectionPillCompact]}>
      <View style={[styles.connectionDot, online && styles.connectionDotOnline, checking && styles.connectionDotChecking]} />
      {!compact && <Text style={styles.connectionText}>{checking ? "Checking server" : online ? "Server online" : "Server offline"}</Text>}
    </View>
  );
}

function EmptyConversation() {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="chatbubbles-outline" size={38} color="#8ba7c2" />
      <Text style={styles.emptyTitle}>No messages yet</Text>
      <Text style={styles.emptyText}>Send a message and it will appear translated for the receiver.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f6f9fc" },
  flex: { flex: 1 },
  authWrap: { flexGrow: 1, justifyContent: "center", padding: 22 },
  logoMark: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#2f80c0",
    borderRadius: 18,
    height: 58,
    justifyContent: "center",
    marginBottom: 18,
    width: 58
  },
  appName: { color: "#2f5f8f", fontSize: 15, fontWeight: "800", marginBottom: 8 },
  heroTitle: { color: "#10243b", fontSize: 34, fontWeight: "900", lineHeight: 39, marginBottom: 16 },
  panel: { backgroundColor: "#ffffff", borderRadius: 8, elevation: 2, marginTop: 18, padding: 18, shadowColor: "#19324d", shadowOpacity: 0.08, shadowRadius: 14 },
  panelTitle: { color: "#10243b", fontSize: 22, fontWeight: "900", marginBottom: 14 },
  fieldWrap: { marginBottom: 14 },
  label: { color: "#44566c", fontSize: 13, fontWeight: "800", marginBottom: 7 },
  input: { backgroundColor: "#f4f8fb", borderColor: "#d8e2ec", borderRadius: 8, borderWidth: 1, color: "#10243b", minHeight: 48, paddingHorizontal: 14 },
  segmented: { backgroundColor: "#eef4f8", borderRadius: 8, flexDirection: "row", padding: 4 },
  segment: { alignItems: "center", borderRadius: 7, flex: 1, paddingVertical: 11 },
  segmentActive: { backgroundColor: "#ffffff", elevation: 1 },
  segmentText: { color: "#587089", fontWeight: "800" },
  segmentTextActive: { color: "#1f6fae" },
  primaryButton: { alignItems: "center", backgroundColor: "#1f6fae", borderRadius: 8, flexDirection: "row", gap: 9, justifyContent: "center", minHeight: 50 },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  mutedText: { color: "#65778d", lineHeight: 20, marginBottom: 14 },
  backButton: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 6, marginBottom: 10 },
  backText: { color: "#2f5f8f", fontWeight: "800" },
  chatHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12 },
  headerKicker: { color: "#61748a", fontSize: 12, fontWeight: "800" },
  headerTitle: { color: "#10243b", fontSize: 25, fontWeight: "900" },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  iconButton: { alignItems: "center", backgroundColor: "#e7f0f7", borderRadius: 8, height: 42, justifyContent: "center", width: 42 },
  iconButtonEmphasized: { backgroundColor: "#1f6fae" },
  iconButtonActive: { backgroundColor: "#cfe4f6" },
  iconButtonDanger: { backgroundColor: "#d92d20" },
  connectionPill: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#eaf1f7", borderRadius: 999, flexDirection: "row", gap: 8, paddingHorizontal: 11, paddingVertical: 7 },
  connectionPillCompact: { height: 34, justifyContent: "center", paddingHorizontal: 10 },
  connectionDot: { backgroundColor: "#c84a31", borderRadius: 999, height: 8, width: 8 },
  connectionDotOnline: { backgroundColor: "#138a4b" },
  connectionDotChecking: { backgroundColor: "#d7a022" },
  connectionText: { color: "#44566c", fontSize: 12, fontWeight: "800" },
  searchBox: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 8, flexDirection: "row", gap: 8, margin: 16, marginBottom: 8, paddingHorizontal: 13 },
  searchInput: { color: "#10243b", flex: 1, minHeight: 44 },
  contactRail: { gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  contactChip: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#e3ebf2", borderRadius: 8, borderWidth: 1, gap: 5, minHeight: 98, padding: 10, width: 86 },
  contactChipActive: { borderColor: "#1f6fae", borderWidth: 2 },
  contactName: { color: "#10243b", fontSize: 13, fontWeight: "900", maxWidth: 68 },
  contactLang: { color: "#6a7d92", fontSize: 11, fontWeight: "700" },
  avatar: { alignItems: "center", backgroundColor: "#d9eafd", borderRadius: 999, height: 42, justifyContent: "center", width: 42 },
  avatarText: { color: "#1f5f9b", fontWeight: "900" },
  onlineDot: { backgroundColor: "#b9c4cf", borderColor: "#ffffff", borderRadius: 999, borderWidth: 2, bottom: 0, height: 13, position: "absolute", right: 0, width: 13 },
  onlineDotActive: { backgroundColor: "#138a4b" },
  conversationTop: { alignItems: "center", backgroundColor: "#ffffff", borderBottomColor: "#e5edf3", borderBottomWidth: 1, borderTopColor: "#e5edf3", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  conversationName: { color: "#10243b", fontSize: 17, fontWeight: "900" },
  conversationMeta: { color: "#66788d", fontSize: 12, fontWeight: "700", marginTop: 2 },
  messageList: { flexGrow: 1, justifyContent: "flex-end", padding: 16 },
  messageBubble: { borderRadius: 8, marginBottom: 10, maxWidth: "86%", padding: 12 },
  mineBubble: { alignSelf: "flex-end", backgroundColor: "#1f6fae" },
  theirBubble: { alignSelf: "flex-start", backgroundColor: "#ffffff", borderColor: "#e1e9f0", borderWidth: 1 },
  messageText: { color: "#10243b", fontSize: 15, fontWeight: "700", lineHeight: 21 },
  mineMessageText: { color: "#ffffff" },
  translationText: { color: "#66788d", fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: 6 },
  mineTranslationText: { color: "#d9ecfb" },
  composer: { alignItems: "flex-end", backgroundColor: "#ffffff", borderTopColor: "#e5edf3", borderTopWidth: 1, flexDirection: "row", gap: 8, padding: 12 },
  composerInput: { backgroundColor: "#f3f7fb", borderRadius: 8, color: "#10243b", flex: 1, maxHeight: 92, minHeight: 42, paddingHorizontal: 13, paddingVertical: 10 },
  emptyState: { alignItems: "center", flex: 1, justifyContent: "center", paddingHorizontal: 30 },
  emptyTitle: { color: "#10243b", fontSize: 18, fontWeight: "900", marginTop: 10 },
  emptyText: { color: "#66788d", lineHeight: 20, marginTop: 4, textAlign: "center" },
  modalBackdrop: { backgroundColor: "rgba(16, 36, 59, 0.34)", flex: 1, justifyContent: "flex-end" },
  callSheet: { alignItems: "center", backgroundColor: "#ffffff", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 24 },
  callAvatar: { alignItems: "center", backgroundColor: "#1f6fae", borderRadius: 999, height: 76, justifyContent: "center", marginBottom: 16, width: 76 },
  callTitle: { color: "#10243b", fontSize: 22, fontWeight: "900", marginBottom: 6 },
  callSubtitle: { color: "#61748a", lineHeight: 20, marginBottom: 18, textAlign: "center" },
  callControls: { flexDirection: "row", gap: 12, justifyContent: "center" },
  settingsSheet: { backgroundColor: "#ffffff", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  logoutButton: { alignItems: "center", alignSelf: "center", flexDirection: "row", gap: 7, marginTop: 18, padding: 8 },
  logoutText: { color: "#b42318", fontWeight: "900" }
});
