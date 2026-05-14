const API_BASE = 'https://read-it-later-0kwt.onrender.com/api/v1';
// const API_BASE = 'http://localhost:3001/api/v1';

const T = {
  tr: {
    tagline:       'sonra oku.',
    loadingPage:   'sayfa yükleniyor…',
    saveBtn:       'kütüphaneye kaydet',
    saved:         'kaydedildi ✓',
    savedStatus:   'kütüphanenize eklendi',
    alreadyBtn:    'zaten kaydedilmiş',
    alreadyStatus: 'bu makale kütüphanenizde mevcut',
    retryBtn:      'tekrar dene',
    loginTitle:    'Giriş Yap',
    loginBtn:      'Giriş Yap',
    emailLabel:    'E-posta',
    passwordLabel: 'Şifre',
    loginError:    'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.',
    logoutBtn:     'Çıkış Yap',
  },
  en: {
    tagline:       'read it later.',
    loadingPage:   'loading page…',
    saveBtn:       'save to library',
    saved:         'saved ✓',
    savedStatus:   'added to your library',
    alreadyBtn:    'already saved',
    alreadyStatus: 'this article is in your library',
    retryBtn:      'try again',
    loginTitle:    'Log In',
    loginBtn:      'Log In',
    emailLabel:    'Email',
    passwordLabel: 'Password',
    loginError:    'Login failed. Please check your credentials.',
    logoutBtn:     'Log Out',
  },
};

const mainView     = document.getElementById('mainView');
const loginView    = document.getElementById('loginView');
const saveBtn      = document.getElementById('saveBtn');
const btnText      = document.getElementById('btnText');
const statusEl     = document.getElementById('status');
const titleEl      = document.getElementById('pageTitle');
const hostEl       = document.getElementById('pageHost');
const faviconEl    = document.getElementById('pageFavicon');
const faviconPh    = document.getElementById('faviconPlaceholder');
const taglineEl    = document.getElementById('brandTagline');

const loginBtn     = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');
const loginStatus  = document.getElementById('loginStatus');
const logoutBtn    = document.getElementById('logoutBtn');
const emailInput   = document.getElementById('email');
const passInput    = document.getElementById('password');

const labelEmail   = document.getElementById('labelEmail');
const labelPassword= document.getElementById('labelPassword');

let t = T.tr; // fallback until prefs load
let authToken = null;

function setStatus(text, type = '') {
  statusEl.innerHTML = text
    ? `<span class="status-dot ${type}"></span>${text}`
    : '';
  statusEl.className = type;
}

function showFavicon(url) {
  faviconEl.src = url;
  faviconEl.style.display = 'block';
  faviconPh.style.display = 'none';
  faviconEl.onerror = () => {
    faviconEl.style.display = 'none';
    faviconPh.style.display = 'block';
  };
}

function applyLang(lang) {
  t = T[lang] || T.tr;
  taglineEl.textContent  = t.tagline;
  if (labelEmail)    labelEmail.textContent = t.emailLabel;
  if (labelPassword) labelPassword.textContent = t.passwordLabel;
  if (loginBtnText)  loginBtnText.textContent = t.loginBtn;
  if (logoutBtn)     logoutBtn.textContent = t.logoutBtn;
  
  // Only update button text if it's still in the default/loading state
  if (!saveBtn.disabled) btnText.textContent = t.saveBtn;
}

function switchView(view) {
  if (view === 'main') {
    mainView.style.display = 'block';
    loginView.style.display = 'none';
  } else {
    mainView.style.display = 'none';
    loginView.style.display = 'block';
  }
}

async function apiFetch(endpoint, options = {}) {
  const headers = {
    ...options.headers,
    'Authorization': authToken ? `Bearer ${authToken}` : undefined,
    'Content-Type': options.body ? 'application/json' : undefined,
  };
  
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  
  if (res.status === 401) {
    chrome.storage.local.remove('token');
    authToken = null;
    switchView('login');
    throw new Error('Unauthorized');
  }
  
  return res;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Check for token
  const storage = await chrome.storage.local.get('token');
  authToken = storage.token;

  if (!authToken) {
    switchView('login');
  } else {
    switchView('main');
    initMainView();
  }
});

async function initMainView() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Set placeholder text and page info
  titleEl.textContent = t.loadingPage;
  titleEl.style.color = '#94a3b8';

  if (tab.title) {
    titleEl.textContent = tab.title;
    titleEl.style.color = '';
  }
  try {
    const host = new URL(tab.url).hostname;
    hostEl.textContent = host;
    showFavicon(`https://www.google.com/s2/favicons?domain=${host}&sz=64`);
  } catch (_) {}

  try {
    // Fetch language preference and already-saved check in parallel
    const [prefsRes, checkRes] = await Promise.all([
      apiFetch('/preferences'),
      apiFetch(`/check?url=${encodeURIComponent(tab.url)}`),
    ]);

    // Apply language
    if (prefsRes.ok) {
      const prefs = await prefsRes.json();
      if (prefs.lang) applyLang(prefs.lang);
    }

    // Apply already-saved state
    if (checkRes.ok) {
      const data = await checkRes.json();
      if (data.exists) {
        saveBtn.disabled = true;
        saveBtn.classList.add('state-exists');
        btnText.textContent = t.alreadyBtn;
        setStatus(t.alreadyStatus, 'success');
      }
    }
  } catch (err) {
    console.error('Init error:', err);
  }
}

loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passInput.value;

  if (!email || !password) return;

  loginBtn.disabled = true;
  loginBtnText.innerHTML = '<span class="spinner"></span>';
  loginStatus.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      const data = await res.json();
      authToken = data.token;
      await chrome.storage.local.set({ token: authToken });
      switchView('main');
      initMainView();
    } else {
      const err = await res.json();
      loginStatus.textContent = err.error || t.loginError;
      loginStatus.style.color = '#dc2626';
      loginStatus.style.fontSize = '11px';
      loginStatus.style.marginTop = '8px';
    }
  } catch (err) {
    loginStatus.textContent = t.loginError;
    loginStatus.style.color = '#dc2626';
  } finally {
    loginBtn.disabled = false;
    loginBtnText.textContent = t.loginBtn;
  }
});

logoutBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove('token');
  authToken = null;
  switchView('login');
});

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.classList.remove('state-exists', 'state-saved');
  btnText.innerHTML = '<span class="spinner"></span>';
  setStatus('');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    });
    const html = results[0].result;

    const res = await apiFetch('/articles', {
      method: 'POST',
      body: JSON.stringify({ url: tab.url, title: tab.title, html }),
    });

    if (res.ok) {
      saveBtn.classList.add('state-saved');
      btnText.textContent = t.saved;
      setStatus(t.savedStatus, 'success');
      setTimeout(() => window.close(), 1400);
    } else {
      const err = await res.json();
      if (res.status === 409) {
        saveBtn.disabled = true;
        saveBtn.classList.add('state-exists');
        btnText.textContent = t.alreadyBtn;
        setStatus(t.alreadyStatus, 'success');
      } else {
        throw new Error(err.error || t.retryBtn);
      }
    }
  } catch (error) {
    if (error.message === 'Unauthorized') return;
    saveBtn.disabled = false;
    btnText.textContent = t.retryBtn;
    setStatus(error.message, 'error');
  }
});
