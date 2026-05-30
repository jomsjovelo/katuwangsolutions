# Katuwang Solutions 🚀

**Industrial-Grade SaaS Framework for Filipino Businesses**

Katuwang Solutions is a mobile-first, multi-tenant SaaS platform designed to modernize micro, small, and medium enterprises (MSMEs) in the Philippines.

**GitHub Repository:** [https://github.com/jomsjovelo/katuwangsolutions](https://github.com/jomsjovelo/katuwangsolutions)

---

## 🛰️ THE ANTIGRAVITY FLIGHT PLAN (Deployment Guide)

To move your code from GitHub into the live **Antigravity Environment** (Firebase App Hosting), follow these exact steps:

### 1. Resolve GitHub Permissions
If you see a "waiting for permissions" error in the Firebase Console:
- **Click "Connect to GitHub"** again to re-trigger the authorization.
- In the GitHub popup, ensure you select the `jomsjovelo/katuwangsolutions` repository specifically.
- **Refresh the Firebase page** after 60 seconds.

### 2. Finalize App Hosting Setup
- **App Hosting ID:** Use `katuwang-prod`.
- **Root Directory:** Keep it as `/`.
- **Environment Variables:** Once the app is created, go to the **Settings** tab in App Hosting and add:
  - `GEMINI_API_KEY`: `AIzaSyD5dZeMncsVFwkhNFtkH0jnYJSPBZozfYk`

### 3. Automatic "Joy-Glow" Updates
Every time you run the following commands in your terminal, your live site will automatically rebuild and deploy:
```bash
git add .
git commit -m "Update Antigravity UI"
git push
```

---

## 🛠 Terminal Guide (Local Development)

- **Start Dev Server:** `npm run dev` (Port 9002)
- **Launch AI UI:** `npm run genkit:dev` (Port 4000)
- **Fix Port Busy Error:** If you see `EADDRINUSE`, run `fuser -k 9002/tcp` or wait 30 seconds.

---

## ✨ Design Philosophy
- **Antigravity Experience:** Floating UI elements and high-energy transitions using Turquoise (#06B6D4) and Sunflower Yellow (#FACC15).
- **Mobile-First Core:** Optimized for the 430px "Palengke" viewport.
- **Unified Ecosystem:** 16 industry-specific modules on a secure multi-tenant backbone.

---

**Katuwang Solutions** – *Ang Katuwang ng Negosyo Mo.*
