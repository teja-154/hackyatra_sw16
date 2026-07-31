import mongoose from 'mongoose';
const { Schema } = mongoose;

const SensitiveZoneSchema = new Schema({
  name:   { type: String, required: true },
  type:   { type: String, enum: ['school', 'hospital', 'govt_building'] },
  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
});

SensitiveZoneSchema.index({ location: '2dsphere' });

export default mongoose.model('SensitiveZone', SensitiveZoneSchema);
