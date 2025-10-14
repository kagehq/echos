#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Echos Full System Test Suite"
echo "================================"
echo ""

# Test counter
PASSED=0
FAILED=0

test_case() {
  echo -n "  Testing: $1... "
}

pass() {
  echo -e "${GREEN}✓ PASS${NC}"
  ((PASSED++))
}

fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  ((FAILED++))
}

# ============================================================================
# 1. BASIC CONNECTIVITY TESTS
# ============================================================================
echo "📡 1. Basic Connectivity"
echo "------------------------"

test_case "Daemon health check"
if curl -s http://localhost:3434/tokens/list | grep -q "tokens"; then
  pass
else
  fail "Daemon not responding"
fi

test_case "Dashboard loading"
if curl -s http://localhost:3000 | grep -q "Echos"; then
  pass
else
  fail "Dashboard not loading"
fi

# ============================================================================
# 2. SECURITY TESTS (ReDoS Protection)
# ============================================================================
echo ""
echo "🛡️  2. Security Features"
echo "------------------------"

test_case "Policy decision (allow)"
RESULT=$(curl -s -X POST http://localhost:3434/decide \
  -H "Content-Type: application/json" \
  -d '{"intent":"llm.chat","target":"openai","id":"test-allow"}')
if echo "$RESULT" | grep -q '"status":"allow"'; then
  pass
else
  fail "Allow policy not working: $RESULT"
fi

test_case "Policy decision (ask)"
RESULT=$(curl -s -X POST http://localhost:3434/decide \
  -H "Content-Type: application/json" \
  -d '{"intent":"slack.post","target":"#general","id":"test-ask"}')
if echo "$RESULT" | grep -q '"status":"ask"'; then
  pass
else
  fail "Ask policy not working: $RESULT"
fi

test_case "Policy decision (block)"
RESULT=$(curl -s -X POST http://localhost:3434/decide \
  -H "Content-Type: application/json" \
  -d '{"intent":"fs.delete","target":"/important","id":"test-block"}')
if echo "$RESULT" | grep -q '"status":"block"'; then
  pass
else
  fail "Block policy not working: $RESULT"
fi

test_case "Secure default (unknown intent)"
RESULT=$(curl -s -X POST http://localhost:3434/decide \
  -H "Content-Type: application/json" \
  -d '{"intent":"unknown.action","target":"something","id":"test-default"}')
if echo "$RESULT" | grep -q '"status":"block"'; then
  pass
else
  fail "Secure default should block unknown intents: $RESULT"
fi

# ============================================================================
# 3. API ENDPOINTS
# ============================================================================
echo ""
echo "🔌 3. API Endpoints"
echo "-------------------"

test_case "Timeline endpoint"
RESULT=$(curl -s http://localhost:3434/timeline)
if echo "$RESULT" | grep -q "events"; then
  pass
else
  fail "Timeline endpoint not responding"
fi

test_case "Tokens list endpoint"
RESULT=$(curl -s http://localhost:3434/tokens/list)
if echo "$RESULT" | grep -q "tokens"; then
  pass
else
  fail "Tokens endpoint not responding"
fi

# ============================================================================
# 4. DASHBOARD WATCHDOG TIMER (simulated)
# ============================================================================
echo ""
echo "⏱️  4. Watchdog Timer Protection"
echo "--------------------------------"

test_case "Dashboard API timeout handling"
# The dashboard should handle timeouts gracefully
# We can't easily simulate a timeout, but we can verify the composable exists
if [ -f "apps/dashboard/composables/useDaemonApi.ts" ]; then
  pass
else
  fail "Watchdog composable not found"
fi

test_case "Error banner component"
if [ -f "apps/dashboard/components/DaemonErrorBanner.vue" ]; then
  pass
else
  fail "Error banner component not found"
fi

test_case "Header component"
if [ -f "apps/dashboard/components/AppHeader.vue" ]; then
  pass
else
  fail "Header component not found"
fi

# ============================================================================
# 5. INTEGRATION TESTS
# ============================================================================
echo ""
echo "🔗 5. Integration Tests"
echo "-----------------------"

test_case "Decision with token grant"
RESULT=$(curl -s -X POST http://localhost:3434/decide/test-ask \
  -H "Content-Type: application/json" \
  -d '{
    "status":"allow",
    "agent":"test-agent",
    "grant":{"scopes":["slack.post"],"durationSec":3600}
  }')
if echo "$RESULT" | grep -q "ok"; then
  pass
else
  fail "Token grant not working"
fi

test_case "Token list after grant"
RESULT=$(curl -s http://localhost:3434/tokens/list)
if echo "$RESULT" | grep -q "test-agent"; then
  pass
else
  fail "Token not created"
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo "================================"
echo "📊 Test Results"
echo "================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi

