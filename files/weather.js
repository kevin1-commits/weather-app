// api/weather.js
//
// This is a Vercel serverless function. Vercel turns any file in /api into a
// live endpoint, so this file is reachable at /api/weather. When a request
// comes in, Vercel runs the exported `handler` function below and sends
// whatever we respond with back to the browser.
//
// The job: take a city name, and return current weather + a short forecast.
// We do it in two hops against Open-Meteo (no API key needed):
//   1. geocode(city)     city name        -> latitude / longitude
//   2. getForecast(...)  lat / lng        -> weather numbers
// Then we bundle the useful bits into one tidy object for the frontend.

// --- helper 1: turn a place name into coordinates -------------------------
// Open-Meteo's geocoding endpoint takes ?name=... and returns a list of
// matching places. We take the first (best) match. If nothing matches, we
// return null so the caller can show a friendly "city not found" message.
async function geocode(city) {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search" +
    "?name=" + encodeURIComponent(city) +
    "&count=1&language=en&format=json";

  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocoding service failed");

  const data = await res.json();
  // `results` is missing entirely when there are no matches, so check for it.
  if (!data.results || data.results.length === 0) return null;

  const place = data.results[0];
  return {
    name: place.name,
    country: place.country || "",
    admin1: place.admin1 || "",     // state / region, e.g. "California"
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone || "auto",
  };
}

// --- helper 2: turn coordinates into weather ------------------------------
// We ask for three things in one request:
//   current  - conditions right now
//   daily    - min/max + weather code for the next several days
//   units    - we pass the caller's preference (celsius or fahrenheit)
async function getForecast(lat, lng, timezone, units) {
  const tempUnit = units === "imperial" ? "fahrenheit" : "celsius";
  const windUnit = units === "imperial" ? "mph" : "kmh";

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + lat +
    "&longitude=" + lng +
    "&timezone=" + encodeURIComponent(timezone) +
    "&temperature_unit=" + tempUnit +
    "&wind_speed_unit=" + windUnit +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature," +
    "is_day,weather_code,wind_speed_10m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min," +
    "precipitation_probability_max" +
    "&forecast_days=5";

  const res = await fetch(url);
  if (!res.ok) throw new Error("Forecast service failed");
  return res.json();
}

// --- helper 3: reshape the forecast into a small, frontend-friendly list --
// Open-Meteo returns daily data as parallel arrays (one array of dates, one
// of highs, one of lows, and so on). That's efficient but awkward to loop
// over in the UI, so we zip them into an array of little day objects.
function buildDailyList(daily) {
  const out = [];
  for (let i = 0; i < daily.time.length; i++) {
    out.push({
      date: daily.time[i],
      code: daily.weather_code[i],
      max: Math.round(daily.temperature_2m_max[i]),
      min: Math.round(daily.temperature_2m_min[i]),
      precip: daily.precipitation_probability_max[i],
    });
  }
  return out;
}

// --- the handler: the function Vercel actually calls ----------------------
// `req` is the incoming request, `res` is how we reply. This ties the three
// helpers together and handles the things that can go wrong.
export default async function handler(req, res) {
  // Read the query string, e.g. /api/weather?city=Watsonville&units=imperial
  const city = (req.query.city || "").trim();
  const units = req.query.units === "imperial" ? "imperial" : "metric";

  // Guard: no city, no work to do.
  if (!city) {
    return res.status(400).json({ error: "Please provide a city name." });
  }

  try {
    const location = await geocode(city);
    if (!location) {
      return res
        .status(404)
        .json({ error: `Couldn't find a place called "${city}".` });
    }

    const forecast = await getForecast(
      location.latitude,
      location.longitude,
      location.timezone,
      units
    );

    // Send back only what the UI needs, in a clean shape.
    return res.status(200).json({
      location,
      units,
      current: forecast.current,
      currentUnits: forecast.current_units,
      daily: buildDailyList(forecast.daily),
    });
  } catch (err) {
    // Any network or parsing failure lands here so the UI never hangs.
    return res
      .status(502)
      .json({ error: "Weather service is unavailable right now." });
  }
}
