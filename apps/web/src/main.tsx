import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Global error handler for mobile debugging
if (typeof window !== 'undefined') {
  window.onerror = function(msg, url, line, _col, _error) {
    alert('Error: ' + msg + '\nAt: ' + url + ':' + line);
    return false;
  };
  window.onunhandledrejection = function(event) {
    alert('Unhandled Promise: ' + event.reason);
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
