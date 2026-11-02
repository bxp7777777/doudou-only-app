/* 天气走后端 /api/weather，避免跨域，也不用在前端放任何 key */
export async function load() {
  try {
    const res = await fetch('/api/weather', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status ' + res.status);
    const json = await res.json();
    const cities = Array.isArray(json.cities) ? json.cities : [];
    return { cities, status: cities.length ? 'ok' : 'fail' };
  } catch {
    return { cities: [], status: 'fail' };
  }
}