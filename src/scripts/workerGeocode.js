// src/scripts/workerGeocode.js
import { parentPort, workerData } from 'worker_threads';
import https from 'https';

async function geocode(name, city) {
  return new Promise((resolve) => {
    const query = encodeURIComponent(`${name}, ${city}, India`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

    https
      .get(
        url,
        { headers: { 'User-Agent': 'ServiceAreaMapper/1.0' } },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.length > 0)
                resolve([parseFloat(json[0].lat), parseFloat(json[0].lon)]);
              else resolve(null);
            } catch {
              resolve(null);
            }
          });
        }
      )
      .on('error', () => resolve(null));
  });
}

(async () => {
  const coords = await geocode(workerData.name, workerData.city);
  parentPort.postMessage(coords);
})();
