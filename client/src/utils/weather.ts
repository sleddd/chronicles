/* Weather + places for the dashboard, from Open-Meteo (no key; allowed in the
   CSP). City names and coordinates are the user's own and stay in their
   encrypted dashboard settings — only the coordinates are sent to Open-Meteo. */

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
  /** IANA time zone, e.g. "America/Los_Angeles" */
  timezone: string;
}

export interface CurrentWeather {
  tempF: number;
  code: number;
  isDay: boolean;
}

/** First match for a city name ("Portland" or "Portland, OR"). */
export async function findPlace(query: string): Promise<Place> {
  const [cityPart, qualifierRaw] = query.split(',');
  const qualifier = qualifierRaw?.trim().toLowerCase() ?? '';
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityPart.trim())}&count=10&language=en&format=json`);
  const data = await res.json() as { results?: { name: string; latitude: number; longitude: number; timezone: string; admin1?: string; country?: string; country_code?: string }[] };
  if (!data.results?.length) throw new Error(`Couldn't find "${query}"`);
  const hit = (qualifier && data.results.find(r =>
    r.admin1?.toLowerCase().startsWith(qualifier) || r.country_code?.toLowerCase() === qualifier || r.country?.toLowerCase().startsWith(qualifier),
  )) || data.results[0];
  return { name: hit.name, latitude: hit.latitude, longitude: hit.longitude, timezone: hit.timezone };
}

export async function currentWeather(p: Place): Promise<CurrentWeather> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}` +
    '&current=temperature_2m,weather_code,is_day&temperature_unit=fahrenheit&timezone=auto&forecast_days=1',
  );
  const data = await res.json() as { current: { temperature_2m: number; weather_code: number; is_day: number } };
  return { tempF: Math.round(data.current.temperature_2m), code: data.current.weather_code, isDay: data.current.is_day === 1 };
}

/** WMO weather code → a short label and a Material Symbols glyph. */
export function describeWeather(code: number, isDay: boolean): { label: string; icon: string } {
  if (code === 0) return isDay ? { label: 'Sunny', icon: 'light_mode' } : { label: 'Clear', icon: 'dark_mode' };
  if (code <= 2) return { label: 'Partly cloudy', icon: isDay ? 'partly_cloudy_day' : 'partly_cloudy_night' };
  if (code === 3) return { label: 'Cloudy', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'foggy' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'rainy' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain', icon: 'rainy' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', icon: 'weather_snowy' };
  if (code >= 95) return { label: 'Storms', icon: 'thunderstorm' };
  return { label: 'Cloudy', icon: 'cloud' };
}

/** Hours between a time zone and the browser's, e.g. +3, -8, +16. */
export function hoursFromLocal(timezone: string, now = new Date()): number {
  const at = (tz?: string) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now).reduce<Record<string, string>>((o, p) => ({ ...o, [p.type]: p.value }), {});
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  };
  // An unknown zone throws in Intl — show it as local rather than breaking the clocks
  try { return Math.round((at(timezone) - at(undefined)) / 3_600_000); } catch { return 0; }
}
