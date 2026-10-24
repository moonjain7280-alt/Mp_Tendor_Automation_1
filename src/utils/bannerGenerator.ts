import { Tender, AppSettings } from '../types';

/**
 * Generate a professional PNG banner (1080x1350) for a tender.
 * Uses Canvas API for programmatic generation.
 * Only shows verified data from the tender record.
 * 
 * NOTE: Emojis may not render in all canvas environments.
 * Using text labels instead for maximum compatibility.
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
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MADHYA PRADESH TENDER UPDATE', 540, 115);

  // Hindi subtitle
  ctx.font = '22px sans-serif';
  ctx.fillStyle = '#ffe066';
  ctx.fillText('\u092E\u0927\u094D\u092F \u092A\u094D\u0930\u0926\u0947\u0936 \u091F\u0947\u0902\u0921\u0930 \u0905\u092A\u0921\u0947\u091F', 540, 148);

  // Gold divider
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(200, 165, 680, 3);

  // Data source indicator
  let sourceColor = '#ffffff';
  let sourceLabel = '';
  if (tender.dataSource === 'sample') {
    sourceColor = '#ff6b6b';
    sourceLabel = 'SAMPLE DATA';
  } else if (tender.dataSource === 'imported') {
    sourceColor = '#4ecdc4';
    sourceLabel = 'IMPORTED FROM OFFICIAL PORTAL';
  } else {
    sourceColor = '#a8e6cf';
    sourceLabel = 'MANUALLY ENTERED';
  }
  ctx.fillStyle = sourceColor;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(sourceLabel, 540, 190);

  // Tender ID - highlighted
  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 28px sans-serif';
  const tenderIdText = `Tender ID: ${tender.tenderId || 'N/A'}`;
  ctx.fillText(tenderIdText, 540, 235);

  // District and Department
  ctx.fillStyle = '#bac8ff';
  ctx.font = '20px sans-serif';
  const locationText = `${tender.district || 'N/A'} | ${tender.department || 'N/A'}`;
  ctx.fillText(locationText, 540, 270);

  // Work name
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  const workName = tender.workName || 'Not Available';
  const wrappedWorkName = wrapText(ctx, workName, 900);
  let y = 310;
  for (const line of wrappedWorkName) {
    ctx.fillText(line, 540, y);
    y += 30;
  }

  // Gold line
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(100, y + 15, 880, 2);
  y += 50;

  // Details section
  const details: { label: string; value: string }[] = [];
  
  if (tender.tenderAmount) {
    details.push({ label: 'Estimated Cost:', value: tender.tenderAmount });
  }
  if (tender.emd) {
    details.push({ label: 'EMD:', value: tender.emd });
  }
  if (tender.tenderFee) {
    details.push({ label: 'Tender Fee:', value: tender.tenderFee });
  }
  if (tender.lastDate) {
    details.push({ label: 'Last Date:', value: formatDateBanner(tender.lastDate) });
  }

  ctx.textAlign = 'left';
  for (const detail of details) {
    ctx.fillStyle = '#d4a017';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(detail.label, 120, y);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(detail.value, 380, y);
    y += 45;
  }

  // If no details available, show notice
  if (details.length === 0) {
    ctx.fillStyle = '#bac8ff';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Details not available in source', 540, y);
    y += 40;
  }

  // Deadline highlight box (if deadline exists)
  if (tender.lastDate) {
    y += 15;
    ctx.fillStyle = 'rgba(212, 160, 23, 0.15)';
    ctx.fillRect(100, y, 880, 70);
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 2;
    ctx.strokeRect(100, y, 880, 70);
    
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe066';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`DEADLINE: ${formatDateBanner(tender.lastDate)}`, 540, y + 44);
    y += 105;
  } else {
    y += 30;
  }

  // Official link note
  ctx.fillStyle = '#bac8ff';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Official Link: mptenders.gov.in', 540, y);
  y += 35;

  // Verification notice
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '14px sans-serif';
  ctx.fillText('Please verify all details from the official NIT before applying', 540, y);

  // Bottom branding section (only if configured)
  if (settings.showBranding && settings.companyName) {
    // Bottom gold bar
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(60, 1240, 960, 4);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#d4a017';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(settings.companyName, 540, 1280);

    if (settings.companyTagline) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px sans-serif';
      ctx.fillText(settings.companyTagline, 540, 1308);
    }
  }

  // Bottom gold bar
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(60, 1330, 960, 6);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to generate PNG blob'));
      }
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
  return lines.slice(0, 4); // Max 4 lines for work name
}

function formatDateBanner(dateStr: string): string {
  try {
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      const parts = dateStr.split('T')[0].split('-');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const monthIdx = parseInt(parts[1]) - 1;
      return `${parts[2]} ${months[monthIdx]} ${parts[0]}`;
    }
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }
  } catch {}
  return dateStr;
}
