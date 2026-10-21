import { Tender, AppSettings } from '../types';

const TENDERS_KEY = 'mp_tender_intelligence_tenders';
const SETTINGS_KEY = 'mp_tender_intelligence_settings';

const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'Apex Associates',
  companyTagline: 'Your Trusted Tender Partner',
  showBranding: true,
  contactInfo: ''
};

export function loadTenders(): Tender[] {
  try {
    const data = localStorage.getItem(TENDERS_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load tenders from localStorage:', e);
  }
  return [];
}

export function saveTenders(tenders: Tender[]): void {
  try {
    localStorage.setItem(TENDERS_KEY, JSON.stringify(tenders));
  } catch (e) {
    console.error('Failed to save tenders to localStorage:', e);
  }
}

export function loadSettings(): AppSettings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (data) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error('Failed to load settings from localStorage:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings to localStorage:', e);
  }
}

/**
 * IMPORTANT LIMITATION NOTE:
 * This application uses localStorage for data persistence.
 * This means:
 * - Data persists across browser sessions on the SAME device/browser
 * - Data is NOT shared across devices
 * - Data is NOT backed up to a server
 * - Clearing browser data will delete all records
 * 
 * For production use, integrate with a backend database (e.g., Supabase, Firebase).
 * The app is structured to easily swap localStorage with API calls.
 */
