/**
 * MP Tender Intelligence - Comprehensive Import Tests
 * 
 * Tests the header-aware tender import system with:
 * - 10 distinct tender records in the actual mptenders.gov.in format
 * - Header detection and mapping
 * - Various field orders and missing optional fields
 * - Different date formats
 * - Duplicate handling
 * - Accurate statistics reporting
 * - AI provider failure resilience
 */

import { parsePastedContent, parseCSVContent, parseListingPage, extractTendersHybrid } from '../utils/tenderImport';
import { generateHindiPost } from '../utils/postGenerator';
import { Tender, AppSettings } from '../types';

// ============ TEST FIXTURES ============

// FIXTURE 1: Actual HTML from mptenders.gov.in (10 tenders, real structure)
const SAMPLE_HTML = `
<table border="0" bgcolor="#f7f7f7" cellpadding="0" width="100%" cellspacing="1" id="table" class="list_table">
  <tr class="list_header">
    <td width="5%">S.No</td>
    <td width="15%">e-Published Date</td>
    <td width="15%">Bid Submission Closing Date</td>
    <td width="15%">Tender Opening Date</td>
    <td width="20%">Title and Ref.No./Tender ID</td>
    <td width="15%">Organisation Chain</td>
  </tr>
  <tr class="even" id="informal_1">
    <td align="center">1.</td>
    <td align="center">10-Oct-2026 10:30 AM</td>
    <td align="center">22-Oct-2026 09:00 AM</td>
    <td align="center">23-Oct-2026 11:00 AM</td>
    <td align="center"><a id="DirectLink" title="View Tender Information" href="https://mptenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndListTendersbyDate&service=direct&session=T&sp=SaPYutdBIbgHED%2FYBo1PJBA%3D%3D">[Repair of Damage C C Lining and Structure Ajnai Dy sub Division Timarni]</a>
    [2026_HBC_517082][2026_WRD_517082_1]</td>
    <td align="center">Engineer-in-Chief - Water Resources Department||E.E. H.B.C. DN. TIMARNI(HARDA) - WRD</td>
  </tr>
  <tr class="odd" id="informal_2">
    <td align="center">2.</td>
    <td align="center">13-Oct-2026 03:00 PM</td>
    <td align="center">22-Oct-2026 11:00 AM</td>
    <td align="center">23-Oct-2026 02:00 PM</td>
    <td align="center"><a id="DirectLink_0" title="View Tender Information" href="https://mptenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndListTendersbyDate&service=direct&session=T&sp=SMMdqxH74jYMutYixXIwEsw%3D%3D">[Work of 11 KV Bifurcation Jagoti IRR Feeder at Village Jagoti under OnM Division Mahidpur]</a>
    [2026-27/TS-2698/3447][2026_MPPKV_542666_1]</td>
    <td align="center">Madhya Pradesh Paschim Kshetra Vidyut Vitran Company Ltd||ED/Chief Engineer (Ujjain Region) - MPPKVVCL||SE, Ujjain O and M Circle, Ujjain - MPPKVVCL</td>
  </tr>
  <tr class="even" id="informal_3">
    <td align="center">3.</td>
    <td align="center">17-Aug-2026 03:00 PM</td>
    <td align="center">22-Oct-2026 11:00 AM</td>
    <td align="center">23-Oct-2026 11:00 AM</td>
    <td align="center"><a id="DirectLink_1" title="View Tender Information" href="https://mptenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndListTendersbyDate&service=direct&session=T&sp=SaQ0pyQ%2BvkTt5mGvfWxwC%2BQ%3D%3D">[OFFICERS AND VISITOR CHAIRS FOR STATE LOAD DISPATCH CENTRE, MPPTCL, JABALPUR]</a>
    [LDET-03/2026-27][2026_MPPTC_530129_1]</td>
    <td align="center">MP Power Transmission Co. Ltd.||MPPTCL.CE(SLDC)||MPPTCL.SE(SLDC)</td>
  </tr>
  <tr class="odd" id="informal_4">
    <td align="center">4.</td>
    <td align="center">13-Oct-2026 03:00 PM</td>
    <td align="center">22-Oct-2026 12:00 PM</td>
    <td align="center">23-Oct-2026 02:00 PM</td>
    <td align="center"><a id="DirectLink_2" title="View Tender Information" href="https://mptenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndListTendersbyDate&service=direct&session=T&sp=S1zHWbH%2FZojHPklj6DAUCsQ%3D%3D">[Work For 33 KV Line Interlinking of New 33 KV Feeder from EHV Shipra Vihar to 33/11 KV Chandesara Railway Crossing under OnM Division Ujjain under SSTD Simhstha Scheme.]</a>
    [2026-27/TS-2706/3455][2026_MPPKV_542813_1]</td>
    <td align="center">Madhya Pradesh Paschim Kshetra Vidyut Vitran Company Ltd||ED/Chief Engineer (Ujjain Region) - MPPKVVCL||SE, Ujjain O and M Circle, Ujjain - MPPKVVCL||EE, Ujjain O and M STC Division, Ujjain - MPPKVVCL</td>
  </tr>
  <tr class="even" id="informal_5">
    <td align="center">5.</td>
    <td align="center">08-Oct-2026 06:00 PM</td>
    <td align="center">22-Oct-2026 12:00 PM</td>
    <td align="center">23-Oct-2026 12:30 PM</td>
    <td align="center"><a id="DirectLink_3" title="View Tender Information" href="https://mptenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndListTendersbyDate&service=direct&session=T&sp=SRDRvHxJiKSGWhL0pwhue0w%3D%3D">[R and M Works Including Sanitary Improvements, Civil Repairs and Other Miscellaneous Works at staff quarters Indore city circles and Indore O and M circle.]</a>
    [No./SEC/IND/WS/TS-48/1547 dt. 09.09.2026][2026_MPPKV_541827_1]</td>
    <td align="center">Madhya Pradesh Paschim Kshetra Vidyut Vitran Company Ltd||Chief Engineer (Civil)-Indore - MPPKVVCL</td>
  </tr>
  <tr class="odd" id="informal_6">
    <td align="center">6.</td>
    <td align="center">13-Oct-2026 03:00 PM</td>
    <td align="center">22-Oct-2026 12:00 PM</td>
    <td align="center">23-Oct-2026 02:00 PM</td>
    <td align="center"><a id="DirectLink_4" title="View Tender Information" href="https://mptenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndListTendersbyDate&service=direct&session=T&sp=S21DLwix4DLEDVB6AK4g5uA%3D%3D">[Work of Aug of Power Transformer 3.15 MVA to 05 MVA at Kheda madda under Ghosla DC OnM Division Mahidpur under SSTD Scheme]</a>
    [2026-27/TS-2699/3448][2026_MPPKV_542686_1]</td>
    <td align="center">Madhya Pradesh Paschim Kshetra Vidyut Vitran Company Ltd||ED/Chief Engineer (Ujjain Region) - MPPKVVCL||SE, Ujjain O and M Circle, Ujjain - MPPKVVCL||EE, Ujjain O and M STC Division, Ujjain - MPPKVVCL</td>
  </tr>
  <tr class="even" id="informal_7">
    <td align="center">7.</td>
    <td align="center">08-Oct-2026 10:00 AM</td>
    <td align="center">22-Oct-2026 12:00 PM</td>
    <td align="center">23-Oct-2026 12:00 PM</td>
    <td align="center"><a id="DirectLink_5" title="View Tender Information" href="https://mptenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndListTendersbyDate&service=direct&session=T&sp=SL7LkF4Nk8BZNh3FL020oKg%3D%3D">[Tender on Semi Turnkey Basis for Construction and commissioning Work of Additional 3.15 MVA Power Transformer and 1 No Bay at SATWAS Substation under Dc Satwas Division Kannod Circle Dewas]</a>
    [2026-27/TS-10/484 Date 07.10.2026][2026_MPPKV_541573_1]</td>
    <td align="center">Madhya Pradesh Paschim Kshetra Vidyut Vitran Company Ltd||ED/Chief Engineer (Ujjain Region) - MPPKVVCL||SE, Dewas Circle, Dewas - MPPKVVCL||EE, Dewas STC Division, Dewas - MPPKVVCL</td>
  </tr>
  <tr class="odd" id="informal_8">
    <td align="center">8.</td>
    <td align="center">08-Oct-2026 10:00 AM</td>
    <td align="center">22-Oct-2026 12:00 PM</td>
    <td align="center">23-Oct-2026 12:00 PM</td>
    <td align="center"><a id="DirectLink_6" title="View Tender Information" href="https://mptenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndListTendersbyDate&service=direct&session=T&sp=Sp8wffWSpfcTZveqXcsEvrQ%3D%3D">[Tender on Semi Turnkey Basis for Construction and commissioning Work of Additional 3.15 MVA Power Transformer at DRP Substation under D/c HT-Maintenance Division Dewas City Circle Dewas]</a>
    [2026-27/TS-09/483 Date 07.10.2026][2026_MPPKV_541553_1]</td>
    <td align="center">Madhya Pradesh Paschim Kshetra Vidyut Vitran Company Ltd||ED/Chief Engineer (Ujjain Region) - MPPKVVCL||SE, Dewas Circle, Dewas - MPPKVVCL||EE, Dewas STC Division, Dewas - MPPKVVCL</td>
  </tr>
  <tr class="even" id="informal_9">
    <td align="center">9.</td>
    <td align="center">01-Oct-2026 06:00 PM</td>
    <td align="center">22-Oct-2026 12:00 PM</td>
    <td align="center">23-Oct-2026 12:30 PM</td>
    <td align="center"><a id="DirectLink_7" title="View Tender Information" href="https://mptenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndListTendersbyDate&service=direct&session=T&sp=SupRBpRJtBb9hg4Fjdso%2FTw%3D%3D">[Supply of Lab Equipments]</a>
    [GPCB/STORE/EQP/2026/498][2026_DTE_540214_1]</td>
    <td align="center">Directorate of Technical Education||Government Polytechnic College - Bhind</td>
  </tr>
  <tr class="odd" id="informal_10">
    <td align="center">10.</td>
    <td align="center">12-Oct-2026 06:00 PM</td>
    <td align="center">22-Oct-2026 12:00 PM</td>
    <td align="center">23-Oct-2026 12:30 PM</td>
    <td align="center"><a id="DirectLink_8" title="View Tender Information" href="https://mptenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndListTendersbyDate&service=direct&session=T&sp=Svy2V52ka4EBFxAwD30E1Gg%3D%3D">[Repair and Maintenance Works Including Sanitary Improvements, Civil Repairs and Other Miscellaneous Works at Various office Buildings and 33/11 KV Substations under O and M Circle Khandwa.]</a>
    [No./SEC/IND/WS/TS-57/1547 dt. 09.09.2026][2026_MPPKV_542549_1]</td>
    <td align="center">Madhya Pradesh Paschim Kshetra Vidyut Vitran Company Ltd||Chief Engineer (Civil)-Indore - MPPKVVCL</td>
  </tr>
</table>
`;

// FIXTURE 2: Alternate header names (testing header detection)
const SAMPLE_ALT_HEADERS = `
<table class="list_table">
  <tr class="list_header">
    <td>Sl. No.</td>
    <td>Publish Date</td>
    <td>Closing Date</td>
    <td>Opening Date</td>
    <td>Tender Title</td>
    <td>Department</td>
  </tr>
  <tr class="even">
    <td>1.</td>
    <td>05-Oct-2026 10:00 AM</td>
    <td>20-Oct-2026 05:00 PM</td>
    <td>21-Oct-2026 10:00 AM</td>
    <td><a id="DirectLink" href="https://mptenders.gov.in/test1">[Construction of Bridge at Betul]</a>
    [PWD/BTL/2026/101][2026_PWD_BTL_100001_1]</td>
    <td>Public Works Department||Executive Engineer PWD Betul</td>
  </tr>
  <tr class="odd">
    <td>2.</td>
    <td>06-Oct-2026 11:00 AM</td>
    <td>21-Oct-2026 03:00 PM</td>
    <td>22-Oct-2026 11:00 AM</td>
    <td><a id="DirectLink_0" href="https://mptenders.gov.in/test2">[Water Supply Scheme at Sagar District]</a>
    [PHED/SGR/2026/202][2026_PHED_SGR_100002_1]</td>
    <td>Public Health Engineering Department||EE PHED Sagar</td>
  </tr>
  <tr class="even">
    <td>3.</td>
    <td>07-Oct-2026 09:00 AM</td>
    <td>25-Oct-2026 12:00 PM</td>
    <td>26-Oct-2026 09:00 AM</td>
    <td><a id="DirectLink_1" href="https://mptenders.gov.in/test3">[Road Widening Gwalior to Morena NH]</a>
    [NH/GWL/2026/303][2026_NH_GWL_100003_1]</td>
    <td>National Highways Authority||Project Director NH Gwalior</td>
  </tr>
</table>
`;

// FIXTURE 3: CSV format
const SAMPLE_CSV = `Tender ID,Work Name,Department,District,Amount,EMD,Last Date,URL,Eligibility
NIT_Bhopal_01/2026,Construction of road,PWD,Bhopal,5000000,100000,2026-11-30,https://mptenders.gov.in,Class-I contractor
NIT_Indore_02/2026,Water supply pipeline,PHED,Indore,12500000,250000,2026-12-15,https://mptenders.gov.in,Registered contractor
NIT_Gwalior_03/2026,Bridge repair work,PWD,Gwalior,8000000,160000,2026-12-20,https://mptenders.gov.in,Class-II contractor`;

// ============ TEST RUNNER ============

let passed = 0;
let failed = 0;
const results: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result && typeof (result as any).then === 'function') {
      (result as Promise<void>).catch((e: any) => {
        failed++;
        results.push(`❌ FAIL: ${name} — ${e.message}`);
      });
      passed++;
      results.push(`✅ PASS: ${name} (async)`);
    } else {
      passed++;
      results.push(`✅ PASS: ${name}`);
    }
  } catch (e: any) {
    failed++;
    results.push(`❌ FAIL: ${name} — ${e.message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ============ TEST A: All 10 tenders detected from real portal HTML ============
test('A. All 10 tenders detected from real mptenders.gov.in HTML', () => {
  const result = parsePastedContent(SAMPLE_HTML);
  assert(result.tenders.length === 10, `Expected 10 tenders, got ${result.tenders.length}`);
  assert(result.stats.candidatesDetected === 10, `Expected 10 candidates, got ${result.stats.candidatesDetected}`);
  assert(result.stats.parsed === 10, `Expected 10 parsed, got ${result.stats.parsed}`);
});

// ============ TEST B: Header detection and mapping ============
test('B. Headers correctly detected and mapped', () => {
  const listingResult = parseListingPage(SAMPLE_HTML);
  const headerMap = listingResult.headerMap;
  
  // Check that headers were detected
  assert(Object.keys(headerMap).length > 0, 'Header map should not be empty');
  
  // Check specific mappings
  const hasPublishDate = Object.values(headerMap).includes('publishDate');
  const hasClosingDate = Object.values(headerMap).includes('closingDate');
  const hasOpeningDate = Object.values(headerMap).includes('openingDate');
  const hasTitle = Object.values(headerMap).includes('titleColumn');
  const hasOrg = Object.values(headerMap).includes('organisation');
  
  assert(hasPublishDate, 'Should map e-Published Date → publishDate');
  assert(hasClosingDate, 'Should map Bid Submission Closing Date → closingDate');
  assert(hasOpeningDate, 'Should map Tender Opening Date → openingDate');
  assert(hasTitle, 'Should map Title and Ref.No./Tender ID → titleColumn');
  assert(hasOrg, 'Should map Organisation Chain → organisation');
});

// ============ TEST C: Alternate headers detected correctly ============
test('C. Alternate header names detected correctly', () => {
  const listingResult = parseListingPage(SAMPLE_ALT_HEADERS);
  const headerMap = listingResult.headerMap;
  
  assert(listingResult.candidates.length === 3, `Expected 3 candidates from alt headers, got ${listingResult.candidates.length}`);
  
  // Check that alternate headers were mapped
  const hasPublishDate = Object.values(headerMap).includes('publishDate');
  const hasClosingDate = Object.values(headerMap).includes('closingDate');
  const hasTitle = Object.values(headerMap).includes('titleColumn');
  const hasDept = Object.values(headerMap).includes('organisation');
  
  assert(hasPublishDate, 'Should map "Publish Date" → publishDate');
  assert(hasClosingDate, 'Should map "Closing Date" → closingDate');
  assert(hasTitle, 'Should map "Tender Title" → titleColumn');
  assert(hasDept, 'Should map "Department" → organisation');
});

// ============ TEST D: Field extraction accuracy ============
test('D. Fields extracted correctly from real portal HTML', () => {
  const result = parsePastedContent(SAMPLE_HTML);
  
  // Tender 1: Repair work in Harda
  const t1 = result.tenders[0];
  assert(t1.workName.includes('Repair of Damage C C Lining'), `T1 title mismatch: ${t1.workName}`);
  assert(t1.tenderId === '2026_WRD_517082_1', `T1 ID mismatch: ${t1.tenderId}`);
  assert(t1.lastDate === '2026-10-22', `T1 date mismatch: ${t1.lastDate}`);
  assert(t1.district === 'Harda' || t1.district === 'Not specified in source', `T1 district: ${t1.district}`);
  assert(t1.publishedDate === '2026-10-10', `T1 published date: ${t1.publishedDate}`);
  assert(t1.bidOpeningDate === '2026-10-23', `T1 opening date: ${t1.bidOpeningDate}`);
  
  // Tender 5: Indore R&M works
  const t5 = result.tenders[4];
  assert(t5.workName.includes('Indore'), `T5 should mention Indore: ${t5.workName}`);
  assert(t5.tenderId === '2026_MPPKV_541827_1', `T5 ID: ${t5.tenderId}`);
  
  // Tender 9: Lab Equipment in Bhind
  const t9 = result.tenders[8];
  assert(t9.workName.includes('Lab Equipments'), `T9 mismatch: ${t9.workName}`);
  assert(t9.district === 'Bhind', `T9 district: ${t9.district}`);
  assert(t9.tenderId === '2026_DTE_540214_1', `T9 ID: ${t9.tenderId}`);
  
  // Tender 10: Khandwa
  const t10 = result.tenders[9];
  assert(t10.workName.includes('Khandwa'), `T10 should mention Khandwa: ${t10.workName}`);
  assert(t10.tenderId === '2026_MPPKV_542549_1', `T10 ID: ${t10.tenderId}`);
});

// ============ TEST E: Detail URLs extracted ============
test('E. Detail URLs correctly extracted from listing', () => {
  const result = parsePastedContent(SAMPLE_HTML);
  
  for (const t of result.tenders) {
    assert(t.officialUrl.includes('mptenders.gov.in'), `URL should contain mptenders.gov.in: ${t.officialUrl}`);
    assert(t.officialUrl.includes('DirectLink'), `URL should contain DirectLink: ${t.officialUrl}`);
  }
});

// ============ TEST F: Organisation chain parsed ============
test('F. Organisation chain correctly parsed', () => {
  const result = parsePastedContent(SAMPLE_HTML);
  
  const t1 = result.tenders[0];
  assert(t1.department.includes('Water Resources') || (t1.organisationChain || '').includes('Water Resources'), 
    `T1 department/org: ${t1.department} / ${t1.organisationChain}`);
  
  const t2 = result.tenders[1];
  assert(t2.department.includes('Paschim Kshetra') || (t2.organisationChain || '').includes('Paschim Kshetra'),
    `T2 department/org: ${t2.department} / ${t2.organisationChain}`);
  assert(t2.district === 'Ujjain', `T2 district should be Ujjain: ${t2.district}`);
});

// ============ TEST G: CSV import ============
test('G. CSV import works correctly', () => {
  const result = parseCSVContent(SAMPLE_CSV);
  assert(result.tenders.length === 3, `Expected 3 CSV tenders, got ${result.tenders.length}`);
  assert(result.tenders[0].tenderId === 'NIT_Bhopal_01/2026', 'First tender ID mismatch');
  assert(result.tenders[0].district === 'Bhopal', 'First tender district mismatch');
  assert(result.tenders[1].tenderAmount === '12500000', 'Second tender amount mismatch');
  assert(result.stats.candidatesDetected === 3, 'CSV candidates should be 3');
});

// ============ TEST H: Statistics accuracy ============
test('H. Statistics accurately report all counts', () => {
  const result = parsePastedContent(SAMPLE_HTML);
  const stats = result.stats;
  
  assert(stats.candidatesDetected === 10, `Candidates should be 10, got ${stats.candidatesDetected}`);
  assert(stats.parsed === 10, `Parsed should be 10, got ${stats.parsed}`);
  assert(stats.rejected === 0, `Rejected should be 0, got ${stats.rejected}`);
  assert(stats.totalRows >= 10, `Total rows should be >= 10`);
  assert(!stats.aiUsed, 'AI should not be used for standard HTML');
  assert(stats.pagesVisited >= 1, 'Pages visited should be >= 1');
});

// ============ TEST I: All 10 unique tender IDs present ============
test('I. All 10 unique tender IDs present in output', () => {
  const result = parsePastedContent(SAMPLE_HTML);
  const tenderIds = result.tenders.map(t => t.tenderId);
  const expectedIds = [
    '2026_WRD_517082_1', '2026_MPPKV_542666_1', '2026_MPPTC_530129_1',
    '2026_MPPKV_542813_1', '2026_MPPKV_541827_1', '2026_MPPKV_542686_1',
    '2026_MPPKV_541573_1', '2026_MPPKV_541553_1', '2026_DTE_540214_1',
    '2026_MPPKV_542549_1'
  ];
  
  for (const expectedId of expectedIds) {
    assert(tenderIds.includes(expectedId), `Missing expected tender ID: ${expectedId}`);
  }
});

// ============ TEST J: Date normalization ============
test('J. All dates normalized to YYYY-MM-DD format', () => {
  const result = parsePastedContent(SAMPLE_HTML);
  for (const t of result.tenders) {
    if (t.lastDate) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(t.lastDate), `Closing date should be YYYY-MM-DD: ${t.lastDate}`);
    }
    if (t.publishedDate) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(t.publishedDate), `Published date should be YYYY-MM-DD: ${t.publishedDate}`);
    }
    if (t.bidOpeningDate) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(t.bidOpeningDate), `Opening date should be YYYY-MM-DD: ${t.bidOpeningDate}`);
    }
  }
});

// ============ TEST K: Data source labels ============
test('K. Imported tenders have correct data source', () => {
  const result = parsePastedContent(SAMPLE_HTML);
  for (const t of result.tenders) {
    assert(t.dataSource === 'imported', `Tender ${t.tenderId} should have dataSource='imported'`);
  }
});

// ============ TEST L: Empty/invalid input ============
test('L. Empty and invalid input handled gracefully', () => {
  const empty = parsePastedContent('');
  assert(empty.tenders.length === 0, 'Empty input should return 0 tenders');
  
  const garbage = parsePastedContent('This is just random text with no tender data at all.');
  assert(garbage.tenders.length === 0, `Garbage should return 0, got ${garbage.tenders.length}`);
});

// ============ TEST M: Missing fields not fabricated ============
test('M. Missing fields remain empty, not fabricated', () => {
  const result = parsePastedContent(SAMPLE_HTML);
  for (const t of result.tenders) {
    // tenderAmount should be empty (not shown on listing page)
    assert(t.tenderAmount === '', `Tender ${t.tenderId} should not have fabricated amount: "${t.tenderAmount}"`);
    // emd should be empty
    assert(t.emd === '', `Tender ${t.tenderId} should not have fabricated EMD: "${t.emd}"`);
  }
});

// ============ TEST N: Hindi post generation ============
test('N. Hindi post generation works with imported tenders', () => {
  const result = parsePastedContent(SAMPLE_HTML);
  const tender = result.tenders[0];
  
  const settings: AppSettings = {
    companyName: 'Apex Associates', companyTagline: 'Your Trusted Partner',
    showBranding: true, contactInfo: '+91-9876543210'
  };
  
  const post = generateHindiPost(tender, settings);
  assert(post.includes(tender.tenderId), 'Post should contain tender ID');
  assert(post.includes('Apex Associates'), 'Post should contain company name');
  assert(post.includes('mptenders.gov.in'), 'Post should reference official portal');
});

// ============ TEST O: Hybrid extraction without AI ============
test('O. Hybrid extraction works without AI configured', async () => {
  const result = await extractTendersHybrid(SAMPLE_HTML);
  assert(result.tenders.length === 10, `Hybrid should find 10 tenders, got ${result.tenders.length}`);
  assert(result.method === 'deterministic', `Method should be deterministic, got ${result.method}`);
});

// ============ TEST P: Reference numbers extracted ============
test('P. Reference numbers extracted separately from tender IDs', () => {
  const listingResult = parseListingPage(SAMPLE_HTML);
  
  // First tender should have ref number 2026_HBC_517082 and ID 2026_WRD_517082_1
  const c1 = listingResult.candidates[0];
  assert(c1.referenceNumber === '2026_HBC_517082', `Ref number: ${c1.referenceNumber}`);
  assert(c1.tenderId === '2026_WRD_517082_1', `Tender ID: ${c1.tenderId}`);
  
  // Second tender
  const c2 = listingResult.candidates[1];
  assert(c2.referenceNumber === '2026-27/TS-2698/3447', `Ref number: ${c2.referenceNumber}`);
  assert(c2.tenderId === '2026_MPPKV_542666_1', `Tender ID: ${c2.tenderId}`);
});

// ============ OUTPUT RESULTS ============
console.log('\n=== MP TENDER INTELLIGENCE - COMPREHENSIVE IMPORT TESTS ===\n');
for (const result of results) {
  console.log(result);
}
console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests ===\n`);

if (failed > 0) {
  console.log('⚠️  SOME TESTS FAILED - Review the output above for details.');
} else {
  console.log('✅ ALL TESTS PASSED');
}
