
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workerPath = path.resolve(__dirname, 'workerGeocode.js');

function runWorker(name, city) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { name, city },
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

async function test() {
  const tests = [
    { name: 'Dharampeth', city: 'Nagpur' },
    { name: 'Burdi', city: 'Nagpur' },
    { name: 'Laxmi Nagar', city: 'Nagpur' },
    { name: 'Jaripatka', city: 'Nagpur' },
    { name: 'Khamla', city: 'Nagpur' },
    { name: 'Medical Square', city: 'Nagpur' },
    { name: 'Sonegaon', city: 'Nagpur' },
  ];

  for (const t of tests) {
    console.log(`Testing ${t.name}, ${t.city}...`);
    try {
      const coords = await runWorker(t.name, t.city);
      console.log(`Result: ${JSON.stringify(coords)}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
    }
  }
}

test();
