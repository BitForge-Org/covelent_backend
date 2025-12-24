// src/scripts/workerGeocode.js
import { parentPort, workerData } from 'worker_threads';
import https from 'https';

async function geocode(name, city, pincode) {
  return new Promise((resolve) => {
    let queryName = name;
    let queryCity = city;

    // Use provided pincode if available for better accuracy
    if (pincode) {
      queryName = `${name}, ${pincode}`;
    }

    const query = encodeURIComponent(`${queryName}, ${queryCity}, India`);
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
  const coords = await geocode(
    workerData.name,
    workerData.city,
    workerData.pincode
  );
  parentPort.postMessage(coords);
})();
