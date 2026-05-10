import React from 'react';
import { Article } from '../../types/article';
import { Clock, Bookmark, Star, Trash2, Check } from 'lucide-react';
import { useArticleStore } from '../../store/useArticleStore';
import { articleApi } from '../../api/articles';

interface ArticleCardProps {
  article: Article;
  onOpen: (article: Article) => void;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({ article, onOpen }) => {
  const { updateArticle, removeArticle } = useArticleStore();

  const toggleRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await articleApi.update(article._id, { isRead: !article.isRead });
      updateArticle(article._id, updated);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await articleApi.update(article._id, { isFavorite: !article.isFavorite });
      updateArticle(article._id, updated);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteArticle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure?')) return;
    try {
      await articleApi.delete(article._id);
      removeArticle(article._id);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div 
      onClick={() => onOpen(article)}
      className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col h-full"
    >
      <div className="relative h-48 overflow-hidden bg-slate-100 dark:bg-slate-800">
        {article.coverImage ? (
          <img 
            src={article.coverImage} 
            alt={article.title} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-700">
            <Bookmark className="w-12 h-12" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
           <button 
             onClick={toggleFavorite}
             className={`p-2 rounded-full glass ${article.isFavorite ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'} transition-colors`}
           >
             <Star className={`w-4 h-4 ${article.isFavorite ? 'fill-current' : ''}`} />
           </button>
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-3">
          {article.favicon && <img src={article.favicon} alt="" className="w-4 h-4 rounded-sm" />}
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
            {article.siteName || new URL(article.url).hostname}
          </span>
        </div>
        
        <h3 className="text-lg font-bold line-clamp-2 mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
          {article.title}
        </h3>
        
        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-4 flex-1">
          {article.description}
        </p>

        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {article.readingTimeMinutes} min
            </span>
          </div>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={toggleRead}
              className={`p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${article.isRead ? 'text-green-500' : 'text-slate-400'}`}
              title={article.isRead ? 'Mark as unread' : 'Mark as read'}
            >
              <Check className="w-4 h-4" />
            </button>
            <button 
              onClick={deleteArticle}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
