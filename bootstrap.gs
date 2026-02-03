function initializeProject() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup Tasks Sheet
  let taskSheet = ss.getSheetByName("Tasks");
  if (!taskSheet) {
    taskSheet = ss.insertSheet("Tasks");
    // Delete default Sheet1 if exists and distinct
    const defaultSheet = ss.getSheetByName("Sheet1");
    if (defaultSheet) ss.deleteSheet(defaultSheet);
  }
  
  // Set Headers for Tasks
  taskSheet.getRange("A1:F1").setValues([[
    "id", "description", "status", "due_date", "created", "updated"
  ]]).setFontWeight("bold").setBackground("#f3f3f3");
  
  // 2. Setup Logs Sheet
  let logSheet = ss.getSheetByName("API_Logs");
  if (!logSheet) {
    logSheet = ss.insertSheet("API_Logs");
  }
  
  // Set Headers for Logs
  logSheet.getRange("A1:F1").setValues([[
    "timestamp", "operation", "payload", "response", "error", "duration"
  ]]).setFontWeight("bold").setBackground("#e6f7ff");
  
  // 3. Seed Random Data for both tabs
  seedTasks_(taskSheet);
  seedLogs_(logSheet);
  
  Logger.log("Project Initialized: Schema applied and Data seeded for Tasks and Logs.");
}

function seedTasks_(sheet) {
  // Clear existing data (keep headers)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 6).clearContent();
  }

  const tasks = [
    { d: "Review Q1 Financials", s: "active", days: 1 },
    { d: "Buy groceries", s: "completed", days: -2 },
    { d: "Call Mom", s: "active", days: 0 }, // Due today
    { d: "Prepare Slide Deck", s: "snoozed", days: 5 },
    { d: "Fix Car Engine", s: "active", days: -5 }, // Overdue
  ];

  const rows = tasks.map(t => {
    const today = new Date();
    const due = new Date();
    due.setDate(today.getDate() + t.days);
    const nowIso = new Date().toISOString();
    
    return [
      Utilities.getUuid(),
      t.d,
      t.s,
      due.toISOString().split('T')[0], // YYYY-MM-DD
      nowIso,
      nowIso
    ];
  });

  sheet.getRange(2, 1, rows.length, 6).setValues(rows);
}

function seedLogs_(sheet) {
  // Clear existing data (keep headers)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 6).clearContent();
  }

  // Create fake history of API calls
  const now = new Date();
  
  const logs = [
    [
      new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
      "GET",
      '{"status":"active"}',
      '{"data":[...],"meta":{"active_count":3}}',
      "",
      "120ms"
    ],
    [
      new Date(now.getTime() - 1800000).toISOString(), // 30 mins ago
      "POST:create",
      '{"description":"Call Mom"}',
      '{"data":{"id":"..."},"meta":{"human_message":"Task created"}}',
      "",
      "345ms"
    ],
    [
      new Date(now.getTime() - 60000).toISOString(), // 1 min ago
      "POST:update",
      '{"id":"invalid-uuid-999","status":"completed"}',
      '{"error":"Task ID invalid-uuid-999 not found."}',
      "Task ID invalid-uuid-999 not found.",
      "85ms"
    ]
  ];

  sheet.getRange(2, 1, logs.length, 6).setValues(logs);
}
