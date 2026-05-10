import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const ArticleSchema = new Schema({
  url: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  content: { type: String }, // Full text content
  textContent: { type: String }, // Plain text version
  byline: { type: String }, // Author
  siteName: { type: String },
  favicon: { type: String },
  coverImage: { type: String },
  tags: [{ type: String }],
  folder: { type: String, default: 'Inbox' },
  isRead: { type: Boolean, default: false },
  isFavorite: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },
  readingTimeMinutes: { type: Number },
  highlights: [{
    id: { type: String, required: true },
    text: { type: String, required: true },
    prefix: { type: String, default: '' },
    suffix: { type: String, default: '' },
    startOffset: { type: Number },
    note: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export const Article = models.Article || model('Article', ArticleSchema);
