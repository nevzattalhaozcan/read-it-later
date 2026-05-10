import React, { useState } from 'react';
import { Plus, Search, Loader2 } from 'lucide-react';
import { articleApi } from '../../api/articles';
import { useArticleStore } from '../../store/useArticleStore';

export const AddArticleForm: React.FC = () => {
  const [url, setUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { addArticle, setError } = useArticleStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setIsAdding(true);
    try {
      const newArticle = await articleApi.add(url);
      addArticle(newArticle);
      setUrl('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          {isAdding ? (
            <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
          ) : (
            <Plus className="w-5 h-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
          )}
        </div>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste an article URL to save..."
          className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-lg"
          disabled={isAdding}
        />
        <div className="absolute inset-y-2 right-2">
           <button 
             type="submit"
             disabled={!url || isAdding}
             className="px-6 h-full bg-primary-600 hover:bg-primary-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white rounded-xl font-semibold transition-colors flex items-center gap-2"
           >
             Save
           </button>
        </div>
      </form>
    </div>
  );
};
