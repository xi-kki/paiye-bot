// ============================================================
// 👤 Per-User Data — resumes, profiles, preferences, history
// Persisted to JSON file (encrypted handling via .gitignore)
// ============================================================

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'userData.json');

class UserData {
  constructor() {
    this.data = this._load();
    this._pendingSave = null;
  }

  _load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        console.log(`📂 Loaded user data for ${Object.keys(parsed).length} users`);
        return parsed;
      }
    } catch (err) {
      console.error('⚠️ Could not load user data:', err.message);
    }
    return {};
  }

  _save() {
    // Debounced save to avoid thrashing
    if (this._pendingSave) clearTimeout(this._pendingSave);
    this._pendingSave = setTimeout(() => {
      try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2));
        console.log(`💾 Saved user data (${Object.keys(this.data).length} users)`);
      } catch (err) {
        console.error('⚠️ Could not save user data:', err.message);
      }
    }, 500);
  }

  /** Get or create a user record */
  get(chatId) {
    const key = String(chatId);
    if (!this.data[key]) {
      this.data[key] = {
        resume: null,
        profile: null,
        preferences: { dailyJobs: true, categories: ['ai', 'writing', 'data-annotation'] },
        searchHistory: [],
        createdAt: new Date().toISOString()
      };
    }
    return this.data[key];
  }

  /** Store uploaded resume */
  setResume(chatId, resume) {
    const user = this.get(chatId);
    user.resume = {
      ...resume,
      uploadedAt: new Date().toISOString()
    };
    this._save();
  }

  /** Get resume text */
  getResume(chatId) {
    const user = this.get(chatId);
    return user.resume || null;
  }

  /** Check if user has a resume */
  hasResume(chatId) {
    return !!this.get(chatId).resume;
  }

  /** Update user's job profile */
  setProfile(chatId, profile) {
    const user = this.get(chatId);
    user.profile = { ...profile, updatedAt: new Date().toISOString() };
    this._save();
  }

  /** Get user's job profile */
  getProfile(chatId) {
    return this.get(chatId).profile || null;
  }

  /** Update preferences */
  setPreferences(chatId, prefs) {
    const user = this.get(chatId);
    user.preferences = { ...user.preferences, ...prefs };
    this._save();
  }

  /** Add to search history */
  addSearchHistory(chatId, query) {
    const user = this.get(chatId);
    user.searchHistory.unshift({
      query,
      timestamp: new Date().toISOString()
    });
    // Keep last 20 searches
    if (user.searchHistory.length > 20) {
      user.searchHistory = user.searchHistory.slice(0, 20);
    }
    this._save();
  }

  /** Get search history */
  getSearchHistory(chatId) {
    return this.get(chatId).searchHistory || [];
  }

  /** Reset user data */
  reset(chatId) {
    delete this.data[String(chatId)];
    this._save();
  }
}

module.exports = new UserData(); // Singleton
