# Azure CDN & Front Door Edge Security Runbook

This guide details the edge authorization, caching, and rate-limiting rules configured in front of the Azure Blob origin (`fonixedugrading`).

---

## 1. Edge Security Architecture

```mermaid
flowchart LR
    Client[Player Client] -->|1. Request .ts segment with SAS| Edge[Azure Front Door / CDN Edge]
    Edge -->|2. Validates SAS Signature & Expiry at Edge| Valid{Valid SAS?}
    Valid -->|No / Expired| Drop[403 Edge Reject - Never hits Origin]
    Valid -->|Yes| Cache{Edge Cached?}
    Cache -->|Hit (TTL: 60s)| Direct[Fast Edge Response]
    Cache -->|Miss| Origin[(Azure Blob Origin)]
```

---

## 2. Rule Configurations in Azure Portal

### Rule 1: Edge SAS Signature Validation
- **Path**: `/videos/*/*.ts`
- **Action**: URL Token / SAS Authentication.
- **Enforcement**: Reject requests missing `sig`, `se` (expiry), or with tampered signatures directly at the edge node before forwarding to origin.

### Rule 2: Edge Rate Limiting on Segment Fetch
- **Match**: Request URI contains `.ts`
- **Rate Limit**: Max 120 requests per minute per client IP.
- **Action**: `Block` (HTTP 403 Forbidden).
- **Purpose**: Thwarts automated scraping scripts attempting to batch-rip video streams.

### Rule 3: Cache-Control Edge Rules
- **Playlists (`.m3u8`) & Keys (`/keys/*`)**:
  - `BypassCache`
  - `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
- **Encrypted Media Segments (`.ts`)**:
  - `OverrideCache`
  - `CacheDuration: 00:01:00` (60 seconds, aligned with short-TTL session tokens).
