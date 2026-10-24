export interface Tender {
  id: string;
  tenderId: string;
  workName: string;
  department: string;
  district: string;
  tenderAmount: string;
  emd: string;
  lastDate: string;
  officialUrl: string;
  dataSource: 'manual' | 'imported' | 'sample';
  textCopied: boolean;
  bannerCopied: boolean;
  manuallyPublished: boolean;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  eligibility?: string;
  tenderFee?: string;
  publishedDate?: string;
  bidOpeningDate?: string;
  organisationChain?: string;
  requiredDocuments?: string;
}

export interface TenderFilters {
  search: string;
  district: string;
  department: string;
  deadlineFilter: 'all' | 'upcoming' | 'expired' | 'thisWeek';
  copyStatus: 'all' | 'copied' | 'notCopied';
  bannerStatus: 'all' | 'copied' | 'notCopied';
  dataSource: 'all' | 'manual' | 'imported' | 'sample';
}

export interface AppSettings {
  companyName: string;
  companyTagline: string;
  showBranding: boolean;
  contactInfo: string;
}

export interface ImportState {
  lastRefreshTime: string | null;
  lastRefreshSource: string | null;
  lastRefreshCount: number;
  lastRefreshSuccess: boolean;
  lastRefreshMessage: string;
}

export type SortField = 'tenderId' | 'workName' | 'department' | 'district' | 'tenderAmount' | 'lastDate' | 'createdAt';
export type SortDirection = 'asc' | 'desc';
