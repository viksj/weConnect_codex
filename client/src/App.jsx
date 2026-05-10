import {
  BadgeCheck,
  Bell,
  CheckCheck,
  Languages,
  Mic,
  MicOff,
  MoreVertical,
  Paperclip,
  Pencil,
  Phone,
  PhoneOff,
  Plus,
  Reply,
  Search,
  Send,
  Settings,
  Shield,
  Trash2,
  UsersRound,
  UserRound,
  Video,
  VideoOff,
  Volume2,
  X
} from "lucide-react";
import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { io } from "socket.io-client";
import {
  API_URL,
  addContact,
  createGroup,
  deleteConversation,
  getContacts,
  getConversation,
  getGroupConversation,
  getGroups,
  registerUser,
  translateCaption,
  uploadLocalMedia,
  updateUser,
  verifyOtp
} from "./api";
import { languageName, languages } from "./constants";
import { firebaseAuth, isFirebaseConfigured } from "./firebase";
import { encryptMessage, decryptMessage } from "./encryptionService";
import { playVoiceTranslation, stopVoicePlayback } from "./voiceTranslator";

const demoUser = {
  name: "You",
  emailOrPhone: "+91 90000 00000",
  motherTongue: "hi"
};
const webSessionKey = "weconnect:web-session";

function userToForm(user) {
  return {
    name: user?.name || demoUser.name,
    emailOrPhone: user?.emailOrPhone || demoUser.emailOrPhone,
    motherTongue: user?.motherTongue || demoUser.motherTongue
  };
}

function loadStoredSession() {
  if (typeof window === "undefined") return null;

  try {
    const rawSession = window.localStorage.getItem(webSessionKey);
    if (!rawSession) return null;
    const session = JSON.parse(rawSession);
    if (!session?.authToken || !session?.user?.id) return null;
    return session;
  } catch {
    return null;
  }
}

function saveStoredSession(session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(webSessionKey, JSON.stringify(session));
}

function clearStoredSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(webSessionKey);
}

function getRtcConfig() {
  try {
    return JSON.parse(import.meta.env.VITE_ICE_SERVERS);
  } catch {
    return {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    };
  }
}

const rtcConfig = getRtcConfig();

function createCallId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function speechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function speechLocale(language) {
  const locales = {
    hi: "hi-IN",
    en: "en-US",
    te: "te-IN",
    ta: "ta-IN",
    kn: "kn-IN",
    ml: "ml-IN",
    mr: "mr-IN",
    gu: "gu-IN",
    bn: "bn-IN",
    pa: "pa-IN",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE"
  };
  return locales[language] || "en-US";
}

function canNotify() {
  return "Notification" in window && Notification.permission === "granted";
}

function decryptMaybe(value) {
  return value ? decryptMessage(value) : "";
}

function mediaHref(url) {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  return `${API_URL}${url}`;
}

function mediaKind(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function App() {
  const [storedSession] = useState(() => loadStoredSession());
  const [step, setStep] = useState(() => (storedSession ? "chat" : "phone"));
  const [form, setForm] = useState(() => userToForm(storedSession?.user));
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [user, setUser] = useState(() => storedSession?.user || null);
  const [authToken, setAuthToken] = useState(() => storedSession?.authToken || "");
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [chatFilter, setChatFilter] = useState("all");
  const [contactSearch, setContactSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState([]);
  const [profileForm, setProfileForm] = useState(() => userToForm(storedSession?.user));
  const [addContactText, setAddContactText] = useState("");
  const [inviteInfo, setInviteInfo] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    "Notification" in window && Notification.permission === "granted"
  );
  const [voiceTranslationEnabled, setVoiceTranslationEnabled] = useState(false);
  const [typingContactId, setTypingContactId] = useState("");
  const [isRecordingVoiceMessage, setIsRecordingVoiceMessage] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [openMessageMenuId, setOpenMessageMenuId] = useState("");
  const [call, setCall] = useState({
    status: "idle",
    type: "voice",
    contact: null,
    callId: "",
    muted: false,
    cameraOff: false,
    localCaption: null,
    remoteCaption: null
  });
  const [error, setError] = useState("");
  const socketRef = useRef(null);
  const fileInputRef = useRef(null);
  const messageEndRef = useRef(null);
  const recaptchaVerifierRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedVoiceChunksRef = useRef([]);
  const isVoiceMessageRecordingRef = useRef(false);
  const voiceMessageRecognitionRef = useRef(null);
  const voiceMessageTranscriptRef = useRef("");
  const typingStopTimeoutRef = useRef(null);
  const pendingIceRef = useRef([]);
  const callRef = useRef(call);
  const contactsRef = useRef(contacts);

  const activeContact = selectedContact || (chatFilter === "groups" ? null : contacts[0]);
  const activeChat = selectedGroup || activeContact;
  const isGroupChat = Boolean(selectedGroup);
  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    const items = chatFilter === "groups" ? groups : contacts;
    return items.filter((contact) => {
      const matchesSearch =
        !query ||
        contact.name?.toLowerCase().includes(query) ||
        contact.emailOrPhone?.toLowerCase().includes(query);
      const matchesFilter =
        chatFilter === "all" ||
        (chatFilter === "unread" && Number(contact.unreadCount || 0) > 0) ||
        (chatFilter === "groups" && contact.type === "group");
      return matchesSearch && matchesFilter;
    });
  }, [contacts, groups, contactSearch, chatFilter]);

  async function loadContacts() {
    if (!user || !authToken) return;
    const { contacts: items } = await getContacts(user.id, authToken);
    const decryptedContacts = items.map((contact) => ({
      ...contact,
      lastMessage: contact.lastMessage
        ? {
            ...contact.lastMessage,
            originalText: decryptMaybe(contact.lastMessage.originalText),
            translatedText: decryptMaybe(contact.lastMessage.translatedText)
          }
        : null
    }));
    setContacts(decryptedContacts);
    setSelectedContact((current) => {
      if (current && decryptedContacts.some((item) => item.id === current.id)) return current;
      return decryptedContacts[0] || null;
    });
  }

  async function loadGroups() {
    if (!user || !authToken) return;
    const { groups: items } = await getGroups(user.id, authToken);
    const decryptedGroups = items.map((group) => ({
      ...group,
      lastMessage: group.lastMessage
        ? {
            ...group.lastMessage,
            originalText: decryptMaybe(group.lastMessage.originalText),
            translatedText: decryptMaybe(group.lastMessage.translatedText)
          }
        : null
    }));
    setGroups(decryptedGroups);
    setSelectedGroup((current) => {
      if (current && decryptedGroups.some((item) => item.id === current.id)) return current;
      return current;
    });
  }

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [call.status, call.type]);

  useEffect(() => {
    if (!user || !authToken) return;

    const socket = io(API_URL, {
      auth: {
        token: authToken,
        userId: user.id
      }
    });
    socketRef.current = socket;
    socket.emit("user:online", { userId: user.id });

    socket.on("contacts:update", () => {
      loadContacts().catch(() => undefined);
    });

    socket.on("groups:update", () => {
      loadGroups().catch(() => undefined);
    });

    socket.on("message:new", (message) => {
      // Decrypt the message texts
      const decryptedMessage = {
        ...message,
        originalText: decryptMaybe(message.originalText),
        translatedText: decryptMaybe(message.translatedText),
        replyPreviewText: decryptMaybe(message.replyPreviewText)
      };

      setMessages((current) => {
        const exists = current.some((item) => item.id === decryptedMessage.id);
        if (exists) return current;
        return [...current, decryptedMessage];
      });
      if (decryptedMessage.groupId) {
        setGroups((current) =>
          current.map((group) => {
            if (decryptedMessage.groupId !== group.id) return group;
            return {
              ...group,
              lastMessage: decryptedMessage,
              unreadCount:
                decryptedMessage.senderId !== user.id && selectedGroup?.id !== group.id
                  ? Number(group.unreadCount || 0) + 1
                  : group.unreadCount || 0
            };
          })
        );
      } else {
        setContacts((current) =>
          current.map((contact) => {
            const belongsToContact =
              decryptedMessage.senderId === contact.id || decryptedMessage.receiverId === contact.id;
            if (!belongsToContact) return contact;

            return {
              ...contact,
              lastMessage: decryptedMessage,
              unreadCount:
                decryptedMessage.senderId === contact.id && decryptedMessage.receiverId === user.id
                  ? Number(contact.unreadCount || 0) + 1
                  : contact.unreadCount || 0
            };
          })
        );
      }

      // Play voice translation if enabled and message is from someone else
      if (message.senderId !== user.id && voiceTranslationEnabled) {
        const textToSpeak = decryptedMessage.translatedText || decryptedMessage.originalText;
        const language = decryptedMessage.targetLanguage || user?.motherTongue || "en";
        try {
          playVoiceTranslation(textToSpeak, language, 1, 1, 0.8);
        } catch (error) {
          console.error("Voice translation failed:", error);
        }
      }

      if (message.senderId !== user.id && canNotify()) {
        new Notification("New WeConnect message", {
          body: decryptedMessage.translatedText || decryptedMessage.originalText
        });
      }
    });

    socket.on("message:status", ({ messageIds, status, readAt, groupId }) => {
      setMessages((current) =>
        current.map((message) =>
          messageIds.includes(message.id)
            ? {
                ...message,
                status,
                readAt
              }
            : message
        )
      );
      setContacts((current) =>
        current.map((contact) => ({
          ...contact,
          unreadCount:
            status === "read" && contact.lastMessage && messageIds.includes(contact.lastMessage.id)
              ? 0
              : contact.unreadCount
        }))
      );
      if (messageIds.length > 0) {
        setGroups((current) =>
          current.map((group) =>
            group.id === groupId ? { ...group, unreadCount: 0 } : group
          )
        );
      }
    });

    socket.on("message:reaction", ({ messageId, reactions }) => {
      setMessages((current) =>
        current.map((message) => (message.id === messageId ? { ...message, reactions: reactions || [] } : message))
      );
    });

    socket.on("message:update", (message) => {
      const decryptedMessage = {
        ...message,
        originalText: decryptMaybe(message.originalText),
        translatedText: decryptMaybe(message.translatedText),
        replyPreviewText: decryptMaybe(message.replyPreviewText)
      };

      setMessages((current) =>
        current.map((item) => (item.id === decryptedMessage.id ? { ...item, ...decryptedMessage } : item))
      );
      if (decryptedMessage.groupId) {
        setGroups((current) =>
          current.map((group) =>
            group.lastMessage?.id === decryptedMessage.id ? { ...group, lastMessage: decryptedMessage } : group
          )
        );
      } else {
        setContacts((current) =>
          current.map((contact) =>
            contact.lastMessage?.id === decryptedMessage.id ? { ...contact, lastMessage: decryptedMessage } : contact
          )
        );
      }
    });

    socket.on("typing", ({ senderId, groupId, isTyping }) => {
      setTypingContactId(isTyping ? groupId || senderId : "");
    });

    socket.on("call:incoming", ({ callId, type, senderId, senderName }) => {
      const contact = contactsRef.current.find((item) => item.id === senderId) || {
        id: senderId,
        name: senderName || "Contact",
        motherTongue: "en",
        avatar: senderName?.charAt(0)?.toUpperCase() || "C"
      };
      setCall({
        status: "incoming",
        type: type || "voice",
        contact,
        callId,
        muted: false,
        cameraOff: false,
        localCaption: null,
        remoteCaption: null
      });
      if (canNotify()) {
        new Notification("Incoming WeConnect call", {
          body: `${senderName || "Contact"} is calling`
        });
      }
    });

    socket.on("call:accepted", async ({ callId }) => {
      if (callRef.current.callId !== callId || !peerRef.current || !callRef.current.contact) return;
      setCall((current) => ({ ...current, status: "active" }));
      const offer = await peerRef.current.createOffer();
      await peerRef.current.setLocalDescription(offer);
      socket.emit("call:offer", {
        callId,
        receiverId: callRef.current.contact.id,
        description: offer
      });
      startSpeechCaptions();
    });

    socket.on("call:rejected", ({ callId }) => {
      if (callRef.current.callId === callId) {
        cleanupCall();
        setError("Call declined.");
      }
    });

    socket.on("call:ended", ({ callId }) => {
      if (callRef.current.callId === callId) {
        cleanupCall();
      }
    });

    socket.on("call:offer", async ({ callId, senderId, description }) => {
      if (callRef.current.callId !== callId) return;
      await ensurePeer(senderId, callRef.current.type);
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(description));
      await flushPendingIce();
      const answer = await peerRef.current.createAnswer();
      await peerRef.current.setLocalDescription(answer);
      socket.emit("call:answer", {
        callId,
        receiverId: senderId,
        description: answer
      });
      setCall((current) => ({ ...current, status: "active" }));
      startSpeechCaptions();
    });

    socket.on("call:answer", async ({ callId, description }) => {
      if (callRef.current.callId !== callId || !peerRef.current) return;
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(description));
      await flushPendingIce();
    });

    socket.on("call:ice", async ({ callId, candidate }) => {
      if (callRef.current.callId !== callId || !candidate) return;
      const iceCandidate = new RTCIceCandidate(candidate);
      if (!peerRef.current?.remoteDescription) {
        pendingIceRef.current.push(iceCandidate);
        return;
      }
      await peerRef.current.addIceCandidate(iceCandidate);
    });

    socket.on("call:caption", ({ callId, originalText, translatedText, sourceLanguage, targetLanguage, senderName }) => {
      if (callRef.current.callId !== callId) return;
      setCall((current) => ({
        ...current,
        remoteCaption: { originalText, translatedText, sourceLanguage, targetLanguage, speakerName: senderName }
      }));
    });

    return () => socket.disconnect();
  }, [user, authToken]);

  useEffect(() => {
    if (!user || !authToken) return;

    loadContacts()
      .catch(() => setError("Contacts load nahi ho paaye."));
    loadGroups()
      .catch(() => setError("Groups load nahi ho paaye."));
  }, [user, authToken]);

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name,
        emailOrPhone: user.emailOrPhone,
        motherTongue: user.motherTongue
      });
    }
  }, [user]);

  useEffect(() => {
    if (!user || !activeChat || !authToken) return;
    setReplyingTo(null);
    setEditingMessage(null);
    setOpenMessageMenuId("");

    const loadConversation = isGroupChat
      ? getGroupConversation(user.id, activeChat.id, authToken)
      : getConversation(user.id, activeChat.id, authToken);

    loadConversation
      .then(({ messages: items }) => {
        // Decrypt stored messages
        const decryptedMessages = items.map(message => ({
          ...message,
          originalText: decryptMaybe(message.originalText),
          translatedText: decryptMaybe(message.translatedText),
          replyPreviewText: decryptMaybe(message.replyPreviewText)
        }));
        setMessages(decryptedMessages);
      })
      .catch(() => setError("Conversation load nahi ho paayi."));
  }, [user, activeChat?.id, isGroupChat, authToken]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const visibleMessages = useMemo(() => {
    if (!user || !activeChat) return [];
    if (isGroupChat) {
      return messages.filter((message) => message.groupId === activeChat.id);
    }
    return messages.filter((message) => {
      const sent = message.senderId === user.id && message.receiverId === activeChat.id;
      const received = message.senderId === activeChat.id && message.receiverId === user.id;
      return sent || received;
    });
  }, [messages, user, activeChat, isGroupChat]);

  function messageTextForUser(message) {
    if (!message) return "";
    return message.senderId === user?.id ? message.originalText : message.translatedText || message.originalText;
  }

  function beginReply(message) {
    setEditingMessage(null);
    setOpenMessageMenuId("");
    setReplyingTo({
      id: message.id,
      text: messageTextForUser(message)
    });
  }

  function beginEdit(message) {
    setReplyingTo(null);
    setOpenMessageMenuId("");
    setEditingMessage({
      id: message.id,
      text: message.originalText
    });
    setMessageText(message.originalText);
  }

  function cancelEdit() {
    setEditingMessage(null);
    setMessageText("");
  }

  function reactToMessage(message, emoji) {
    if (!socketRef.current) return;
    setOpenMessageMenuId("");
    const existingReaction = (message.reactions || []).find((reaction) => reaction.userId === user?.id);
    socketRef.current.emit(isGroupChat ? "group:message:react" : "message:react", {
      groupId: isGroupChat ? activeChat.id : undefined,
      messageId: message.id,
      emoji: existingReaction?.emoji === emoji ? "" : emoji
    });
  }

  useEffect(() => {
    if (!user || !activeChat || !socketRef.current) return;
    const unreadReceived = isGroupChat
      ? visibleMessages.some((message) => message.senderId !== user.id && message.status !== "read")
      : visibleMessages.some(
          (message) => message.senderId === activeChat.id && message.receiverId === user.id && message.status !== "read"
        );
    if (unreadReceived) {
      if (isGroupChat) {
        socketRef.current.emit("group:read", { groupId: activeChat.id });
        setGroups((current) =>
          current.map((group) => (group.id === activeChat.id ? { ...group, unreadCount: 0 } : group))
        );
      } else {
        socketRef.current.emit("message:read", { contactId: activeChat.id });
        setContacts((current) =>
          current.map((contact) => (contact.id === activeChat.id ? { ...contact, unreadCount: 0 } : contact))
        );
      }
    }
  }, [visibleMessages, user, activeChat, isGroupChat]);

  async function handleRegister(event) {
    event.preventDefault();
    setError("");
    setIsSendingOtp(true);

    try {
      if (!form.emailOrPhone.trim()) {
        throw new Error("Missing phone number");
      }

      if (!isFirebaseConfigured || !firebaseAuth) {
        setConfirmationResult({ demo: true });
        setOtp("");
        setStep("verify");
        return;
      }

      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(firebaseAuth, "recaptcha-container", {
          size: "invisible"
        });
      }

      const result = await signInWithPhoneNumber(firebaseAuth, form.emailOrPhone.trim(), recaptchaVerifierRef.current);
      setConfirmationResult(result);
      setOtp("");
      setStep("verify");
    } catch (caughtError) {
      console.error("OTP send failed:", caughtError);
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
      setError(
        caughtError.message === "Missing phone number"
          ? "Phone number required hai."
          : "OTP send nahi ho paaya. Phone number +91 format me hona chahiye aur Firebase Phone Auth enabled hona chahiye."
      );
    } finally {
      setIsSendingOtp(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    setError("");
    setIsVerifyingOtp(true);

    try {
      if (!confirmationResult) {
        throw new Error("Missing confirmation");
      }

      const verificationCode = otp.trim();
      if (!verificationCode || verificationCode.length < 4) {
        throw new Error("Invalid verification code");
      }

      let phoneNumber = form.emailOrPhone;
      let token = "";

      if (confirmationResult.demo) {
        const demoResult = await verifyOtp(verificationCode, form.emailOrPhone.trim());
        if (!demoResult.verified || !demoResult.token) {
          throw new Error("Invalid verification code");
        }
        token = demoResult.token;
      } else {
        const firebaseCredential = await confirmationResult.confirm(verificationCode);
        token = await firebaseCredential.user.getIdToken();
        phoneNumber = firebaseCredential.user.phoneNumber || form.emailOrPhone;
      }

      setAuthToken(token);
      setForm((current) => ({ ...current, emailOrPhone: phoneNumber }));
      setStep("profile");
    } catch (caughtError) {
      console.error("OTP verify failed:", caughtError);
      const message =
        caughtError.code === "auth/invalid-verification-code"
          ? "OTP invalid hai. Firebase test number ke saath wahi code daalein jo console me dikha hai."
          : confirmationResult.demo
            ? "Demo OTP verify nahi hua. server/.env me ENABLE_DEMO_OTP=true rakho aur code 123456 use karo."
          : "OTP verify nahi hua. SMS wala code dobara check karo.";
      setError(message);
    } finally {
      setIsVerifyingOtp(false);
    }
  }

  async function handleCompleteProfile(event) {
    event.preventDefault();
    setError("");

    if (!authToken) {
      setError("OTP verify pehle complete karein.");
      setStep("phone");
      return;
    }

    if (!form.name.trim()) {
      setError("Profile ke liye naam required hai.");
      return;
    }

    try {
      const result = await registerUser({
        name: form.name.trim(),
        emailOrPhone: form.emailOrPhone,
        motherTongue: form.motherTongue
      }, authToken);
      setUser(result.user);
      setProfileForm(result.user);
      saveStoredSession({ authToken, user: result.user });
      setStep("chat");
    } catch (caughtError) {
      console.error("Profile setup failed:", caughtError);
      setError("Profile save nahi ho paaya.");
    }
  }

  function handleLogout() {
    clearStoredSession();
    socketRef.current?.disconnect();
    stopVoicePlayback();
    mediaRecorderRef.current?.stop?.();
    stopVoiceMessageTranscription();
    cleanupCall();
    setUser(null);
    setAuthToken("");
    setContacts([]);
    setGroups([]);
    setSelectedContact(null);
    setSelectedGroup(null);
    setMessages([]);
    setMessageText("");
    setReplyingTo(null);
    setEditingMessage(null);
    setOpenMessageMenuId("");
    setOtp("");
    setConfirmationResult(null);
    setProfileForm(demoUser);
    setForm(demoUser);
    setStep("phone");
  }

  function sendMessage(event) {
    event.preventDefault();
    if (!messageText.trim() || !user || !activeChat) return;

    socketRef.current?.emit("typing", {
      receiverId: isGroupChat ? undefined : activeChat.id,
      groupId: isGroupChat ? activeChat.id : undefined,
      isTyping: false
    });

    if (editingMessage) {
      socketRef.current?.emit(isGroupChat ? "group:message:edit" : "message:edit", {
        groupId: isGroupChat ? activeChat.id : undefined,
        messageId: editingMessage.id,
        text: encryptMessage(messageText)
      });
      setMessageText("");
      setEditingMessage(null);
      return;
    }

    socketRef.current?.emit(isGroupChat ? "group:message:send" : "message:send", {
      receiverId: isGroupChat ? undefined : activeChat.id,
      groupId: isGroupChat ? activeChat.id : undefined,
      text: encryptMessage(messageText),
      replyToMessageId: replyingTo?.id,
      replyPreviewText: replyingTo?.text ? encryptMessage(replyingTo.text) : undefined
    });
    setMessageText("");
    setReplyingTo(null);
  }

  function updateMessageDraft(value) {
    setMessageText(value);
    if (!activeChat || !socketRef.current) return;

    socketRef.current.emit("typing", {
      receiverId: isGroupChat ? undefined : activeChat.id,
      groupId: isGroupChat ? activeChat.id : undefined,
      isTyping: Boolean(value.trim())
    });

    window.clearTimeout(typingStopTimeoutRef.current);
    typingStopTimeoutRef.current = window.setTimeout(() => {
      socketRef.current?.emit("typing", {
        receiverId: isGroupChat ? undefined : activeChat.id,
        groupId: isGroupChat ? activeChat.id : undefined,
        isTyping: false
      });
    }, 1200);
  }

  async function sendMediaMessage(file, forcedType, transcript = "") {
    if (!user || !authToken || !activeChat || !file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      const { upload } = await uploadLocalMedia(user.id, { dataUrl, name: file.name }, authToken);
      const messageType = forcedType || mediaKind(file);
      const messageTextForTranslation =
        messageType === "audio" ? transcript.trim() || "Voice message" : file.name;
      socketRef.current?.emit(isGroupChat ? "group:message:send" : "message:send", {
        receiverId: isGroupChat ? undefined : activeChat.id,
        groupId: isGroupChat ? activeChat.id : undefined,
        text: encryptMessage(messageTextForTranslation),
        messageType,
        mediaUrl: upload.url,
        mediaName: upload.name,
        mediaMime: upload.mimeType,
        replyToMessageId: replyingTo?.id,
        replyPreviewText: replyingTo?.text ? encryptMessage(replyingTo.text) : undefined
      });
      setReplyingTo(null);
    } catch (caughtError) {
      console.error("Media upload failed:", caughtError);
      setError("Media upload nahi ho paaya.");
    }
  }

  async function handleAttachment(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await sendMediaMessage(file);
  }

  function startVoiceMessageTranscription() {
    const Recognition = speechRecognitionConstructor();
    voiceMessageTranscriptRef.current = "";

    if (!Recognition) {
      setError("Voice record ho raha hai. Browser speech transcript support nahi karta.");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechLocale(user?.motherTongue || "en");

    recognition.onresult = (event) => {
      const transcriptParts = [];
      for (let index = 0; index < event.results.length; index += 1) {
        transcriptParts.push(event.results[index][0].transcript.trim());
      }
      voiceMessageTranscriptRef.current = transcriptParts.join(" ").replace(/\s+/g, " ").trim();
    };

    recognition.onerror = () => {
      voiceMessageRecognitionRef.current = null;
    };

    recognition.onend = () => {
      if (voiceMessageRecognitionRef.current === recognition && isVoiceMessageRecordingRef.current) {
        recognition.start();
      }
    };

    voiceMessageRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      voiceMessageRecognitionRef.current = null;
    }
  }

  function stopVoiceMessageTranscription() {
    const recognition = voiceMessageRecognitionRef.current;
    voiceMessageRecognitionRef.current = null;
    isVoiceMessageRecordingRef.current = false;
    recognition?.stop?.();
    return voiceMessageTranscriptRef.current.trim();
  }

  async function stopVoiceRecording() {
    mediaRecorderRef.current?.stop();
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Browser audio recording supported nahi hai.");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recordedVoiceChunksRef.current = [];
    isVoiceMessageRecordingRef.current = true;
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedVoiceChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      setIsRecordingVoiceMessage(false);
      const transcript = stopVoiceMessageTranscription();
      const blob = new Blob(recordedVoiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      recordedVoiceChunksRef.current = [];
      mediaRecorderRef.current = null;
      if (blob.size === 0) return;
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
      await sendMediaMessage(file, "audio", transcript);
    };
    recorder.onerror = () => {
      stream.getTracks().forEach((track) => track.stop());
      setIsRecordingVoiceMessage(false);
      stopVoiceMessageTranscription();
      mediaRecorderRef.current = null;
      setError("Voice message record nahi ho paaya.");
    };

    recorder.start();
    startVoiceMessageTranscription();
    setIsRecordingVoiceMessage(true);
  }

  function toggleVoiceMessageRecording() {
    if (isRecordingVoiceMessage) {
      stopVoiceRecording();
      return;
    }

    startVoiceRecording().catch((caughtError) => {
      console.error("Voice recording failed:", caughtError);
      setIsRecordingVoiceMessage(false);
      setError("Microphone permission nahi mili.");
    });
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    if (!user || !authToken) return;

    try {
      const result = await updateUser(user.id, {
        name: profileForm.name,
        motherTongue: profileForm.motherTongue
      }, authToken);
      setUser(result.user);
      saveStoredSession({ authToken, user: result.user });
      setError("Profile updated.");
    } catch {
      setError("Profile update nahi ho paaya.");
    }
  }

  async function handleAddContact(event) {
    event.preventDefault();
    if (!user || !authToken || !addContactText.trim()) return;

    setInviteInfo(null);
    try {
      const result = await addContact(user.id, { emailOrPhone: addContactText.trim() }, authToken);
      setContacts((current) => {
        if (current.some((contact) => contact.id === result.contact.id)) return current;
        return [...current, result.contact].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedContact(result.contact);
      setAddContactText("");
      setError("Contact added.");
    } catch (caughtError) {
      if (caughtError.invite) {
        setInviteInfo(caughtError.invite);
        setError("User app mein registered nahi hai. Invite link ready hai.");
        return;
      }
      setError("Contact add nahi ho paaya.");
    }
  }

  async function handleCreateGroup(event) {
    event.preventDefault();
    if (!user || !authToken || !groupName.trim() || groupMemberIds.length === 0) return;

    try {
      const result = await createGroup(user.id, {
        name: groupName.trim(),
        memberIds: groupMemberIds
      }, authToken);
      setGroups((current) => [result.group, ...current.filter((group) => group.id !== result.group.id)]);
      setSelectedGroup(result.group);
      setSelectedContact(null);
      setChatFilter("groups");
      setGroupName("");
      setGroupMemberIds([]);
      setError("Group created.");
    } catch {
      setError("Group create nahi ho paaya.");
    }
  }

  function toggleGroupMember(contactId) {
    setGroupMemberIds((current) =>
      current.includes(contactId) ? current.filter((id) => id !== contactId) : [...current, contactId]
    );
  }

  async function copyInvite() {
    if (!inviteInfo) return;
    await navigator.clipboard?.writeText(inviteInfo.message);
    setError("Invite message copied.");
  }

  async function shareInvite() {
    if (!inviteInfo) return;
    if (navigator.share) {
      await navigator.share({ text: inviteInfo.message, url: inviteInfo.link });
      return;
    }
    await copyInvite();
  }

  async function handleDeleteChat() {
    if (!user || !activeContact || !authToken) return;

    try {
      await deleteConversation(user.id, activeContact.id, authToken);
      setMessages((current) =>
        current.filter((message) => {
          const sent = message.senderId === user.id && message.receiverId === activeContact.id;
          const received = message.senderId === activeContact.id && message.receiverId === user.id;
          return !(sent || received);
        })
      );
      setContacts((current) =>
        current.map((contact) =>
          contact.id === activeContact.id
            ? {
                ...contact,
                lastMessage: null,
                unreadCount: 0
              }
            : contact
        )
      );
      setError("Chat deleted for you.");
    } catch {
      setError("Chat delete nahi ho paayi.");
    }
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setError("Browser notifications supported nahi hain.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
    setError(permission === "granted" ? "Notifications enabled." : "Notifications allow nahi hui.");
  }

  async function getLocalMedia(type) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video"
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }

  async function ensurePeer(receiverId, type) {
    if (peerRef.current) return peerRef.current;

    const stream = localStreamRef.current || await getLocalMedia(type);
    const peer = new RTCPeerConnection(rtcConfig);
    peerRef.current = peer;
    remoteStreamRef.current = new MediaStream();

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => remoteStreamRef.current.addTrack(track));
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
    };

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      socketRef.current?.emit("call:ice", {
        callId: callRef.current.callId,
        receiverId,
        candidate: event.candidate
      });
    };

    peer.onconnectionstatechange = () => {
      if (["closed", "disconnected", "failed"].includes(peer.connectionState)) {
        cleanupCall(false);
      }
    };

    return peer;
  }

  async function flushPendingIce() {
    if (!peerRef.current?.remoteDescription) return;
    const candidates = pendingIceRef.current.splice(0);
    await Promise.all(candidates.map((candidate) => peerRef.current.addIceCandidate(candidate)));
  }

  async function startCall(type) {
    if (!user || !activeContact || !socketRef.current) return;

    try {
      const callId = createCallId();
      setCall({
        status: "outgoing",
        type,
        contact: activeContact,
        callId,
        muted: false,
        cameraOff: false,
        localCaption: null,
        remoteCaption: null
      });
      await getLocalMedia(type);
      await ensurePeer(activeContact.id, type);
      socketRef.current.emit("call:invite", {
        callId,
        type,
        receiverId: activeContact.id
      });
    } catch (caughtError) {
      cleanupCall(false);
      setError(caughtError.message || "Camera/microphone permission nahi mili.");
    }
  }

  async function acceptCall() {
    if (!call.contact || !socketRef.current) return;

    try {
      await getLocalMedia(call.type);
      await ensurePeer(call.contact.id, call.type);
      socketRef.current.emit("call:accept", {
        callId: call.callId,
        receiverId: call.contact.id
      });
      setCall((current) => ({ ...current, status: "connecting" }));
    } catch (caughtError) {
      setError(caughtError.message || "Camera/microphone permission nahi mili.");
      rejectCall();
    }
  }

  function rejectCall() {
    if (call.contact && socketRef.current) {
      socketRef.current.emit("call:reject", {
        callId: call.callId,
        receiverId: call.contact.id
      });
    }
    cleanupCall(false);
  }

  function endCall(notify = true) {
    if (notify && callRef.current.contact && socketRef.current) {
      socketRef.current.emit("call:end", {
        callId: callRef.current.callId,
        receiverId: callRef.current.contact.id
      });
    }
    cleanupCall(false);
  }

  function cleanupCall(resetError = true) {
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    pendingIceRef.current = [];
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (resetError) setError("");
    setCall({
      status: "idle",
      type: "voice",
      contact: null,
      callId: "",
      muted: false,
      cameraOff: false,
      localCaption: null,
      remoteCaption: null
    });
  }

  function toggleMute() {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = call.muted;
    });
    setCall((current) => ({ ...current, muted: !current.muted }));
  }

  function toggleCamera() {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = call.cameraOff;
    });
    setCall((current) => ({ ...current, cameraOff: !current.cameraOff }));
  }

  function startSpeechCaptions() {
    const Recognition = speechRecognitionConstructor();
    if (!Recognition || recognitionRef.current || !callRef.current.contact) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechLocale(user.motherTongue);

    recognition.onresult = async (event) => {
      const result = event.results[event.results.length - 1];
      const originalText = result?.[0]?.transcript?.trim();
      if (!originalText) return;

      if (!result.isFinal) {
        setCall((current) => ({
          ...current,
          localCaption: {
            originalText,
            translatedText: current.localCaption?.translatedText || "Translating...",
            sourceLanguage: user.motherTongue,
            targetLanguage: callRef.current.contact.motherTongue,
            isInterim: true,
            speakerName: user.name
          }
        }));
        return;
      }

      try {
        const translated = await translateCaption({
          text: originalText,
          fromLanguage: user.motherTongue,
          toLanguage: callRef.current.contact.motherTongue
        }, authToken);

        const caption = {
          ...translated,
          isInterim: false,
          speakerName: user.name
        };
        setCall((current) => ({ ...current, localCaption: caption }));
        socketRef.current?.emit("call:caption", {
          callId: callRef.current.callId,
          receiverId: callRef.current.contact.id,
          ...caption
        });
      } catch {
        const fallbackCaption = {
          originalText,
          translatedText: originalText,
          sourceLanguage: user.motherTongue,
          targetLanguage: callRef.current.contact.motherTongue,
          isInterim: false,
          speakerName: user.name
        };
        setCall((current) => ({ ...current, localCaption: fallbackCaption }));
        socketRef.current?.emit("call:caption", {
          callId: callRef.current.callId,
          receiverId: callRef.current.contact.id,
          ...fallbackCaption
        });
      }
    };

    recognition.onend = () => {
      if (callRef.current.status === "active" && recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          recognitionRef.current = null;
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
    }
  }

  if (step !== "chat") {
    return (
      <main className="auth-shell">
        <section className="auth-stage">
          <div className="brand-row auth-brand">
            <div className="brand-mark">
              <Languages size={26} />
            </div>
            <div>
              <p className="eyebrow">WeConnect</p>
              <h1>Sign in with your phone number.</h1>
            </div>
          </div>

          <div className="workflow-strip auth-workflow">
            <WorkflowItem icon={<Phone />} label="Phone" active={step === "phone"} />
            <WorkflowItem icon={<BadgeCheck />} label="Verify OTP" active={step === "verify"} />
            <WorkflowItem icon={<UserRound />} label="Profile" active={step === "profile"} />
            <WorkflowItem icon={<Languages />} label="My Language" active={step === "profile"} />
            <WorkflowItem icon={<CheckCheck />} label="Chats" />
          </div>

          {step === "phone" && (
            <form className="auth-card auth-card-centered" onSubmit={handleRegister}>
              <h2>Enter phone number</h2>
              <p className="muted">We will send an OTP to verify your number.</p>
              <label>
                Phone number
                <input
                  placeholder="+91 98765 43210"
                  value={form.emailOrPhone}
                  onChange={(event) => setForm({ ...form, emailOrPhone: event.target.value })}
                />
              </label>
              <div id="recaptcha-container" />
              <button className="primary-button" type="submit" disabled={isSendingOtp}>
                {isSendingOtp ? "Sending OTP..." : "Send OTP"}
              </button>
            </form>
          )}

          {step === "verify" && (
            <form className="auth-card auth-card-centered compact" onSubmit={handleVerify}>
              <Shield className="hero-icon" size={44} />
              <h2>Verify your number</h2>
              <p className="muted">
                {confirmationResult?.demo
                  ? `Local demo mode me ${form.emailOrPhone} ke liye OTP 123456 use karein.`
                  : `Firebase ne ${form.emailOrPhone} par SMS OTP send kiya hai.`}
              </p>
              <input
                className="otp-input"
                inputMode="numeric"
                placeholder="123456"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                maxLength={6}
              />
              <button className="primary-button" type="submit" disabled={isVerifyingOtp || otp.length < 6}>
                {isVerifyingOtp ? "Verifying..." : "Verify"}
              </button>
              <button className="text-button" type="button" onClick={() => setStep("phone")}>
                Change phone number
              </button>
            </form>
          )}

          {step === "profile" && (
            <form className="auth-card auth-card-centered" onSubmit={handleCompleteProfile}>
              <h2>Create profile</h2>
              <p className="muted">This is how people will see you in chats.</p>
              <label>
                Name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label>
                My Language
                <select
                  value={form.motherTongue}
                  onChange={(event) => setForm({ ...form, motherTongue: event.target.value })}
                >
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button" type="submit">Open chats</button>
            </form>
          )}

          {error && <p className="toast auth-toast">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="chat-panel">
        <aside className="contact-list">
          <div className="toolbar">
            <h2>LinguaChat</h2>
            <button className="mini-icon" type="button" title="Enable notifications" onClick={requestNotifications}>
              {notificationsEnabled ? <Bell size={18} /> : <Bell size={18} />}
            </button>
          </div>
          {user && (
            <form className="mini-form" onSubmit={handleSaveProfile}>
              <div className="mini-title">
                <Settings size={15} />
                <strong>Profile</strong>
              </div>
              <input value={profileForm.name || ""} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} />
              <input disabled value={profileForm.emailOrPhone || ""} title="Registered phone cannot be changed" />
              <label className="mini-field">
                My Language
                <select value={profileForm.motherTongue || "hi"} onChange={(event) => setProfileForm({ ...profileForm, motherTongue: event.target.value })}>
                  {languages.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
                </select>
              </label>
              <button className="secondary-button" type="submit">Save profile</button>
              <button className="secondary-button ghost-button" type="button" onClick={handleLogout}>Log out</button>
            </form>
          )}
          {user && (
            <form className="mini-form" onSubmit={handleAddContact}>
              <div className="mini-title">
                <Plus size={15} />
                <strong>Add contact</strong>
              </div>
              <input
                placeholder="+91 98765 43210"
                value={addContactText}
                onChange={(event) => setAddContactText(event.target.value)}
              />
              <button className="secondary-button" type="submit">Add or invite</button>
              {inviteInfo && (
                <div className="invite-box">
                  <small>{inviteInfo.phone} is not on WeConnect.</small>
                  <button type="button" onClick={copyInvite}>Copy invite</button>
                  <button type="button" onClick={shareInvite}>Share</button>
                </div>
              )}
            </form>
          )}
          <div className="search-box">
            <Search size={17} />
            <input
              placeholder="Search"
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
            />
          </div>
          <div className="chat-tabs" role="tablist" aria-label="Chat filters">
            <button
              className={chatFilter === "all" ? "active" : ""}
              type="button"
              onClick={() => {
                setChatFilter("all");
                setSelectedGroup(null);
              }}
            >
              All
            </button>
            <button
              className={chatFilter === "unread" ? "active" : ""}
              type="button"
              onClick={() => {
                setChatFilter("unread");
                setSelectedGroup(null);
              }}
            >
              Unread
            </button>
            <button
              className={chatFilter === "groups" ? "active" : ""}
              type="button"
              onClick={() => {
                setChatFilter("groups");
                setSelectedContact(null);
              }}
            >
              Groups
            </button>
          </div>
          {user && chatFilter === "groups" && (
            <form className="mini-form" onSubmit={handleCreateGroup}>
              <div className="mini-title">
                <UsersRound size={15} />
                <strong>New group</strong>
              </div>
              <input
                placeholder="Group name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              />
              <div className="member-picker">
                {contacts.map((contact) => (
                  <label key={contact.id}>
                    <input
                      type="checkbox"
                      checked={groupMemberIds.includes(contact.id)}
                      onChange={() => toggleGroupMember(contact.id)}
                    />
                    <span>{contact.name}</span>
                  </label>
                ))}
              </div>
              <button className="secondary-button" type="submit" disabled={!groupName.trim() || groupMemberIds.length === 0}>
                Create group
              </button>
            </form>
          )}
          {chatFilter === "groups" && filteredContacts.length === 0 && (
            <div className="empty-list">
              <UsersRound size={22} />
              <p>No groups yet.</p>
            </div>
          )}
          {chatFilter !== "groups" && filteredContacts.length === 0 && (
            <div className="empty-list">
              <Search size={22} />
              <p>No matching chats.</p>
            </div>
          )}
          {filteredContacts.map((contact) => (
            <button
              className={`contact-row ${activeChat?.id === contact.id ? "selected" : ""}`}
              key={contact.id}
              type="button"
              onClick={() => {
                if (contact.type === "group") {
                  setSelectedGroup(contact);
                  setSelectedContact(null);
                } else {
                  setSelectedContact(contact);
                  setSelectedGroup(null);
                }
              }}
            >
              <span className="avatar">{contact.avatar}</span>
              <span>
                <strong>{contact.name}</strong>
                <small>
                  {contact.lastMessage
                    ? contact.lastMessage.senderId === user?.id
                      ? `You: ${contact.lastMessage.originalText}`
                      : contact.lastMessage.translatedText
                    : contact.type === "group"
                      ? "Group chat"
                      : `${contact.online ? "Online" : "Offline"} · ${languageName[contact.motherTongue]}`}
                </small>
              </span>
              {Number(contact.unreadCount || 0) > 0 ? (
                <b className="unread-count">{contact.unreadCount}</b>
              ) : (
                <i className={contact.online ? "online" : ""} />
              )}
            </button>
          ))}
        </aside>

        <section className="conversation">
          <header className="conversation-header">
            <div>
              <strong>{activeChat?.name || "Select chat"}</strong>
              <span>
                {activeChat && typingContactId === activeChat.id
                  ? `${activeChat.name} has typing activity...`
                  : activeChat
                    ? isGroupChat
                      ? "Group chat"
                      : `${languageName[activeChat.motherTongue]} preferred`
                    : "No chat selected"}
              </span>
            </div>
            <div className="icon-actions">
              <button
                disabled={!user}
                className={voiceTranslationEnabled ? "active" : ""}
                title="Read translated incoming messages aloud"
                type="button"
                onClick={() => {
                  if (voiceTranslationEnabled) stopVoicePlayback();
                  setVoiceTranslationEnabled((current) => !current);
                }}
              >
                <Volume2 size={18} />
              </button>
              <button disabled={!user || !activeContact || isGroupChat} title="Delete chat for me" type="button" onClick={handleDeleteChat}>
                <Trash2 size={18} />
              </button>
              <button disabled={!user || !activeContact || isGroupChat || call.status !== "idle"} title="Voice call" type="button" onClick={() => startCall("voice")}>
                <Phone size={18} />
              </button>
              <button disabled={!user || !activeContact || isGroupChat || call.status !== "idle"} title="Video call" type="button" onClick={() => startCall("video")}>
                <Video size={18} />
              </button>
            </div>
          </header>

          <div className="message-area">
            {visibleMessages.length === 0 && (
              <div className="empty-state">
                <Languages size={34} />
                <p>Message bhejo, receiver ko apni language mein translated text dikhega.</p>
              </div>
            )}

            {visibleMessages.map((message) => {
              const mine = message.senderId === user?.id;
              const textToShow = messageTextForUser(message);
              const myReaction = (message.reactions || []).find((reaction) => reaction.userId === user?.id);
              const menuOpen = openMessageMenuId === message.id;

              return (
                <article className={`message ${mine ? "mine" : "theirs"}`} key={message.id}>
                  <button
                    className="message-menu-trigger"
                    type="button"
                    title="Message options"
                    aria-expanded={menuOpen}
                    onClick={() => setOpenMessageMenuId((current) => (current === message.id ? "" : message.id))}
                  >
                    <MoreVertical size={16} />
                  </button>
                  {menuOpen && (
                    <div className="message-menu">
                      <button type="button" onClick={() => beginReply(message)}>
                        <Reply size={15} />
                        <span>Reply</span>
                      </button>
                      {mine && (
                        <button type="button" onClick={() => beginEdit(message)}>
                          <Pencil size={15} />
                          <span>Edit</span>
                        </button>
                      )}
                      <div className="message-reaction-menu" aria-label="Reactions">
                        {["👍", "❤️", "😂"].map((emoji) => (
                          <button
                            className={myReaction?.emoji === emoji ? "selected" : ""}
                            key={emoji}
                            type="button"
                            title={`React ${emoji}`}
                            onClick={() => reactToMessage(message, emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {message.replyPreviewText && (
                    <div className="reply-preview">
                      <Reply size={13} />
                      <span>{message.replyPreviewText}</span>
                    </div>
                  )}
                  <p className="message-main">{textToShow}</p>
                  <MessageMedia message={message} />
                  {message.reactions?.length > 0 && (
                    <div className="reaction-strip">
                      {message.reactions.map((reaction) => (
                        <span key={`${reaction.userId}:${reaction.emoji}`}>{reaction.emoji}</span>
                      ))}
                    </div>
                  )}
                  {(message.editedAt || mine) && (
                    <small className="message-status">
                      {message.editedAt ? "Edited" : ""}
                      {mine ? `${message.editedAt ? " · " : ""}${message.status === "read" ? "Read" : "Delivered"}` : ""}
                    </small>
                  )}
                </article>
              );
            })}
            <div ref={messageEndRef} />
          </div>

          <form className="composer" onSubmit={sendMessage}>
            {editingMessage && (
              <div className="composer-reply">
                <Pencil size={15} />
                <span>{editingMessage.text}</span>
                <button type="button" title="Cancel edit" onClick={cancelEdit}>
                  <X size={15} />
                </button>
              </div>
            )}
            {replyingTo && (
              <div className="composer-reply">
                <Reply size={15} />
                <span>{replyingTo.text}</span>
                <button type="button" title="Cancel reply" onClick={() => setReplyingTo(null)}>
                  <X size={15} />
                </button>
              </div>
            )}
            <input ref={fileInputRef} hidden type="file" onChange={handleAttachment} />
            <button
              disabled={!user || !activeChat}
              type="button"
              title="Attach file"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={19} />
            </button>
            <button
              className={isRecordingVoiceMessage ? "active danger-soft" : ""}
              disabled={!user || !activeChat}
              type="button"
              title={isRecordingVoiceMessage ? "Stop voice message" : "Voice message"}
              onClick={toggleVoiceMessageRecording}
            >
              <Mic size={19} />
            </button>
            <input
              disabled={!user || !activeChat}
              placeholder={isRecordingVoiceMessage ? "Listening..." : "Type a message..."}
              value={messageText}
              onChange={(event) => updateMessageDraft(event.target.value)}
            />
            <button className="send-button" type="submit" title="Send">
              <Send size={19} />
            </button>
          </form>
        </section>

        <aside className="call-panel">
          <CallPanel
            call={call}
            activeContact={activeContact}
            localVideoRef={localVideoRef}
            remoteVideoRef={remoteVideoRef}
            onAccept={acceptCall}
            onReject={rejectCall}
            onStartCall={startCall}
            onEndCall={endCall}
            onToggleMute={toggleMute}
            onToggleCamera={toggleCamera}
          />

          <div className="translation-card">
            <h3>Live Translation</h3>
            <CaptionBlock title="You said" caption={call.localCaption} />
            <CaptionBlock title={`${call.contact?.name || "Contact"} said`} caption={call.remoteCaption} />
          </div>
        </aside>
      </section>
    </main>
  );
}

function CallPanel({
  call,
  activeContact,
  localVideoRef,
  remoteVideoRef,
  onAccept,
  onReject,
  onStartCall,
  onEndCall,
  onToggleMute,
  onToggleCamera
}) {
  const contact = call.contact || activeContact;
  const inCall = ["outgoing", "incoming", "connecting", "active"].includes(call.status);

  return (
    <div className="call-preview">
      <div className={`video-stage ${call.type === "video" && inCall ? "video-on" : ""}`}>
        <video ref={remoteVideoRef} autoPlay playsInline />
        <video ref={localVideoRef} autoPlay muted playsInline />
        {call.type !== "video" && <span className="avatar large">{contact?.avatar || "C"}</span>}
        {call.type === "video" && inCall && call.remoteCaption?.translatedText && (
          <div className="video-subtitle">
            <span>{call.remoteCaption.speakerName || contact?.name || "Contact"}</span>
            <strong>{call.remoteCaption.translatedText}</strong>
            {call.remoteCaption.originalText && <small>{call.remoteCaption.originalText}</small>}
          </div>
        )}
      </div>

      <h3>{call.type === "video" ? "Video Call" : "Voice Call"}</h3>
      <p>{call.status === "idle" ? "Start a secure WebRTC call with translated live captions." : `${call.status} with ${contact?.name || "contact"}`}</p>

      {call.status === "incoming" ? (
        <div className="call-actions">
          <button type="button" onClick={onAccept} title="Accept call">
            <Phone size={18} />
          </button>
          <button className="danger" type="button" onClick={onReject} title="Reject call">
            <PhoneOff size={18} />
          </button>
        </div>
      ) : (
        <div className="call-actions">
          {!inCall && (
            <>
              <button type="button" disabled={!activeContact} onClick={() => onStartCall("voice")} title="Voice call">
                <Phone size={18} />
              </button>
              <button type="button" disabled={!activeContact} onClick={() => onStartCall("video")} title="Video call">
                <Video size={18} />
              </button>
            </>
          )}
          {inCall && (
            <>
              <button type="button" onClick={onToggleMute} title={call.muted ? "Unmute" : "Mute"}>
                {call.muted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              {call.type === "video" && (
                <button type="button" onClick={onToggleCamera} title={call.cameraOff ? "Camera on" : "Camera off"}>
                  {call.cameraOff ? <VideoOff size={18} /> : <Video size={18} />}
                </button>
              )}
              <button className="danger" type="button" onClick={() => onEndCall(true)} title="End call">
                <PhoneOff size={18} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CaptionBlock({ title, caption }) {
  return (
    <div className="caption-block">
      <p>{title}</p>
      <strong className={caption?.isInterim ? "interim-caption" : ""}>
        {caption?.originalText || "Listening..."}
      </strong>
      <strong className={`translated ${caption?.isInterim ? "interim-caption" : ""}`}>
        {caption?.translatedText || "Translated captions appear here."}
      </strong>
    </div>
  );
}

function WorkflowItem({ icon, label, active }) {
  return (
    <div className={`workflow-item ${active ? "active" : ""}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

function MessageMedia({ message }) {
  if (!message.mediaUrl) return null;
  const url = mediaHref(message.mediaUrl);

  if (message.messageType === "image" || message.mediaMime?.startsWith("image/")) {
    return <img className="message-media" src={url} alt={message.mediaName || "Shared image"} />;
  }

  if (message.messageType === "audio" || message.mediaMime?.startsWith("audio/")) {
    return <audio className="message-audio" src={url} controls />;
  }

  return (
    <a className="message-file" href={url} target="_blank" rel="noreferrer">
      {message.mediaName || "Open attachment"}
    </a>
  );
}
