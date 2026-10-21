import { useState, useEffect, useCallback, useRef } from 'react';
import { Tender, TenderFilters, AppSettings, ImportState, SortField, SortDirection } from './types';
import { MP_DISTRICTS, DEPARTMENTS } from './data/districts';
import { SAMPLE_TENDERS } from './data/sampleTenders';
import { generateHindiPost } from './utils/postGenerator';
import { generateBanner } from './utils/bannerGenerator';
import { loadTenders, saveTenders, loadSettings, saveSettings, loadImportState, saveImportState } from './utils/storage';
import { exportToCSV } from './utils/csvExport';
import { fetchLiveTenders, parsePastedContent, parseCSVContent, extractTendersHybrid, isAIConfigured, getAIConfig, saveAIConfig, ImportStats, AIProviderConfig } from './utils/tenderImport';
import { v4 as uuidv4 } from 'uuid';
import {
  Search, Plus, Download, Trash2, Edit3, Copy, Check, X, Eye,
  Filter, Settings, FileText, Image, ExternalLink, AlertTriangle,
  ChevronDown, ChevronUp, Undo2, RefreshCw, Database, Info,
  Upload, Clipboard, Globe, Clock, Zap, Edit
} from 'lucide-react';

type View = 'dashboard' | 'addTender' | 'importData' | 'settings';

export default function App() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [importState, setImportState] = useState<ImportState>(loadImportState());
  const [view, setView] = useState<View>('dashboard');
  const [editingTender, setEditingTender] = useState<Tender | null>(null);
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filters, setFilters] = useState<TenderFilters>({
    search: '',
    district: '',
    department: '',
    deadlineFilter: 'all',
    copyStatus: 'all',
    bannerStatus: 'all',
    dataSource: 'all'
  });

  // Load tenders on mount
  useEffect(() => {
    const loaded = loadTenders();
    if (loaded.length === 0) {
      // Load sample data on first visit only
      setTenders(SAMPLE_TENDERS);
      saveTenders(SAMPLE_TENDERS);
    } else {
      setTenders(loaded);
    }
  }, []);

  // Save tenders whenever they change
  useEffect(() => {
    saveTenders(tenders);
  }, [tenders]);

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  // Refresh real tenders from official portal
  const handleRefreshTenders = async () => {
    setIsRefreshing(true);
    try {
      const result = await fetchLiveTenders();
      
      const newState: ImportState = {
        lastRefreshTime: result.timestamp,
        lastRefreshSource: result.source,
        lastRefreshCount: result.tenders.length,
        lastRefreshSuccess: result.success,
        lastRefreshMessage: result.message
      };
      setImportState(newState);
      saveImportState(newState);

      if (result.success && result.tenders.length > 0) {
        // Add imported tenders (avoid duplicates by tenderId)
        setTenders(prev => {
          const existingIds = new Set(prev.map(t => t.tenderId));
          const newTenders = result.tenders.filter(t => !existingIds.has(t.tenderId));
          return [...newTenders, ...prev];
        });
        const statsInfo = result.stats ? ` (${result.stats.parsed} parsed, ${result.stats.rejected} rejected)` : '';
        showNotification(`✅ Successfully imported ${result.tenders.length} real tenders${statsInfo}`, 'success');
      } else {
        showNotification(`⚠️ ${result.message}`, 'warning');
      }
    } catch (e) {
      showNotification('Failed to refresh tenders. Please try the manual import option.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter and sort tenders
  const filteredTenders = tenders
    .filter(t => {
      if (filters.search) {
        const search = filters.search.toLowerCase();
        if (
          !t.tenderId.toLowerCase().includes(search) &&
          !t.workName.toLowerCase().includes(search) &&
          !t.department.toLowerCase().includes(search) &&
          !t.district.toLowerCase().includes(search)
        ) return false;
      }
      if (filters.district && t.district !== filters.district) return false;
      if (filters.department && t.department !== filters.department) return false;
      if (filters.dataSource !== 'all' && t.dataSource !== filters.dataSource) return false;
      if (filters.copyStatus === 'copied' && !t.textCopied) return false;
      if (filters.copyStatus === 'notCopied' && t.textCopied) return false;
      if (filters.bannerStatus === 'copied' && !t.bannerCopied) return false;
      if (filters.bannerStatus === 'notCopied' && t.bannerCopied) return false;
      
      if (filters.deadlineFilter !== 'all') {
        const now = new Date();
        const deadline = new Date(t.lastDate);
        if (isNaN(deadline.getTime())) return true; // Include if no date
        if (filters.deadlineFilter === 'expired' && deadline >= now) return false;
        if (filters.deadlineFilter === 'upcoming' && deadline < now) return false;
        if (filters.deadlineFilter === 'thisWeek') {
          const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          if (deadline < now || deadline > weekFromNow) return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      let aVal: string = '';
      let bVal: string = '';
      switch (sortField) {
        case 'tenderId': aVal = a.tenderId; bVal = b.tenderId; break;
        case 'workName': aVal = a.workName; bVal = b.workName; break;
        case 'department': aVal = a.department; bVal = b.department; break;
        case 'district': aVal = a.district; bVal = b.district; break;
        case 'tenderAmount': aVal = a.tenderAmount; bVal = b.tenderAmount; break;
        case 'lastDate': aVal = a.lastDate; bVal = b.lastDate; break;
        case 'createdAt': aVal = a.createdAt; bVal = b.createdAt; break;
      }
      const cmp = aVal.localeCompare(bVal);
      return sortDirection === 'asc' ? cmp : -cmp;
    });

  const findDuplicates = (tenderId: string, excludeId?: string): boolean => {
    return tenders.some(t => t.tenderId === tenderId && t.id !== excludeId);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this tender?')) {
      setTenders(prev => prev.filter(t => t.id !== id));
      showNotification('Tender deleted successfully', 'success');
    }
  };

  const handleUndoCopied = (id: string, type: 'text' | 'banner') => {
    setTenders(prev => prev.map(t => {
      if (t.id === id) {
        if (type === 'text') return { ...t, textCopied: false };
        return { ...t, bannerCopied: false };
      }
      return t;
    }));
    showNotification('Copy status reset', 'info');
  };

  const handleCopyPost = async (tender: Tender) => {
    const post = generateHindiPost(tender, settings);
    
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(post);
        setTenders(prev => prev.map(t => t.id === tender.id ? { ...t, textCopied: true, updatedAt: new Date().toISOString() } : t));
        showNotification('✅ Post copied to clipboard successfully!', 'success');
        return;
      } catch (e) {
        console.warn('Clipboard API failed, trying fallback:', e);
      }
    }
    
    // Fallback: use textarea-based copy
    try {
      const textarea = document.createElement('textarea');
      textarea.value = post;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (success) {
        setTenders(prev => prev.map(t => t.id === tender.id ? { ...t, textCopied: true, updatedAt: new Date().toISOString() } : t));
        showNotification('✅ Post copied to clipboard!', 'success');
      } else {
        showNotification('❌ Copy failed. Please use "Preview & Edit Post" to copy manually.', 'error');
      }
    } catch (e) {
      console.error('Fallback copy failed:', e);
      showNotification('❌ Copy failed. Please use "Preview & Edit Post" to copy manually.', 'error');
    }
  };

  const handleCopyBanner = async (tender: Tender) => {
    try {
      const blob = await generateBanner(tender, settings);
      
      // DIAGNOSTIC: Verify blob before proceeding
      console.log('[Banner Download] Blob generated:', {
        size: blob.size,
        type: blob.type,
        valid: blob.size > 0 && blob.type === 'image/png'
      });
      
      if (!blob || blob.size === 0) {
        showNotification('❌ Banner generation failed: Empty blob', 'error');
        return;
      }
      
      if (blob.type && blob.type !== 'image/png') {
        console.warn('[Banner Download] Unexpected blob type:', blob.type);
      }
      
      // Try clipboard first
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setTenders(prev => prev.map(t => t.id === tender.id ? { ...t, bannerCopied: true, updatedAt: new Date().toISOString() } : t));
          showNotification('✅ Banner copied to clipboard!', 'success');
          return;
        } catch {
          console.log('[Banner Download] Clipboard API failed, falling back to download');
          // Fall through to download
        }
      }
      
      // Fallback: download with proper URL lifecycle
      const url = URL.createObjectURL(blob);
      console.log('[Banner Download] Created object URL:', url);
      
      const link = document.createElement('a');
      link.href = url;
      // Sanitize filename
      const safeId = (tender.tenderId || 'tender').replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `banner_${safeId}.png`;
      link.style.display = 'none';
      document.body.appendChild(link);
      
      // Trigger download
      link.click();
      
      // CRITICAL FIX: Don't revoke immediately! Browser needs time to consume the URL.
      // Revoke after 60 seconds to ensure download completes.
      setTimeout(() => {
        URL.revokeObjectURL(url);
        console.log('[Banner Download] Revoked object URL after delay');
      }, 60000);
      
      // Clean up link element after a short delay
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 1000);
      
      showNotification(`📥 Downloading banner (${(blob.size / 1024).toFixed(1)} KB). Check your downloads folder.`, 'success');
    } catch (e: any) {
      console.error('[Banner Download] Error:', e);
      showNotification(`❌ Failed to generate banner: ${e?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleMarkBannerCopied = (id: string) => {
    setTenders(prev => prev.map(t => t.id === id ? { ...t, bannerCopied: true, updatedAt: new Date().toISOString() } : t));
    showNotification('✅ Banner marked as copied', 'success');
  };

  const handleDuplicate = (tender: Tender) => {
    const newTender: Tender = {
      ...tender,
      id: uuidv4(),
      tenderId: tender.tenderId + '-COPY',
      textCopied: false,
      bannerCopied: false,
      manuallyPublished: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setTenders(prev => [newTender, ...prev]);
    showNotification('Tender duplicated. Please update the Tender ID.', 'warning');
  };

  // Stats
  const stats = {
    total: tenders.length,
    real: tenders.filter(t => t.dataSource === 'imported').length,
    sample: tenders.filter(t => t.dataSource === 'sample').length,
    manual: tenders.filter(t => t.dataSource === 'manual').length,
    textCopied: tenders.filter(t => t.textCopied).length,
    bannerCopied: tenders.filter(t => t.bannerCopied).length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white font-medium transition-all max-w-md ${
          notification.type === 'success' ? 'bg-green-600' :
          notification.type === 'error' ? 'bg-red-600' :
          notification.type === 'warning' ? 'bg-amber-600' : 'bg-navy-700'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <header className="bg-navy-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center font-bold text-navy-900 text-lg">
                A
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">MP Tender Intelligence</h1>
                <p className="text-xs text-navy-200">by Apex Associates</p>
              </div>
            </div>
            <nav className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => { setView('dashboard'); setSelectedTender(null); }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${view === 'dashboard' ? 'bg-navy-700 text-white' : 'text-navy-200 hover:text-white hover:bg-navy-700'}`}
              >
                <Database className="w-4 h-4 inline mr-1" /> Dashboard
              </button>
              <button
                onClick={() => { setView('importData'); }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${view === 'importData' ? 'bg-gold-500 text-navy-900' : 'text-navy-200 hover:text-white hover:bg-navy-700'}`}
              >
                <Upload className="w-4 h-4 inline mr-1" /> Import
              </button>
              <button
                onClick={() => { setView('addTender'); setEditingTender(null); }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${view === 'addTender' ? 'bg-navy-700 text-white' : 'text-navy-200 hover:text-white hover:bg-navy-700'}`}
              >
                <Plus className="w-4 h-4 inline mr-1" /> Add
              </button>
              <button
                onClick={() => setView('settings')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${view === 'settings' ? 'bg-navy-700 text-white' : 'text-navy-200 hover:text-white hover:bg-navy-700'}`}
              >
                <Settings className="w-4 h-4 inline mr-1" /> Settings
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {view === 'dashboard' && (
          <DashboardView
            tenders={filteredTenders}
            stats={stats}
            filters={filters}
            setFilters={setFilters}
            showFilters={showFilters}
            setShowFilters={setShowFilters}
            sortField={sortField}
            sortDirection={sortDirection}
            handleSort={handleSort}
            onSelectTender={setSelectedTender}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onUndoCopied={handleUndoCopied}
            onCopyPost={handleCopyPost}
            onCopyBanner={handleCopyBanner}
            onMarkBannerCopied={handleMarkBannerCopied}
            onShowPost={(t) => { setSelectedTender(t); setShowPostModal(true); }}
            onShowBanner={(t) => { setSelectedTender(t); setShowBannerModal(true); }}
            onExportCSV={() => exportToCSV(filteredTenders)}
            onEdit={(t) => { setEditingTender(t); setView('addTender'); }}
            importState={importState}
            onRefresh={handleRefreshTenders}
            isRefreshing={isRefreshing}
            onGoToImport={() => setView('importData')}
          />
        )}

        {view === 'importData' && (
          <ImportView
            onImportComplete={(newTenders, message) => {
              setTenders(prev => [...newTenders, ...prev]);
              const newState: ImportState = {
                lastRefreshTime: new Date().toISOString(),
                lastRefreshSource: 'manual_import',
                lastRefreshCount: newTenders.length,
                lastRefreshSuccess: true,
                lastRefreshMessage: message
              };
              setImportState(newState);
              saveImportState(newState);
              showNotification(`✅ Imported ${newTenders.length} tenders. ${message}`, 'success');
              setView('dashboard');
            }}
            onGoBack={() => setView('dashboard')}
          />
        )}

        {view === 'addTender' && (
          <TenderFormView
            tender={editingTender}
            findDuplicates={findDuplicates}
            onSave={(tender) => {
              if (editingTender) {
                setTenders(prev => prev.map(t => t.id === editingTender.id ? { ...tender, updatedAt: new Date().toISOString() } : t));
                showNotification('Tender updated successfully', 'success');
              } else {
                setTenders(prev => [{ ...tender, id: uuidv4(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...prev]);
                showNotification('Tender added successfully', 'success');
              }
              setView('dashboard');
              setEditingTender(null);
            }}
            onCancel={() => { setView('dashboard'); setEditingTender(null); }}
          />
        )}

        {view === 'settings' && (
          <SettingsView
            settings={settings}
            onSave={(s) => { setSettings(s); saveSettings(s); showNotification('Settings saved', 'success'); }}
          />
        )}
      </main>

      {/* Post Preview Modal */}
      {showPostModal && selectedTender && (
        <PostModal
          tender={selectedTender}
          settings={settings}
          onClose={() => setShowPostModal(false)}
          onCopy={(tender) => { handleCopyPost(tender); setShowPostModal(false); }}
        />
      )}

      {/* Banner Preview Modal */}
      {showBannerModal && selectedTender && (
        <BannerModal
          tender={selectedTender}
          settings={settings}
          onClose={() => setShowBannerModal(false)}
          onCopyBanner={() => { handleCopyBanner(selectedTender); }}
          onMarkCopied={() => { handleMarkBannerCopied(selectedTender.id); setShowBannerModal(false); }}
        />
      )}

      {/* Footer */}
      <footer className="bg-navy-900 text-navy-200 text-center py-4 mt-8">
        <p className="text-sm">MP Tender Intelligence by Apex Associates</p>
        <p className="text-xs mt-1 text-navy-300">
          ⚠️ Always verify tender information from{' '}
          <a href="https://mptenders.gov.in" target="_blank" rel="noopener noreferrer" className="text-gold-400 underline">
            mptenders.gov.in
          </a>
        </p>
      </footer>
    </div>
  );
}

// ============ DASHBOARD VIEW ============
function DashboardView(props: {
  tenders: Tender[];
  stats: { total: number; real: number; sample: number; manual: number; textCopied: number; bannerCopied: number };
  filters: TenderFilters;
  setFilters: React.Dispatch<React.SetStateAction<TenderFilters>>;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  handleSort: (f: SortField) => void;
  onSelectTender: (t: Tender) => void;
  onDelete: (id: string) => void;
  onDuplicate: (t: Tender) => void;
  onUndoCopied: (id: string, type: 'text' | 'banner') => void;
  onCopyPost: (t: Tender) => void;
  onCopyBanner: (t: Tender) => void;
  onMarkBannerCopied: (id: string) => void;
  onShowPost: (t: Tender) => void;
  onShowBanner: (t: Tender) => void;
  onExportCSV: () => void;
  onEdit: (t: Tender) => void;
  importState: ImportState;
  onRefresh: () => void;
  isRefreshing: boolean;
  onGoToImport: () => void;
}) {
  const {
    tenders, stats, filters, setFilters, showFilters, setShowFilters,
    sortField, sortDirection, handleSort, onDelete, onDuplicate,
    onUndoCopied, onCopyPost, onCopyBanner, onMarkBannerCopied,
    onShowPost, onShowBanner, onExportCSV, onEdit, importState,
    onRefresh, isRefreshing, onGoToImport
  } = props;

  return (
    <div>
      {/* Refresh Status Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${importState.lastRefreshSuccess ? 'bg-green-500' : 'bg-amber-500'}`} />
            <div>
              <p className="text-sm font-medium text-slate-700">
                {importState.lastRefreshTime 
                  ? `Last refresh: ${new Date(importState.lastRefreshTime).toLocaleString()}`
                  : 'No refresh yet — use Import to add real tenders'}
              </p>
              {importState.lastRefreshMessage && (
                <p className="text-xs text-slate-500 mt-0.5 max-w-lg truncate">{importState.lastRefreshMessage}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Real Tenders'}
            </button>
            <button
              onClick={onGoToImport}
              className="px-4 py-2 bg-navy-700 text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> Import Data
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total" value={stats.total} icon={<Database className="w-5 h-5" />} color="bg-navy-700" />
        <StatCard label="Real (Imported)" value={stats.real} icon={<Globe className="w-5 h-5" />} color="bg-green-600" />
        <StatCard label="Manual" value={stats.manual} icon={<Edit className="w-5 h-5" />} color="bg-blue-600" />
        <StatCard label="Sample" value={stats.sample} icon={<AlertTriangle className="w-5 h-5" />} color="bg-amber-500" />
        <StatCard label="Text Copied" value={stats.textCopied} icon={<FileText className="w-5 h-5" />} color="bg-purple-600" />
        <StatCard label="Banners" value={stats.bannerCopied} icon={<Image className="w-5 h-5" />} color="bg-indigo-600" />
      </div>

      {/* Storage Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-start gap-2">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <strong>Data stored locally.</strong> Use "Import Data" to add real tenders from mptenders.gov.in. The portal blocks automated access from browsers — use the HTML paste method for best results.
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search tender ID, work name, department..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${showFilters ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
          >
            <Filter className="w-4 h-4 inline mr-1" /> Filters
          </button>
          <button
            onClick={onExportCSV}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition"
          >
            <Download className="w-4 h-4 inline mr-1" /> CSV
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <SelectFilter label="District" value={filters.district} onChange={v => setFilters(f => ({ ...f, district: v }))}
              options={[{ value: '', label: 'All MP' }, ...MP_DISTRICTS.map(d => ({ value: d, label: d }))]} />
            <SelectFilter label="Department" value={filters.department} onChange={v => setFilters(f => ({ ...f, department: v }))}
              options={[{ value: '', label: 'All Departments' }, ...DEPARTMENTS.map(d => ({ value: d, label: d }))]} />
            <SelectFilter label="Deadline" value={filters.deadlineFilter} onChange={v => setFilters(f => ({ ...f, deadlineFilter: v as TenderFilters['deadlineFilter'] }))}
              options={[{ value: 'all', label: 'All' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'thisWeek', label: 'This Week' }, { value: 'expired', label: 'Expired' }]} />
            <SelectFilter label="Text Status" value={filters.copyStatus} onChange={v => setFilters(f => ({ ...f, copyStatus: v as TenderFilters['copyStatus'] }))}
              options={[{ value: 'all', label: 'All' }, { value: 'copied', label: 'Copied' }, { value: 'notCopied', label: 'Not Copied' }]} />
            <SelectFilter label="Banner Status" value={filters.bannerStatus} onChange={v => setFilters(f => ({ ...f, bannerStatus: v as TenderFilters['bannerStatus'] }))}
              options={[{ value: 'all', label: 'All' }, { value: 'copied', label: 'Copied' }, { value: 'notCopied', label: 'Not Copied' }]} />
            <SelectFilter label="Data Source" value={filters.dataSource} onChange={v => setFilters(f => ({ ...f, dataSource: v as TenderFilters['dataSource'] }))}
              options={[{ value: 'all', label: 'All' }, { value: 'imported', label: '🟢 Real (Imported)' }, { value: 'manual', label: '🔵 Manual' }, { value: 'sample', label: '🟡 Sample' }]} />
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-slate-600 mb-2">
        Showing {tenders.length} tender{tenders.length !== 1 ? 's' : ''}
        {filters.district && <span className="ml-2 text-navy-700 font-medium">• {filters.district}</span>}
      </div>

      {/* Tender Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-navy-800 text-white">
              <tr>
                <SortableHeader field="tenderId" label="Tender ID" current={sortField} dir={sortDirection} onSort={handleSort} />
                <SortableHeader field="workName" label="Work Name" current={sortField} dir={sortDirection} onSort={handleSort} />
                <th className="px-3 py-3 text-left text-xs font-medium">Department / District</th>
                <SortableHeader field="tenderAmount" label="Amount" current={sortField} dir={sortDirection} onSort={handleSort} />
                <SortableHeader field="lastDate" label="Last Date" current={sortField} dir={sortDirection} onSort={handleSort} />
                <th className="px-3 py-3 text-center text-xs font-medium">Status</th>
                <th className="px-3 py-3 text-center text-xs font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <Database className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium">No tenders found</p>
                    <p className="text-sm">Use "Import Data" to add real tenders from the official portal</p>
                  </td>
                </tr>
              ) : (
                tenders.map(tender => (
                  <TenderRow
                    key={tender.id}
                    tender={tender}
                    onEdit={() => onEdit(tender)}
                    onDelete={() => onDelete(tender.id)}
                    onDuplicate={() => onDuplicate(tender)}
                    onUndoCopied={(type) => onUndoCopied(tender.id, type)}
                    onCopyPost={() => onCopyPost(tender)}
                    onCopyBanner={() => onCopyBanner(tender)}
                    onMarkBannerCopied={() => onMarkBannerCopied(tender.id)}
                    onShowPost={() => onShowPost(tender)}
                    onShowBanner={() => onShowBanner(tender)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============ TENDER ROW ============
function TenderRow({
  tender, onEdit, onDelete, onDuplicate, onUndoCopied,
  onCopyPost, onCopyBanner, onMarkBannerCopied, onShowPost, onShowBanner
}: {
  tender: Tender;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUndoCopied: (type: 'text' | 'banner') => void;
  onCopyPost: () => void;
  onCopyBanner: () => void;
  onMarkBannerCopied: () => void;
  onShowPost: () => void;
  onShowBanner: () => void;
}) {
  const isExpired = tender.lastDate ? new Date(tender.lastDate) < new Date() : false;
  const [showActions, setShowActions] = useState(false);

  const sourceBadge = tender.dataSource === 'sample' 
    ? <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">SAMPLE</span>
    : tender.dataSource === 'imported'
    ? <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">REAL</span>
    : <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">MANUAL</span>;

  return (
    <tr className={`hover:bg-slate-50 transition ${tender.dataSource === 'sample' ? 'bg-amber-50/30' : ''}`}>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-medium text-navy-700 text-xs">{tender.tenderId}</span>
          {sourceBadge}
        </div>
      </td>
      <td className="px-3 py-3 max-w-[280px]">
        <p className="truncate text-slate-800 text-xs" title={tender.workName}>{tender.workName}</p>
      </td>
      <td className="px-3 py-3">
        <p className="text-slate-600 text-xs truncate max-w-[150px]" title={tender.department}>{tender.department}</p>
        <p className="text-slate-800 text-xs font-medium">{tender.district}</p>
      </td>
      <td className="px-3 py-3 text-slate-800 font-medium text-xs whitespace-nowrap">
        {tender.tenderAmount || <span className="text-slate-400">—</span>}
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        {tender.lastDate ? (
          <span className={`text-xs font-medium ${isExpired ? 'text-red-600' : 'text-green-700'}`}>
            {tender.lastDate}
            {isExpired && ' ⚠️'}
          </span>
        ) : <span className="text-slate-400 text-xs">—</span>}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-center gap-1.5">
          {tender.textCopied ? (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded" title="Text Copied">
              <Check className="w-3 h-3" /> POST
            </span>
          ) : (
            <span className="w-3 h-3 rounded-full bg-slate-300" title="Post not copied" />
          )}
          {tender.bannerCopied ? (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded" title="Banner Copied">
              <Check className="w-3 h-3" /> IMG
            </span>
          ) : (
            <span className="w-3 h-3 rounded-full bg-slate-300" title="Banner not copied" />
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="relative">
          <div className="flex items-center justify-center gap-1">
            {/* Prominent COPY POST button */}
            <button
              onClick={onCopyPost}
              className={`px-2 py-1 rounded text-[10px] font-bold transition ${
                tender.textCopied 
                  ? 'bg-green-100 text-green-700 border border-green-300' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
              title="Copy Hindi post to clipboard"
            >
              {tender.textCopied ? 'COPIED ✓' : 'COPY POST'}
            </button>
            <button onClick={onCopyBanner} className="p-1.5 rounded hover:bg-purple-50 text-purple-600" title="Copy Banner">
              <Image className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowActions(!showActions)} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" title="More">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
          {showActions && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 min-w-[180px]">
              <button onClick={() => { onShowPost(); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                <Eye className="w-3 h-3" /> Preview & Edit Post
              </button>
              <button onClick={() => { onShowBanner(); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                <Image className="w-3 h-3" /> Preview Banner
              </button>
              <button onClick={() => { onEdit(); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                <Edit3 className="w-3 h-3" /> Edit Tender
              </button>
              <button onClick={() => { onDuplicate(); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                <RefreshCw className="w-3 h-3" /> Duplicate
              </button>
              {tender.textCopied && (
                <button onClick={() => { onUndoCopied('text'); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2 text-amber-600">
                  <Undo2 className="w-3 h-3" /> Undo Post Copy
                </button>
              )}
              {tender.bannerCopied && (
                <button onClick={() => { onUndoCopied('banner'); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2 text-amber-600">
                  <Undo2 className="w-3 h-3" /> Undo Banner Copy
                </button>
              )}
              {!tender.bannerCopied && (
                <button onClick={() => { onMarkBannerCopied(); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2 text-green-600">
                  <Check className="w-3 h-3" /> Mark Banner Copied
                </button>
              )}
              <a href={tender.officialUrl} target="_blank" rel="noopener noreferrer" 
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2 text-blue-600">
                <ExternalLink className="w-3 h-3" /> Official Link
              </a>
              <hr className="my-1" />
              <button onClick={() => { onDelete(); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-red-50 flex items-center gap-2 text-red-600">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ============ IMPORT VIEW ============
function ImportView({ onImportComplete, onGoBack }: {
  onImportComplete: (tenders: Tender[], message: string) => void;
  onGoBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'auto' | 'paste' | 'csv'>('auto');
  const [pasteContent, setPasteContent] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<string>('');
  const [previewTenders, setPreviewTenders] = useState<Tender[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [importWarning, setImportWarning] = useState<string>('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIProviderConfig>(getAIConfig() || { enabled: false, provider: 'openai', apiUrl: '', apiKey: '', model: '' });

  const handleAutoFetch = async () => {
    setIsFetching(true);
    setFetchResult('');
    setImportWarning('');
    try {
      const result = await fetchLiveTenders();
      if (result.success) {
        setPreviewTenders(result.tenders);
        setSelectedIndices(new Set(result.tenders.map((_, i) => i)));
        if (result.stats) setImportStats(result.stats);
        const statsInfo = result.stats ? ` (Candidates: ${result.stats.candidatesDetected}, Parsed: ${result.stats.parsed}, Rejected: ${result.stats.rejected})` : '';
        setFetchResult(`✅ Found ${result.tenders.length} real tenders from the official portal.${statsInfo}`);
      } else {
        setFetchResult(`⚠️ ${result.message}`);
      }
    } catch {
      setFetchResult('❌ Auto-fetch failed. Please use the "Paste HTML" method.');
    } finally {
      setIsFetching(false);
    }
  };

  const handleParsePaste = async () => {
    if (!pasteContent.trim()) {
      setFetchResult('Please paste content from the official portal.');
      return;
    }
    setIsFetching(true);
    setFetchResult('');
    setImportWarning('');
    
    try {
      // Use hybrid extraction (deterministic + AI fallback)
      const result = await extractTendersHybrid(pasteContent);
      
      if (result.tenders.length > 0) {
        setPreviewTenders(result.tenders);
        setSelectedIndices(new Set(result.tenders.map((_, i) => i)));
        setImportStats(result.stats);
        
        const stats = result.stats;
        const missing = stats.missingFields || {};
        const missingInfo = Object.entries(missing).map(([k, v]) => `${k}: ${v}`).join(', ');
        
        setFetchResult(`✅ Extracted ${result.tenders.length} tenders (${result.method}). Candidates detected: ${stats.candidatesDetected}, Parsed: ${stats.parsed}, Needs review: ${stats.needsReview}, Rejected: ${stats.rejected}.${missingInfo ? ` Missing fields: ${missingInfo}` : ''}`);
        
        if (result.warning) {
          setImportWarning(result.warning);
        }
      } else {
        setFetchResult('❌ Could not parse any tenders. Make sure you pasted content from mptenders.gov.in → "Tenders by Closing Date" page. Try the AI extraction mode if configured.');
        setImportStats(result.stats);
      }
    } catch (e) {
      // Fallback to deterministic only
      const result = parsePastedContent(pasteContent);
      if (result.tenders.length > 0) {
        setPreviewTenders(result.tenders);
        setSelectedIndices(new Set(result.tenders.map((_, i) => i)));
        setImportStats(result.stats);
        setFetchResult(`✅ Parsed ${result.tenders.length} tenders (deterministic fallback).`);
      } else {
        setFetchResult('❌ Could not parse any tenders. Make sure you pasted content from mptenders.gov.in.');
      }
    } finally {
      setIsFetching(false);
    }
  };

  const handleParseCSV = () => {
    if (!csvContent.trim()) {
      setFetchResult('Please paste CSV content.');
      return;
    }
    const result = parseCSVContent(csvContent);
    if (result.tenders.length > 0) {
      setPreviewTenders(result.tenders);
      setSelectedIndices(new Set(result.tenders.map((_, i) => i)));
      setImportStats(result.stats);
      setFetchResult(`✅ Parsed ${result.tenders.length} tenders from CSV. (Candidates: ${result.stats.candidatesDetected}, Parsed: ${result.stats.parsed}, Rejected: ${result.stats.rejected})`);
    } else {
      setFetchResult('❌ Could not parse any tenders from CSV.');
    }
  };

  const handleConfirmImport = () => {
    const selectedTenders = previewTenders.filter((_, i) => selectedIndices.has(i));
    if (selectedTenders.length > 0) {
      const skipped = previewTenders.length - selectedTenders.length;
      const msg = `Imported ${selectedTenders.length} tenders from ${activeTab === 'auto' ? 'official portal' : activeTab === 'paste' ? 'pasted content' : 'CSV file'}.${skipped > 0 ? ` ${skipped} skipped by user.` : ''}`;
      onImportComplete(selectedTenders, msg);
    }
  };

  const toggleSelection = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => setSelectedIndices(new Set(previewTenders.map((_, i) => i)));
  const deselectAll = () => setSelectedIndices(new Set());

  const updatePreviewTender = (index: number, field: keyof Tender, value: string) => {
    setPreviewTenders(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const handleSaveAIConfig = () => {
    saveAIConfig(aiConfig);
    setShowAIConfig(false);
    setFetchResult(prev => prev + (prev ? '\n' : '') + '✅ AI configuration saved.');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-navy-800">Import Real Tender Data</h2>
            <p className="text-sm text-slate-500">Add actual tenders from the official MP e-Procurement portal.</p>
          </div>
          <button onClick={onGoBack} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200">
            ← Back to Dashboard
          </button>
        </div>

        {/* Important Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <strong>Why can't we auto-fetch?</strong> The official portal (mptenders.gov.in) blocks automated browser requests due to CORS restrictions and requires CAPTCHAs for search. The "Paste HTML" method below is the most reliable way to import real data.
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200 pb-3">
          <button onClick={() => setActiveTab('auto')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'auto' ? 'bg-navy-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            <Zap className="w-4 h-4 inline mr-1" /> Auto-Fetch
          </button>
          <button onClick={() => setActiveTab('paste')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'paste' ? 'bg-navy-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            <Clipboard className="w-4 h-4 inline mr-1" /> Paste HTML
          </button>
          <button onClick={() => setActiveTab('csv')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'csv' ? 'bg-navy-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            <Upload className="w-4 h-4 inline mr-1" /> CSV Import
          </button>
        </div>

        {/* Auto-Fetch Tab */}
        {activeTab === 'auto' && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm text-slate-700 mb-3">
                This attempts to fetch the latest tenders from mptenders.gov.in through a CORS proxy. Success depends on portal availability and proxy status.
              </p>
              <button
                onClick={handleAutoFetch}
                disabled={isFetching}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                {isFetching ? 'Fetching...' : 'Attempt Auto-Fetch'}
              </button>
            </div>
          </div>
        )}

        {/* Paste HTML Tab */}
        {activeTab === 'paste' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-medium text-green-800 text-sm mb-2">📋 How to import from the official portal:</h3>
              <ol className="text-xs text-green-700 space-y-1 list-decimal list-inside">
                <li>Open <a href="https://mptenders.gov.in/nicgep/app?page=FrontEndListTendersbyDate&service=page" target="_blank" rel="noopener noreferrer" className="underline font-medium">mptenders.gov.in → Tenders by Closing Date</a></li>
                <li>Select "Closing Today", "Closing within 7 days", or "Closing within 14 days"</li>
                <li>Right-click on the tender table → "Inspect" → Copy the outer HTML of the table</li>
                <li>OR: Select all text on the page (Ctrl+A) and copy (Ctrl+C)</li>
                <li>Paste the content below and click "Parse"</li>
              </ol>
            </div>
            <textarea
              value={pasteContent}
              onChange={e => setPasteContent(e.target.value)}
              placeholder="Paste HTML or text content from mptenders.gov.in here..."
              className="w-full h-48 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
            <button
              onClick={handleParsePaste}
              className="px-6 py-2.5 bg-navy-700 text-white rounded-lg font-medium hover:bg-navy-800 transition"
            >
              Parse Content
            </button>
          </div>
        )}

        {/* CSV Tab */}
        {activeTab === 'csv' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-800 text-sm mb-2">CSV Format:</h3>
              <p className="text-xs text-blue-700 font-mono">
                Tender ID, Work Name, Department, District, Amount, EMD, Last Date (YYYY-MM-DD), URL, Eligibility
              </p>
            </div>
            <textarea
              value={csvContent}
              onChange={e => setCsvContent(e.target.value)}
              placeholder={`Tender ID,Work Name,Department,District,Amount,EMD,Last Date,URL,Eligibility\nNIT_Bhopal_01/2026,Construction of road,PWD,Bhopal,5000000,100000,2026-11-30,https://mptenders.gov.in,...`}
              className="w-full h-48 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
            <button
              onClick={handleParseCSV}
              className="px-6 py-2.5 bg-navy-700 text-white rounded-lg font-medium hover:bg-navy-800 transition"
            >
              Parse CSV
            </button>
          </div>
        )}

        {/* Result / Preview */}
        {fetchResult && (
          <div className={`mt-6 p-4 rounded-lg border ${
            fetchResult.startsWith('✅') ? 'bg-green-50 border-green-200' :
            fetchResult.startsWith('⚠️') ? 'bg-amber-50 border-amber-200' :
            'bg-red-50 border-red-200'
          }`}>
            <p className="text-sm">{fetchResult}</p>
          </div>
        )}

        {/* Import Warning */}
        {importWarning && (
          <div className="mt-4 p-4 rounded-lg border bg-amber-50 border-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800">{importWarning}</p>
            </div>
          </div>
        )}

        {/* Stats Summary */}
        {importStats && (
          <div className="mt-4 p-4 rounded-lg border bg-slate-50 border-slate-200">
            <h4 className="text-sm font-bold text-slate-700 mb-2">Import Statistics</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-white rounded p-2 border">
                <span className="text-slate-500">Candidates Detected</span>
                <p className="text-lg font-bold text-navy-700">{importStats.candidatesDetected}</p>
              </div>
              <div className="bg-white rounded p-2 border">
                <span className="text-slate-500">Successfully Parsed</span>
                <p className="text-lg font-bold text-green-600">{importStats.parsed}</p>
              </div>
              <div className="bg-white rounded p-2 border">
                <span className="text-slate-500">Needs Review</span>
                <p className="text-lg font-bold text-amber-600">{importStats.needsReview}</p>
              </div>
              <div className="bg-white rounded p-2 border">
                <span className="text-slate-500">Rejected</span>
                <p className="text-lg font-bold text-red-600">{importStats.rejected}</p>
              </div>
            </div>
            {importStats.aiUsed && (
              <p className="text-xs text-blue-600 mt-2">🤖 AI extraction used ({importStats.aiProvider})</p>
            )}
            {!isAIConfigured() && (
              <button onClick={() => setShowAIConfig(!showAIConfig)} className="text-xs text-blue-600 hover:underline mt-2">
                ⚙️ Configure AI extraction for better results
              </button>
            )}
          </div>
        )}

        {/* AI Configuration Panel */}
        {showAIConfig && (
          <div className="mt-4 p-4 rounded-lg border bg-blue-50 border-blue-200">
            <h4 className="text-sm font-bold text-blue-800 mb-3">🤖 AI Extraction Configuration</h4>
            <p className="text-xs text-blue-700 mb-3">
              Configure an AI model to assist with parsing irregularly formatted tender text. 
              <strong> API keys are stored locally in your browser.</strong> For production use, route through a secure server-side API.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Provider</label>
                <select value={aiConfig.provider} onChange={e => setAiConfig(c => ({ ...c, provider: e.target.value as AIProviderConfig['provider'] }))}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="custom">Custom Endpoint</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Model</label>
                <input type="text" value={aiConfig.model} onChange={e => setAiConfig(c => ({ ...c, model: e.target.value }))}
                  placeholder="gpt-4o-mini" className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">API URL</label>
                <input type="text" value={aiConfig.apiUrl} onChange={e => setAiConfig(c => ({ ...c, apiUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1/chat/completions" className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">API Key</label>
                <input type="password" value={aiConfig.apiKey} onChange={e => setAiConfig(c => ({ ...c, apiKey: e.target.value }))}
                  placeholder="sk-..." className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs" />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={aiConfig.enabled} onChange={e => setAiConfig(c => ({ ...c, enabled: e.target.checked }))} />
                Enable AI extraction
              </label>
              <button onClick={handleSaveAIConfig} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
                Save Config
              </button>
            </div>
          </div>
        )}

        {/* Preview Table */}
        {previewTenders.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-navy-800">
                  Preview: {selectedIndices.size} of {previewTenders.length} selected
                </h3>
                <div className="flex gap-2 mt-1">
                  <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">Select All</button>
                  <button onClick={deselectAll} className="text-xs text-blue-600 hover:underline">Deselect All</button>
                </div>
              </div>
              <button
                onClick={handleConfirmImport}
                disabled={selectedIndices.size === 0}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition flex items-center gap-2 disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Confirm Import ({selectedIndices.size} tenders)
              </button>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-2 py-2 text-left w-8">
                      <input type="checkbox" checked={selectedIndices.size === previewTenders.length} onChange={e => e.target.checked ? selectAll() : deselectAll()} />
                    </th>
                    <th className="px-2 py-2 text-left">Tender ID</th>
                    <th className="px-2 py-2 text-left">Work Name</th>
                    <th className="px-2 py-2 text-left">Department</th>
                    <th className="px-2 py-2 text-left">District</th>
                    <th className="px-2 py-2 text-left">Closing Date</th>
                    <th className="px-2 py-2 text-left">Value</th>
                    <th className="px-2 py-2 text-left w-12">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewTenders.map((t, i) => (
                    <tr key={i} className={`hover:bg-slate-50 ${!selectedIndices.has(i) ? 'opacity-50' : ''}`}>
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={selectedIndices.has(i)} onChange={() => toggleSelection(i)} />
                      </td>
                      {editingIndex === i ? (
                        <>
                          <td className="px-2 py-1"><input type="text" value={t.tenderId} onChange={e => updatePreviewTender(i, 'tenderId', e.target.value)} className="w-full px-1 py-0.5 border rounded text-xs font-mono" /></td>
                          <td className="px-2 py-1"><input type="text" value={t.workName} onChange={e => updatePreviewTender(i, 'workName', e.target.value)} className="w-full px-1 py-0.5 border rounded text-xs" /></td>
                          <td className="px-2 py-1"><input type="text" value={t.department} onChange={e => updatePreviewTender(i, 'department', e.target.value)} className="w-full px-1 py-0.5 border rounded text-xs" /></td>
                          <td className="px-2 py-1"><input type="text" value={t.district} onChange={e => updatePreviewTender(i, 'district', e.target.value)} className="w-full px-1 py-0.5 border rounded text-xs" /></td>
                          <td className="px-2 py-1"><input type="text" value={t.lastDate} onChange={e => updatePreviewTender(i, 'lastDate', e.target.value)} className="w-full px-1 py-0.5 border rounded text-xs" /></td>
                          <td className="px-2 py-1"><input type="text" value={t.tenderAmount} onChange={e => updatePreviewTender(i, 'tenderAmount', e.target.value)} className="w-full px-1 py-0.5 border rounded text-xs" /></td>
                          <td className="px-2 py-1">
                            <button onClick={() => setEditingIndex(null)} className="text-green-600 hover:text-green-800 text-xs font-medium">✓</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-2 font-mono text-navy-700 max-w-[120px] truncate" title={t.tenderId}>{t.tenderId}</td>
                          <td className="px-2 py-2 max-w-[250px] truncate" title={t.workName}>{t.workName}</td>
                          <td className="px-2 py-2 max-w-[150px] truncate" title={t.department}>{t.department}</td>
                          <td className="px-2 py-2">{t.district}</td>
                          <td className="px-2 py-2">{t.lastDate || '—'}</td>
                          <td className="px-2 py-2">{t.tenderAmount || '—'}</td>
                          <td className="px-2 py-2">
                            <button onClick={() => setEditingIndex(i)} className="text-blue-600 hover:text-blue-800">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importStats && importStats.candidatesDetected > previewTenders.length && (
              <p className="text-xs text-amber-600 mt-2 px-1">
                ⚠️ {importStats.candidatesDetected - previewTenders.length} candidate(s) detected but could not be fully parsed.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ TENDER FORM ============
function TenderFormView({ tender, findDuplicates, onSave, onCancel }: {
  tender: Tender | null;
  findDuplicates: (id: string, excludeId?: string) => boolean;
  onSave: (t: Tender) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<Tender>>(tender || {
    tenderId: '', workName: '', department: '', district: '',
    tenderAmount: '', emd: '', lastDate: '',
    officialUrl: 'https://mptenders.gov.in',
    dataSource: 'manual', eligibility: '', tenderFee: '', requiredDocuments: '', notes: ''
  });
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tenderId || !form.workName) {
      alert('Tender ID and Work Name are required.');
      return;
    }
    if (findDuplicates(form.tenderId!, tender?.id)) {
      if (!confirm('A tender with this ID already exists. Continue anyway?')) return;
    }
    onSave({
      id: tender?.id || '',
      tenderId: form.tenderId!,
      workName: form.workName!,
      department: form.department || '',
      district: form.district || '',
      tenderAmount: form.tenderAmount || '',
      emd: form.emd || '',
      lastDate: form.lastDate || '',
      officialUrl: form.officialUrl || 'https://mptenders.gov.in',
      dataSource: form.dataSource as Tender['dataSource'] || 'manual',
      textCopied: tender?.textCopied || false,
      bannerCopied: tender?.bannerCopied || false,
      manuallyPublished: tender?.manuallyPublished || false,
      createdAt: tender?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eligibility: form.eligibility || '',
      tenderFee: form.tenderFee || '',
      requiredDocuments: form.requiredDocuments || '',
      notes: form.notes || ''
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-navy-800 mb-1">{tender ? 'Edit Tender' : 'Add New Tender'}</h2>
        <p className="text-sm text-slate-500 mb-6">Enter verified tender information from the official portal.</p>

        {duplicateWarning && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span className="text-sm text-amber-800">Duplicate Tender ID detected!</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tender ID *</label>
              <input type="text" required value={form.tenderId || ''}
                onChange={e => { setForm(f => ({ ...f, tenderId: e.target.value })); setDuplicateWarning(findDuplicates(e.target.value, tender?.id)); }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Data Source</label>
              <select value={form.dataSource || 'manual'} onChange={e => setForm(f => ({ ...f, dataSource: e.target.value as Tender['dataSource'] }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500">
                <option value="manual">Manually Entered (Verified)</option>
                <option value="imported">Imported from Portal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Work Name *</label>
            <input type="text" required value={form.workName || ''} onChange={e => setForm(f => ({ ...f, workName: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <select value={form.department || ''} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500">
                <option value="">Select Department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">District</label>
              <select value={form.district || ''} onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500">
                <option value="">Select District</option>
                {MP_DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tender Amount</label>
              <input type="text" value={form.tenderAmount || ''} onChange={e => setForm(f => ({ ...f, tenderAmount: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" placeholder="₹1,00,00,000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">EMD</label>
              <input type="text" value={form.emd || ''} onChange={e => setForm(f => ({ ...f, emd: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" placeholder="₹2,00,000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tender Fee</label>
              <input type="text" value={form.tenderFee || ''} onChange={e => setForm(f => ({ ...f, tenderFee: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" placeholder="₹500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Date</label>
              <input type="date" value={form.lastDate || ''} onChange={e => setForm(f => ({ ...f, lastDate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Official URL</label>
            <input type="url" value={form.officialUrl || ''} onChange={e => setForm(f => ({ ...f, officialUrl: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Eligibility Criteria</label>
            <textarea value={form.eligibility || ''} onChange={e => setForm(f => ({ ...f, eligibility: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" rows={2} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Required Documents</label>
            <textarea value={form.requiredDocuments || ''} onChange={e => setForm(f => ({ ...f, requiredDocuments: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" rows={2} />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" className="px-6 py-2.5 bg-navy-700 text-white rounded-lg font-medium hover:bg-navy-800 transition">
              {tender ? 'Update Tender' : 'Add Tender'}
            </button>
            <button type="button" onClick={onCancel} className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============ SETTINGS VIEW ============
function SettingsView({ settings, onSave }: { settings: AppSettings; onSave: (s: AppSettings) => void }) {
  const [form, setForm] = useState<AppSettings>(settings);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-navy-800 mb-1">Settings</h2>
        <p className="text-sm text-slate-500 mb-6">Configure branding and display options.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
            <input type="text" value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tagline</label>
            <input type="text" value={form.companyTagline} onChange={e => setForm(f => ({ ...f, companyTagline: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Info (shown in posts)</label>
            <input type="text" value={form.contactInfo} onChange={e => setForm(f => ({ ...f, contactInfo: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" placeholder="Phone, email, or website" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="showBranding" checked={form.showBranding} onChange={e => setForm(f => ({ ...f, showBranding: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300 text-navy-700 focus:ring-navy-500" />
            <label htmlFor="showBranding" className="text-sm text-slate-700">Show branding on generated banners</label>
          </div>
          <button onClick={() => onSave(form)} className="px-6 py-2.5 bg-navy-700 text-white rounded-lg font-medium hover:bg-navy-800 transition">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ POST MODAL (with editable post) ============
function PostModal({ tender, settings, onClose, onCopy }: {
  tender: Tender; settings: AppSettings; onClose: () => void; onCopy: (t: Tender) => void;
}) {
  const [editablePost, setEditablePost] = useState(generateHindiPost(tender, settings));
  const [copiedLocally, setCopiedLocally] = useState(false);
  const [copyError, setCopyError] = useState('');

  const handleCopyEdited = async () => {
    setCopyError('');
    
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(editablePost);
        setCopiedLocally(true);
        onCopy(tender);
        return;
      } catch (e) {
        console.warn('Clipboard API failed:', e);
      }
    }
    
    // Fallback: textarea-based copy
    try {
      const textarea = document.getElementById('post-text') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, editablePost.length);
        
        const success = document.execCommand('copy');
        if (success) {
          setCopiedLocally(true);
          onCopy(tender);
          return;
        }
      }
      setCopyError('Copy failed. Please select all text (Ctrl+A) and copy manually (Ctrl+C).');
    } catch (e) {
      console.error('Fallback copy failed:', e);
      setCopyError('Copy failed. Please select all text (Ctrl+A) and copy manually (Ctrl+C).');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-navy-800">Preview & Edit Post</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[55vh]">
          <textarea
            id="post-text"
            value={editablePost}
            onChange={e => setEditablePost(e.target.value)}
            className="w-full h-full min-h-[300px] px-3 py-2 border border-slate-200 rounded-lg text-sm font-hindi leading-relaxed focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"
          />
        </div>
        <div className="p-4 border-t border-slate-200">
          {copyError && (
            <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              {copyError}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={handleCopyEdited}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                copiedLocally ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-green-600 text-white hover:bg-green-700'
              }`}>
              {copiedLocally ? <><Check className="w-4 h-4" /> COPIED ✓</> : <><Copy className="w-4 h-4" /> Copy Post</>}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ BANNER MODAL ============
function BannerModal({ tender, settings, onClose, onCopyBanner, onMarkCopied }: {
  tender: Tender; settings: AppSettings; onClose: () => void; onCopyBanner: () => void; onMarkCopied: () => void;
}) {
  // Store the actual Blob in a ref to ensure we always have access to the data
  // This prevents stale URL issues and allows creating fresh object URLs on demand
  const blobRef = useRef<Blob | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [downloadAttempted, setDownloadAttempted] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Detect if we're in an iframe (which may block downloads)
  const isInIframe = typeof window !== 'undefined' && window !== window.top;

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const generate = async () => {
      setIsLoading(true);
      setBannerError('');
      setBannerUrl(null);
      setDimensions(null);
      setDownloadAttempted(false);

      // Timeout: if generation takes more than 10 seconds, show error
      timeoutId = setTimeout(() => {
        if (!cancelled) {
          setBannerError('Banner generation timed out. The operation took too long. Please try again.');
          setIsLoading(false);
          cancelled = true;
        }
      }, 10000);

      try {
        const blob = await generateBanner(tender, settings);
        if (cancelled) return;

        clearTimeout(timeoutId);

        // Verify the blob is a valid PNG
        if (!blob || blob.size === 0) {
          setBannerError('Banner generation returned an empty file. The canvas may not be rendering correctly.');
          setIsLoading(false);
          return;
        }

        // Verify blob type
        if (blob.type && blob.type !== 'image/png') {
          console.warn(`Unexpected blob type: ${blob.type}, expected image/png`);
        }

        // Store the blob in a ref for reliable access during download
        blobRef.current = blob;

        objectUrl = URL.createObjectURL(blob);
        setBannerUrl(objectUrl);
        
        console.log('[Banner Modal] Blob generated:', {
          size: blob.size,
          type: blob.type,
          url: objectUrl
        });
        
        // CRITICAL FIX: Set isLoading=false HERE, not in img.onload
        // The blob is ready and valid. The <img> will render and load asynchronously.
        setIsLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        clearTimeout(timeoutId);
        console.error('Banner generation failed:', e);
        setBannerError(`Failed to generate banner: ${e?.message || 'Unknown error'}`);
        setIsLoading(false);
      }
    };

    generate();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tender, settings]);

  // Verify dimensions once the image loads (optional, for display info only)
  const handleImageLoad = () => {
    if (imgRef.current) {
      const w = imgRef.current.naturalWidth;
      const h = imgRef.current.naturalHeight;
      setDimensions({ w, h });
      if (w !== 1080 || h !== 1350) {
        setBannerError(`Warning: Banner dimensions are ${w}×${h}, expected 1080×1350.`);
      }
    }
    // NOTE: Do NOT set isLoading here anymore - it's already false
  };

  const handleImageError = () => {
    setBannerError('Failed to render the generated banner image in the browser.');
    // NOTE: Do NOT set isLoading here anymore - it's already false
  };

  const handleDownload = () => {
    // Use the blob from ref to ensure we have the actual data, not a potentially stale URL
    const blob = blobRef.current;
    
    if (!blob) {
      setBannerError('No banner data available. Please regenerate the banner.');
      return;
    }
    
    console.log('[Banner Modal Download] Starting download with blob:', {
      size: blob.size,
      type: blob.type
    });
    
    try {
      // Create a FRESH object URL from the blob for this download attempt
      // This ensures we're not using a stale or revoked URL
      const freshUrl = URL.createObjectURL(blob);
      
      // Sanitize tender ID for filename
      const safeId = (tender.tenderId || 'tender').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `mp-tender-${safeId}.png`;
      
      const link = document.createElement('a');
      link.href = freshUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      
      console.log('[Banner Modal Download] Clicking download link:', {
        filename,
        href: freshUrl,
        hasDownloadAttr: link.hasAttribute('download')
      });
      
      // Trigger download synchronously within user gesture
      link.click();
      
      setDownloadAttempted(true);
      
      // Clean up: revoke URL and remove link after browser has time to consume
      // Don't revoke immediately - browser needs time to start the download
      setTimeout(() => {
        URL.revokeObjectURL(freshUrl);
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        console.log('[Banner Modal Download] Cleaned up object URL and link element');
      }, 10000); // 10 seconds is plenty for download to start
      
      // Note: Browsers do NOT provide a reliable confirmation that the file was saved.
      // The download may be blocked by browser settings, iframe sandbox restrictions,
      // or user preferences. We cannot detect this from JavaScript.
      
    } catch (e: any) {
      console.error('[Banner Modal Download] Error:', e);
      setBannerError(`Download failed: ${e?.message || 'Unknown error'}. Use "Open PNG" and press Ctrl+S to save.`);
    }
  };
  
  // Fallback: Open banner in new tab for manual save
  // This is the most reliable method when download attribute is blocked
  const handleOpenInNewTab = () => {
    const blob = blobRef.current;
    
    if (!blob) {
      setBannerError('No banner data available. Please regenerate.');
      return;
    }
    
    try {
      // Create a fresh object URL for the new tab
      // This ensures we're not using a potentially stale URL
      const freshUrl = URL.createObjectURL(blob);
      
      console.log('[Banner Modal] Opening in new tab with fresh URL:', freshUrl);
      
      const newWindow = window.open(freshUrl, '_blank');
      
      if (!newWindow) {
        // Popup was blocked - try alternative approach
        console.warn('[Banner Modal] Popup blocked, trying alternative');
        setBannerError('Popup was blocked. Please allow popups for this site, or right-click the banner image above and select "Save image as..."');
        URL.revokeObjectURL(freshUrl);
        return;
      }
      
      // Clean up the URL after a delay (new tab should have loaded by then)
      setTimeout(() => {
        URL.revokeObjectURL(freshUrl);
        console.log('[Banner Modal] Revoked object URL after opening in new tab');
      }, 60000); // 60 seconds is safe
      
      console.log('[Banner Modal] Opened in new tab successfully');
    } catch (e: any) {
      console.error('[Banner Modal] Failed to open in new tab:', e);
      setBannerError(`Failed to open: ${e?.message || 'Unknown error'}. Try right-clicking the banner image and selecting "Save image as..."`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-navy-800">Banner Preview</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {dimensions ? `${dimensions.w}×${dimensions.h} px • PNG` : '1080×1350 px target'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex justify-center flex-1 min-h-[200px]">
          {bannerError && !bannerUrl ? (
            <div className="text-red-600 text-sm py-8 text-center max-w-xs">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500" />
              {bannerError}
            </div>
          ) : isLoading ? (
            <div className="text-slate-500 text-sm py-8 text-center">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-navy-700" />
              Generating banner...
            </div>
          ) : bannerUrl ? (
            <div className="flex flex-col items-center gap-2 w-full">
              <img
                ref={imgRef}
                src={bannerUrl}
                alt={`Banner for tender ${tender.tenderId}`}
                onLoad={handleImageLoad}
                onError={handleImageError}
                className="max-w-full h-auto rounded-lg shadow-md border border-slate-200"
                style={{ maxHeight: '50vh' }}
              />
              {bannerError && (
                <div className="text-amber-600 text-xs text-center">{bannerError}</div>
              )}
              
              {/* Download instruction panel - always visible when banner is ready */}
              {downloadAttempted && isInIframe && (
                <div className="w-full mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <p className="font-semibold mb-1">📥 Download Note:</p>
                  <p>If the file didn't download automatically (common in embedded browsers), use one of these methods:</p>
                  <ol className="list-decimal list-inside mt-1 space-y-0.5">
                    <li>Click "Open PNG" → Right-click the image → "Save image as..."</li>
                    <li>Click "Open PNG" → Press Ctrl+S (or Cmd+S on Mac)</li>
                  </ol>
                </div>
              )}
              
              {!downloadAttempted && isInIframe && (
                <div className="w-full mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <p className="font-semibold">⚠️ Embedded Browser:</p>
                  <p>Automatic downloads may not work here. If "Download PNG" doesn't work, click "Open PNG" and use Ctrl+S to save.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="p-4 border-t border-slate-200 flex flex-wrap gap-2 flex-shrink-0">
          <button
            onClick={onCopyBanner}
            disabled={!blobRef.current}
            className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Copy banner to clipboard"
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
          <button
            onClick={handleDownload}
            disabled={!blobRef.current}
            className="flex-1 px-3 py-2 bg-navy-700 text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download banner as PNG file"
          >
            <Download className="w-3.5 h-3.5" /> Download PNG
          </button>
          <button
            onClick={handleOpenInNewTab}
            disabled={!blobRef.current}
            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Open banner in new tab - use Ctrl+S to save"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open PNG
          </button>
          <button
            onClick={onMarkCopied}
            disabled={!bannerUrl}
            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" /> Mark Copied
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ HELPER COMPONENTS ============
function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center text-white flex-shrink-0`}>
          {icon}
        </div>
        <div>
          <p className="text-xl font-bold text-slate-800">{value}</p>
          <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
        </div>
      </div>
    </div>
  );
}

function SelectFilter({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-navy-500">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function SortableHeader({ field, label, current, dir, onSort }: {
  field: SortField; label: string; current: SortField; dir: SortDirection; onSort: (f: SortField) => void;
}) {
  const isActive = current === field;
  return (
    <th className="px-3 py-3 text-left cursor-pointer hover:bg-navy-700 transition select-none" onClick={() => onSort(field)}>
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium">{label}</span>
        {isActive && (dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </div>
    </th>
  );
}
