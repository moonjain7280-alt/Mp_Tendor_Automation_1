import { Tender } from '../types';

export function exportToCSV(tenders: Tender[]): void {
  const headers = [
    'Tender ID',
    'Work Name',
    'Department',
    'District',
    'Tender Amount',
    'EMD',
    'Last Date',
    'Official URL',
    'Data Source',
    'Text Copied',
    'Banner Copied',
    'Published',
    'Created At',
    'Updated At'
  ];

  const rows = tenders.map(t => [
    t.tenderId,
    `"${(t.workName || '').replace(/"/g, '""')}"`,
    `"${(t.department || '').replace(/"/g, '""')}"`,
    t.district,
    t.tenderAmount,
    t.emd,
    t.lastDate,
    t.officialUrl,
    t.dataSource,
    t.textCopied ? 'Yes' : 'No',
    t.bannerCopied ? 'Yes' : 'No',
    t.manuallyPublished ? 'Yes' : 'No',
    t.createdAt,
    t.updatedAt
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mp_tenders_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
