import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import config from '../config/env.js';
import Department from '../models/Department.js';
import FieldTeam from '../models/FieldTeam.js';
import SensitiveZone from '../models/SensitiveZone.js';
import Signal from '../models/Signal.js';
import Incident from '../models/Incident.js';
import { correlateSignal } from '../services/correlationEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_DEPT_MAP = {
  pothole:    'GVMC General',
  road:       'GVMC General',
  garbage:    'GVMC General',
  waste:      'GVMC General',
  water:      'Health & Emergency', // Routing to Health for demo purposes
  drainage:   'Health & Emergency',
  electrical: 'Electrical',
  medical:    'Health & Emergency',
  crime:      'Police/Security',
  security:   'Police/Security',
};

async function seed() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('✅ Connected to MongoDB');

    // 1. Clear database
    console.log('🧹 Clearing database...');
    await Promise.all([
      Department.deleteMany(),
      FieldTeam.deleteMany(),
      SensitiveZone.deleteMany(),
      Signal.deleteMany(),
      Incident.deleteMany(),
    ]);

    // 2. Create Departments (Only 4)
    console.log('🏢 Creating Departments...');
    const defaultPinHash = await bcrypt.hash('1234', 10);
    const depts = [
      { name: 'Electrical', code: 'ELECTRICAL', passwordHash: defaultPinHash },
      { name: 'Health & Emergency', code: 'HEALTH', passwordHash: defaultPinHash },
      { name: 'Police/Security', code: 'POLICE', passwordHash: defaultPinHash },
      { name: 'GVMC General', code: 'GVMC', passwordHash: defaultPinHash },
    ];
    await Department.insertMany(depts);

    // 3. Load ward data & SensitiveZones
    const wardDataPath = path.join(__dirname, '../../../shared/wardData.json');
    const wardData = JSON.parse(fs.readFileSync(wardDataPath, 'utf8'));
    
    console.log('🏥 Creating Sensitive Zones...');
    await SensitiveZone.insertMany(wardData.sensitiveZones.map(z => ({
      name: z.name,
      type: z.type,
      location: {
        type: 'Point',
        coordinates: z.coordinates,
      }
    })));

    // 4. Create Field Teams (4 per ward, exactly 1 per department)
    console.log('👷 Creating Field Teams...');
    const teams = [];
    const deptDocs = await Department.find();
    
    for (const ward of wardData.wards) {
      for (const dept of deptDocs) {
        // Jitter location slightly around ward center
        const jitter = [ward.center[0] + (Math.random() - 0.5) * 0.02, ward.center[1] + (Math.random() - 0.5) * 0.02];
        
        teams.push({
          department: dept._id,
          name: `Team ${dept.code} - ${ward.name.split(' - ')[0]}`,
          ward: ward.name,
          location: { type: 'Point', coordinates: jitter },
          status: 'available',
        });
      }
    }
    await FieldTeam.insertMany(teams);

    // 5. Load Complaints & Correlate
    console.log('🚨 Loading Complaints...');
    const csvPath = path.join(__dirname, '../../../seed-data/complaints.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',');
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      const row = {};
      headers.forEach((h, idx) => {
        let val = values[idx];
        if (val) row[h.trim()] = val.replace(/^"|"$/g, '').trim();
      });
      
      if (!row.category) continue;
      
      // Calculate a backdated time (between 0 and 48 hours ago)
      const backdatedMs = Math.floor(Math.random() * 48 * 60 * 60 * 1000);
      const createdAt = new Date(Date.now() - backdatedMs);

      const signal = await Signal.create({
        source: row.source,
        description: row.description,
        ward: row.ward,
        category: row.category,
        urgency: row.urgency,
        location: {
          type: 'Point',
          coordinates: [parseFloat(row.lon), parseFloat(row.lat)],
        },
        phone: row.phone,
        confidence: 0.9,
      });

      // Hack the createdAt manually in MongoDB
      await Signal.updateOne({ _id: signal._id }, { $set: { createdAt, updatedAt: createdAt } });

      signal.departmentName = CATEGORY_DEPT_MAP[row.category] || 'GVMC General';
      
      const incident = await correlateSignal(signal);
      
      // Hack the incident createdAt manually to match the signal's age
      // Only do this if it's the first signal, otherwise the engine updated it
      if (incident.sourceCount === 1) {
        await Incident.updateOne({ _id: incident._id }, { $set: { createdAt, updatedAt: createdAt } });
      }
    }

    console.log('🔗 Generating Data Silo Demo Scenarios...');
    // Scenario A: The Multi-System Emergency
    const sA1 = await Signal.create({ source: 'citizen', description: 'Huge accident and traffic jam', ward: 'Ward 18 - Maddilapalem', category: 'medical', urgency: 'critical', location: { type: 'Point', coordinates: [83.3195, 17.7335] }, phone: '9988776655', confidence: 0.9, departmentName: 'Health & Emergency' });
    await correlateSignal(sA1);
    
    const sA2 = await Signal.create({ source: 'cctv', description: 'Traffic anomaly detected: severe congestion', ward: 'Ward 18 - Maddilapalem', category: 'medical', urgency: 'high', location: { type: 'Point', coordinates: [83.3196, 17.7336] }, confidence: 0.85, departmentName: 'Health & Emergency' });
    await correlateSignal(sA2);
    
    const sA3 = await Signal.create({ source: 'traffic', description: 'Accident reported on highway, need ambulance', ward: 'Ward 18 - Maddilapalem', category: 'medical', urgency: 'critical', location: { type: 'Point', coordinates: [83.3194, 17.7334] }, confidence: 0.95, departmentName: 'Health & Emergency' });
    await correlateSignal(sA3);

    // Scenario B: Cross-Department Alert
    const sB1 = await Signal.create({ source: 'field_team', description: 'Garbage truck broke down here, unable to clear bin', ward: 'Ward 8 - Seethammadhara', category: 'garbage', urgency: 'medium', location: { type: 'Point', coordinates: [83.3000, 17.7400] }, confidence: 0.9, departmentName: 'GVMC General' });
    await correlateSignal(sB1);
    
    const sB2 = await Signal.create({ source: 'citizen', description: 'Garbage is piling up on the street, smells terrible', ward: 'Ward 8 - Seethammadhara', category: 'garbage', urgency: 'low', location: { type: 'Point', coordinates: [83.3001, 17.7401] }, phone: '8877665544', confidence: 0.8, departmentName: 'GVMC General' });
    await correlateSignal(sB2);

    console.log('✅ Seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
