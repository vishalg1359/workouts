# Workouts

A personal workout tracker that runs as a home-screen web app on iPhone. It has no dependencies, works offline, and keeps all data on the phone.

**App:** https://vishalg1359.github.io/workouts/

## Install on iPhone
1. Open the link above in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.

The app opens full screen and works offline from then on. It doesn't expire and needs no maintenance.

## Features
- **Log tab:** older days are above, today is in the middle, and upcoming days are below. Days with workouts appear as large cards. Runs of empty days shrink to one thin line; tap it to open those days. **Go to date** jumps to any day.
- **Day names:** type a name right next to the date, or pick one from the ▾ list (Upper Day, Lower Day, …). You can edit that list.
- **Exercises tab:** holds only the exercises you create. Each one is built from blocks, e.g. `[3] sets × [ ] reps at [ ] lb`: a number box (blank or with a default) plus a unit dropdown (sets, reps, lb, kg, sec, min, … or any custom word). Pictures are optional; choose one from Photos (saved as a tiny ~5 KB icon) or paste a link.
- **Logging:** tap **+ Add exercise** on a day, pick one of your exercises, then fill in the blank numbers and switch units right on the card.
- **Profile tab:** name, birthday/age, height, weight, units (lb·ft / kg·cm), Light/Dark/Auto appearance, colors, and GitHub backup.

## Data and privacy
- Everything is saved in the browser's local storage on your phone. Nothing is sent to a server.
- Photos are saved as tiny icons inside the app. Picture links are loaded from the web, so those icons appear only when you're online.
- iOS can clear website data in rare cases, such as when the phone is critically low on storage. Connect GitHub backup in Profile: paste a fine-grained token limited to one private repo (Contents: read and write). The token stays on the phone; the app saves `workouts.json` to that repo about a minute after changes, and Restore brings it back on any phone.

## Files
| File | Purpose |
| --- | --- |
| `index.html` | App layout |
| `styles.css` | Styling (light and dark mode) |
| `app.js` | All app logic and storage |
| `sw.js` | Service worker that lets the app work offline |
| `manifest.webmanifest`, `*.png` | Home-screen name and icons |

## Updating
Push changes to `main`. GitHub Pages redeploys automatically, and the app picks up the update the next time it opens online. The service worker fetches fresh files whenever the phone is online and falls back to its saved copy when offline.
