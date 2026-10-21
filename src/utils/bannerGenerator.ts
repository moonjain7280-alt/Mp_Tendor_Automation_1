import { Tender, AppSettings } from '../types';

/**
 * Generate a professional PNG banner (1080x1350) for a tender.
 * Uses Canvas API for programmatic generation - no external dependencies.
 */
export async function generateBanner(
  tender: Tender,
  settings: AppSettings
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d')!;

  // Background gradient (navy blue)
  const gradient = ctx.createLinearGradient(0, 0, 0, 1350);
  gradient.addColorStop(0, '#0d1642');
  gradient.addColorStop(0.5, '#1a237e');
  gradient.addColorStop(1, '#0d1642');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);

  // Gold accent border
  ctx.strokeStyle = '#d4a017';
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 30, 1020, 1290);

  // Inner border
  ctx.strokeStyle = 'rgba(212, 160, 23, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(45, 45, 990, 1260);

  // Top gold bar
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(60, 60, 960, 6);

  // Header section
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏗️ मध्य प्रदेश टेंडर सूचना 🏗️', 540, 120);

  // Gold divider
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(200, 140, 680, 3);

  // Tender ID - highlighted
  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.fillText(`टेंडर ID: ${tender.tenderId || 'N/A'}`, 540, 200);

  // Work name
  ctx.fillStyle = '#ffffff';
  ctx.font = '24px Inter, sans-serif';
  const workName = tender.workName || 'Not Available';
  const wrappedWorkName = wrapText(ctx, workName, 900);
  let y = 260;
  for (const line of wrappedWorkName) {
    ctx.fillText(line, 540, y);
    y += 35;
  }

  // Details section
  y = Math.max(y + 40, 380);
  
  // Gold line
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(100, y, 880, 2);
  y += 40;

  // Detail rows
  const details = [
    { label: 'विभाग:', value: tender.department || 'Not Available' },
    { label: 'जिला:', value: tender.district || 'Not Available' },
    { label: 'अनुमानित राशि:', value: tender.tenderAmount || 'Not Available' },
    { label: 'EMD:', value: tender.emd || 'Not Available' },
    { label: 'अंतिम तिथि:', value: tender.lastDate ? formatDateBanner(tender.lastDate) : 'Not Available' },
  ];

  ctx.textAlign = 'left';
  for (const detail of details) {
    ctx.fillStyle = '#d4a017';
    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.fillText(detail.label, 120, y);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Inter, sans-serif';
    ctx.fillText(detail.value, 400, y);
    y += 50;
  }

  // Gold line
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(100, y + 10, 880, 2);
  y += 50;

  // Deadline highlight box
  ctx.fillStyle = 'rgba(212, 160, 23, 0.15)';
  ctx.fillRect(100, y, 880, 80);
  ctx.strokeStyle = '#d4a017';
  ctx.lineWidth = 2;
  ctx.strokeRect(100, y, 880, 80);
  
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 28px Inter, sans-serif';
  ctx.fillText(`⏰ अंतिम तिथि: ${tender.lastDate ? formatDateBanner(tender.lastDate) : 'N/A'}`, 540, y + 50);

  y += 120;

  // Official link note
  ctx.fillStyle = '#bac8ff';
  ctx.font = '20px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('आधिकारिक लिंक: mpeprocurement.gov.in', 540, y);

  y += 50;

  // Verification notice
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '18px Inter, sans-serif';
  ctx.fillText('⚠️ कृपया आधिकारिक वेबसाइट से सभी जानकारी सत्यापित करें', 540, y);

  // Sample data warning
  if (tender.dataSource === 'sample') {
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillText('⚠️ SAMPLE DATA - NOT A REAL TENDER ⚠️', 540, y + 50);
  }

  // Bottom branding section (only if configured)
  if (settings.showBranding) {
    // Bottom gold bar
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(60, 1240, 960, 4);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#d4a017';
    ctx.font = 'bold 30px Inter, sans-serif';
    ctx.fillText(settings.companyName || 'Apex Associates', 540, 1280);

    if (settings.companyTagline) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '18px Inter, sans-serif';
      ctx.fillText(settings.companyTagline, 540, 1310);
    }
  }

  // Bottom gold bar
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(60, 1330, 960, 6);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob!);
    }, 'image/png');
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 3); // Max 3 lines
}

function formatDateBanner(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  } catch {
    return dateStr;
  }
}
