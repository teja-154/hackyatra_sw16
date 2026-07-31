# COC-Sync — City Operations Center Real-Time Civic Alert Integration

## Problem & Solution

Visakhapatnam's City Operations Center (COC) already monitors CCTV, traffic, and smart sensors — but citizen complaints and GVMC field team updates flow through entirely separate systems. A pothole reported by a citizen, captured by a CCTV camera, and flagged by a field inspector exists as **three disconnected records** that no single operator can see at once. **COC-Sync** solves this by acting as the missing integration layer: every complaint is AI-classified, geospatially correlated with existing signals within 300 meters, auto-assigned to the nearest available field team, and surfaced live on the COC supervisor dashboard — collapsing siloed data into a single unified operational picture in real time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend API** | Node.js + Express (ESM) |
| **Database** | MongoDB Atlas + Mongoose |
| **AI Classification** | Groq SDK (LLaMA 3.1 70B) |
| **Media Storage** | Cloudinary |
| **Real-time** | Socket.IO |
| **Frontend** | React 19 + Vite + Tailwind CSS |
| **Maps** | React-Leaflet + react-leaflet-cluster |
| **Auth** | JWT-based token auth |
| **Testing** | Playwright E2E |

---

## Setup Instructions

### Prerequisites
- Node.js v18+
- MongoDB Atlas account (or local MongoDB)
- Groq API key — [console.groq.com](https://console.groq.com)
- Cloudinary account — [cloudinary.com](https://cloudinary.com)

### 1. Clone & Install
```bash
git clone https://github.com/teja-154/hackyatra_sw16
cd hackyatra_sw16
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the **project root**:
```
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/cocsync
GROQ_API_KEY=gsk_your_key_here
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 3. Seed the Demo Dataset
```bash
npm run seed
```
This creates departments, field teams, sensitive zones, and 7 curated demo incidents across Visakhapatnam wards.

### 4. Run the Application
```bash
npm run dev
```
- **Citizen Portal**: http://localhost:5173/
- **Status Tracker**: http://localhost:5173/track
- **Department Login**: http://localhost:5173/dept/login (Code: `GVMC` / PIN: `1234`)
- **COC Dashboard**: http://localhost:5173/coc (Code: `SUPERVISOR` / PIN: `9999`)

### 5. Run E2E Tests
```bash
NODE_ENV=test npx playwright test
```

---

## What's Real vs. Simulated

### ✅ Real (live, not mocked)
| Feature | Details |
|---|---|
| **AI Classification** | Live Groq LLaMA 3.1 70B API call per complaint — classifies category, urgency, and routes to the correct department |
| **Geospatial Correlation** | MongoDB `$near` query merges signals within 300m of the same category into one incident |
| **Optimistic Locking** | Department accept endpoint returns `409 Conflict` if incident already assigned |
| **SLA Auto-Escalation** | Cron job runs every 5 minutes, marks breached incidents and recalculates priority scores |
| **Real-time Dashboard** | Socket.IO pushes new incidents and status changes live to supervisor screens |
| **JWT Auth** | Department and supervisor sessions are token-authenticated with role-based routing |
| **Photo Upload** | Real Cloudinary upload — evidence photos stored and displayed in department UI |
| **Idempotency** | Concurrent duplicate submissions are safely collapsed to one incident via unique key + race-condition handler |

### 🔶 Simulated (explicitly for demo)
| Feature | What's Simulated | Why |
|---|---|---|
| **CCTV Feed** | Static looping video overlay from Unsplash — visual representation only | Live GVMC CCTV API access requires government MOU |
| **Field Team GPS** | Team locations are seeded coordinates in Vizag wards | Field devices with GPS SDK not within hackathon scope |
| **Citizen GPS (Demo Mode)** | "Use Demo Location" button substitutes real GPS with ward centroid | Ensures map pins land in Vizag when testing from outside the city |

---

## Architecture Overview

```
Citizen App → POST /api/complaints
    → Groq AI classify (category + urgency + department)
    → MongoDB $near 300m correlate (merge or new incident)
    → Auto-assign nearest field team (Zomato-style)
    → Socket.IO broadcast → COC Dashboard live update
    → Department Queue → Accept → Resolve (photo upload)
    → Groq AI verify resolution photo
    → Status: resolved_verified / disputed
```

---

See [PILOT_NOTES.md](./PILOT_NOTES.md) for production deployment and pitch guidance.
