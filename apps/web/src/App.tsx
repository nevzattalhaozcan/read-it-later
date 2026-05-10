import React, { useEffect, useState, createContext, useRef, useCallback } from 'react';
import {
  Loader2, ExternalLink, Clock, Plus, Trash2,
  ChevronRight, X, CheckCircle2, AlertCircle, Info, Tag, Folder,
  Inbox, Star, Search, MoreVertical,
  Archive, Check, MoreHorizontal, Edit3, Save,
  Move, Sun, Moon, Coffee, Highlighter, MessageSquarePlus,
  StickyNote, ChevronDown, Settings, LogOut, Copy, Languages
} from 'lucide-react';
import { translations, Lang } from './i18n';
import { policies } from './policies';
import { Highlight, generateId, captureSelectionContext, applyHighlightsToDOM, isAlreadyHighlighted, mergeOverlappingHighlights, CONTEXT_LENGTH } from './highlights';
import { auth } from './lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  sendPasswordResetEmail,
  onIdTokenChanged,
  signOut
} from 'firebase/auth';

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
  isPending?: boolean;
  highlights: Highlight[];
  matchReason?: string;
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

interface TooltipButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip: string;
  placement?: 'top' | 'bottom';
}

const TooltipButton: React.FC<TooltipButtonProps> = ({ tooltip, placement = 'bottom', className = '', children, ...props }) => (
  <span className="group relative inline-flex isolate">
    <button {...props} className={className} aria-label={tooltip}>
      {children}
    </button>
    {tooltip && (
      <span className={`hidden lg:block pointer-events-none absolute left-1/2 z-[1000] -translate-x-1/2 whitespace-nowrap rounded-xl border border-slate-700/50 bg-slate-950 px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-white shadow-xl opacity-0 scale-95 transition-all duration-150 ease-out group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100 ${placement === 'top' ? 'bottom-full mb-2 translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0' : 'top-full mt-2 -translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0'}`}>
        {tooltip}
        <span className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${placement === 'top' ? 'top-full border-t-slate-950' : 'bottom-full border-b-slate-950'}`} />
      </span>
    )}
  </span>
);

// --- Main App Component ---
const App: React.FC = () => {
  const [lang, setLang] = useState<Lang>('tr');
  const [theme, setTheme] = useState<Theme>('light');
  const t = translations[lang];

  // Auth State
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<{ id: string, email: string, name?: string, emailVerified?: boolean } | null>(null);
  // Holds a token that has been issued but NOT yet committed — user must verify email first
  const [pendingVerificationToken, setPendingVerificationToken] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [verifyOtp, setVerifyOtp] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activePolicy, setActivePolicy] = useState<'terms' | 'privacy' | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, text: string, highlightId?: string | null } | null>(null);
  const [translationPopover, setTranslationPopover] = useState<{ x: number, y: number, sourceText: string, translatedText?: string, loading: boolean, error?: string } | null>(null);

  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
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
  const [settingsForm, setSettingsForm] = useState({ email: '', currentPassword: '', newPassword: '' });
  const [settingsLoading, setSettingsLoading] = useState(false);

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
  const [shouldShowHighlightPopup, setShouldShowHighlightPopup] = useState(true);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [isArticleMenuOpen, setIsArticleMenuOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [fontSizeIdx, setFontSizeIdx] = useState(2);
  const [widthIdx, setWidthIdx] = useState(1);
  const deepLinkApplied = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchInputMobileRef = useRef<HTMLInputElement>(null);
  const addUrlInputRef = useRef<HTMLInputElement>(null);
  const addUrlInputMobileRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchContainerMobileRef = useRef<HTMLDivElement>(null);
  const addUrlContainerRef = useRef<HTMLDivElement>(null);
  const addUrlContainerMobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      
      // Handle Search Outside Click
      const isInsideSearch = (searchContainerRef.current && searchContainerRef.current.contains(target)) || 
                            (searchContainerMobileRef.current && searchContainerMobileRef.current.contains(target));
      if (isSearchActive && !isInsideSearch) {
        setIsSearchActive(false);
      }
      
      // Handle Add URL Outside Click
      const isInsideAddUrl = (addUrlContainerRef.current && addUrlContainerRef.current.contains(target)) ||
                             (addUrlContainerMobileRef.current && addUrlContainerMobileRef.current.contains(target));
      if (isAddUrlActive && !isInsideAddUrl) {
        setIsAddUrlActive(false);
        setUrlError(null);
      }

      // Close context menu on any click outside
      setContextMenu(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isSearchActive, isAddUrlActive]);

  // --- Auth Effects ---
  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
        const token = await fbUser.getIdToken();
        if (fbUser.emailVerified) {
          localStorage.setItem('token', token);
          setToken(token);
          setPendingVerificationToken(null);
          fetchUser();
        } else {
          setPendingVerificationToken(token);
          setRegisterEmail(fbUser.email || '');
        }
      } else {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    let activeToken = token || localStorage.getItem('token');
    
    if (auth.currentUser) {
      activeToken = await auth.currentUser.getIdToken();
    }

    const headers: any = {
      ...options.headers,
      'Authorization': activeToken ? `Bearer ${activeToken}` : undefined,
    };

    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    let response = await fetch(url, { ...options, headers });

    if (response.status === 401 && auth.currentUser) {
      try {
        const newToken = await auth.currentUser.getIdToken(true);
        setToken(newToken);
        localStorage.setItem('token', newToken);
        
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, { ...options, headers });
      } catch (err) {
        handleLogout();
      }
    }

    if (response.status === 401) {
      handleLogout();
    }

    return response;
  };

  const fetchUser = async () => {
    try {
      const res = await apiFetch(`${AUTH_URL}/me`);
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch (err) {
      console.error('Fetch user error:', err);
    }
  };
  const prefsLoaded = useRef(false);
  const lastSyncedPrefs = useRef<{ lang: Lang; theme: Theme; fontSizeIdx: number; widthIdx: number }>({ lang: 'tr', theme: 'light', fontSizeIdx: 2, widthIdx: 1 });

  const toggleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'sepia'];
    const next = themes[(themes.indexOf(theme) + 1) % themes.length];
    setTheme(next);
  };

  // Forgot password flow: Firebase link-based reset
  const handleRequestReset = async () => {
    setForgotError(null);
    if (!emailRegex.test(forgotEmail)) {
      setForgotError(t.invalidEmail || 'Invalid email');
      return;
    }
    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, forgotEmail);
      showToast(t.resetDataDone || 'Reset link sent — check your email');
      setForgotOpen(false);
      setForgotEmail('');
    } catch (err: any) {
      setForgotError(err?.message || t.errorOccurred);
    } finally { setLoading(false); }
  };

  // Verification handlers (after registration)
  const handleVerifyCode = async () => {
    setAuthError(null);
    if (!verifyOtp || !registerEmail) {
      setAuthError(t.fillAllFields || 'Please fill in all fields');
      return;
    }
    try {
      setVerifyLoading(true);
      const fbUser = auth.currentUser;
      if (!fbUser) throw new Error('No user found');
      
      await fbUser.reload();
      if (!fbUser.emailVerified) {
        throw new Error(t.emailNotVerified || 'Email not verified yet. Please check your inbox and click the link.');
      }

      const verifiedToken = await fbUser.getIdToken(true);
      localStorage.setItem('token', verifiedToken);
      setToken(verifiedToken);
      setPendingVerificationToken(null);

      // Fetch user data from our API
      await fetchUser();
      
      showToast(t.verifySuccess || 'Email verified');
      setVerifyOtp('');
    } catch (err: any) {
      setAuthError(err?.message || t.errorOccurred);
    } finally { setVerifyLoading(false); }
  };

  const handleResendVerify = async () => {
    if (!auth.currentUser) return;
    try {
      setVerifyLoading(true);
      await sendEmailVerification(auth.currentUser);
      showToast(t.verificationCodeSent || 'Verification link sent');
    } catch (err: any) {
      setAuthError(err?.message || t.errorOccurred);
    } finally { setVerifyLoading(false); }
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
  const AUTH_URL  = `${API_BASE}/api/v1/auth`;
  const emailRegex = /^[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}$/;
  const WS_URL    = `${API_BASE.replace(/^https?/, (m: string) => m === 'https' ? 'wss' : 'ws')}/ws`;
  

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--article-width-idx', String(widthIdx));
  }, [widthIdx]);

  useEffect(() => {
    if (deepLinkApplied.current || !articles.length || selectedArticle) return;

    const params = new URLSearchParams(window.location.search);
    const articleId = params.get('article');
    const highlightId = params.get('highlight');
    if (!articleId) return;

    const article = articles.find(a => a._id === articleId);
    if (!article) return;

    deepLinkApplied.current = true;
    setSelectedArticle(article);
    if (highlightId) {
      setTargetHighlightId(highlightId);
    }
  }, [articles, selectedArticle]);

  useEffect(() => {
    if (!user?.email) return;
    setSettingsForm(prev => prev.email ? prev : { ...prev, email: user.email });
  }, [user?.email]);

  // Save lang+theme to DB when the user changes them.
  useEffect(() => {
    if (!prefsLoaded.current || !token) return;
    if (
      lang === lastSyncedPrefs.current.lang &&
      theme === lastSyncedPrefs.current.theme &&
      fontSizeIdx === lastSyncedPrefs.current.fontSizeIdx &&
      widthIdx === lastSyncedPrefs.current.widthIdx
    ) return;
    lastSyncedPrefs.current = { lang, theme, fontSizeIdx, widthIdx };
    apiFetch(PREFS_URL, {
      method: 'PATCH',
      body: JSON.stringify({ lang, theme, fontSizeIdx, widthIdx })
    }).catch(() => {});
  }, [lang, theme, fontSizeIdx, widthIdx, token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchPreferences();
    fetchArticles();
    fetchUser();
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
  }, [token]);

  const fetchArticles = async () => {
    try {
      const res = await apiFetch(API_URL);
      const data = await res.json();
      if (Array.isArray(data)) setArticles(data);
    } catch (err) { console.error('Failed to fetch:', err); } finally { setLoading(false); }
  };

  const fetchPreferences = async () => {
    try {
      const res = await apiFetch(PREFS_URL);
      const data = await res.json();
      const newLang  = (data.lang  as Lang)  || 'tr';
      const newTheme = (data.theme as Theme) || 'light';
      const newFontSizeIdx = Number.isFinite(Number(data.fontSizeIdx)) ? Number(data.fontSizeIdx) : 2;
      const newWidthIdx = Number.isFinite(Number(data.widthIdx)) ? Number(data.widthIdx) : 1;
      lastSyncedPrefs.current = { lang: newLang, theme: newTheme, fontSizeIdx: newFontSizeIdx, widthIdx: newWidthIdx };
      setLang(newLang);
      setTheme(newTheme);
      setFontSizeIdx(newFontSizeIdx);
      setWidthIdx(newWidthIdx);
    } catch (_) {} finally {
      prefsLoaded.current = true;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!emailRegex.test(authForm.email)) {
      setAuthError(t.invalidEmail || 'Invalid email');
      return;
    }
    if (!authForm.password || authForm.password.length < 6) {
      setAuthError(t.passwordTooShort || 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
      const fbUser = userCredential.user;
      const idToken = await fbUser.getIdToken();

      if (!fbUser.emailVerified) {
        setPendingVerificationToken(idToken);
        setRegisterEmail(fbUser.email || authForm.email);
        showToast(t.verificationCodeSent || 'Please verify your email');
      } else {
        localStorage.setItem('token', idToken);
        setToken(idToken);
        await fetchUser();
        showToast(t.welcomeBack);
      }
    } catch (err: any) {
      let msg = err?.message;
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = t.invalidCredentials || 'Invalid credentials';
      }
      setAuthError(msg);
    } finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!authForm.name?.trim()) {
      setAuthError(t.nameRequired || 'Name is required');
      return;
    }
    if (!emailRegex.test(authForm.email)) {
      setAuthError(t.invalidEmail || 'Invalid email');
      return;
    }
    if (!authForm.password || authForm.password.length < 6) {
      setAuthError(t.passwordTooShort || 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
      const fbUser = userCredential.user;
      
      // Send verification link
      await sendEmailVerification(fbUser);
      
      const idToken = await fbUser.getIdToken();
      setPendingVerificationToken(idToken);
      setRegisterEmail(fbUser.email || authForm.email);
      showToast(t.verificationCodeSent || 'Verification link sent to your email');
    } catch (err: any) { 
      let msg = err?.message;
      if (err.code === 'auth/email-already-in-use') msg = t.emailAlreadyInUse || 'Email already in use';
      setAuthError(msg); 
    } finally { setLoading(false); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setArticles([]);
    setSelectedArticle(null);
    setPendingVerificationToken(null);
  };

  const openSettingsPage = () => {
    setIsSettingsOpen(true);
    setSelectedArticle(null);
    setContextMenu(null);
    setTranslationPopover(null);
    setHighlightToolbar(null);
    setActiveHighlightPopover(null);
  };

  const closeSettingsPage = () => setIsSettingsOpen(false);

  const handleSaveSettings = async (mode: 'email' | 'password') => {
    setSettingsLoading(true);
    try {
      const payload: Record<string, string> = { currentPassword: settingsForm.currentPassword };
      if (mode === 'email') payload.email = settingsForm.email;
      if (mode === 'password') payload.newPassword = settingsForm.newPassword;

      const res = await apiFetch(`${AUTH_URL}/me`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || t.errorOccurred);
      }

      setUser(data);
      setSettingsForm(prev => ({ ...prev, currentPassword: '', newPassword: '' }));
      if (mode === 'email') {
        showToast(t.emailUpdated || t.updatedSuccessfully);
      } else {
        showToast(t.passwordUpdated || t.updatedSuccessfully);
      }
    } catch (error: any) {
      showToast(error?.message || t.errorOccurred, 'error');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleResetData = () => {
    setConfirmModal({
      message: t.resetDataConfirm,
      confirmLabel: t.resetData,
      onConfirm: async () => {
        try {
          const res = await apiFetch(`${API_BASE}/api/v1/data`, {
            method: 'DELETE'
          });
          if (!res.ok) throw new Error(t.errorOccurred);
          setArticles([]);
          setSelectedArticle(null);
          setIsSettingsOpen(false);
          showToast(t.resetDataDone);
          setConfirmModal(null);
        } catch (error: any) {
          showToast(error?.message || t.errorOccurred, 'error');
        }
      }
    });
  };

  const handleDeleteAccount = () => {
    setConfirmModal({
      message: t.deleteAccountConfirm,
      confirmLabel: t.deleteAccount,
      onConfirm: async () => {
        try {
          const res = await apiFetch(`${AUTH_URL}/me`, {
            method: 'DELETE'
          });
          if (!res.ok) throw new Error(t.errorOccurred);
          setConfirmModal(null);
          handleLogout();
        } catch (error: any) {
          showToast(error?.message || t.errorOccurred, 'error');
        }
      }
    });
  };

  const showToast = (message: string, type: ToastType = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t_obj => t_obj.id !== id)), 4000);
  };

  const handleAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newUrl) return;

    // URL Validation
    const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
    if (!urlRegex.test(newUrl)) {
      setUrlError(lang === 'tr' ? 'Lütfen geçerli bir URL girin' : 'Please enter a valid URL');
      setTimeout(() => setUrlError(null), 3000);
      return;
    }

    if (articles.some(a => a.url === newUrl)) {
      showToast(t.alreadyExists, 'info');
      return;
    }

    setIsAdding(true);
    setUrlError(null);
    try {
      const res = await apiFetch(API_URL, {
        method: 'POST',
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
          await apiFetch(`${API_URL}/${id}`, {
            method: 'DELETE'
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
      const res = await apiFetch(`${API_URL}/${id}`, {
        method: 'PATCH',
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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // If left button is still down (selection in progress), don't show context menu
    if (e.buttons & 1) return;
    
    e.preventDefault();

    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    if (!selection || selection.isCollapsed || !text || !articleContentRef.current || !selection.rangeCount) {
      setContextMenu(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

    if (!commonAncestor || !articleContentRef.current.contains(commonAncestor)) {
      setContextMenu(null);
      return;
    }

    const context = captureSelectionContext(articleContentRef.current, selection);
    if (!context) {
      setContextMenu(null);
      return;
    }

    const highlightIdFromContext = (selectedArticle?.highlights || []).find((h) => {
      if (h.startOffset !== undefined && h.text === context.text && h.startOffset === context.startOffset) {
        return true;
      }

      const hStart = h.startOffset ?? -1;
      if (hStart < 0) return false;
      const hEnd = hStart + h.text.length;
      const selectionEnd = context.startOffset + context.text.length;
      return context.startOffset >= hStart && selectionEnd <= hEnd;
    })?.id || null;

    const target = e.target;
    const elementTarget = target instanceof Element ? target : null;
    const highlightElement = elementTarget?.closest('mark[data-highlight-id]');

    // Boundary checks for context menu
    const menuWidth = 260;
    const menuHeight = 180;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 12;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 12;
    }

    // Ensure x and y are not negative
    x = Math.max(12, x);
    y = Math.max(12, y);

    setContextMenu({
      x,
      y,
      text: context.text,
      highlightId: highlightElement?.getAttribute('data-highlight-id') || highlightIdFromContext
    });
    setTranslationPopover(null);
    setHighlightToolbar(null);
    setActiveHighlightPopover(null);
  }, [selectedArticle, lang, t]);

  const closeContextMenu = () => setContextMenu(null);

  const copyTextToClipboard = async (value: string, toastMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(toastMessage);
    } catch {
      showToast(t.connectionError, 'error');
    } finally {
      closeContextMenu();
    }
  };

  const handleCopySelection = () => {
    if (!contextMenu?.text) return;
    void copyTextToClipboard(contextMenu.text, t.copied);
  };


  const handleSearchGoogle = () => {
    if (!contextMenu?.text) return;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(contextMenu.text)}`, '_blank', 'noopener,noreferrer');
    closeContextMenu();
  };

  const handleTranslateSelection = async () => {
    if (!contextMenu?.text) return;

    const sourceText = contextMenu.text;
    const target = lang === 'tr' ? 'tr' : 'en';
    const popoverPosition = { x: contextMenu.x, y: contextMenu.y };

    setTranslationPopover({
      x: popoverPosition.x,
      y: popoverPosition.y,
      sourceText,
      loading: true,
    });
    closeContextMenu();

    try {
      const response = await apiFetch(`${API_BASE}/api/v1/translate`, {
        method: 'POST',
        body: JSON.stringify({ text: sourceText, target, source: 'auto' })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || t.translationFailed);
      }

      setTranslationPopover({
        x: popoverPosition.x,
        y: popoverPosition.y,
        sourceText,
        translatedText: data.translatedText || '',
        loading: false,
      });
    } catch (error) {
      setTranslationPopover({
        x: popoverPosition.x,
        y: popoverPosition.y,
        sourceText,
        loading: false,
        error: t.translationFailed,
      });
      showToast(t.translationFailed, 'error');
    }
  };

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
        setShouldShowHighlightPopup(true);
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
            
            
            if (shouldShowHighlightPopup) {
              setActiveHighlightPopover({ ...hl, x, y });
              setIsInlineEditing(true);
            }
            
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

  const filteredArticles = articles.map(a => {
    let matchReason = undefined;
    let matchesSearch = false;
    const query = searchQuery.toLowerCase();
    
    if (!query) {
      matchesSearch = true;
    } else if (a.title.toLowerCase().includes(query)) {
      matchesSearch = true;
      matchReason = t.matchTitle || 'başlık';
    } else if (a.url.toLowerCase().includes(query)) {
      matchesSearch = true;
      matchReason = t.matchUrl || 'bağlantı';
    } else if (a.tags.some(tag => tag.toLowerCase().includes(query))) {
      matchesSearch = true;
      matchReason = t.matchTag || 'etiket';
    } else if (a.content.toLowerCase().includes(query)) {
      matchesSearch = true;
      matchReason = t.matchContent || 'içerik';
    } else if (a.highlights?.some(h => h.text.toLowerCase().includes(query) || h.note?.toLowerCase().includes(query))) {
      matchesSearch = true;
      matchReason = t.matchNote || 'not';
    }

    return { ...a, matchesSearch, matchReason };
  }).filter(a => {
    if (!a.matchesSearch) return false;
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
    <div className="bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-color)] shadow-sm p-12 sm:p-20 flex flex-col items-center justify-center gap-6 theme-transition">
      <div className="w-20 h-20 rounded-3xl bg-yellow-500/10 flex items-center justify-center animate-in zoom-in-95 duration-500">
        <Highlighter className="w-9 h-9 text-yellow-500/60" />
      </div>
      <div className="text-center max-w-sm">
        <h3 className="text-lg font-bold text-[var(--text-main)] mb-2">{t.noHighlightsYet}</h3>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">{t.noHighlightsDesc}</p>
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
                      setShouldShowHighlightPopup(false);
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



  // --- Render Functions ---

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
    </div>
  );

  if (!token) {
    // --- Verification wall: show OTP screen, never the main app ---
    if (pendingVerificationToken) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex justify-center mb-8">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="sonra-okurum" className="h-20 w-auto" />
            </div>
            <h2 className="text-2xl font-bold text-center text-slate-800 dark:text-slate-100 mb-2">{t.verifyEmail}</h2>
            <p className="text-center text-slate-500 dark:text-slate-400 mb-8 text-sm">{t.verificationCodeSentIntro}</p>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/30">
                <p className="text-sm text-blue-700 dark:text-blue-300 text-center leading-relaxed">
                  {t.checkEmailInstructions || 'We sent a verification link to your email. Please click the link in your email and then click the button below to continue.'}
                </p>
              </div>
              <button
                onClick={handleVerifyCode}
                disabled={verifyLoading}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98]"
              >
                {verifyLoading ? <Loader2 className="w-5 h-5 animate-spin inline" /> : (t.checkVerificationStatus || 'I have verified my email')}
              </button>
              {authError && <div className="text-center text-sm text-red-600">{authError}</div>}
              <div className="text-center">
                <button
                  onClick={handleResendVerify}
                  disabled={verifyLoading}
                  className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                >
                  {t.resendCode || 'Resend link'}
                </button>
              </div>
              <div className="text-center">
                <button
                  onClick={handleLogout}
                  className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
                >
                  {t.cancel || 'Sign out'}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-500">
          <div className="flex justify-center mb-8">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="sonra-okurum" className="h-20 w-auto" />
          </div>
          
          <h2 className="text-2xl font-bold text-center text-slate-800 dark:text-slate-100 mb-2">
            {authMode === 'login' ? t.welcomeBack : t.createAccount}
          </h2>
          <p className="text-center text-slate-500 dark:text-slate-400 mb-8 text-sm">
            {authMode === 'login' ? t.dontHaveAccount : t.alreadyHaveAccount}{' '}
            <button 
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'register' : 'login');
                setAuthError(null);
              }}
              className="text-blue-600 font-semibold hover:underline"
            >
              {authMode === 'login' ? t.register : t.login}
            </button>
          </p>

          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-4" noValidate>
            {authMode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 ml-1">{t.name}</label>
                <input 
                  type="text" 
                  required
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all dark:text-white"
                  value={authForm.name}
                  onChange={e => setAuthForm({...authForm, name: e.target.value})}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 ml-1">{t.email}</label>
              <input 
                type="text" 
                
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all dark:text-white"
                value={authForm.email}
                onChange={e => setAuthForm({...authForm, email: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 ml-1">{t.password}</label>
              <input 
                type="password" 
                required
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all dark:text-white"
                value={authForm.password}
                onChange={e => setAuthForm({...authForm, password: e.target.value})}
              />
            </div>
            <button 
              type="submit"
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] mt-4"
            >
              {authMode === 'login' ? t.login : t.register}
            </button>
            {authError && (
              <div className="mt-3 text-center text-sm text-red-600">{authError}</div>
            )}
            {authMode === 'login' && (
              <div className="mt-2 text-right">
                <button type="button" onClick={() => { setForgotOpen(true); setForgotError(null); }} className="text-sm text-blue-600 hover:underline">{t.forgotPassword || 'Forgot password?'}</button>
              </div>
            )}
            <div className="mt-6 text-center text-[10px] text-slate-500 leading-relaxed px-4">
              {lang === 'tr' ? (
                <>Devam ederek <button type="button" onClick={() => setActivePolicy('terms')} className="text-blue-600 hover:underline font-bold">Kullanım Koşulları</button> ve <button type="button" onClick={() => setActivePolicy('privacy')} className="text-blue-600 hover:underline font-bold">Gizlilik Politikası</button>'nı kabul etmiş olursunuz.</>
              ) : (
                <>By continuing, you agree to our <button type="button" onClick={() => setActivePolicy('terms')} className="text-blue-600 hover:underline font-bold">Terms of Service</button> and <button type="button" onClick={() => setActivePolicy('privacy')} className="text-blue-600 hover:underline font-bold">Privacy Policy</button>.</>
              )}
            </div>
          </form>

          {forgotOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-semibold mb-3">{t.resetData || 'Password reset'}</h3>
                <p className="text-sm text-[var(--text-muted)] mb-3">{t.enterEmailForReset || 'Enter your account email and we will send a password reset link.'}</p>
                <input 
                  value={forgotEmail} 
                  onChange={e => setForgotEmail(e.target.value)} 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all dark:text-white" 
                  placeholder={t.email} 
                />
                <div className="mt-6 flex gap-3">
                  <button onClick={handleRequestReset} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98]">{t.sendCode || 'Send link'}</button>
                  <button onClick={() => { setForgotOpen(false); setForgotError(null); }} className="flex-1 py-3 border border-slate-200 dark:border-slate-700 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-[0.98]">{t.cancel || 'Cancel'}</button>
                </div>
                {forgotError && <div className="mt-3 text-sm text-red-600">{forgotError}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selectedArticle) {
    return (
      <div className="min-h-screen bg-[var(--bg-card)] text-[var(--text-main)] selection:bg-yellow-200/50 animate-in fade-in duration-300 theme-transition relative" onContextMenu={handleContextMenu} onClick={() => {
        setContextMenu(null);
        setTranslationPopover(null);
        if (!window.getSelection()?.toString()) {
          setHighlightToolbar(null);
          setActiveHighlightPopover(null);
          setIsArticleMenuOpen(false);
        }
      }}>
        <nav className="sticky top-0 bg-[var(--bg-card)]/80 backdrop-blur-md border-b border-[var(--border-color)] z-10">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between relative">
            {/* Sol: Logo (geri dön) */}
              <TooltipButton
              onClick={() => { setSelectedArticle(null); setHighlightToolbar(null); setActiveHighlightPopover(null); setIsArticleMenuOpen(false); }}
              tooltip={t.back}
              className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors hover:opacity-80"
                placement="bottom"
            >
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="sonra-okurum" className="h-10 w-auto object-contain sm:h-12" />
            </TooltipButton>

            {/* Orta: Tema ve Font Boyutu (Sabit) */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
              <div className="hidden sm:flex items-center bg-[var(--bg-main)] rounded-xl border border-[var(--border-color)] p-0.5">
                <TooltipButton onClick={() => setFontSizeIdx(i => Math.max(0, i - 1))} disabled={fontSizeIdx === 0} tooltip={t.decreaseFontSize} placement="bottom" className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] rounded-lg transition-colors font-bold text-[12px] disabled:opacity-30">A−</TooltipButton>
                <div className="w-px h-4 bg-[var(--border-color)] mx-0.5" />
                <TooltipButton onClick={() => setFontSizeIdx(i => Math.min(4, i + 1))} disabled={fontSizeIdx === 4} tooltip={t.increaseFontSize} placement="bottom" className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] rounded-lg transition-colors font-bold text-[14px] disabled:opacity-30">A+</TooltipButton>
              </div>
              
              <div className="flex sm:hidden items-center bg-[var(--bg-main)] rounded-xl border border-[var(--border-color)] p-0.5">
                <button onClick={() => setFontSizeIdx(i => i === 4 ? 0 : i + 1)} className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] font-bold text-sm">A</button>
              </div>

              <div className="hidden md:flex items-center bg-[var(--bg-main)] rounded-xl border border-[var(--border-color)] p-0.5">
                {([
                  [4,10, 4,10, 4, 8],
                  [2,12, 2,12, 2, 9],
                  [0,14, 0,14, 0,11],
                ] as [number,number,number,number,number,number][]).map(([x1a,x2a,x1b,x2b,x1c,x2c], wi) => (
                  <TooltipButton
                    key={wi}
                    onClick={() => setWidthIdx(wi)}
                    className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${widthIdx === wi ? 'bg-[var(--bg-card)] text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]'}`}
                    tooltip={wi === 0 ? t.narrowColumn : wi === 1 ? t.mediumColumn : t.wideColumn}
                    placement="bottom"
                  >
                    <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1={x1a} y1="1"   x2={x2a} y2="1"/>
                      <line x1={x1b} y1="5.5" x2={x2b} y2="5.5"/>
                      <line x1={x1c} y1="10"  x2={x2c} y2="10"/>
                    </svg>
                  </TooltipButton>
                ))}
              </div>
              
              <TooltipButton 
                onClick={toggleTheme}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--accent-color)] hover:border-[var(--accent-color)] transition-all shadow-sm"
                tooltip={theme === 'light' ? t.themeLight : theme === 'dark' ? t.themeDark : 'System'}
                placement="bottom"
              >
                {theme === 'light' ? <Sun className="w-4 h-4" /> : theme === 'dark' ? <Moon className="w-4 h-4" /> : <Coffee className="w-4 h-4" />}
              </TooltipButton>
            </div>

            {/* Sağ: açılır menü + üç nokta */}
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              <div className={`flex items-center transition-all duration-300 ease-out overflow-hidden ${isArticleMenuOpen ? 'max-w-[300px] opacity-100 mr-2' : 'max-w-0 opacity-0 mr-0'}`}>
                <div className="flex items-center bg-[var(--bg-main)] rounded-xl border border-[var(--border-color)] p-0.5">
                  <TooltipButton 
                    onClick={() => { updateArticle(selectedArticle._id, { isFavorite: !selectedArticle.isFavorite }); setIsArticleMenuOpen(false); }} 
                    tooltip={selectedArticle.isFavorite ? t.removeFavorite : t.favorite}
                    className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] rounded-lg transition-colors group"
                  >
                    <Star className={`w-4 h-4 transition-all group-active:scale-125 ${selectedArticle.isFavorite ? 'text-amber-500 fill-current' : ''}`} /> 
                  </TooltipButton>

                  <TooltipButton 
                    onClick={() => { window.open(selectedArticle.url, '_blank', 'noopener,noreferrer'); setIsArticleMenuOpen(false); }} 
                    tooltip={t.menuSource || t.original}
                    className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> 
                  </TooltipButton>

                  <TooltipButton 
                    onClick={() => { updateArticle(selectedArticle._id, { isArchived: !selectedArticle.isArchived }); setIsArticleMenuOpen(false); }} 
                    tooltip={selectedArticle.isArchived ? t.unarchive : t.archiveArticle}
                    className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                  >
                    <Archive className="w-4 h-4" /> 
                  </TooltipButton>

                  <div className="w-px h-4 bg-[var(--border-color)] mx-1" />

                  <TooltipButton 
                    onClick={() => { handleDelete(selectedArticle._id); setIsArticleMenuOpen(false); }} 
                    tooltip={t.delete}
                    className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> 
                  </TooltipButton>
                </div>
              </div>

              <TooltipButton 
                onClick={() => setIsArticleMenuOpen(!isArticleMenuOpen)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isArticleMenuOpen ? 'bg-slate-800 text-white' : 'bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                tooltip={t.articleActions}
                placement="bottom"
              >
                {isArticleMenuOpen ? <X className="w-5 h-5" /> : <MoreVertical className="w-5 h-5" />}
              </TooltipButton>
            </div>
          </div>
        </nav>
        <article className={`${['max-w-xl','max-w-2xl','max-w-3xl'][widthIdx]} mx-auto px-4 pt-12 pb-32 md:pt-20 md:pb-32 relative`}>
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

        {contextMenu && (
          <div
            className="fixed z-[180] min-w-64 animate-in fade-in zoom-in-95 duration-150"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl backdrop-blur-md">
              <button
                onClick={handleCopySelection}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[var(--text-main)] hover:bg-[var(--bg-main)] transition-colors"
              >
                <Copy className="w-4 h-4 text-[var(--text-muted)]" />
                {t.copy}
              </button>
              {/* copy link to highlight removed per UX request */}
              <button
                onClick={handleSearchGoogle}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[var(--text-main)] hover:bg-[var(--bg-main)] transition-colors"
              >
                <Search className="w-4 h-4 text-[var(--text-muted)]" />
                {t.searchGoogleForSelection}
              </button>
              <button
                onClick={handleTranslateSelection}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[var(--text-main)] hover:bg-[var(--bg-main)] transition-colors"
              >
                <Languages className="w-4 h-4 text-[var(--text-muted)]" />
                {t.translateSelection}
              </button>
              <div className="my-1 h-px bg-[var(--border-color)]" />
              <button
                onClick={() => { createHighlight(false); setContextMenu(null); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[var(--text-main)] hover:bg-[var(--bg-main)] transition-colors"
              >
                <Highlighter className="w-4 h-4 text-blue-600" />
                {t.highlight}
              </button>
              <button
                onClick={() => { createHighlight(true); setContextMenu(null); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[var(--text-main)] hover:bg-[var(--bg-main)] transition-colors"
              >
                <MessageSquarePlus className="w-4 h-4 text-blue-600" />
                {t.addNote}
              </button>
            </div>
          </div>
        )}

        {translationPopover && (
          <div
            className="fixed z-[181] w-80 max-w-[calc(100vw-2rem)] animate-in fade-in zoom-in-95 duration-150"
            style={{ top: translationPopover.y + 8, left: translationPopover.x + 8 }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{t.translation}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{translationPopover.sourceText}</p>
                </div>
                <button
                  onClick={() => setTranslationPopover(null)}
                  className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-main)] hover:text-[var(--text-main)] transition-colors"
                  title={t.cancel}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-4 py-3 text-sm leading-relaxed text-[var(--text-main)]">
                {translationPopover.loading ? (
                  <div className="flex items-center gap-2 text-[var(--text-muted)]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t.translating}
                  </div>
                ) : translationPopover.error ? (
                  <p className="text-red-600">{translationPopover.error}</p>
                ) : (
                  <p className="whitespace-pre-wrap">{translationPopover.translatedText}</p>
                )}
              </div>
            </div>
          </div>
        )}

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
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
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
          <div className="mb-12 flex items-center justify-between px-1">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="sonra-okurum" className="h-12 w-auto object-contain rounded-xl shadow-md border border-[var(--border-color)]" />
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleLang}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--accent-color)] hover:border-[var(--accent-color)] transition-all shadow-sm text-xs font-bold"
                title={lang === 'tr' ? 'Türkçe' : 'English'}
              >
                {lang === 'tr' ? 'TR' : 'EN'}
              </button>
              <button 
                onClick={toggleTheme}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--accent-color)] hover:border-[var(--accent-color)] transition-all shadow-sm"
                title={theme === 'light' ? t.themeLight : theme === 'dark' ? t.themeDark : 'System'}
              >
                {theme === 'light' ? <Sun className="w-4 h-4" /> : theme === 'dark' ? <Moon className="w-4 h-4" /> : <Coffee className="w-4 h-4" />}
              </button>
              <button 
                onClick={openSettingsPage}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--accent-color)] hover:border-[var(--accent-color)] transition-all shadow-sm"
                title={t.settings}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
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
        <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-main)] safe-pb relative" onClick={() => setActiveMenuId(null)}>
          {/* Header */}
          <header className="sticky top-0 z-[200] bg-[var(--bg-main)]/80 backdrop-blur-md lg:bg-transparent lg:backdrop-blur-none border-b lg:border-none border-[var(--border-color)] px-4 sm:px-8 py-3 flex items-center justify-between gap-4 transition-colors" onClick={e => e.stopPropagation()}>
            {!isSearchActive && !isAddUrlActive && (
              <div className="flex items-center gap-3 lg:hidden">
                <img src={`${import.meta.env.BASE_URL}logo.png`} alt="logo" className="h-8 w-auto" />
              </div>
            )}

            <div className="flex-1 flex items-center justify-end gap-2 lg:hidden min-w-0">
              <div ref={searchContainerMobileRef} className={`relative flex items-center transition-all duration-300 ${isSearchActive ? 'flex-1' : ''}`} onClick={e => e.stopPropagation()}>
                <div className={`flex items-center transition-all duration-300 ease-out overflow-hidden ${isSearchActive ? 'w-full opacity-100' : 'w-0 opacity-0'}`}>
                  <div className="relative w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input 
                      ref={searchInputMobileRef}
                      type="text" 
                      className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl py-2.5 pl-11 pr-4 text-sm outline-none focus:border-blue-600/30 transition-all shadow-sm"
                      placeholder={t.searchPlaceholder}
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                </div>
                {!isSearchActive && !isAddUrlActive && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsSearchActive(true); setIsAddUrlActive(false); setTimeout(() => { searchInputRef.current?.focus(); searchInputMobileRef.current?.focus(); }, 100); }}
                    className="w-10 h-10 flex items-center justify-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] shadow-sm active:scale-95"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                )}
              </div>

              <div ref={addUrlContainerMobileRef} className={`relative flex items-center transition-all duration-300 ${isAddUrlActive ? 'flex-1' : ''}`} onClick={e => e.stopPropagation()}>
                <div className={`flex items-center transition-all duration-300 ease-out overflow-hidden ${isAddUrlActive ? 'w-full opacity-100' : 'w-0 opacity-0'}`}>
                  <div className="relative w-full">
                    <Plus className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
                    <input 
                      ref={addUrlInputMobileRef}
                      type="url" 
                      className={`w-full bg-[var(--bg-card)] border ${urlError ? 'border-red-500' : 'border-[var(--border-color)]'} rounded-2xl py-2.5 pl-11 pr-24 text-sm outline-none focus:border-blue-600/30 transition-all shadow-sm`}
                      placeholder={t.urlPlaceholder}
                      value={newUrl}
                      onChange={e => { setNewUrl(e.target.value); setUrlError(null); }}
                      onClick={e => e.stopPropagation()}
                    />
                    {urlError && (
                      <div className="absolute left-0 -bottom-8 w-full text-[10px] font-bold text-red-500 bg-red-500/10 py-1 px-3 rounded-lg animate-in fade-in slide-in-from-top-1">
                        {urlError}
                      </div>
                    )}
                    <button 
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAdd(e); }}
                      disabled={isAdding || !newUrl}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-md active:scale-95"
                    >
                      {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t.save}
                    </button>
                  </div>
                </div>
                {!isAddUrlActive && !isSearchActive && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsAddUrlActive(true); setIsSearchActive(false); setTimeout(() => { addUrlInputRef.current?.focus(); addUrlInputMobileRef.current?.focus(); }, 100); }}
                    className="w-10 h-10 flex items-center justify-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] shadow-sm active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {!isSearchActive && !isAddUrlActive && (
              <div className="flex lg:hidden items-center gap-3">
                <button onClick={openSettingsPage} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all shadow-sm">
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-[var(--text-main)] mb-1">
                    {activeFilter.type === 'all' ? t.inbox : 
                     activeFilter.type === 'favorite' ? t.favorites :
                     activeFilter.type === 'archive' ? t.archive :
                     activeFilter.type === 'highlights' ? t.myNotes :
                     activeFilter.value}
                  </h1>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    {numToWords(filteredArticles.length, lang)} {t.articles}
                  </p>
                </div>

                <div className="hidden lg:flex items-center gap-2">
                  <div ref={searchContainerRef} className="relative flex items-center">
                    <div className={`flex items-center transition-all duration-300 ease-out overflow-hidden ${isSearchActive ? 'w-64 opacity-100' : 'w-0 opacity-0'}`}>
                      <div className="relative w-full mr-2">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input 
                          ref={searchInputRef}
                          type="text" 
                          className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl py-2.5 pl-11 pr-4 text-sm outline-none focus:border-blue-600/30 focus:shadow-[0_0_20px_rgba(37,99,235,0.08)] transition-all shadow-sm"
                          placeholder={t.searchPlaceholder}
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                        />
                      </div>
                    </div>
                    {!isSearchActive && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsSearchActive(true); setIsAddUrlActive(false); setTimeout(() => { searchInputRef.current?.focus(); searchInputMobileRef.current?.focus(); }, 100); }}
                        className="w-10 h-10 flex items-center justify-center rounded-2xl transition-all shrink-0 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-blue-600 shadow-sm active:scale-95"
                      >
                        <Search className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  
                  <div ref={addUrlContainerRef} className="relative flex items-center" onClick={e => e.stopPropagation()}>
                    <div className={`flex items-center transition-all duration-300 ease-out overflow-hidden ${isAddUrlActive ? 'w-80 opacity-100' : 'w-0 opacity-0'}`}>
                      <div className="relative w-full mr-2">
                        <Plus className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
                        <input 
                          ref={addUrlInputRef}
                          type="url" 
                          className={`w-full bg-[var(--bg-card)] border ${urlError ? 'border-red-500' : 'border-[var(--border-color)]'} rounded-2xl py-2.5 pl-11 pr-24 text-sm outline-none focus:border-blue-600/30 transition-all shadow-sm`}
                          placeholder={t.urlPlaceholder}
                          value={newUrl}
                          onChange={e => { setNewUrl(e.target.value); setUrlError(null); }}
                          onClick={e => e.stopPropagation()}
                        />
                        {urlError && (
                          <div className="absolute left-0 -bottom-8 w-full text-[10px] font-bold text-red-500 bg-red-500/10 py-1 px-3 rounded-lg animate-in fade-in slide-in-from-top-1">
                            {urlError}
                          </div>
                        )}
                        <button 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAdd(e); }}
                          disabled={isAdding || !newUrl}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-md shadow-blue-600/20 active:scale-95"
                        >
                          {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t.save}
                        </button>
                      </div>
                    </div>
                    {!isAddUrlActive && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsAddUrlActive(true); setIsSearchActive(false); setTimeout(() => { addUrlInputRef.current?.focus(); addUrlInputMobileRef.current?.focus(); }, 100); }}
                        className="w-10 h-10 flex items-center justify-center rounded-2xl transition-all shrink-0 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-blue-600 shadow-sm active:scale-95"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:gap-6">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /><p className="text-[var(--text-muted)] font-medium">{t.loading}</p></div>
                ) : activeFilter.type === 'highlights' ? (
                  <div className="">{highlightsContent}</div>
                ) : filteredArticles.length === 0 ? (
                  <div className="bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-color)] shadow-sm p-12 sm:p-20 flex flex-col items-center justify-center gap-6 theme-transition">
                    <div className="w-20 h-20 rounded-3xl bg-blue-600/5 flex items-center justify-center animate-in zoom-in-95 duration-500">
                      {activeFilter.type === 'favorite' ? <Star className="w-9 h-9 text-amber-500/60" /> : 
                       activeFilter.type === 'archive' ? <Archive className="w-9 h-9 text-slate-500/60" /> : 
                       <Inbox className="w-9 h-9 text-blue-600/60" />}
                    </div>
                    <div className="text-center max-w-sm">
                      <h3 className="text-lg font-bold text-[var(--text-main)] mb-2">
                        {activeFilter.type === 'favorite' ? t.noFavoritesYet : 
                         activeFilter.type === 'archive' ? t.noArchiveYet : 
                         t.noArticlesYet}
                      </h3>
                      <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                        {activeFilter.type === 'favorite' ? t.noFavoritesDesc : 
                         activeFilter.type === 'archive' ? t.noArchiveDesc : 
                         t.noArticlesDesc}
                      </p>
                    </div>
                  </div>
                ) : (
                  filteredArticles.map((article) => (
                    <div key={article._id} onClick={() => setSelectedArticle(article)} className="group bg-[var(--bg-card)] p-5 sm:p-7 rounded-[2rem] shadow-sm border border-[var(--border-color)] hover:border-blue-600/30 hover:shadow-xl transition-all cursor-pointer relative theme-transition flex flex-col sm:flex-row gap-6 overflow-visible w-full">
                      {/* Card Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-600/5 px-2.5 py-1 rounded-lg">{article.isPending ? '...' : (article.siteName || 'link')}</span>
                              {article.isPending ? (
                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-blue-500 uppercase tracking-wider animate-pulse">
                                  <Loader2 className="w-3 h-3 animate-spin" /> {lang === 'tr' ? 'TARANIYOR...' : 'SCRAPING...'}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                                  <Clock className="w-3 h-3" /> {article.readingTimeMinutes} {t.minRead}
                                </span>
                              )}
                            </div>
                            <h2 className="text-xl font-bold group-hover:text-blue-600 transition-colors leading-tight line-clamp-2">{article.title}</h2>
                          </div>
                          
                          <div className="relative shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === article._id ? null : article._id); }} className="w-9 h-9 flex items-center justify-center hover:bg-[var(--bg-main)] rounded-xl text-[var(--text-muted)] transition-colors">
                              <MoreHorizontal className="w-5 h-5" />
                            </button>
                            {activeMenuId === article._id && (
                              <div className="absolute right-0 mt-2 w-52 glass rounded-2xl shadow-2xl z-[300] py-2 animate-in zoom-in-95 duration-100 origin-top-right border border-[var(--border-color)]" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => setEditArticle(article)} className="w-full text-left px-4 py-2 hover:bg-blue-600/5 flex items-center gap-2 text-sm font-medium"><Edit3 className="w-4 h-4 text-[var(--text-muted)]" /> {t.editArticle}</button>
                                <button onClick={() => setTagModalArticle(article)} className="w-full text-left px-4 py-2 hover:bg-blue-600/5 flex items-center gap-2 text-sm font-medium"><Tag className="w-4 h-4 text-[var(--text-muted)]" /> {t.manageTags}</button>
                                <button onClick={() => setFolderModalArticle(article)} className="w-full text-left px-4 py-2 hover:bg-blue-600/5 flex items-center gap-2 text-sm font-medium"><Move className="w-4 h-4 text-[var(--text-muted)]" /> {t.moveToFolder}</button>
                                <button onClick={() => updateArticle(article._id, { isFavorite: !article.isFavorite })} className="w-full text-left px-4 py-2 hover:bg-blue-600/5 flex items-center gap-2 text-sm font-medium"><Star className={`w-4 h-4 ${article.isFavorite ? 'text-amber-500 fill-current' : 'text-[var(--text-muted)]'}`} /> {article.isFavorite ? t.removeFavorite : t.favorite}</button>
                                <button onClick={() => updateArticle(article._id, { isArchived: !article.isArchived })} className="w-full text-left px-4 py-2 hover:bg-blue-600/5 flex items-center gap-2 text-sm font-medium"><Archive className="w-4 h-4 text-[var(--text-muted)]" /> {article.isArchived ? t.unarchive : t.archiveArticle}</button>
                                <div className="h-px bg-[var(--border-color)] my-2" /><button onClick={() => handleDelete(article._id)} className="w-full text-left px-4 py-2 hover:bg-red-500/5 flex items-center gap-2 text-sm font-medium text-red-600"><Trash2 className="w-4 h-4" /> {t.delete}</button>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <p className="text-[var(--text-muted)] text-sm line-clamp-2 leading-relaxed opacity-80 mb-6">{article.description}</p>
                        
                        <div className="flex items-center justify-between mt-auto pt-5 border-t border-[var(--border-color)]/40">
                          <div className="flex items-center gap-2">
                            {article.isFavorite && <div className="p-1 rounded-lg bg-amber-500/10 text-amber-500"><Star className="w-3 h-3 fill-current" /></div>}
                            {article.isArchived && <div className="p-1 rounded-lg bg-slate-500/10 text-slate-500"><Archive className="w-3 h-3" /></div>}
                            <div className="flex gap-1">
                              {article.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="text-[10px] font-bold px-2 py-0.5 bg-[var(--bg-main)] text-[var(--text-muted)] rounded-md border border-[var(--border-color)]">#{tag}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Bottom Nav (Mobile Only) */}
          <nav className="lg:hidden fixed bottom-0 left-0 right-0 glass border-t border-x-0 border-b-0 border-[var(--border-color)] px-6 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex items-center justify-between z-[200] shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
            <button 
              onClick={() => { setActiveFilter({ type: 'all' }); setIsLibraryOpen(false); setIsSettingsOpen(false); }}
              className={`flex flex-col items-center gap-1 transition-all ${activeFilter.type === 'all' && !isLibraryOpen && !isSettingsOpen ? 'text-blue-600 scale-110' : 'text-[var(--text-muted)]'}`}
            >
              <Inbox className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-tight">{t.inbox}</span>
            </button>
            <button 
              onClick={() => { setActiveFilter({ type: 'favorite' }); setIsLibraryOpen(false); setIsSettingsOpen(false); }}
              className={`flex flex-col items-center gap-1 transition-all ${activeFilter.type === 'favorite' && !isLibraryOpen && !isSettingsOpen ? 'text-amber-500 scale-110' : 'text-[var(--text-muted)]'}`}
            >
              <Star className={`w-5 h-5 ${activeFilter.type === 'favorite' ? 'fill-current' : ''}`} />
              <span className="text-[10px] font-black uppercase tracking-tight">{t.favorites}</span>
            </button>
            <button 
              onClick={() => { setActiveFilter({ type: 'archive' }); setIsLibraryOpen(false); setIsSettingsOpen(false); }}
              className={`flex flex-col items-center gap-1 transition-all ${activeFilter.type === 'archive' && !isLibraryOpen && !isSettingsOpen ? 'text-slate-800 dark:text-slate-200 scale-110' : 'text-[var(--text-muted)]'}`}
            >
              <Archive className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-tight">{t.archive}</span>
            </button>
            <button 
              onClick={() => { setActiveFilter({ type: 'folder', value: folders[0] }); setIsLibraryOpen(true); setIsSettingsOpen(false); setSelectedArticle(null); }}
              className={`flex flex-col items-center gap-1 transition-all ${isLibraryOpen ? 'text-blue-600 scale-110' : 'text-[var(--text-muted)]'}`}
            >
              <Folder className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-tight">{t.library}</span>
            </button>
            <button 
              onClick={() => { setActiveFilter({ type: 'highlights' }); setIsLibraryOpen(false); setIsSettingsOpen(false); }}
              className={`flex flex-col items-center gap-1 transition-all ${activeFilter.type === 'highlights' ? 'text-yellow-500 scale-110' : 'text-[var(--text-muted)]'}`}
            >
              <Highlighter className={`w-5 h-5 ${activeFilter.type === 'highlights' ? 'fill-current' : ''}`} />
              <span className="text-[10px] font-black uppercase tracking-tight">{t.myNotes}</span>
            </button>
          </nav>
        </main>


        {isSettingsOpen && (
          <div className="fixed inset-0 z-[210] bg-[var(--bg-main)] text-[var(--text-main)] animate-in fade-in duration-200 overflow-y-auto">
            <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 md:px-6 md:py-10 pb-32">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[var(--text-muted)]">{t.settings}</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{t.settings}</h2>
                </div>
                <button onClick={closeSettingsPage} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-2.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
                <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:p-6 shadow-sm">
                  <div className="mb-6 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--border-color)] text-lg font-bold">
                      {(user?.email?.[0] || 'U').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">{user?.email}</p>
                      <p className="text-sm text-[var(--text-muted)]">{lang === 'tr' ? 'hesap ayarları' : 'account settings'}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">{t.email}</label>
                      <input
                        type="text"
                        value={settingsForm.email}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-3 text-[var(--text-main)] outline-none transition-colors focus:ring-2 focus:ring-blue-600"
                        placeholder={t.email}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">{t.currentPassword}</label>
                        <input
                          type="password"
                          value={settingsForm.currentPassword}
                          onChange={(e) => setSettingsForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                          className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-3 text-[var(--text-main)] outline-none transition-colors focus:ring-2 focus:ring-blue-600"
                          placeholder={t.currentPassword}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">{t.newPassword}</label>
                        <input
                          type="password"
                          value={settingsForm.newPassword}
                          onChange={(e) => setSettingsForm(prev => ({ ...prev, newPassword: e.target.value }))}
                          className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-3 text-[var(--text-main)] outline-none transition-colors focus:ring-2 focus:ring-blue-600"
                          placeholder={t.newPassword}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                      <button
                        onClick={() => handleSaveSettings('email')}
                        disabled={settingsLoading || !settingsForm.email.trim() || !settingsForm.currentPassword.trim()}
                        className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t.saveEmail}
                      </button>
                      <button
                        onClick={() => handleSaveSettings('password')}
                        disabled={settingsLoading || !settingsForm.currentPassword.trim() || !settingsForm.newPassword.trim()}
                        className="flex-1 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-3 font-bold transition-colors hover:bg-[var(--border-color)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t.savePassword}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="space-y-4 rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:p-6 shadow-sm">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">{lang === 'tr' ? 'güvenli işlemler' : 'secure actions'}</p>
                    <h3 className="mt-2 text-lg font-semibold">{lang === 'tr' ? 'hesap işlemleri' : 'account actions'}</h3>
                  </div>

                  <button
                    onClick={handleResetData}
                    className="flex w-full items-center justify-between rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-4 text-left transition-colors hover:bg-[var(--border-color)]"
                  >
                    <div>
                      <p className="font-semibold">{t.resetData}</p>
                      <p className="text-sm text-[var(--text-muted)]">{t.resetDataDescription}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                  </button>

                  <button
                    onClick={handleDeleteAccount}
                    className="flex w-full items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-4 text-left text-red-600 transition-colors hover:bg-red-500/10"
                  >
                    <div>
                      <p className="font-semibold">{t.deleteAccount}</p>
                      <p className="text-sm text-red-500/80">{t.deleteAccountDescription}</p>
                    </div>
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => { handleLogout(); closeSettingsPage(); }}
                    className="flex w-full items-center justify-between rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-4 text-left transition-colors hover:bg-[var(--border-color)]"
                  >
                    <div>
                      <p className="font-semibold">{t.logout}</p>
                      <p className="text-sm text-[var(--text-muted)]">{lang === 'tr' ? 'oturumu kapat' : 'sign out'}</p>
                    </div>
                    <LogOut className="w-4 h-4 text-[var(--text-muted)]" />
                  </button>
                </section>
              </div>
            </div>
          </div>
        )}

        {isLibraryOpen && (
          <div className="fixed top-[57px] bottom-[calc(60px+var(--safe-area-bottom))] inset-x-0 z-[190] bg-[var(--bg-main)] text-[var(--text-main)] animate-in slide-in-from-right duration-300 overflow-y-auto">
            <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 py-6">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[var(--text-muted)]">{t.library}</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight">{t.library}</h2>
                </div>
              </div>

              <div className="space-y-8 pb-32 overflow-y-auto">
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Folder className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">{t.folders}</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {folders.map(f => (
                      <button 
                        key={f} 
                        onClick={() => { setActiveFilter({ type: 'folder', value: f }); setIsLibraryOpen(false); }}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${activeFilter.type === 'folder' && activeFilter.value === f ? 'bg-blue-600/10 border-blue-600/30 text-blue-600' : 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-main)]'}`}
                      >
                        <div className="flex items-center gap-3">
                          <Folder className={`w-4 h-4 ${activeFilter.type === 'folder' && activeFilter.value === f ? 'text-blue-600' : 'text-[var(--text-muted)]'}`} />
                          <span className="font-semibold">{f}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 opacity-30" />
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Tag className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">{t.tags}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map(t_str => (
                      <button 
                        key={t_str} 
                        onClick={() => { setActiveFilter({ type: 'tag', value: t_str }); setIsLibraryOpen(false); }}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${activeFilter.type === 'tag' && activeFilter.value === t_str ? 'bg-blue-600 border-blue-600 text-white' : 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-muted)]'}`}
                      >
                        #{t_str}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}


        {/* Modals with themes support */}
        {editArticle && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200">
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

        {tagModalArticle && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setTagModalArticle(null)} />
            <div className="relative bg-[var(--bg-card)] text-[var(--text-main)] rounded-[2rem] p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 border border-[var(--border-color)]">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-xl font-bold tracking-tight">{t.manageTags}</h3>
                  <p className="text-[var(--text-muted)] text-[11px] font-medium uppercase tracking-wider mt-1">{tagModalArticle.title}</p>
                </div>
                <button onClick={() => setTagModalArticle(null)} className="p-2 hover:bg-[var(--bg-main)] rounded-xl transition-colors text-[var(--text-muted)]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-6">
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {tagModalArticle.tags.map(t_str => (
                    <span key={t_str} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/5 text-blue-600 text-xs font-bold rounded-lg border border-blue-600/10">
                      #{t_str}
                      <button onClick={() => removeTag(t_str)} className="hover:text-red-500 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {tagModalArticle.tags.length === 0 && <p className="text-[var(--text-muted)] text-xs italic py-2">{t.noTagsYet}</p>}
                </div>

                <form onSubmit={handleAddTag} className="relative">
                  <input 
                    type="text" 
                    placeholder={t.enterTag} 
                    value={newTagInput} 
                    onChange={(e) => setNewTagInput(e.target.value)} 
                    className="w-full pl-4 pr-12 py-3 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all outline-none text-[var(--text-main)] text-sm" 
                    autoFocus 
                  />
                  <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95">
                    <Plus className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {folderModalArticle && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setFolderModalArticle(null)} />
            <div className="relative bg-[var(--bg-card)] text-[var(--text-main)] rounded-[2rem] p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 border border-[var(--border-color)]">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-xl font-bold tracking-tight">{t.moveToFolder}</h3>
                  <p className="text-[var(--text-muted)] text-[11px] font-medium uppercase tracking-wider mt-1">{folderModalArticle.title}</p>
                </div>
                <button onClick={() => setFolderModalArticle(null)} className="p-2 hover:bg-[var(--bg-main)] rounded-xl transition-colors text-[var(--text-muted)]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-6">
                <div className="space-y-1.5 max-h-60 overflow-y-auto mb-6 pr-1 custom-scrollbar">
                  <button 
                    onClick={() => { updateArticle(folderModalArticle._id, { folder: 'Inbox' }); setFolderModalArticle(null); }}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all ${folderModalArticle.folder === 'Inbox' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-[var(--bg-main)] hover:bg-[var(--border-color)] text-[var(--text-main)]'}`}
                  >
                    <Inbox className={`w-4 h-4 ${folderModalArticle.folder === 'Inbox' ? 'text-white' : 'text-blue-600'}`} /> 
                    <span className="text-sm font-bold">{t.inbox}</span>
                  </button>
                  {folders.map(f => (
                    <button 
                      key={f} 
                      onClick={() => { updateArticle(folderModalArticle._id, { folder: f }); setFolderModalArticle(null); }} 
                      className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all ${folderModalArticle.folder === f ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-[var(--bg-main)] hover:bg-[var(--border-color)] text-[var(--text-main)]'}`}
                    >
                      <Folder className={`w-4 h-4 ${folderModalArticle.folder === f ? 'text-white' : 'text-blue-600'}`} /> 
                      <span className="text-sm font-bold">{f}</span>
                    </button>
                  ))}
                </div>

                <form onSubmit={handleAddFolder} className="relative">
                  <input 
                    type="text" 
                    placeholder={t.folderName} 
                    value={newFolderInput} 
                    onChange={(e) => setNewFolderInput(e.target.value)} 
                    className="w-full pl-4 pr-12 py-3 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all outline-none text-[var(--text-main)] text-sm" 
                  />
                  <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95">
                    <Plus className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Global Notifications */}
        <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-[500]">
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
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200">
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
        {activePolicy && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setActivePolicy(null)} />
            <div className="relative bg-[var(--bg-card)] text-[var(--text-main)] rounded-3xl p-6 md:p-8 max-w-2xl w-full h-full max-h-[85vh] shadow-2xl animate-in zoom-in-95 duration-200 border border-[var(--border-color)] flex flex-col">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border-color)]">
                <h3 className="text-xl font-bold">{activePolicy === 'terms' ? t.terms : t.privacy}</h3>
                <button onClick={() => setActivePolicy(null)} className="p-2 hover:bg-[var(--bg-main)] rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 space-y-4 text-sm leading-relaxed text-[var(--text-muted)] custom-scrollbar whitespace-pre-wrap">
                {policies[activePolicy][lang]}
              </div>
              <div className="mt-6 pt-4 border-t border-[var(--border-color)] flex justify-end">
                <button onClick={() => setActivePolicy(null)} className="px-6 py-2.5 bg-[var(--text-main)] text-[var(--bg-card)] rounded-xl font-bold transition-transform hover:scale-105 active:scale-95">
                  {t.done}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </UIContext.Provider>
  );
};

export default App;
