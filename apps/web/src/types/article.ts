export interface Article {
  _id: string;
  url: string;
  title: string;
  description?: string;
  content?: string;
  textContent?: string;
  byline?: string;
  siteName?: string;
  favicon?: string;
  coverImage?: string;
  tags: string[];
  isRead: boolean;
  isFavorite: boolean;
  readingTimeMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export type NewArticle = Pick<Article, 'url'>;
