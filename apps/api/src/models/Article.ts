import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const ArticleSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  url: { type: String, required: true }, // Removed unique: true because different users can have same URL
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
  isPending: { type: Boolean, default: false },
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

ArticleSchema.index({ owner: 1, url: 1 }, { unique: true });

export const Article = models.Article || model('Article', ArticleSchema);
