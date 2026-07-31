import mongoose from 'mongoose';
const { Schema } = mongoose;

const DepartmentSchema = new Schema({
  name:         { type: String, required: true, unique: true },
  code:         { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model('Department', DepartmentSchema);
