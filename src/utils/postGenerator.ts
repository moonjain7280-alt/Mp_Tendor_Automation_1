import { Tender, AppSettings } from '../types';

/**
 * Generate a professional Hindi community post from tender data.
 * Uses deterministic templates - NEVER invents data.
 * Shows "आधिकारिक स्रोत पर उपलब्ध नहीं" for missing information.
 * 
 * Format follows the exact specification for WhatsApp/Telegram community posts.
 */
export function generateHindiPost(tender: Tender, settings?: AppSettings): string {
  const notAvailable = '\u0906\u0927\u093F\u0915\u093E\u0930\u093F\u0915 \u0938\u094D\u0930\u094B\u0924 \u092A\u0930 \u0909\u092A\u0932\u092C\u094D\u0927 \u0928\u0939\u0940\u0902';
  // "आधिकारिक स्रोत पर उपलब्ध नहीं"
  
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

  // Build the post - exact format as specified
  let post = `\u092E\u0927\u094D\u092F \u092A\u094D\u0930\u0926\u0947\u0936 \u091F\u0947\u0902\u0921\u0930 \u0905\u092A\u0921\u0947\u091F

\u091C\u093F\u0932\u093E: ${district}
\u0935\u093F\u092D\u093E\u0917: ${department}
\u091F\u0947\u0902\u0921\u0930 ID: ${tenderId}

\u0915\u093E\u0930\u094D\u092F \u0915\u093E \u0928\u093E\u092E:
${workName}

\u0905\u0928\u0941\u092E\u093E\u0928\u093F\u0924 \u0932\u093E\u0917\u0924: ${tenderAmount}
EMD: ${emd}
\u091F\u0947\u0902\u0921\u0930 \u092B\u0940\u0938: ${tenderFee}
\u0906\u0935\u0947\u0926\u0928 \u0915\u0940 \u0905\u0902\u0924\u093F\u092E \u0924\u093F\u0925\u093F: ${lastDate}`;
  // "मध्य प्रदेश टेंडर अपडेट"
  // "जिला:", "विभाग:", "टेंडर ID:"
  // "कार्य का नाम:"
  // "अनुमानित लागत:", "टेंडर फीस:", "आवेदन की अंतिम तिथि:"

  // Add eligibility
  if (tender.eligibility && tender.eligibility.trim() !== '') {
    post += `\n\n\u092A\u093E\u0924\u094D\u0930\u0924\u093E: ${tender.eligibility}`;
    // "पात्रता:"
  } else {
    post += `\n\n\u092A\u093E\u0924\u094D\u0930\u0924\u093E: ${notAvailable}`;
  }

  // Add required documents
  if (tender.requiredDocuments && tender.requiredDocuments.trim() !== '') {
    post += `\n\u0906\u0935\u0936\u094D\u092F\u0915 \u0926\u0938\u094D\u0924\u093E\u0935\u0947\u091C: ${tender.requiredDocuments}`;
    // "आवश्यक दस्तावेज:"
  } else {
    post += `\n\u0906\u0935\u0936\u094D\u092F\u0915 \u0926\u0938\u094D\u0924\u093E\u0935\u0947\u091C: ${notAvailable}`;
  }

  post += `

\u0906\u0927\u093F\u0915\u093E\u0930\u093F\u0915 \u091F\u0947\u0902\u0921\u0930 \u0932\u093F\u0902\u0915:
${officialUrl}

\u0906\u0935\u0947\u0926\u0928 \u0915\u0930\u0928\u0947 \u0938\u0947 \u092A\u0939\u0932\u0947 \u0906\u0927\u093F\u0915\u093E\u0930\u093F\u0915 NIT, \u0936\u0930\u094D\u0924\u0947\u0902, corrigendum \u0914\u0930 \u0905\u0902\u0924\u093F\u092E \u0924\u093F\u0925\u093F \u091C\u0930\u0942\u0930 \u091C\u093E\u0902\u091A\u0947\u0902\u0964`;
  // "आधिकारिक टेंडर लिंक:"
  // "आवेदन करने से पहले आधिकारिक NIT, शर्तें, corrigendum और अंतिम तिथि जरूर जांचें।"

  // Add company branding
  if (settings?.companyName) {
    post += `\n\n${settings.companyName}`;
    if (settings.companyTagline) {
      post += `\n${settings.companyTagline}`;
    }
  }
  if (contactInfo) {
    post += `\n${contactInfo}`;
  }

  // Add data source notice
  if (tender.dataSource === 'sample') {
    post += `\n\n\u26A0\uFE0F \u0938\u0942\u091A\u0928\u093E: \u092F\u0939 SAMPLE DATA \u0939\u0948 \u2014 \u0935\u093E\u0938\u094D\u0924\u0935\u093F\u0915 \u091F\u0947\u0902\u0921\u0930 \u0928\u0939\u0940\u0902\u0964 \u0915\u0947\u0935\u0932 \u092A\u094D\u0930\u0926\u0930\u094D\u0936\u0928 \u0915\u0947 \u0932\u093F\u090F\u0964`;
    // "⚠️ सूचना: यह SAMPLE DATA है — वास्तविक टेंडर नहीं। केवल प्रदर्शन के लिए।"
  } else if (tender.dataSource === 'imported') {
    post += `\n\n\u0921\u0947\u091F\u093E \u0938\u094D\u0930\u094B\u0924: \u0906\u0927\u093F\u0915\u093E\u0930\u093F\u0915 \u092A\u094B\u0930\u094D\u091F\u0932 \u0938\u0947 \u0906\u092F\u093E\u0924\u093F\u0924 (mptenders.gov.in)`;
    // "डेटा स्रोत: आधिकारिक पोर्टल से आयातित (mptenders.gov.in)"
  } else {
    post += `\n\u0921\u0947\u091F\u093E \u0938\u094D\u0930\u094B\u0924: \u092E\u0948\u0928\u0941\u0905\u0932 \u0926\u0930\u094D\u091C \u0915\u093F\u092F\u093E \u0917\u092F\u093E`;
    // "डेटा स्रोत: मैनुअल दर्ज किया गया"
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
        '\u091C\u0928\u0935\u0930\u0940', '\u092B\u0930\u0935\u0930\u0940', '\u092E\u093E\u0930\u094D\u091A', '\u0905\u092A\u094D\u0930\u0948\u0932', '\u092E\u0908', '\u091C\u0942\u0928',
        '\u091C\u0941\u0932\u093E\u0908', '\u0905\u0917\u0938\u094D\u0924', '\u0938\u093F\u0924\u0902\u092C\u0930', '\u0905\u0915\u094D\u091F\u0942\u092C\u0930', '\u0928\u0935\u0902\u092C\u0930', '\u0926\u093F\u0938\u0902\u092C\u0930'
      ];
      // "जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून",
      // "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"
      return `${day} ${months[monthIdx]}, ${year}`;
    }
    // Handle DD-Mon-YYYY format
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const months = [
        '\u091C\u0928\u0935\u0930\u0940', '\u092B\u0930\u0935\u0930\u0940', '\u092E\u093E\u0930\u094D\u091A', '\u0905\u092A\u094D\u0930\u0948\u0932', '\u092E\u0908', '\u091C\u0942\u0928',
        '\u091C\u0941\u0932\u093E\u0908', '\u0905\u0917\u0938\u094D\u0924', '\u0938\u093F\u0924\u0902\u092C\u0930', '\u0905\u0915\u094D\u091F\u0942\u092C\u0930', '\u0928\u0935\u0902\u092C\u0930', '\u0926\u093F\u0938\u0902\u092C\u0930'
      ];
      return `${date.getDate()} ${months[date.getMonth()]}, ${date.getFullYear()}`;
    }
  } catch {}
  return dateStr;
}
