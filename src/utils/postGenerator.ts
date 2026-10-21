import { Tender, AppSettings } from '../types';

/**
 * Generate a professional Hindi community post from tender data.
 * Uses deterministic templates - NEVER invents data.
 * Shows "आधिकारिक स्रोत पर उपलब्ध नहीं" for missing information.
 * 
 * Format follows the exact specification for WhatsApp/Telegram community posts.
 */
export function generateHindiPost(tender: Tender, settings?: AppSettings): string {
  const notAvailable = 'आधिकारिक स्रोत पर उपलब्ध नहीं';
  
  const tenderId = tender.tenderId || notAvailable;
  const workName = tender.workName || notAvailable;
  const department = tender.department || notAvailable;
  const district = tender.district || notAvailable;
  const tenderAmount = tender.tenderAmount || notAvailable;
  const emd = tender.emd || notAvailable;
  const tenderFee = tender.tenderFee || notAvailable;
  const lastDate = tender.lastDate ? formatDateHindi(tender.lastDate) : notAvailable;
  const eligibility = tender.eligibility || notAvailable;
  const requiredDocs = tender.requiredDocuments || notAvailable;
  const officialUrl = tender.officialUrl || 'https://mptenders.gov.in';
  const contactInfo = settings?.contactInfo || '';

  // Build the post - each field is included only if available
  let post = `🚨 मध्य प्रदेश टेंडर अपडेट

📍 जिला: ${district}
🏢 विभाग: ${department}
📌 टेंडर ID: ${tenderId}

📝 कार्य का नाम:
${workName}

💰 अनुमानित लागत: ${tenderAmount}
🔐 EMD: ${emd}
📄 टेंडर फीस: ${tenderFee}
📅 आवेदन की अंतिम तिथि: ${lastDate}`;

  // Add eligibility only if available
  if (tender.eligibility && tender.eligibility.trim() !== '') {
    post += `\n\n👷 पात्रता: ${tender.eligibility}`;
  } else {
    post += `\n\n👷 पात्रता: ${notAvailable}`;
  }

  // Add required documents only if available
  if (tender.requiredDocuments && tender.requiredDocuments.trim() !== '') {
    post += `\n📎 आवश्यक दस्तावेज: ${tender.requiredDocuments}`;
  } else {
    post += `\n📎 आवश्यक दस्तावेज: ${notAvailable}`;
  }

  post += `

🔗 आधिकारिक टेंडर लिंक:
${officialUrl}

⚠️ आवेदन करने से पहले आधिकारिक NIT, शर्तें, corrigendum और अंतिम तिथि जरूर जांचें।`;

  // Add company branding
  if (settings?.companyName) {
    post += `\n\n${settings.companyName}`;
    if (settings.companyTagline) {
      post += `\n${settings.companyTagline}`;
    }
  }
  if (contactInfo) {
    post += `\n📞 ${contactInfo}`;
  }

  // Add data source notice
  if (tender.dataSource === 'sample') {
    post += `\n\n⚠️ सूचना: यह SAMPLE DATA है — वास्तविक टेंडर नहीं। केवल प्रदर्शन के लिए।`;
  } else if (tender.dataSource === 'imported') {
    post += `\n\n📥 डेटा स्रोत: आधिकारिक पोर्टल से आयातित (mptenders.gov.in)`;
  } else {
    post += `\n\n✅ डेटा स्रोत: मैनुअल रूप से दर्ज किया गया`;
  }

  return post;
}

function formatDateHindi(dateStr: string): string {
  try {
    // Handle YYYY-MM-DD format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      const parts = dateStr.split('T')[0].split('-');
      const day = parts[2];
      const monthIdx = parseInt(parts[1]) - 1;
      const year = parts[0];
      const months = [
        'जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
        'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'
      ];
      return `${day} ${months[monthIdx]}, ${year}`;
    }
    // Handle DD-Mon-YYYY format
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const months = [
        'जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
        'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'
      ];
      return `${date.getDate()} ${months[date.getMonth()]}, ${date.getFullYear()}`;
    }
  } catch {}
  return dateStr;
}
