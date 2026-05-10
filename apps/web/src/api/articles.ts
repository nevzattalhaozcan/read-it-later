const API_BASE = '/api/v1';
const API_KEY = import.meta.env.VITE_API_KEY || 'dev-secret-key';

const headers = {
  'Content-Type': 'application/json',
  'X-API-KEY': API_KEY,
};

export const articleApi = {
  async getAll() {
    const res = await fetch(`${API_BASE}/articles`, { headers });
    if (!res.ok) throw new Error('Failed to fetch articles');
    return res.json();
  },

  async add(url: string) {
    const res = await fetch(`${API_BASE}/articles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to add article');
    }
    return res.json();
  },

  async update(id: string, updates: any) {
    const res = await fetch(`${API_BASE}/articles/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update article');
    return res.json();
  },

  async delete(id: string) {
    const res = await fetch(`${API_BASE}/articles/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error('Failed to delete article');
    return res.json();
  },
};
