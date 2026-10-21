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
 * 5. Single tender URL import
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
  source: 'cors_proxy' | 'html_paste' | 'text_import' | 'csv_import' | 'url_import';
  timestamp: string;
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
      const tenders = parseTendersByDateHTML(html);
      
      if (tenders.length > 0) {
        return {
          success: true,
          tenders,
          message: `Successfully fetched ${tenders.length} real tenders from official portal via proxy.`,
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
 * Parse HTML from the "Tenders by Closing Date" page.
 * Extracts: title, reference number, dates, organisation chain, and detail URL.
 */
export function parseTendersByDateHTML(html: string): Tender[] {
  const tenders: Tender[] = [];
  
  // Parse table rows - each row contains tender info
  // Pattern: S.No | e-Published Date | Closing Date | Opening Date | Title + Ref | Organisation
  
  // Use regex to find tender entries in the HTML
  // The HTML contains links like: [Title](url) followed by [RefNo][TenderID]
  const tenderPattern = /\[(.+?)\]\((https:\/\/mptenders\.gov\.in\/nicgep\/app\?component=.+?)\s*(?:"[^"]*")?\)\s*<br>\s*\[(.+?)\]\[(.+?)\]/gi;
  
  // Alternative: parse the table structure
  const rows = html.split(/<tr[^>]*>/i);
  
  for (const row of rows) {
    // Look for tender links
    const linkMatch = row.match(/\[([^\]]+)\]\((https:\/\/mptenders\.gov\.in\/nicgep\/app\?component=%24DirectLink[^)]+)\s*(?:"[^"]*")?\)/);
    const refMatch = row.match(/\[([^\]]+)\]\[([^\]]+)\]/);
    
    if (linkMatch) {
      const title = cleanHTML(linkMatch[1]);
      const detailUrl = linkMatch[2];
      
      // Extract reference numbers
      let tenderRef = '';
      let tenderId = '';
      if (refMatch) {
        tenderRef = cleanHTML(refMatch[1]);
        tenderId = cleanHTML(refMatch[2]);
      }
      
      // Extract dates from the row
      const dates = extractDatesFromRow(row);
      
      // Extract organisation chain
      const orgChain = extractOrgChain(row);
      
      // Determine district from organisation chain
      const district = extractDistrictFromOrg(orgChain);
      
      // Determine department from organisation chain
      const department = extractDepartmentFromOrg(orgChain);
      
      if (title && title.length > 5) {
        tenders.push({
          id: uuidv4(),
          tenderId: tenderId || tenderRef || 'PENDING-IMPORT',
          workName: title,
          department: department || 'Not specified in source',
          district: district || 'Not specified in source',
          tenderAmount: '', // Not available in listing page
          emd: '', // Not available in listing page
          lastDate: dates.closingDate || '',
          officialUrl: detailUrl || `${BASE_URL}/nicgep/app?page=FrontEndListTendersbyDate&service=page`,
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
        });
      }
    }
  }
  
  return tenders;
}

/**
 * Parse pasted HTML/text from the user.
 * Accepts both raw HTML and cleaned text from the portal.
 */
export function parsePastedContent(content: string): Tender[] {
  // Try HTML parsing first
  let tenders = parseTendersByDateHTML(content);
  
  if (tenders.length > 0) return tenders;
  
  // Try text-based parsing (if user pasted cleaned text)
  tenders = parseTextContent(content);
  
  return tenders;
}

/**
 * Parse plain text content that may have been copied from the portal.
 */
function parseTextContent(text: string): Tender[] {
  const tenders: Tender[] = [];
  const lines = text.split('\n').filter(l => l.trim());
  
  // Look for patterns like:
  // 1. Title
  // [RefNo][TenderID]
  // Organisation chain
  // Dates
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Check if this looks like a tender title line
    if (line.match(/^\d+\.\s+/) || (line.length > 20 && !line.match(/^\[/))) {
      const title = line.replace(/^\d+\.\s+/, '').trim();
      
      if (title.length > 10) {
        let tenderRef = '';
        let tenderId = '';
        let closingDate = '';
        let openingDate = '';
        let orgChain = '';
        
        // Look ahead for reference numbers and other data
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();
          
          if (nextLine.match(/\[.+\]\[.+\]/)) {
            const refParts = nextLine.match(/\[([^\]]+)\]\[([^\]]+)\]/);
            if (refParts) {
              tenderRef = refParts[1];
              tenderId = refParts[2];
            }
          } else if (nextLine.match(/\d{2}-\w{3}-\d{4}/)) {
            const dateMatch = nextLine.match(/(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}\s*[AP]M)/g);
            if (dateMatch && dateMatch.length >= 2) {
              closingDate = convertDate(dateMatch[0]);
              openingDate = convertDate(dateMatch[1]);
            }
          } else if (nextLine.includes('|') || nextLine.includes('Department') || nextLine.includes('Engineer')) {
            orgChain = nextLine;
          }
        }
        
        const district = extractDistrictFromOrg(orgChain);
        const department = extractDepartmentFromOrg(orgChain);
        
        tenders.push({
          id: uuidv4(),
          tenderId: tenderId || tenderRef || 'PENDING-IMPORT',
          workName: title,
          department: department || 'Not specified in source',
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
          publishedDate: '',
          bidOpeningDate: openingDate,
          organisationChain: orgChain,
          notes: `Imported from pasted content on ${new Date().toLocaleDateString()}. Verify details from official portal.`
        });
        
        i += 4; // Skip ahead
        continue;
      }
    }
    i++;
  }
  
  return tenders;
}

/**
 * Parse CSV content for tender import.
 * Expected columns: Tender ID, Work Name, Department, District, Amount, EMD, Last Date, URL
 */
export function parseCSVContent(csv: string): Tender[] {
  const tenders: Tender[] = [];
  const lines = csv.split('\n').filter(l => l.trim());
  
  if (lines.length < 2) return tenders;
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length >= 2) {
      tenders.push({
        id: uuidv4(),
        tenderId: cols[0] || 'PENDING-IMPORT',
        workName: cols[1] || '',
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
    }
  }
  
  return tenders;
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

// Helper functions

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

function extractDatesFromRow(row: string): { publishedDate: string; closingDate: string; openingDate: string } {
  const datePattern = /(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}\s*[AP]M)/g;
  const matches = row.match(datePattern) || [];
  
  return {
    publishedDate: matches[0] ? convertDate(matches[0]) : '',
    closingDate: matches[1] ? convertDate(matches[1]) : '',
    openingDate: matches[2] ? convertDate(matches[2]) : ''
  };
}

function convertDate(dateStr: string): string {
  // Convert "22-Oct-2026 09:00 AM" to "2026-10-22"
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

function extractOrgChain(row: string): string {
  // Look for organisation chain pattern in the HTML
  const orgMatch = row.match(/Organisation[^|]*\|([^<]+)/i);
  if (orgMatch) return cleanHTML(orgMatch[1]);
  
  // Alternative: look for department-like text
  const deptPatterns = [
    /Engineer-in-Chief[^|<]*/i,
    /Executive Engineer[^|<]*/i,
    /Department[^|<]*/i,
    /Madhya Pradesh[^|<]*/i,
    /PWD[^|<]*/i,
    /Division[^|<]*/i,
  ];
  
  for (const pattern of deptPatterns) {
    const match = row.match(pattern);
    if (match) return cleanHTML(match[0]);
  }
  
  return '';
}

function extractDistrictFromOrg(orgChain: string): string {
  if (!orgChain) return '';
  
  // Common MP district names in parentheses or after specific keywords
  const districtPatterns = [
    /\(([^)]+)\)\s*$/,  // District in parentheses at end
    /\b(Bhopal|Indore|Jabalpur|Gwalior|Ujjain|Dewas|Satna|Rewa|Sagar|Singrauli|Chhindwara|Betul|Sehore|Vidisha|Raisen|Rajgarh|Shajapur|Shivpuri|Datia|Bhind|Morena|Sheopur|Tikamgarh|Chhatarpur|Damoh|Narsinghpur|Seoni|Mandla|Balaghat|Katni|Dindori|Shahdol|Umaria|Anuppur|Sidhi|Panna|Sagar|Hoshangabad|Harda|Khandwa|Khargone|Barwani|Dhar|Alirajpur|Jhabua|Ratlam|Neemuch|Mandsaur|Agar Malwa|Guna|Ashoknagar|Burhanpur)\b/i
  ];
  
  for (const pattern of districtPatterns) {
    const match = orgChain.match(pattern);
    if (match) return match[1] || match[0];
  }
  
  // Look for district name in the org chain (common pattern: "EE, XYZ Division, DISTRICT")
  const parts = orgChain.split(/[|,]/);
  for (const part of parts) {
    const trimmed = part.trim();
    // Check if it matches a known district
    const mpDistricts = ['Bhopal','Indore','Jabalpur','Gwalior','Ujjain','Dewas','Satna','Rewa','Sagar','Singrauli','Chhindwara','Betul','Sehore','Vidisha','Raisen','Rajgarh','Shajapur','Shivpuri','Datia','Bhind','Morena','Sheopur','Tikamgarh','Chhatarpur','Damoh','Narsinghpur','Seoni','Mandla','Balaghat','Katni','Dindori','Shahdol','Umaria','Anuppur','Sidhi','Panna','Harda','Khandwa','Khargone','Barwani','Dhar','Alirajpur','Jhabua','Ratlam','Neemuch','Mandsaur','Guna','Ashoknagar','Burhanpur','Hoshangabad','Agar Malwa'];
    
    for (const district of mpDistricts) {
      if (trimmed.toUpperCase().includes(district.toUpperCase())) {
        return district;
      }
    }
  }
  
  return '';
}

function extractDepartmentFromOrg(orgChain: string): string {
  if (!orgChain) return '';
  
  // Extract department from the first part of the org chain
  const firstPart = orgChain.split('|')[0].trim();
  if (firstPart) return firstPart;
  
  // Look for common department keywords
  const deptKeywords = [
    'Water Resources', 'PWD', 'Public Health', 'Electricity', 'Power',
    'Education', 'Health', 'Forest', 'Agriculture', 'Urban',
    'Rural Development', 'Energy', 'Transport', 'Irrigation'
  ];
  
  for (const keyword of deptKeywords) {
    if (orgChain.includes(keyword)) {
      return keyword + ' Department';
    }
  }
  
  return orgChain.substring(0, 60);
}
