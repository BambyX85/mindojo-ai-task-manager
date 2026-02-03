# AI-First Task Manager (MVP)

A deterministic, single-user task manager built to demonstrate safe AI agent design patterns using Google Apps Script and OpenAI Custom GPTs.

## 🚀 Quick Start

**Google Sheet (DB & Logs):** [Google Sheet](https://docs.google.com/spreadsheets/d/11qjS_5eye5cfFW4rztKx9WuiCTjGmphJFlWKSpeOAaI/edit?usp=sharing)

**Web App Endpoint:** [GAS web URL](https://script.google.com/macros/s/AKfycbztzuEtNL77PbgvRaapo9dxdp8ewic6fOoehzT8r2hHTM5g0ehAR-LLK8GlKSM52EWYdw/exec)  

**Custom GPT Config:** See `openapi.yaml` and `system_prompt.txt` | [CCGPT](https://chatgpt.com/g/g-69819d527ccc819192bcb401c9ccecda-mindojo-ccgpt-demo) 

**Note on Auth:** Authentication is explicitly out of scope for this assessment. The endpoint is public for demonstration purposes.

---

## 🏗 Key Decisions & Trade-offs

### 1. "Search-First" Mutation Safety

**Decision:** The API does not support "Update by Title." Updates require a strict UUID.  

**Rationale:** Prevents "blind edits." The Agent is forced to Fetch → Disambiguate → Update.  

**Trade-off:** Requires 2 API calls for mutations, but guarantees data integrity.

### 2. Deterministic Relevance

**Decision:** "Best Task" sorting is hardcoded in the backend (`view=next`), sorting by Due Date ASC → Created ASC.  

**Rationale:** Removing sorting logic from the LLM prevents hallucinated priorities and ensures the behavior is unit-testable.

### 3. Stateless Time Handling

**Decision:** API accepts only ISO 8601 strings.  

**Rationale:** Shifts timezone complexity to the LLM (which is excellent at natural language time parsing), keeping the Apps Script backend simple and robust.

---

## ⚠️ Known Limitations & Bugs (Demo Context)

### 1. Google Apps Script "Ghost HTML Error" (POST Requests)

**Symptom:** When testing with curl, POST requests sometimes return an HTML error page ("File cannot be opened") instead of JSON, even though the mutation succeeds (the row appears in the Sheet).

**Production Fix:** Migrate the backend to Google Cloud Functions or AWS Lambda with proper CORS and stateless JWT authentication.

### 2. Scalability Limits

**Issue:** The current implementation reads the entire Sheet into memory using `getRange().getDisplayValues()`.

**Impact:** Performance degrades after ~2,000 rows. Responses may timeout (30s GAS limit).

**Production Fix:** Implement pagination (`?offset=0&limit=50`) or use Google Sheets API with query filters instead of full-sheet reads.

### 3. No Delete Operation

**Issue:** The API supports Create, Read, Update, but not Delete.

**Rationale (Demo Context):** This was a deliberate YAGNI decision. Completion (`status=completed`) effectively "removes" tasks from the active view. A true Delete would require additional safety logic (soft delete, confirmation flow) which adds complexity without demonstrating new integration patterns.

**Production Fix:** Add a DELETE endpoint with a "Trash" status and a 30-day retention policy.

### 4. Time Context Ignored

**Issue:** The rubric mentioned "Time/locale handling (e.g. morning context, weekday/morning)." The current implementation ignores time-of-day context.

**Rationale:** Prioritizing determinism over contextual intelligence. If "Best Task" changes based on whether it's 9 AM or 3 PM, the sorting logic becomes non-reproducible and harder to debug.

**Production Enhancement:** Add a `priority_boost` field or time-based scoring algorithm that factors in deadlines relative to the current hour.

---

## 🧪 How to Run / Test

### 1. Unit Tests (GAS)

Open `Tests.gs` in the Script Editor and run `runAllTests()`.  
Check the Execution Log for ✅ PASS.

### 2. Manual Verification (Curl)

Export your URL:

    export URL="https://script.google.com/macros/s/AKfycbztzuEtNL77PbgvRaapo9dxdp8ewic6fOoehzT8r2hHTM5g0ehAR-LLK8GlKSM52EWYdw/exec"

---

### Test Case 1: Deterministic "Best Task" Retrieval

**Purpose:** Verify the relevance sorting logic (Due Date ASC → Created ASC).

    curl -L "$URL?status=active&view=next"

**Expected Result:**  
Returns the task with the earliest `due_date`. If multiple tasks share the same date, returns the oldest created one (FIFO).

---

### Test Case 2: Idempotency (Duplicate Creation Prevention)

**Purpose:** Verify that creating the same task twice returns the existing task instead of creating a duplicate.

    # Run this command TWICE
    curl -L -X POST -H "Content-Type: application/json" \
      -d '{"description": "Buy Groceries", "due_date": "2026-02-10"}' \
      "$URL?action=create"

**Expected Result:**

- First Run: `"human_message": "Task created."`
- Second Run: `"human_message": "Task already exists. Returning original."`

---

### Test Case 3: Task Completion (State Mutation)

**Purpose:** Verify that updates are reflected immediately in the Sheet and Logs.

**Step 1: Get a Task ID**

    curl -L "$URL?status=active&view=all"
    # Copy a valid ID from the response

**Step 2: Mark it Complete**

    curl -L -X POST -H "Content-Type: application/json" \
      -d '{"id": "PASTE_ID_HERE", "status": "completed"}' \
      "$URL?action=update"

**Expected Result:**  
JSON response shows `"status": "completed"` and `active_count` decreases by 1.

---

### Test Case 4: Snooze (Future Date Update)

**Purpose:** Verify that the GPT can defer tasks by updating the `due_date`.

    curl -L -X POST -H "Content-Type: application/json" \
      -d '{"id": "PASTE_VALID_ID_HERE", "due_date": "2026-03-15", "status": "active"}' \
      "$URL?action=update"

**Expected Result:**  
JSON response returns the task with the new `due_date`.

---

### Test Case 5: Ambiguity Handling (Manual Simulation)

**Purpose:** Demonstrate the "Search First" safety pattern when multiple tasks match a description.

**Setup:**  
Manually add two tasks in the Sheet:

- description: "Email Client", due Feb 20  
- description: "Email Client", due Feb 25  

**Step 1: Search (Discover the Ambiguity)**

    curl -L "$URL?status=active"

**Expected Result:**  
Returns a JSON array with 2 items, both named "Email Client."

**Step 2: User Clarifies → Agent Updates**

User says: *"The one due Feb 25."*

Agent extracts the ID of the Feb 25 task and calls:

    curl -L -X POST -H "Content-Type: application/json" \
      -d '{"id": "ID_OF_FEB_25_TASK", "status": "completed"}' \
      "$URL?action=update"

**Validation:**  
Only the Feb 25 task is marked complete. The Feb 20 task remains active.

---

### Test Case 6: Invalid ID (Error Handling)

**Purpose:** Verify the API returns a structured error for bad requests.

    curl -L -X POST -H "Content-Type: application/json" \
      -d '{"id": "fake-uuid-999", "status": "completed"}' \
      "$URL?action=update"

**Expected Result:**

    { "error": "Task ID fake-uuid-999 not found." }

---

## 🔒 Production Security Strategy

While this MVP is public, a production-grade version would implement the following security layers:

### Authentication

Switch Google Web App access to "Anyone with Google Account" or implement manual Bearer Token validation in `doGet` / `doPost`.

    if (e.parameter.token !== SCRIPT_PROPERTY_TOKEN) {
      throw new Error("403");
    }

### Concurrency & Scaling

The current `LockService` prevents race conditions but creates a bottleneck.

**Production Move:**  
Migrate backend to Google Cloud Functions + Firestore to handle concurrent writes and atomic transactions at scale.

### Data Isolation

Add a `user_id` column to the schema and enforce row-level security (RLS) filters on every query.

### Input Validation

Implement strict schema validation (e.g., Zod) on incoming JSON payloads to prevent injection attacks or malformed data.
