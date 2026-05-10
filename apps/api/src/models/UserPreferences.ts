import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const UserPreferencesSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  lang:   { type: String, enum: ['tr', 'en'], default: 'tr' },
  theme:  { type: String, enum: ['light', 'dark', 'sepia'], default: 'light' },
}, { timestamps: true });

export const UserPreferences = models.UserPreferences || model('UserPreferences', UserPreferencesSchema);
