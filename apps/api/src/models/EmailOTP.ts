import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const EmailOTPSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  code: { type: String, required: true },
  purpose: { type: String, required: true }, // 'verify' | 'reset'
  used: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

// TTL index to auto-delete expired OTPs
EmailOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailOTP = models.EmailOTP || model('EmailOTP', EmailOTPSchema);
