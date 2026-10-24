# TENDER IMPORT FIX - DIAGNOSTIC REPORT

## Root Cause Analysis

### Why only 2-3 tenders were detected when ~10 were pasted:

1. **`i += 6` hard-coded skip (PRIMARY CAUSE)**
   - File: `src/utils/tenderImport.ts`, line 446 (old code)
   - The `parseTextContent()` function blindly skipped 6 lines after finding a tender title
   - If a tender had fewer or more lines than expected, subsequent records were missed
   - Example: If tender #3 had only 4 lines, lines 5-6 would be skipped, potentially eating into tender #4's title

2. **Restrictive title detection**
   - Only matched lines starting with `\d+\.\s+` (numbered) or very long text (>20 chars) not starting with `[` or digit
   - Missed titles in key-value format, unnumbered blocks, or titles preceded by labels

3. **Single date format assumption**
   - Only matched `DD-MMM-YYYY HH:MM AM/PM` format
   - Failed for `YYYY-MM-DD`, `DD/MM/YYYY`, `DD.MM.YYYY` formats common in government documents

4. **HTML parser required `mptenders.gov.in` in href**
   - When content was pasted as plain text (Ctrl+A, Ctrl+C), links lost their full URLs
   - The parser would find 0 matches and fall through to text parsing, which had the skip bug

5. **No block boundary detection**
   - No mechanism to identify where one tender record ends and another begins
   - Relied entirely on line counting which is fragile

## Files Changed

| File | Change |
|------|--------|
| `src/utils/tenderImport.ts` | **Complete rewrite** of parsing logic |
| `src/App.tsx` | Enhanced ImportView with preview editing, stats, AI config |
| `src/__tests__/acceptance.test.ts` | Comprehensive test suite with 14 tests |

## What Was Preserved (Not Modified)

- ✅ Dashboard view and layout
- ✅ Banner generation (`bannerGenerator.ts` untouched)
- ✅ Clipboard functionality (in App.tsx, unchanged)
- ✅ Post generation (`postGenerator.ts` untouched)
- ✅ CSV export (`csvExport.ts` untouched)
- ✅ Storage/persistence (`storage.ts` untouched)
- ✅ Filter system
- ✅ CAPTCHA handling notice
- ✅ Sample data loading
- ✅ All existing Tender type fields

## New Parsing Strategies (in order of attempt)

1. **HTML DOM Parsing** - Uses DOMParser for actual HTML content
2. **HTML Regex Parsing** - Fallback for malformed HTML
3. **Structured Text Parsing** - Key-value pair format (Tender ID:, Title:, etc.)
4. **Block-based Text Parsing** - Flexible block splitting with multiple heuristics
5. **Aggressive Line Parsing** - Last resort using tender ID patterns as anchors

## Block Splitting Heuristics

The new `splitIntoTenderBlocks()` function uses 5 strategies:
- Double newlines (common in copy-paste)
- Numbered items (1. 2. 3.)
- Reference number patterns [xxx][xxx]
- Header keywords (Tender ID:, Reference Number:, etc.)
- Separator lines (---, ===, ***)

It automatically selects the strategy that produces the most blocks.

## AI-Assisted Extraction

### Configuration
- Configurable via the Import UI (Settings gear icon)
- Supports OpenAI, Anthropic, and custom endpoints
- API keys stored in localStorage (browser-only)
- **Not enabled by default** — deterministic parsing always works first

### How It Works
1. Deterministic parser runs first
2. If fewer than 5 candidates detected AND AI is configured, AI is tried
3. AI results are validated and normalized before display
4. If AI fails or returns fewer results, deterministic results are kept
5. AI failures never crash the app or lose records

### Security Note
- API keys are stored in browser localStorage only
- For production deployment, route through a secure server-side API
- The app clearly indicates when AI mode is active vs. not configured
- Never exposes keys in network requests to third parties beyond the configured endpoint

## Import Preview Features

- ✅ Table showing all detected records with key fields
- ✅ Checkbox selection (select/deselect individual records)
- ✅ Select All / Deselect All buttons
- ✅ Inline editing of any field (click edit icon)
- ✅ Accurate count: "X of Y selected"
- ✅ Stats panel showing: Candidates Detected, Parsed, Needs Review, Rejected
- ✅ Warning when estimated record count exceeds detected count
- ✅ AI configuration panel (collapsible)

## Test Results

### Test Fixture: 10 Distinct Tender Records

The test file contains these fixtures:
1. **SAMPLE_HTML** - 10 tenders in standard mptenders.gov.in HTML table format
2. **SAMPLE_STRUCTURED_TEXT** - 3 tenders in key-value format
3. **SAMPLE_NUMBERED_TEXT** - 5 tenders in numbered list format
4. **SAMPLE_MIXED_TEXT** - 4 tenders with mixed formats and missing fields
5. **SAMPLE_CSV** - 3 tenders in CSV format
6. **SAMPLE_DUPLICATE** - Same HTML pasted twice (duplicate testing)

### Tests Run (14 total):

| Test | Description | Status |
|------|-------------|--------|
| A | All 10 tenders detected from standard HTML | ✅ |
| B | Fields extracted correctly from HTML | ✅ |
| C | Structured key-value text parsed correctly | ✅ |
| D | Numbered list format parsed correctly | ✅ |
| E | Mixed format - missing fields remain empty | ✅ |
| F | CSV import works correctly | ✅ |
| G | Duplicate content handling | ✅ |
| H | Statistics accuracy | ✅ |
| I | All 10 candidates appear in output | ✅ |
| J | Hindi post generation with imported data | ✅ |
| K | Hybrid extraction without AI | ✅ |
| L | Empty/invalid input handled gracefully | ✅ |
| M | Imported tenders have correct data source | ✅ |
| N | Dates normalized to YYYY-MM-DD format | ✅ |

## Accurate Reporting

The importer now reports:
- **Candidates Detected**: Total plausible tender records found
- **Parsed**: Successfully extracted with all key fields
- **Needs Review**: Records with missing critical fields (ID, date)
- **Rejected**: Lines/blocks that couldn't be interpreted as tenders
- **Duplicates**: Records with matching tender IDs
- **Missing Fields**: Count per field type

### Warning System
If the input appears to contain ~10 tender records (estimated via ID patterns, dates, links) but fewer than 8 are detected, a warning is shown:
> ⚠️ Input appears to contain ~10 tender records, but only 3 were detected. Configure AI extraction in Settings for better results.

## Remaining Limitations

1. **No server-side AI**: API keys must be configured by the user in their browser. For production, a server-side proxy is recommended.
2. **Portal access**: The official mptenders.gov.in portal still blocks automated browser requests (CORS, CAPTCHA). The paste method remains the primary import path.
3. **Very irregular formats**: Some extremely non-standard formats may still need manual review. The "Needs Review" flag and inline editing handle this.
4. **Image/PDF extraction**: Not supported. Only text and HTML input.
5. **Rate limiting**: AI extraction is limited by the configured provider's rate limits.

## Build Status

✅ **Build passes successfully** - `npm run build` completes without errors.
