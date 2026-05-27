/* =============================================================================
 *  VMS  ·  CONFIG
 * =============================================================================
 *  This is the ONLY file you need to edit to get the system running.
 *  Paste your three IDs / URL below, save, and refresh the app.
 *
 *  See docs/GOOGLE_SETUP.md for a step-by-step walkthrough of how to obtain
 *  each value.
 * ============================================================================= */

window.VMS_CONFIG = {

  /* ---------------------------------------------------------------------------
   *  REQUIRED  ·  paste these three values
   * ------------------------------------------------------------------------- */

  // The web-app URL you get after deploying apps-script/Code.gs as a Web App.
  // Looks like:  https://script.google.com/macros/s/AKfy.../exec
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxPcqtL8LuqKQC4aJ4bmyOne5uSotZ3Ko4iJTY7t2E8a6xAvg5cH7bonwweyMyB2ddOkA/exec",

  // Google Sheet ID — the long string in the Sheet URL between /d/ and /edit
  // The sheet must contain tabs:  Users  ·  Logs  ·  Settings
  SHEET_ID: "1mTObHuH8O9RVGMz56ZvI4ARPcS1JXKV8CHkyTLn4jJM",

  // Google Drive folder ID where the /VMS tree will be created.
  // Looks like:  1A2B3C4D... (from the folder URL)
  DRIVE_ROOT_FOLDER_ID: "1DonGlWoJtRc30fsSi7zHjE5G5xlDPiLA",


  /* ---------------------------------------------------------------------------
   *  OPTIONAL  ·  safe defaults you can tweak
   * ------------------------------------------------------------------------- */

  // Marketplaces shown in dropdowns. Users can add custom ones at runtime.
  MARKETPLACES: [
    "Amazon", "Flipkart", "Meesho", "Myntra", "Ajio",
    "Nykaa", "FirstCry", "JioMart", "Snapdeal", "Shopify", "D2C"
  ],

  COURIERS: [
    "Delhivery", "BlueDart", "DTDC", "Ekart", "Shadowfax",
    "XpressBees", "Ecom Express", "India Post", "ShipRocket", "Other"
  ],

  RETURN_REASONS: [
    "Customer Return", "Damaged in Transit", "Wrong Item",
    "Quality Issue", "RTO", "Other"
  ],

  SHIPMENT_TYPES: ["Forward", "Return", "Exchange"],

  // Days to keep recordings before auto-delete. Apps Script trigger uses this.
  RETENTION_DAYS: 90,

  // Maximum recording length in seconds (safety cap; warehouse packing rarely
  // takes more than 5 minutes).
  MAX_RECORDING_SECONDS: 600,

  // Idle session timeout in minutes — user is logged out after inactivity.
  SESSION_TIMEOUT_MINUTES: 60,

  // Video quality. Lower = smaller files = faster upload.
  // Common bitrates:  500_000 (low) · 1_500_000 (med) · 3_000_000 (high)
  VIDEO_BITRATE: 1_500_000,

  // Chunk size for chunked upload to Apps Script (bytes). 4 MB is a safe ceiling
  // for the Apps Script payload limit (~50 MB total per request).
  // Legacy chunk size (no longer used by the default one-shot upload path).
  // Kept for backward compatibility with the old chunked upload functions.
  UPLOAD_CHUNK_BYTES: 70 * 1024,

  // Brand
  APP_NAME: "VMS Console",
  APP_TAGLINE: "Warehouse Video Operations",
};
