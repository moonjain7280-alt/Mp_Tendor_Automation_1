import { Tender } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * MP Tender Data Import Service - Header-Aware Extraction
 * 
 * Features:
 * 1. Automatic table header detection and mapping
 * 2. Detail page extraction (when session allows)
 * 3. Pagination support
 * 4. AI-assisted fallback for irregular content
 * 5. Accurate statistics and preview
 * 
 * REAL PORTAL STRUCTURE (mptenders.gov.in):
 * - Table: id="table" or class="list_table"
 * - Header row: class="list_header"
 * - Data rows: class="even" or class="odd" with id="informal_N"
 * - Detail links: id="DirectLink" with title in [brackets]
 * - Ref/ID: [RefNo][TenderID] pattern after the link
 * - Organisation: Uses || separator
 * - Pagination: class="list_footer" with linkPage/linkFwd/linkLast
 */

// CORS proxies to try (in order of preference)
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://corsproxy.io/?',
];

const BASE_URL = 'https://mptenders.gov.in';
const LISTING_URL = `${BASE_URL}/nicgep/app?page=FrontEndListTendersbyDate&service=page`;

// ============ HEADER MAPPING ============

/** Maps known header variations to internal field names */
const HEADER_SYNONYMS: Record<string, string> = {
  // Serial number
  's.no': 'serialNo',
  's.no.': 'serialNo',
  'sr.no': 'serialNo',
  'sr.no.': 'serialNo',
  'sl.no': 'serialNo',
  'sl.no.': 'serialNo',
  'serial': 'serialNo',
  '#': 'serialNo',
  
  // Published date
  'e-published date': 'publishDate',
  'published date': 'publishDate',
  'publish date': 'publishDate',
  'epublished date': 'publishDate',
  'date of publication': 'publishDate',
  'issue date': 'publishDate',
  
  // Closing date
  'bid submission closing date': 'closingDate',
  'closing date': 'closingDate',
  'bid closing date': 'closingDate',
  'submission closing date': 'closingDate',
  'bid submission end date': 'closingDate',
  'submission deadline': 'closingDate',
  'end date': 'closingDate',
  'last date': 'closingDate',
  
  // Opening date
  'tender opening date': 'openingDate',
  'opening date': 'openingDate',
  'bid opening date': 'openingDate',
  'technical bid opening date': 'openingDate',
  
  // Title
  'title and ref.no./tender id': 'titleColumn',
  'title and ref.no./tenderid': 'titleColumn',
  'title and ref no/tender id': 'titleColumn',
  'title': 'titleColumn',
  'tender title': 'titleColumn',
  'work name': 'titleColumn',
  'subject': 'titleColumn',
  'description': 'titleColumn',
  'name of work': 'titleColumn',
  
  // Organisation
  'organisation chain': 'organisation',
  'organization chain': 'organisation',
  'organisation': 'organisation',
  'organization': 'organisation',
  'department': 'organisation',
  'dept': 'organisation',
  'agency': 'organisation',
  'authority': 'organisation',
  
  // Reference
  'ref.no.': 'referenceNumber',
  'ref no.': 'referenceNumber',
  'ref no': 'referenceNumber',
  'reference no.': 'referenceNumber',
  'reference number': 'referenceNumber',
  'nit number': 'referenceNumber',
  'nit no.': 'referenceNumber',
  'nit no': 'referenceNumber',
  
  // Tender ID
  'tender id': 'tenderId',
  'tenderid': 'tenderId',
  'tender identifier': 'tenderId',
  
  // Value
  'tender value': 'tenderValue',
  'estimated cost': 'tenderValue',
  'estimated value': 'tenderValue',
  'cost': 'tenderValue',
  'amount': 'tenderValue',
  'contract value': 'tenderValue',
  
  // EMD
  'emd': 'emd',
  'emd amount': 'emd',
  'earnest money': 'emd',
  'earnest money deposit': 'emd',
  
  // Location
  'location': 'location',
  'district': 'location',
  'place': 'location',
  'place of work': 'location',
  
  // Type
  'tender type': 'tenderType',
  'type': 'tenderType',
  'form of contract': 'contractType',
};

// ============ INTERFACES ============

export interface ImportResult {
  success: boolean;
  tenders: Tender[];
  message: string;
  source: 'cors_proxy' | 'html_paste' | 'text_import' | 'csv_import' | 'ai_assisted' | 'auto_fetch';
  timestamp: string;
  stats?: ImportStats;
}

export interface ImportStats {
  totalRows: number;
  candidatesDetected: number;
  parsed: number;
  rejected: number;
  needsReview: number;
  duplicates: number;
  missingFields: Record<string, number>;
  aiUsed: boolean;
  aiProvider?: string;
  pagesVisited: number;
  detailPagesVisited: number;
  detailPagesSuccess: number;
  headerMap?: Record<string, string>;
}

export interface FetchProgress {
  currentPage: number;
  totalPages: number;
  rowsFound: number;
  status: string;
}

// ============ MAIN FETCH FUNCTION ============

/**
 * Attempt to fetch live tenders with full header detection, pagination, and detail extraction.
 */
export async function fetchLiveTenders(
  onProgress?: (progress: FetchProgress) => void
): Promise<ImportResult> {
  const timestamp = new Date().toISOString();
  const allTenders: Tender[] = [];
  const seenIds = new Set<string>();
  let pagesVisited = 0;
  let detailPagesVisited = 0;
  let detailPagesSuccess = 0;
  let headerMap: Record<string, string> = {};
  const maxPages = 5; // Configurable limit
  
  // Try direct fetch first, then CORS proxies
  let html = '';
  let fetchSource: ImportResult['source'] = 'auto_fetch';
  
  // Try direct fetch
  try {
    const response = await fetch(LISTING_URL, { 
      signal: AbortSignal.timeout(10000),
      mode: 'cors'
    });
    if (response.ok) {
      html = await response.text();
      fetchSource = 'auto_fetch';
    }
  } catch (e) {
    console.warn('Direct fetch failed, trying CORS proxies...');
  }
  
  // Try CORS proxies
  if (!html) {
    for (const proxy of CORS_PROXIES) {
      try {
        onProgress?.({ currentPage: 0, totalPages: 1, rowsFound: 0, status: `Trying ${proxy.split('/')[2]}...` });
        const url = `${proxy}${encodeURIComponent(LISTING_URL)}`;
        const response = await fetch(url, { 
          signal: AbortSignal.timeout(15000) 
        });
        
        if (!response.ok) continue;
        
        const proxyHtml = await response.text();
        
        // Validate it's actually the tender page
        if (proxyHtml.includes('list_table') || proxyHtml.includes('DirectLink') || proxyHtml.includes('FrontEndListTendersbyDate')) {
          html = proxyHtml;
          fetchSource = 'cors_proxy';
          break;
        }
      } catch (e) {
        console.warn(`Proxy ${proxy} failed:`, e);
        continue;
      }
    }
  }
  
  if (!html) {
    return {
      success: false,
      tenders: [],
      message: 'Could not access the official portal. All CORS proxies timed out or returned errors. Please use the "Paste HTML" method: Go to mptenders.gov.in → Tenders by Closing Date → Right-click the tender table → Inspect → Copy outer HTML → Paste in the import box.',
      source: 'cors_proxy',
      timestamp
    };
  }
  
  // Parse the listing page with header detection
  onProgress?.({ currentPage: 1, totalPages: 1, rowsFound: 0, status: 'Parsing listing page...' });
  
  const page1Result = parseListingPage(html);
  headerMap = page1Result.headerMap;
  
  // Process tenders from page 1
  for (const candidate of page1Result.candidates) {
    const id = candidate.tenderId || candidate.referenceNumber;
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);
    
    const tender = candidateToTender(candidate);
    
    // Try to fetch detail page for additional info
    if (candidate.detailUrl) {
      detailPagesVisited++;
      onProgress?.({ currentPage: 1, totalPages: 1, rowsFound: allTenders.length, status: `Fetching detail page ${detailPagesVisited}...` });
      
      try {
        const detailData = await fetchTenderDetail(candidate.detailUrl);
        if (detailData) {
          detailPagesSuccess++;
          mergeDetailData(tender, detailData);
        }
      } catch (e) {
        console.warn('Detail page fetch failed:', e);
      }
    }
    
    allTenders.push(tender);
  }
  
  pagesVisited = 1;
  
  // Pagination: detect and follow next pages
  const paginationLinks = detectPaginationLinks(html);
  const pagesToVisit = Math.min(paginationLinks.length, maxPages - 1);
  
  for (let i = 0; i < pagesToVisit; i++) {
    const pageUrl = paginationLinks[i];
    onProgress?.({ 
      currentPage: i + 2, 
      totalPages: paginationLinks.length + 1, 
      rowsFound: allTenders.length, 
      status: `Fetching page ${i + 2}...` 
    });
    
    try {
      let pageHtml = '';
      
      // Try direct fetch for pagination links
      try {
        const resp = await fetch(pageUrl, { signal: AbortSignal.timeout(10000), mode: 'cors' });
        if (resp.ok) pageHtml = await resp.text();
      } catch {}
      
      // Try via proxy
      if (!pageHtml) {
        for (const proxy of CORS_PROXIES) {
          try {
            const proxyUrl = `${proxy}${encodeURIComponent(pageUrl)}`;
            const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
            if (resp.ok) {
              const pHtml = await resp.text();
              if (pHtml.includes('list_table') || pHtml.includes('DirectLink')) {
                pageHtml = pHtml;
                break;
              }
            }
          } catch { continue; }
        }
      }
      
      if (pageHtml) {
        pagesVisited++;
        const pageResult = parseListingPage(pageHtml);
        
        let newOnThisPage = 0;
        for (const candidate of pageResult.candidates) {
          const id = candidate.tenderId || candidate.referenceNumber;
          if (id && seenIds.has(id)) continue;
          if (id) seenIds.add(id);
          
          const tender = candidateToTender(candidate);
          allTenders.push(tender);
          newOnThisPage++;
        }
        
        // Stop if no new tenders found (likely same data or session expired)
        if (newOnThisPage === 0) break;
      }
    } catch (e) {
      console.warn(`Pagination page ${i + 2} failed:`, e);
      break;
    }
  }
  
  // Build stats
  const stats: ImportStats = {
    totalRows: page1Result.totalRows,
    candidatesDetected: page1Result.candidates.length,
    parsed: allTenders.length,
    rejected: page1Result.rejected,
    needsReview: allTenders.filter(t => t.tenderId === 'PENDING-IMPORT').length,
    duplicates: seenIds.size < page1Result.candidates.length ? page1Result.candidates.length - seenIds.size : 0,
    missingFields: computeMissingFields(allTenders),
    aiUsed: false,
    pagesVisited,
    detailPagesVisited,
    detailPagesSuccess,
    headerMap
  };
  
  if (allTenders.length > 0) {
    return {
      success: true,
      tenders: allTenders,
      message: `Fetched ${allTenders.length} tenders from ${pagesVisited} page(s). ${detailPagesSuccess}/${detailPagesVisited} detail pages accessible.`,
      source: fetchSource,
      timestamp,
      stats
    };
  }
  
  return {
    success: false,
    tenders: [],
    message: 'Portal page was accessible but no tender rows could be parsed. The page structure may have changed. Use the "Paste HTML" method as fallback.',
    source: fetchSource,
    timestamp,
    stats
  };
}

// ============ HEADER-AWARE LISTING PARSER ============

interface ParsedCandidate {
  tenderId: string;
  referenceNumber: string;
  workName: string;
  department: string;
  district: string;
  tenderAmount: string;
  emd: string;
  lastDate: string;
  publishedDate: string;
  bidOpeningDate: string;
  officialUrl: string;
  detailUrl: string;
  organisationChain: string;
  serialNo: string;
  extraFields: Record<string, string>;
}

interface ListingParseResult {
  candidates: ParsedCandidate[];
  totalRows: number;
  rejected: number;
  headerMap: Record<string, string>;
}

/**
 * Parse a listing page with automatic header detection.
 * This handles the actual mptenders.gov.in table structure.
 */
export function parseListingPage(html: string): ListingParseResult {
  const candidates: ParsedCandidate[] = [];
  let totalRows = 0;
  let rejected = 0;
  const headerMap: Record<string, string> = {};
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find the main tender table
    const table = doc.querySelector('table.list_table') || 
                  doc.querySelector('table#table') ||
                  doc.querySelector('table.list');
    
    if (!table) {
      // Fallback: try to find any table with tender-like content
      const allTables = doc.querySelectorAll('table');
      for (const t of allTables) {
        if (t.innerHTML.includes('DirectLink') || t.innerHTML.includes('list_header')) {
          return parseListingPageFromTable(t);
        }
      }
      return { candidates, totalRows, rejected, headerMap };
    }
    
    return parseListingPageFromTable(table);
  } catch (e) {
    console.error('Listing page parse error:', e);
    return { candidates, totalRows, rejected, headerMap };
  }
  
  function parseListingPageFromTable(table: Element): ListingParseResult {
    const result: ListingParseResult = { candidates: [], totalRows: 0, rejected: 0, headerMap: {} };
    
    // Step 1: Detect headers
    const headerRow = table.querySelector('tr.list_header') || table.querySelector('thead tr') || table.querySelector('tr:first-child');
    const columnMap: Record<number, string> = {};
    
    if (headerRow) {
      const headerCells = headerRow.querySelectorAll('td, th');
      headerCells.forEach((cell, index) => {
        const rawText = cell.textContent?.trim().toLowerCase() || '';
        const normalized = normalizeHeaderText(rawText);
        const fieldName = mapHeaderToField(normalized);
        
        if (fieldName) {
          columnMap[index] = fieldName;
          result.headerMap[normalized] = fieldName;
        } else {
          // Preserve unknown headers
          columnMap[index] = `unknown_${index}`;
          result.headerMap[normalized] = `unknown_${index}`;
        }
      });
    }
    
    // Step 2: Parse data rows
    const dataRows = table.querySelectorAll('tr.even, tr.odd, tr[id^="informal"]');
    
    // If no class-based rows found, try all rows except header
    const rowsToProcess = dataRows.length > 0 
      ? Array.from(dataRows) 
      : Array.from(table.querySelectorAll('tr')).filter(r => !r.classList.contains('list_header') && !r.classList.contains('list_footer'));
    
    for (const row of rowsToProcess) {
      result.totalRows++;
      
      // Skip footer/pagination rows
      if (row.classList.contains('list_footer')) continue;
      if (row.querySelector('span#informal_11')) continue; // Pagination container
      
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) {
        result.rejected++;
        continue;
      }
      
      // Extract data based on column mapping
      const candidate = extractCandidateFromRow(cells, columnMap, row);
      
      if (candidate && candidate.workName && candidate.workName.length > 5) {
        result.candidates.push(candidate);
      } else {
        result.rejected++;
      }
    }
    
    return result;
  }
}

/**
 * Extract a candidate tender from a table row using the column mapping.
 */
function extractCandidateFromRow(
  cells: NodeListOf<Element>, 
  columnMap: Record<number, string>,
  row: Element
): ParsedCandidate | null {
  const candidate: ParsedCandidate = {
    tenderId: '',
    referenceNumber: '',
    workName: '',
    department: '',
    district: '',
    tenderAmount: '',
    emd: '',
    lastDate: '',
    publishedDate: '',
    bidOpeningDate: '',
    officialUrl: '',
    detailUrl: '',
    organisationChain: '',
    serialNo: '',
    extraFields: {}
  };
  
  // Map cells to fields
  cells.forEach((cell, index) => {
    const fieldName = columnMap[index];
    const cellText = cell.textContent?.trim() || '';
    
    if (!fieldName) return;
    
    switch (fieldName) {
      case 'serialNo':
        candidate.serialNo = cellText.replace(/[.\s]/g, '');
        break;
      case 'publishDate':
        candidate.publishedDate = normalizeDate(cellText);
        break;
      case 'closingDate':
        candidate.lastDate = normalizeDate(cellText);
        break;
      case 'openingDate':
        candidate.bidOpeningDate = normalizeDate(cellText);
        break;
      case 'titleColumn':
        // This is the complex column with title link + ref numbers
        extractTitleColumn(cell, candidate);
        break;
      case 'organisation':
        candidate.organisationChain = cellText;
        candidate.department = extractDepartmentFromOrg(cellText);
        candidate.district = extractDistrictFromOrg(cellText);
        break;
      case 'tenderValue':
        candidate.tenderAmount = cellText;
        break;
      case 'emd':
        candidate.emd = cellText;
        break;
      case 'location':
        candidate.district = cellText;
        break;
      case 'referenceNumber':
        candidate.referenceNumber = cellText;
        break;
      case 'tenderId':
        candidate.tenderId = cellText;
        break;
      default:
        if (fieldName.startsWith('unknown_')) {
          candidate.extraFields[fieldName] = cellText;
        }
    }
  });
  
  // Fallback: if titleColumn wasn't mapped, scan all cells for DirectLink
  if (!candidate.workName) {
    const links = row.querySelectorAll('a[id^="DirectLink"]');
    if (links.length > 0) {
      extractTitleColumn(links[0].parentElement!, candidate);
    }
  }
  
  return candidate;
}

/**
 * Extract title, reference number, and tender ID from the combined title column.
 * The real portal format is: [Title](link) [RefNo][TenderID]
 */
function extractTitleColumn(cell: Element, candidate: ParsedCandidate): void {
  const fullText = cell.textContent?.trim() || '';
  
  // Find the detail link
  const link = cell.querySelector('a[id^="DirectLink"]') || cell.querySelector('a[href*="DirectLink"]');
  
  if (link) {
    // Title is in the link text, possibly wrapped in brackets
    let title = link.textContent?.trim() || '';
    if (title.startsWith('[') && title.endsWith(']')) {
      title = title.slice(1, -1);
    }
    candidate.workName = title;
    
    // Detail URL
    const href = link.getAttribute('href') || '';
    if (href) {
      candidate.detailUrl = href.startsWith('http') ? href : BASE_URL + (href.startsWith('/') ? '' : '/') + href;
      candidate.officialUrl = candidate.detailUrl;
    }
  }
  
  // Extract [RefNo][TenderID] pattern from the remaining text
  const refPattern = /\[([^\]]+)\]\[([^\]]+)\]/;
  const refMatch = fullText.match(refPattern);
  
  if (refMatch) {
    candidate.referenceNumber = refMatch[1].trim();
    candidate.tenderId = refMatch[2].trim();
  } else {
    // Try to find standalone tender IDs
    const idPatterns = [
      /\b(\d{4}_\w+_\d+_\d+)\b/,
      /\b(\d{4}[-\/]\w+[-\/]\d+(?:[-\/]\d+)?)\b/,
    ];
    for (const pattern of idPatterns) {
      const m = fullText.match(pattern);
      if (m) {
        candidate.tenderId = m[1];
        break;
      }
    }
  }
  
  // If we still don't have a title, use the full text minus the ref pattern
  if (!candidate.workName) {
    candidate.workName = fullText.replace(refPattern, '').replace(/\[|\]/g, '').trim();
  }
}

// ============ DETAIL PAGE EXTRACTION ============

interface TenderDetailData {
  workName?: string;
  tenderId?: string;
  referenceNumber?: string;
  department?: string;
  district?: string;
  tenderAmount?: string;
  emd?: string;
  lastDate?: string;
  publishedDate?: string;
  bidOpeningDate?: string;
  tenderType?: string;
  contractType?: string;
  eligibility?: string;
  tenderFee?: string;
  documentFee?: string;
  contactDetails?: string;
  tenderDocumentLink?: string;
}

/**
 * Fetch and parse a tender detail page.
 * Returns null if the page is inaccessible (stale session, etc.)
 */
async function fetchTenderDetail(url: string): Promise<TenderDetailData | null> {
  // Validate URL belongs to official source
  if (!url.includes('mptenders.gov.in')) return null;
  
  try {
    let html = '';
    
    // Try direct fetch
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000), mode: 'cors' });
      if (resp.ok) html = await resp.text();
    } catch {}
    
    // Try via proxy
    if (!html) {
      for (const proxy of CORS_PROXIES) {
        try {
          const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
          const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
          if (resp.ok) {
            html = await resp.text();
            break;
          }
        } catch { continue; }
      }
    }
    
    if (!html) return null;
    
    // Check for stale session
    if (html.includes('session has timed out') || html.includes('Stale Session') || html.includes('session=T&')) {
      return null; // Session expired, can't access detail
    }
    
    return parseTenderDetailPage(html);
  } catch (e) {
    console.warn('Detail page fetch error:', e);
    return null;
  }
}

/**
 * Parse a tender detail page and extract all available fields.
 */
function parseTenderDetailPage(html: string): TenderDetailData | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const data: TenderDetailData = {};
    
    // Detail pages typically have label-value pairs in tables or divs
    // Look for common patterns
    
    // Method 1: Look for labeled rows (label: value pattern)
    const allText = doc.body?.textContent || '';
    
    // Extract fields using label patterns
    const fieldPatterns: [RegExp, keyof TenderDetailData][] = [
      [/(?:Tender|Reference)\s*(?:ID|Number|Identifier)[\s:：]+([^\n<]+)/i, 'tenderId'],
      [/(?:NIT|Ref)\s*(?:Number|No|Ref)[\s:.：]+([^\n<]+)/i, 'referenceNumber'],
      [/(?:Title|Work\s*Name|Subject|Description)[\s:：]+([^\n<]+)/i, 'workName'],
      [/(?:Organisation|Department|Agency)[\s:：]+([^\n<]+)/i, 'department'],
      [/(?:District|Location|Place)[\s:：]+([^\n<]+)/i, 'district'],
      [/(?:Tender\s*Value|Estimated\s*(?:Cost|Value)|Contract\s*Value)[\s:：]+([^\n<]+)/i, 'tenderAmount'],
      [/(?:EMD|Earnest\s*Money)[\s:：]+([^\n<]+)/i, 'emd'],
      [/(?:Closing\s*Date|Bid\s*Submission\s*(?:End|Closing)\s*Date|Last\s*Date)[\s:：]+([^\n<]+)/i, 'lastDate'],
      [/(?:Published|Issue|Notification)\s*Date[\s:：]+([^\n<]+)/i, 'publishedDate'],
      [/(?:Opening\s*Date|Bid\s*Opening)[\s:：]+([^\n<]+)/i, 'bidOpeningDate'],
      [/(?:Tender\s*Type|Type\s*of\s*Tender)[\s:：]+([^\n<]+)/i, 'tenderType'],
      [/(?:Form\s*of\s*Contract|Contract\s*Type)[\s:：]+([^\n<]+)/i, 'contractType'],
      [/(?:Eligibility|Eligibility\s*Criteria)[\s:：]+([^\n<]+)/i, 'eligibility'],
      [/(?:Tender\s*Fee|Document\s*Fee|Fee)[\s:：]+([^\n<]+)/i, 'tenderFee'],
      [/(?:Contact|Authority|Officer)[\s:：]+([^\n<]+)/i, 'contactDetails'],
    ];
    
    for (const [pattern, field] of fieldPatterns) {
      const match = allText.match(pattern);
      if (match) {
        const value = match[1].trim();
        if (value && value.length > 0 && value.length < 500) {
          (data as any)[field] = value;
        }
      }
    }
    
    // Normalize dates
    if (data.lastDate) data.lastDate = normalizeDate(data.lastDate);
    if (data.publishedDate) data.publishedDate = normalizeDate(data.publishedDate);
    if (data.bidOpeningDate) data.bidOpeningDate = normalizeDate(data.bidOpeningDate);
    
    // Look for document download links
    const docLinks = doc.querySelectorAll('a[href*="downloadDocument"], a[href*="TenderDocument"]');
    if (docLinks.length > 0) {
      const href = docLinks[0].getAttribute('href');
      if (href) {
        data.tenderDocumentLink = href.startsWith('http') ? href : BASE_URL + href;
      }
    }
    
    // Only return if we found at least some data
    const hasData = Object.values(data).some(v => v && v.length > 0);
    return hasData ? data : null;
  } catch (e) {
    console.error('Detail page parse error:', e);
    return null;
  }
}

/**
 * Merge detail page data into an existing tender, without overwriting valid listing data.
 */
function mergeDetailData(tender: Tender, detail: TenderDetailData): void {
  // Only fill in fields that are empty/missing from the listing
  if (!tender.tenderAmount && detail.tenderAmount) tender.tenderAmount = detail.tenderAmount;
  if (!tender.emd && detail.emd) tender.emd = detail.emd;
  if (!tender.eligibility && detail.eligibility) tender.eligibility = detail.eligibility;
  if (!tender.tenderFee && detail.tenderFee) tender.tenderFee = detail.tenderFee;
  if (!tender.lastDate && detail.lastDate) tender.lastDate = detail.lastDate;
  if (!tender.publishedDate && detail.publishedDate) tender.publishedDate = detail.publishedDate;
  if (!tender.bidOpeningDate && detail.bidOpeningDate) tender.bidOpeningDate = detail.bidOpeningDate;
  if ((!tender.department || tender.department === 'Not specified in source') && detail.department) tender.department = detail.department;
  if ((!tender.district || tender.district === 'Not specified in source') && detail.district) tender.district = detail.district;
  
  // Add detail-sourced info to notes
  const detailNotes: string[] = [];
  if (detail.tenderType) detailNotes.push(`Type: ${detail.tenderType}`);
  if (detail.contractType) detailNotes.push(`Contract: ${detail.contractType}`);
  if (detail.contactDetails) detailNotes.push(`Contact: ${detail.contactDetails}`);
  if (detail.tenderDocumentLink) detailNotes.push(`Document: ${detail.tenderDocumentLink}`);
  
  if (detailNotes.length > 0) {
    tender.notes = (tender.notes || '') + ' | Detail: ' + detailNotes.join('; ');
  }
}

// ============ PAGINATION DETECTION ============

/**
 * Detect pagination links from the listing page.
 * Returns URLs for subsequent pages.
 */
function detectPaginationLinks(html: string): string[] {
  const links: string[] = [];
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Look for pagination links in the footer
    const pageLinks = doc.querySelectorAll('a[id^="linkPage"], a[id^="linkPage_"]');
    
    for (const link of pageLinks) {
      const href = link.getAttribute('href');
      if (href) {
        const fullUrl = href.startsWith('http') ? href : BASE_URL + (href.startsWith('/') ? '' : '/') + href;
        // Validate it's a pagination link
        if (fullUrl.includes('TablePages') || fullUrl.includes('linkPage')) {
          links.push(fullUrl);
        }
      }
    }
    
    // Also look for "Next" / forward link
    const fwdLink = doc.querySelector('a[id="linkFwd"]');
    if (fwdLink && links.length === 0) {
      const href = fwdLink.getAttribute('href');
      if (href) {
        links.push(href.startsWith('http') ? href : BASE_URL + href);
      }
    }
  } catch (e) {
    console.warn('Pagination detection error:', e);
  }
  
  return links;
}

// ============ HEADER NORMALIZATION ============

function normalizeHeaderText(text: string): string {
  return text
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.]+$/g, '')
    .trim();
}

function mapHeaderToField(normalizedHeader: string): string | null {
  // Direct match
  if (HEADER_SYNONYMS[normalizedHeader]) {
    return HEADER_SYNONYMS[normalizedHeader];
  }
  
  // Partial match - check if any synonym is contained in the header
  for (const [synonym, field] of Object.entries(HEADER_SYNONYMS)) {
    if (normalizedHeader.includes(synonym) || synonym.includes(normalizedHeader)) {
      return field;
    }
  }
  
  return null;
}

// ============ CONTENT PARSING (for pasted content) ============

/**
 * Parse pasted HTML/text from the user.
 * Uses header-aware parsing as primary, with fallbacks.
 */
export function parsePastedContent(content: string): { tenders: Tender[]; stats: ImportStats } {
  const emptyStats: ImportStats = {
    totalRows: 0, candidatesDetected: 0, parsed: 0, rejected: 0,
    needsReview: 0, duplicates: 0, missingFields: {}, aiUsed: false,
    pagesVisited: 1, detailPagesVisited: 0, detailPagesSuccess: 0
  };

  if (!content || !content.trim()) return { tenders: [], stats: emptyStats };

  // Strategy 1: Header-aware HTML parsing (best for actual portal HTML)
  const listingResult = parseListingPage(content);
  if (listingResult.candidates.length >= 3) {
    const tenders = listingResult.candidates.map(c => candidateToTender(c));
    return {
      tenders,
      stats: {
        totalRows: listingResult.totalRows,
        candidatesDetected: listingResult.candidates.length,
        parsed: tenders.length,
        rejected: listingResult.rejected,
        needsReview: tenders.filter(t => t.tenderId === 'PENDING-IMPORT').length,
        duplicates: 0,
        missingFields: computeMissingFields(tenders),
        aiUsed: false,
        pagesVisited: 1,
        detailPagesVisited: 0,
        detailPagesSuccess: 0,
        headerMap: listingResult.headerMap
      }
    };
  }

  // Strategy 2: DOM-based parsing with DirectLink detection
  const domResult = parseHTMLWithDirectLinks(content);
  if (domResult.length >= 1) {
    const tenders = domResult.map(c => candidateToTender(c));
    return {
      tenders,
      stats: {
        totalRows: domResult.length,
        candidatesDetected: domResult.length,
        parsed: tenders.length,
        rejected: 0,
        needsReview: tenders.filter(t => t.tenderId === 'PENDING-IMPORT').length,
        duplicates: 0,
        missingFields: computeMissingFields(tenders),
        aiUsed: false,
        pagesVisited: 1, detailPagesVisited: 0, detailPagesSuccess: 0
      }
    };
  }

  // Strategy 3: Block-based text parsing
  const blockResult = parseBlockText(content);
  if (blockResult.length >= 1) {
    const tenders = blockResult.map(c => candidateToTender(c));
    return {
      tenders,
      stats: {
        totalRows: blockResult.length,
        candidatesDetected: blockResult.length,
        parsed: tenders.length,
        rejected: 0,
        needsReview: tenders.filter(t => t.tenderId === 'PENDING-IMPORT').length,
        duplicates: 0,
        missingFields: computeMissingFields(tenders),
        aiUsed: false,
        pagesVisited: 1, detailPagesVisited: 0, detailPagesSuccess: 0
      }
    };
  }

  return { tenders: [], stats: emptyStats };
}

/**
 * Parse HTML looking specifically for DirectLink anchors (mptenders.gov.in pattern).
 */
function parseHTMLWithDirectLinks(html: string): ParsedCandidate[] {
  const candidates: ParsedCandidate[] = [];
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find all DirectLink anchors
    const links = doc.querySelectorAll('a[id^="DirectLink"], a[href*="DirectLink"]');
    
    for (const link of links) {
      const candidate: ParsedCandidate = {
        tenderId: '', referenceNumber: '', workName: '', department: '',
        district: '', tenderAmount: '', emd: '', lastDate: '',
        publishedDate: '', bidOpeningDate: '', officialUrl: '', detailUrl: '',
        organisationChain: '', serialNo: '', extraFields: {}
      };
      
      // Extract title from link
      let title = link.textContent?.trim() || '';
      if (title.startsWith('[') && title.endsWith(']')) title = title.slice(1, -1);
      candidate.workName = title;
      
      // Extract URL
      const href = link.getAttribute('href') || '';
      if (href) {
        candidate.detailUrl = href.startsWith('http') ? href : BASE_URL + (href.startsWith('/') ? '' : '/') + href;
        candidate.officialUrl = candidate.detailUrl;
      }
      
      // Look at parent/sibling elements for dates and org chain
      const row = link.closest('tr') || link.parentElement?.parentElement;
      if (row) {
        const rowText = row.textContent || '';
        
        // Extract [RefNo][TenderID]
        const refMatch = rowText.match(/\[([^\]]+)\]\[([^\]]+)\]/);
        if (refMatch) {
          candidate.referenceNumber = refMatch[1];
          candidate.tenderId = refMatch[2];
        }
        
        // Extract dates
        const dates = extractAllDates(rowText);
        candidate.publishedDate = dates.publishedDate;
        candidate.lastDate = dates.closingDate;
        candidate.bidOpeningDate = dates.openingDate;
        
        // Extract organisation
        const orgText = extractOrgChainFromText(rowText);
        if (orgText) {
          candidate.organisationChain = orgText;
          candidate.department = extractDepartmentFromOrg(orgText);
          candidate.district = extractDistrictFromOrg(orgText);
        }
      }
      
      if (candidate.workName && candidate.workName.length > 5) {
        candidates.push(candidate);
      }
    }
  } catch (e) {
    console.error('DirectLink parsing error:', e);
  }
  
  return candidates;
}

/**
 * Parse block-based text content.
 */
function parseBlockText(text: string): ParsedCandidate[] {
  const candidates: ParsedCandidate[] = [];
  const blocks = splitIntoBlocks(text);
  
  for (const block of blocks) {
    const candidate = extractFromBlock(block);
    if (candidate && candidate.workName && candidate.workName.length > 5) {
      candidates.push(candidate);
    }
  }
  
  return candidates;
}

function splitIntoBlocks(text: string): string[] {
  // Try multiple splitting strategies
  const strategies = [
    text.split(/\n\s*\n/).filter(b => b.trim().length > 20),
    text.split(/\n\s*(?:\d+[\.\)]\s+)/).filter(b => b.trim().length > 20),
    text.split(/(?=\[[^\]]{5,}\]\[[^\]]{5,}\])/).filter(b => b.trim().length > 20),
    text.split(/(?:---+|===+|\*{3,})/).filter(b => b.trim().length > 20),
  ];
  
  let best = strategies[0];
  for (const s of strategies) {
    if (s.length > best.length) best = s;
  }
  
  if (best.length <= 1) {
    // Line-by-line splitting with pattern detection
    const lines = text.split('\n');
    const blocks: string[] = [];
    let current: string[] = [];
    
    for (const line of lines) {
      const isNew = line.match(/^\d+[\.\)]\s+/) || 
                    line.match(/^Tender\s*ID/i) ||
                    (line.match(/\b\d{4}_\w+_\d+_\d+\b/) && current.length > 2);
      
      if (isNew && current.length > 0) {
        blocks.push(current.join('\n'));
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) blocks.push(current.join('\n'));
    return blocks.filter(b => b.trim().length > 15);
  }
  
  return best;
}

function extractFromBlock(block: string): ParsedCandidate | null {
  const lines = block.split('\n').map(l => l.trim()).filter(l => l);
  const fullText = block;
  
  const candidate: ParsedCandidate = {
    tenderId: '', referenceNumber: '', workName: '', department: '',
    district: '', tenderAmount: '', emd: '', lastDate: '',
    publishedDate: '', bidOpeningDate: '', officialUrl: '', detailUrl: '',
    organisationChain: '', serialNo: '', extraFields: {}
  };
  
  // Extract [RefNo][TenderID]
  const refMatch = fullText.match(/\[([^\]]+)\]\[([^\]]+)\]/);
  if (refMatch) {
    candidate.referenceNumber = refMatch[1];
    candidate.tenderId = refMatch[2];
  }
  
  // Extract standalone IDs
  if (!candidate.tenderId) {
    const idPatterns = [/\b(\d{4}_\w+_\d+_\d+)\b/, /\b(\d{4}[-\/]\w+[-\/]\d+)\b/];
    for (const p of idPatterns) {
      const m = fullText.match(p);
      if (m) { candidate.tenderId = m[1]; break; }
    }
  }
  
  // Extract dates
  const dates = extractAllDates(fullText);
  candidate.publishedDate = dates.publishedDate;
  candidate.lastDate = dates.closingDate;
  candidate.bidOpeningDate = dates.openingDate;
  
  // Extract URL
  const urlMatch = fullText.match(/https?:\/\/[^\s<>"']+/);
  if (urlMatch) {
    candidate.officialUrl = urlMatch[0];
    candidate.detailUrl = urlMatch[0];
  }
  
  // Extract org chain
  candidate.organisationChain = extractOrgChainFromText(fullText);
  candidate.department = extractDepartmentFromOrg(candidate.organisationChain) || extractDepartmentFromText(fullText);
  candidate.district = extractDistrictFromOrg(candidate.organisationChain) || extractDistrictFromText(fullText);
  
  // Extract title
  for (const line of lines) {
    if (line.length > 20 && !isMetadataLine(line) && !line.match(/^[\[\d]/)) {
      candidate.workName = cleanText(line);
      break;
    }
  }
  
  if (!candidate.workName) {
    // Use longest non-metadata line
    let best = '';
    for (const line of lines) {
      if (line.length > best.length && !isMetadataLine(line) && line.length > 15) best = line;
    }
    candidate.workName = cleanText(best);
  }
  
  return candidate.workName ? candidate : null;
}

function isMetadataLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 5) return true;
  if (/^\d{2}[-\/]\w{3}[-\/]\d{4}/.test(trimmed)) return true;
  if (/^\[.+\]\[.+\]$/.test(trimmed)) return true;
  if (/^(Tender|Reference|NIT|Closing|Opening|Publish|Department|Organisation|District|EMD|Value|Amount|Fee|Eligib|URL|S\.?No)[\s:：]/i.test(trimmed)) return true;
  return false;
}

// ============ CSV PARSING ============

export function parseCSVContent(csv: string): { tenders: Tender[]; stats: ImportStats } {
  const tenders: Tender[] = [];
  const stats: ImportStats = {
    totalRows: 0, candidatesDetected: 0, parsed: 0, rejected: 0,
    needsReview: 0, duplicates: 0, missingFields: {}, aiUsed: false,
    pagesVisited: 1, detailPagesVisited: 0, detailPagesSuccess: 0
  };

  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { tenders, stats };
  
  for (let i = 1; i < lines.length; i++) {
    stats.totalRows++;
    stats.candidatesDetected++;
    const cols = parseCSVLine(lines[i]);
    
    if (cols.length >= 2 && cols[1]) {
      tenders.push({
        id: uuidv4(), tenderId: cols[0] || 'PENDING-IMPORT', workName: cols[1],
        department: cols[2] || '', district: cols[3] || '', tenderAmount: cols[4] || '',
        emd: cols[5] || '', lastDate: cols[6] || '', officialUrl: cols[7] || BASE_URL,
        dataSource: 'imported', textCopied: false, bannerCopied: false, manuallyPublished: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        eligibility: cols[8] || '', notes: `Imported from CSV on ${new Date().toLocaleDateString()}.`
      });
      stats.parsed++;
    } else {
      stats.rejected++;
    }
  }
  
  return { tenders, stats };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += char;
  }
  result.push(current.trim());
  return result;
}

// ============ CONVERSION & HELPERS ============

function candidateToTender(c: ParsedCandidate): Tender {
  return {
    id: uuidv4(),
    tenderId: c.tenderId || c.referenceNumber || 'PENDING-IMPORT',
    workName: c.workName || 'Unknown Tender',
    department: c.department || c.organisationChain || 'Not specified in source',
    district: c.district || 'Not specified in source',
    tenderAmount: c.tenderAmount || '',
    emd: c.emd || '',
    lastDate: c.lastDate || '',
    officialUrl: c.officialUrl || c.detailUrl || BASE_URL,
    dataSource: 'imported',
    textCopied: false, bannerCopied: false, manuallyPublished: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    eligibility: '', tenderFee: '',
    publishedDate: c.publishedDate || '',
    bidOpeningDate: c.bidOpeningDate || '',
    organisationChain: c.organisationChain || '',
    notes: `Imported on ${new Date().toLocaleDateString()}.`
  };
}

function computeMissingFields(tenders: Tender[]): Record<string, number> {
  const missing: Record<string, number> = {};
  for (const t of tenders) {
    if (!t.tenderAmount) missing['tenderAmount'] = (missing['tenderAmount'] || 0) + 1;
    if (!t.emd) missing['emd'] = (missing['emd'] || 0) + 1;
    if (!t.lastDate) missing['lastDate'] = (missing['lastDate'] || 0) + 1;
    if (!t.district || t.district === 'Not specified in source') missing['district'] = (missing['district'] || 0) + 1;
    if (t.tenderId === 'PENDING-IMPORT') missing['tenderId'] = (missing['tenderId'] || 0) + 1;
  }
  return missing;
}

function cleanText(str: string): string {
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractAllDates(text: string): { publishedDate: string; closingDate: string; openingDate: string } {
  const patterns = [
    /(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}\s*[AP]M)/g,
    /(\d{2}-\w{3}-\d{4})/g,
    /(\d{4}-\d{2}-\d{2})/g,
    /(\d{2}\/\d{2}\/\d{4})/g,
  ];
  
  const matches: string[] = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const found = text.match(pattern);
    if (found) {
      for (const m of found) {
        const n = normalizeDate(m);
        if (n && !matches.includes(n)) matches.push(n);
      }
      if (matches.length >= 3) break;
    }
  }
  
  return { publishedDate: matches[0] || '', closingDate: matches[1] || '', openingDate: matches[2] || '' };
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const months: Record<string, string> = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
      'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
      'January': '01', 'February': '02', 'March': '03', 'April': '04',
      'June': '06', 'July': '07', 'August': '08', 'September': '09',
      'October': '10', 'November': '11', 'December': '12'
    };
    
    let match = dateStr.match(/(\d{1,2})[-\s](\w{3,})[-\s](\d{4})/);
    if (match) {
      const monthKey = match[2].charAt(0).toUpperCase() + match[2].substring(1, 3).toLowerCase();
      const month = months[monthKey] || months[match[2]] || '01';
      return `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
    }
    
    match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[0];
    
    match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    
    match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  } catch {}
  return dateStr;
}

function extractOrgChainFromText(text: string): string {
  const patterns = [
    /(Engineer-in-Chief[^|\n]*)/i,
    /(Executive Engineer[^|\n]*)/i,
    /(Madhya Pradesh[^|\n]*(?:Vidyut|PWD|Water|Department)[^|\n]*)/i,
    /([A-Z][^|\n]*(?:Department|Division|Circle|Corporation)[^|\n]*)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return cleanText(m[1] || m[0]).substring(0, 200);
  }
  return '';
}

function extractDepartmentFromOrg(orgChain: string): string {
  if (!orgChain) return '';
  // Take the first segment before ||
  const first = orgChain.split('||')[0].trim();
  return extractDepartmentFromText(first) || cleanText(first).substring(0, 100);
}

function extractDistrictFromOrg(orgChain: string): string {
  return extractDistrictFromText(orgChain);
}

function extractDistrictFromText(text: string): string {
  if (!text) return '';
  const mpDistricts = [
    'Agar Malwa', 'Alirajpur', 'Anuppur', 'Ashoknagar', 'Balaghat', 'Barwani',
    'Betul', 'Bhind', 'Bhopal', 'Burhanpur', 'Chhatarpur', 'Chhindwara',
    'Damoh', 'Datia', 'Dewas', 'Dhar', 'Dindori', 'Guna', 'Gwalior',
    'Harda', 'Hoshangabad', 'Indore', 'Jabalpur', 'Jhabua', 'Katni',
    'Khandwa', 'Khargone', 'Mandla', 'Mandsaur', 'Morena', 'Narsinghpur',
    'Neemuch', 'Panna', 'Raisen', 'Rajgarh', 'Ratlam', 'Rewa', 'Sagar',
    'Satna', 'Sehore', 'Seoni', 'Shahdol', 'Shajapur', 'Sheopur', 'Shivpuri',
    'Sidhi', 'Singrauli', 'Tikamgarh', 'Ujjain', 'Umaria', 'Vidisha'
  ];
  for (const d of mpDistricts) {
    if (text.toUpperCase().includes(d.toUpperCase())) return d;
  }
  return '';
}

function extractDepartmentFromText(text: string): string {
  if (!text) return '';
  const keywords = [
    'Water Resources Department', 'Public Health Engineering', 'PWD',
    'Madhya Pradesh Paschim Kshetra Vidyut Vitran', 'Madhya Pradesh Madhya Kshetra Vidyut Vitran',
    'Madhya Pradesh Poorv Kshetra Vidyut Vitran', 'MP Power Transmission', 'MP Power Generation',
    'Urban Administration', 'Rural Development', 'Education Department', 'Health Department',
    'Forest Department', 'Agriculture Department', 'Irrigation Department', 'Energy Department',
    'Transport Department', 'Directorate of Technical Education', 'Government Polytechnic',
  ];
  for (const k of keywords) {
    if (text.includes(k)) return k;
  }
  const m = text.match(/([A-Z][^|\n]*(?:Department|Division|Board|Corporation|Directorate)[^|\n]*)/i);
  if (m) return cleanText(m[1]).substring(0, 100);
  return '';
}

// ============ AI-ASSISTED EXTRACTION ============

export interface AIProviderConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'custom';
  apiUrl: string;
  apiKey: string;
  model: string;
}

export function isAIConfigured(): boolean {
  try {
    const config = localStorage.getItem('ai_provider_config');
    if (config) {
      const parsed = JSON.parse(config);
      return parsed.enabled === true && parsed.apiUrl && parsed.apiKey;
    }
  } catch {}
  return false;
}

export function getAIConfig(): AIProviderConfig | null {
  try {
    const config = localStorage.getItem('ai_provider_config');
    if (config) return JSON.parse(config);
  } catch {}
  return null;
}

export function saveAIConfig(config: AIProviderConfig): void {
  localStorage.setItem('ai_provider_config', JSON.stringify(config));
}

export async function extractTendersWithAI(content: string, config?: AIProviderConfig): Promise<{ tenders: Tender[]; stats: ImportStats } | null> {
  const aiConfig = config || getAIConfig();
  if (!aiConfig?.enabled || !aiConfig.apiUrl || !aiConfig.apiKey) return null;

  const stats: ImportStats = {
    totalRows: 0, candidatesDetected: 0, parsed: 0, rejected: 0,
    needsReview: 0, duplicates: 0, missingFields: {}, aiUsed: true,
    aiProvider: aiConfig.provider, pagesVisited: 1, detailPagesVisited: 0, detailPagesSuccess: 0
  };

  try {
    const systemPrompt = `Extract all tender records from the text. Return a JSON array. Each object needs: title, tenderId, referenceNumber, department, district, publishDate (YYYY-MM-DD), closingDate (YYYY-MM-DD), tenderValue, sourceUrl. Use null for missing fields. NEVER fabricate data.`;
    const userPrompt = `Extract tenders:\n\n${content.substring(0, 8000)}`;

    let response: Response;
    if (aiConfig.provider === 'openai') {
      response = await fetch(aiConfig.apiUrl || 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.apiKey}` },
        body: JSON.stringify({ model: aiConfig.model || 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.1, response_format: { type: 'json_object' } }),
        signal: AbortSignal.timeout(30000)
      });
    } else {
      response = await fetch(aiConfig.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.apiKey}` },
        body: JSON.stringify({ content: content.substring(0, 8000), systemPrompt }),
        signal: AbortSignal.timeout(30000)
      });
    }

    if (!response.ok) return null;
    const data = await response.json();
    
    let aiTenders: any[] = [];
    if (data.choices?.[0]?.message?.content) {
      const jsonMatch = data.choices[0].message.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) aiTenders = JSON.parse(jsonMatch[0]);
    } else if (data.tenders) aiTenders = data.tenders;
    else if (Array.isArray(data)) aiTenders = data;

    const tenders: Tender[] = [];
    stats.candidatesDetected = aiTenders.length;
    
    for (const item of aiTenders) {
      if (!item?.title) { stats.rejected++; continue; }
      stats.totalRows++;
      tenders.push({
        id: uuidv4(), tenderId: item.tenderId || 'PENDING-IMPORT', workName: item.title,
        department: item.department || '', district: item.district || '',
        tenderAmount: item.tenderValue || '', emd: item.emd || '',
        lastDate: normalizeDate(item.closingDate || ''), officialUrl: item.sourceUrl || BASE_URL,
        dataSource: 'imported', textCopied: false, bannerCopied: false, manuallyPublished: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        publishedDate: normalizeDate(item.publishDate || ''), notes: `AI-extracted (${aiConfig.provider}).`
      });
      stats.parsed++;
    }

    return { tenders, stats };
  } catch (e) {
    console.error('AI extraction error:', e);
    return null;
  }
}

/**
 * Hybrid extraction: deterministic first, AI fallback.
 */
export async function extractTendersHybrid(content: string): Promise<{
  tenders: Tender[]; stats: ImportStats; method: 'deterministic' | 'ai' | 'hybrid'; warning?: string;
}> {
  const detResult = parsePastedContent(content);
  const aiAvailable = isAIConfigured();
  
  if (aiAvailable && detResult.stats.candidatesDetected < 5) {
    const aiResult = await extractTendersWithAI(content);
    if (aiResult && aiResult.tenders.length > detResult.tenders.length) {
      return { tenders: aiResult.tenders, stats: aiResult.stats, method: 'ai',
        warning: `AI found ${aiResult.stats.candidatesDetected} tenders vs ${detResult.stats.candidatesDetected} from deterministic parsing.` };
    }
  }
  
  let warning: string | undefined;
  const estimated = estimateTenderCount(content);
  if (estimated > detResult.stats.candidatesDetected + 2) {
    warning = `⚠️ Input appears to contain ~${estimated} tender records, but only ${detResult.stats.candidatesDetected} were detected.`;
  }
  
  return { tenders: detResult.tenders, stats: detResult.stats, method: 'deterministic', warning };
}

function estimateTenderCount(text: string): number {
  let count = 0;
  const patterns = [/\b\d{4}_\w+_\d+_\d+\b/g, /\[\w+\]\[\w+\]/g, /\b\d{4}[-\/]\w+[-\/]\d+\b/g];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m.length > count) count = m.length;
  }
  const links = text.match(/mptenders\.gov\.in[^"'\s]*/g);
  if (links && links.length > count) count = links.length;
  const numbered = text.match(/^\s*\d+[\.\)]\s+/gm);
  if (numbered && numbered.length > count) count = numbered.length;
  return count;
}
