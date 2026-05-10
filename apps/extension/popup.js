const API_BASE = 'http://localhost:3001/api/v1';
const API_KEY  = '6bc58ddc542178a7f94f59cce0230a6658a97ea934e43fc467e4fa6a0ab8d0ed';

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
  },
};

const saveBtn      = document.getElementById('saveBtn');
const btnText      = document.getElementById('btnText');
const statusEl     = document.getElementById('status');
const titleEl      = document.getElementById('pageTitle');
const hostEl       = document.getElementById('pageHost');
const faviconEl    = document.getElementById('pageFavicon');
const faviconPh    = document.getElementById('faviconPlaceholder');
const taglineEl    = document.getElementById('brandTagline');

let t = T.tr; // fallback until prefs load

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
  // Only update button text if it's still in the default/loading state
  if (!saveBtn.disabled) btnText.textContent = t.saveBtn;
}

document.addEventListener('DOMContentLoaded', async () => {
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

  // Fetch language preference and already-saved check in parallel
  const [prefsRes, checkRes] = await Promise.allSettled([
    fetch(`${API_BASE}/preferences`, { headers: { 'X-API-KEY': API_KEY } }),
    fetch(`${API_BASE}/check?url=${encodeURIComponent(tab.url)}`, { headers: { 'X-API-KEY': API_KEY } }),
  ]);

  // Apply language
  if (prefsRes.status === 'fulfilled' && prefsRes.value.ok) {
    const prefs = await prefsRes.value.json();
    if (prefs.lang) applyLang(prefs.lang);
  }

  // Apply already-saved state
  if (checkRes.status === 'fulfilled' && checkRes.value.ok) {
    const data = await checkRes.value.json();
    if (data.exists) {
      saveBtn.disabled = true;
      saveBtn.classList.add('state-exists');
      btnText.textContent = t.alreadyBtn;
      setStatus(t.alreadyStatus, 'success');
    }
  }
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

    const res = await fetch(`${API_BASE}/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': API_KEY },
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
    saveBtn.disabled = false;
    btnText.textContent = t.retryBtn;
    setStatus(error.message, 'error');
  }
});
