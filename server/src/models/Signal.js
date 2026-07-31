import mongoose from 'mongoose';
const { Schema } = mongoose;

const SignalSchema = new Schema({
  idempotencyKey: { type: String, unique: true, sparse: true },
  source:         { type: String, enum: ['citizen', 'cctv', 'field_team', 'traffic'], required: true },
  description:    { type: String, required: true },
  photoUrl:       String,
  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true },  // [lon, lat]
  },
  ward:       { type: String, required: true },
  category:   String,
  confidence: { type: Number, default: 0 },
  aiFailed:   { type: Boolean, default: false },
  incident:   { type: Schema.Types.ObjectId, ref: 'Incident' },
  phone:      String,
}, { timestamps: true });

SignalSchema.index({ location: '2dsphere' });
SignalSchema.index({ incident: 1 });
SignalSchema.index({ ward: 1 });

export default mongoose.model('Signal', SignalSchema);
