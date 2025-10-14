#!/usr/bin/env node
import { echos } from "./packages/sdk/dist/index.js";

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[36m';
const RESET = '\x1b[0m';

let passCount = 0;
let failCount = 0;

function pass(msg) {
  console.log(`   ${GREEN}✓${RESET} ${msg}`);
  passCount++;
}

function fail(msg) {
  console.log(`   ${RED}✗${RESET} ${msg}`);
  failCount++;
}

function section(title) {
  console.log(`\n${BLUE}━━━ ${title} ━━━${RESET}`);
}

async function test(name, fn) {
  try {
    await fn();
  } catch (err) {
    fail(`${name}: ${err.message}`);
  }
}

console.log(`${BLUE}╔════════════════════════════════════════╗${RESET}`);
console.log(`${BLUE}║   🧪 ECHOS COMPREHENSIVE TEST SUITE   ║${RESET}`);
console.log(`${BLUE}╚════════════════════════════════════════╝${RESET}`);

// ═══════════════════════════════════════════════════════════
section("1. DAEMON HEALTH CHECKS");
// ═══════════════════════════════════════════════════════════

await test("Daemon is reachable", async () => {
  const res = await fetch("http://127.0.0.1:3434/timeline");
  if (res.ok) pass("Daemon responds to requests");
  else fail("Daemon not responding");
});

await test("CORS headers present", async () => {
  const res = await fetch("http://127.0.0.1:3434/timeline");
  const corsHeader = res.headers.get("access-control-allow-origin");
  if (corsHeader) pass(`CORS header: ${corsHeader}`);
  else fail("CORS headers missing");
});

await test("Timeline endpoint works", async () => {
  const res = await fetch("http://127.0.0.1:3434/timeline");
  const data = await res.json();
  if (data.events !== undefined) pass(`Timeline has ${data.events.length} events`);
  else fail("Timeline endpoint broken");
});

await test("Scopes endpoint works", async () => {
  const res = await fetch("http://127.0.0.1:3434/scopes");
  const data = await res.json();
  if (data.scopes && Object.keys(data.scopes).length > 0) {
    pass(`Scopes defined: ${Object.keys(data.scopes).length} scopes`);
  } else fail("Scopes endpoint broken");
});

// ═══════════════════════════════════════════════════════════
section("2. POLICY ENGINE");
// ═══════════════════════════════════════════════════════════

await test("Allow policy (llm.chat)", async () => {
  const res = await fetch("http://127.0.0.1:3434/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-allow",
      ts: Date.now(),
      agent: "test",
      intent: "llm.chat",
      target: "gpt-4"
    })
  });
  const data = await res.json();
  if (data.status === "allow") pass("LLM chat allowed by policy");
  else fail(`Expected 'allow', got '${data.status}'`);
});

await test("Ask policy (slack.post)", async () => {
  const res = await fetch("http://127.0.0.1:3434/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-ask",
      ts: Date.now(),
      agent: "test",
      intent: "slack.post",
      target: "#general"
    })
  });
  const data = await res.json();
  if (data.status === "ask") pass("Slack post requires consent");
  else fail(`Expected 'ask', got '${data.status}'`);
});

await test("Block policy (fs.delete)", async () => {
  const res = await fetch("http://127.0.0.1:3434/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-block",
      ts: Date.now(),
      agent: "test",
      intent: "fs.delete",
      target: "/data"
    })
  });
  const data = await res.json();
  if (data.status === "block") pass("File delete blocked by policy");
  else fail(`Expected 'block', got '${data.status}'`);
});

// ═══════════════════════════════════════════════════════════
section("3. TOKEN LIFECYCLE");
// ═══════════════════════════════════════════════════════════

let testToken = null;

await test("Issue token", async () => {
  const res = await fetch("http://127.0.0.1:3434/tokens/issue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agent: "test_agent",
      scopes: ["calendar.read", "calendar.write", "email.send"],
      durationSec: 3600,
      reason: "Test token"
    })
  });
  const data = await res.json();
  if (data.token && data.token.token) {
    testToken = data.token;
    pass(`Token issued: ${testToken.token.slice(0, 30)}...`);
  } else fail("Token issuance failed");
});

await test("List tokens", async () => {
  const res = await fetch("http://127.0.0.1:3434/tokens/list");
  const data = await res.json();
  if (data.tokens && data.tokens.length > 0) {
    pass(`Found ${data.tokens.length} token(s)`);
  } else fail("No tokens listed");
});

await test("Introspect token", async () => {
  const res = await fetch("http://127.0.0.1:3434/tokens/introspect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: testToken.token })
  });
  const data = await res.json();
  if (data.active && data.scopes.length === 3) {
    pass(`Token active with ${data.scopes.length} scopes`);
  } else fail("Token introspection failed");
});

await test("Pause token", async () => {
  const res = await fetch("http://127.0.0.1:3434/tokens/pause", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: testToken.token })
  });
  if (res.ok) pass("Token paused successfully");
  else fail("Token pause failed");
});

await test("Resume token", async () => {
  const res = await fetch("http://127.0.0.1:3434/tokens/resume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: testToken.token })
  });
  if (res.ok) pass("Token resumed successfully");
  else fail("Token resume failed");
});

// ═══════════════════════════════════════════════════════════
section("4. TOKEN VALIDATION IN /decide");
// ═══════════════════════════════════════════════════════════

await test("Token authorizes calendar.read", async () => {
  const res = await fetch("http://127.0.0.1:3434/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-token-cal-read",
      ts: Date.now(),
      agent: "test_agent",
      intent: "calendar.read",
      target: "my-cal",
      token: testToken.token
    })
  });
  const data = await res.json();
  if (data.status === "allow") pass("Token grants calendar.read");
  else fail(`Expected 'allow', got '${data.status}'`);
});

await test("Token authorizes calendar.write", async () => {
  const res = await fetch("http://127.0.0.1:3434/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-token-cal-write",
      ts: Date.now(),
      agent: "test_agent",
      intent: "calendar.write",
      target: "my-cal",
      token: testToken.token
    })
  });
  const data = await res.json();
  if (data.status === "allow") pass("Token grants calendar.write");
  else fail(`Expected 'allow', got '${data.status}'`);
});

await test("Token authorizes email.send", async () => {
  const res = await fetch("http://127.0.0.1:3434/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-token-email",
      ts: Date.now(),
      agent: "test_agent",
      intent: "email.send",
      target: "test@example.com",
      token: testToken.token
    })
  });
  const data = await res.json();
  if (data.status === "allow") pass("Token grants email.send");
  else fail(`Expected 'allow', got '${data.status}'`);
});

await test("Token doesn't authorize slack.post", async () => {
  const res = await fetch("http://127.0.0.1:3434/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-token-slack",
      ts: Date.now(),
      agent: "test_agent",
      intent: "slack.post",
      target: "#general",
      token: testToken.token
    })
  });
  const data = await res.json();
  if (data.status === "ask") pass("Token correctly denies slack.post (not in scope)");
  else fail(`Expected 'ask', got '${data.status}'`);
});

await test("Invalid token falls back to policy", async () => {
  const res = await fetch("http://127.0.0.1:3434/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-invalid-token",
      ts: Date.now(),
      agent: "test_agent",
      intent: "llm.chat",
      target: "gpt-4",
      token: "invalid-token-12345"
    })
  });
  const data = await res.json();
  if (data.status === "allow") pass("Invalid token falls back to policy (allow)");
  else fail(`Expected policy fallback, got '${data.status}'`);
});

// ═══════════════════════════════════════════════════════════
section("5. SDK INTEGRATION");
// ═══════════════════════════════════════════════════════════

await test("SDK initialization", async () => {
  const agent = echos("sdk_test");
  if (agent && agent.agent === "sdk_test") pass("SDK initializes correctly");
  else fail("SDK initialization failed");
});

await test("SDK emits allowed action", async () => {
  const agent = echos("sdk_test");
  try {
    await agent.emit("llm.chat", "gpt-4", { prompt: "test" });
    pass("SDK successfully emits allowed action");
  } catch (err) {
    fail(`SDK emit failed: ${err.message}`);
  }
});

await test("SDK handles blocked action", async () => {
  const agent = echos("sdk_test");
  try {
    await agent.emit("fs.delete", "/data");
    fail("SDK should throw on blocked action");
  } catch (err) {
    if (err.message.includes("blocked")) pass("SDK correctly throws on blocked action");
    else fail(`Wrong error: ${err.message}`);
  }
});

await test("SDK token management", async () => {
  const agent = echos("sdk_test");
  agent.setToken({
    token: "test-token",
    expiresAt: Date.now() + 3600000,
    scopes: ["test.scope"],
    status: "active"
  });
  const headers = agent.authHeader();
  if (headers["x-echos-token"] === "test-token") {
    pass("SDK includes token in auth headers");
  } else fail("SDK token management broken");
});

// ═══════════════════════════════════════════════════════════
section("6. TIMELINE & EVENTS");
// ═══════════════════════════════════════════════════════════

await test("Post event", async () => {
  const res = await fetch("http://127.0.0.1:3434/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-event-1",
      ts: Date.now(),
      agent: "test",
      intent: "test.action",
      target: "test-target"
    })
  });
  if (res.ok) pass("Event posted successfully");
  else fail("Event post failed");
});

await test("Retrieve timeline", async () => {
  const res = await fetch("http://127.0.0.1:3434/timeline");
  const data = await res.json();
  if (data.events && data.events.length > 0) {
    pass(`Timeline contains ${data.events.length} entries`);
  } else fail("Timeline retrieval failed");
});

await test("Timeline replay", async () => {
  const now = Date.now();
  const res = await fetch("http://127.0.0.1:3434/timeline/replay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fromTs: now - 60000, // last minute
      toTs: now
    })
  });
  const data = await res.json();
  if (data.events !== undefined) {
    pass(`Replay returned ${data.events.length} events`);
  } else fail("Timeline replay failed");
});

await test("NDJSON export", async () => {
  const res = await fetch("http://127.0.0.1:3434/timeline.ndjson");
  const text = await res.text();
  if (text && res.headers.get("content-type").includes("ndjson")) {
    const lines = text.trim().split('\n').filter(l => l);
    pass(`NDJSON export has ${lines.length} lines`);
  } else fail("NDJSON export failed");
});

// ═══════════════════════════════════════════════════════════
section("7. EDGE CASES");
// ═══════════════════════════════════════════════════════════

await test("Expired token detection", async () => {
  const expiredToken = {
    token: "expired-test-token",
    expiresAt: Date.now() - 1000, // expired 1 sec ago
    scopes: ["test"],
    status: "active"
  };
  const agent = echos("edge_test");
  agent.setToken(expiredToken);
  const headers = agent.authHeader();
  if (!headers["x-echos-token"]) {
    pass("SDK correctly excludes expired tokens");
  } else fail("SDK should not send expired tokens");
});

await test("Paused token behavior", async () => {
  // Pause our test token
  await fetch("http://127.0.0.1:3434/tokens/pause", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: testToken.token })
  });
  
  const res = await fetch("http://127.0.0.1:3434/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-paused",
      ts: Date.now(),
      agent: "test_agent",
      intent: "calendar.read",
      target: "my-cal",
      token: testToken.token
    })
  });
  const data = await res.json();
  
  // Resume for cleanup
  await fetch("http://127.0.0.1:3434/tokens/resume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: testToken.token })
  });
  
  if (data.status === "ask") pass("Paused tokens don't authorize actions");
  else fail(`Paused token should ask, got '${data.status}'`);
});

await test("Empty intent handling", async () => {
  const res = await fetch("http://127.0.0.1:3434/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-empty",
      ts: Date.now(),
      agent: "test",
      intent: "",
      target: ""
    })
  });
  if (res.ok) pass("Empty intent handled gracefully");
  else fail("Empty intent caused error");
});

// ═══════════════════════════════════════════════════════════
section("8. CLEANUP");
// ═══════════════════════════════════════════════════════════

await test("Revoke test token", async () => {
  const res = await fetch("http://127.0.0.1:3434/tokens/revoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: testToken.token })
  });
  if (res.ok) pass("Token revoked successfully");
  else fail("Token revocation failed");
});

await test("Revoked token doesn't authorize", async () => {
  const res = await fetch("http://127.0.0.1:3434/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "test-revoked",
      ts: Date.now(),
      agent: "test_agent",
      intent: "calendar.read",
      target: "my-cal",
      token: testToken.token
    })
  });
  const data = await res.json();
  if (data.status === "ask") pass("Revoked token correctly denied");
  else fail(`Revoked token should ask, got '${data.status}'`);
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

console.log(`\n${BLUE}╔════════════════════════════════════════╗${RESET}`);
console.log(`${BLUE}║           TEST RESULTS SUMMARY         ║${RESET}`);
console.log(`${BLUE}╚════════════════════════════════════════╝${RESET}`);
console.log(`\n  ${GREEN}✓ Passed: ${passCount}${RESET}`);
console.log(`  ${RED}✗ Failed: ${failCount}${RESET}`);
console.log(`  ${YELLOW}Total:  ${passCount + failCount}${RESET}\n`);

if (failCount === 0) {
  console.log(`${GREEN}  🎉 ALL TESTS PASSED! System is ready for production.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}  ⚠️  Some tests failed. Please review the output above.${RESET}\n`);
  process.exit(1);
}

