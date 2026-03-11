# 🥒 Pickleball League Manager — Setup Guide

## Overview
This app supports **multiple independent leagues** from a single deployment.

| Piece | What it is | Count |
|---|---|---|
| GitHub Pages site | The frontend everyone visits | 1 |
| GAS Web App | The backend API | 1 |
| Master Registry Sheet | Holds the list of leagues | 1 |
| League Data Sheet | Holds one league's data | 1 per league |

---

## Step 1: Create the Master Registry Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a blank spreadsheet
2. Name it **"Pickleball League Registry"**
3. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/1VPWAWqN1376ewwWUz7laZ8e-_oKbFA2cjv3p0yTvGZ4YOUR_MASTER_SHEET_ID/edit
   ```

---

## Step 2: Deploy the Google Apps Script

1. In the master registry Sheet, go to **Extensions → Apps Script**
2. Delete any existing code and paste the entire contents of `gas/Code.gs`
3. Replace `YOUR_MASTER_REGISTRY_SHEET_ID_HERE` at the top with your master Sheet ID
4. Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy** and copy the **Web App URL**

---Deployment ID: -AKfycbxlJ5x3kmJmssFvcEnf7RVzDcILsJz6nBH09b4xIdQTLoXqbVist3yKlcWx3fePEBYe

## Step 3: Configure the Frontend

Open `js/api.js` and replace:
```javascript
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxlJ5x3kmJmssFvcEnf7RVzDcILsJz6nBH09b4xIdQTLoXqbVist3yKlcWx3fePEBYe/exec';
```
with your Web App URL from Step 2.

---

## Step 4: Deploy to GitHub Pages

1. Push all files to a GitHub repository
2. Go to **Settings → Pages → Source: main branch, root**
3. Your site is live at `https://yourusername.github.io/your-repo/`

---

## Step 5: Add Your First League

Each league needs its own Google Sheet. For each league:

1. Create a new blank Google Sheet (e.g. "Spring 2026 League")
2. Copy its Sheet ID from the URL
3. Go to your site → **Admin Login** (default PIN: `0000`)
4. Navigate to **Leagues** → **Add League**
   - League ID: a short slug, e.g. `spring2026` (no spaces)
   - Name: the display name, e.g. `Spring 2026`
   - Sheet ID: the Google Sheet ID you copied
5. Click Save

Repeat for each additional league. Each league is fully independent.

---

## Step 6: Configure Each League

1. From the login page, select your league → Admin Login → PIN `0000`
2. Go to **Setup** → set league name, weeks, courts, dates, and change the admin PIN
3. Go to **Players** → add all players with names and PINs
4. Save both

---

## Weekly Workflow

1. **Players** log in → select their league → set availability
2. **Admin** → Attendance → verify who's in
3. **Admin** → Pairings → Generate → Lock & Save
4. During session: **Admin** → Score Entry → enter scores
5. Standings update automatically

---

## App Structure

```
index.html        ← 3-step login: league → player → PIN
admin.html        ← Admin dashboard
player.html       ← Player dashboard
css/style.css     ← Styles
js/api.js         ← API layer  ← SET YOUR GAS_URL HERE
js/auth.js        ← Session management (stores leagueId)
js/pairings.js    ← Pairing optimizer
js/reports.js     ← Standings calculations
js/admin.js       ← Admin page logic
js/player.js      ← Player page logic
gas/Code.gs       ← GAS backend  ← SET MASTER_SHEET_ID + DEPLOY
```

## Google Sheets Structure

**Master Registry Sheet** (one, shared):
| Tab | Contents |
|-----|----------|
| `leagues` | leagueId, name, sheetId, active |

**Each League's Data Sheet** (one per league):
| Tab | Contents |
|-----|----------|
| `config` | League settings |
| `players` | Names, PINs, groups |
| `attendance` | Player × week status |
| `pairings` | Generated matchups |
| `scores` | Game results |

