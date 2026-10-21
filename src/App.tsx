import { useState, useEffect, useCallback, useRef } from 'react';
import { Tender, TenderFilters, AppSettings, SortField, SortDirection } from './types';
import { MP_DISTRICTS, DEPARTMENTS } from './data/districts';
import { SAMPLE_TENDERS } from './data/sampleTenders';
import { generateHindiPost } from './utils/postGenerator';
import { generateBanner } from './utils/bannerGenerator';
import { loadTenders, saveTenders, loadSettings, saveSettings } from './utils/storage';
import { exportToCSV } from './utils/csvExport';
import { v4 as uuidv4 } from 'uuid';
import {
  Search, Plus, Download, Trash2, Edit3, Copy, Check, X, Eye,
  Filter, Settings, FileText, Image, ExternalLink, AlertTriangle,
  ChevronDown, ChevronUp, Undo2, RefreshCw, Database, Info
} from 'lucide-react';

type View = 'dashboard' | 'addTender' | 'settings';

export default function App() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [view, setView] = useState<View>('dashboard');
  const [editingTender, setEditingTender] = useState<Tender | null>(null);
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
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
      // Load sample data on first visit
      setTenders(SAMPLE_TENDERS);
      saveTenders(SAMPLE_TENDERS);
    } else {
      setTenders(loaded);
    }
  }, []);

  // Save tenders whenever they change
  useEffect(() => {
    if (tenders.length > 0) {
      saveTenders(tenders);
    }
  }, [tenders]);

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

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

  // Check for duplicate tender IDs
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
    const post = generateHindiPost(tender);
    try {
      await navigator.clipboard.writeText(post);
      setTenders(prev => prev.map(t => t.id === tender.id ? { ...t, textCopied: true, updatedAt: new Date().toISOString() } : t));
      showNotification('Post copied to clipboard!', 'success');
    } catch {
      showNotification('Failed to copy. Please try manually.', 'error');
    }
  };

  const handleCopyBanner = async (tender: Tender) => {
    try {
      const blob = await generateBanner(tender, settings);
      // Try clipboard API
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setTenders(prev => prev.map(t => t.id === tender.id ? { ...t, bannerCopied: true, updatedAt: new Date().toISOString() } : t));
          showNotification('Banner copied to clipboard!', 'success');
          return;
        } catch {
          // Fall through to download
        }
      }
      // Fallback: download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `banner_${tender.tenderId}.png`;
      link.click();
      URL.revokeObjectURL(url);
      showNotification('Banner downloaded. Click "Mark Copied" after sharing.', 'info');
    } catch {
      showNotification('Failed to generate banner.', 'error');
    }
  };

  const handleMarkBannerCopied = (id: string) => {
    setTenders(prev => prev.map(t => t.id === id ? { ...t, bannerCopied: true, updatedAt: new Date().toISOString() } : t));
    showNotification('Banner marked as copied', 'success');
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
    sample: tenders.filter(t => t.dataSource === 'sample').length,
    textCopied: tenders.filter(t => t.textCopied).length,
    bannerCopied: tenders.filter(t => t.bannerCopied).length,
    published: tenders.filter(t => t.manuallyPublished).length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white font-medium transition-all ${
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
            <nav className="flex items-center gap-2">
              <button
                onClick={() => { setView('dashboard'); setSelectedTender(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'dashboard' ? 'bg-navy-700 text-white' : 'text-navy-200 hover:text-white hover:bg-navy-700'}`}
              >
                <Database className="w-4 h-4 inline mr-1" /> Dashboard
              </button>
              <button
                onClick={() => { setView('addTender'); setEditingTender(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'addTender' ? 'bg-gold-500 text-navy-900' : 'text-navy-200 hover:text-white hover:bg-navy-700'}`}
              >
                <Plus className="w-4 h-4 inline mr-1" /> Add Tender
              </button>
              <button
                onClick={() => setView('settings')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'settings' ? 'bg-navy-700 text-white' : 'text-navy-200 hover:text-white hover:bg-navy-700'}`}
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
          onClose={() => setShowPostModal(false)}
          onCopy={() => { handleCopyPost(selectedTender); setShowPostModal(false); }}
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
        <p className="text-sm">MP Tender Intelligence by Apex Associates | Data stored locally in browser</p>
        <p className="text-xs mt-1 text-navy-300">
          ⚠️ Always verify tender information from{' '}
          <a href="https://www.mpeprocurement.gov.in" target="_blank" rel="noopener noreferrer" className="text-gold-400 underline">
            mpeprocurement.gov.in
          </a>
        </p>
      </footer>
    </div>
  );
}

// ============ DASHBOARD VIEW ============
function DashboardView({
  tenders, stats, filters, setFilters, showFilters, setShowFilters,
  sortField, sortDirection, handleSort, onSelectTender, onDelete,
  onDuplicate, onUndoCopied, onCopyPost, onCopyBanner, onMarkBannerCopied,
  onShowPost, onShowBanner, onExportCSV, onEdit
}: {
  tenders: Tender[];
  stats: { total: number; sample: number; textCopied: number; bannerCopied: number; published: number };
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
}) {
  return (
    <div>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Tenders" value={stats.total} icon={<Database className="w-5 h-5" />} color="bg-navy-700" />
        <StatCard label="Sample Data" value={stats.sample} icon={<AlertTriangle className="w-5 h-5" />} color="bg-amber-500" />
        <StatCard label="Text Copied" value={stats.textCopied} icon={<FileText className="w-5 h-5" />} color="bg-green-600" />
        <StatCard label="Banners Copied" value={stats.bannerCopied} icon={<Image className="w-5 h-5" />} color="bg-purple-600" />
        <StatCard label="Published" value={stats.published} icon={<Check className="w-5 h-5" />} color="bg-blue-600" />
      </div>

      {/* Storage Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-start gap-2">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <strong>Data Persistence:</strong> Data is stored in your browser's localStorage. It persists across sessions on this device but is not synced to any server. Clear browser data to reset. For production, integrate a backend database.
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
            <Download className="w-4 h-4 inline mr-1" /> Export CSV
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <SelectFilter
              label="District"
              value={filters.district}
              onChange={v => setFilters(f => ({ ...f, district: v }))}
              options={[{ value: '', label: 'All MP' }, ...MP_DISTRICTS.map(d => ({ value: d, label: d }))]}
            />
            <SelectFilter
              label="Department"
              value={filters.department}
              onChange={v => setFilters(f => ({ ...f, department: v }))}
              options={[{ value: '', label: 'All Departments' }, ...DEPARTMENTS.map(d => ({ value: d, label: d }))]}
            />
            <SelectFilter
              label="Deadline"
              value={filters.deadlineFilter}
              onChange={v => setFilters(f => ({ ...f, deadlineFilter: v as TenderFilters['deadlineFilter'] }))}
              options={[
                { value: 'all', label: 'All' },
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'thisWeek', label: 'This Week' },
                { value: 'expired', label: 'Expired' }
              ]}
            />
            <SelectFilter
              label="Text Status"
              value={filters.copyStatus}
              onChange={v => setFilters(f => ({ ...f, copyStatus: v as TenderFilters['copyStatus'] }))}
              options={[
                { value: 'all', label: 'All' },
                { value: 'copied', label: 'Copied' },
                { value: 'notCopied', label: 'Not Copied' }
              ]}
            />
            <SelectFilter
              label="Banner Status"
              value={filters.bannerStatus}
              onChange={v => setFilters(f => ({ ...f, bannerStatus: v as TenderFilters['bannerStatus'] }))}
              options={[
                { value: 'all', label: 'All' },
                { value: 'copied', label: 'Copied' },
                { value: 'notCopied', label: 'Not Copied' }
              ]}
            />
            <SelectFilter
              label="Data Source"
              value={filters.dataSource}
              onChange={v => setFilters(f => ({ ...f, dataSource: v as TenderFilters['dataSource'] }))}
              options={[
                { value: 'all', label: 'All' },
                { value: 'manual', label: 'Manual' },
                { value: 'imported', label: 'Imported' },
                { value: 'sample', label: 'Sample' }
              ]}
            />
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-slate-600 mb-2">
        Showing {tenders.length} of {stats.total} tenders
        {filters.district && <span className="ml-2 text-navy-700 font-medium">• District: {filters.district}</span>}
        {filters.department && <span className="ml-2 text-navy-700 font-medium">• Dept: {filters.department}</span>}
      </div>

      {/* Tender Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-navy-800 text-white">
              <tr>
                <SortableHeader field="tenderId" label="Tender ID" current={sortField} dir={sortDirection} onSort={handleSort} />
                <SortableHeader field="workName" label="Work Name" current={sortField} dir={sortDirection} onSort={handleSort} />
                <SortableHeader field="department" label="Department" current={sortField} dir={sortDirection} onSort={handleSort} />
                <SortableHeader field="district" label="District" current={sortField} dir={sortDirection} onSort={handleSort} />
                <SortableHeader field="tenderAmount" label="Amount" current={sortField} dir={sortDirection} onSort={handleSort} />
                <th className="px-3 py-3 text-left">EMD</th>
                <SortableHeader field="lastDate" label="Last Date" current={sortField} dir={sortDirection} onSort={handleSort} />
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                    <Database className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium">No tenders found</p>
                    <p className="text-sm">Add a tender or adjust your filters</p>
                  </td>
                </tr>
              ) : (
                tenders.map(tender => (
                  <TenderRow
                    key={tender.id}
                    tender={tender}
                    onSelect={() => onSelectTender(tender)}
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
  tender, onSelect, onEdit, onDelete, onDuplicate, onUndoCopied,
  onCopyPost, onCopyBanner, onMarkBannerCopied, onShowPost, onShowBanner
}: {
  tender: Tender;
  onSelect: () => void;
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
  const isExpired = new Date(tender.lastDate) < new Date();
  const [showActions, setShowActions] = useState(false);

  return (
    <tr className={`hover:bg-slate-50 transition ${tender.dataSource === 'sample' ? 'bg-amber-50/50' : ''}`}>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium text-navy-700 text-xs">{tender.tenderId}</span>
          {tender.dataSource === 'sample' && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">SAMPLE</span>
          )}
          {tender.dataSource === 'imported' && (
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">IMPORTED</span>
          )}
          {tender.dataSource === 'manual' && (
            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">MANUAL</span>
          )}
        </div>
      </td>
      <td className="px-3 py-3 max-w-[250px]">
        <p className="truncate text-slate-800" title={tender.workName}>{tender.workName}</p>
      </td>
      <td className="px-3 py-3 text-slate-600 text-xs">{tender.department}</td>
      <td className="px-3 py-3 text-slate-700 font-medium text-xs">{tender.district}</td>
      <td className="px-3 py-3 text-slate-800 font-medium text-xs">{tender.tenderAmount}</td>
      <td className="px-3 py-3 text-slate-600 text-xs">{tender.emd}</td>
      <td className="px-3 py-3">
        <span className={`text-xs font-medium ${isExpired ? 'text-red-600' : 'text-green-700'}`}>
          {tender.lastDate || 'N/A'}
          {isExpired && ' ⚠️'}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-center gap-1">
          <span className={`w-3 h-3 rounded-full ${tender.textCopied ? 'bg-green-500' : 'bg-slate-300'}`} title="Text Copied" />
          <span className={`w-3 h-3 rounded-full ${tender.bannerCopied ? 'bg-purple-500' : 'bg-slate-300'}`} title="Banner Copied" />
          <span className={`w-3 h-3 rounded-full ${tender.manuallyPublished ? 'bg-blue-500' : 'bg-slate-300'}`} title="Published" />
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="relative">
          <div className="flex items-center justify-center gap-1">
            <button onClick={onCopyPost} className="p-1.5 rounded hover:bg-green-50 text-green-600" title="Copy Post">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button onClick={onCopyBanner} className="p-1.5 rounded hover:bg-purple-50 text-purple-600" title="Copy Banner">
              <Image className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowActions(!showActions)} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" title="More Actions">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {showActions && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
              <button onClick={() => { onShowPost(); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                <Eye className="w-3 h-3" /> Preview Post
              </button>
              <button onClick={() => { onShowBanner(); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                <Image className="w-3 h-3" /> Preview Banner
              </button>
              <button onClick={() => { onEdit(); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                <Edit3 className="w-3 h-3" /> Edit
              </button>
              <button onClick={() => { onDuplicate(); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                <RefreshCw className="w-3 h-3" /> Duplicate
              </button>
              {tender.textCopied && (
                <button onClick={() => { onUndoCopied('text'); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2 text-amber-600">
                  <Undo2 className="w-3 h-3" /> Undo Text Copy
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
              <button onClick={() => { onSelect(); setShowActions(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2 text-blue-600">
                <ExternalLink className="w-3 h-3" /> Official Link
              </button>
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

// ============ TENDER FORM ============
function TenderFormView({
  tender, findDuplicates, onSave, onCancel
}: {
  tender: Tender | null;
  findDuplicates: (id: string, excludeId?: string) => boolean;
  onSave: (t: Tender) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<Tender>>(tender || {
    tenderId: '',
    workName: '',
    department: '',
    district: '',
    tenderAmount: '',
    emd: '',
    lastDate: '',
    officialUrl: 'https://www.mpeprocurement.gov.in',
    dataSource: 'manual',
    eligibility: '',
    notes: ''
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
      officialUrl: form.officialUrl || 'https://www.mpeprocurement.gov.in',
      dataSource: form.dataSource as Tender['dataSource'] || 'manual',
      textCopied: tender?.textCopied || false,
      bannerCopied: tender?.bannerCopied || false,
      manuallyPublished: tender?.manuallyPublished || false,
      createdAt: tender?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eligibility: form.eligibility || '',
      notes: form.notes || ''
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-navy-800 mb-1">
          {tender ? 'Edit Tender' : 'Add New Tender'}
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Enter tender information manually. Verify all details from the official portal before publishing.
        </p>

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
              <input
                type="text"
                required
                value={form.tenderId || ''}
                onChange={e => {
                  setForm(f => ({ ...f, tenderId: e.target.value }));
                  setDuplicateWarning(findDuplicates(e.target.value, tender?.id));
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                placeholder="e.g., MP/PWD/2026/001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Data Source</label>
              <select
                value={form.dataSource || 'manual'}
                onChange={e => setForm(f => ({ ...f, dataSource: e.target.value as Tender['dataSource'] }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              >
                <option value="manual">Manually Entered</option>
                <option value="imported">Imported</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Work Name *</label>
            <input
              type="text"
              required
              value={form.workName || ''}
              onChange={e => setForm(f => ({ ...f, workName: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              placeholder="Full work description"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <select
                value={form.department || ''}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              >
                <option value="">Select Department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">District</label>
              <select
                value={form.district || ''}
                onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              >
                <option value="">Select District</option>
                {MP_DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tender Amount</label>
              <input
                type="text"
                value={form.tenderAmount || ''}
                onChange={e => setForm(f => ({ ...f, tenderAmount: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                placeholder="₹1,00,00,000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">EMD</label>
              <input
                type="text"
                value={form.emd || ''}
                onChange={e => setForm(f => ({ ...f, emd: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
                placeholder="₹2,00,000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Date</label>
              <input
                type="date"
                value={form.lastDate || ''}
                onChange={e => setForm(f => ({ ...f, lastDate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Official URL</label>
            <input
              type="url"
              value={form.officialUrl || ''}
              onChange={e => setForm(f => ({ ...f, officialUrl: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              placeholder="https://www.mpeprocurement.gov.in/..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Eligibility Criteria</label>
            <textarea
              value={form.eligibility || ''}
              onChange={e => setForm(f => ({ ...f, eligibility: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              rows={2}
              placeholder="Contractor class, experience requirements, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={form.notes || ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              rows={2}
              placeholder="Internal notes (not included in generated posts)"
            />
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
        <p className="text-sm text-slate-500 mb-6">Configure branding and display options for generated banners.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
            <input
              type="text"
              value={form.companyName}
              onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tagline</label>
            <input
              type="text"
              value={form.companyTagline}
              onChange={e => setForm(f => ({ ...f, companyTagline: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Info</label>
            <input
              type="text"
              value={form.contactInfo}
              onChange={e => setForm(f => ({ ...f, contactInfo: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              placeholder="Phone, email, or website"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="showBranding"
              checked={form.showBranding}
              onChange={e => setForm(f => ({ ...f, showBranding: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300 text-navy-700 focus:ring-navy-500"
            />
            <label htmlFor="showBranding" className="text-sm text-slate-700">Show branding on generated banners</label>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <h3 className="font-medium text-blue-800 text-sm mb-2">About Data Storage</h3>
            <p className="text-xs text-blue-700">
              This application stores all data in your browser's localStorage. This means data persists across sessions on this device, but is not synced to any cloud server. For a production deployment with multi-device sync, integrate with a backend service like Supabase or Firebase.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h3 className="font-medium text-amber-800 text-sm mb-2">About Automatic Tender Collection</h3>
            <p className="text-xs text-amber-700">
              This MVP does NOT automatically collect tenders from mpeprocurement.gov.in. All tender data must be manually entered or imported. Automatic web scraping requires a backend server and must comply with the portal's terms of service.
            </p>
          </div>

          <button
            onClick={() => onSave(form)}
            className="px-6 py-2.5 bg-navy-700 text-white rounded-lg font-medium hover:bg-navy-800 transition"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ POST MODAL ============
function PostModal({ tender, onClose, onCopy }: { tender: Tender; onClose: () => void; onCopy: () => void }) {
  const post = generateHindiPost(tender);
  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-navy-800">Generated Hindi Post</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[50vh] font-hindi">
          <pre className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed">{post}</pre>
        </div>
        <div className="p-4 border-t border-slate-200 flex gap-3">
          <button onClick={onCopy} className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition flex items-center justify-center gap-2">
            <Copy className="w-4 h-4" /> Copy Post
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ BANNER MODAL ============
function BannerModal({ tender, settings, onClose, onCopyBanner, onMarkCopied }: {
  tender: Tender; settings: AppSettings; onClose: () => void; onCopyBanner: () => void; onMarkCopied: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bannerReady, setBannerReady] = useState(false);

  useEffect(() => {
    const generate = async () => {
      const blob = await generateBanner(tender, settings);
      const url = URL.createObjectURL(blob);
      const img = new window.Image();
      img.onload = () => {
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d')!;
          canvasRef.current.width = img.width;
          canvasRef.current.height = img.height;
          ctx.drawImage(img, 0, 0);
          setBannerReady(true);
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };
    generate();
  }, [tender, settings]);

  const handleDownload = async () => {
    const blob = await generateBanner(tender, settings);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `banner_${tender.tenderId}.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-navy-800">Banner Preview (1080×1350)</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex justify-center">
          {!bannerReady ? (
            <div className="text-slate-500 text-sm py-8">Generating banner...</div>
          ) : (
            <canvas ref={canvasRef} className="max-w-full h-auto rounded-lg shadow-md border border-slate-200" style={{ maxHeight: '50vh' }} />
          )}
        </div>
        <div className="p-4 border-t border-slate-200 flex flex-wrap gap-2">
          <button onClick={onCopyBanner} className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition flex items-center justify-center gap-1">
            <Copy className="w-3.5 h-3.5" /> Copy to Clipboard
          </button>
          <button onClick={handleDownload} className="flex-1 px-3 py-2 bg-navy-700 text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition flex items-center justify-center gap-1">
            <Download className="w-3.5 h-3.5" /> Download PNG
          </button>
          <button onClick={onMarkCopied} className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center justify-center gap-1">
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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center text-white`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
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
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-navy-500"
      >
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
    <th
      className="px-3 py-3 text-left cursor-pointer hover:bg-navy-700 transition select-none"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium">{label}</span>
        {isActive && (dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </div>
    </th>
  );
}
