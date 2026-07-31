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

    // 5. Load Curated Demo Complaints & Correlate
    console.log('🚨 Loading Curated Demo Dataset...');
    const curatedIncidents = [
      { source: 'citizen', description: 'Streetlight is not working, completely dark street', ward: 'Ward 5 - MVP Colony', category: 'streetlight', urgency: 'medium', location: [83.3330, 17.7405], photoUrl: 'https://images.unsplash.com/photo-1542125586-7a7605e55dcb?w=400&q=80', phone: '9988776650', dept: 'Electrical' },
      { source: 'citizen', description: 'Large pothole causing traffic slowdown', ward: 'Ward 12 - Dwaraka Nagar', category: 'pothole', urgency: 'high', location: [83.3080, 17.7280], photoUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=400&q=80', phone: '9988776651', dept: 'GVMC General' },
      { source: 'field_team', description: 'Transformer sparking dangerously', ward: 'Ward 18 - Maddilapalem', category: 'electricity', urgency: 'critical', location: [83.3220, 17.7340], photoUrl: 'https://images.unsplash.com/photo-1621252179027-94459d278660?w=400&q=80', phone: '9988776652', dept: 'Electrical' },
      { source: 'citizen', description: 'Water pipe burst, flooding street', ward: 'Ward 1 - Bheemili', category: 'water', urgency: 'high', location: [83.4480, 17.8900], photoUrl: 'https://images.unsplash.com/photo-1563299796-189f30be0fbb?w=400&q=80', phone: '9988776653', dept: 'GVMC General' },
      { source: 'citizen', description: 'Suspicious gathering near the park', ward: 'Ward 22 - Akkayyapalem', category: 'crime', urgency: 'high', location: [83.3030, 17.7300], photoUrl: 'https://images.unsplash.com/photo-1598282386345-09d57a949666?w=400&q=80', phone: '9988776654', dept: 'Police/Security' },
      { source: 'citizen', description: 'Massive garbage pile uncollected for 3 days', ward: 'Ward 30 - Siripuram', category: 'garbage', urgency: 'medium', location: [83.3200, 17.7200], photoUrl: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=400&q=80', phone: '9988776656', dept: 'GVMC General' },
      { source: 'cctv', description: 'Stray dog pack aggressive towards pedestrians', ward: 'Ward 35 - Gajuwaka', category: 'animal', urgency: 'high', location: [83.2180, 17.6900], photoUrl: 'https://images.unsplash.com/photo-1544568100-847a948585b9?w=400&q=80', phone: '9988776657', dept: 'Health & Emergency' }
    ];

    for (const row of curatedIncidents) {
      const backdatedMs = Math.floor(Math.random() * 24 * 60 * 60 * 1000); // within last 24 hours
      const createdAt = new Date(Date.now() - backdatedMs);

      const signal = await Signal.create({
        source: row.source,
        description: row.description,
        ward: row.ward,
        category: row.category,
        urgency: row.urgency,
        photoUrl: row.photoUrl,
        location: {
          type: 'Point',
          coordinates: row.location,
        },
        phone: row.phone,
        confidence: 0.95,
      });

      await Signal.updateOne({ _id: signal._id }, { $set: { createdAt, updatedAt: createdAt } });
      signal.departmentName = row.dept;
      
      const incident = await correlateSignal(signal);
      
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
