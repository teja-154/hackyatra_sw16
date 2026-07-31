import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import config from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let simulatorTimer = null;

/**
 * Start the CCTV simulator.
 * Parses the cctv_events.csv file and fires them at the /api/sensors/cctv endpoint
 * periodically (e.g., every 30-60 seconds) during the demo.
 */
export function startCCTVSimulator(intervalMs = 45000) {
  if (simulatorTimer) return;

  const csvPath = path.resolve(__dirname, '../../../seed-data/cctv_events.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.warn('⚠️ CCTV Simulator: seed-data/cctv_events.csv not found');
    return;
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = fileContent.split('\n').filter(l => l.trim() !== '');
  const headers = lines[0].split(',');
  const events = lines.slice(1).map(line => {
    const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
    const obj = {};
    headers.forEach((header, i) => {
      let val = values[i];
      if (val) {
        val = val.replace(/^"|"$/g, ''); // Remove quotes
        obj[header.trim()] = val.trim();
      }
    });
    return obj;
  });

  if (events.length === 0) return;

  console.log(`🎥 CCTV Simulator started: ${events.length} events loaded. Emitting every ${intervalMs}ms.`);
  let eventIndex = 0;

  simulatorTimer = setInterval(async () => {
    if (eventIndex >= events.length) {
      console.log('🎥 CCTV Simulator: All events emitted. Stopping.');
      clearInterval(simulatorTimer);
      return;
    }

    const event = events[eventIndex];
    
    try {
      await axios.post(`http://localhost:${config.port}/api/sensors/cctv`, {
        description: event.description,
        camera_id: event.camera_id,
        event_type: event.event_type,
        ward: event.ward,
        lat: parseFloat(event.lat),
        lon: parseFloat(event.lon),
        confidence: 0.9, // Mock high confidence
      });
      console.log(`🎥 CCTV Simulator: Emitted event ${eventIndex + 1}/${events.length} - ${event.event_type} in ${event.ward}`);
    } catch (err) {
      console.error(`🎥 CCTV Simulator: Failed to emit event ${eventIndex + 1}`, err.message);
    }
    
    eventIndex++;
  }, intervalMs);
}
