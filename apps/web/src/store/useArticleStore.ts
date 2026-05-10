import { create } from 'zustand';
import { Article } from '../types/article';

interface ArticleState {
  articles: Article[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setArticles: (articles: Article[]) => void;
  addArticle: (article: Article) => void;
  updateArticle: (id: string, updates: Partial<Article>) => void;
  removeArticle: (id: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useArticleStore = create<ArticleState>((set) => ({
  articles: [],
  isLoading: false,
  error: null,

  setArticles: (articles) => set({ articles }),
  addArticle: (article) => set((state) => ({ 
    articles: [article, ...state.articles] 
  })),
  updateArticle: (id, updates) => set((state) => ({
    articles: state.articles.map((a) => (a._id === id ? { ...a, ...updates } : a))
  })),
  removeArticle: (id) => set((state) => ({
    articles: state.articles.filter((a) => a._id !== id)
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
