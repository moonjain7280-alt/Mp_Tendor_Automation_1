import { Tender } from '../types';

// ⚠️ SAMPLE DATA - These are demonstration records only.
// They do NOT represent actual live tenders from the MP e-Procurement portal.
// Real tender data must be manually entered or imported from official sources.
// These records are clearly labeled as "SAMPLE" in the dashboard.

export const SAMPLE_TENDERS: Tender[] = [
  {
    id: 'sample-001',
    tenderId: 'SAMPLE-001',
    workName: '[SAMPLE] Construction of CC Road in Village XYZ',
    department: 'PWD (Rural Engineering)',
    district: 'Indore',
    tenderAmount: '₹45,00,000',
    emd: '₹90,000',
    lastDate: '2026-02-15',
    officialUrl: 'https://mptenders.gov.in',
    dataSource: 'sample',
    textCopied: false,
    bannerCopied: false,
    manuallyPublished: false,
    createdAt: '2026-01-20T10:00:00Z',
    updatedAt: '2026-01-20T10:00:00Z',
    eligibility: 'Class-I contractor with minimum 3 years experience',
    notes: '⚠️ This is SAMPLE DATA for demonstration only. Not a real tender.'
  },
  {
    id: 'sample-002',
    tenderId: 'SAMPLE-002',
    workName: '[SAMPLE] Water Supply Pipeline Laying Work',
    department: 'Public Health Engineering',
    district: 'Bhopal',
    tenderAmount: '₹1,25,00,000',
    emd: '₹2,50,000',
    lastDate: '2026-02-20',
    officialUrl: 'https://mptenders.gov.in',
    dataSource: 'sample',
    textCopied: false,
    bannerCopied: false,
    manuallyPublished: false,
    createdAt: '2026-01-21T10:00:00Z',
    updatedAt: '2026-01-21T10:00:00Z',
    eligibility: 'Class-I contractor registered with MP PWD',
    notes: '⚠️ This is SAMPLE DATA for demonstration only. Not a real tender.'
  },
  {
    id: 'sample-003',
    tenderId: 'SAMPLE-003',
    workName: '[SAMPLE] Building Renovation of Government School',
    department: 'Education Department',
    district: 'Jabalpur',
    tenderAmount: '₹32,00,000',
    emd: '₹64,000',
    lastDate: '2026-01-30',
    officialUrl: 'https://mptenders.gov.in',
    dataSource: 'sample',
    textCopied: false,
    bannerCopied: false,
    manuallyPublished: false,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    eligibility: 'Registered contractor with building construction experience',
    notes: '⚠️ This is SAMPLE DATA for demonstration only. Not a real tender.'
  }
];
