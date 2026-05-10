# WeConnect Translation Chat

Web-first real-time translation chat app with Firebase Phone Auth, MySQL storage, and Socket.IO messaging.

## Features

- 🌐 **Real-time Translation**: AI-powered translation between languages
- 🔐 **End-to-End Encryption**: Messages encrypted using AES
- 📱 **Cross-Platform**: Web, Android, and iOS support
- 📞 **Voice & Video Calls**: WebRTC-based calling with translation
- 👥 **Contact Management**: Find and chat with registered users
- 🌍 **Multi-Language**: Support for Hindi, English, and more

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8.0+
- Firebase project with Phone Authentication enabled

### Automated Setup

```bash
# Make setup script executable and run it
chmod +x setup.sh
./setup.sh
```

### Manual Setup

1. **Install Dependencies**
```bash
# Install all dependencies
npm run install:all
```

2. **Environment Configuration**

Copy and configure environment files:

```bash
# Server
cp server/.env.example server/.env

# Client
cp client/.env.example client/.env

# Mobile
cp mobile/.env.example mobile/.env
```

**Required Environment Variables:**

**server/.env:**
```env
PORT=4000
NODE_ENV=development
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
CLIENT_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
EXPO_ORIGINS=exp://
ENCRYPTION_KEY=weconnect-translation-chat-secret-key-2024

DB_PROVIDER=mysql
MYSQL_HOST=localhost
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=weconnect

# Optional AI translation provider
TRANSLATION_PROVIDER=openai
OPENAI_API_KEY=sk-your_key
OPENAI_TRANSLATION_MODEL=gpt-4.1-mini
```

**client/.env:**
```env
VITE_API_URL=http://localhost:4000
VITE_ENCRYPTION_KEY=weconnect-translation-chat-secret-key-2024
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
```

**mobile/.env:**
```env
EXPO_PUBLIC_API_URL=http://localhost:4000
```

3. **Database Setup**

Ensure MySQL is running and create the database:

```sql
CREATE DATABASE IF NOT EXISTS weconnect
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

The server will automatically create tables on first run.

4. **Firebase Setup**

- Create a Firebase project
- Enable Phone Authentication
- Download service account key to `server/firebase-service-account.json`
- Add authorized domains: `localhost`, `127.0.0.1`

## Development

### Start All Services

```bash
# Terminal 1: Start server
cd server && npm run dev

# Terminal 2: Start web client
cd client && npm run dev

# Terminal 3: Start mobile app
cd mobile && npm start
```

### Available URLs

- **Web Client**: http://localhost:5173
- **Server API**: http://localhost:4000
- **Health Check**: http://localhost:4000/health

## Project Structure

```
weConnect_codex/
├── client/          # React web application
├── mobile/          # React Native mobile app
├── server/          # Node.js backend server
│   ├── src/
│   │   ├── db/      # Database repositories
│   │   ├── encryptionService.js
│   │   ├── firebaseAdmin.js
│   │   ├── index.js
│   │   └── translationService.js
│   └── database/
├── setup.sh         # Automated setup script
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/verify-otp` - Verify OTP (demo mode)

### Users
- `PATCH /api/users/:userId` - Update user profile
- `GET /api/users/:userId/contacts` - Get user contacts
- `POST /api/users/:userId/contacts` - Add contact
- `GET /api/users/:userId/groups` - Get group chats
- `POST /api/users/:userId/groups` - Create a group chat
- `POST /api/users/:userId/uploads` - Store local media/voice uploads

### Messages
- `GET /api/users/:userId/conversations/:contactId` - Get conversation
- `GET /api/users/:userId/groups/:groupId/messages` - Get group conversation
- `DELETE /api/users/:userId/conversations/:contactId` - Delete conversation

### Translation
- `POST /api/translate` - Manual translation

Set `TRANSLATION_PROVIDER=openai` for AI translation, or `TRANSLATION_PROVIDER=libretranslate` with `LIBRE_TRANSLATE_URL` for a self-hosted/open provider. Without a provider, the server uses a small local Hindi/English fallback dictionary so the app can still run in development.

## Socket.IO Events

### Connection
- `user:online` - Mark user as online
- `message:new` - Receive new message
- `contacts:update` - Update contacts list

### Messaging
- `message:send` - Send message to user
- `group:message:send` - Send message to group
- `message:read` - Mark a conversation as read
- `group:read` - Mark group messages as read
- `message:status` - Receive delivered/read status updates
- `typing` - Send and receive typing indicators

## Local Web Scope

For the current local build, MySQL is the primary database. Domain, hosting, NGINX/API gateway, cloud storage, Redis scaling, and mobile app work are intentionally outside this phase. Media and voice messages are saved locally in `server/uploads/`.

If Firebase Phone Auth is not configured yet, set `ENABLE_DEMO_OTP=true` in `server/.env`. The web app will use local demo OTP `123456` when Firebase client config is missing. Keep this disabled outside local development.

### Calling
- `call:invite` - Initiate call
- `call:accept` - Accept call
- `call:reject` - Reject call
- `call:end` - End call

## Security

- **Message Encryption**: All messages are encrypted using AES-256
- **Firebase Auth**: Secure authentication with phone numbers
- **Input Validation**: Server-side validation for all inputs
- **CORS Protection**: Configured allowed origins

## Deployment

### Production Checklist

1. Update environment variables for production domains
2. Set `NODE_ENV=production`
3. Configure production database
4. Set up SSL certificates
5. Configure TURN server for WebRTC calls
6. Set up monitoring and logging

### Build Commands

```bash
# Build web client
cd client && npm run build

# Build mobile app
cd mobile && npx expo build:android
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Web Production Checklist

When you buy hosting and a domain, update these values.

`client/.env`:

```env
VITE_API_URL=https://api.yourdomain.com
VITE_ICE_SERVERS={"iceServers":[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.yourdomain.com:3478","username":"turn_user","credential":"turn_password"}]}
```

`server/.env`:

```env
NODE_ENV=production
CLIENT_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
DB_PROVIDER=mysql
DB_SEED_DEMO_USERS=false
ENABLE_DEMO_OTP=false
ENABLE_DEBUG_MESSAGES=false
FIREBASE_SERVICE_ACCOUNT_PATH=/secure/path/firebase-service-account.json
```

For reliable voice/video calls outside the same local network, add a TURN server such as Coturn and put it in `VITE_ICE_SERVERS`.

For production-grade translation, configure a LibreTranslate-compatible provider on the server:

```env
TRANSLATION_PROVIDER=libretranslate
LIBRE_TRANSLATE_URL=https://libretranslate.example.com
LIBRE_TRANSLATE_API_KEY=optional_api_key
```

Firebase Console:

- Add `yourdomain.com` and `www.yourdomain.com` to Authentication > Settings > Authorized domains
- Keep Phone Authentication enabled

Before deploy:

```bash
npm --prefix client run build
npm --prefix server start
```

## Firebase Phone Auth Setup

1. Firebase Console me project create/open karo.
2. Authentication > Sign-in method me `Phone` provider enable karo.
3. Authentication > Settings > Authorized domains me `localhost` add/confirm karo.
4. Project settings > Web app config copy karo.
5. `client/.env.example` ko `client/.env` me copy karke values fill karo.
6. Service accounts tab se private key download karke ignored path `server/firebase-service-account.json` par rakho.
7. `server/.env` me `FIREBASE_PROJECT_ID` aur `FIREBASE_SERVICE_ACCOUNT_PATH` set karo.

## User Journey

1. User name, phone number, mother tongue, and understood language enters.
2. Firebase sends SMS OTP to the phone number.
3. Browser verifies OTP with Firebase and receives a Firebase ID token.
4. Client sends the ID token to the backend.
5. Backend verifies the token with Firebase Admin and creates/updates the user in MySQL.
6. Authenticated user can update profile details except registered phone number.
7. User can add contacts by registered phone number.
8. If a phone number is not registered, the app returns an invite link/message that can be copied or shared.
9. User can chat, call, and receive browser notifications after allowing notification permission.
10. User can delete a chat for themselves. The backend stores a soft-delete marker and hides older messages for that user.

## Backend Database Setup

Backend database code adapter pattern par bana hai. App code `server/src/db/index.js` se repository leta hai, isliye MySQL se MongoDB par switch karne ke liye route/socket code change nahi karna padega.

Available providers:

- `memory`: local prototype, data server restart par reset ho jata hai
- `mysql`: current recommended database
- `mongodb`: future MongoDB integration ke liye ready adapter

### MySQL Setup

1. MySQL install/start karo.
2. Database create karo:

```sql
CREATE DATABASE IF NOT EXISTS weconnect
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

3. `server/.env.example` ko `server/.env` me copy karo.
4. `server/.env` me ye values set karo:

```env
DB_PROVIDER=mysql
DB_INIT_SCHEMA=true
DB_SEED_DEMO_USERS=false
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=weconnect
```

5. Server run karo:

```bash
npm run dev:server
```

`DB_INIT_SCHEMA=true` hone par backend `users` aur `messages` tables startup par create kar dega. Manual schema chahiye ho to [server/database/mysql-schema.sql](server/database/mysql-schema.sql) run kar sakte ho.

### MongoDB Setup

MongoDB ke liye route/socket code same rahega; sirf provider switch hoga.

1. MongoDB local ya Atlas cluster ready karo.
2. `server/.env` me values set karo:

```env
DB_PROVIDER=mongodb
DB_SEED_DEMO_USERS=true
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=translation_chat
```

3. Server restart karo:

```bash
npm run dev:server
```

MongoDB adapter startup par `users` aur `messages` collections ke indexes create karta hai.

### Memory Mode

Database setup ke bina local testing ke liye:

```env
DB_PROVIDER=memory
```

Is mode mein data persist nahi hota.

## Run Web

```bash
npm run install:web
npm run dev
```

Open the React app at `http://localhost:5173`.

## Run Mobile App

```bash
npm run install:mobile
npm run dev:server
npm run dev:mobile
```

Then open the Expo app on Android or iOS.

- Android emulator default API URL: `http://10.0.2.2:4000`
- iOS simulator default API URL: `http://localhost:4000`
- Physical phone: open mobile settings in the app and set the API server to your computer LAN IP, for example `http://192.168.1.10:4000`

### Mobile Firebase Phone Auth

The mobile app uses native Firebase Phone Auth through React Native Firebase, so it needs a custom Expo dev build. Expo Go is not enough for this flow.

1. In Firebase Console, add an Android app with package name `com.translationchat.mobile`.
2. Download `google-services.json` and place it at `mobile/google-services.json`.
3. If you need iOS, add an iOS app with bundle id `com.translationchat.mobile`.
4. Download `GoogleService-Info.plist` and place it at `mobile/GoogleService-Info.plist`.
5. Build/run a custom dev client:

```bash
cd mobile
npx expo prebuild
npx expo run:android
```

For a physical phone, keep the backend running and set the mobile API server to your computer LAN IP, for example `http://192.168.1.10:4000`.

## Prototype Features

- Register/login style onboarding
- Select mother tongue and understood language
- Firebase SMS OTP verification screen
- Contact list with online status
- Real-time translated chat
- Original + translated message display
- WebRTC voice/video calling on web
- Live translated call captions using browser speech recognition and the server translation pipeline
- Android/iOS mobile app with onboarding, OTP, contacts, translated chat, call controls, session restore, and editable API server settings
- Backend health, users, contacts, messages, Socket.IO events
