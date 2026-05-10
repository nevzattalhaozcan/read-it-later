import React, { useEffect, useState, createContext, useRef, useCallback } from 'react';
import {
  Loader2, ArrowLeft, ExternalLink, Clock, Plus, Bookmark, Trash2,
  ChevronRight, X, CheckCircle2, AlertCircle, Info, Tag, Folder,
  Inbox, Star, Search, MoreVertical,
  Archive, Check, MoreHorizontal, Edit3, Save, XCircle,
  Move, Sun, Moon, Coffee, Highlighter, MessageSquarePlus,
  StickyNote, ChevronDown
} from 'lucide-react';
import { translations, Lang } from './i18n';
import { Highlight, generateId, captureSelectionContext, applyHighlightsToDOM, isAlreadyHighlighted, mergeOverlappingHighlights, CONTEXT_LENGTH } from './highlights';

// --- Types ---
interface Article {
  _id: string;
  url: string;
  title: string;
  content: string;
  siteName?: string;
  readingTimeMinutes?: number;
  description?: string;
  coverImage?: string;
  tags: string[];
  folder: string;
  isFavorite: boolean;
  isArchived: boolean;
  isRead: boolean;
  highlights: Highlight[];
}

type ToastType = 'success' | 'error' | 'info';
type Theme = 'light' | 'dark' | 'sepia';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

// --- Context for Global UI ---
interface UIContextType {
  showToast: (message: string, type?: ToastType) => void;
  confirm: (message: string, onConfirm: () => void) => void;
  t: any;
}

const UIContext = createContext<UIContextType | null>(null);

// --- Main App Component ---
const App: React.FC = () => {
  const [lang, setLang] = useState<Lang>('tr');
  const [theme, setTheme] = useState<Theme>('light');
  const t = translations[lang];

  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  // Filtering & Navigation
  const [activeFilter, setActiveFilter] = useState<{ type: 'all' | 'folder' | 'tag' | 'favorite' | 'archive' | 'highlights', value?: string }>({ type: 'all' });
  const [searchQuery, setSearchQuery] = useState('');

  // Global UI State
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void; confirmLabel?: string } | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [tagModalArticle, setTagModalArticle] = useState<Article | null>(null);
  const [folderModalArticle, setFolderModalArticle] = useState<Article | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [newFolderInput, setNewFolderInput] = useState('');

  // Highlight & Notes State
  const [highlightToolbar, setHighlightToolbar] = useState<{x: number, y: number, text: string, prefix: string, suffix: string, startOffset: number} | null>(null);
  const [noteText, setNoteText] = useState('');
  const [activeHighlightPopover, setActiveHighlightPopover] = useState<{id: string, x: number, y: number} | null>(null);
  const articleContentRef = useRef<HTMLDivElement>(null);
  const [highlightKey, setHighlightKey] = useState(0);
  const [noteIndicators, setNoteIndicators] = useState<{id: string, x: number, y: number}[]>([]);
  const [expandedArticles, setExpandedArticles] = useState<string[]>([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isAddUrlActive, setIsAddUrlActive] = useState(false);
  const [targetHighlightId, setTargetHighlightId] = useState<string | null>(null);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [isArticleMenuOpen, setIsArticleMenuOpen] = useState(false);
  const [fontSizeIdx, setFontSizeIdx] = useState(2);
  const [widthIdx, setWidthIdx] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addUrlInputRef = useRef<HTMLInputElement>(null);
  const prefsLoaded = useRef(false);
  const lastSyncedPrefs = useRef<{ lang: Lang; theme: Theme }>({ lang: 'tr', theme: 'light' });

  const toggleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'sepia'];
    const next = themes[(themes.indexOf(theme) + 1) % themes.length];
    setTheme(next);
  };

  const toggleLang = () => setLang(lang === 'tr' ? 'en' : 'tr');

  const numToWords = (n: number, currentLang: 'tr' | 'en'): string => {
    if (currentLang === 'tr') {
      const units = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
      const tens = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
      if (n === 0) return 'sıfır';
      let res = '';
      if (n >= 100) {
        const h = Math.floor(n / 100);
        res += (h === 1 ? 'yüz' : units[h] + ' yüz');
        n %= 100;
      }
      if (n >= 10) {
        res += (res ? ' ' : '') + tens[Math.floor(n / 10)];
        n %= 10;
      }
      if (n > 0) res += (res ? ' ' : '') + units[n];
      return res;
    } else {
      const units = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
      const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
      if (n < 20) return units[n];
      if (n < 100) return (tens[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + units[n % 10] : '')).trim();
      return n.toString();
    }
  };

  const API_BASE  = (import.meta.env.VITE_API_URL  || 'http://localhost:3001').replace(/\/$/, '');
  const API_URL   = `${API_BASE}/api/v1/articles`;
  const PREFS_URL = `${API_BASE}/api/v1/preferences`;
  const WS_URL    = `${API_BASE.replace(/^https?/, (m: string) => m === 'https' ? 'wss' : 'ws')}/ws`;
  const API_KEY   = import.meta.env.VITE_API_KEY  || 'dev-secret-key';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Save lang+theme to DB when the user changes them.
  // Skip when values came from fetchPreferences (lastSyncedPrefs matches) to avoid ping-pong.
  useEffect(() => {
    if (!prefsLoaded.current) return;
    if (lang === lastSyncedPrefs.current.lang && theme === lastSyncedPrefs.current.theme) return;
    lastSyncedPrefs.current = { lang, theme };
    fetch(PREFS_URL, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': API_KEY },
      body: JSON.stringify({ lang, theme })
    }).catch(() => {});
  }, [lang, theme]);

  useEffect(() => {
    fetchPreferences();
    fetchArticles();
    let ws: WebSocket | null = null;
    let reconnectTimeout: number | null = null;
    let isClosing = false;
    const connectWS = () => {
      if (isClosing) return;
      ws = new WebSocket(WS_URL);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'REFETCH_ARTICLES') fetchArticles();
          if (data.type === 'REFETCH_PREFERENCES') fetchPreferences();
        } catch (e) { console.error('Error parsing WS message', e); }
      };
      ws.onopen = () => console.log('Connected to sync server');
      ws.onclose = () => {
        if (!isClosing) reconnectTimeout = window.setTimeout(() => connectWS(), 5000);
      };
    };
    connectWS();
    return () => {
      isClosing = true;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const fetchArticles = async () => {
    try {
      const res = await fetch(API_URL, { headers: { 'X-API-KEY': API_KEY } });
      const data = await res.json();
      if (Array.isArray(data)) setArticles(data);
    } catch (err) { console.error('Failed to fetch:', err); } finally { setLoading(false); }
  };

  const fetchPreferences = async () => {
    try {
      const res = await fetch(PREFS_URL, { headers: { 'X-API-KEY': API_KEY } });
      const data = await res.json();
      const newLang  = (data.lang  as Lang)  || 'tr';
      const newTheme = (data.theme as Theme) || 'light';
      lastSyncedPrefs.current = { lang: newLang, theme: newTheme };
      setLang(newLang);
      setTheme(newTheme);
    } catch (_) {} finally {
      prefsLoaded.current = true;
    }
  };

  const showToast = (message: string, type: ToastType = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t_obj => t_obj.id !== id)), 4000);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;
    if (articles.some(a => a.url === newUrl)) {
      showToast(t.alreadyExists, 'info');
      return;
    }
    setIsAdding(true);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': API_KEY },
        body: JSON.stringify({ url: newUrl })
      });
      const data = await res.json();
      if (data && !data.error) {
        setArticles([data, ...articles]);
        setNewUrl('');
        showToast(t.saved);
      } else { showToast(data.error || t.failedToSave, 'error'); }
    } catch (err) { showToast(t.connectionError, 'error'); } finally { setIsAdding(false); }
  };

  const handleDelete = (id: string) => {
    setConfirmModal({
      message: t.permanentlyDelete,
      onConfirm: async () => {
        try {
          await fetch(`${API_URL}/${id}`, {
            method: 'DELETE',
            headers: { 'X-API-KEY': API_KEY }
          });
          setArticles(articles.filter(a => a._id !== id));
          if (selectedArticle?._id === id) setSelectedArticle(null);
          showToast(t.deleted);
          setConfirmModal(null);
          setActiveMenuId(null);
        } catch (err) { showToast(t.failedToDelete, 'error'); }
      }
    });
  };

  const updateArticle = async (id: string, updates: Partial<Article>) => {
    try {
      const res = await fetch(`${API_URL}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': API_KEY },
        body: JSON.stringify(updates)
      });
      const updated = await res.json();
      setArticles(prev => prev.map(a => a._id === id ? updated : a));
      if (selectedArticle?._id === id) {
        setSelectedArticle(updated);
      }
      setActiveMenuId(null);
      setEditArticle(null);
      setTagModalArticle(null);
      setFolderModalArticle(null);
      if (updates.folder) {
        const folderName = updates.folder === 'Inbox' ? t.inbox : updates.folder;
        showToast(`${t.movedTo} ${folderName}`);
      }
      else showToast(t.updatedSuccessfully);
    } catch (err) { showToast(t.updateFailed, 'error'); }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagModalArticle || !newTagInput.trim()) return;
    const tag = newTagInput.trim().toLowerCase();
    if (tagModalArticle.tags.includes(tag)) {
      setNewTagInput('');
      return;
    }
    updateArticle(tagModalArticle._id, { tags: [...tagModalArticle.tags, tag] });
    setNewTagInput('');
  };

  const removeTag = (tag: string) => {
    if (!tagModalArticle) return;
    updateArticle(tagModalArticle._id, { tags: tagModalArticle.tags.filter(t_str => t_str !== tag) });
  };

  const handleAddFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderModalArticle || !newFolderInput.trim()) return;
    updateArticle(folderModalArticle._id, { folder: newFolderInput.trim() });
    setNewFolderInput('');
  };

  // --- Highlight & Notes Handlers ---
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return;
    }
    if (!articleContentRef.current) return;
    const context = captureSelectionContext(articleContentRef.current, selection);
    if (!context) {
      setHighlightToolbar(null);
      return;
    }

    // Don't show toolbar when the selection is already fully covered by an existing highlight
    const currentHighlights = selectedArticle?.highlights || [];
    if (isAlreadyHighlighted(currentHighlights, context.startOffset, context.text)) {
      setHighlightToolbar(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setHighlightToolbar({
      x: rect.left + rect.width / 2,
      y: rect.top + window.scrollY - 10,
      ...context
    });
  }, []);

  const createHighlight = (withNote: boolean) => {
    if (!highlightToolbar || !selectedArticle) return;

    const currentHighlights = selectedArticle.highlights || [];

    // Guard: fully-covered selections are blocked in handleTextSelection, but double-check here
    if (isAlreadyHighlighted(currentHighlights, highlightToolbar.startOffset, highlightToolbar.text)) {
      setHighlightToolbar(null);
      window.getSelection()?.removeAllRanges();
      return;
    }

    const { remainingHighlights, absorbedNote, mergedStart, mergedEnd } = mergeOverlappingHighlights(
      currentHighlights,
      highlightToolbar.startOffset,
      highlightToolbar.text
    );

    const fullText = articleContentRef.current?.textContent || '';
    const mergedText = fullText.slice(mergedStart, mergedEnd) || highlightToolbar.text;
    const mergedPrefix = fullText.slice(Math.max(0, mergedStart - CONTEXT_LENGTH), mergedStart) || highlightToolbar.prefix;
    const mergedSuffix = fullText.slice(mergedEnd, mergedEnd + CONTEXT_LENGTH) || highlightToolbar.suffix;

    const newHighlight: Highlight = {
      id: generateId(),
      text: mergedText,
      prefix: mergedPrefix,
      suffix: mergedSuffix,
      startOffset: mergedStart,
      note: withNote ? '' : absorbedNote,
      createdAt: new Date().toISOString()
    };

    const doCreate = () => {
      const updatedHighlights = [...remainingHighlights, newHighlight];
      updateArticle(selectedArticle._id, { highlights: updatedHighlights } as any);
      setSelectedArticle({ ...selectedArticle, highlights: updatedHighlights });
      setHighlightToolbar(null);
      setHighlightKey(k => k + 1);
      window.getSelection()?.removeAllRanges();
      if (withNote) {
        setNoteText(absorbedNote); // Pre-populate note editor with the absorbed note
        setTargetHighlightId(newHighlight.id);
        setIsInlineEditing(true);
      } else {
        showToast(t.highlightSaved);
      }
    };

    if (absorbedNote) {
      const excerpt = absorbedNote.length > 80 ? absorbedNote.slice(0, 80) + '…' : absorbedNote;
      setConfirmModal({
        message: `${t.noteInOldHighlight}: "${excerpt}"`,
        confirmLabel: t.replaceHighlight,
        onConfirm: () => {
          setConfirmModal(null);
          doCreate();
        }
      });
    } else {
      doCreate();
    }
  };

  const openHighlightAction = useCallback((highlightId: string, customPos?: {x: number, y: number}) => {
    if (!selectedArticle) return;
    const hl = selectedArticle.highlights?.find(h => h.id === highlightId);
    if (!hl) return;

    let pos: {x: number, y: number} | null = null;

    if (customPos) {
      pos = customPos;
    } else {
      const mark = articleContentRef.current?.querySelector(`[data-highlight-id="${highlightId}"]`);
      if (mark) {
        const rect = mark.getBoundingClientRect();
        const containerRect = articleContentRef.current?.getBoundingClientRect();
        pos = {
          y: rect.top + window.scrollY,
          x: containerRect ? containerRect.right + 20 : rect.right + 20
        };
      }
    }

    if (pos) {
      setNoteText(hl.note || '');
      setIsInlineEditing(!!hl.note); // Only open in edit mode if it has a note
      setActiveHighlightPopover({ ...hl, ...pos });
    }
  }, [selectedArticle]);

  const deleteHighlight = (highlightId: string) => {
    if (!selectedArticle) return;
    const updatedHighlights = (selectedArticle.highlights || []).filter(h => h.id !== highlightId);
    
    // Optimistic update: change local state immediately
    const updatedArticle = { ...selectedArticle, highlights: updatedHighlights };
    setSelectedArticle(updatedArticle);
    setHighlightKey(k => k + 1);
    
    updateArticle(selectedArticle._id, { highlights: updatedHighlights } as any);
    setActiveHighlightPopover(null);
    showToast(t.highlightDeleted);
  };



  // Apply highlights to DOM after article content renders
  useEffect(() => {
    if (selectedArticle && articleContentRef.current) {
      applyHighlightsToDOM(articleContentRef.current, selectedArticle.highlights || [], openHighlightAction);

      // Calculate note indicators
      const timer = setTimeout(() => {
        if (!articleContentRef.current) return;
        const indicators: {id: string, x: number, y: number}[] = [];
        const containerRect = articleContentRef.current.getBoundingClientRect();
        
        selectedArticle.highlights?.forEach(hl => {
          if (hl.note && hl.note.trim()) {
            const marks = articleContentRef.current?.querySelectorAll(`[data-highlight-id="${hl.id}"]`);
            if (marks && marks.length > 0) {
              let minTop = Infinity;
              let maxBottom = -Infinity;
              marks.forEach(mark => {
                const rect = mark.getBoundingClientRect();
                minTop = Math.min(minTop, rect.top);
                maxBottom = Math.max(maxBottom, rect.bottom);
              });
              const y = (minTop + maxBottom) / 2 + window.scrollY;
              const x = containerRect.right + 40; // More prominent position to the right
              indicators.push({ id: hl.id, x, y });
            }
          }
        });
        setNoteIndicators(indicators);
      }, 150);

      let targetTimer: number | undefined;
      if (targetHighlightId) {
        targetTimer = window.setTimeout(() => {
          const hl = selectedArticle.highlights?.find(h => h.id === targetHighlightId);
          const el = articleContentRef.current?.querySelector(`[data-highlight-id="${targetHighlightId}"]`);
          
          if (hl && el) {
            const rect = el.getBoundingClientRect();
            const containerRect = articleContentRef.current?.getBoundingClientRect();
            const y = rect.top + window.scrollY;
            const x = containerRect ? containerRect.right + 20 : rect.right + 20;
            
            setActiveHighlightPopover({ ...hl, x, y });
            setIsInlineEditing(true);
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            (el as HTMLElement).style.boxShadow = '0 0 20px 10px rgba(234, 179, 8, 0.4)';
            (el as HTMLElement).style.transition = 'box-shadow 0.3s ease';
            setTimeout(() => { if (el) (el as HTMLElement).style.boxShadow = ''; }, 1000);
          }
          setTargetHighlightId(null);
        }, 350);
      }

      return () => {
        clearTimeout(timer);
        if (targetTimer) clearTimeout(targetTimer);
      };
    }
  }, [selectedArticle, highlightKey, targetHighlightId, openHighlightAction]);

  // Handle window resize to keep note indicators correctly positioned
  useEffect(() => {
    const handleResize = () => setHighlightKey(k => k + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Derived Data
  const folders = Array.from(new Set(articles.map(a => a.folder)))
    .filter(f => f && f !== 'Inbox');
  
  const allTags = Array.from(new Set(articles.flatMap(a => a.tags))).filter(Boolean);

  const filteredArticles = articles.filter(a => {
    const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase()) || a.url.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeFilter.type !== 'archive' && a.isArchived) return false;
    switch (activeFilter.type) {
      case 'favorite': return a.isFavorite;
      case 'folder': return a.folder === activeFilter.value;
      case 'tag': return a.tags.includes(activeFilter.value || '');
      case 'archive': return a.isArchived;
      case 'highlights': return (a.highlights?.length || 0) > 0;
      default: return !a.isArchived && a.folder === 'Inbox';
    }
  });

  const isDuplicate = articles.some(a => a.url === newUrl);

  // Pre-compute grouped highlights for My Notes view
  const articlesWithHighlights = articles
    .filter(a => (a.highlights?.length || 0) > 0)
    .sort((a, b) => {
      const latestA = Math.max(...a.highlights.map(h => new Date(h.createdAt).getTime()));
      const latestB = Math.max(...b.highlights.map(h => new Date(h.createdAt).getTime()));
      return latestB - latestA;
    });

  const toggleArticleExpanded = (articleId: string) => {
    setExpandedArticles(prev => 
      prev.includes(articleId) 
        ? prev.filter(id => id !== articleId) 
        : [...prev, articleId]
    );
  };

  const highlightsContent = articlesWithHighlights.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-32 gap-5">
      <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 flex items-center justify-center">
        <Highlighter className="w-7 h-7 text-yellow-500/60" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-[var(--text-main)] mb-1">{t.noHighlightsYet}</p>
        <p className="text-sm text-[var(--text-muted)]">Makalelerdeki metinleri seçerek işaretlemeye başlayın.</p>
      </div>
    </div>
  ) : (
    <div className="space-y-4">
      {articlesWithHighlights.map(article => {
        const isExpanded = expandedArticles.includes(article._id);
        const sortedHighlights = [...article.highlights].sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return (
          <div key={article._id} className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden theme-transition shadow-sm">
            {/* Group Header / Toggle */}
            <div 
              onClick={() => toggleArticleExpanded(article._id)}
              className="w-full flex items-center justify-between p-5 hover:bg-[var(--bg-main)] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-1.5 rounded-lg transition-colors ${isExpanded ? 'bg-blue-600 text-white' : 'bg-[var(--border-color)] text-[var(--text-muted)]'}`}>
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[var(--text-main)] truncate text-sm article-title">{article.title}</h3>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] tracking-widest mt-0.5">
                    {numToWords(article.highlights.length, lang)} {t.highlights}
                    {article.highlights.filter(h => !!h.note).length > 0 && (
                      <> • {numToWords(article.highlights.filter(h => !!h.note).length, lang)} {t.highlights === 'vurgu' ? 'not' : 'note'}</>
                    )}
                  </p>
                </div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setSelectedArticle(article); }}
                className="p-2 hover:bg-blue-600/10 text-blue-600 rounded-xl transition-colors shrink-0"
                title={t.viewNote}
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

            {/* Collapsible Content */}
            {isExpanded && (
              <div className="p-5 pt-0 divide-y divide-[var(--border-color)]">
                {sortedHighlights.map((hl) => (
                  <div 
                    key={hl.id} 
                    className="group py-6 first:pt-4 last:pb-2 cursor-pointer hover:bg-blue-600/5 transition-colors -mx-5 px-5"
                    onClick={() => { 
                      if (window.getSelection()?.toString()) return;
                      setTargetHighlightId(hl.id); 
                      setSelectedArticle(article); 
                    }}
                  >
                    {/* Highlighted quote */}
                    <div className="flex gap-4 mb-3">
                      <div className="w-0.5 bg-[var(--note-indicator-color)] rounded-full shrink-0 mt-1" />
                      <p className="text-base leading-relaxed text-[var(--text-main)] font-serif italic highlight-text">
                        {hl.text}
                      </p>
                    </div>

                    {/* Note */}
                    {hl.note && (
                      <div className="ml-6 mt-4 flex items-start gap-3">
                        <div className="w-5 h-5 mt-0.5 rounded flex items-center justify-center shrink-0 text-[var(--text-muted)]">
                          <StickyNote className="w-3.5 h-3.5" />
                        </div>
                        <p className="text-sm leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap note-content">{hl.note}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const SidebarHeader = () => (
    <div className="mb-12 flex items-center justify-between px-1">
      <img src="/logo.png" alt="sonra-okurum" className="h-16 w-auto object-contain rounded-xl shadow-md border border-[var(--border-color)]" />
      <div className="flex items-center gap-1.5">
        <button 
          onClick={toggleTheme}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--accent-color)] hover:border-[var(--accent-color)] transition-all shadow-sm"
          title={theme === 'light' ? t.themeDark : theme === 'dark' ? t.themeSepia : t.themeLight}
        >
          {theme === 'light' ? <Sun className="w-4 h-4" /> : theme === 'dark' ? <Moon className="w-4 h-4" /> : <Coffee className="w-4 h-4" />}
        </button>
        <button 
          onClick={toggleLang}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--accent-color)] hover:border-[var(--accent-color)] transition-all shadow-sm"
          title={lang === 'tr' ? 'English' : 'Türkçe'}
        >
          {lang === 'tr' ? 'en' : 'tr'}
        </button>
      </div>
    </div>
  );

  // --- Render Functions ---

  if (selectedArticle) {
    return (
      <div className="min-h-screen bg-[var(--bg-card)] text-[var(--text-main)] selection:bg-yellow-200/50 animate-in fade-in duration-300 theme-transition relative" onClick={() => {
        if (!window.getSelection()?.toString()) {
          setHighlightToolbar(null);
          setActiveHighlightPopover(null);
          setIsArticleMenuOpen(false);
        }
      }}>
        <nav className="sticky top-0 bg-[var(--bg-card)]/80 backdrop-blur-md border-b border-[var(--border-color)] z-10">
          <div className={`${['max-w-xl','max-w-2xl','max-w-3xl'][widthIdx]} mx-auto px-4 h-14 flex items-center justify-between relative`}>
            {/* Sol: geri */}
            <button onClick={() => { setSelectedArticle(null); setHighlightToolbar(null); setActiveHighlightPopover(null); setIsArticleMenuOpen(false); }} className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-main)] font-medium transition-colors">
              <ArrowLeft className="w-4 h-4" /> {t.back}
            </button>

            {/* Orta: tema */}
            <button
              onClick={toggleTheme}
              className="absolute left-1/2 -translate-x-1/2 w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--accent-color)] hover:border-[var(--accent-color)] transition-all"
              title={theme === 'light' ? t.themeDark : theme === 'dark' ? t.themeSepia : t.themeLight}
            >
              {theme === 'light' ? <Sun className="w-4 h-4" /> : theme === 'dark' ? <Moon className="w-4 h-4" /> : <Coffee className="w-4 h-4" />}
            </button>

            {/* Sağ: açılır menü + üç nokta */}
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <div className={`flex items-center gap-0.5 overflow-hidden transition-all duration-200 ${isArticleMenuOpen ? 'max-w-[400px] mr-1.5 opacity-100' : 'max-w-0 opacity-0 pointer-events-none'}`}>
                {/* Font boyutu: 5 adımlı (14,15,16,18,20px) */}
                <button onClick={() => setFontSizeIdx(i => Math.max(0, i - 1))} disabled={fontSizeIdx === 0} className="w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)] rounded-lg transition-colors font-bold text-[11px] disabled:opacity-30">A−</button>
                <button onClick={() => setFontSizeIdx(i => Math.min(4, i + 1))} disabled={fontSizeIdx === 4} className="w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)] rounded-lg transition-colors font-bold text-[13px] disabled:opacity-30">A+</button>
                <div className="w-px h-4 bg-[var(--border-color)] mx-1 shrink-0" />
                {/* Genişlik: dar / orta / geniş */}
                {([
                  [4,10, 4,10, 4, 8],
                  [2,12, 2,12, 2, 9],
                  [0,14, 0,14, 0,11],
                ] as [number,number,number,number,number,number][]).map(([x1a,x2a,x1b,x2b,x1c,x2c], wi) => (
                  <button
                    key={wi}
                    onClick={() => setWidthIdx(wi)}
                    className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${widthIdx === wi ? 'bg-[var(--bg-main)] text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)]'}`}
                  >
                    <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1={x1a} y1="1"   x2={x2a} y2="1"/>
                      <line x1={x1b} y1="5.5" x2={x2b} y2="5.5"/>
                      <line x1={x1c} y1="10"  x2={x2c} y2="10"/>
                    </svg>
                  </button>
                ))}
                <div className="w-px h-4 bg-[var(--border-color)] mx-1 shrink-0" />
                {/* Aksiyonlar */}
                <button onClick={() => updateArticle(selectedArticle._id, { isFavorite: !selectedArticle.isFavorite })} className={`w-7 h-7 flex items-center justify-center hover:bg-[var(--bg-main)] rounded-lg transition-colors ${selectedArticle.isFavorite ? 'text-amber-500' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                  <Star className={`w-4 h-4 ${selectedArticle.isFavorite ? 'fill-current' : ''}`} />
                </button>
                <a href={selectedArticle.url} target="_blank" rel="noopener noreferrer" className="w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-blue-600 hover:bg-[var(--bg-main)] rounded-lg transition-colors">
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button onClick={() => { updateArticle(selectedArticle._id, { isArchived: !selectedArticle.isArchived }); setIsArticleMenuOpen(false); }} className="w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)] rounded-lg transition-colors">
                  <Archive className="w-4 h-4" />
                </button>
                <button onClick={() => { handleDelete(selectedArticle._id); setIsArticleMenuOpen(false); }} className="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => setIsArticleMenuOpen(o => !o)}
                className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all ${isArticleMenuOpen ? 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-main)]' : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-main)] hover:border-[var(--border-color)]'}`}
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>
        </nav>
        <article className={`${['max-w-xl','max-w-2xl','max-w-3xl'][widthIdx]} mx-auto px-4 py-12 md:py-20 relative`}>
          <header className="mb-12">
            <div className="flex items-center gap-3 text-[var(--text-muted)] text-sm font-medium mb-6">
              <span className="bg-[var(--border-color)] px-2 py-1 rounded text-xs tracking-wider">{selectedArticle.siteName || new URL(selectedArticle.url).hostname}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {selectedArticle.readingTimeMinutes} {t.minRead}</span>
              {(selectedArticle.highlights?.length || 0) > 0 && (
                <span className="flex items-center gap-1"><Highlighter className="w-3.5 h-3.5" /> {selectedArticle.highlights.length}</span>
              )}
            </div>
            <h1 className="text-4xl md:text-5xl font-bold font-serif leading-tight mb-8 article-title">{selectedArticle.title}</h1>
            {selectedArticle.coverImage && <img src={selectedArticle.coverImage} className="w-full aspect-video object-cover rounded-2xl mb-12 shadow-sm" alt="" />}
          </header>
          <div
            key={highlightKey}
            ref={articleContentRef}
            onMouseUp={handleTextSelection}
            className={`prose max-w-none leading-relaxed font-serif ${theme === 'dark' ? 'prose-invert' : ''}`}
            style={{ color: 'var(--text-main)', fontSize: `${[14,15,16,18,20][fontSizeIdx]}px` }}
            dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
          />
        </article>

        {/* Note Indicators */}
        {noteIndicators.filter(i => activeHighlightPopover?.id !== i.id).map(indicator => (
          <button 
            key={indicator.id}
            className="absolute z-[40] cursor-pointer transition-all animate-in fade-in zoom-in duration-500 group"
            style={{ top: indicator.y, left: indicator.x, transform: 'translateY(-50%)' }}
            onClick={(e) => { e.stopPropagation(); openHighlightAction(indicator.id, { x: indicator.x, y: indicator.y }); }}
            title={t.viewNote}
          >
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--bg-card)]/50 backdrop-blur-md border border-[var(--border-color)] shadow-sm group-hover:shadow-md group-hover:border-[var(--note-indicator-color)]/50 group-hover:bg-[var(--bg-card)] transition-all">
              <StickyNote className="w-4 h-4 text-[var(--note-indicator-color)] opacity-70 group-hover:opacity-100 transition-all" />
            </div>
          </button>
        ))}

        {/* Floating Highlight Toolbar */}
        {highlightToolbar && (
          <div className="highlight-toolbar" style={{ top: highlightToolbar.y, left: highlightToolbar.x }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => createHighlight(false)} title={t.highlight}>
              <Highlighter className="w-4 h-4" />
            </button>
            <div className="divider" />
            <button onClick={() => createHighlight(true)} title={t.addNote}>
              <MessageSquarePlus className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Highlight Click Popover (Dynamic Sidebar or Mini Toolbar) */}
        {activeHighlightPopover && (() => {
          const hl = (selectedArticle.highlights || []).find(h => h.id === activeHighlightPopover.id);
          if (!hl) return null;
          
          const hasNote = hl.note && hl.note.trim().length > 0;

          if (!hasNote && !isInlineEditing) {
            // Pure Highlight - Show only delete
            return (
              <div className="absolute z-[150] animate-in fade-in zoom-in-95 duration-150" style={{ top: activeHighlightPopover.y, left: activeHighlightPopover.x, transform: 'translate(-50%, -100%) translateY(-10px)' }} onClick={(e) => e.stopPropagation()}>
                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl p-1 flex items-center">
                  <button 
                    onClick={() => deleteHighlight(hl.id)}
                    className="h-8 w-8 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title={t.deleteHighlight}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          }

          // Highlight with Note - Show Sidebar Edit
          return (
            <div 
              className="absolute z-[150] animate-in fade-in slide-in-from-left-4 duration-300 pointer-events-none" 
              style={{ 
                top: activeHighlightPopover.y, 
                left: activeHighlightPopover.x,
                width: '240px' 
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-xl p-3 pointer-events-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-1">
                    <button 
                      onClick={() => {
                        const updatedHighlights = (selectedArticle.highlights || []).map(h => 
                          h.id === hl.id ? { ...h, note: noteText } : h
                        );
                        // Optimistic update
                        const updatedArticle = { ...selectedArticle, highlights: updatedHighlights };
                        setSelectedArticle(updatedArticle);
                        setHighlightKey(k => k + 1);
                        
                        updateArticle(selectedArticle._id, { highlights: updatedHighlights } as any);
                        setActiveHighlightPopover(null);
                      }}
                      className="p-1.5 rounded-lg text-green-600 hover:bg-green-600/10 transition-colors"
                      title={t.save}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setActiveHighlightPopover(null)}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-main)] transition-colors"
                      title={t.cancel}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <button 
                    onClick={() => deleteHighlight(hl.id)}
                    className="p-1.5 rounded-lg text-red-600 hover:bg-red-500/10 transition-colors"
                    title={t.deleteHighlight}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea 
                  autoFocus
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl p-3 text-xs text-[var(--text-main)] focus:ring-2 focus:ring-blue-600 outline-none resize-none font-sans"
                  placeholder={t.notePlaceholder}
                  rows={4}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
              </div>
            </div>
          );
        })()}

        {confirmModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmModal(null)} />
            <div className="relative bg-[var(--bg-card)] text-[var(--text-main)] rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 border border-[var(--border-color)]">
              <h3 className="text-xl font-bold mb-2">{t.areYouSure}</h3>
              <p className="text-[var(--text-muted)] mb-8 leading-relaxed">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmModal(null)} className="flex-1 py-3 bg-[var(--border-color)] hover:bg-[var(--bg-main)] text-[var(--text-main)] rounded-xl font-bold transition-colors">{t.cancel}</button>
                <button onClick={confirmModal.onConfirm} className={`flex-1 py-3 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95 ${confirmModal.confirmLabel ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-red-600 hover:bg-red-700 shadow-red-200'}`}>{confirmModal.confirmLabel ?? t.delete}</button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  return (
    <UIContext.Provider value={{ showToast, confirm: (msg, cb) => setConfirmModal({ message: msg, onConfirm: cb }), t }}>
      <div className="min-h-screen bg-[var(--bg-main)] font-sans text-[var(--text-main)] selection:bg-blue-100 flex theme-transition">
        <aside className="hidden lg:flex w-72 bg-[var(--bg-sidebar)] border-r border-[var(--border-color)] flex-col sticky top-0 h-screen p-6">
          <SidebarHeader />
          <nav className="space-y-1 flex-1 overflow-y-auto">
            <button onClick={() => setActiveFilter({ type: 'all' })} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-colors ${activeFilter.type === 'all' ? 'bg-blue-600/10 text-blue-600' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}>
              <Inbox className="w-4 h-4" /> {t.inbox}
            </button>
            <button onClick={() => setActiveFilter({ type: 'favorite' })} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-colors ${activeFilter.type === 'favorite' ? 'bg-amber-500/10 text-amber-500' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}>
              <Star className="w-4 h-4" /> {t.favorites}
            </button>
            <button onClick={() => setActiveFilter({ type: 'archive' })} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-colors ${activeFilter.type === 'archive' ? 'bg-slate-900 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}>
              <Archive className="w-4 h-4" /> {t.archive}
            </button>
            <button onClick={() => setActiveFilter({ type: 'highlights' })} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-colors ${activeFilter.type === 'highlights' ? 'bg-yellow-500/20 text-yellow-600' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}>
              <Highlighter className="w-4 h-4" /> {t.myNotes}
            </button>
            <div className="pt-8 pb-2 px-4 text-[10px] font-bold tracking-widest text-[var(--text-muted)] sidebar-section-header">{t.folders}</div>
            {folders.map(f => (
              <button key={f} onClick={() => setActiveFilter({ type: 'folder', value: f })} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-colors ${activeFilter.type === 'folder' && activeFilter.value === f ? 'bg-[var(--border-color)] text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}>
                <Folder className="w-4 h-4 opacity-50" /> {f}
              </button>
            ))}
            <div className="pt-8 pb-2 px-4 text-[10px] font-bold tracking-widest text-[var(--text-muted)] sidebar-section-header">{t.tags}</div>
            <div className="flex flex-wrap gap-2 px-4 pt-2">
              {allTags.map(t_str => <button key={t_str} onClick={() => setActiveFilter({ type: 'tag', value: t_str })} className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${activeFilter.type === 'tag' && activeFilter.value === t_str ? 'bg-blue-600 text-white' : 'bg-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}>#{t_str}</button>)}
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0" onClick={() => setActiveMenuId(null)}>
          <div className="max-w-3xl mx-auto px-4 py-8 md:py-16">
            <header className="mb-14 flex items-center justify-between gap-6">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold mb-1 truncate">
                  {activeFilter.type === 'all' ? t.inbox : activeFilter.type === 'favorite' ? t.favorites : activeFilter.type === 'archive' ? t.archive : activeFilter.type === 'highlights' ? t.myNotes : activeFilter.value}
                </h1>
                <p className="text-[10px] font-bold text-[var(--text-muted)] tracking-widest">{numToWords(filteredArticles.length, lang)} {t.articles}</p>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Search Action */}
                <div className={`relative flex items-center transition-all duration-300 ease-out ${isSearchActive ? 'w-64' : 'w-10'}`}>
                  <button 
                    onClick={() => { setIsSearchActive(!isSearchActive); setIsAddUrlActive(false); setTimeout(() => searchInputRef.current?.focus(), 100); }}
                    className={`absolute left-0 z-10 w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isSearchActive ? 'text-blue-600' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-color)]'}`}
                  >
                    <Search className="w-5 h-5" />
                  </button>
                  <input 
                    ref={searchInputRef}
                    type="text" 
                    placeholder={t.searchPlaceholder} 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    className={`w-full pl-11 pr-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-blue-600 transition-all text-sm text-[var(--text-main)] ${isSearchActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                  />
                </div>

                {/* Add URL Action */}
                <div className={`relative flex items-center transition-all duration-300 ease-out ${isAddUrlActive ? 'w-80' : 'w-10'}`}>
                  <button 
                    onClick={() => { setIsAddUrlActive(!isAddUrlActive); setIsSearchActive(false); setTimeout(() => addUrlInputRef.current?.focus(), 100); }}
                    className={`absolute left-0 z-10 w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isAddUrlActive ? 'text-blue-600' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-color)]'}`}
                  >
                    {isAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  </button>
                  <form onSubmit={(e) => { e.preventDefault(); handleAdd(e); setIsAddUrlActive(false); }} className="w-full">
                    <input 
                      ref={addUrlInputRef}
                      type="url" 
                      value={newUrl} 
                      onChange={(e) => setNewUrl(e.target.value)} 
                      placeholder={t.urlPlaceholder} 
                      className={`w-full pl-11 pr-16 py-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-blue-600 transition-all text-sm text-[var(--text-main)] ${isAddUrlActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                      disabled={isAdding}
                    />
                    {isAddUrlActive && (
                      <button type="submit" disabled={!newUrl || isAdding || isDuplicate} className="absolute right-2 top-2 bottom-2 px-3 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 transition-colors disabled:opacity-50">
                        {t.save}
                      </button>
                    )}
                  </form>
                </div>
              </div>
            </header>

            <div className="space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /><p className="text-[var(--text-muted)] font-medium">{t.loading}</p></div>
              ) : activeFilter.type === 'highlights' ? (
                highlightsContent
              ) : (
                <>
                  {filteredArticles.map((article) => (
                    <div key={article._id} onClick={() => setSelectedArticle(article)} className="group bg-[var(--bg-card)] p-6 rounded-2xl shadow-sm border border-[var(--border-color)] hover:border-blue-200 hover:shadow-md transition-all cursor-pointer relative theme-transition">
                      <div className="flex gap-5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold tracking-widest text-[var(--text-muted)]">{article.siteName || new URL(article.url).hostname}</span>
                            <div className="relative">
                              <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === article._id ? null : article._id); }} className="p-1 hover:bg-[var(--bg-main)] rounded-lg text-[var(--text-muted)] transition-colors">
                                <MoreHorizontal className="w-5 h-5" />
                              </button>
                              {activeMenuId === article._id && (
                                <div className="absolute right-0 mt-2 w-52 bg-[var(--bg-card)] rounded-xl shadow-xl border border-[var(--border-color)] z-50 py-2 animate-in zoom-in-95 duration-100 origin-top-right text-[var(--text-main)]" onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => setEditArticle(article)} className="w-full text-left px-4 py-2 hover:bg-[var(--bg-main)] flex items-center gap-2 text-sm font-medium"><Edit3 className="w-4 h-4 text-[var(--text-muted)]" /> {t.editArticle}</button>
                                  <button onClick={() => setTagModalArticle(article)} className="w-full text-left px-4 py-2 hover:bg-[var(--bg-main)] flex items-center gap-2 text-sm font-medium"><Tag className="w-4 h-4 text-[var(--text-muted)]" /> {t.manageTags}</button>
                                  <button onClick={() => setFolderModalArticle(article)} className="w-full text-left px-4 py-2 hover:bg-[var(--bg-main)] flex items-center gap-2 text-sm font-medium"><Move className="w-4 h-4 text-[var(--text-muted)]" /> {t.moveToFolder}</button>
                                  <button onClick={() => updateArticle(article._id, { isFavorite: !article.isFavorite })} className="w-full text-left px-4 py-2 hover:bg-[var(--bg-main)] flex items-center gap-2 text-sm font-medium"><Star className={`w-4 h-4 ${article.isFavorite ? 'text-amber-500 fill-current' : 'text-[var(--text-muted)]'}`} /> {article.isFavorite ? t.removeFavorite : t.favorite}</button>
                                  <button onClick={() => updateArticle(article._id, { isArchived: !article.isArchived })} className="w-full text-left px-4 py-2 hover:bg-[var(--bg-main)] flex items-center gap-2 text-sm font-medium"><Archive className="w-4 h-4 text-[var(--text-muted)]" /> {article.isArchived ? t.unarchive : t.archiveArticle}</button>
                                  <div className="h-px bg-[var(--border-color)] my-2" /><button onClick={() => handleDelete(article._id)} className="w-full text-left px-4 py-2 hover:bg-[var(--bg-main)] flex items-center gap-2 text-sm font-medium text-red-600"><Trash2 className="w-4 h-4" /> {t.delete}</button>
                                </div>
                              )}
                            </div>
                          </div>
                          <h2 className="text-xl font-bold mb-2 group-hover:text-blue-600 transition-colors leading-snug line-clamp-2 article-title">{article.title}</h2>
                          <p className="text-[var(--text-muted)] text-sm line-clamp-2 leading-relaxed mb-4 article-description">{article.description}</p>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {article.tags.map(t_str => <span key={t_str} className="px-2 py-0.5 bg-blue-600/10 text-blue-600 text-[10px] font-bold rounded-md">#{t_str}</span>)}
                            {article.folder && <span className="px-2 py-0.5 bg-[var(--border-color)] text-[var(--text-muted)] text-[10px] font-bold rounded-md flex items-center gap-1"><Folder className="w-2.5 h-2.5" /> {article.folder === 'Inbox' ? t.inbox : article.folder}</span>}
                          </div>
                          <div className="flex items-center gap-4 text-xs font-semibold text-[var(--text-muted)]"><span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {article.readingTimeMinutes} {t.minRead}</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredArticles.length === 0 && (
                    <div className="text-center py-24 bg-[var(--bg-card)] rounded-3xl border-2 border-dashed border-[var(--border-color)]">
                      <Bookmark className="w-12 h-12 text-[var(--border-color)] mx-auto mb-4" />
                      <p className="text-[var(--text-muted)] font-medium">{t.nothingHere}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>

        {/* Modals with themes support */}
        {editArticle && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditArticle(null)} />
            <div className="relative bg-[var(--bg-card)] text-[var(--text-main)] rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200 border border-[var(--border-color)]">
              <h3 className="text-2xl font-bold mb-6">{t.editArticle}</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-[var(--text-muted)] tracking-widest mb-2">{t.title}</label>
                  <input type="text" value={editArticle.title} onChange={(e) => setEditArticle({ ...editArticle, title: e.target.value })} className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-blue-600 transition-all text-[var(--text-main)]" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[var(--text-muted)] tracking-widest mb-2">{t.url}</label>
                  <input type="url" value={editArticle.url} onChange={(e) => setEditArticle({ ...editArticle, url: e.target.value })} className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-blue-600 transition-all text-[var(--text-main)]" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[var(--text-muted)] tracking-widest mb-2">{t.summary}</label>
                  <textarea rows={4} value={editArticle.description} onChange={(e) => setEditArticle({ ...editArticle, description: e.target.value })} className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-blue-600 transition-all resize-none text-[var(--text-main)]" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setEditArticle(null)} className="flex-1 py-3 bg-[var(--border-color)] hover:bg-[var(--bg-main)] text-[var(--text-main)] rounded-xl font-bold transition-colors">{t.cancel}</button>
                  <button onClick={() => updateArticle(editArticle._id, { title: editArticle.title, url: editArticle.url, description: editArticle.description })} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"><Save className="w-4 h-4" /> {t.saveChanges}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tag Modal */}
        {tagModalArticle && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setTagModalArticle(null)} />
            <div className="relative bg-[var(--bg-card)] text-[var(--text-main)] rounded-3xl p-8 max-md w-full shadow-2xl animate-in zoom-in-95 duration-200 border border-[var(--border-color)]">
              <h3 className="text-2xl font-bold mb-2">{t.manageTags}</h3>
              <p className="text-[var(--text-muted)] text-sm mb-6 line-clamp-1">{tagModalArticle.title}</p>
              <div className="mb-8">
                <label className="block text-sm font-bold text-[var(--text-muted)] tracking-widest mb-3">{t.currentTags}</label>
                <div className="flex flex-wrap gap-2">
                  {tagModalArticle.tags.map(t_str => <span key={t_str} className="pl-3 pr-2 py-1.5 bg-blue-600/10 text-blue-600 text-sm font-bold rounded-xl flex items-center gap-2 group">#{t_str}<button onClick={() => removeTag(t_str)} className="text-blue-300 hover:text-red-500 transition-colors"><XCircle className="w-4 h-4" /></button></span>)}
                  {tagModalArticle.tags.length === 0 && <p className="text-[var(--text-muted)] text-sm italic">{t.noTagsYet}</p>}
                </div>
              </div>
              <form onSubmit={handleAddTag}>
                <label className="block text-sm font-bold text-[var(--text-muted)] tracking-widest mb-2">{t.addNewTag}</label>
                <div className="flex gap-2">
                  <input type="text" placeholder={t.enterTag} value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} className="flex-1 px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-blue-600 transition-all outline-none text-[var(--text-main)]" autoFocus />
                  <button type="submit" className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"><Plus className="w-6 h-6" /></button>
                </div>
              </form>
              <button onClick={() => setTagModalArticle(null)} className="w-full mt-8 py-3 bg-slate-900 text-white rounded-xl font-bold transition-colors">{t.done}</button>
            </div>
          </div>
        )}

        {/* Folder Modal */}
        {folderModalArticle && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setFolderModalArticle(null)} />
            <div className="relative bg-[var(--bg-card)] text-[var(--text-main)] rounded-3xl p-8 max-md w-full shadow-2xl animate-in zoom-in-95 duration-200 border border-[var(--border-color)]">
              <h3 className="text-2xl font-bold mb-2">{t.moveToFolder}</h3>
              <p className="text-[var(--text-muted)] text-sm mb-6 line-clamp-1">{folderModalArticle.title}</p>
              <div className="mb-8 space-y-2 max-h-48 overflow-y-auto">
                <label className="block text-sm font-bold text-[var(--text-muted)] tracking-widest mb-3">{t.existingFolders}</label>
                <button 
                  onClick={() => updateArticle(folderModalArticle._id, { folder: 'Inbox' })}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${folderModalArticle.folder === 'Inbox' ? 'bg-blue-600 text-white' : 'bg-[var(--bg-main)] hover:bg-[var(--border-color)]'}`}
                >
                  <Folder className="w-4 h-4" /> {t.inbox}
                </button>
                {folders.map(f => (
                  <button key={f} onClick={() => updateArticle(folderModalArticle._id, { folder: f })} className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${folderModalArticle.folder === f ? 'bg-blue-600 text-white' : 'bg-[var(--bg-main)] hover:bg-[var(--border-color)]'}`}><Folder className="w-4 h-4" /> {f}</button>
                ))}
              </div>
              <form onSubmit={handleAddFolder}>
                <label className="block text-sm font-bold text-[var(--text-muted)] tracking-widest mb-2">{t.createNewFolder}</label>
                <div className="flex gap-2">
                  <input type="text" placeholder={t.folderName} value={newFolderInput} onChange={(e) => setNewFolderInput(e.target.value)} className="flex-1 px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-blue-600 transition-all outline-none text-[var(--text-main)]" />
                  <button type="submit" className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"><Plus className="w-6 h-6" /></button>
                </div>
              </form>
              <button onClick={() => setFolderModalArticle(null)} className="w-full mt-8 py-3 bg-slate-900 text-white rounded-xl font-bold transition-colors">{t.cancel}</button>
            </div>
          </div>
        )}

        {/* Global Notifications */}
        <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
          {toasts.map(toast => (
            <div key={toast.id} className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right duration-300 ${toast.type === 'success' ? 'bg-slate-900 text-white' : toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
              {toast.type === 'info' && <Info className="w-5 h-5" />}
              <span className="font-medium">{toast.message}</span>
              <button onClick={() => setToasts(prev => prev.filter(t_obj => t_obj.id !== toast.id))} className="ml-2 opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>

        {confirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmModal(null)} />
            <div className="relative bg-[var(--bg-card)] text-[var(--text-main)] rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 border border-[var(--border-color)]">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-6"><Trash2 className="w-6 h-6" /></div>
              <h3 className="text-xl font-bold mb-2">{t.areYouSure}</h3>
              <p className="text-[var(--text-muted)] mb-8 leading-relaxed">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmModal(null)} className="flex-1 py-3 bg-[var(--border-color)] hover:bg-[var(--bg-main)] text-[var(--text-main)] rounded-xl font-bold transition-colors">{t.cancel}</button>
                <button onClick={confirmModal.onConfirm} className={`flex-1 py-3 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95 ${confirmModal.confirmLabel ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-red-600 hover:bg-red-700 shadow-red-200'}`}>{confirmModal.confirmLabel ?? t.delete}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </UIContext.Provider>
  );
};

export default App;
