const COOKIE_NAME = "vf_session";
const STATE_COOKIE = "vf_oauth_state";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const STATIC_ASSET_ORIGIN = "https://raw.githubusercontent.com/Atharva316/vibefix-broken-ai-app-diagnosis/main/public";
const PAYMENT_URL = "https://rzp.io/rzp/bM3R4oPl";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/auth/google") return startGoogleAuth(request, env);
      if (url.pathname === "/auth/google/callback") return finishGoogleAuth(request, env);
      if (url.pathname === "/auth/signout") return signOut(request, env);
      if (url.pathname === "/api/me") return json(await getPublicUserState(request, env));
      if (url.pathname === "/api/ai" && request.method === "POST") return handleAi(request, env);
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
  if (path.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

async function startGoogleAuth(request, env) {
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
        write("done", { text: fullText, remaining: Math.max(0, freeLimit - usage - 1), limit: freeLimit });
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
      <img src="${escapeAttr(user.avatar)}" alt="" />
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <span>${escapeHtml(user.email)}</span>
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
      <p>Your Google account and VibeFix report count.</p>
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
      <a class="btn btn-secondary" href="/auth/signout">Sign out</a>
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
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
