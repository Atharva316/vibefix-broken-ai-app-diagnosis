const COOKIE_NAME = "vf_session";
const STATE_COOKIE = "vf_oauth_state";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_DIAGNOSE_MODEL = "claude-haiku-4-5-20251001";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const RESEND_URL = "https://api.resend.com/emails";
const WEB3FORMS_URL = "https://api.web3forms.com/submit";
const WEB3FORMS_FALLBACK_ACCESS_KEY = "16c490f0-2048-4d65-930e-1e12eca9c6b1";
const STATIC_ASSET_ORIGIN = "https://raw.githubusercontent.com/Atharva316/vibefix-broken-ai-app-diagnosis/main/public";
const PAYMENT_URL = "https://rzp.io/rzp/bM3R4oPl";
const REPORT_ID_PREFIX = "VF";
const REQUIRED_INTAKE_FIELDS = [
  "payment_id",
  "name",
  "email",
  "app_name",
  "live_app_url",
  "build_tool",
  "break_type",
  "app_context",
  "app_users",
  "working_before",
  "broken_now",
  "when_broke",
  "last_change",
  "already_tried",
  "issue_location",
  "diagnosis_priority",
  "test_login_available",
  "scope_confirmation",
  "missing_info_confirmation",
  "payment_confirmation"
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/auth/google") return startGoogleAuth(request, env);
      if (url.pathname === "/auth/callback") return finishSupabaseAuth(request, env);
      if (url.pathname === "/auth/google/callback") return finishGoogleAuth(request, env);
      if (url.pathname === "/auth/session" && request.method === "POST") return finishBrowserSupabaseSession(request, env);
      if (url.pathname === "/auth/signout") return signOut(request, env);
      if (url.pathname === "/api/me") return json(await getPublicUserState(request, env));
      if (url.pathname === "/api/ai" && request.method === "POST") return handleAi(request, env);
      if (url.pathname === "/api/diagnose" && request.method === "POST") return handleDiagnose(request, env);
      if (url.pathname === "/api/generate-report") return handleGenerateReport(request, env);
      if (url.pathname === "/api/report-counter") return handleReportCounter(env);
      if (url.pathname === "/api/ai-helper-count") return handleAiHelperCount(env);
      if (url.pathname === "/api/rollback-calculator" && request.method === "POST") return handleRollbackCalculator(request, env);
      if (url.pathname === "/api/prompt-checker" && request.method === "POST") return handlePromptChecker(request, env);
      if (url.pathname === "/api/safe-scan" && request.method === "POST") return handleSafeScan(request, env);
      if (url.pathname.startsWith("/report/")) return renderStoredReport(request, env);
      if (url.pathname === "/pricing") return redirect(PAYMENT_URL);
      if (url.pathname === "/dashboard") return redirect("/dashboard/reports");
      if (url.pathname.startsWith("/dashboard")) return renderDashboardRoute(request, env);
      return serveStaticAsset(request, env);
    } catch (error) {
      console.error(error);
      return new Response("Something went wrong.", { status: 500 });
    }
  }
};

async function serveStaticAsset(request, env) {
  if (env.ASSETS) return env.ASSETS.fetch(request);
  if (!env.VIBEFIX_KV) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const path = normalizeAssetPath(url.pathname);
  const value = await env.VIBEFIX_KV.get(`asset:${path}`, { type: "arrayBuffer" });

  if (!value) return fetchGitHubAsset(path);

  return new Response(value, {
    headers: {
      "Content-Type": contentTypeFor(path),
      "Cache-Control": path === "/index.html" ? "public, max-age=60" : "public, max-age=3600"
    }
  });
}

async function fetchGitHubAsset(path) {
  const response = await fetch(`${STATIC_ASSET_ORIGIN}${path}`);
  if (!response.ok) return new Response("Not found", { status: 404 });

  return new Response(response.body, {
    headers: {
      "Content-Type": contentTypeFor(path),
      "Cache-Control": path === "/index.html" ? "public, max-age=60" : "public, max-age=3600"
    }
  });
}

function normalizeAssetPath(pathname) {
  if (!pathname || pathname === "/") return "/index.html";
  if (!pathname.includes(".") && !pathname.endsWith("/")) return `${pathname}.html`;
  return pathname;
}

function contentTypeFor(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (path.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

async function startGoogleAuth(request, env) {
  if (isSupabaseAuthConfigured(env)) return startSupabaseGoogleAuth(request, env);
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return startGuestSession(request, env);

  const url = new URL(request.url);
  const state = cryptoRandom();
  const next = safeNext(url.searchParams.get("next") || "/dashboard");
  const redirectUri = `${url.origin}/auth/google/callback`;
  const authUrl = new URL(GOOGLE_AUTH_URL);

  authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", `${state}.${encodeURIComponent(next)}`);
  authUrl.searchParams.set("prompt", "select_account");

  return redirect(authUrl.toString(), {
    "Set-Cookie": cookie(STATE_COOKIE, state, { maxAge: 600 })
  });
}

function startSupabaseGoogleAuth(request, env) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next") || "/dashboard/ai");
  const redirectTo = `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const authUrl = new URL(`${env.SUPABASE_URL}/auth/v1/authorize`);

  authUrl.searchParams.set("provider", "google");
  authUrl.searchParams.set("redirect_to", redirectTo);

  return redirect(authUrl.toString());
}

async function startGuestSession(request, env) {
  assertKv(env);

  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next") || "/dashboard/ai");
  const existingUser = await getSessionUser(request, env);

  if (existingUser) return redirect(next);

  const guestId = `guest-${cryptoRandom().slice(0, 16)}`;
  const sessionId = cryptoRandom();
  const user = {
    googleId: guestId,
    email: "guest@vibefix.local",
    name: "VibeFix Guest",
    avatar: "",
    created_at: new Date().toISOString(),
    diagnosis_count: 0,
    is_guest: true
  };

  await env.VIBEFIX_KV.put(`user:${guestId}`, JSON.stringify(user), { expirationTtl: SESSION_TTL_SECONDS });
  await env.VIBEFIX_KV.put(`session:${sessionId}`, JSON.stringify({
    userId: guestId,
    created_at: new Date().toISOString()
  }), { expirationTtl: SESSION_TTL_SECONDS });

  return redirect(next, {
    "Set-Cookie": cookie(COOKIE_NAME, sessionId, { maxAge: SESSION_TTL_SECONDS })
  });
}

async function finishSupabaseAuth(request, env) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next") || "/dashboard/ai");
  const code = url.searchParams.get("code");

  if (!isSupabaseAuthConfigured(env)) {
    return startGuestSession(new Request(`${url.origin}/auth/guest?next=${encodeURIComponent(next)}`, request), env);
  }

  if (!code) {
    return html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Finishing sign in</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="payment-shell">
    <section class="payment-card">
      <span class="section-kicker">Sign in</span>
      <h1>Finishing sign in...</h1>
      <p class="muted">If this page does not continue automatically, use the button below.</p>
      <a class="btn btn-primary full-width" href="/auth/google?next=${escapeAttr(next)}">Try Sign In Again</a>
    </section>
  </main>
  <script>
    (async () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token) return;
      const response = await fetch("/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token, refresh_token, next: ${JSON.stringify(next)} })
      });
      const data = await response.json().catch(() => ({}));
      window.location.href = data.next || ${JSON.stringify(next)};
    })();
  </script>
</body>
</html>`);
  }

  try {
    const tokenResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=authorization_code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": env.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ code })
    });

    const token = await tokenResponse.json();
    if (token?.access_token) return createSupabaseSessionResponse(token, next, env);
  } catch (error) {
    console.error("Supabase code exchange failed", error);
  }

  return startGuestSession(new Request(`${url.origin}/auth/guest?next=${encodeURIComponent(next)}`, request), env);
}

async function finishBrowserSupabaseSession(request, env) {
  if (!isSupabaseAuthConfigured(env)) return json({ error: "Supabase auth is not configured" }, 500);
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!payload.access_token) return json({ error: "Missing access token" }, 400);
  const next = safeNext(payload.next || "/dashboard/ai");
  const response = await createSupabaseSessionResponse(payload, next, env);
  const setCookie = response.headers.get("Set-Cookie");
  return json({ next }, 200, setCookie ? { "Set-Cookie": setCookie } : {});
}

async function createSupabaseSessionResponse(token, next, env) {
  assertKv(env);
  const profileResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      "apikey": env.SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token.access_token}`
    }
  });

  if (!profileResponse.ok) throw new Error("Could not read Supabase user");
  const profile = await profileResponse.json();
  const metadata = profile.user_metadata || {};
  const userId = profile.id || profile.sub || profile.email;
  const userKey = `user:${userId}`;
  const existing = await env.VIBEFIX_KV.get(userKey, "json");
  const user = {
    googleId: userId,
    email: profile.email || "",
    name: metadata.full_name || metadata.name || profile.email || "User",
    avatar: metadata.avatar_url || metadata.picture || "",
    created_at: existing?.created_at || new Date().toISOString(),
    diagnosis_count: existing?.diagnosis_count || 0,
    provider: "supabase"
  };

  await env.VIBEFIX_KV.put(userKey, JSON.stringify(user));

  const sessionId = cryptoRandom();
  await env.VIBEFIX_KV.put(`session:${sessionId}`, JSON.stringify({
    userId,
    created_at: new Date().toISOString()
  }), { expirationTtl: SESSION_TTL_SECONDS });

  return redirect(next, {
    "Set-Cookie": cookie(COOKIE_NAME, sessionId, { maxAge: SESSION_TTL_SECONDS })
  });
}

function isSupabaseAuthConfigured(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

async function finishGoogleAuth(request, env) {
  assertEnv(env, ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
  assertKv(env);

  const url = new URL(request.url);
  const rawState = url.searchParams.get("state") || "";
  const [state, encodedNext = "%2Fdashboard"] = rawState.split(".");
  const expectedState = getCookie(request, STATE_COOKIE);
  const code = url.searchParams.get("code");

  if (!code || !state || state !== expectedState) return new Response("Invalid OAuth state.", { status: 400 });

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/google/callback`,
      grant_type: "authorization_code"
    })
  });

  if (!tokenResponse.ok) return new Response("Google sign-in failed.", { status: 401 });

  const token = await tokenResponse.json();
  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });

  if (!profileResponse.ok) return new Response("Could not read Google profile.", { status: 401 });

  const profile = await profileResponse.json();
  const userKey = `user:${profile.sub}`;
  const existing = await env.VIBEFIX_KV.get(userKey, "json");
  const user = {
    googleId: profile.sub,
    email: profile.email,
    name: profile.name || profile.email,
    avatar: profile.picture || "",
    created_at: existing?.created_at || new Date().toISOString(),
    diagnosis_count: existing?.diagnosis_count || 0
  };

  await env.VIBEFIX_KV.put(userKey, JSON.stringify(user));

  const sessionId = cryptoRandom();
  await env.VIBEFIX_KV.put(`session:${sessionId}`, JSON.stringify({
    userId: profile.sub,
    created_at: new Date().toISOString()
  }), { expirationTtl: SESSION_TTL_SECONDS });

  const next = safeNext(decodeURIComponent(encodedNext));
  return redirect(next, {
    "Set-Cookie": [
      cookie(COOKIE_NAME, sessionId, { maxAge: SESSION_TTL_SECONDS }),
      cookie(STATE_COOKIE, "", { maxAge: 0 })
    ]
  });
}

async function signOut(request, env) {
  const sessionId = getCookie(request, COOKIE_NAME);
  if (sessionId && env.VIBEFIX_KV) await env.VIBEFIX_KV.delete(`session:${sessionId}`);
  return redirect("/", { "Set-Cookie": cookie(COOKIE_NAME, "", { maxAge: 0 }) });
}

async function renderDashboardRoute(request, env) {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  const url = new URL(request.url);
  if (url.pathname === "/dashboard/reports") return html(renderReportsPage(user, await getReports(env, user.googleId), env));
  if (url.pathname === "/dashboard/ai") return html(renderAiPage(user, env));
  if (url.pathname === "/dashboard/account") return html(renderAccountPage(user));
  return new Response("Not found", { status: 404 });
}

async function handleAi(request, env) {
  const user = await requireUser(request, env, true);
  if (!user) return json({ error: "Unauthorized" }, 401);

  assertKv(env);
  const payload = await request.json();
  const freeLimit = Number(env.FREE_AI_LIMIT || 3);
  const usageKey = `usage:${user.googleId}`;
  const usage = Number(await env.VIBEFIX_KV.get(usageKey) || "0");

  if (usage >= freeLimit) {
    return streamGate(freeLimit);
  }

  const tool = clean(payload.tool || "Other");
  const breakTypes = Array.isArray(payload.breakTypes) ? payload.breakTypes.map(clean).join(", ") : "Other";
  const description = clean(payload.description || "");
  const image = payload.image || null;
  const confidenceLevel = calculateConfidence(description, image);

  if (!description.trim()) return json({ error: "Describe what broke before generating prompts." }, 400);

  const stream = new ReadableStream({
    async start(controller) {
      const write = (event, data) => controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      write("meta", { remainingBefore: Math.max(0, freeLimit - usage) });

      let fullText = "";

      try {
        if (!env.ANTHROPIC_API_KEY) {
          fullText = fallbackDiagnosis(tool, breakTypes, description);
          for (const chunk of chunkText(fullText)) write("token", { text: chunk });
        } else {
          fullText = await streamAnthropic({ env, tool, breakTypes, description, image, write });
        }

        await env.VIBEFIX_KV.put(usageKey, String(usage + 1));
        await saveAiHelperSession(env, {
          builder_tool: tool,
          break_type: breakTypes,
          description,
          generated_prompt: extractFixPrompt(fullText),
          confidence_level: confidenceLevel
        });
        write("done", { text: fullText, remaining: Math.max(0, freeLimit - usage - 1), limit: freeLimit, confidence: confidenceLevel });
      } catch (error) {
        write("error", { message: "The AI helper could not generate a response. Try again with the error message pasted in." });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "Connection": "keep-alive"
    }
  });
}

async function handleGenerateReport(request, env) {
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return json({ success: false, error: "Content-Type must be application/json" }, 415);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  for (const field of REQUIRED_INTAKE_FIELDS) {
    if (!hasSubmittedValue(payload[field])) {
      return json({ success: false, error: `Missing required field: ${field}` }, 400);
    }
  }

  const redactedPayload = redactSecretsDeep(payload);

  try {
    const report = await generateDiagnosisReport(redactedPayload, env);
    const reportRecord = await saveGeneratedReport(request, env, redactedPayload, report);
    await saveIntakeSubmission(env, redactedPayload, reportRecord);
    await saveCaseFile(env, redactedPayload, report.model);
    await deliverOwnerReport(redactedPayload, report.renderedText, reportRecord, env);
    return json({ success: true, reportId: reportRecord.id, reportUrl: reportRecord.reportUrl });
  } catch (error) {
    console.error(error);
    return json({ success: false, error: error.message || "Could not generate and email report draft." }, 500);
  }
}

async function handleReportCounter(env) {
  const rows = await supabaseSelect(env, "report_counter", "id=eq.1&select=count,last_diagnosed_at");
  const row = rows?.[0] || { count: 0, last_diagnosed_at: null };
  return json({
    count: Number(row.count || 0),
    last_diagnosed_at: row.last_diagnosed_at || null
  });
}

async function handleAiHelperCount(env) {
  const count = await supabaseRpcCount(env, "get_ai_helper_sessions_count");
  return json({ count });
}

async function handleRollbackCalculator(request, env) {
  const payload = await request.json();
  const answers = payload.answers || {};
  const recommendation = calculateRollbackRecommendation(answers);

  await supabaseInsert(env, "rollback_calculator_sessions", {
    answers_json: answers,
    recommendation: recommendation.type
  });

  return json(recommendation);
}

async function handlePromptChecker(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const originalPrompt = clean(redactSecrets(payload.prompt || ""));
  if (!originalPrompt) return json({ error: "Paste a prompt before checking scope." }, 400);

  const result = env.ANTHROPIC_API_KEY
    ? await analyzePromptScopeWithAnthropic(originalPrompt, env)
    : fallbackPromptScopeAnalysis(originalPrompt);

  await supabaseInsert(env, "prompt_checker_sessions", {
    original_prompt: originalPrompt,
    risk_level: result.risk_level,
    rewritten_prompt: result.rewritten_prompt
  });

  await supabaseInsert(env, "vibefix_prompt_checks", {
    prompt_text: originalPrompt,
    risk_level: result.risk_level,
    risky_phrases: Array.isArray(result.accidental_touch_areas) ? result.accidental_touch_areas : [],
    safe_rewrite: result.rewritten_prompt,
    raw_payload: redactSecretsDeep({ payload, result })
  });

  return json(result);
}

async function handleDiagnose(request, env) {
  const user = await requireUser(request, env, true);
  if (!user) return json({ error: "Unauthorized" }, 401);
  assertKv(env);

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const tool = clean(payload.tool || "Other");
  const breakType = clean(payload.breakType || payload.breakTypes || "Other");
  const description = clean(payload.description || "");
  const freeLimit = Number(env.FREE_AI_LIMIT || 3);
  const usageKey = `usage:${user.googleId}`;
  const usage = Number(await env.VIBEFIX_KV.get(usageKey) || "0");

  if (!description.trim()) return json({ error: "Describe what broke before generating prompts." }, 400);

  if (usage >= freeLimit) {
    return json({
      gated: true,
      limit: freeLimit,
      remaining: 0,
      result: `LIKELY CAUSE:
You have used all ${freeLimit} free prompt generations.

WHAT NOT TO TOUCH:
- Do not keep trying to regenerate prompts for free in this session.
- Do not rewrite the app blindly.
- Do not change auth, database, payment, or environment settings without a diagnosis.

PASTE THIS INTO YOUR TOOL:
Your free VibeFix AI Helper limit is finished. Use the payment option below to continue with the full diagnosis report.

CONFIDENCE: High
REASON: The free usage limit for this session has been reached.`
    });
  }

  const result = buildDiagnosisResult(tool, breakType, description, {
    attemptCount: Number(payload.attemptCount || 1),
    lastGeneratedPrompt: clean(payload.lastGeneratedPrompt || ""),
    recentGeneratedPrompts: Array.isArray(payload.recentGeneratedPrompts)
      ? payload.recentGeneratedPrompts.map((item) => clean(item)).slice(0, 5)
      : []
  });

  await env.VIBEFIX_KV.put(usageKey, String(usage + 1));
  await saveAiHelperSession(env, {
    builder_tool: tool,
    break_type: breakType,
    description,
    generated_prompt: extractFixPrompt(result),
    confidence_level: calculateConfidence(description, null)
  });
  return json({ result, remaining: Math.max(0, freeLimit - usage - 1), limit: freeLimit });
}

async function handleSafeScan(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const payload = redactSecretsDeep(body.payload || {});
  const result = redactSecretsDeep(body.result || {});
  const stored = await supabaseInsert(env, "vibefix_scans", {
    builder: clean(payload.builder || payload.build_tool || ""),
    break_type: clean(payload.break_type || ""),
    issue_location: clean(payload.issue_location || ""),
    break_timing: clean(payload.break_timing || ""),
    last_working_state: clean(payload.last_working_state || ""),
    current_broken_behavior: clean(payload.current_broken_behavior || ""),
    last_prompt: clean(payload.last_prompt || ""),
    last_ai_tool: clean(payload.last_ai_tool || ""),
    original_ai_tool: clean(payload.original_ai_tool || ""),
    fix_attempts: clean(payload.fix_attempts || ""),
    rollback_available: clean(payload.rollback_available || ""),
    error_message: clean(payload.error_message || ""),
    risk_score: Number(result.score || 0),
    prompt_again_risk: clean(result.promptRisk || ""),
    likely_break_layer: clean(result.layer || ""),
    confidence_score: clean(result.confidence || ""),
    no_touch_zones: Array.isArray(result.noTouchZones) ? result.noTouchZones.map(clean) : [],
    safe_first_prompt: clean(result.safePrompt || ""),
    missing_evidence: Array.isArray(result.missingEvidence) ? result.missingEvidence.map(clean) : [],
    raw_payload: { payload, result }
  });

  return json({ success: true, stored });
}

async function saveIntakeSubmission(env, payload, reportRecord) {
  await supabaseInsert(env, "vibefix_intakes", {
    razorpay_payment_id: clean(payload.payment_id || payload.razorpay_payment_id || payload.razorpay_order_id || ""),
    name: clean(payload.name || ""),
    email: clean(payload.email || ""),
    app_name: clean(payload.app_name || ""),
    live_url: clean(payload.live_app_url || ""),
    preview_url: clean(payload.preview_url || ""),
    repo_url: clean(payload.repo_link || ""),
    builder: clean(payload.build_tool || payload.original_builder || ""),
    break_type: clean(payload.break_type || ""),
    last_working_state: clean(payload.working_before || payload.last_working_state || ""),
    current_broken_behavior: clean(payload.broken_now || payload.current_broken_behavior || ""),
    last_prompt: clean(payload.last_change || payload.last_prompt || ""),
    recent_prompts: splitLines(payload.recent_prompts),
    last_ai_tool: clean(payload.last_ai_tool || ""),
    original_ai_tool: clean(payload.original_builder || payload.original_ai_tool || ""),
    fix_attempts: clean(payload.fix_attempt_count || payload.fix_attempts || ""),
    error_message: clean(payload.error_message || ""),
    evidence_links: clean(payload.evidence_links || ""),
    issue_location: clean(payload.issue_location || ""),
    rollback_available: clean(payload.rollback_available || ""),
    no_touch_areas: clean(payload.do_not_touch || payload.no_touch_areas || ""),
    test_login_available: clean(payload.test_login_available || ""),
    raw_payload: { ...payload, report_id: reportRecord?.id || "", report_url: reportRecord?.reportUrl || "" }
  });
}

async function saveCaseFile(env, payload, reportModel) {
  await supabaseInsert(env, "vibefix_case_files", {
    case_type: "deep_diagnosis",
    risk_score: Number(reportModel?.confidencePercent || 0),
    likely_break_layer: clean(payload.break_type || ""),
    payload,
    result: reportModel || {}
  });
}

function calculateRollbackRecommendation(answers) {
  let risk = 0;
  if (answers.files_changed === "more than 10") risk += 3;
  if (answers.files_changed === "3-10") risk += 1;
  if (answers.auth_database === "yes") risk += 3;
  if (answers.auth_database === "not sure") risk += 2;
  if (answers.clean_version === "yes") risk -= 2;
  if (answers.understand_change === "no") risk += 2;
  if (answers.understand_change === "partially") risk += 1;
  if (answers.time_spent === "over 1 hour") risk += 2;
  if (answers.time_spent === "30-60 min") risk += 1;

  if (risk >= 5) {
    return {
      type: "ROLLBACK",
      explanation: "Rollback is safer because the last change likely touched too much or affected risky areas. Return to the last clean working version, then re-apply the intended change in a smaller scope. Avoid auth, database, environment, and production settings until the break boundary is clear."
    };
  }

  if (risk <= 1) {
    return {
      type: "FIX FORWARD",
      explanation: "Fix forward is reasonable because the affected area appears limited and understandable. Make the smallest targeted change, then test the old working flow and the new intended flow. Do not allow a broad refactor."
    };
  }

  return {
    type: "HYBRID",
    explanation: "Use a hybrid path: preserve the current broken state for evidence, compare it against the last working version, then either rollback the risky part or fix forward only the isolated file/config. Do not keep prompting broadly while the cause is uncertain."
  };
}

async function analyzePromptScopeWithAnthropic(prompt, env) {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 900,
      stream: false,
      system: "You analyze prompts for AI app builders. Return strict JSON only with keys risk_level, accidental_touch_areas, rewritten_prompt. Risk level must be Low, Medium, or High.",
      messages: [{
        role: "user",
        content: `Analyze this prompt for accidental scope risk and rewrite it safely:\n\n${prompt}`
      }]
    })
  });

  if (!response.ok) return fallbackPromptScopeAnalysis(prompt);
  const data = await response.json();
  const text = data?.content?.map((part) => part.text || "").join("").trim() || "";

  try {
    const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, ""));
    return {
      risk_level: clean(parsed.risk_level || "Medium"),
      accidental_touch_areas: Array.isArray(parsed.accidental_touch_areas) ? parsed.accidental_touch_areas.map(clean) : [clean(parsed.accidental_touch_areas || "Unclear scope")],
      rewritten_prompt: clean(parsed.rewritten_prompt || prompt)
    };
  } catch (error) {
    return fallbackPromptScopeAnalysis(prompt);
  }
}

function fallbackPromptScopeAnalysis(prompt) {
  const broad = /\b(rewrite|refactor|entire|whole app|fix everything|all files|from scratch)\b/i.test(prompt);
  return {
    risk_level: broad ? "High" : "Medium",
    accidental_touch_areas: broad
      ? ["Unrelated components", "Auth/database configuration", "Existing working flows"]
      : ["Nearby components", "Shared state", "Existing working flows"],
    rewritten_prompt: `Do not rewrite the app. Do not refactor unrelated code. Do not change auth, database, payment, environment variables, or production settings unless clearly required.\n\nGoal:\n${prompt}\n\nFirst identify the smallest affected area. Then propose the smallest safe change only. List every file or setting you plan to touch before making changes. After the fix, give me a regression checklist for the old working flow and the broken flow.`
  };
}

async function saveAiHelperSession(env, row) {
  await supabaseInsert(env, "ai_helper_sessions", row);
}

async function supabaseSelect(env, table, query) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return [];
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}?${query}`, {
    headers: supabaseHeaders(env)
  });
  if (!response.ok) return [];
  return response.json();
}

async function supabaseRpcCount(env, fn) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return 0;
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(env),
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  if (!response.ok) return 0;
  return Number(await response.json() || 0);
}

async function supabaseInsert(env, table, row) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;
  try {
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(env),
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(row)
    });
    return response.ok;
  } catch (error) {
    console.error(`Supabase insert failed for ${table}.`);
    return false;
  }
}

function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
  };
}

function calculateConfidence(description, image) {
  const hasError = /(error|exception|failed|denied|unauthorized|timeout|stack|console|log)/i.test(description);
  if (image && hasError && description.length > 120) return "High";
  if (hasError || image || description.length > 80) return "Medium";
  return "Low";
}

function extractFixPrompt(text) {
  const marker = "FIX PROMPT FOR";
  const upper = text.toUpperCase();
  const index = upper.indexOf(marker);
  return index === -1 ? text.slice(0, 4000) : text.slice(index).slice(0, 4000);
}

function hasSubmittedValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function splitLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean)
    .slice(0, 8);
}

function redactSecretsDeep(value) {
  if (Array.isArray(value)) return value.map(redactSecretsDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactSecretsDeep(entry)]));
  }
  if (typeof value === "string") return redactSecrets(value);
  return value;
}

function redactSecrets(value) {
  return String(value)
    .replace(/(api[_-]?key|service[_-]?role|secret|password|token|bearer)\s*[:=]\s*["']?[^"'\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g, "[REDACTED_OPENAI_KEY]")
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\bBearer\s+[a-zA-Z0-9._-]{12,}\b/gi, "Bearer [REDACTED]")
    .replace(/\b(seed phrase|private token|database password|service role key)\b\s*[:=]?\s*[^,\n]+/gi, "$1 [REDACTED]");
}

async function deliverOwnerReport(payload, reportText, reportRecord, env) {
  if (env.RESEND_API_KEY && env.OWNER_EMAIL && env.FROM_EMAIL) {
    await emailOwnerReport(payload, reportText, reportRecord, env);
    return;
  }

  await submitWeb3FormsFallback(payload, reportText, reportRecord, env);
}

async function submitWeb3FormsFallback(payload, reportText, reportRecord, env) {
  const accessKey = env.WEB3FORMS_ACCESS_KEY || WEB3FORMS_FALLBACK_ACCESS_KEY;
  if (!accessKey) throw new Error("WEB3FORMS_ACCESS_KEY is not configured.");

  const response = await fetch(WEB3FORMS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_key: accessKey,
      subject: `New VibeFix intake submitted — ${payload.app_name} — ${payload.build_tool}`,
      from_name: "VibeFix Intake",
      name: payload.name,
      email: payload.email,
      payment_id: payload.payment_id,
      app_name: payload.app_name,
      build_tool: payload.build_tool,
      break_type: payload.break_type,
      report_id: reportRecord.id,
      report_url: reportRecord.reportUrl,
      generated_report_draft: reportText,
      raw_submission: JSON.stringify(payload, null, 2)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Web3Forms fallback failed: ${text.slice(0, 500)}`);
  }
}

function generateLocalReportDraft(payload) {
  return `# VibeFix Broken App Diagnosis Report

## Case Information
Client Name: ${payload.name}
Client Email: ${payload.email}
Payment ID: ${payload.payment_id}
App Name: ${payload.app_name}
App URL: ${payload.live_app_url}
Build Tool: ${payload.build_tool}
Break Type: ${payload.break_type}

## 1. Final Diagnosis
This is a structured intake-based draft generated because Gemini is not configured on the Worker yet. Based on the submitted details, the issue appears connected to "${payload.break_type}" after this last change: ${payload.last_change}. The app context is: ${payload.app_context}. What was working before: ${payload.working_before}. What is broken now: ${payload.broken_now}. Confidence should be treated as medium or lower until logs, screenshots, repo context, and exact runtime errors are reviewed. One-line summary: the safest next move is to isolate the last change, avoid broad rewrites, and verify whether the break is limited to the affected tool/configuration area before changing auth, database, payment, or production settings.

## 2. What Likely Happened
Before: ${payload.working_before}
Change: ${payload.last_change}
After: ${payload.broken_now}
Likely chain: the most recent change probably affected a focused route, component, config, integration, or deployment behavior related to ${payload.break_type}.

## 3. Evidence Used
- Build tool: ${payload.build_tool}
- Break type: ${payload.break_type}
- Issue location: ${payload.issue_location}
- Error message: ${payload.error_message || "No exact error submitted."}
- Evidence links: ${payload.evidence_links || "No evidence links submitted."}

## 4. Missing Information / Assumptions
Missing information may include full logs, screenshots, repo diff, auth/database config, or deployment logs. The diagnosis assumes the submitted last change is related to the break. Missing evidence lowers confidence.

## 5. What NOT To Touch
- Do not rewrite the whole app; that can create new regressions.
- Do not change auth/database/payment settings unless logs point there directly.
- Do not change production environment variables blindly.

## 6. Rollback vs Fix-Forward Decision
Decision: ${payload.diagnosis_priority}
Reason: the safest decision depends on whether the last change is isolated and reversible.

## 7. Safest First Fix
1. Compare the last working state with the current broken state.
2. Reproduce the issue in the smallest affected flow.
3. Ask the AI builder for a minimal fix without refactoring unrelated files.

## 8. Priority Fix Order
P0: Preserve current working flows.
P1: Isolate the break area.
P2: Apply smallest safe fix.
P3: Run regression checks.

## 9. Exact AI Repair Prompts
1. Diagnosis prompt: In ${payload.build_tool}, diagnose this ${payload.break_type} issue for this app: ${payload.app_context}. What broke: ${payload.broken_now}. Last change: ${payload.last_change}. Error: ${payload.error_message || "No exact error provided."}. Do not rewrite the app or change auth, database, payment, or env settings unless required.
2. Safe-fix prompt: Make the smallest safe fix for the issue above. Do not refactor unrelated code. Explain what files/components/configs are touched and why.
3. Regression-test prompt: Create a regression checklist for this app and issue. Include the original working flow, the broken flow, production/preview checks, and what not to touch.

## 10. Test Checklist After Fix
- Confirm ${payload.working_before} still works.
- Confirm ${payload.broken_now} is fixed.
- Test ${payload.issue_location}.
- Check auth, data loading, deployment, and payment flows if relevant.

## 11. What Might Break Next
- Related state or routing.
- Auth/database permissions if touched.
- Preview vs production configuration.

## 12. Prevention Notes
- Keep prompts scoped.
- Save last working versions before major changes.
- Do not let AI change unrelated config.

## 13. Escalation Note
If this issue involves exposed private data, payment failures, database corruption, serious security risk, or user data loss, escalate to a senior developer immediately.

## 14. Scope Note
This report is a structured diagnosis for common post-launch break patterns in AI-built apps. It is not full security testing, legal/compliance review, 24/7 production support, or guaranteed implementation.`;
}

async function generateGeminiReport(payload, env) {
  const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: buildGeminiPrompt(payload) }]
      }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 6000
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini report generation failed: ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  const report = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
  if (!report) throw new Error("Gemini returned an empty report draft.");
  return report;
}

async function emailOwnerReport(payload, reportText, reportRecord, env) {
  const subject = `New VibeFix report draft - ${payload.app_name} - ${payload.build_tool}`;
  const body = `New VibeFix intake submitted.

Client:
${payload.name} / ${payload.email}

Payment ID:
${payload.payment_id}

App:
${payload.app_name}

Tool:
${payload.build_tool}

Break Type:
${payload.break_type}

Stored Report:
${reportRecord.reportUrl}

Generated Report Draft:
${reportText}

Raw Submission:
${JSON.stringify(payload, null, 2)}
`;

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [env.OWNER_EMAIL],
      subject,
      text: body
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend email failed: ${text.slice(0, 500)}`);
  }
}

function buildGeminiPrompt(payload) {
  return `You are generating a VibeFix Broken App Diagnosis Report draft.

Important rules:
- Do not claim certainty without evidence.
- Do not suggest dangerous database, auth, payment, or security changes casually.
- Do not tell the user to rewrite the whole app.
- Do not promise a guaranteed fix.
- If the issue is risky or too complex, recommend escalation to a senior developer.
- Keep the explanation practical and easy for a non-technical founder.
- Use the exact app/tool/error details provided.
- If information is missing, say what is missing and lower confidence.
- The report must feel specific to the submitted app, not generic.
- Include "what might break next."
- Include exact AI prompts customized to the tool, break type, app context, and error details.

Client submission:
${JSON.stringify(payload, null, 2)}

Return a clean diagnosis report in Markdown with these sections:

# VibeFix Broken App Diagnosis Report

## Case Information
Client Name:
Client Email:
Payment ID:
App Name:
App URL:
Build Tool:
Break Type:

## 1. Final Diagnosis
Write a specific 150+ word diagnosis based on the submitted details.

Include:
- likely root cause
- confidence level
- one-line summary

## 2. What Likely Happened
Explain before → change → after → likely chain.

## 3. Evidence Used
List what the diagnosis is based on.

## 4. Missing Information / Assumptions
List missing information.
List assumptions.
Explain how missing info affects confidence.

## 5. What NOT To Touch
List at least 3 things not to touch yet, with reasons.

## 6. Rollback vs Fix-Forward Decision
Choose:
- Rollback
- Fix forward
- Pause and collect more evidence
- Needs senior developer review

Explain why.

## 7. Safest First Fix
Give 3 safe first steps.

## 8. Priority Fix Order
P0:
P1:
P2:
P3:

## 9. Exact AI Repair Prompts
Write 3 prompts:
1. Diagnosis prompt
2. Safe-fix prompt
3. Regression-test prompt

Each prompt must include:
- the actual tool used
- the app context
- what broke
- last change
- exact error message if available
- what not to touch

## 10. Test Checklist After Fix
Create a checklist customized to the issue.

## 11. What Might Break Next
Give 3 likely next failure points.

## 12. Prevention Notes
Give 3 prevention rules.

## 13. Escalation Note
Use this exact wording:
If this issue involves exposed private data, payment failures, database corruption, serious security risk, or user data loss, escalate to a senior developer immediately.

## 14. Scope Note
Use this exact wording:
This report is a structured diagnosis for common post-launch break patterns in AI-built apps. It is not full security testing, legal/compliance review, 24/7 production support, or guaranteed implementation.`;
}

async function generateDiagnosisReport(payload, env) {
  const fallback = buildStructuredReport(payload);

  if (!env.GEMINI_API_KEY) return fallback;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: buildGeminiEnrichmentPrompt(payload, fallback.model) }]
        }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 4000
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini report enrichment failed: ${body.slice(0, 500)}`);
    }

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
    if (!raw) throw new Error("Gemini returned an empty report enrichment.");

    const enriched = JSON.parse(raw);
    return buildStructuredReport(payload, enriched);
  } catch (error) {
    console.error("Gemini enrichment failed, using local report.", error);
    return fallback;
  }
}

function buildGeminiEnrichmentPrompt(payload, model) {
  return `You are enriching a VibeFix Broken App Diagnosis Report draft.

Important rules:
- Do not claim certainty without evidence.
- Do not suggest dangerous database, auth, payment, or security changes casually.
- Do not tell the user to rewrite the whole app.
- Do not promise a guaranteed fix.
- Return JSON only. No markdown fences.

Client submission:
${JSON.stringify(payload, null, 2)}

Base report model:
${JSON.stringify(model, null, 2)}

Return JSON with exactly these keys:
{
  "narrative": "150-250 word flowing paragraph for section 01",
  "confidenceReasoning": "2-3 sentences explaining the confidence level",
  "secondaryPossibility": "one short paragraph",
  "verdictReasoning": "2-3 sentences on rollback vs fix forward",
  "nextBreakPrediction": "3-4 sentences predicting what breaks next if the root cause is ignored"
}`;
}

function buildStructuredReport(payload, overrides = {}) {
  const now = new Date();
  const profile = analyzeSubmission(payload);
  const model = {
    reportId: createReportId(now),
    reportDate: formatReportDate(now),
    submittedAt: formatReportTimestamp(now),
    deliveredAt: formatReportTimestamp(now),
    lastWorking: clean(payload.when_broke || payload.working_before || "Not specified"),
    narrative: clean(overrides.narrative || buildNarrative(payload, profile)),
    rootCause: profile.rootCause,
    confidencePercent: profile.confidencePercent,
    confidenceLabel: profile.confidenceLabel,
    confidenceReasoning: clean(overrides.confidenceReasoning || buildConfidenceReasoning(payload, profile)),
    secondaryPossibility: clean(overrides.secondaryPossibility || buildSecondaryPossibility(payload, profile)),
    verdict: profile.verdict,
    verdictReasoning: clean(overrides.verdictReasoning || buildVerdictReasoning(payload, profile)),
    protectedAreas: profile.protectedAreas,
    confirmationTest: profile.confirmationTest,
    fixOrder: profile.fixOrder,
    prompts: profile.prompts,
    postFixChecklist: profile.postFixChecklist,
    nextBreakPrediction: clean(overrides.nextBreakPrediction || buildNextBreakPrediction(payload, profile))
  };

  return {
    model,
    renderedText: renderReportText(payload, model)
  };
}

function analyzeSubmission(payload) {
  const breakType = clean(payload.break_type || "Other");
  const issueLocation = clean(payload.issue_location || "Not sure");
  const profile = getIssueProfile(breakType);
  const confidencePercent = computeConfidence(payload);
  const confidenceLabel = confidencePercent >= 80 ? "High confidence" : confidencePercent >= 65 ? "Medium confidence" : "Low confidence";
  const verdict = decideVerdict(payload, confidencePercent);
  const toolName = clean(payload.build_tool || "your AI builder");
  const doNotTouch = clean(payload.do_not_touch || "");
  const focusAreas = clean(payload.focus_areas || "");

  const protectedAreas = [
    {
      name: focusAreas || profile.protectedAreas[0].name,
      reason: focusAreas
        ? `You explicitly asked to focus on "${focusAreas}", so adjacent areas should stay untouched until the core break is confirmed.`
        : profile.protectedAreas[0].reason
    },
    profile.protectedAreas[1],
    doNotTouch
      ? { name: "Your explicit no-touch area", reason: `You said not to touch: ${doNotTouch}. That boundary should be respected unless logs prove it is the root cause.` }
      : profile.protectedAreas[2]
  ];

  const prompts = [
    `In ${toolName}, diagnose this ${breakType} issue for ${payload.app_name}. App context: ${payload.app_context}. What worked before: ${payload.working_before}. What is broken now: ${payload.broken_now}. Last change before the break: ${payload.last_change}. Exact error: ${payload.error_message || "No exact error provided"}. Focus on ${profile.focus}. Do not touch ${protectedAreas.map((item) => item.name).join(", ")}. Explain the smallest failing area first before suggesting code changes.`,
    `In ${toolName}, make the smallest safe fix for this ${breakType} issue in ${payload.app_name}. The fix must restore: ${payload.broken_now}. Keep working behavior intact: ${payload.working_before}. Limit changes to ${profile.fixTargets}. Do not rewrite the app, do not refactor unrelated files, and do not touch ${protectedAreas.map((item) => item.name).join(", ")}. After the fix, list exactly what files, settings, or components changed and why.`,
    `In ${toolName}, verify the fix for ${payload.app_name}. Original issue: ${payload.broken_now}. Expected working state: ${payload.working_before}. Review ${profile.fixTargets} and confirm: 1) the root-cause fix is present, 2) nothing adjacent changed accidentally, 3) ${issueLocation} still works, 4) the next regression risks are checked.`
  ];

  return {
    rootCause: profile.rootCause(payload),
    confidencePercent,
    confidenceLabel,
    verdict,
    protectedAreas,
    confirmationTest: profile.confirmationTest(payload),
    fixOrder: profile.fixOrder(payload),
    postFixChecklist: profile.postFixChecklist(payload),
    nextRisk: profile.nextRisk(payload),
    focus: profile.focus,
    fixTargets: profile.fixTargets,
    prompts
  };
}

function getIssueProfile(breakType) {
  const profiles = {
    "App broke after update": {
      focus: "the last changed component, dependency, or config touched by the update",
      fixTargets: "the last updated component, dependency config, and the exact failing flow",
      rootCause: (payload) => `The strongest signal is that a recent update changed behavior in a focused part of the app, and that change now conflicts with the previously working flow described as "${payload.working_before}".`,
      protectedAreas: [
        { name: "Previously stable user flow", reason: "That flow was working before the last update, so broad edits there would hide the actual regression." },
        { name: "Authentication and billing settings", reason: "Those areas create larger blast radius than the reported update itself." },
        { name: "Global environment variables", reason: "Changing env values before isolating the regression can turn one issue into several." }
      ],
      confirmationTest: (payload) => [
        `Reproduce the exact broken flow described as: ${payload.broken_now}.`,
        `Open the file or component changed most recently and compare it against the last known working behavior: ${payload.working_before}.`,
        `Temporarily isolate or revert only that focused change in a safe environment.`,
        `Retest the same flow. If it recovers, the diagnosis is confirmed.`
      ],
      fixOrder: () => [
        { title: "Recreate the regression in the smallest possible flow", detail: "Confirm the break on one page, route, or component before touching anything else." },
        { title: "Undo or isolate the last risky change", detail: "This reveals whether the regression came from the update itself or from a side effect." },
        { title: "Reapply only the required change safely", detail: "Bring back the intended feature without the extra edits that widened the blast radius." },
        { title: "Verify the restored flow end to end", detail: "Test both the broken path and the previously working path before shipping." }
      ],
      postFixChecklist: (payload) => [
        `Retest the exact broken flow: ${payload.broken_now}.`,
        "Run the same feature in an incognito session to avoid cached state masking issues.",
        "Write down what the last change was and why it caused the regression.",
        "Redeploy cleanly after verification instead of stacking hot fixes.",
        "Watch the updated component for 48 hours after release."
      ],
      nextRisk: () => "The next likely break is another flow that depends on the same updated component or shared state, because the original issue came from a regression introduced by a recent change."
    },
    "UI/layout broke": {
      focus: "the component tree, CSS, responsive wrappers, and conditional rendering around the broken layout",
      fixTargets: "the broken component, its styles, and the smallest surrounding container hierarchy",
      rootCause: (payload) => `The layout issue most likely comes from a recent component, style, or conditional-rendering change that altered spacing, sizing, or visibility in the user flow described as "${payload.broken_now}".`,
      protectedAreas: [
        { name: "Working navigation and routing", reason: "Routing changes are not the first fix for a visual regression and can create unrelated failures." },
        { name: "Data layer and API calls", reason: "A layout break should be isolated before changing backend behavior." },
        { name: "Authentication flow", reason: "Login logic is a high-risk area unrelated to a purely visual issue unless evidence proves otherwise." }
      ],
      confirmationTest: (payload) => [
        `Open the page where the UI broke and compare it against the last working behavior: ${payload.working_before}.`,
        "Inspect the affected component hierarchy and note any recent style or container changes.",
        "Disable the newest style/layout change in a safe environment.",
        "Check desktop and mobile widths to confirm whether the break is isolated or global."
      ],
      fixOrder: () => [
        { title: "Identify the single broken component boundary", detail: "Fixing the exact container first prevents unnecessary redesigns." },
        { title: "Restore spacing, width, and visibility rules", detail: "Bring back the last known working layout before touching logic." },
        { title: "Test responsive states", detail: "Confirm the same component works on mobile and desktop before finalizing." },
        { title: "Redeploy and visual-regression check", detail: "Verify no adjacent page sections moved unexpectedly." }
      ],
      postFixChecklist: () => [
        "Compare the fixed screen with a screenshot of the intended design.",
        "Test the component on desktop and mobile widths.",
        "Check hover, focus, and error states after the CSS fix.",
        "Add a note to the change log describing which wrapper or class caused the break.",
        "Watch the same page after the next deploy for visual regressions."
      ],
      nextRisk: () => "If the root layout cause is ignored, the next break will usually appear in a sibling screen that reuses the same component or shared style token."
    },
    "Login/signup broke": {
      focus: "auth callbacks, session handling, redirect paths, and the login form submission flow",
      fixTargets: "auth config, redirect URLs, session handling, and the exact failing auth component",
      rootCause: (payload) => `The failure pattern points to a mismatch between the login flow and the app's current auth/session configuration, especially around the state that changed before the break: "${payload.last_change}".`,
      protectedAreas: [
        { name: "User database tables", reason: "Schema changes are too risky until the auth path itself is confirmed broken." },
        { name: "Payment flow", reason: "Billing is adjacent to account state and should stay untouched during auth diagnosis." },
        { name: "Working public pages", reason: "Those pages help confirm the issue is auth-specific rather than app-wide." }
      ],
      confirmationTest: (payload) => [
        "Attempt a fresh login in an incognito session.",
        `Compare the expected auth outcome (${payload.working_before}) with the broken behavior (${payload.broken_now}).`,
        "Check callback URLs, auth provider settings, and session persistence for mismatches.",
        "Confirm whether the failure happens before login, after redirect, or after session creation."
      ],
      fixOrder: () => [
        { title: "Pinpoint the auth stage that fails", detail: "Separate form validation, provider redirect, callback, and session restore before fixing." },
        { title: "Repair callback/session configuration", detail: "This is the most common cause when login suddenly stops working after a change." },
        { title: "Validate with a clean test account", detail: "Cached sessions can hide auth problems, so use a fresh sign-in." },
        { title: "Retest dependent private pages", detail: "Confirm the fix works in the downstream pages that rely on auth state." }
      ],
      postFixChecklist: () => [
        "Test sign-in, sign-out, and refresh behavior in a clean browser session.",
        "Retest password reset or magic-link flow if your app uses it.",
        "Confirm protected pages still redirect correctly after login.",
        "Document the callback or session setting that caused the failure.",
        "Monitor auth-related errors for the next 48 hours."
      ],
      nextRisk: () => "If the auth root cause is only patched at the symptom level, the next failure will likely be session persistence, protected-route access, or onboarding for new users."
    },
    "Database/data not loading": {
      focus: "queries, permissions, API responses, and the loading state around the missing data",
      fixTargets: "the exact query path, permission rule, and data-fetching component that stopped returning expected data",
      rootCause: (payload) => `The issue most likely comes from a data-fetching path or permission rule that no longer matches the current app state, which is why the flow described as "${payload.working_before}" now fails as "${payload.broken_now}".`,
      protectedAreas: [
        { name: "Schema structure", reason: "Avoid schema changes until the failing query and permission path are proven." },
        { name: "Authentication provider settings", reason: "Changing auth before confirming the data path can create false positives." },
        { name: "Payment or subscription logic", reason: "Those systems depend on user data and should not be disturbed during diagnosis." }
      ],
      confirmationTest: (payload) => [
        "Run the failing screen and capture the exact network or console error.",
        "Check whether the data request is failing, returning empty, or being blocked.",
        "Compare permissions or query filters against the last known working state.",
        "Retest with a known-good record or test user."
      ],
      fixOrder: () => [
        { title: "Confirm whether the failure is query, permission, or empty-state related", detail: "This prevents unnecessary database edits." },
        { title: "Repair the smallest failing data path", detail: "Update the exact query, filter, or permission rule that blocks the data." },
        { title: "Retest with a known-good dataset", detail: "Use a predictable record to confirm the fix." },
        { title: "Check downstream screens", detail: "Verify any dashboard, list, or detail page using the same data still behaves correctly." }
      ],
      postFixChecklist: () => [
        "Retest the same data flow with a known-good user or record.",
        "Check loading, empty, and error states after the fix.",
        "Verify permissions for the affected user role only after the query path is stable.",
        "Write down which query or policy caused the issue.",
        "Monitor dashboards or lists that reuse the same data source."
      ],
      nextRisk: () => "Ignoring the underlying data path issue often means the next break appears in another screen using the same query or permission rule, not just the page where the problem was first noticed."
    },
    "App works in preview but not production": {
      focus: "environment-specific config, production build behavior, domains, and deployment settings",
      fixTargets: "production environment variables, build output differences, and domain-specific settings",
      rootCause: (payload) => `Because the app works in preview but fails in production, the strongest signal is an environment-specific mismatch rather than a universal logic bug, especially around "${payload.last_change}".`,
      protectedAreas: [
        { name: "Working preview configuration", reason: "It provides the cleanest baseline for comparison." },
        { name: "Database schema", reason: "Production-only failures usually come from config or deployment differences first." },
        { name: "Unrelated app features", reason: "Broad code changes can hide the true production-only mismatch." }
      ],
      confirmationTest: () => [
        "Compare preview and production environment variables side by side.",
        "Check production console/network errors for missing config or blocked requests.",
        "Validate production callback URLs, domains, and API endpoints.",
        "Confirm whether the same build artifact behaves differently only after deploy."
      ],
      fixOrder: () => [
        { title: "Diff preview vs production settings", detail: "This usually reveals the mismatch faster than code rewrites." },
        { title: "Repair only the failing production config or domain binding", detail: "Keep the working preview path as the baseline." },
        { title: "Redeploy cleanly", detail: "A full fresh deploy confirms the corrected production environment is being used." },
        { title: "Retest the exact production-only flow", detail: "Verify the same flow now matches preview behavior." }
      ],
      postFixChecklist: () => [
        "Create a side-by-side record of preview and production env vars.",
        "Retest with production domain, not only preview URL.",
        "Confirm auth callbacks and API origins after redeploy.",
        "Document the production mismatch that caused the issue.",
        "Watch the production-only flow for two days after the fix."
      ],
      nextRisk: () => "If the production mismatch is only patched temporarily, the next break will likely happen on another deploy or on a feature that depends on the same environment-specific setting."
    },
    "Deployment issue": {
      focus: "build pipeline, deploy config, runtime compatibility, and missing environment bindings",
      fixTargets: "the deployment config, build output, and exact runtime requirement that fails during deploy",
      rootCause: (payload) => `The problem appears to be in the deployment path itself rather than the feature logic, which makes the last change "${payload.last_change}" especially important to isolate.`,
      protectedAreas: [
        { name: "Application business logic", reason: "Deployment failures should be narrowed to build/runtime config before changing app features." },
        { name: "Database rules", reason: "Those are high-risk and usually unrelated to the initial deploy error." },
        { name: "Payment flow", reason: "Billing changes create unnecessary risk during deployment recovery." }
      ],
      confirmationTest: () => [
        "Capture the exact build or runtime error from the deploy logs.",
        "Confirm whether the failure happens at install, build, deploy, or runtime startup.",
        "Compare the current deployment config against the last successful deployment.",
        "Retry the same deployment after isolating one config change at a time."
      ],
      fixOrder: () => [
        { title: "Identify the failing deployment stage", detail: "Install, build, and runtime failures require different fixes." },
        { title: "Repair the deployment config or missing binding", detail: "Keep app logic untouched until the deploy path is stable." },
        { title: "Run a clean redeploy", detail: "This confirms the environment accepts the corrected build." },
        { title: "Smoke test the live app", detail: "A successful deploy still needs runtime verification." }
      ],
      postFixChecklist: () => [
        "Save the exact error message that caused the deployment failure.",
        "Document the corrected deploy setting or binding.",
        "Run a smoke test on the live URL after deploy.",
        "Check preview and production once more if both exist.",
        "Monitor the next deployment for the same error pattern."
      ],
      nextRisk: () => "When a deployment root cause is not truly fixed, the next thing to break is usually the next release itself or a runtime binding that only shows up after the deploy succeeds."
    },
    "Payment/checkout issue": {
      focus: "payment callbacks, order creation, redirect flow, and post-payment state updates",
      fixTargets: "the exact checkout callback, payment status handling, and success-page submission flow",
      rootCause: (payload) => `The reported symptoms point to a mismatch between payment completion and the app state that should update afterward, especially in the flow described as "${payload.broken_now}".`,
      protectedAreas: [
        { name: "Live payment credentials", reason: "Do not rotate or replace working billing secrets before confirming the failing callback path." },
        { name: "Unrelated account settings", reason: "Account logic often sits near billing but should not be changed casually." },
        { name: "Database schema", reason: "Schema changes increase billing risk before the exact checkout failure is isolated." }
      ],
      confirmationTest: () => [
        "Run a test payment in the safest possible environment.",
        "Confirm whether the payment succeeds but the post-payment state fails, or whether the payment itself fails.",
        "Inspect redirect parameters, callback handling, and success-page logic.",
        "Check for duplicate, missing, or stale order/payment identifiers."
      ],
      fixOrder: () => [
        { title: "Confirm the exact failure point in checkout", detail: "Separate payment completion, redirect, and post-payment update behavior." },
        { title: "Repair the callback or success-state logic", detail: "Keep billing credentials and unrelated account logic untouched unless logs require it." },
        { title: "Retest with a controlled payment case", detail: "Use one clean flow to verify the fix before broader rollout." },
        { title: "Audit duplicate or missed status updates", detail: "Billing bugs often hide in repeated callbacks or missing state saves." }
      ],
      postFixChecklist: () => [
        "Run one fresh test payment and one cancellation flow.",
        "Confirm the success page receives and preserves the expected payment identifiers.",
        "Verify the paid user sees the next intended state immediately after checkout.",
        "Document which payment callback or redirect assumption was wrong.",
        "Watch the checkout flow closely for 48 hours."
      ],
      nextRisk: () => "If the root cause is ignored, the next failure is usually duplicate charges, missing paid access, or a mismatch between payment success and what the app unlocks afterward."
    },
    "One feature broke another feature": {
      focus: "shared state, reused components, and recently modified files that affect multiple flows",
      fixTargets: "the shared dependency or component that now affects both the new feature and the old one",
      rootCause: (payload) => `The clearest signal is that a new or modified feature changed shared state or a shared component, which is why one area started failing after another was updated.`,
      protectedAreas: [
        { name: "Previously stable feature flow", reason: "That feature gives you the baseline for what must be preserved." },
        { name: "Global config", reason: "Global edits create even wider regressions when the issue is already cross-feature." },
        { name: "Auth and billing", reason: "These systems have high blast radius and should stay untouched unless they are the shared root cause." }
      ],
      confirmationTest: () => [
        "Test the new feature and the broken older feature side by side.",
        "Find the shared component, state store, or config touched by the recent change.",
        "Temporarily isolate that shared dependency in a safe environment.",
        "Retest both features to confirm the shared root cause."
      ],
      fixOrder: () => [
        { title: "Map the shared dependency", detail: "This identifies what both features now depend on." },
        { title: "Restore the original contract of the shared component", detail: "Fix the break without removing the intended new feature." },
        { title: "Retest both features together", detail: "A partial fix is not enough if the second feature still regresses." },
        { title: "Document the dependency contract", detail: "This prevents the same cross-feature break next time." }
      ],
      postFixChecklist: () => [
        "Retest both the new feature and the previously working one.",
        "Inspect shared state or props for accidental contract changes.",
        "Write down which shared component caused the cross-feature regression.",
        "Redeploy only after both paths pass.",
        "Watch sibling flows that use the same component."
      ],
      nextRisk: () => "If the shared dependency is not cleaned up, the next break will likely surface in a third feature that reuses the same component or state pattern."
    },
    "AI keeps fixing one thing and breaking another": {
      focus: "over-broad prompts, repeated refactors, and files the AI is changing outside the target area",
      fixTargets: "prompt scope, target files, and the smallest reproducible failing area",
      rootCause: (payload) => `The issue is likely not one bug but an unstable repair loop, where each AI-generated change touches more surface area than the original problem required.`,
      protectedAreas: [
        { name: "Currently working flows", reason: "Those flows are your safety baseline and should be frozen." },
        { name: "High-risk config and secrets", reason: "AI should not be allowed to improvise around auth, billing, or env settings." },
        { name: "Unrelated files", reason: "The repair loop gets worse when the AI edits outside the failing area." }
      ],
      confirmationTest: () => [
        "List the last 2-3 AI-generated changes that were applied.",
        "Identify whether each change touched files beyond the broken flow.",
        "Reproduce the smallest current bug without introducing a new prompt yet.",
        "Confirm whether the break pattern is caused by scope creep rather than one isolated defect."
      ],
      fixOrder: () => [
        { title: "Freeze the working areas", detail: "Stop the repair loop from expanding further." },
        { title: "Narrow the fix to one failing file or flow", detail: "The AI must work against a tiny target, not the entire app." },
        { title: "Apply one minimal change", detail: "Do not stack multiple speculative prompts." },
        { title: "Run regression tests after each prompt", detail: "This catches new damage immediately." }
      ],
      postFixChecklist: () => [
        "Keep a written list of which files the next AI prompt is allowed to touch.",
        "Retest the original bug plus one adjacent flow after every change.",
        "Save the last working version before sending the next repair prompt.",
        "Document which prompt caused the biggest regression.",
        "Use smaller, file-specific prompts for the next 48 hours."
      ],
      nextRisk: () => "If the repair loop continues, the next break will probably be an unrelated but working part of the app that the AI touched while trying to fix the original issue."
    },
    "Supabase/Firebase/Auth issue": {
      focus: "provider config, auth rules, callback URLs, and user session/permission handling",
      fixTargets: "the exact provider setting, policy, or session path tied to the failing auth/data flow",
      rootCause: (payload) => `The symptoms are consistent with a provider configuration or permission mismatch that no longer matches the app flow after the recent change.`,
      protectedAreas: [
        { name: "Production secrets", reason: "Do not rotate secrets or keys until the actual failing provider path is isolated." },
        { name: "Database schema", reason: "Schema edits are too broad for an auth/provider diagnosis." },
        { name: "Unrelated UI components", reason: "Visual changes should wait until the provider flow is healthy again." }
      ],
      confirmationTest: () => [
        "Check provider logs or console errors for auth/policy failures.",
        "Validate callback URLs, redirect domains, and provider configuration.",
        "Confirm whether the failure is identity, session, or permission related.",
        "Retest with a clean test user."
      ],
      fixOrder: () => [
        { title: "Identify the failing provider stage", detail: "Separate sign-in, callback, session, and permissions." },
        { title: "Repair the exact provider/policy mismatch", detail: "Limit the fix to the failing configuration or permission." },
        { title: "Retest with a clean account", detail: "Confirm cached state is not masking the result." },
        { title: "Verify downstream private pages", detail: "Ensure the fix restores the full intended flow." }
      ],
      postFixChecklist: () => [
        "Retest login, redirect, and private-page access.",
        "Verify the same user role can still access only the intended data.",
        "Document the provider setting or policy that caused the issue.",
        "Check for environment-specific provider differences after redeploy.",
        "Monitor provider logs for two days."
      ],
      nextRisk: () => "If the provider mismatch remains, the next break will usually be session persistence, user permissions, or a downstream page that assumes auth is already healthy."
    },
    "Environment variable/config issue": {
      focus: "runtime config, missing bindings, variable names, and environment-specific assumptions",
      fixTargets: "the exact missing or mismatched variable, binding, or config flag",
      rootCause: (payload) => `The pattern strongly suggests the app is reading configuration that is missing, renamed, or different across environments after the recent change.`,
      protectedAreas: [
        { name: "Working environment values", reason: "Use the last known good config as the baseline instead of improvising new settings." },
        { name: "Database schema", reason: "Schema changes do not solve missing runtime config." },
        { name: "Feature logic unrelated to config load", reason: "Broad code edits can hide the actual missing binding." }
      ],
      confirmationTest: () => [
        "List the variables or bindings the broken flow depends on.",
        "Compare local, preview, and production values carefully.",
        "Confirm variable names and bindings exactly match the code path.",
        "Retest after correcting only the suspected mismatch."
      ],
      fixOrder: () => [
        { title: "Identify the exact missing or mismatched config", detail: "Do not change multiple variables at once." },
        { title: "Correct the binding or variable name", detail: "Use the last known good environment as the reference." },
        { title: "Redeploy cleanly", detail: "Fresh runtime state is needed to confirm the correction." },
        { title: "Retest the affected flow", detail: "Verify the config-dependent path now behaves normally." }
      ],
      postFixChecklist: () => [
        "Keep a written env-var checklist for local, preview, and production.",
        "Retest the exact flow that depended on the missing config.",
        "Check adjacent features using the same variable or binding.",
        "Document the variable name or binding that was wrong.",
        "Monitor the next deployment for config drift."
      ],
      nextRisk: () => "If config drift is not fixed properly, the next break usually shows up in another environment or in a second feature that depends on the same variable."
    }
  };

  return profiles[breakType] || {
    focus: "the smallest failing route, component, config, or integration connected to the submitted issue",
    fixTargets: "only the smallest confirmed failing area",
    rootCause: (payload) => `Based on the submitted details, the strongest hypothesis is that the last meaningful change "${payload.last_change}" altered a focused part of the app and introduced the current failure.`,
    protectedAreas: [
      { name: "Working user flow", reason: "Preserve the last known stable behavior while you isolate the break." },
      { name: "Auth, data, and billing config", reason: "These are high-blast-radius areas unless evidence points there directly." },
      { name: "Global app configuration", reason: "Broad config changes can create multiple new problems at once." }
    ],
    confirmationTest: () => [
      "Reproduce the issue in the smallest possible flow.",
      "Compare the failing path with the last known working state.",
      "Check the last meaningful change in that area only.",
      "Retest after isolating one hypothesis at a time."
    ],
    fixOrder: () => [
      { title: "Reproduce the issue consistently", detail: "A stable reproduction path keeps the fix grounded." },
      { title: "Isolate the smallest likely failing area", detail: "Avoid broad rewrites before the cause is confirmed." },
      { title: "Apply one minimal fix", detail: "Keep the blast radius small and measurable." },
      { title: "Retest adjacent flows", detail: "Confirm the fix did not create a second regression." }
    ],
    postFixChecklist: () => [
      "Retest the original issue and one adjacent flow.",
      "Write down the real root cause once confirmed.",
      "Avoid stacking multiple speculative changes.",
      "Redeploy only after a clean regression check.",
      "Watch the affected area for the next two days."
    ],
    nextRisk: () => "If the root cause is ignored, the next break will usually happen in a nearby component, route, or integration that depends on the same underlying assumption."
  };
}

function computeConfidence(payload) {
  let score = 45;
  if (clean(payload.error_message || "")) score += 15;
  if (clean(payload.evidence_links || "")) score += 10;
  if (clean(payload.repo_link || "")) score += 10;
  if (clean(payload.preview_url || "")) score += 5;
  if (clean(payload.focus_areas || "")) score += 5;
  if (clean(payload.already_tried || "").length > 40) score += 5;
  if (clean(payload.last_change || "").length > 40) score += 5;
  return Math.max(40, Math.min(95, score));
}

function decideVerdict(payload, confidencePercent) {
  const breakType = clean(payload.break_type || "");
  const riskyText = `${payload.broken_now || ""} ${payload.error_message || ""}`.toLowerCase();
  if (/(data loss|exposed|security|charge twice|double charge|leak|breach)/.test(riskyText)) return "Needs senior developer review";
  if (confidencePercent < 60) return "Pause and collect more evidence";
  if (breakType === "App broke after update" || breakType === "One feature broke another feature") return "Rollback";
  return "Fix forward";
}

function buildNarrative(payload, profile) {
  const toolNote = buildToolNote(payload.build_tool);
  return `Here's what I found when I went through your app details. ${payload.app_name} appears to be a ${payload.app_context} used by ${payload.app_users}. The important sequence is that ${payload.working_before} was working, then ${payload.last_change} happened, and after that the app started behaving like this: ${payload.broken_now}. That pattern points most strongly to ${profile.rootCause.toLowerCase ? profile.rootCause.toLowerCase() : profile.rootCause} The issue is more likely to be concentrated in ${profile.focus} than in the whole app, which matters because broad AI rewrites would create extra regressions without proving the cause. ${toolNote} The safest interpretation is that the break is being amplified by the current environment or flow location (${payload.issue_location}), so the right move is to confirm the smallest failing area first, protect the parts that were still working, and only then apply a minimal fix. That gives you the best chance of restoring the app without causing a second wave of problems.`;
}

function buildToolNote(buildTool) {
  const tool = clean(buildTool || "Other");
  const notes = {
    Lovable: "With Lovable-built apps, this kind of break often happens when a prompt changes a focused feature but also adjusts shared UI or config assumptions nearby.",
    Bolt: "With Bolt-built apps, deploy and environment mismatches can show up quickly when a working preview flow moves into production conditions.",
    Cursor: "With Cursor-built apps, the common failure pattern is a precise code change with a wider-than-expected blast radius in shared files.",
    Replit: "With Replit-built apps, runtime and deployment assumptions can drift when the app moves between local, preview, and live execution paths.",
    "Claude Code": "With Claude Code workflows, the main risk is allowing a useful fix to spill into adjacent files or settings that were not part of the original break.",
    Windsurf: "With Windsurf-built apps, the issue is often not the first change itself but how later prompts compound around it.",
    v0: "With v0-built apps, UI and integration changes can look isolated at first but still affect shared components and downstream flows."
  };
  return notes[tool] || "With AI-built apps generally, the biggest risk is fixing the visible symptom while leaving the underlying change pattern in place.";
}

function buildConfidenceReasoning(payload, profile) {
  const evidence = [];
  if (payload.error_message) evidence.push("an exact error message");
  if (payload.evidence_links) evidence.push("linked evidence");
  if (payload.last_change) evidence.push("a clear last-change description");
  if (payload.already_tried) evidence.push("the list of attempted fixes");
  return `This confidence level is based on ${evidence.length ? evidence.join(", ") : "the submitted symptom description"} plus the way the break lines up with the reported issue type. Confidence would increase further if you also provide logs, a repo diff, or a screen recording of the exact failure path.`;
}

function buildSecondaryPossibility(payload, profile) {
  if (profile.confidencePercent >= 80) return "There is one clear root cause in this case with no plausible alternative explanation based on the current submission.";
  return `A secondary possibility is that ${payload.issue_location.toLowerCase()} is introducing a config or state mismatch that makes the main issue appear worse than it is. If the confirmation test does not validate the primary diagnosis, compare environment-specific settings and shared dependencies next.`;
}

function buildVerdictReasoning(payload, profile) {
  if (profile.verdict === "Rollback") {
    return `Rollback is the safer first move because the break is tightly connected to a recent change and the cost of preserving the regression is higher than the cost of restoring the last known stable flow. Once stability returns, the intended change can be reapplied in a narrower way.`;
  }
  if (profile.verdict === "Pause and collect more evidence") {
    return `The symptoms are real, but the current evidence is not strong enough to justify risky changes yet. Collecting one clean reproduction path, exact logs, and environment details will prevent a speculative fix from making the app less stable.`;
  }
  if (profile.verdict === "Needs senior developer review") {
    return `The reported symptoms touch areas with real business or security risk, so a narrow AI-only fix would be too optimistic. Senior review is the safer path before anything high-impact is changed.`;
  }
  return `Fix forward is the better call because the break appears localized enough to repair without discarding other good work. The right approach is a minimal targeted fix, not a rewrite or a blind rollback.`;
}

function buildNextBreakPrediction(payload, profile) {
  return `${profile.nextRisk} If that happens, the failure will feel like a new bug, but it will really be the same underlying problem surfacing in a second place. The long-term fix is to document the root cause, limit future AI prompts to the smallest target area, and keep a stable baseline before each new change.`;
}

function renderReportText(payload, report) {
  const protectedAreas = report.protectedAreas.map((item, index) => `${index + 1}. ${item.name}\n${item.reason}`).join("\n\n");
  const confirmationTest = report.confirmationTest.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const fixOrder = report.fixOrder.map((item, index) => `${index + 1}. ${item.title}\n${item.detail}`).join("\n\n");
  const prompts = report.prompts.map((item, index) => `Prompt ${index + 1}\n${item}`).join("\n\n");
  const postFix = report.postFixChecklist.map((item) => `- ${item}`).join("\n");

  return `VibeFix
Broken AI App Diagnosis Report
CONFIDENTIAL
Report Date: ${report.reportDate}
Report ID: ${report.reportId}
CLIENT
${payload.email}
APP TOOL
${payload.build_tool}
APP URL
${payload.live_app_url}
SUBMITTED
${report.submittedAt}
LAST WORKING
${report.lastWorking}
REPORT DELIVERED
${report.deliveredAt}

01  What I Found When I Looked At Your App
${report.narrative}

02  Root Cause
PRIMARY DIAGNOSIS
${report.rootCause}

CONFIDENCE LEVEL
${confidenceBar(report.confidencePercent)}  ${report.confidencePercent}% - ${report.confidenceLabel}

${report.confidenceReasoning}

SECONDARY POSSIBILITY (IF APPLICABLE)
${report.secondaryPossibility}

03  Rollback or Fix Forward?
VERDICT: ${report.verdict.toUpperCase()}
${report.verdictReasoning}

04  What Not To Touch
${protectedAreas}

05  Run This Test First (5 minutes)
CONFIRMATION TEST:
${confirmationTest}

06  Fix This In This Exact Order
${fixOrder}

07  Exact Prompts To Use
${prompts}

08  After You Fix It - Do These 5 Things
${postFix}

09  What Will Break Next If You Ignore The Root Cause
${report.nextBreakPrediction}

VibeFix  ·  Broken AI App Diagnosis
vibefix-broken-ai-app-diagnosis.atharvam144.workers.dev
This report is for the submitted app only.
Not a security audit. Not guaranteed implementation.`;
}

async function saveGeneratedReport(request, env, payload, report) {
  assertKv(env);
  const user = await getSessionUser(request, env);
  const accessToken = cryptoRandom().slice(0, 24);
  const stored = {
    id: report.model.reportId,
    accessToken,
    createdAt: new Date().toISOString(),
    payload,
    report: report.model
  };

  await env.VIBEFIX_KV.put(`report:${stored.id}`, JSON.stringify(stored));
  const reportUrl = `/report/${stored.id}?token=${accessToken}`;

  if (user?.googleId) {
    const reports = await getReports(env, user.googleId);
    reports.unshift({
      id: stored.id,
      app_name: payload.app_name,
      tool: payload.build_tool,
      break_type: payload.break_type,
      date_submitted: formatReportDate(new Date(stored.createdAt)),
      status: "Generated",
      report_url: reportUrl
    });
    await env.VIBEFIX_KV.put(`reports:${user.googleId}`, JSON.stringify(reports));

    const storedUser = await env.VIBEFIX_KV.get(`user:${user.googleId}`, "json");
    if (storedUser) {
      storedUser.diagnosis_count = Number(storedUser.diagnosis_count || 0) + 1;
      await env.VIBEFIX_KV.put(`user:${user.googleId}`, JSON.stringify(storedUser));
    }
  }

  return { ...stored, reportUrl };
}

async function renderStoredReport(request, env) {
  assertKv(env);
  const url = new URL(request.url);
  const isDownload = url.pathname.endsWith("/download");
  const reportPath = url.pathname.slice("/report/".length);
  const reportId = decodeURIComponent(isDownload ? reportPath.slice(0, -"/download".length) : reportPath).trim();
  const token = url.searchParams.get("token") || "";
  const record = await env.VIBEFIX_KV.get(`report:${reportId}`, "json");

  if (!record) return new Response("Report not found.", { status: 404 });
  if (!token || token !== record.accessToken) return new Response("Invalid report link.", { status: 403 });

  const page = renderStoredReportPage(record.payload, record.report, reportId, token);
  if (isDownload) {
    return new Response(page, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename(record.payload.app_name || "vibefix-report")}-${reportId}.html"`,
        "Cache-Control": "no-store"
      }
    });
  }

  return html(page);
}

function renderStoredReportPage(payload, report, reportId, token) {
  const downloadUrl = `/report/${encodeURIComponent(reportId)}/download?token=${encodeURIComponent(token)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(payload.app_name)} Report - VibeFix</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: #f5f1ea; color: #161616; }
    .report-shell { max-width: 960px; margin: 0 auto; padding: 40px 20px 72px; }
    .report-actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 auto 20px; max-width: 960px; padding: 0 20px; }
    .report-action { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border-radius: 999px; border: 1px solid #161616; background: #161616; color: #fffdf8; text-decoration: none; font-family: Arial, sans-serif; font-size: 0.95rem; cursor: pointer; }
    .report-action.secondary { background: transparent; color: #161616; }
    .report-paper { background: #fffdf8; border: 1px solid #d8cfc2; box-shadow: 0 18px 40px rgba(66, 43, 17, 0.08); padding: 32px 28px; }
    .topbar { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; border-top: 4px solid #161616; border-bottom: 1px solid #d8cfc2; padding: 16px 0; margin-bottom: 28px; }
    .brand { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
    .brand h1 { font-size: 2rem; margin: 0; }
    .brand p { margin: 6px 0 0; text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.76rem; }
    .meta label { display: block; font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: #6a6258; margin-bottom: 6px; }
    .meta strong { font-size: 0.95rem; }
    h2 { font-size: 1.25rem; margin: 30px 0 14px; padding-top: 18px; border-top: 1px solid #d8cfc2; }
    h3 { font-size: 0.92rem; letter-spacing: 0.08em; text-transform: uppercase; margin: 18px 0 8px; }
    p, li { line-height: 1.65; font-size: 1rem; }
    ol, ul { padding-left: 22px; margin: 8px 0 0; }
    .confidence { display: flex; align-items: center; gap: 12px; font-weight: 600; }
    .box { border: 1px solid #d8cfc2; background: #faf7f1; padding: 16px 18px; margin-top: 12px; }
    .footer { margin-top: 28px; padding-top: 18px; border-top: 1px solid #d8cfc2; font-size: 0.9rem; color: #544d45; }
    pre { white-space: pre-wrap; word-break: break-word; font-family: "Courier New", monospace; font-size: 0.93rem; }
    @media (max-width: 720px) { .topbar { grid-template-columns: 1fr 1fr; } .report-paper { padding: 24px 18px; } }
    @media print { body { background: #fff; } .report-shell { padding: 0; } .report-paper { border: 0; box-shadow: none; } .report-actions { display: none; } }
  </style>
</head>
<body>
  <div class="report-actions">
    <a class="report-action" href="${escapeAttr(downloadUrl)}" download>Download Report</a>
    <button class="report-action secondary" type="button" onclick="window.print()">Save as PDF</button>
  </div>
  <main class="report-shell">
    <article class="report-paper">
      <div class="brand">
        <div>
          <h1>VibeFix<br />Broken AI App Diagnosis Report</h1>
          <p>Confidential</p>
        </div>
        <div class="meta">
          <label>Report Date</label>
          <strong>${escapeHtml(report.reportDate)}</strong>
          <label style="margin-top:12px;">Report ID</label>
          <strong>${escapeHtml(report.reportId)}</strong>
        </div>
      </div>

      <section class="topbar">
        <div class="meta"><label>Client</label><strong>${escapeHtml(payload.email)}</strong></div>
        <div class="meta"><label>App Tool</label><strong>${escapeHtml(payload.build_tool)}</strong></div>
        <div class="meta"><label>App URL</label><strong>${escapeHtml(payload.live_app_url)}</strong></div>
        <div class="meta"><label>Submitted</label><strong>${escapeHtml(report.submittedAt)}</strong></div>
        <div class="meta"><label>Last Working</label><strong>${escapeHtml(report.lastWorking)}</strong></div>
        <div class="meta"><label>Report Delivered</label><strong>${escapeHtml(report.deliveredAt)}</strong></div>
      </section>

      <h2>01 What I Found When I Looked At Your App</h2>
      <p>${escapeHtml(report.narrative)}</p>

      <h2>02 Root Cause</h2>
      <h3>Primary Diagnosis</h3>
      <p>${escapeHtml(report.rootCause)}</p>
      <h3>Confidence Level</h3>
      <p class="confidence">${escapeHtml(confidenceBar(report.confidencePercent))} ${escapeHtml(String(report.confidencePercent))}% - ${escapeHtml(report.confidenceLabel)}</p>
      <p>${escapeHtml(report.confidenceReasoning)}</p>
      <h3>Secondary Possibility (If Applicable)</h3>
      <p>${escapeHtml(report.secondaryPossibility)}</p>

      <h2>03 Rollback or Fix Forward?</h2>
      <div class="box"><strong>Verdict: ${escapeHtml(report.verdict)}</strong><p>${escapeHtml(report.verdictReasoning)}</p></div>

      <h2>04 What Not To Touch</h2>
      <ol>
        ${report.protectedAreas.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><br />${escapeHtml(item.reason)}</li>`).join("")}
      </ol>

      <h2>05 Run This Test First (5 minutes)</h2>
      <div class="box">
        <strong>Confirmation Test</strong>
        <ol>${report.confirmationTest.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      </div>

      <h2>06 Fix This In This Exact Order</h2>
      <ol>
        ${report.fixOrder.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><br />${escapeHtml(item.detail)}</li>`).join("")}
      </ol>

      <h2>07 Exact Prompts To Use</h2>
      ${report.prompts.map((item, index) => `<div class="box"><strong>Prompt ${index + 1}</strong><pre>${escapeHtml(item)}</pre></div>`).join("")}

      <h2>08 After You Fix It - Do These 5 Things</h2>
      <ul>${report.postFixChecklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>

      <h2>09 What Will Break Next If You Ignore The Root Cause</h2>
      <p>${escapeHtml(report.nextBreakPrediction)}</p>

      <div class="footer">
        <p>VibeFix · Broken AI App Diagnosis<br />vibefix-broken-ai-app-diagnosis.atharvam144.workers.dev</p>
        <p>This report is for the submitted app only.<br />Not a security audit. Not guaranteed implementation.</p>
      </div>
    </article>
  </main>
</body>
</html>`;
}

function createReportId(date) {
  return `${REPORT_ID_PREFIX}-${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}-${cryptoRandom().slice(0, 6).toUpperCase()}`;
}

function formatReportDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatReportTimestamp(date) {
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function confidenceBar(percent) {
  const filled = Math.max(1, Math.min(10, Math.round(percent / 10)));
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
}

function safeFilename(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vibefix-report";
}

async function streamAnthropic({ env, tool, breakTypes, description, image, write }) {
  const content = [{
    type: "text",
    text: `Tool: ${tool}\nBreak type: ${breakTypes}\nWhat broke: ${description}${image ? "\nIf image: analyze this error screenshot" : ""}`
  }];

  if (image?.base64 && image?.mediaType) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.base64 }
    });
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1100,
      stream: true,
      system: `You are VibeFix, an expert at diagnosing broken AI-built apps (Lovable, Bolt, Cursor, Replit, v0, Claude Code). You give structured, specific, actionable diagnoses. Never generic. Always output exactly 3 sections: LIKELY CAUSE, WHAT NOT TO TOUCH, FIX PROMPT FOR [TOOL]. The fix prompt must be ready to paste directly into the tool. Include the user's specific error details in the prompt.`,
      messages: [{ role: "user", content }]
    })
  });

  if (!response.ok || !response.body) throw new Error("Anthropic request failed");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine || dataLine.includes("[DONE]")) continue;
      const data = JSON.parse(dataLine.slice(6));
      const text = data?.delta?.text || "";
      if (text) {
        fullText += text;
        write("token", { text });
      }
    }
  }

  return fullText;
}

function renderDashboardShell(user, active, content) {
  const isGuest = user.is_guest || user.email === "public@vibefix.local" || user.email === "guest@vibefix.local";
  const displayName = isGuest ? "Guest" : user.name;
  const displayEmail = isGuest ? `<a href="/auth/google">Sign in for full access</a>` : `<span>${escapeHtml(user.email)}</span>`;
  const avatarMarkup = isGuest
    ? `<div class="user-avatar-placeholder">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="7" r="4" fill="#7C3AED"/>
          <path d="M2 17c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#7C3AED" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>`
    : `<img src="${escapeAttr(user.avatar)}" alt="" />`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VibeFix Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body class="dashboard-body">
  <aside class="dashboard-sidebar">
    <a class="logo" href="/">Vibe<span>Fix</span></a>
    <nav class="dashboard-nav">
      ${dashLink("/", "Home", active)}
      ${dashLink("/dashboard/reports", "My Reports", active)}
      ${dashLink("/dashboard/ai", "AI Helper", active)}
      ${dashLink("/dashboard/account", "Account", active)}
    </nav>
    <div class="sidebar-user">
      ${avatarMarkup}
      <div>
        <strong>${escapeHtml(displayName)}</strong>
        ${displayEmail}
      </div>
    </div>
  </aside>
  <main class="dashboard-main">${content}</main>
  <script src="/dashboard.js"></script>
</body>
</html>`;
}

function renderReportsPage(user, reports, env) {
  const checkout = PAYMENT_URL;
  const list = reports.length ? reports.map((report) => `
    <article class="report-card">
      <div>
        <h3>${escapeHtml(report.tool || "AI-built app")}</h3>
        <p>${escapeHtml(report.date_submitted || "Date pending")}</p>
      </div>
      <span class="status-pill ${report.status === "Delivered" ? "delivered" : ""}">${escapeHtml(report.status || "Pending")}</span>
      ${report.report_url ? `<a class="btn btn-secondary" href="${escapeAttr(report.report_url)}">Open report</a>` : ""}
    </article>
  `).join("") : `
    <div class="empty-state">
      <h3>No reports yet.</h3>
      <p>Get your first diagnosis →</p>
      <a class="btn btn-primary" href="${escapeAttr(checkout)}">Get Beta Diagnosis — ₹7,530</a>
    </div>
  `;

  return renderDashboardShell(user, "/dashboard/reports", `
    <section class="dashboard-header">
      <p class="section-kicker">Dashboard</p>
      <h1>My Reports</h1>
      <p>Submitted diagnoses appear here after purchase. Report status is updated manually after delivery.</p>
    </section>
    <section class="reports-list">${list}</section>
  `);
}

function renderAccountPage(user) {
  return renderDashboardShell(user, "/dashboard/account", `
    <section class="dashboard-header">
      <p class="section-kicker">Account</p>
      <h1>Account</h1>
      <p>Your VibeFix report count.</p>
    </section>
    <section class="account-card">
      <img src="${escapeAttr(user.avatar)}" alt="" />
      <div>
        <label>Name</label>
        <strong>${escapeHtml(user.name)}</strong>
      </div>
      <div>
        <label>Email</label>
        <strong>${escapeHtml(user.email)}</strong>
      </div>
      <div>
        <label>Reports purchased</label>
        <strong>${Number(user.diagnosis_count || 0)}</strong>
      </div>
      <a class="btn btn-secondary" href="/">Back to VibeFix</a>
    </section>
  `);
}

function renderAiPage(user, env) {
  const upgradeUrl = PAYMENT_URL;
  return renderDashboardShell(user, "/dashboard/ai", `
    <section class="dashboard-header">
      <p class="section-kicker">AI Helper</p>
      <h1>AI Fix Helper</h1>
      <p>Get structured fix prompts for broken AI-built apps. You get 3 free uses total.</p>
      <p class="usage-counter" id="founders-helped">0 founders helped so far</p>
    </section>
    <section class="ai-layout">
      <form class="ai-form" id="ai-form">
        ${pillGroup("Tool selector", "tool", ["Lovable", "Bolt", "Cursor", "Replit", "v0", "Claude Code", "Other"], false)}
        ${pillGroup("Break type selector", "breakTypes", ["Auth broke", "Database not loading", "Preview vs production", "Fix-break loop", "Deploy failed", "Stripe broke", "Feature broke old feature", "Other"], true)}
        <label class="field-label" for="description">Describe what broke</label>
        <textarea id="description" name="description" rows="4" placeholder="What broke, what changed before it broke, and any error message you saw"></textarea>
        <label class="field-label">Screenshot of the error (optional)</label>
        <label class="upload-zone" id="upload-zone">
          <input id="screenshot" type="file" accept="image/png,image/jpeg,image/webp" />
          <span>Drag-and-drop or click to upload PNG, JPG, WEBP under 5MB</span>
          <img id="upload-preview" alt="" hidden />
        </label>
        <button class="btn btn-primary full-width" type="submit">Get Fix Prompts</button>
      </form>
      <aside class="output-panel" id="output-panel">
        <div class="usage-counter" id="usage-counter">3 of 3 free uses remaining</div>
        <div class="confidence-badge" id="confidence-badge">Confidence: Waiting</div>
        <div class="typing" id="typing" hidden>Generating fix prompts...</div>
        <div class="output-section">
          <h3>Likely cause</h3>
          <p id="likely-cause">Submit the form to generate a diagnosis.</p>
        </div>
        <div class="output-section">
          <h3>What not to touch</h3>
          <ul id="not-touch"><li>Waiting for your app details.</li></ul>
        </div>
        <div class="output-section">
          <h3 id="fix-title">Paste this into your tool</h3>
          <button class="copy-btn" id="copy-prompt" type="button">Copy</button>
          <pre id="fix-prompt">Your generated prompt will appear here.</pre>
        </div>
        <div class="upgrade-gate" id="upgrade-gate" hidden>
          <p>You have used all 3 free prompt generations. Get the full VibeFix diagnosis report to continue.</p>
          <a class="btn btn-primary" href="${escapeAttr(upgradeUrl)}">Get Beta Diagnosis — ₹7,530</a>
        </div>
      </aside>
    </section>
  `);
}

function pillGroup(label, name, options, multi) {
  return `<fieldset class="pill-field" data-name="${name}" data-multi="${multi}">
    <legend>${label}</legend>
    <div class="pill-row">
      ${options.map((option, index) => `<button class="select-pill ${index === 0 && !multi ? "is-selected" : ""}" type="button" data-value="${escapeAttr(option)}">${escapeHtml(option)}</button>`).join("")}
    </div>
  </fieldset>`;
}

function dashLink(href, label, active) {
  return `<a class="${active === href ? "active" : ""}" href="${href}">${label}</a>`;
}

async function getSessionUser(request, env) {
  if (!env.VIBEFIX_KV) return null;
  const sessionId = getCookie(request, COOKIE_NAME);
  if (!sessionId) return null;
  const session = await env.VIBEFIX_KV.get(`session:${sessionId}`, "json");
  if (!session?.userId) return null;
  return env.VIBEFIX_KV.get(`user:${session.userId}`, "json");
}

async function getPublicUserState(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return null;

  const freeLimit = Number(env.FREE_AI_LIMIT || 3);
  const usage = Number(await env.VIBEFIX_KV.get(`usage:${user.googleId}`) || "0");

  return {
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    diagnosis_count: user.diagnosis_count || 0,
    usage,
    freeLimit,
    remaining: Math.max(0, freeLimit - usage)
  };
}

async function requireUser(request, env, api = false) {
  const user = await getSessionUser(request, env);
  if (user) return user;
  if (api) return null;
  const url = new URL(request.url);
  return redirect(`/auth/google?next=${encodeURIComponent(url.pathname)}`);
}

async function getReports(env, userId) {
  assertKv(env);
  return await env.VIBEFIX_KV.get(`reports:${userId}`, "json") || [];
}

function fallbackDiagnosis(tool, breakTypes, description) {
  return `LIKELY CAUSE
The break is likely connected to the most recent change around ${breakTypes}. Based on your description, the safest assumption is that ${tool} changed a focused area but also affected surrounding state, configuration, or integration behavior.

WHAT NOT TO TOUCH
- Do not rewrite the whole app
- Do not change database schema or auth rules unless the error points directly there
- Do not refactor unrelated components
- Do not edit environment variables without comparing preview and production first

FIX PROMPT FOR ${tool.toUpperCase()}
Do not rewrite the app.

My ${tool} app broke with this issue:
${description}

Break type:
${breakTypes}

First diagnose the smallest likely failing area. Then explain what not to touch. Make the smallest safe fix only, and give me a regression checklist to confirm the fix worked.`;
}

function buildDiagnosisResult(tool, breakType, description, context = {}) {
  const normalizedTool = normalizePromptKey(tool);
  const normalizedBreak = normalizePromptKey(breakType);
  const toolProfile = toolProfiles[normalizedTool] || toolProfiles.other;
  const breakProfile = breakProfiles[normalizedBreak] || breakProfiles.other;
  const prompt = buildDiagnosisPrompt(tool, breakType, description, context);
  const isVague = description.trim().length < 35;
  const confidence = isVague ? "Medium" : "High";

  return `LIKELY CAUSE:
${breakProfile.likely(toolProfile.label, description)}

WHAT NOT TO TOUCH:
${[
    "Do not rewrite the whole app.",
    "Do not refactor unrelated files.",
    "Do not change UI unless the selected break type requires UI.",
    ...breakProfile.noTouch
  ].map((item) => `- ${item}`).join("\n")}

PASTE THIS INTO YOUR TOOL:
${prompt}

CONFIDENCE: ${confidence}
REASON: This prompt is generated from the selected tool, selected break type, user description, and current attempt style.`;
}

function buildDiagnosisPrompt(tool, breakType, description, context = {}) {
  const toolProfile = toolProfiles[normalizePromptKey(tool)] || toolProfiles.other;
  const breakProfile = breakProfiles[normalizePromptKey(breakType)] || breakProfiles.other;
  let style = chooseAttemptStyle(description, context.attemptCount || 1);
  if (breakProfile === breakProfiles.fixBreakLoop) style = attemptStyles.forensic;
  let prompt = composePrompt(toolProfile, breakProfile, tool, breakType, description, style);

  const recent = [context.lastGeneratedPrompt, ...(context.recentGeneratedPrompts || [])].filter(Boolean);
  if (recent.some((previous) => promptSimilarity(prompt, previous) > 0.82)) {
    style = style.id === "first" ? attemptStyles.escalation : attemptStyles.forensic;
    prompt = composePrompt(toolProfile, breakProfile, tool, breakType, description, style);
  }

  if (recent.some((previous) => promptSimilarity(prompt, previous) > 0.82)) {
    prompt = `${prompt}

Escalation note:
This is a new recovery attempt. Do not repeat the previous fix. Explain why the earlier attempt likely failed before making any change.`;
  }

  return prompt;
}

function composePrompt(toolProfile, breakProfile, tool, breakType, description, style) {
  const diagnosticSteps = [...style.diagnosticPrefix, ...toolProfile.inspect, ...breakProfile.diagnostics];
  const fixInstructions = [...style.fixPrefix, ...breakProfile.fixes, ...toolProfile.fixRules];
  const validation = [...breakProfile.validation, ...toolProfile.validation];
  const vagueNote = description.trim().length < 35
    ? "\n\nMissing evidence note:\nThe issue description is vague. Before editing, inspect logs, console errors, failing requests, recent diffs, and exact files/routes connected to this break. If evidence is missing, ask for it instead of guessing."
    : "";

  return `${toolProfile.heading}
${style.opening}

Mode: ${toolProfile.mode}
Task: ${breakProfile.task}

Context:
- User selected tool: ${tool}
- Break type: ${breakType}
- What broke: ${description}

Hard constraints:
- Do not rewrite the whole app.
- Do not refactor unrelated files.
- Do not change UI unless the selected break type requires UI.
- Make the smallest safe fix.
- Explain the likely root cause before editing.
- After fixing, give a regression checklist.

Diagnostic steps:
${numbered(diagnosticSteps)}

Fix instructions:
${numbered(fixInstructions)}

Validation:
${validation.map((item) => `- ${item}`).join("\n")}

Expected response:
- Root cause found
- Files inspected
- Files changed
- Exact fix made
- How to test
- What not to touch next${vagueNote}`;
}

const attemptStyles = {
  first: {
    id: "first",
    opening: "First-pass focused diagnosis. Diagnose the selected failure path before editing.",
    diagnosticPrefix: ["Reproduce the exact failing flow once before changing code.", "Identify the smallest area that can explain the symptom."],
    fixPrefix: ["Make one focused patch only.", "If the root cause is unclear, stop and ask for the missing log/error instead of guessing."]
  },
  escalation: {
    id: "escalation",
    opening: "Previous prompt or fix did not work. Stop patching blindly and isolate why the earlier attempt failed.",
    diagnosticPrefix: ["Summarize the previous failed assumption before editing.", "Inspect logs, recent diffs, and the exact failing request/route.", "Form one root-cause hypothesis and explain why it is more likely than the previous fix."],
    fixPrefix: ["Make one different minimal patch, not a reworded repeat of the last fix.", "Explain why this patch is different from the failed attempt."]
  },
  forensic: {
    id: "forensic",
    opening: "Forensic recovery mode. No code changes until the architecture, recent changes, environment, and failing path are inspected.",
    diagnosticPrefix: ["List the last relevant changes or diffs before the bug appeared.", "Trace the failing flow across component, API route, auth/data layer, environment, and deployment boundary.", "Create a no-code diagnosis summary first.", "If the tool supports rollback or restore points, identify the safest restore point before patching."],
    fixPrefix: ["Apply only one patch after the diagnosis summary.", "Run the narrowest regression checks after the patch.", "If confidence is low, do not edit; ask for exact logs or screenshots."]
  }
};

const toolProfiles = {
  lovable: {
    label: "Lovable",
    heading: "LOVABLE\nLovable, use Plan mode first. Diagnose before editing.",
    mode: "Plan",
    inspect: ["Use Plan mode first; do not immediately rewrite the app.", "Inspect preview behavior, browser console errors, and the last Lovable prompt/change.", "If Supabase is involved, check Supabase Auth, RLS policies, integration state, and environment variables."],
    fixRules: ["Use the smallest Lovable edit possible.", "If auth or database must be touched, state why before editing.", "Target one failing flow instead of broad app cleanup."],
    validation: ["Verify in Lovable preview.", "Confirm the exact broken flow works after the change."]
  },
  bolt: {
    label: "Bolt",
    heading: "BOLT\nBOLT: Do not rewrite the app. Diagnose first, then make the smallest safe patch.",
    mode: "Plan",
    inspect: ["Use Plan mode or Discussion mode before Build mode.", "Do not use broad Attempt Fix behavior without evidence.", "Inspect env vars, Secrets, database connection, deployment config, package/build errors, and logs when relevant."],
    fixRules: ["Make one focused Bolt patch.", "Do not regenerate unrelated screens/components.", "Explain exactly which files were changed and why."],
    validation: ["Test in Bolt preview.", "Retest the exact broken flow after the patch."]
  },
  cursor: {
    label: "Cursor",
    heading: "CURSOR\nCursor, inspect the relevant files first. Do not guess.",
    mode: "Review",
    inspect: ["Search the repo for the failing route/component/function.", "Inspect recent diffs before editing.", "Identify exact files and functions involved.", "Run tests, build, lint, or the narrowest available check if possible."],
    fixRules: ["Patch only after diagnosis.", "Keep the diff small.", "Do not edit unrelated files."],
    validation: ["Run or describe the narrowest regression test.", "Give a changed-files summary."]
  },
  replit: {
    label: "Replit",
    heading: "REPLIT\nReplit Agent, diagnose in Preview first, then fix.",
    mode: "Agent",
    inspect: ["Check Preview first; if Preview is broken, do not start with production.", "Check Replit Secrets, Console/Shell logs, run/build commands, port/host binding, and deployment settings.", "Check database state and production deployment logs when relevant."],
    fixRules: ["Make one minimal Replit-safe fix.", "Test in browser after changes.", "If a dashboard/secret setting is needed, tell me exactly what to change."],
    validation: ["Verify Preview after the fix.", "If production is involved, verify deployment behavior separately."]
  },
  v0: {
    label: "v0",
    heading: "v0\nv0, inspect the app structure and make a minimal production-safe fix.",
    mode: "Fix",
    inspect: ["Check whether the failure is in a client component, server component, route handler, server action, or environment variable.", "Check Vercel preview vs production behavior when relevant.", "Inspect Next.js/Vercel build, runtime, and deployment logs."],
    fixRules: ["Do not regenerate unrelated UI components.", "Make a production-safe patch.", "Explain required Vercel settings or env vars."],
    validation: ["Validate the affected Next.js route/component.", "Include Vercel redeploy checklist if deployment is involved."]
  },
  claudeCode: {
    label: "Claude Code",
    heading: "CLAUDE CODE\nClaude Code, think through the codebase before editing.",
    mode: "Agent",
    inspect: ["Run git status and inspect recent changes before editing.", "Use repo search to find exact failing files/functions.", "Make a plan before patching.", "Run tests/build/lint after the patch if available."],
    fixRules: ["Do not apply multiple speculative fixes.", "Keep a clear changed-files summary.", "Stop and ask for logs if evidence is missing."],
    validation: ["Run available checks.", "Explain regression risk and verification steps."]
  },
  other: {
    label: "AI coding agent",
    heading: "AI CODING AGENT\nIdentify the stack first, then diagnose before editing.",
    mode: "Diagnose",
    inspect: ["Identify the framework, hosting platform, auth/data/payment provider, and failing surface first.", "Inspect logs, console errors, recent changes, and exact failing files/routes."],
    fixRules: ["Make the smallest safe fix after diagnosis.", "Do not guess across unknown stack boundaries."],
    validation: ["Verify the broken flow.", "Provide a regression checklist."]
  }
};

toolProfiles.windsurf = toolProfiles.cursor;

const breakProfiles = {
  authBroke: {
    task: "Auth flow diagnosis and minimal auth fix",
    likely: () => "The selected break type points to auth provider configuration, callback/redirect URLs, session persistence, cookies, route guards, token refresh, or missing auth environment variables.",
    noTouch: ["Do not touch database schema unless profile creation is proven to be the auth failure.", "Do not rewrite route guards or middleware broadly."],
    diagnostics: ["Reproduce the failed signup/login/logout/session restore/protected route/callback step.", "Inspect browser console and network auth calls.", "Inspect server logs for callback, session, cookie, or token errors.", "Verify redirect/callback URLs match preview and production domains.", "Check auth provider env vars/secrets.", "If a profile row is created after signup, test that separately from auth itself."],
    fixes: ["Fix only auth-related code/config.", "Preserve existing UI.", "If env/provider dashboard changes are required, list exact variable or redirect URL."],
    validation: ["Test signup.", "Test login.", "Test logout.", "Test refresh/session restore.", "Test protected route access."]
  },
  databaseNotLoading: {
    task: "Database/data loading diagnosis and minimal data fix",
    likely: () => "The selected break type points to a failing query, wrong database URL, missing env vars, schema/migration mismatch, RLS/permissions, empty seed data, or preview/production database mismatch.",
    noTouch: ["Do not rebuild or rename the database blindly.", "Do not change auth unless the query failure is caused by missing session/user ID."],
    diagnostics: ["Identify which screen, component, API route, table, query, or view is failing.", "Check browser network response and server logs for the exact failed request.", "Check database env vars/secrets.", "Check schema, table names, column names, migrations, and seed data.", "If Supabase is used, check RLS policies and whether logged-in or anon roles can read the data.", "Check whether the app is hiding the real error behind an empty state."],
    fixes: ["Fix the exact failing query/request/config.", "Add safe error handling only after the root cause is fixed.", "Do not rename tables/columns unless code is clearly using the wrong name."],
    validation: ["Verify data loads in preview.", "Verify data loads in production if relevant.", "Confirm empty/error states still behave correctly."]
  },
  previewVsProduction: {
    task: "Preview vs production mismatch diagnosis",
    likely: () => "The selected break type points to missing production env vars, build-time/runtime differences, API base URL mismatch, domain/callback mismatch, server/client rendering differences, CORS, or deployment config.",
    noTouch: ["Do not change working preview behavior unless the same code path is proven wrong.", "Do not hardcode production URLs as a shortcut."],
    diagnostics: ["Compare Preview behavior against the production URL behavior.", "Check production logs and build/deployment logs.", "Verify every required env var exists in production scope.", "Check absolute URLs, API base URLs, redirects, auth callbacks, and CORS.", "Check if production uses different data/config than preview."],
    fixes: ["Fix only the production-specific config/code path.", "Document any dashboard setting that must be changed.", "Redeploy only after config/code is corrected."],
    validation: ["Retest Preview.", "Retest production URL.", "Confirm auth/API/data paths use the correct domain."]
  },
  fixBreakLoop: {
    task: "Fix-break loop forensic recovery",
    likely: () => "The selected break type points to repeated broad fixes, stale AI assumptions, cascading edits, and patches on top of patches without root-cause isolation.",
    noTouch: ["Do not apply another broad fix.", "Do not stack multiple speculative patches.", "Do not touch auth, database, payment, env, or deployment settings without direct evidence."],
    diagnostics: ["Stop making fixes immediately.", "Summarize the last 3 attempted fixes from chat/history/diff if available.", "Identify what changed before the bug first appeared.", "Inspect recent diffs or changed files.", "Choose one smallest root-cause hypothesis.", "If unsure, ask for exact logs instead of guessing."],
    fixes: ["Make one patch only.", "Explain why this patch is different from the failed attempts.", "Use rollback/restore guidance if the tool supports it and the recent changes are too tangled."],
    validation: ["Run the old broken flow.", "Run any flow touched by recent fixes.", "Confirm no new regression was introduced."]
  },
  deployFailed: {
    task: "Deployment failure classification and minimal deploy fix",
    likely: () => "The selected break type points to install/build/runtime failure, missing dependency, TypeScript or lint error, missing env vars/secrets, unsupported runtime, port/host config, package mismatch, or output directory config.",
    noTouch: ["Do not change UI or product behavior to fix a deploy error.", "Do not change hosting config randomly."],
    diagnostics: ["Read the exact deploy/build error first.", "Classify the failure as install, build, runtime, env, or hosting config.", "Identify the file, package, command, variable, or host setting causing it.", "Check build command, output directory, runtime, port/host, and package versions."],
    fixes: ["Fix only the failing deploy cause.", "Run local build or equivalent before final answer.", "List exact env var/hosting setting if required."],
    validation: ["Run build/typecheck/lint if available.", "Confirm the next deploy checklist."]
  },
  stripeBroke: {
    task: "Stripe/payment flow diagnosis",
    likely: () => "The selected break type points to checkout session creation, publishable/secret key mismatch, webhook secret, price ID, success/cancel URL, test/live mode mismatch, webhook event handling, or raw body signature handling.",
    noTouch: ["Never expose secret keys.", "Do not touch unrelated billing UI unless the proven failure is visual.", "Do not switch test/live mode without confirmation."],
    diagnostics: ["Classify failure as checkout creation, redirect, payment completion, webhook, or access unlock.", "Verify payment env vars/secrets.", "Verify price ID, product ID, and test/live mode.", "Verify success/cancel URLs for preview and production.", "Verify webhook endpoint, event handling, and signature/raw body handling."],
    fixes: ["Fix only the payment path that is failing.", "If dashboard settings are required, list exact Stripe/deployment settings.", "Preserve existing pricing/UI unless directly broken."],
    validation: ["Run safe test checkout.", "Verify success page.", "Verify webhook/access unlock if used."]
  },
  featureBrokeOldFeature: {
    task: "Regression diagnosis: new feature broke old feature",
    likely: () => "The selected break type points to a recent change affecting shared state, shared component, route conflict, API contract, props/interface, CSS/layout side effect, or dependency regression.",
    noTouch: ["Do not remove the new feature unless it is impossible to preserve.", "Do not refactor unrelated files.", "Do not change styling unless the regression is visual."],
    diagnostics: ["Identify the old feature that broke.", "Identify the new feature/change that preceded it.", "Inspect recent diff and files touched by the new change.", "Find shared component, state, route, API, or dependency used by both old and new feature.", "Explain the regression root cause in plain English."],
    fixes: ["Restore the old feature while preserving the new feature if possible.", "Patch the shared contract or compatibility layer only.", "Avoid rollback unless the new change is clearly wrong."],
    validation: ["Test the restored old feature.", "Test the new feature still works.", "Give a regression checklist for both flows."]
  },
  other: {
    task: "Unknown break classification and minimal fix",
    likely: () => "The selected break type is unknown, so the first job is classification: auth, database, deploy, preview/production, payment, UI, state, routing, dependency, or unknown.",
    noTouch: ["Do not guess across unknown systems.", "Do not make broad app-wide changes."],
    diagnostics: ["Classify the bug category first.", "Inspect logs/files related to that category.", "Check browser console, network tab, server logs, and recent changes.", "Identify the smallest likely root cause."],
    fixes: ["Make the smallest safe fix after classification.", "If evidence is missing, ask for the exact log/error first."],
    validation: ["Verify the classified broken flow.", "Confirm no related flow regressed."]
  }
};

function chooseAttemptStyle(description, attemptCount) {
  if (/(not working|still broken|need better prompt|same issue|again|didn'?t work|doesn'?t work|failed again|no change)/i.test(description)) {
    return attemptCount >= 3 ? attemptStyles.forensic : attemptStyles.escalation;
  }
  if (attemptCount >= 3) return attemptStyles.forensic;
  if (attemptCount === 2) return attemptStyles.escalation;
  return attemptStyles.first;
}

function numbered(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function normalizePromptKey(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aliases = {
    claude: "claudeCode",
    claudecode: "claudeCode",
    authbroke: "authBroke",
    databasenotloading: "databaseNotLoading",
    previewvsproduction: "previewVsProduction",
    fixbreakloop: "fixBreakLoop",
    deployfailed: "deployFailed",
    stripebroke: "stripeBroke",
    featurebrokeoldfeature: "featureBrokeOldFeature"
  };
  return aliases[normalized] || normalized || "other";
}

function promptSimilarity(a, b) {
  const aTokens = new Set(String(a).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 3));
  const bTokens = new Set(String(b).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 3));
  if (!aTokens.size || !bTokens.size) return 0;
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function streamGate(limit) {
  const sample = `LIKELY CAUSE
You have used all ${limit} free prompt generations.

WHAT NOT TO TOUCH
- Do not keep trying to regenerate prompts for free in this session
- Do not rewrite the app blindly
- Do not change auth, database, or environment settings without a diagnosis

FIX PROMPT FOR PAYMENT REQUIRED
Your free VibeFix AI Helper limit is finished. Use the payment option below to continue with the full diagnosis report.`;
  const stream = new ReadableStream({
    start(controller) {
      const write = (event, data) => controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      write("gate", { text: sample, remaining: 0, limit });
      controller.close();
    }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" } });
}

function chunkText(text) {
  return text.match(/.{1,80}(\s|$)/g) || [text];
}

function assertEnv(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);
}

function assertKv(env) {
  if (!env.VIBEFIX_KV) throw new Error("Missing VIBEFIX_KV binding");
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders }
  });
}

function html(content) {
  return new Response(content, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function redirect(location, headers = {}) {
  const responseHeaders = new Headers({ Location: location });
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => responseHeaders.append(key, item));
    } else {
      responseHeaders.set(key, value);
    }
  }
  return new Response(null, { status: 302, headers: responseHeaders });
}

function cookie(name, value, { maxAge }) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("=") || "")];
  }));
  return cookies[name] || "";
}

function cryptoRandom() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeNext(next) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function clean(value) {
  return String(value).slice(0, 5000).trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
