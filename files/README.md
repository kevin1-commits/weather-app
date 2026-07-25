# Skylark — a tiny weather app

Search any city, get current conditions and a 5-day forecast. The sky in the
background shifts with the time of day and the weather. No API key, no tracking,
no cost.

Built with plain HTML, CSS and JavaScript plus one Vercel serverless function.
No build step and no dependencies to install.

## How it fits together

```
weather-app/
  index.html        the page (structure only)
  style.css         the looks
  app.js            frontend logic, split into small functions
  api/weather.js    a serverless function: city name -> weather JSON
  package.json      declares Node 18+ (for the built-in fetch)
  vercel.json       one line of Vercel config
```

The data flow: you type a city, the browser calls **our own** `/api/weather`
endpoint, that function calls Open-Meteo twice (once to turn the name into
coordinates, once to get the forecast), tidies the result, and hands it back.
The browser paints it.

Calling our own function instead of Open-Meteo directly is the pattern you'd
need the moment you add a secret API key or a database — both would live in
`api/weather.js`, where the browser can't see them.

## About the "database"

This app doesn't use a real database. Recent searches are saved with the
browser's built-in `localStorage`, which is perfect when the data only needs to
live on one device. The code comment in `app.js` (section 4) marks the exact
spot where a hosted Postgres table would slot in if you ever wanted your
searches synced across devices — the shape of the data wouldn't change.

Why not SQLite, the usual "just a file" database? Vercel is serverless: your
code runs in short-lived functions with no permanent disk, so a SQLite file
written during one request may be gone by the next. On Vercel you'd reach for a
hosted Postgres (or a SQLite host like Turso) instead.

## Run it locally

The simplest way, which serves the static files but **not** the `/api` function:

```bash
# from inside the weather-app folder
python3 -m http.server 3000
# then open http://localhost:3000
```

Note: with the plain static server above, `/api/weather` won't exist, so
searches will fail. To run the serverless function locally too, use Vercel's dev
server (see below) — it emulates the real thing.

## Deploy to Vercel — step by step

You'll run these commands yourself; each one is safe and explained.

**1. Install the Vercel command-line tool** (one time, globally):

```bash
npm install -g vercel
```

**2. Log in** (opens your browser to authenticate):

```bash
vercel login
```

**3. From inside the `weather-app` folder, deploy a preview:**

```bash
cd weather-app
vercel
```

The first time, it asks a few questions. Safe answers:
- *Set up and deploy?* → **Y**
- *Which scope?* → your own account
- *Link to existing project?* → **N**
- *Project name?* → press Enter to accept, or type one
- *In which directory is your code?* → **./** (just press Enter)
- It auto-detects the rest. Accept the defaults.

When it finishes it prints a preview URL. Open it — that's your app running live.

**4. Ship it to production** (the permanent URL):

```bash
vercel --prod
```

That's the whole deploy. No environment variables, no database to provision,
nothing else to configure, because Open-Meteo needs no key.

### Optional: test the serverless function locally first

If you want to see `/api/weather` work on your machine before deploying:

```bash
vercel dev
# then open the URL it prints (usually http://localhost:3000)
```

This runs the exact same serverless environment locally, so the API function
works just like it will in production.

## If something goes wrong

- **Searches fail with a static server** — expected; the `/api` function only
  runs under `vercel dev` or on Vercel itself. Use `vercel dev`.
- **"City not found"** — try adding a country, e.g. `Paris, France`.
- **Blank forecast** — open the browser console (F12) and check the Network tab
  for the `/api/weather` request; the response body will contain a plain-English
  `error` field explaining what failed.

## Credits

Weather data from [Open-Meteo](https://open-meteo.com), free for non-commercial
use under CC BY 4.0.
