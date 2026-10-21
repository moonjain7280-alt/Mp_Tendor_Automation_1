import { Tender } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * MP Tender Data Import Service - AI-Assisted Extraction
 * 
 * Hybrid approach:
 * 1. Deterministic HTML/text parsing for structured content
 * 2. AI language model fallback for irregularly formatted text
 * 3. Import preview with editing before saving
 * 
 * LIMITATION DOCUMENTATION:
 * The official MP e-Procurement portal (mptenders.gov.in) uses:
 * - Session-based Tapestry framework (NIC GEP)
 * - CAPTCHA for search operations
 * - Dynamic session tokens in URLs
 * - CORS restrictions that prevent browser-based direct access
 */

// CORS proxies to try (in order of preference)
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
];

const BASE_URL = 'https://mptenders.gov.in';
const TENDERS_BY_DATE_URL = `${BASE_URL}/nicgep/app?page=FrontEndListTendersbyDate&service=page`;

export interface ImportResult {
  success: boolean;
  tenders: Tender[];
  message: string;
  source: 'cors_proxy' | 'html_paste' | 'text_import' | 'csv_import' | 'ai_assisted';
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
}

export interface CandidateTender {
  id: string;
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
  organisationChain: string;
  eligibility: string;
  tenderFee: string;
  originalSourceText: string;
  confidence: 'high' | 'medium' | 'low';
  needsReview: boolean;
  reviewReason?: string;
}

/**
 * Attempt to fetch live tenders via CORS proxy.
 */
export async function fetchLiveTenders(): Promise<ImportResult> {
  const timestamp = new Date().toISOString();
  
  for (const proxy of CORS_PROXIES) {
    try {
      const url = `${proxy}${encodeURIComponent(TENDERS_BY_DATE_URL)}`;
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(15000) 
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      const result = parsePastedContent(html);
      
      if (result.tenders.length > 0) {
        return {
          success: true,
          ...result,
          message: `Successfully fetched ${result.tenders.length} real tenders from official portal via proxy.`,
          source: 'cors_proxy',
          timestamp
        };
      }
    } catch (e) {
      console.warn(`Proxy ${proxy} failed:`, e);
      continue;
    }
  }

  return {
    success: false,
    tenders: [],
    message: 'Could not access the official portal directly. The government website blocks automated requests from browsers. Please use the "Import from HTML" option: Go to mptenders.gov.in → Tenders by Closing Date → Copy the page content → Paste it in the import box.',
    source: 'cors_proxy',
    timestamp
  };
}

/**
 * Parse pasted HTML/text from the user.
 * Uses a multi-strategy approach:
 * 1. HTML DOM parsing (most reliable for actual HTML)
 * 2. HTML regex parsing (for malformed HTML)
 * 3. Structured text parsing (key-value pairs)
 * 4. Block-based text parsing (for copy-pasted content)
 * 5. AI-assisted fallback (if configured)
 */
export function parsePastedContent(content: string): { tenders: Tender[]; stats: ImportStats } {
  const emptyStats: ImportStats = {
    totalRows: 0,
    candidatesDetected: 0,
    parsed: 0,
    rejected: 0,
    needsReview: 0,
    duplicates: 0,
    missingFields: {},
    aiUsed: false
  };

  if (!content || !content.trim()) {
    return { tenders: [], stats: emptyStats };
  }

  // Strategy 1: HTML DOM parsing
  let result = parseHTMLWithDOM(content);
  if (result.stats.candidatesDetected >= 3) return result;

  // Strategy 2: HTML regex parsing
  result = parseHTMLWithRegex(content);
  if (result.stats.candidatesDetected >= 3) return result;

  // Strategy 3: Structured text parsing (key-value format)
  result = parseStructuredText(content);
  if (result.stats.candidatesDetected >= 3) return result;

  // Strategy 4: Block-based text parsing (flexible)
  result = parseBlockText(content);
  if (result.stats.candidatesDetected >= 1) return result;

  // Strategy 5: Aggressive line-by-line parsing
  result = parseAggressiveText(content);
  
  return result;
}

/**
 * Parse HTML using DOMParser - most reliable method.
 */
function parseHTMLWithDOM(html: string): { tenders: Tender[]; stats: ImportStats } {
  const tenders: Tender[] = [];
  const stats: ImportStats = {
    totalRows: 0,
    candidatesDetected: 0,
    parsed: 0,
    rejected: 0,
    needsReview: 0,
    duplicates: 0,
    missingFields: {},
    aiUsed: false
  };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find all tables
    const tables = doc.querySelectorAll('table');
    
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      
      for (const row of rows) {
        stats.totalRows++;
        const cells = row.querySelectorAll('td');
        
        // Skip header rows or rows with too few cells
        if (cells.length < 3) continue;
        
        // Look for tender links in any cell
        const links = row.querySelectorAll('a[href*="mptenders.gov.in"]');
        
        if (links.length > 0) {
          stats.candidatesDetected++;
          const tender = extractTenderFromRow(row, cells, links);
          if (tender) {
            tenders.push(tender);
            stats.parsed++;
            
            // Track missing fields
            if (!tender.tenderAmount) stats.missingFields['tenderAmount'] = (stats.missingFields['tenderAmount'] || 0) + 1;
            if (!tender.emd) stats.missingFields['emd'] = (stats.missingFields['emd'] || 0) + 1;
            if (!tender.lastDate) stats.missingFields['lastDate'] = (stats.missingFields['lastDate'] || 0) + 1;
            if (!tender.district || tender.district === 'Not specified in source') stats.missingFields['district'] = (stats.missingFields['district'] || 0) + 1;
          } else {
            stats.rejected++;
          }
        }
      }
    }
    
    // If no tables found, try parsing the entire document for tender patterns
    if (tenders.length === 0) {
      const allLinks = doc.querySelectorAll('a[href*="component=%24DirectLink"], a[href*="mptenders.gov.in"]');
      for (const link of allLinks) {
        const title = link.textContent?.trim();
        const url = link.getAttribute('href');
        
        if (title && title.length > 10 && url) {
          stats.candidatesDetected++;
          // Look for reference numbers near this link
          const parent = link.parentElement;
          const parentText = parent?.textContent || '';
          const refMatch = parentText.match(/\[([^\]]+)\]\[([^\]]+)\]/);
          
          tenders.push({
            id: uuidv4(),
            tenderId: refMatch ? refMatch[2] : 'PENDING-IMPORT',
            workName: title,
            department: extractDepartmentFromText(parentText),
            district: extractDistrictFromText(parentText) || 'Not specified in source',
            tenderAmount: '',
            emd: '',
            lastDate: extractDateFromText(parentText),
            officialUrl: url.startsWith('http') ? url : BASE_URL + url,
            dataSource: 'imported',
            textCopied: false,
            bannerCopied: false,
            manuallyPublished: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            eligibility: '',
            tenderFee: '',
            publishedDate: '',
            bidOpeningDate: '',
            organisationChain: extractOrgChainFromText(parentText),
            notes: `Imported from pasted HTML on ${new Date().toLocaleDateString()}.`
          });
          stats.parsed++;
        }
      }
    }
  } catch (e) {
    console.error('DOM parsing failed:', e);
  }

  return { tenders, stats };
}

/**
 * Extract tender data from a table row.
 */
function extractTenderFromRow(row: Element, cells: NodeListOf<Element>, links: NodeListOf<Element>): Tender | null {
  const titleLink = links[0];
  const title = titleLink.textContent?.trim() || '';
  const url = titleLink.getAttribute('href') || '';
  
  if (title.length < 10) return null;
  
  const rowText = row.textContent || '';
  
  // Extract reference numbers [RefNo][TenderID]
  const refMatch = rowText.match(/\[([^\]]+)\]\[([^\]]+)\]/);
  const tenderRef = refMatch ? refMatch[1] : '';
  const tenderId = refMatch ? refMatch[2] : '';
  
  // Extract dates
  const dates = extractAllDates(rowText);
  
  // Extract organisation chain
  const orgChain = extractOrgChainFromText(rowText);
  
  return {
    id: uuidv4(),
    tenderId: tenderId || tenderRef || 'PENDING-IMPORT',
    workName: title,
    department: extractDepartmentFromText(rowText) || orgChain || 'Not specified in source',
    district: extractDistrictFromText(rowText) || 'Not specified in source',
    tenderAmount: extractTenderValue(rowText),
    emd: extractEMD(rowText),
    lastDate: dates.closingDate || '',
    officialUrl: url.startsWith('http') ? url : BASE_URL + url,
    dataSource: 'imported',
    textCopied: false,
    bannerCopied: false,
    manuallyPublished: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    eligibility: '',
    tenderFee: extractTenderFee(rowText),
    publishedDate: dates.publishedDate || '',
    bidOpeningDate: dates.openingDate || '',
    organisationChain: orgChain,
    notes: `Imported from official portal listing on ${new Date().toLocaleDateString()}.`
  };
}

/**
 * Parse HTML using regex - fallback method.
 */
function parseHTMLWithRegex(html: string): { tenders: Tender[]; stats: ImportStats } {
  const tenders: Tender[] = [];
  const stats: ImportStats = {
    totalRows: 0,
    candidatesDetected: 0,
    parsed: 0,
    rejected: 0,
    needsReview: 0,
    duplicates: 0,
    missingFields: {},
    aiUsed: false
  };

  // Split by table rows or by tender-like blocks
  const rows = html.split(/<tr[^>]*>/i);
  
  for (const row of rows) {
    stats.totalRows++;
    
    // Look for tender links - more flexible pattern
    const linkPatterns = [
      /<a[^>]+href="([^"]*component=%24DirectLink[^"]*)"[^>]*>([^<]+)<\/a>/i,
      /<a[^>]+href="([^"]*mptenders\.gov\.in[^"]*)"[^>]*>([^<]{10,})<\/a>/i,
      /\[([^\]]{10,})\]\((https?:\/\/mptenders\.gov\.in[^)]+)\s*(?:"[^"]*")?\)/,
    ];
    
    let title = '';
    let url = '';
    
    for (const pattern of linkPatterns) {
      const match = row.match(pattern);
      if (match) {
        if (pattern.source.includes('\\\\]\\\\(')) {
          title = cleanHTML(match[1]);
          url = match[2];
        } else {
          url = match[1];
          title = cleanHTML(match[2]);
        }
        break;
      }
    }
    
    if (title && title.length > 10) {
      stats.candidatesDetected++;
      // Extract reference numbers
      const refMatch = row.match(/\[([^\]]+)\]\[([^\]]+)\]/);
      const tenderRef = refMatch ? cleanHTML(refMatch[1]) : '';
      const tenderId = refMatch ? cleanHTML(refMatch[2]) : '';
      
      // Extract dates
      const dates = extractAllDates(row);
      
      // Extract organisation
      const orgChain = extractOrgChainFromText(row);
      
      tenders.push({
        id: uuidv4(),
        tenderId: tenderId || tenderRef || 'PENDING-IMPORT',
        workName: title,
        department: extractDepartmentFromText(row) || orgChain || 'Not specified in source',
        district: extractDistrictFromText(row) || 'Not specified in source',
        tenderAmount: extractTenderValue(row),
        emd: extractEMD(row),
        lastDate: dates.closingDate || '',
        officialUrl: url || BASE_URL,
        dataSource: 'imported',
        textCopied: false,
        bannerCopied: false,
        manuallyPublished: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eligibility: '',
        tenderFee: extractTenderFee(row),
        publishedDate: dates.publishedDate || '',
        bidOpeningDate: dates.openingDate || '',
        organisationChain: orgChain,
        notes: `Imported from official portal listing on ${new Date().toLocaleDateString()}.`
      });
      stats.parsed++;
    }
  }

  return { tenders, stats };
}

/**
 * Parse structured text with key-value pairs.
 * Handles formats like:
 *   Tender ID: 12345
 *   Title: Construction work
 *   Department: PWD
 *   Closing Date: 22-Oct-2026
 */
function parseStructuredText(text: string): { tenders: Tender[]; stats: ImportStats } {
  const tenders: Tender[] = [];
  const stats: ImportStats = {
    totalRows: 0,
    candidatesDetected: 0,
    parsed: 0,
    rejected: 0,
    needsReview: 0,
    duplicates: 0,
    missingFields: {},
    aiUsed: false
  };

  // Detect if this looks like structured key-value format
  const kvPattern = /(Tender\s*(?:ID|Reference|Value|Title)|NIT\s*Number|Reference\s*Number|Organisation|Department|Closing\s*Date|Title|District|Location|Tender\s*Value)/i;
  
  if (!kvPattern.test(text)) {
    return { tenders, stats };
  }

  // Split into blocks by double newlines or by repeated key patterns
  const blocks = splitIntoTenderBlocks(text);
  
  for (const block of blocks) {
    stats.totalRows++;
    const candidate = extractFromKeyValueBlock(block);
    
    if (candidate && candidate.workName && candidate.workName.length > 5) {
      stats.candidatesDetected++;
      const tender = candidateToTender(candidate);
      tenders.push(tender);
      stats.parsed++;
      
      if (candidate.needsReview) {
        stats.needsReview++;
      }
    }
  }

  return { tenders, stats };
}

/**
 * Parse block-based text - handles copy-pasted content with various formats.
 * This is the most flexible parser for real-world tender text.
 */
function parseBlockText(text: string): { tenders: Tender[]; stats: ImportStats } {
  const tenders: Tender[] = [];
  const stats: ImportStats = {
    totalRows: 0,
    candidatesDetected: 0,
    parsed: 0,
    rejected: 0,
    needsReview: 0,
    duplicates: 0,
    missingFields: {},
    aiUsed: false
  };

  const blocks = splitIntoTenderBlocks(text);
  
  for (const block of blocks) {
    stats.totalRows++;
    const candidate = extractFromBlock(block);
    
    if (candidate && candidate.workName && candidate.workName.length > 5) {
      stats.candidatesDetected++;
      const tender = candidateToTender(candidate);
      tenders.push(tender);
      stats.parsed++;
      
      if (candidate.needsReview) {
        stats.needsReview++;
      }
      
      // Track missing fields
      if (!tender.tenderAmount) stats.missingFields['tenderAmount'] = (stats.missingFields['tenderAmount'] || 0) + 1;
      if (!tender.lastDate) stats.missingFields['lastDate'] = (stats.missingFields['lastDate'] || 0) + 1;
      if (!tender.district || tender.district === 'Not specified in source') stats.missingFields['district'] = (stats.missingFields['district'] || 0) + 1;
    }
  }

  return { tenders, stats };
}

/**
 * Aggressive text parsing - last resort for very irregular formats.
 */
function parseAggressiveText(text: string): { tenders: Tender[]; stats: ImportStats } {
  const tenders: Tender[] = [];
  const stats: ImportStats = {
    totalRows: 0,
    candidatesDetected: 0,
    parsed: 0,
    rejected: 0,
    needsReview: 0,
    duplicates: 0,
    missingFields: {},
    aiUsed: false
  };

  const lines = text.split('\n').filter(l => l.trim());
  
  // Look for tender ID patterns as anchors
  const tenderIdPatterns = [
    /\b(\d{4}_\w+_\d+_\d+)\b/g,           // 2026_WRD_517082_1
    /\b(\d{4}[-\/]\d+[-\/]\d+)\b/g,        // 2026-27/TS-2698/3447
    /\b(NIT[_\/-]\w+)\b/gi,                 // NIT_Bhopal_01/2026
    /\b(Tender\s*(?:ID|Ref|No)[.:]?\s*\d+)\b/gi,
  ];

  // Find all tender ID occurrences
  const idLocations: { lineIndex: number; id: string }[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of tenderIdPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(lines[i]);
      if (match) {
        idLocations.push({ lineIndex: i, id: match[1] });
      }
    }
  }

  // If we found tender IDs, use them as block anchors
  if (idLocations.length > 0) {
    for (const loc of idLocations) {
      stats.totalRows++;
      // Gather surrounding context (3 lines before and 5 after)
      const start = Math.max(0, loc.lineIndex - 3);
      const end = Math.min(lines.length, loc.lineIndex + 6);
      const block = lines.slice(start, end).join('\n');
      
      const candidate = extractFromBlock(block);
      if (candidate) {
        // Override tender ID with the one we found
        if (!candidate.tenderId || candidate.tenderId === 'PENDING-IMPORT') {
          candidate.tenderId = loc.id;
        }
        stats.candidatesDetected++;
        const tender = candidateToTender(candidate);
        tenders.push(tender);
        stats.parsed++;
        if (candidate.needsReview) stats.needsReview++;
      }
    }
  }

  // If no IDs found, try to detect blocks by long text lines (likely titles)
  if (tenders.length === 0) {
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      stats.totalRows++;
      
      // A line that's long enough to be a title and not a date/reference
      if (line.length > 30 && !isDateOrReferenceLine(line)) {
        stats.candidatesDetected++;
        // Gather context
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 8);
        const block = lines.slice(start, end).join('\n');
        
        const candidate = extractFromBlock(block);
        if (candidate) {
          const tender = candidateToTender(candidate);
          tenders.push(tender);
          stats.parsed++;
          if (candidate.needsReview) stats.needsReview++;
          // Skip past this block
          i = end;
          continue;
        }
      }
      i++;
    }
  }

  return { tenders, stats };
}

/**
 * Split text into blocks that likely represent individual tenders.
 * Uses multiple heuristics to find block boundaries.
 */
function splitIntoTenderBlocks(text: string): string[] {
  const blocks: string[] = [];
  
  // Strategy 1: Split by double newlines (common in copy-paste)
  const doubleNewlineBlocks = text.split(/\n\s*\n/).filter(b => b.trim().length > 20);
  
  // Strategy 2: Split by numbered items (1. 2. 3. etc.)
  const numberedBlocks = text.split(/\n\s*(?:\d+[\.\)]\s+)/).filter(b => b.trim().length > 20);
  
  // Strategy 3: Split by reference number patterns [xxx][xxx]
  const refBlocks = text.split(/(?=\[[^\]]{5,}\]\[[^\]]{5,}\])/).filter(b => b.trim().length > 20);
  
  // Strategy 4: Split by "Tender ID" or similar headers
  const headerBlocks = text.split(/(?=(?:Tender\s*ID|Reference\s*Number|NIT\s*Number|S\.?No)[.:])/i).filter(b => b.trim().length > 20);

  // Strategy 5: Split by horizontal rules or separator lines
  const separatorBlocks = text.split(/(?:---+|===+|\*{3,}|_{3,})/).filter(b => b.trim().length > 20);
  
  // Choose the strategy that gives the most blocks (likely the correct one)
  const strategies = [
    doubleNewlineBlocks,
    numberedBlocks,
    refBlocks,
    headerBlocks,
    separatorBlocks
  ];
  
  // Find the strategy that produces the most blocks with content
  let bestBlocks = doubleNewlineBlocks;
  let bestScore = 0;
  
  for (const strategy of strategies) {
    const score = strategy.length;
    if (score > bestScore) {
      bestScore = score;
      bestBlocks = strategy;
    }
  }
  
  // If we only got 1 block, try splitting by single newlines with context
  if (bestBlocks.length <= 1 && text.includes('\n')) {
    return splitByLinePatterns(text);
  }
  
  return bestBlocks;
}

/**
 * Split text by line patterns when block splitting fails.
 */
function splitByLinePatterns(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let currentBlock: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check if this line starts a new tender
    const isNewTenderStart = 
      trimmed.match(/^\d+[\.\)]\s+/) ||
      trimmed.match(/^Tender\s*(?:ID|Ref)/i) ||
      trimmed.match(/^NIT\s*Number/i) ||
      trimmed.match(/^Reference\s*Number/i) ||
      trimmed.match(/^\[.+\]\[.+\]$/) ||
      (trimmed.match(/\b\d{4}_\w+_\d+_\d+\b/) && currentBlock.length > 0);
    
    if (isNewTenderStart && currentBlock.length > 0) {
      blocks.push(currentBlock.join('\n'));
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }
  
  return blocks.filter(b => b.trim().length > 15);
}

/**
 * Extract tender data from a key-value block.
 */
function extractFromKeyValueBlock(block: string): CandidateTender | null {
  const lines = block.split('\n').map(l => l.trim()).filter(l => l);
  const fullText = block;
  
  const candidate: CandidateTender = {
    id: uuidv4(),
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
    organisationChain: '',
    eligibility: '',
    tenderFee: '',
    originalSourceText: block.substring(0, 500),
    confidence: 'medium',
    needsReview: false
  };

  for (const line of lines) {
    // Key-value extraction
    const kvMatch = line.match(/^(.+?)[\s:：]+(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim().toLowerCase();
      const value = kvMatch[2].trim();
      
      if (key.match(/tender\s*id|tender\s*identifier/)) {
        candidate.tenderId = value;
      } else if (key.match(/reference|ref\s*no|nit\s*number|nit\s*no/)) {
        candidate.referenceNumber = value;
      } else if (key.match(/title|work\s*name|subject|description/)) {
        candidate.workName = value;
      } else if (key.match(/department|organisation|org/)) {
        candidate.department = value;
      } else if (key.match(/district|location|place|city/)) {
        candidate.district = value;
      } else if (key.match(/closing\s*date|bid\s*submission|deadline|last\s*date/)) {
        candidate.lastDate = normalizeDate(value);
      } else if (key.match(/publish|issued|notification\s*date/)) {
        candidate.publishedDate = normalizeDate(value);
      } else if (key.match(/opening|bid\s*opening/)) {
        candidate.bidOpeningDate = normalizeDate(value);
      } else if (key.match(/tender\s*value|estimated\s*value|amount|cost/)) {
        candidate.tenderAmount = value;
      } else if (key.match(/emd|earnest\s*money|security\s*deposit/)) {
        candidate.emd = value;
      } else if (key.match(/eligib/)) {
        candidate.eligibility = value;
      } else if (key.match(/fee|document\s*fee/)) {
        candidate.tenderFee = value;
      } else if (key.match(/url|link|source/)) {
        candidate.officialUrl = value;
      }
    }
  }

  // Fallback: extract from full text
  if (!candidate.tenderId) {
    const idMatch = fullText.match(/\b(\d{4}_\w+_\d+_\d+)\b/) || fullText.match(/\b(\d{4}[-\/]\w+[-\/]\d+)\b/);
    if (idMatch) candidate.tenderId = idMatch[1];
  }
  if (!candidate.workName) {
    // Use the longest non-date, non-reference line as title
    const titleLine = lines.find(l => l.length > 20 && !isDateOrReferenceLine(l) && !l.match(/^[\[\d]/));
    if (titleLine) candidate.workName = titleLine;
  }
  if (!candidate.department) {
    candidate.department = extractDepartmentFromText(fullText);
  }
  if (!candidate.district) {
    candidate.district = extractDistrictFromText(fullText);
  }
  if (!candidate.lastDate) {
    const dates = extractAllDates(fullText);
    candidate.lastDate = dates.closingDate;
  }

  // Determine confidence
  if (candidate.workName && candidate.tenderId) {
    candidate.confidence = 'high';
  } else if (candidate.workName) {
    candidate.confidence = 'medium';
    candidate.needsReview = true;
    candidate.reviewReason = 'Missing Tender ID';
  } else {
    candidate.confidence = 'low';
    candidate.needsReview = true;
    candidate.reviewReason = 'Missing title';
  }

  if (!candidate.tenderId && !candidate.referenceNumber) {
    candidate.tenderId = 'PENDING-IMPORT';
    candidate.needsReview = true;
    candidate.reviewReason = (candidate.reviewReason || '') + ' No ID found';
  }

  return candidate;
}

/**
 * Extract tender data from a generic text block.
 * This is the most flexible extraction method.
 */
function extractFromBlock(block: string): CandidateTender | null {
  const lines = block.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length === 0) return null;
  
  const fullText = block;
  
  const candidate: CandidateTender = {
    id: uuidv4(),
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
    organisationChain: '',
    eligibility: '',
    tenderFee: '',
    originalSourceText: block.substring(0, 500),
    confidence: 'medium',
    needsReview: false
  };

  // Extract reference numbers [RefNo][TenderID]
  const refMatch = fullText.match(/\[([^\]]+)\]\[([^\]]+)\]/);
  if (refMatch) {
    candidate.referenceNumber = refMatch[1];
    candidate.tenderId = refMatch[2];
  }

  // Extract standalone tender IDs
  if (!candidate.tenderId) {
    const idPatterns = [
      /\b(\d{4}_\w+_\d+_\d+)\b/,           // 2026_WRD_517082_1
      /\b(\d{4}[-\/]\w+[-\/]\d+[-\/]?\d*)\b/, // 2026-27/TS-2698/3447
      /\b(NIT[_\/-][\w\/-]+)\b/i,           // NIT_Bhopal_01/2026
    ];
    for (const pattern of idPatterns) {
      const m = fullText.match(pattern);
      if (m) {
        candidate.tenderId = m[1];
        break;
      }
    }
  }

  // Extract dates
  const dates = extractAllDates(fullText);
  candidate.publishedDate = dates.publishedDate;
  candidate.lastDate = dates.closingDate;
  candidate.bidOpeningDate = dates.openingDate;

  // Extract URL
  const urlMatch = fullText.match(/https?:\/\/[^\s<>"']+/);
  if (urlMatch) candidate.officialUrl = urlMatch[0];

  // Extract organisation chain
  candidate.organisationChain = extractOrgChainFromText(fullText);
  candidate.department = extractDepartmentFromText(fullText) || candidate.organisationChain;
  candidate.district = extractDistrictFromText(fullText);

  // Extract tender value
  candidate.tenderAmount = extractTenderValue(fullText);
  candidate.emd = extractEMD(fullText);
  candidate.tenderFee = extractTenderFee(fullText);

  // Extract title - try multiple strategies
  candidate.workName = extractTitleFromBlock(lines, fullText);

  // Determine confidence and review status
  if (candidate.workName && candidate.tenderId && candidate.lastDate) {
    candidate.confidence = 'high';
  } else if (candidate.workName && (candidate.tenderId || candidate.lastDate)) {
    candidate.confidence = 'medium';
    candidate.needsReview = true;
    candidate.reviewReason = !candidate.tenderId ? 'Missing Tender ID' : 'Missing closing date';
  } else if (candidate.workName) {
    candidate.confidence = 'low';
    candidate.needsReview = true;
    candidate.reviewReason = 'Missing Tender ID and dates';
  } else {
    return null; // No title found, not a valid tender
  }

  if (!candidate.tenderId && !candidate.referenceNumber) {
    candidate.tenderId = 'PENDING-IMPORT';
  }

  return candidate;
}

/**
 * Extract title from a block of text using multiple strategies.
 */
function extractTitleFromBlock(lines: string[], fullText: string): string {
  // Strategy 1: Look for a line that's clearly a title (long, not a date/ref)
  for (const line of lines) {
    if (line.length > 20 && !isDateOrReferenceLine(line) && !line.match(/^[\[\d]/) && !line.match(/^(Tender|Reference|NIT|Closing|Opening|Publish|Department|Organisation|District|Location|EMD|Value)/i)) {
      return cleanHTML(line);
    }
  }
  
  // Strategy 2: Look for text between markers
  const titleMatch = fullText.match(/(?:Title|Work|Subject|Description)[\s:：]+(.+?)(?:\n|$)/i);
  if (titleMatch) return cleanHTML(titleMatch[1]);
  
  // Strategy 3: Find the longest line that's not metadata
  let bestLine = '';
  for (const line of lines) {
    if (line.length > bestLine.length && !isDateOrReferenceLine(line) && !line.match(/^[\[\d\s:]/) && line.length > 15) {
      bestLine = line;
    }
  }
  
  return cleanHTML(bestLine);
}

/**
 * Check if a line is a date or reference number line (not a title).
 */
function isDateOrReferenceLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 5) return true;
  
  // Pure date lines
  if (/^\d{2}[-\/]\w{3}[-\/]\d{4}/.test(trimmed)) return true;
  if (/^\d{4}[-\/]\d{2}[-\/]\d{2}/.test(trimmed)) return true;
  if (/^\d{2}[-\/]\d{2}[-\/]\d{4}/.test(trimmed)) return true;
  
  // Reference number patterns
  if (/^\[.+\]\[.+\]$/.test(trimmed)) return true;
  if (/^\d+[\.\)]\s*$/.test(trimmed)) return true;
  
  // Key-value metadata lines
  if (/^(Tender\s*ID|Reference|NIT|Closing|Opening|Publish|Department|Organisation|District|Location|EMD|Value|Amount|Fee|Eligib|URL|Link|Source|S\.?No)[\s:：]/i.test(trimmed)) return true;
  
  // Short lines that are likely labels
  if (trimmed.length < 10 && !trimmed.includes(' ')) return true;
  
  return false;
}

/**
 * Convert a CandidateTender to the app's Tender type.
 */
function candidateToTender(candidate: CandidateTender): Tender {
  return {
    id: candidate.id,
    tenderId: candidate.tenderId || candidate.referenceNumber || 'PENDING-IMPORT',
    workName: candidate.workName || 'Unknown Tender',
    department: candidate.department || 'Not specified in source',
    district: candidate.district || 'Not specified in source',
    tenderAmount: candidate.tenderAmount || '',
    emd: candidate.emd || '',
    lastDate: candidate.lastDate || '',
    officialUrl: candidate.officialUrl || BASE_URL,
    dataSource: 'imported',
    textCopied: false,
    bannerCopied: false,
    manuallyPublished: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    eligibility: candidate.eligibility || '',
    tenderFee: candidate.tenderFee || '',
    publishedDate: candidate.publishedDate || '',
    bidOpeningDate: candidate.bidOpeningDate || '',
    organisationChain: candidate.organisationChain || '',
    notes: `Imported on ${new Date().toLocaleDateString()}. ${candidate.needsReview ? '⚠️ Needs review: ' + (candidate.reviewReason || 'Unknown') : ''}`
  };
}

/**
 * Parse CSV content for tender import.
 */
export function parseCSVContent(csv: string): { tenders: Tender[]; stats: ImportStats } {
  const tenders: Tender[] = [];
  const stats: ImportStats = {
    totalRows: 0,
    candidatesDetected: 0,
    parsed: 0,
    rejected: 0,
    needsReview: 0,
    duplicates: 0,
    missingFields: {},
    aiUsed: false
  };

  const lines = csv.split('\n').filter(l => l.trim());
  
  if (lines.length < 2) return { tenders, stats };
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    stats.totalRows++;
    stats.candidatesDetected++;
    const cols = parseCSVLine(lines[i]);
    
    if (cols.length >= 2 && cols[1]) {
      tenders.push({
        id: uuidv4(),
        tenderId: cols[0] || 'PENDING-IMPORT',
        workName: cols[1],
        department: cols[2] || '',
        district: cols[3] || '',
        tenderAmount: cols[4] || '',
        emd: cols[5] || '',
        lastDate: cols[6] || '',
        officialUrl: cols[7] || BASE_URL,
        dataSource: 'imported',
        textCopied: false,
        bannerCopied: false,
        manuallyPublished: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eligibility: cols[8] || '',
        notes: `Imported from CSV on ${new Date().toLocaleDateString()}.`
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
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ============ HELPER FUNCTIONS ============

function cleanHTML(str: string): string {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAllDates(text: string): { publishedDate: string; closingDate: string; openingDate: string } {
  // Try multiple date formats
  const datePatterns = [
    /(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}\s*[AP]M)/g,  // 22-Oct-2026 11:00 AM
    /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s*[AP]M)/g,  // 22/10/2026 11:00 AM
    /(\d{2}-\w{3}-\d{4})/g,                            // 22-Oct-2026
    /(\d{4}-\d{2}-\d{2})/g,                            // 2026-10-22
    /(\d{2}\/\d{2}\/\d{4})/g,                          // 22/10/2026
    /(\d{2}\.\d{2}\.\d{4})/g,                          // 22.10.2026
  ];
  
  const matches: string[] = [];
  
  for (const pattern of datePatterns) {
    pattern.lastIndex = 0;
    const found = text.match(pattern);
    if (found && found.length > 0) {
      for (const m of found) {
        const normalized = normalizeDate(m);
        if (normalized && !matches.includes(normalized)) {
          matches.push(normalized);
        }
      }
      if (matches.length >= 3) break;
    }
  }
  
  return {
    publishedDate: matches[0] || '',
    closingDate: matches[1] || '',
    openingDate: matches[2] || ''
  };
}

function extractDateFromText(text: string): string {
  const patterns = [
    /(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}\s*[AP]M)/,
    /(\d{2}-\w{3}-\d{4})/,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{2}\/\d{2}\/\d{4})/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return normalizeDate(match[0]);
  }
  return '';
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  
  try {
    // DD-MMM-YYYY HH:MM AM/PM
    const months: Record<string, string> = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
      'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
      'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
      'January': '01', 'February': '02', 'March': '03', 'April': '04',
      'June': '06', 'July': '07', 'August': '08',
      'September': '09', 'October': '10', 'November': '11', 'December': '12'
    };
    
    // DD-MMM-YYYY
    let match = dateStr.match(/(\d{1,2})[-\s](\w{3,})[-\s](\d{4})/);
    if (match) {
      const month = months[match[2].substring(0, 3).charAt(0).toUpperCase() + match[2].substring(1, 3).toLowerCase()] || 
                    months[match[2]] || '01';
      const day = match[1].padStart(2, '0');
      return `${match[3]}-${month}-${day}`;
    }
    
    // YYYY-MM-DD
    match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[0];
    
    // DD/MM/YYYY
    match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    
    // DD.MM.YYYY
    match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    
  } catch {}
  return dateStr;
}

function extractOrgChainFromText(text: string): string {
  const patterns = [
    /(?:Organisation|Organization)[^|]*\|([^<\n]+)/i,
    /(Engineer-in-Chief[^|\n]*)/i,
    /(Executive Engineer[^|\n]*)/i,
    /(Madhya Pradesh[^|\n]*(?:Vidyut|PWD|Water|Department)[^|\n]*)/i,
    /([A-Z][^|\n]*(?:Department|Division|Circle)[^|\n]*)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanHTML(match[1] || match[0]).substring(0, 200);
  }
  
  return '';
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
  
  for (const district of mpDistricts) {
    if (text.toUpperCase().includes(district.toUpperCase())) {
      return district;
    }
  }
  
  return '';
}

function extractDepartmentFromText(text: string): string {
  if (!text) return '';
  
  const deptKeywords = [
    'Water Resources Department',
    'Public Health Engineering',
    'PWD',
    'Madhya Pradesh Paschim Kshetra Vidyut Vitran',
    'Madhya Pradesh Madhya Kshetra Vidyut Vitran',
    'Madhya Pradesh Poorv Kshetra Vidyut Vitran',
    'MP Power Transmission',
    'MP Power Generation',
    'Urban Administration',
    'Rural Development',
    'Education Department',
    'Health Department',
    'Forest Department',
    'Agriculture Department',
    'Irrigation Department',
    'Energy Department',
    'Transport Department',
    'Directorate of Technical Education',
    'Government Polytechnic',
  ];
  
  for (const keyword of deptKeywords) {
    if (text.includes(keyword)) {
      return keyword;
    }
  }
  
  // Fallback: look for common patterns
  const patterns = [
    /([A-Z][^|\n]*(?:Department|Division|Board|Corporation|Directorate)[^|\n]*)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanHTML(match[1]).substring(0, 100);
  }
  
  return '';
}

function extractTenderValue(text: string): string {
  // Look for currency values
  const patterns = [
    /(?:Tender\s*Value|Estimated\s*Value|Amount|Value)[\s:：]*[\u20B9Rs.]*\s*([\d,]+(?:\.\d+)?)\s*(?:Crore|Lakh|Crores|Lakhs|Cr|L)?/i,
    /[\u20B9Rs.]\s*([\d,]+(?:\.\d+)?)\s*(?:Crore|Lakh|Crores|Lakhs|Cr|L)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:Crore|Lakh|Crores|Lakhs)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  
  return '';
}

function extractEMD(text: string): string {
  const patterns = [
    /(?:EMD|Earnest\s*Money|Security\s*Deposit)[\s:：]*[\u20B9Rs.]*\s*([\d,]+(?:\.\d+)?)/i,
    /EMD[\s:：]*([\d,]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  
  return '';
}

function extractTenderFee(text: string): string {
  const patterns = [
    /(?:Tender\s*Fee|Document\s*Fee|Fee)[\s:：]*[\u20B9Rs.]*\s*([\d,]+(?:\.\d+)?)/i,
    /Fee[\s:：]*[\u20B9Rs.]*\s*([\d,]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  
  return '';
}

// ============ AI-ASSISTED EXTRACTION ============

export interface AIProviderConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'custom';
  apiUrl: string;
  apiKey: string; // Note: should be set server-side in production
  model: string;
}

/**
 * Check if AI extraction is configured.
 * In production, this should check server-side configuration.
 * For the client-side app, we show a message about configuration.
 */
export function isAIConfigured(): boolean {
  // Check localStorage for AI config (set via settings)
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

/**
 * AI-assisted tender extraction.
 * Sends text to an AI model and asks it to extract structured tender data.
 * 
 * IMPORTANT: In production, API keys should NEVER be in frontend code.
 * This implementation routes through a configurable API endpoint.
 * If no API is configured, this function returns null and the app falls back to deterministic parsing.
 */
export async function extractTendersWithAI(
  content: string,
  config?: AIProviderConfig
): Promise<{ tenders: Tender[]; stats: ImportStats } | null> {
  const aiConfig = config || getAIConfig();
  
  if (!aiConfig || !aiConfig.enabled || !aiConfig.apiUrl || !aiConfig.apiKey) {
    return null; // AI not configured
  }

  const stats: ImportStats = {
    totalRows: 0,
    candidatesDetected: 0,
    parsed: 0,
    rejected: 0,
    needsReview: 0,
    duplicates: 0,
    missingFields: {},
    aiUsed: true,
    aiProvider: aiConfig.provider
  };

  try {
    const systemPrompt = `You are a tender data extraction assistant for Indian government tenders (specifically Madhya Pradesh e-Procurement portal). Extract all tender records from the provided text and return them as a JSON array.

For each tender, extract these fields:
- title: The tender/work title
- tenderId: The tender identifier (usually a code like 2026_WRD_517082_1)
- referenceNumber: The reference/NIT number
- department: The department or organisation name
- district: The district/location in Madhya Pradesh
- publishDate: Publication date (YYYY-MM-DD format)
- closingDate: Bid submission closing date (YYYY-MM-DD format)
- tenderValue: The tender value/amount if mentioned
- sourceUrl: URL if available
- originalSourceText: The original text block for this tender

Rules:
- Use null for genuinely missing fields. NEVER invent or fabricate data.
- If a field is not present in the text, set it to null.
- Return a JSON array of objects.
- Each object must have at least a title to be valid.
- Detect ALL tender records in the text, even if formatting is inconsistent.`;

    const userPrompt = `Extract all tender records from the following text:\n\n${content.substring(0, 8000)}`;

    let response: Response;
    
    if (aiConfig.provider === 'openai') {
      response = await fetch(aiConfig.apiUrl || 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`
        },
        body: JSON.stringify({
          model: aiConfig.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }),
        signal: AbortSignal.timeout(30000)
      });
    } else if (aiConfig.provider === 'anthropic') {
      response = await fetch(aiConfig.apiUrl || 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': aiConfig.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: aiConfig.model || 'claude-3-haiku-20240307',
          max_tokens: 4096,
          messages: [
            { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }
          ]
        }),
        signal: AbortSignal.timeout(30000)
      });
    } else {
      // Custom endpoint
      response = await fetch(aiConfig.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`
        },
        body: JSON.stringify({
          content: content.substring(0, 8000),
          systemPrompt
        }),
        signal: AbortSignal.timeout(30000)
      });
    }

    if (!response.ok) {
      console.error('AI extraction failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    
    // Parse AI response
    let aiTenders: any[] = [];
    
    if (aiConfig.provider === 'anthropic') {
      const textContent = data.content?.[0]?.text || '';
      const jsonMatch = textContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiTenders = JSON.parse(jsonMatch[0]);
      }
    } else if (data.choices?.[0]?.message?.content) {
      const content = data.choices[0].message.content;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiTenders = JSON.parse(jsonMatch[0]);
      } else {
        const parsed = JSON.parse(content);
        aiTenders = parsed.tenders || parsed.records || [];
      }
    } else if (data.tenders) {
      aiTenders = data.tenders;
    } else if (Array.isArray(data)) {
      aiTenders = data;
    }

    // Validate and convert AI results to Tender objects
    const tenders: Tender[] = [];
    stats.candidatesDetected = aiTenders.length;
    
    for (const item of aiTenders) {
      if (!item || !item.title) {
        stats.rejected++;
        continue;
      }
      
      stats.totalRows++;
      
      const tender: Tender = {
        id: uuidv4(),
        tenderId: item.tenderId || item.tender_id || 'PENDING-IMPORT',
        workName: item.title || item.workName || '',
        department: item.department || item.organisation || '',
        district: item.district || item.location || '',
        tenderAmount: item.tenderValue || item.tender_value || item.amount || '',
        emd: item.emd || '',
        lastDate: normalizeDate(item.closingDate || item.closing_date || item.lastDate || ''),
        officialUrl: item.sourceUrl || item.source_url || item.url || BASE_URL,
        dataSource: 'imported',
        textCopied: false,
        bannerCopied: false,
        manuallyPublished: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eligibility: item.eligibility || '',
        tenderFee: item.tenderFee || item.tender_fee || '',
        publishedDate: normalizeDate(item.publishDate || item.publish_date || ''),
        bidOpeningDate: normalizeDate(item.bidOpeningDate || item.opening_date || ''),
        organisationChain: item.department || '',
        notes: `AI-extracted on ${new Date().toLocaleDateString()}. Provider: ${aiConfig.provider}.`
      };
      
      // Track missing fields
      if (!tender.tenderId || tender.tenderId === 'PENDING-IMPORT') {
        stats.missingFields['tenderId'] = (stats.missingFields['tenderId'] || 0) + 1;
        stats.needsReview++;
      }
      if (!tender.lastDate) stats.missingFields['lastDate'] = (stats.missingFields['lastDate'] || 0) + 1;
      if (!tender.district) stats.missingFields['district'] = (stats.missingFields['district'] || 0) + 1;
      
      tenders.push(tender);
      stats.parsed++;
    }

    return { tenders, stats };
  } catch (e) {
    console.error('AI extraction error:', e);
    return null; // Fail gracefully, don't crash
  }
}

/**
 * Combined extraction: deterministic first, AI fallback.
 * Returns the best result with accurate statistics.
 */
export async function extractTendersHybrid(content: string): Promise<{
  tenders: Tender[];
  stats: ImportStats;
  method: 'deterministic' | 'ai' | 'hybrid';
  warning?: string;
}> {
  // Step 1: Deterministic parsing
  const deterministicResult = parsePastedContent(content);
  
  // Step 2: Check if AI should be used as fallback
  const aiAvailable = isAIConfigured();
  
  if (aiAvailable && deterministicResult.stats.candidatesDetected < 5) {
    // Try AI extraction
    const aiResult = await extractTendersWithAI(content);
    
    if (aiResult && aiResult.tenders.length > deterministicResult.tenders.length) {
      // AI found more tenders
      const warning = deterministicResult.stats.candidatesDetected > 0
        ? `Deterministic parser found ${deterministicResult.stats.candidatesDetected} candidates, AI found ${aiResult.stats.candidatesDetected}. Using AI results.`
        : `Deterministic parser found no candidates. AI extraction found ${aiResult.stats.candidatesDetected} tenders.`;
      
      return {
        tenders: aiResult.tenders,
        stats: aiResult.stats,
        method: 'ai',
        warning
      };
    }
  }
  
  // Step 3: Generate warning if we suspect missed records
  let warning: string | undefined;
  const estimatedCount = estimateTenderCount(content);
  
  if (estimatedCount > deterministicResult.stats.candidatesDetected + 2) {
    warning = `⚠️ Input appears to contain ~${estimatedCount} tender records, but only ${deterministicResult.stats.candidatesDetected} were detected. ${aiAvailable ? 'AI fallback was attempted but did not find more.' : 'Configure AI extraction in Settings for better results.'}`;
  }
  
  return {
    tenders: deterministicResult.tenders,
    stats: deterministicResult.stats,
    method: 'deterministic',
    warning
  };
}

/**
 * Estimate how many tender records are in the text.
 * Uses multiple heuristics to count.
 */
function estimateTenderCount(text: string): number {
  let count = 0;
  
  // Count tender ID patterns
  const idPatterns = [
    /\b\d{4}_\w+_\d+_\d+\b/g,
    /\[\w+\]\[\w+\]/g,
    /\b\d{4}[-\/]\w+[-\/]\d+\b/g,
  ];
  
  for (const pattern of idPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > count) {
      count = matches.length;
    }
  }
  
  // Count tender links
  const linkMatches = text.match(/mptenders\.gov\.in[^"'\s]*/g);
  if (linkMatches && linkMatches.length > count) {
    count = linkMatches.length;
  }
  
  // Count numbered items
  const numberedMatches = text.match(/^\s*\d+[\.\)]\s+/gm);
  if (numberedMatches && numberedMatches.length > count) {
    count = numberedMatches.length;
  }
  
  // Count date patterns (closing dates)
  const dateMatches = text.match(/\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}\s*[AP]M/g);
  if (dateMatches) {
    // Typically 3 dates per tender (publish, close, open)
    const dateCount = Math.floor(dateMatches.length / 3);
    if (dateCount > count) count = dateCount;
  }
  
  return count;
}
