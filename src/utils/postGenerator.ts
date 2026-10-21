import { Tender } from '../types';

/**
 * Generate a professional Hindi community post from tender data.
 * Uses deterministic templates - never invents data.
 * Shows "उपलब्ध नहीं" for missing information.
 */
export function generateHindiPost(tender: Tender): string {
  const notAvailable = 'उपलब्ध नहीं';
  
  const tenderId = tender.tenderId || notAvailable;
  const workName = tender.workName || notAvailable;
  const department = tender.department || notAvailable;
  const district = tender.district || notAvailable;
  const tenderAmount = tender.tenderAmount || notAvailable;
  const emd = tender.emd || notAvailable;
  const lastDate = tender.lastDate ? formatDateHindi(tender.lastDate) : notAvailable;
  const eligibility = tender.eligibility || notAvailable;
  const officialUrl = tender.officialUrl || 'https://www.mpeprocurement.gov.in';

  // Determine data source label
  let sourceLabel = '';
  if (tender.dataSource === 'sample') {
    sourceLabel = '\n\n⚠️ यह SAMPLE DATA है - केवल प्रदर्शन के लिए। वास्तविक टेंडर नहीं।';
  } else if (tender.dataSource === 'imported') {
    sourceLabel = '\n\n📥 डेटा स्रोत: Imported';
  } else {
    sourceLabel = '\n\n✅ डेटा स्रोत: Manually Entered';
  }

  const post = `🏗️ 🔔 मध्य प्रदेश टेंडर सूचना 🔔 🏗️

━━━━━━━━━━━━━━━━━━━━━━━━

📋 टेंडर संख्या: ${tenderId}

📝 कार्य का विवरण:
${workName}

🏢 विभाग: ${department}
📍 जिला: ${district}

💰 अनुमानित राशि: ${tenderAmount}
🔒 EMD राशि: ${emd}

📅 अंतिम तिथि: ${lastDate}

📌 पात्रता:
${eligibility}

━━━━━━━━━━━━━━━━━━━━━━━━

🔗 आधिकारिक लिंक:
${officialUrl}

📲 अधिक जानकारी के लिए संपर्क करें:
Apex Associates

━━━━━━━━━━━━━━━━━━━━━━━━

⚡ इस टेंडर की पूरी जानकारी के लिए ऊपर दिए गए लिंक पर जाएं।
⚠️ कृपया आधिकारिक वेबसाइट से सभी जानकारी स्वयं सत्यापित करें।

${sourceLabel}`;

  return post;
}

function formatDateHindi(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const months = [
      'जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
      'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'
    ];
    return `${date.getDate()} ${months[date.getMonth()]}, ${date.getFullYear()}`;
  } catch {
    return dateStr;
  }
}
