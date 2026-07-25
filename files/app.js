// app.js — the browser side of Skylark.
//
// Flow: the user types a city -> we call our own /api/weather function ->
// it returns tidy JSON -> we paint it onto the page and recolor the sky.
// Everything below is broken into small single-purpose functions.

// ---- 1. tiny helpers ------------------------------------------------------
// $ is shorthand for "find one element by CSS selector". Saves typing
// document.querySelector everywhere.
const $ = (sel) => document.querySelector(sel);

// The unit preference lives in one place. "metric" = °C, "imperial" = °F.
// We remember the user's choice in localStorage so it survives a refresh.
let units = localStorage.getItem("units") || "metric";

// ---- 2. translate a weather code into words + an emoji --------------------
// Open-Meteo describes conditions as a WMO number (0 = clear, 61 = rain, …).
// This lookup turns a code into something a person can read and see. Each
// entry has a label, a daytime emoji, and a nighttime emoji.
const WEATHER = {
  0:  { label: "Clear sky",      day: "☀️", night: "🌙" },
  1:  { label: "Mainly clear",   day: "🌤️", night: "🌙" },
  2:  { label: "Partly cloudy",  day: "⛅", night: "☁️" },
  3:  { label: "Overcast",       day: "☁️", night: "☁️" },
  45: { label: "Fog",            day: "🌫️", night: "🌫️" },
  48: { label: "Rime fog",       day: "🌫️", night: "🌫️" },
  51: { label: "Light drizzle",  day: "🌦️", night: "🌧️" },
  53: { label: "Drizzle",        day: "🌦️", night: "🌧️" },
  55: { label: "Heavy drizzle",  day: "🌧️", night: "🌧️" },
  61: { label: "Light rain",     day: "🌦️", night: "🌧️" },
  63: { label: "Rain",           day: "🌧️", night: "🌧️" },
  65: { label: "Heavy rain",     day: "🌧️", night: "🌧️" },
  66: { label: "Freezing rain",  day: "🌧️", night: "🌧️" },
  67: { label: "Freezing rain",  day: "🌧️", night: "🌧️" },
  71: { label: "Light snow",     day: "🌨️", night: "🌨️" },
  73: { label: "Snow",           day: "❄️", night: "❄️" },
  75: { label: "Heavy snow",     day: "❄️", night: "❄️" },
  77: { label: "Snow grains",    day: "🌨️", night: "🌨️" },
  80: { label: "Rain showers",   day: "🌦️", night: "🌧️" },
  81: { label: "Rain showers",   day: "🌦️", night: "🌧️" },
  82: { label: "Violent showers",day: "⛈️", night: "⛈️" },
  85: { label: "Snow showers",   day: "🌨️", night: "🌨️" },
  86: { label: "Snow showers",   day: "🌨️", night: "🌨️" },
  95: { label: "Thunderstorm",   day: "⛈️", night: "⛈️" },
  96: { label: "Thunderstorm",   day: "⛈️", night: "⛈️" },
  99: { label: "Hailstorm",      day: "⛈️", night: "⛈️" },
};

// Look up a code, falling back to a neutral default if it's one we didn't map.
function describe(code, isDay) {
  const w = WEATHER[code] || { label: "—", day: "🌡️", night: "🌡️" };
  return { label: w.label, icon: isDay ? w.day : w.night };
}

// ---- 3. recolor the sky ---------------------------------------------------
// Pick a gradient from time-of-day and rough condition, then write it into
// the two CSS variables the stylesheet reads. Pure cosmetics.
function paintSky(code, isDay) {
  let top, bottom;
  const stormy = code >= 61;
  const cloudy = code === 3 || code === 45 || code === 48;

  if (!isDay) {
    top = "#1b2a4a"; bottom = "#3a4a63";          // night
  } else if (stormy) {
    top = "#6b7a8c"; bottom = "#aab4bf";          // grey, wet
  } else if (cloudy) {
    top = "#9fb2c4"; bottom = "#dfe6ec";          // flat overcast
  } else {
    top = "#8fc0ec"; bottom = "#e9eef2";          // bright day
  }
  document.documentElement.style.setProperty("--sky-top", top);
  document.documentElement.style.setProperty("--sky-bottom", bottom);
}

// ---- 4. recent-searches memory (localStorage stands in for a database) ----
// localStorage is a tiny key-value store built into every browser. It only
// holds text, so we JSON.stringify going in and JSON.parse coming out. This
// is where a real Postgres table would live if searches needed to be shared
// across devices — the shape of the data would be identical.
function getRecents() {
  try {
    return JSON.parse(localStorage.getItem("recents")) || [];
  } catch {
    return [];
  }
}

function addRecent(city) {
  // De-duplicate (case-insensitively), newest first, keep at most six.
  let list = getRecents().filter(
    (c) => c.toLowerCase() !== city.toLowerCase()
  );
  list.unshift(city);
  list = list.slice(0, 6);
  localStorage.setItem("recents", JSON.stringify(list));
  renderRecents();
}

// Draw the recent cities as clickable chips.
function renderRecents() {
  const box = $("#recents");
  const list = getRecents();
  box.innerHTML = list
    .map((c) => `<button class="chip" data-city="${c}">${c}</button>`)
    .join("");
  // Wire each chip to re-run a search when clicked.
  box.querySelectorAll(".chip").forEach((btn) => {
    btn.onclick = () => search(btn.dataset.city);
  });
}

// ---- 5. status line helpers ----------------------------------------------
function setStatus(msg, isError = false) {
  const el = $("#status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

// ---- 6. the network call --------------------------------------------------
// Ask our own serverless function for the weather. Note we call /api/weather,
// not Open-Meteo directly — the function does the two-step dance for us and
// hands back a clean object. Returns the data, or throws with a message.
async function fetchWeather(city) {
  const res = await fetch(
    `/api/weather?city=${encodeURIComponent(city)}&units=${units}`
  );
  const data = await res.json();
  if (!res.ok) {
    // Our function puts a human-readable reason in `error`.
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

// ---- 7. render the result -------------------------------------------------
// Take the tidy object from the API and build the DOM for it. Kept separate
// from fetching so the "what it looks like" logic is all in one place.
function renderWeather(data) {
  const { location, current, currentUnits, daily } = data;
  const isDay = current.is_day === 1;
  const cond = describe(current.weather_code, isDay);

  paintSky(current.weather_code, isDay);

  const place = [location.name, location.admin1, location.country]
    .filter(Boolean)
    .join(", ");

  const tempU = currentUnits.temperature_2m; // "°C" or "°F"
  const windU = currentUnits.wind_speed_10m; // "km/h" or "mph"

  const daysHtml = daily
    .map((d, i) => {
      const dc = describe(d.code, true);
      const name = i === 0 ? "Today" : weekday(d.date);
      const precip = d.precip != null ? `${d.precip}%` : "";
      return `
        <div class="day">
          <div class="day-name">${name}</div>
          <div class="day-icon">${dc.icon}</div>
          <div class="day-max">${d.max}°</div>
          <div class="day-min">${d.min}°</div>
          <div class="day-precip">${precip ? "💧 " + precip : ""}</div>
        </div>`;
    })
    .join("");

  $("#result").innerHTML = `
    <div class="now">
      <div class="now-place">${place}</div>
      <div class="now-sub">${location.timezone.replace("_", " ")}</div>
      <div class="now-main">
        <div class="now-icon">${cond.icon}</div>
        <div>
          <div class="now-temp">${Math.round(current.temperature_2m)}${tempU}</div>
          <div class="now-desc">${cond.label}</div>
          <div class="now-feels">Feels like ${Math.round(
            current.apparent_temperature
          )}${tempU}</div>
        </div>
      </div>
      <div class="now-stats">
        <div>
          <div class="stat-label">Humidity</div>
          <div class="stat-value">${current.relative_humidity_2m}%</div>
        </div>
        <div>
          <div class="stat-label">Wind</div>
          <div class="stat-value">${Math.round(
            current.wind_speed_10m
          )} ${windU}</div>
        </div>
      </div>
    </div>
    <div class="days">${daysHtml}</div>
  `;
  $("#result").hidden = false;
}

// Turn a "2026-07-24" date string into a short weekday like "Fri".
// We split the string by hand instead of `new Date(str)` because that parses
// as UTC midnight and can slip to the wrong day in western time zones.
function weekday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

// ---- 8. the orchestrator --------------------------------------------------
// One function that ties fetching, rendering, error handling and the
// recents list together. Everything else calls this.
async function search(city) {
  city = (city || "").trim();
  if (!city) return;

  $("#city-input").value = city;
  setStatus("Loading…");
  try {
    const data = await fetchWeather(city);
    renderWeather(data);
    setStatus("");
    // Store the tidy name the API confirmed, not the raw typed text.
    addRecent(data.location.name);
  } catch (err) {
    $("#result").hidden = true;
    setStatus(err.message, true);
  }
}

// ---- 9. flip between °C and °F -------------------------------------------
// Save the new preference, update the button label, and re-run the current
// search so the numbers convert immediately.
function toggleUnits() {
  units = units === "metric" ? "imperial" : "metric";
  localStorage.setItem("units", units);
  $("#unit-toggle").textContent = units === "metric" ? "°C" : "°F";
  const current = $("#city-input").value.trim();
  if (current) search(current);
}

// ---- 10. wire everything up on page load ----------------------------------
function init() {
  $("#unit-toggle").textContent = units === "metric" ? "°C" : "°F";
  $("#unit-toggle").onclick = toggleUnits;

  $("#search-form").onsubmit = (e) => {
    e.preventDefault(); // stop the browser reloading the page
    search($("#city-input").value);
  };

  renderRecents();

  // Open on the most recent city if there is one, otherwise a friendly default.
  const recents = getRecents();
  search(recents[0] || "San Francisco");
}

init();
