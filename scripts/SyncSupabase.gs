/**
 * Sync Supabase `instagram_posts_export` view -> this Google Sheet.
 *
 * Pulls the dealer-joined Instagram-post data from Supabase's auto-generated
 * REST API and rewrites a sheet tab with it. One-way (Supabase is the source of
 * truth). Runs manually from the menu, or automatically on a daily time trigger.
 *
 * SETUP (one time):
 *   1. In the Sheet:  Extensions -> Apps Script
 *   2. Paste this whole file, replacing the default Code.gs contents.
 *   3. Run `setUpDailyTrigger` once (authorize when prompted) to schedule it.
 *   4. Reload the Sheet -> use the "Supabase Sync" menu -> "Sync now" to test.
 *
 * The publishable (anon) key below is safe to embed: the export view is
 * read-only and the underlying tables already have public SELECT enabled.
 */

const SUPABASE_URL = 'https://gywnxuoaiwbbqxckwymn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_o_tkpaXy_g5MMhtv2uEBkg__TVWeeGd';
const VIEW = 'instagram_posts_export';
const SHEET_TAB = 'IG Posts';           // tab this script writes to (created if missing)
const PAGE_SIZE = 1000;                  // PostgREST max rows per request
const ORDER = 'post_date.desc';          // newest posts first

// Column order written to the sheet (must match keys returned by the view).
const COLUMNS = [
  'post_date',
  'account_username',
  'main_dealer',
  'dealer_name',
  'pillar',
  'post_type',
  'likes_count',
  'comments_count',
  'views_count',
  'caption',
  'post_url',
];

/** Fetch every row from the view, paging past the 1000-row REST cap. */
function fetchAllRows() {
  const rows = [];
  let offset = 0;
  while (true) {
    const url =
      SUPABASE_URL + '/rest/v1/' + VIEW +
      '?select=' + COLUMNS.join(',') +
      '&order=' + ORDER +
      '&limit=' + PAGE_SIZE +
      '&offset=' + offset;

    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      },
      muteHttpExceptions: true,
    });

    if (res.getResponseCode() !== 200) {
      throw new Error('Supabase REST error ' + res.getResponseCode() + ': ' + res.getContentText());
    }

    const batch = JSON.parse(res.getContentText());
    rows.push.apply(rows, batch);
    if (batch.length < PAGE_SIZE) break;   // last page
    offset += PAGE_SIZE;
  }
  return rows;
}

/** Main entry point: pull from Supabase and rewrite the sheet tab. */
function syncSupabaseToSheet() {
  const rows = fetchAllRows();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_TAB);
  if (!sheet) sheet = ss.insertSheet(SHEET_TAB);

  sheet.clearContents();

  // Header + data as a single 2D array, written in one call (fast).
  const values = [COLUMNS];
  for (const r of rows) {
    values.push(COLUMNS.map(function (c) {
      const v = r[c];
      return v === null || v === undefined ? '' : v;
    }));
  }

  if (values.length > 0) {
    sheet.getRange(1, 1, values.length, COLUMNS.length).setValues(values);
  }
  sheet.setFrozenRows(1);

  ss.toast('Synced ' + rows.length + ' rows from Supabase.', 'Supabase Sync', 5);
}

/** Run ONCE to schedule an automatic daily sync (~6am in the sheet's timezone). */
function setUpDailyTrigger() {
  // Remove any existing triggers for this function first (avoid duplicates).
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncSupabaseToSheet') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncSupabaseToSheet')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
}

/** Adds a "Supabase Sync" menu to the Sheet for manual runs. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Supabase Sync')
    .addItem('Sync now', 'syncSupabaseToSheet')
    .addItem('Set up daily auto-sync', 'setUpDailyTrigger')
    .addToUi();
}
