import mongoose from 'mongoose';
const { Schema } = mongoose;

const StatusHistoryEntry = new Schema({
  status:    { type: String, required: true },
  changedBy: String,   // 'system', 'dept:Roads', 'citizen', 'cctv'
  note:      String,
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const IncidentSchema = new Schema({
  status: {
    type: String,
    enum: ['reported', 'acknowledged', 'assigned', 'in_progress', 'resolved_verified', 'disputed'],
    default: 'reported',
  },
  category:    String,
  department:  { type: Schema.Types.ObjectId, ref: 'Department' },
  ward:        { type: String, required: true },
  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  urgency:         { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  priorityScore:   { type: Number, default: 0 },
  occurrenceCount: { type: Number, default: 1 },
  sourceCount:     { type: Number, default: 1 },
  sources:         [String],          // ['citizen','cctv'] — data silo proof
  assignedTeam:    { type: Schema.Types.ObjectId, ref: 'FieldTeam' },
  resolutionPhotoUrl: String,
  resolvedAt:      Date,
  slaBreached:     { type: Boolean, default: false },
  statusHistory:   [StatusHistoryEntry],
}, { timestamps: true });

IncidentSchema.index({ location: '2dsphere' });
IncidentSchema.index({ status: 1 });
IncidentSchema.index({ ward: 1 });
IncidentSchema.index({ department: 1 });
IncidentSchema.index({ priorityScore: -1 });

export default mongoose.model('Incident', IncidentSchema);
