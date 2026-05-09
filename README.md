# Real-Time Translation Chat & Calling Web App

Prototype web app based on the provided workflow image.

## Stack

- Backend: Node.js, Express, Socket.IO
- Frontend: React, Vite, Socket.IO Client
- Auth: Firebase Phone Authentication
- Translation: mock AI translation service with Hindi/English sample phrases
- Storage: in-memory data for prototype mode

## Firebase Phone Auth Setup

1. Firebase Console me project create/open karo.
2. Authentication > Sign-in method me `Phone` provider enable karo.
3. Project settings > Web app config copy karo.
4. `client/.env.example` ko `client/.env` me copy karke values fill karo.
5. Dev server restart karo.

## Run

```bash
npm run install:all
npm run dev
```

Open the React app at `http://localhost:5173`.

## Prototype Features

- Register/login style onboarding
- Select mother tongue and understood language
- Firebase SMS OTP verification screen
- Contact list with online status
- Real-time translated chat
- Original + translated message display
- Voice/video call workflow UI placeholders
- Backend health, users, contacts, messages, Socket.IO events
