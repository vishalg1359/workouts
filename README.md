# Workouts

A personal workout tracker that runs as a home-screen web app on iPhone. It has no dependencies, works offline, and keeps all data on the phone.

**App:** https://vishalg1359.github.io/workouts/

## Install on iPhone
1. Open the link above in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.

The app opens full screen and works offline from then on. It doesn't expire and needs no maintenance.

## Features
- **Calendar:** a scrolling list of days with a line between each one. Tap **Go to date** to jump to any day.
- **Day names:** type a name right next to the date, or pick one from the ▾ list (Upper Day, Lower Day, …). You can edit that list.
- **Exercises tab:** holds only the exercises you create. Each has a name, free-text details (e.g. `3 sets x 8 reps`) and an optional picture link that shows as a small icon.
- **Logging:** tap **+** on a day and pick one of your exercises. Exercises for each day appear in the order you add them.
- **Backup:** export or import a JSON file from the Exercises tab.

## Data and privacy
- Everything is saved in the browser's local storage on your phone. Nothing is sent to a server.
- Pictures are stored only as links, so icons appear only when you're online.
- iOS can clear website data in rare cases, such as when the phone is critically low on storage. Export a backup now and then.

## Files
| File | Purpose |
| --- | --- |
| `index.html` | App layout |
| `styles.css` | Styling (light and dark mode) |
| `app.js` | All app logic and storage |
| `sw.js` | Service worker that lets the app work offline |
| `manifest.webmanifest`, `*.png` | Home-screen name and icons |

## Updating
Push changes to `main`. GitHub Pages redeploys automatically, and the app picks up the update the next time it opens online. When you change files, bump `CACHE` in `sw.js` (e.g. `workouts-v2`).
