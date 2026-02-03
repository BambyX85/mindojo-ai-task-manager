// --- SIMPLE TEST HARNESS ---
function assert(desc, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    Logger.log(`✅ PASS: ${desc}`);
  } else {
    Logger.log(`❌ FAIL: ${desc}`);
    Logger.log(`   Expected: ${JSON.stringify(expected)}`);
    Logger.log(`   Actual:   ${JSON.stringify(actual)}`);
  }
}

function runAllTests() {
  Logger.log("--- STARTING TESTS ---");
  
  test_relevance_sorting();
  test_relevance_tiebreak();
  test_idempotency_basic();
  test_idempotency_case_insensitive();
  test_count_active();
  test_edge_empty_list();
  
  Logger.log("--- TESTS COMPLETE ---");
}

// --- 6 ISOLATED TESTS ---

// Test 1: Relevance (Due Date Sorting)
function test_relevance_sorting() {
  const input = [
    { id: 1, due_date: "2026-02-15", created: "2026-01-01" },
    { id: 2, due_date: "2026-02-10", created: "2026-01-01" }
  ];
  const sorted = logic_sortTasks(input);
  assert("Sorts by Due Date ASC", sorted[0].id, 2);
}

// Test 2: Relevance (Tie Break on Created)
function test_relevance_tiebreak() {
  const input = [
    { id: 1, due_date: "2026-02-10", created: "2026-01-05" }, // Newer
    { id: 2, due_date: "2026-02-10", created: "2026-01-01" }  // Older (Should win)
  ];
  const sorted = logic_sortTasks(input);
  assert("Tie-breaks using Created Date (FIFO)", sorted[0].id, 2);
}

// Test 3: Idempotency (Found Duplicate)
function test_idempotency_basic() {
  const input = [
    { id: "exist_1", description: "Buy Milk", status: "active", created: "2026-01-01" }
  ];
  const match = logic_findDuplicate(input, "Buy Milk");
  assert("Finds exact match duplicate", match.id, "exist_1");
}

// Test 4: Idempotency (Case Insensitive & Oldest Win)
function test_idempotency_case_insensitive() {
  const input = [
    { id: "newer", description: "buy milk", status: "active", created: "2026-02-01" },
    { id: "older", description: "Buy Milk", status: "active", created: "2026-01-01" }
  ];
  const match = logic_findDuplicate(input, "BUY MILK");
  assert("Finds case-insensitive match and returns oldest", match.id, "older");
}

// Test 5: State Summary Count
function test_count_active() {
  const input = [
    { status: "active" },
    { status: "completed" },
    { status: "active" }
  ];
  const count = logic_countActive(input);
  assert("Counts only active tasks", count, 2);
}

// Test 6: Edge Case (Empty Input)
function test_edge_empty_list() {
  const match = logic_findDuplicate([], "Ghost Task");
  assert("Returns null for empty list", match, null);
  
  const sorted = logic_sortTasks([]);
  assert("Handles empty sort gracefully", sorted, []);
}
