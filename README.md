# Real-Time Translation Chat & Calling Web App

Prototype web app based on the provided workflow image.

## Stack

- Backend: Node.js, Express, Socket.IO
- Frontend: React, Vite, Socket.IO Client
- Mobile: Expo React Native for Android and iOS
- Auth: Firebase Phone Authentication
- Translation: mock AI translation service with Hindi/English sample phrases
- Storage: database adapter layer with Memory, MySQL, and MongoDB providers

## Firebase Phone Auth Setup

1. Firebase Console me project create/open karo.
2. Authentication > Sign-in method me `Phone` provider enable karo.
3. Project settings > Web app config copy karo.
4. `client/.env.example` ko `client/.env` me copy karke values fill karo.
5. Dev server restart karo.

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
CREATE DATABASE IF NOT EXISTS translation_chat
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

3. `server/.env.example` ko `server/.env` me copy karo.
4. `server/.env` me ye values set karo:

```env
DB_PROVIDER=mysql
DB_INIT_SCHEMA=true
DB_SEED_DEMO_USERS=true
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=translation_chat
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

## Run

```bash
npm run install:all
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

The mobile prototype uses OTP `123456`.

## Prototype Features

- Register/login style onboarding
- Select mother tongue and understood language
- Firebase SMS OTP verification screen
- Contact list with online status
- Real-time translated chat
- Original + translated message display
- Voice/video call workflow UI placeholders
- Android/iOS mobile app with onboarding, OTP, contacts, translated chat, call controls, session restore, and editable API server settings
- Backend health, users, contacts, messages, Socket.IO events
