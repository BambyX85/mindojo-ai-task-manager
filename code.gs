// --- CONFIGURATION ---
const DB_SHEET_NAME = "Tasks";
const LOG_SHEET_NAME = "API_Logs";

// --- PURE BUSINESS LOGIC (TESTABLE) ---
// These functions are isolated from the database for unit testing

/**
 * Sorts tasks deterministically: 
 * 1. Active status first (optional, but requested logic implies filtering)
 * 2. Due Date ASC (Urgency)
 * 3. Created Date ASC (FIFO Tie-breaker)
 */
function logic_sortTasks(tasks) {
  return tasks.sort((a, b) => {
    // String comparison works for ISO 8601
    const dateComp = a.due_date.localeCompare(b.due_date);
    if (dateComp !== 0) return dateComp;
    return a.created.localeCompare(b.created);
  });
}

/**
 * Checks for idempotency. 
 * Returns the OLDEST existing task if a description matches case-insensitively.
 */
function logic_findDuplicate(tasks, newDescription) {
  if (!newDescription) return null;
  const normalizedNew = newDescription.trim().toLowerCase();
  
  const matches = tasks.filter(t => 
    t.status === 'active' && 
    t.description.toString().trim().toLowerCase() === normalizedNew
  );

  if (matches.length === 0) return null;

  // Return the oldest one (FIFO)
  matches.sort((a, b) => a.created.localeCompare(b.created));
  return matches[0];
}

/**
 * Counts active tasks for the "State-Summary" response
 */
function logic_countActive(tasks) {
  return tasks.filter(t => t.status === 'active').length;
}

// --- API HANDLERS (GAS ENTRY POINTS) ---

function doGet(e) {
  const start = new Date();
  let responsePayload = {};
  
  try {
    const params = e.parameter;
    const allTasks = sheet_readTasks();
    
    // Filter by status (default to active)
    let filtered = allTasks;
    if (params.status) {
      filtered = filtered.filter(t => t.status === params.status);
    }
    
    // Relevance Strategy: Deterministic Sort
    const sorted = logic_sortTasks(filtered);
    
    // Handle "View" (e.g., limit for "next")
    let data = sorted;
    if (params.view === 'next') {
      data = sorted.slice(0, 1);
    }

    responsePayload = createResponse_(data, allTasks);
    
  } catch (err) {
    responsePayload = { error: err.toString() };
  } finally {
    sheet_log(start, "GET", e.parameter, responsePayload, responsePayload.error);
  }
  
  return ContentService.createTextOutput(JSON.stringify(responsePayload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  // Wait up to 10 seconds for other requests to finish
  if (!lock.tryLock(10000)) {
    return ContentService.createTextOutput(JSON.stringify({error: "Server Busy"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const start = new Date();
  let responsePayload = {};
  
  try {
    // 1. SAFE PARSING
    if (!e || !e.postData) {
      throw new Error("No POST data received");
    }
    
    // 2. PARSE BODY
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      throw new Error("Invalid JSON body");
    }

    const params = e.parameter || {};
    const action = params.action;
    const allTasks = sheet_readTasks();

    // 3. ROUTING
    if (action === 'create') {
      const existing = logic_findDuplicate(allTasks, body.description);
      if (existing) {
        responsePayload = createResponse_([existing], allTasks, "Task already exists.");
      } else {
        const newTask = sheet_createTask(body);
        const updatedTasks = sheet_readTasks(); 
        responsePayload = createResponse_([newTask], updatedTasks, "Task created.");
      }
    } else if (action === 'update') {
      if (!body.id) throw new Error("Missing Task ID");
      const updatedTask = sheet_updateTask(body.id, body);
      const updatedTasks = sheet_readTasks();
      responsePayload = createResponse_([updatedTask], updatedTasks, "Task updated.");
    } else {
      throw new Error("Invalid action parameter");
    }

  } catch (err) {
    // 4. ERROR TRAPPING
    responsePayload = { error: err.toString() };
    // Log the error to stackdriver/logger too for internal debugging
    console.error(err);
  } finally {
    // 5. LOGGING (Fail-safe)
    try {
      sheet_log(start, `POST:${e?.parameter?.action}`, e?.postData?.contents, responsePayload, responsePayload.error);
    } catch (logErr) {
      console.error("Logging failed: " + logErr);
    }
    
    lock.releaseLock();
  }

  // 6. FINAL RESPONSE
  return ContentService.createTextOutput(JSON.stringify(responsePayload))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- HELPER FUNCTIONS ---

function createResponse_(data, allContextTasks, message = "Success") {
  return {
    data: data,
    meta: {
      active_count: logic_countActive(allContextTasks),
      server_time: new Date().toISOString(),
      human_message: message
    },
    error: null
  };
}

// --- SHEET DATABASE LAYER ---

function sheet_readTasks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEET_NAME);
  
  // OPTIMIZATION: Only grab rows with actual content
  const lastRow = sheet.getLastRow();
  
  // If no data exists beyond headers, return empty array immediately
  if (lastRow <= 1) return [];

  // Only get the range that actually has data: A2:F[LastRow]
  const data = sheet.getRange(2, 1, lastRow - 1, 6).getDisplayValues();
  
  // Minimal Mapper with Strict Filter
  return data
    .map((row, i) => ({
      _rowIndex: i + 2,
      id: row[0],
      description: row[1],
      status: row[2],
      due_date: row[3],
      created: row[4],
      updated: row[5]
    }))
    .filter(t => t.id && t.id.trim() !== ""); // Strict check for non-empty ID
}


function sheet_updateTask(id, payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEET_NAME);
  const tasks = sheet_readTasks();
  
  const task = tasks.find(t => t.id === id);
  if (!task) throw new Error(`Task ID ${id} not found.`);
  
  const now = new Date().toISOString();
  
  // Columns: ID(1), Desc(2), Status(3), Due(4), Created(5), Updated(6)
  if (payload.status) sheet.getRange(task._rowIndex, 3).setValue(payload.status);
  if (payload.due_date) sheet.getRange(task._rowIndex, 4).setValue(payload.due_date);
  
  sheet.getRange(task._rowIndex, 6).setValue(now);
  
  // Return merged object
  return { ...task, ...payload, updated: now };
}

function sheet_log(startTime, operation, payload, response, error) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LOG_SHEET_NAME);
  const duration = new Date() - startTime;
  
  // Timestamp, Operation, Payload, Response, Error, Duration
  sheet.appendRow([
    new Date().toISOString(),
    operation,
    JSON.stringify(payload),
    JSON.stringify(response),
    error || "",
    duration + "ms"
  ]);
}
