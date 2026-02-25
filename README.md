# WASP — We Are Signal Protocol

> An open-source, end-to-end encrypted messaging application with zero server-side message storage.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Signal Protocol](https://img.shields.io/badge/Encrypted%20with-Signal%20Protocol-blue.svg)](https://signal.org/docs/)

---

## What is WASP?

WASP is a fully functional, production-ready WhatsApp alternative that puts privacy first by design — not as an afterthought. It is built on three non-negotiable principles:

1. **Zero server storage** — The relay server forwards encrypted message envelopes and immediately discards them. It stores no message content, no metadata, no conversation history.
2. **End-to-end encryption** — All messages are encrypted on the sender's device using the Signal Protocol (X3DH + Double Ratchet) before touching the network. The server never sees plaintext.
3. **Local-first** — Your message history lives on your device in an encrypted SQLite database. It is yours.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              WASP Architecture                          │
├───────────────────┬─────────────────────────┬───────────────────────────┤
│   Alice's Device  │      Relay Server        │     Bob's Device          │
│                   │                          │                           │
│  ┌─────────────┐  │  ┌────────────────────┐  │  ┌─────────────┐         │
│  │  Plaintext  │  │  │ Opaque Encrypted   │  │  │  Plaintext  │         │
│  │  "Hello!"   │  │  │ Envelope (relay +  │  │  │  "Hello!"   │         │
│  └──────┬──────┘  │  │ delete immediately)│  │  └──────▲──────┘         │
│         │ Encrypt │  └────────────────────┘  │         │ Decrypt        │
│  ┌──────▼──────┐  │                          │  ┌──────┴──────┐         │
│  │  Signal     │──┼──── encrypted blob ──────┼─▶│  Signal     │         │
│  │  Session    │  │       (opaque)            │  │  Session    │         │
│  └─────────────┘  │                          │  └─────────────┘         │
│  ┌─────────────┐  │  ┌────────────────────┐  │  ┌─────────────┐         │
│  │  Local      │  │  │ Ephemeral Redis     │  │  │  Local      │         │
│  │  SQLite DB  │  │  │ (offline queue,     │  │  │  SQLite DB  │         │
│  │  (encrypted)│  │  │  key bundles,       │  │  │  (encrypted)│         │
│  └─────────────┘  │  │  session routing)   │  │  └─────────────┘         │
│                   │  └────────────────────┘  │                           │
└───────────────────┴─────────────────────────┴───────────────────────────┘
```

### What the server stores
| Data | Stored? | Notes |
|------|---------|-------|
| Message content | ❌ Never | Encrypted by client, relayed and deleted |
| Message metadata (to/from/time) | ❌ Never | Only `to` field read for routing, not logged |
| Public key bundles | ✅ Yes | Identity keys, signed prekeys, one-time prekeys — public only |
| User account (username, display name) | ✅ Yes | No private keys ever |
| Offline message queue | ⏳ Temporarily | Opaque encrypted blobs, TTL 7 days, deleted on delivery |
| Active WebSocket sessions | ⏳ In-memory only | Not persisted, cleared on disconnect |

---

## Monorepo Structure

```
wasp/
├── apps/
│   ├── server/          # Fastify relay server (Node.js + WebSockets)
│   ├── web/             # React web client (Vite + TailwindCSS)
│   └── mobile/          # Expo React Native app (iOS + Android)
├── packages/
│   ├── crypto/          # Signal Protocol (X3DH + Double Ratchet) — @noble suite
│   ├── db/              # Local SQLite schema + typed query functions
│   └── types/           # Shared TypeScript types
├── docker-compose.yml   # One-command self-hosting
├── .env.example
└── README.md
```

---

## Encryption

WASP implements the [Signal Protocol](https://signal.org/docs/) from scratch using the battle-tested `@noble` cryptography library suite (pure TypeScript, audited, constant-time).

### Libraries used
- **`@noble/curves`** — X25519 (Diffie-Hellman) and Ed25519 (signing)
- **`@noble/hashes`** — HKDF-SHA256, HMAC-SHA256
- **`@noble/ciphers`** — AES-256-GCM

### Protocol flow

**Session initiation (X3DH):**
```
Alice fetches Bob's PreKey Bundle from server:
  IK_B  = Bob's identity key (public)
  SPK_B = Bob's signed prekey (public, verified with IK_B signature)
  OPK_B = Bob's one-time prekey (public, consumed once)

Alice computes:
  DH1 = DH(IK_A, SPK_B)
  DH2 = DH(EK_A, IK_B)   ← EK_A is fresh ephemeral key
  DH3 = DH(EK_A, SPK_B)
  DH4 = DH(EK_A, OPK_B)  ← optional
  SK  = HKDF(0xFF×32 ∥ DH1 ∥ DH2 ∥ DH3 ∥ DH4)

SK is identical on both sides. The server never participates.
```

**Ongoing encryption (Double Ratchet):**
- Every message advances a KDF chain (forward secrecy)
- Each exchange of DH keys rotates the root key (break-in recovery)
- Out-of-order messages handled via skipped-key cache

**Media encryption:**
- Each media file gets a fresh 64-byte key
- AES-256-GCM encryption + HMAC-SHA256 integrity
- Encrypted blob uploaded to relay; key sent within the Signal message
- Server deletes blob immediately after confirmed delivery

---

## Features

| Feature | Status |
|---------|--------|
| 1:1 messaging | ✅ |
| Group chats (up to 256) | ✅ Schema ready |
| Media sharing (images, video, documents, voice) | ✅ Crypto + UI |
| Delivery & read receipts | ✅ |
| Typing indicators | ✅ |
| Online/offline presence | ✅ |
| Message reactions | ✅ Schema ready |
| Message replies & forwarding | ✅ UI ready |
| Disappearing messages | ✅ Schema ready |
| Voice calls (WebRTC) | 🚧 Signaling ready |
| Video calls (WebRTC) | 🚧 Signaling ready |
| Status / Stories | ✅ Schema ready |
| QR code device linking | 🚧 |
| Push notifications | ✅ Expo config ready |
| Multi-device support | 🚧 |
| Dark mode | ✅ |
| Self-hostable | ✅ Docker |

---

## Quick Start (Development)

### Prerequisites
- Node.js 20+
- Docker + Docker Compose (for Redis)
- `npm` or your preferred package manager

### 1. Clone and install
```bash
git clone https://github.com/wasp-im/wasp.git
cd wasp
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — at minimum, set JWT_SECRET and JWT_REFRESH_SECRET:
openssl rand -hex 64  # use output as JWT_SECRET
openssl rand -hex 64  # use output as JWT_REFRESH_SECRET
```

### 3. Start Redis
```bash
docker compose up -d redis
```

### 4. Start the development servers
```bash
# Start everything in parallel (server + web client)
npm run dev

# Or start individually:
npm run dev --workspace=apps/server   # http://localhost:3000
npm run dev --workspace=apps/web      # http://localhost:5173

# Mobile (requires Expo CLI)
cd apps/mobile && npx expo start
```

---

## Self-Hosting (Production)

### Docker Compose (recommended)

```bash
# 1. Copy and configure environment
cp .env.example .env
nano .env  # Set strong secrets for JWT_SECRET, JWT_REFRESH_SECRET, REDIS_PASSWORD

# 2. Build and start
docker compose up -d

# Services:
#   WASP server:  http://localhost:3000
#   Web client:   http://localhost:5173
#   Redis:        localhost:6379 (internal)
```

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | ✅ | — | 64+ byte hex secret for access tokens |
| `JWT_REFRESH_SECRET` | ✅ | — | 64+ byte hex secret for refresh tokens |
| `REDIS_PASSWORD` | ✅ | changeme | Redis auth password |
| `SERVER_PORT` | ❌ | 3000 | Server port |
| `CORS_ORIGINS` | ❌ | localhost:5173 | Allowed CORS origins |
| `OFFLINE_MESSAGE_TTL_SECONDS` | ❌ | 604800 (7d) | Max time to hold offline messages |
| `MAX_MESSAGE_SIZE_BYTES` | ❌ | 65536 | Max encrypted envelope size |

### Reverse proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name your.domain.com;

    # SSL configuration here...

    # WebSocket + API
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name app.your.domain.com;

    # SSL configuration here...

    location / {
        proxy_pass http://localhost:5173;
    }
}
```

### Multi-node deployment

For horizontal scaling, the server uses Redis pub/sub for cross-node WebSocket message relay. Set the same `REDIS_URL` on all nodes and point a load balancer with sticky sessions at them.

---

## Running Tests

```bash
# All tests
npm test

# Crypto package only (most critical)
npm test --workspace=packages/crypto

# With coverage
npm run test:coverage --workspace=packages/crypto
```

The crypto package has 90%+ coverage targets enforced in CI, with specific focus on:
- X3DH shared secret derivation (both sides must match)
- Double Ratchet encrypt/decrypt
- Out-of-order message handling
- Forward secrecy verification
- Media encryption/decryption

---

## API Reference

### Authentication
```
POST /auth/register  { username, password, displayName, registrationId }
POST /auth/login     { username, password }
POST /auth/refresh   { refreshToken }
POST /auth/logout    { refreshToken }
```

### Users
```
GET  /users/me          → current user profile
PUT  /users/me          { displayName?, about?, avatarUrl? }
GET  /users/search?q=   → search by username
GET  /users/:id         → public profile
```

### Keys
```
POST /keys/bundle       → upload your key bundle (signed prekey)
POST /keys/prekeys      → upload one-time prekeys
GET  /keys/:userId/bundle → fetch user's prekey bundle
GET  /keys/prekeys/count  → check remaining OPK count
```

### WebSocket `/ws`

After connecting, authenticate immediately:
```json
{ "type": "auth", "id": "uuid", "payload": { "token": "jwt-access-token" }, "timestamp": 1234567890 }
```

Send a message:
```json
{
  "type": "message",
  "id": "uuid",
  "payload": {
    "to": "recipient-user-id",
    "messageId": "client-generated-uuid",
    "envelope": "<base64-encoded-encrypted-envelope>"
  },
  "timestamp": 1234567890
}
```

The `envelope` field is an opaque, base64-encoded JSON blob containing the Double Ratchet header and AES-256-GCM ciphertext. The server reads only `to` for routing and never inspects the envelope.

---

## Contributing

WASP is built to be community-owned. We welcome contributions in:

- **Security**: Audit the crypto implementation, find vulnerabilities, suggest improvements
- **Features**: Implement items from the roadmap above
- **Mobile**: Flesh out the Expo app with full feature parity
- **Performance**: Optimize the relay, reduce latency
- **Docs**: Improve this README, add architecture docs

Please open an issue before starting large features.

### Code of Conduct
Be excellent to each other.

---

## Security

**Found a vulnerability?** Please email security@wasp.im (do not open a public issue). We take security seriously and will respond within 48 hours.

**Cryptography audit**: The `packages/crypto` directory implements the Signal Protocol. We encourage security researchers to audit it. All cryptographic primitives use the [`@noble`](https://paulmillr.com/noble/) suite (audited, constant-time).

---

## License

MIT — see [LICENSE](./LICENSE)

---

## Acknowledgements

- [Signal Protocol](https://signal.org/docs/) by Open Whisper Systems
- [@noble cryptography](https://paulmillr.com/noble/) by Paul Miller
- [Fastify](https://fastify.dev/) team
- [Expo](https://expo.dev/) team
