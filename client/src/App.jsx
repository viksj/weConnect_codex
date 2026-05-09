import {
  BadgeCheck,
  Bell,
  Bot,
  CheckCheck,
  Languages,
  Lock,
  Mic,
  Phone,
  Search,
  Send,
  Shield,
  UserRound,
  Video
} from "lucide-react";
import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { io } from "socket.io-client";
import { API_URL, getContacts, getConversation, registerUser } from "./api";
import { languageName, languages } from "./constants";
import { firebaseAuth, isFirebaseConfigured } from "./firebase";

const demoUser = {
  name: "You",
  emailOrPhone: "+91 90000 00000",
  motherTongue: "hi",
  understands: "en"
};

export function App() {
  const [step, setStep] = useState("register");
  const [form, setForm] = useState(demoUser);
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [user, setUser] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [callMode, setCallMode] = useState("voice");
  const [error, setError] = useState("");
  const socketRef = useRef(null);
  const messageEndRef = useRef(null);
  const recaptchaVerifierRef = useRef(null);

  const activeContact = selectedContact || contacts[0];

  useEffect(() => {
    if (!user) return;

    const socket = io(API_URL);
    socketRef.current = socket;
    socket.emit("user:online", { userId: user.id });

    socket.on("contacts:update", (allUsers) => {
      setContacts(allUsers.filter((item) => item.id !== user.id));
    });

    socket.on("message:new", (message) => {
      setMessages((current) => {
        const exists = current.some((item) => item.id === message.id);
        if (exists) return current;
        return [...current, message];
      });
    });

    socket.on("call:incoming", ({ type, senderName }) => {
      setCallMode(type || "voice");
      setError(`${senderName || "Contact"} is calling...`);
    });

    return () => socket.disconnect();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    getContacts(user.id)
      .then(({ contacts: items }) => {
        setContacts(items);
        setSelectedContact((current) => current || items[0] || null);
      })
      .catch(() => setError("Contacts load nahi ho paaye."));
  }, [user]);

  useEffect(() => {
    if (!user || !activeContact) return;

    getConversation(user.id, activeContact.id)
      .then(({ messages: items }) => setMessages(items))
      .catch(() => setError("Conversation load nahi ho paayi."));
  }, [user, activeContact?.id]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const visibleMessages = useMemo(() => {
    if (!user || !activeContact) return [];
    return messages.filter((message) => {
      const sent = message.senderId === user.id && message.receiverId === activeContact.id;
      const received = message.senderId === activeContact.id && message.receiverId === user.id;
      return sent || received;
    });
  }, [messages, user, activeContact]);

  async function handleRegister(event) {
    event.preventDefault();
    setError("");
    setIsSendingOtp(true);

    try {
      if (!isFirebaseConfigured || !firebaseAuth) {
        throw new Error("Firebase config missing");
      }

      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(firebaseAuth, "recaptcha-container", {
          size: "invisible"
        });
      }

      const result = await signInWithPhoneNumber(firebaseAuth, form.emailOrPhone, recaptchaVerifierRef.current);
      setConfirmationResult(result);
      setOtp("");
      setStep("verify");
    } catch (caughtError) {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
      setError(
        caughtError.message === "Firebase config missing"
          ? "Firebase config missing hai. client/.env file me Firebase values add karo."
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

      const firebaseCredential = await confirmationResult.confirm(otp);
      const result = await registerUser({
        ...form,
        emailOrPhone: firebaseCredential.user.phoneNumber || form.emailOrPhone,
        firebaseUid: firebaseCredential.user.uid
      });
      setUser(result.user);
      setStep("chat");
    } catch {
      setError("OTP verify nahi hua. SMS wala code dobara check karo.");
    } finally {
      setIsVerifyingOtp(false);
    }
  }

  function sendMessage(event) {
    event.preventDefault();
    if (!messageText.trim() || !user || !activeContact) return;

    socketRef.current?.emit("message:send", {
      senderId: user.id,
      receiverId: activeContact.id,
      text: messageText
    });
    setMessageText("");
  }

  function startCall(type) {
    setCallMode(type);
    socketRef.current?.emit("call:signal", {
      type,
      senderId: user.id,
      senderName: user.name,
      receiverId: activeContact?.id
    });
  }

  return (
    <main className="app-shell">
      <section className="product-panel">
        <div className="brand-row">
          <div className="brand-mark">
            <Languages size={26} />
          </div>
          <div>
            <p className="eyebrow">Real-time AI translation</p>
            <h1>Chat aur calls, har language mein natural.</h1>
          </div>
        </div>

        <div className="workflow-strip">
          <WorkflowItem icon={<UserRound />} label="Register" active={step === "register"} />
          <WorkflowItem icon={<BadgeCheck />} label="Verify OTP" active={step === "verify"} />
          <WorkflowItem icon={<Lock />} label="Encrypt" />
          <WorkflowItem icon={<Bot />} label="Translate" />
          <WorkflowItem icon={<CheckCheck />} label="Deliver" active={step === "chat"} />
        </div>

        {step === "register" && (
          <form className="auth-card" onSubmit={handleRegister}>
            <h2>Create account</h2>
            <label>
              Name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              Phone number
              <input
                placeholder="+91 98765 43210"
                value={form.emailOrPhone}
                onChange={(event) => setForm({ ...form, emailOrPhone: event.target.value })}
              />
            </label>
            <div className="split">
              <label>
                Mother tongue
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
              <label>
                I also understand
                <select
                  value={form.understands}
                  onChange={(event) => setForm({ ...form, understands: event.target.value })}
                >
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div id="recaptcha-container" />
            <button className="primary-button" type="submit" disabled={isSendingOtp}>
              {isSendingOtp ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>
        )}

        {step === "verify" && (
          <form className="auth-card compact" onSubmit={handleVerify}>
            <Shield className="hero-icon" size={44} />
            <h2>Verify your number</h2>
            <p className="muted">Firebase ne {form.emailOrPhone} par SMS OTP send kiya hai.</p>
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
          </form>
        )}

        {error && <p className="toast">{error}</p>}
      </section>

      <section className="chat-panel">
        <aside className="contact-list">
          <div className="toolbar">
            <h2>Contacts</h2>
            <Bell size={18} />
          </div>
          <div className="search-box">
            <Search size={17} />
            <input placeholder="Search" />
          </div>
          {contacts.map((contact) => (
            <button
              className={`contact-row ${activeContact?.id === contact.id ? "selected" : ""}`}
              key={contact.id}
              type="button"
              onClick={() => setSelectedContact(contact)}
            >
              <span className="avatar">{contact.avatar}</span>
              <span>
                <strong>{contact.name}</strong>
                <small>{contact.online ? "Online" : "Offline"} · {languageName[contact.motherTongue]}</small>
              </span>
              <i className={contact.online ? "online" : ""} />
            </button>
          ))}
        </aside>

        <section className="conversation">
          <header className="conversation-header">
            <div>
              <strong>{activeContact?.name || "Select contact"}</strong>
              <span>{activeContact ? `${languageName[activeContact.motherTongue]} preferred` : "No contact selected"}</span>
            </div>
            <div className="icon-actions">
              <button title="Voice call" type="button" onClick={() => startCall("voice")}>
                <Phone size={18} />
              </button>
              <button title="Video call" type="button" onClick={() => startCall("video")}>
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
              const textToShow = mine ? message.originalText : message.translatedText;
              const helperText = mine ? message.translatedText : message.originalText;

              return (
                <article className={`message ${mine ? "mine" : "theirs"}`} key={message.id}>
                  <p>{textToShow}</p>
                  <small>
                    {languageName[message.sourceLanguage]} to {languageName[message.targetLanguage]} · {helperText}
                  </small>
                </article>
              );
            })}
            <div ref={messageEndRef} />
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <button type="button" title="Voice message">
              <Mic size={19} />
            </button>
            <input
              disabled={!user || !activeContact}
              placeholder="Type a message..."
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
            />
            <button className="send-button" type="submit" title="Send">
              <Send size={19} />
            </button>
          </form>
        </section>

        <aside className="call-panel">
          <div className="call-preview">
            <span className="avatar large">{activeContact?.avatar || "C"}</span>
            <h3>{callMode === "video" ? "Video Call" : "Voice Call"}</h3>
            <p>Speech to text, AI translation, text to speech workflow placeholder.</p>
            <div className="call-actions">
              <button type="button" onClick={() => startCall("voice")}>
                <Phone size={18} />
              </button>
              <button type="button" onClick={() => startCall("video")}>
                <Video size={18} />
              </button>
              <button type="button">
                <Mic size={18} />
              </button>
            </div>
          </div>

          <div className="translation-card">
            <h3>Live Translation</h3>
            <p>
              Hindi <span>→</span> English
            </p>
            <strong>Kaise ho?</strong>
            <strong className="translated">How are you?</strong>
          </div>
        </aside>
      </section>
    </main>
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
