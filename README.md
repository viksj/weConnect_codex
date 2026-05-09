# WeConnect Translation Chat

Web-first real-time translation chat app with Firebase Phone Auth, MySQL storage, and Socket.IO messaging.

## Stack

- Backend: Node.js, Express, Socket.IO
- Frontend: React, Vite, Socket.IO Client
- Mobile: Expo React Native for Android and iOS, optional later phase
- Auth: Firebase Phone Authentication
- Translation: mock AI translation service with Hindi/English sample phrases
- Storage: database adapter layer with Memory, MySQL, and MongoDB providers

## Web Local Test

Use this path when testing the web app locally before buying a domain or hosting.

1. Install web dependencies:

```bash
npm run install:web
```

2. Make sure these local env files exist:

```text
server/.env
client/.env
server/firebase-service-account.json
```

3. In Firebase Console, confirm:

- Authentication > Sign-in method > Phone is enabled
- Authentication > Settings > Authorized domains contains `localhost`

4. Start server and client:

```bash
npm run dev
```

5. Open the web app:

```text
http://localhost:5173
```

The backend runs at `http://localhost:4000`.

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
