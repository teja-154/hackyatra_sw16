import mongoose from 'mongoose';
const { Schema } = mongoose;

const FieldTeamSchema = new Schema({
  department: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  name:       { type: String, required: true },
  ward:       { type: String, required: true },
  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },  // [lon, lat]
  },
  lastPing: Date,
  status:   { type: String, enum: ['available', 'busy', 'offline'], default: 'available' },
}, { timestamps: true });

FieldTeamSchema.index({ location: '2dsphere' });
FieldTeamSchema.index({ ward: 1, status: 1 });

export default mongoose.model('FieldTeam', FieldTeamSchema);
