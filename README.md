# Secure Player — Content Protection System (Phase 1)

Proprietary encrypted VOD streaming pipeline featuring **AES-128 HLS segment encryption**, **configurable key rotation**, **proxied playlist delivery with batched Azure Blob SAS tokens**, **short-lived HMAC key delivery with download-guard defense**, and a **React `hls.js` player library**.

---

## Architecture Overview

```
[ Raw Video (.mp4) ]
       │
       ▼ (FFmpeg Encoder)
[ Encrypted HLS (.m3u8 + .ts) ] ─── Upload ───► [ Azure Blob Storage (Private) ]
       │
       ▼ (AES Keys & IVs)
[ PostgreSQL DB ]
       ▲
       │
[ NestJS Backend ]
   ├── /playlist/:videoId  ──► Rewrites EXT-X-KEY to /keys/:videoId?t={sessionToken}
   │                           Rewrites segments to direct Azure SAS URLs (Batched)
   └── /keys/:videoId      ──► Validates Session Token + Entitlement + Origin Allowlist
                               Delivers 16-byte raw AES key (application/octet-stream, no-store)
       ▲
       │
[ React Player (@secure-player/react) ]
   ├── Custom HLS loader with JWT & Session Token handling
   ├── AES-128 in-worker segment decryption
   └── DOM security (anti-download, no-PIP, right-click block, visible watermark)
```

---

## 1. Environment Configuration

The backend reads configuration from `backend/.env`.

Ensure your `backend/.env` has:
```env
# Server & Port
PORT=3001
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/secure_player

# Security & Session Token Secrets
JWT_SECRET=super_secure_jwt_access_secret_for_vod_streaming_2026
KEY_SESSION_SECRET=super_secret_hmac_key_session_signing_secret_min_32_bytes
KEY_SESSION_TTL_SECONDS=60

# Azure Blob Storage (Only these 3 are required)
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=your_account;AccountKey=your_key;EndpointSuffix=core.windows.net
AZURE_STORAGE_ACCOUNT_NAME=your_account
AZURE_STORAGE_CONTAINER_NAME=videos
AZURE_STORAGE_CUSTOM_DOMAIN=

# CORS & Referer Allowlist
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Direct Segment SAS URL Lifetime (Seconds)
SEGMENT_SAS_TTL_SECONDS=300
```

---

## 2. Quickstart & Local Execution

### Install Dependencies
```bash
npm install
```

### Run Automated Unit Tests (Security & Entitlement Critical Paths)
```bash
npm run test
```
All 25 security denial, session verification, origin validation, batched SAS rewriting, and download-guard tests will run.

### Build All Workspaces (Backend, Encoder, and Player Library)
```bash
npm run build
```

---

## 3. Running the FFmpeg Encoder

You can package and encrypt any raw video file using the standalone encoder CLI.

### Option A: Encode with Single AES-128 Key
```bash
npx ts-node encoder/src/cli.ts -i ./samples/sample.mp4 -v vid_001 --save-db --upload-azure
```

### Option B: Encode with Key Rotation (e.g., Rotate Key Every 5 Segments)
```bash
npx ts-node encoder/src/cli.ts -i ./samples/sample.mp4 -v vid_002 -r 5 --save-db --upload-azure
```

#### CLI Parameters:
- `-i, --input <path>`: Path to raw input video file.
- `-v, --videoId <id>`: Unique video identifier.
- `-s, --segment-duration <sec>`: HLS segment duration (default: `6`).
- `-r, --key-rotation <segments>`: Rotate key every N segments (`0` for single key).
- `--upload-azure`: Upload `.m3u8` and `.ts` segments to Azure Blob Storage under `videos/{videoId}/`.
- `--save-db`: Persist generated AES-128 keys and metadata to PostgreSQL.

---

## 4. Starting the Backend & Frontend

### Start Backend API Server (Port 3001):
```bash
npm run start:backend
```

### Start Frontend Demo Dashboard (Port 3000):
```bash
npm run start:frontend
```

Open `http://localhost:3000` to launch the interactive demo player dashboard.

---

## 5. Using `@secure-player/react` as an External Library

The player component is packaged in `frontend/dist/lib/` as a standalone protected library with full TypeScript definitions.

### Installing in Another React App:
```bash
npm install @secure-player/react
```

### Usage Example:
```tsx
import React from 'react';
import { SecurePlayer } from '@secure-player/react';
import '@secure-player/react/style.css';

export function VideoView() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <SecurePlayer
        videoId="vid_001"
        jwtToken="YOUR_USER_JWT_TOKEN"
        apiBaseUrl="https://api.yourdomain.com"
        autoPlay={true}
        watermarkText="student_102 • confidential"
        onError={(err) => console.error('Player error:', err)}
        onReady={() => console.log('Secure stream ready')}
      />
    </div>
  );
}
```

---

## 6. Security Layers Summary

| Layer | Implementation | Protection |
|---|---|---|
| **1. AES-128 Encryption** | Random 16-byte keys stored in PostgreSQL; media packaged via FFmpeg `-hls_key_info_file`. | Segments are encrypted; raw bytes unusable without keys. |
| **2. Proxy Manifest & Batched SAS** | NestJS proxies `.m3u8` only. Segments point directly to Azure Blob via HMAC-signed SAS URLs generated in 1 pass. | High throughput, 0 backend video proxying, zero rebuffering latency. |
| **3. Guarded Key Delivery** | `/keys/:videoId` requires short-lived signed HMAC session tokens (`t`), checks user entitlement (fail-closed), and validates `Origin`/`Referer`. | Prevents unauthorized key fetching, link sharing, and token reuse. |
| **4. Download Guard** | Middleware blocks curl, wget, IDM, JDownloader, aria2, yt-dlp, and scraping agents with `403 Forbidden` and security logs. | Deters automated ripping tools. |
| **5. Player Anti-Tamper & Watermark** | Right-click inspection disabled, `nodownload noremoteplayback` enforced, dynamic visible watermark overlay. | Deters casual recording and screenshot leaks. |
