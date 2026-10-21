import { Tender } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * MP Tender Data Import Service
 * 
 * LIMITATION DOCUMENTATION:
 * The official MP e-Procurement portal (mptenders.gov.in) uses:
 * - Session-based Tapestry framework (NIC GEP)
 * - CAPTCHA for search operations
 * - Dynamic session tokens in URLs
 * - CORS restrictions that prevent browser-based direct access
 * 
 * This service provides multiple import methods:
 * 1. CORS Proxy fetch (best-effort, may fail due to portal restrictions)
 * 2. Manual HTML paste from the official "Tenders by Closing Date" page
 * 3. Structured text import
 * 4. CSV file import
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
  source: 'cors_proxy' | 'html_paste' | 'text_import' | 'csv_import';
  timestamp: string;
  stats?: {
    totalRows: number;
    parsed: number;
    rejected: number;
    duplicates: number;
    missingFields: Record<string, number>;
  };
}

/**
 * Attempt to fetch live tenders via CORS proxy.
 * This is best-effort - the government portal may block proxy requests.
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
 * Accepts both raw HTML and cleaned text from the portal.
 * Returns tenders plus parsing statistics.
 */
export function parsePastedContent(content: string): { tenders: Tender[]; stats: ImportResult['stats'] } {
  // Try HTML parsing first using DOMParser
  let result = parseHTMLWithDOM(content);
  
  if (result.tenders.length > 0) return result;
  
  // Try regex-based HTML parsing
  result = parseHTMLWithRegex(content);
  
  if (result.tenders.length > 0) return result;
  
  // Try text-based parsing
  result = parseTextContent(content);
  
  return result;
}

/**
 * Parse HTML using DOMParser - most reliable method.
 */
function parseHTMLWithDOM(html: string): { tenders: Tender[]; stats: ImportResult['stats'] } {
  const tenders: Tender[] = [];
  const stats: ImportResult['stats'] = {
    totalRows: 0,
    parsed: 0,
    rejected: 0,
    duplicates: 0,
    missingFields: {}
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
      const allLinks = doc.querySelectorAll('a[href*="component=%24DirectLink"]');
      for (const link of allLinks) {
        const title = link.textContent?.trim();
        const url = link.getAttribute('href');
        
        if (title && title.length > 10 && url) {
          // Look for reference numbers near this link
          const parent = link.parentElement;
          const parentText = parent?.textContent || '';
          const refMatch = parentText.match(/\[([^\]]+)\]\[([^\]]+)\]/);
          
          tenders.push({
            id: uuidv4(),
            tenderId: refMatch ? refMatch[2] : 'PENDING-IMPORT',
            workName: title,
            department: extractDepartmentFromText(parentText),
            district: extractDistrictFromText(parentText),
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
  // Get title from first link
  const titleLink = links[0];
  const title = titleLink.textContent?.trim() || '';
  const url = titleLink.getAttribute('href') || '';
  
  if (title.length < 10) return null;
  
  // Get all text content from the row
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
    tenderAmount: '',
    emd: '',
    lastDate: dates.closingDate || '',
    officialUrl: url.startsWith('http') ? url : BASE_URL + url,
    dataSource: 'imported',
    textCopied: false,
    bannerCopied: false,
    manuallyPublished: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    eligibility: '',
    tenderFee: '',
    publishedDate: dates.publishedDate || '',
    bidOpeningDate: dates.openingDate || '',
    organisationChain: orgChain,
    notes: `Imported from official portal listing on ${new Date().toLocaleDateString()}. Amount and EMD not shown on listing page - verify from detail page.`
  };
}

/**
 * Parse HTML using regex - fallback method.
 */
function parseHTMLWithRegex(html: string): { tenders: Tender[]; stats: ImportResult['stats'] } {
  const tenders: Tender[] = [];
  const stats: ImportResult['stats'] = {
    totalRows: 0,
    parsed: 0,
    rejected: 0,
    duplicates: 0,
    missingFields: {}
  };

  // Split by table rows
  const rows = html.split(/<tr[^>]*>/i);
  
  for (const row of rows) {
    stats.totalRows++;
    
    // Look for tender links - more flexible pattern
    const linkPatterns = [
      /\[([^\]]{10,})\]\((https:\/\/mptenders\.gov\.in[^)]+)\s*(?:"[^"]*")?\)/,
      /<a[^>]+href="([^"]*component=%24DirectLink[^"]*)"[^>]*>([^<]+)<\/a>/i,
      /<a[^>]+href="([^"]*mptenders\.gov\.in[^"]*)"[^>]*>([^<]{10,})<\/a>/i
    ];
    
    let title = '';
    let url = '';
    
    for (const pattern of linkPatterns) {
      const match = row.match(pattern);
      if (match) {
        if (pattern.source.includes('\\]\\\\(')) {
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
        tenderAmount: '',
        emd: '',
        lastDate: dates.closingDate || '',
        officialUrl: url || BASE_URL,
        dataSource: 'imported',
        textCopied: false,
        bannerCopied: false,
        manuallyPublished: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        eligibility: '',
        tenderFee: '',
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
 * Parse plain text content that may have been copied from the portal.
 */
function parseTextContent(text: string): { tenders: Tender[]; stats: ImportResult['stats'] } {
  const tenders: Tender[] = [];
  const stats: ImportResult['stats'] = {
    totalRows: 0,
    parsed: 0,
    rejected: 0,
    duplicates: 0,
    missingFields: {}
  };

  const lines = text.split('\n').filter(l => l.trim());
  
  // Look for patterns like:
  // 1. Title
  // [RefNo][TenderID]
  // Dates
  // Organisation chain
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    stats.totalRows++;
    
    // Check if this looks like a tender title line (starts with number or is long text)
    const isTitleLine = (line.match(/^\d+\.\s+/) || (line.length > 20 && !line.match(/^[\[\d]/)));
    
    if (isTitleLine) {
      const title = line.replace(/^\d+\.\s+/, '').trim();
      
      if (title.length > 10) {
        let tenderRef = '';
        let tenderId = '';
        let closingDate = '';
        let openingDate = '';
        let publishedDate = '';
        let orgChain = '';
        
        // Look ahead for reference numbers, dates, and org chain
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const nextLine = lines[j].trim();
          
          // Reference numbers [RefNo][TenderID]
          if (nextLine.match(/\[.+\]\[.+\]/)) {
            const refParts = nextLine.match(/\[([^\]]+)\]\[([^\]]+)\]/);
            if (refParts) {
              tenderRef = refParts[1];
              tenderId = refParts[2];
            }
          }
          
          // Dates
          const dateMatches = nextLine.match(/(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}\s*[AP]M)/g);
          if (dateMatches) {
            if (dateMatches.length >= 3) {
              publishedDate = convertDate(dateMatches[0]);
              closingDate = convertDate(dateMatches[1]);
              openingDate = convertDate(dateMatches[2]);
            } else if (dateMatches.length >= 2) {
              closingDate = convertDate(dateMatches[0]);
              openingDate = convertDate(dateMatches[1]);
            } else if (dateMatches.length === 1) {
              closingDate = convertDate(dateMatches[0]);
            }
          }
          
          // Organisation chain (contains | or department keywords)
          if (nextLine.includes('|') || 
              nextLine.match(/Engineer|Department|Division|Madhya Pradesh|PWD/i)) {
            orgChain = nextLine;
          }
          
          // Stop if we hit another numbered item
          if (j > i + 1 && nextLine.match(/^\d+\./)) break;
        }
        
        const district = extractDistrictFromText(orgChain || title);
        const department = extractDepartmentFromText(orgChain) || 'Not specified in source';
        
        tenders.push({
          id: uuidv4(),
          tenderId: tenderId || tenderRef || 'PENDING-IMPORT',
          workName: title,
          department: department,
          district: district || 'Not specified in source',
          tenderAmount: '',
          emd: '',
          lastDate: closingDate,
          officialUrl: BASE_URL,
          dataSource: 'imported',
          textCopied: false,
          bannerCopied: false,
          manuallyPublished: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          eligibility: '',
          tenderFee: '',
          publishedDate: publishedDate,
          bidOpeningDate: openingDate,
          organisationChain: orgChain,
          notes: `Imported from pasted content on ${new Date().toLocaleDateString()}. Verify details from official portal.`
        });
        
        stats.parsed++;
        i += 6; // Skip ahead past this tender's data
        continue;
      }
    }
    i++;
  }
  
  return { tenders, stats };
}

/**
 * Parse CSV content for tender import.
 */
export function parseCSVContent(csv: string): { tenders: Tender[]; stats: ImportResult['stats'] } {
  const tenders: Tender[] = [];
  const stats: ImportResult['stats'] = {
    totalRows: 0,
    parsed: 0,
    rejected: 0,
    duplicates: 0,
    missingFields: {}
  };

  const lines = csv.split('\n').filter(l => l.trim());
  
  if (lines.length < 2) return { tenders, stats };
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    stats.totalRows++;
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
  const datePattern = /(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}\s*[AP]M)/g;
  const matches = text.match(datePattern) || [];
  
  return {
    publishedDate: matches[0] ? convertDate(matches[0]) : '',
    closingDate: matches[1] ? convertDate(matches[1]) : '',
    openingDate: matches[2] ? convertDate(matches[2]) : ''
  };
}

function extractDateFromText(text: string): string {
  const match = text.match(/(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}\s*[AP]M)/);
  return match ? convertDate(match[0]) : '';
}

function convertDate(dateStr: string): string {
  try {
    const months: Record<string, string> = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
      'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
      'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };
    const match = dateStr.match(/(\d{2})-(\w{3})-(\d{4})/);
    if (match) {
      const month = months[match[2]] || '01';
      return `${match[3]}-${month}-${match[1]}`;
    }
  } catch {}
  return dateStr;
}

function extractOrgChainFromText(text: string): string {
  // Look for organisation chain pattern
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
  
  // Check for district names in the text
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
    'Transport Department'
  ];
  
  for (const keyword of deptKeywords) {
    if (text.includes(keyword)) {
      return keyword;
    }
  }
  
  // Fallback: look for common patterns
  const patterns = [
    /([A-Z][^|\n]*(?:Department|Division|Board|Corporation)[^|\n]*)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanHTML(match[1]).substring(0, 100);
  }
  
  return '';
}
