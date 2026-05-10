import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const UserPreferencesSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  lang:   { type: String, enum: ['tr', 'en'], default: 'tr' },
  theme:  { type: String, enum: ['light', 'dark', 'sepia'], default: 'light' },
  fontSizeIdx: { type: Number, min: 0, max: 4, default: 2 },
  widthIdx: { type: Number, min: 0, max: 2, default: 1 },
}, { timestamps: true });

export const UserPreferences = models.UserPreferences || model('UserPreferences', UserPreferencesSchema);
