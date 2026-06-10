(function () {
  const SCANNER_TOOLS = {
    lovable: {
      label: "Lovable",
      heading: "LOVABLE — Plan mode first. Diagnose in preview before any edit.",
      mode: "Plan",
      inspect: [
        "Open Lovable preview and reproduce the exact failing user flow once.",
        "Check browser console, network tab, and the last Lovable prompt that preceded the break.",
        "If Supabase is connected, inspect Auth settings, RLS policies, and integration state separately from UI."
      ],
      fixRules: [
        "Use the smallest Lovable edit possible on one flow only.",
        "Do not rebuild pages, redesign components, or rename routes unless proven necessary.",
        "If auth or database must change, explain why before editing."
      ],
      validation: ["Verify in Lovable preview.", "Confirm the exact broken flow works and adjacent pages still load."]
    },
    bolt: {
      label: "Bolt",
      heading: "BOLT — Use Discussion/Plan mode before Build mode.",
      mode: "Plan",
      inspect: [
        "Read terminal, build, and runtime errors before touching code.",
        "Inspect Bolt Secrets, env vars, database connection, and deployment config.",
        "Check whether preview and production use different env or API base URLs."
      ],
      fixRules: [
        "Make one focused Bolt patch on the proven failing file or config.",
        "Do not regenerate unrelated screens or run broad Attempt Fix without evidence.",
        "List every file changed and why."
      ],
      validation: ["Test in Bolt preview.", "Retest the exact broken flow after the patch."]
    },
    cursor: {
      label: "Cursor",
      heading: "CURSOR — Inspect repo files and recent diffs before editing.",
      mode: "Review",
      inspect: [
        "Search the repo for the failing route, component, hook, or API handler.",
        "Inspect git diff or recent changes tied to the symptom.",
        "Run build, lint, or the narrowest test available if possible."
      ],
      fixRules: [
        "Patch only after naming the exact files and functions involved.",
        "Keep the diff small and avoid unrelated refactors.",
        "Do not edit files outside the failing path unless evidence requires it."
      ],
      validation: ["Run or describe the narrowest regression test.", "Summarize changed files."]
    },
    replit: {
      label: "Replit",
      heading: "REPLIT — Diagnose in Preview and checkpoints before production edits.",
      mode: "Agent",
      inspect: [
        "Check Preview first; if Preview is broken, do not start with production deploy.",
        "Inspect Replit Secrets, Console/Shell logs, run command, port/host binding, and deployment settings.",
        "Review checkpoint/rollback options before stacking more fixes."
      ],
      fixRules: [
        "Make one minimal Replit-safe fix.",
        "If a Secret or deploy setting is required, name the exact key and value scope.",
        "Do not overwrite working code paths."
      ],
      validation: ["Verify Preview after the fix.", "If production is involved, verify deploy separately."]
    },
    v0: {
      label: "v0",
      heading: "v0 — Inspect route/component boundaries before regenerating anything.",
      mode: "Fix",
      inspect: [
        "Identify whether the failure is client component, server component, route handler, server action, or env var.",
        "Compare Vercel preview vs production behavior if deployed.",
        "Read Next.js/Vercel build and runtime logs for the failing route."
      ],
      fixRules: [
        "Do not regenerate unrelated UI or the whole app.",
        "Patch only the affected route/component/integration.",
        "Document any required Vercel env var or redeploy step."
      ],
      validation: ["Validate the affected route/component.", "Include redeploy checklist if deployment is involved."]
    },
    claudeCode: {
      label: "Claude Code",
      heading: "CLAUDE CODE — Plan mode. Read files before implementation.",
      mode: "Plan",
      inspect: [
        "Read the files tied to the failing flow before proposing edits.",
        "Trace the symptom across component, API route, auth/data layer, and env boundary.",
        "Summarize recent changes or prompts that preceded the break."
      ],
      fixRules: [
        "Do not implement until the plan is confirmed.",
        "Apply one minimal patch after diagnosis.",
        "Keep the diff small and scoped."
      ],
      validation: ["Verify the broken flow.", "Confirm no adjacent flow regressed."]
    },
    windsurf: {
      label: "Windsurf",
      heading: "WINDSURF — Analyze context first. No sweeping edits.",
      mode: "Review",
      inspect: [
        "Inspect the failing path in context before editing.",
        "Review recent AI edits and diffs for unrelated file changes.",
        "Check env, auth, and integration boundaries tied to the symptom."
      ],
      fixRules: [
        "Change only the failing layer.",
        "Protect working flows and shared state.",
        "Avoid broad refactors."
      ],
      validation: ["Retest the exact broken flow.", "Confirm working features still behave."]
    },
    chatgpt: {
      label: "ChatGPT",
      heading: "CHATGPT — Diagnose the failing layer before suggesting code changes.",
      mode: "Diagnose",
      inspect: [
        "Ask me to paste the exact error, failing file/route, and last change if not already provided.",
        "Classify whether the break is auth, data, deploy, env, UI, routing, or integration.",
        "Identify the smallest area that can explain the symptom."
      ],
      fixRules: [
        "Give a plan before code.",
        "Suggest the smallest patch only.",
        "Tell me what not to touch."
      ],
      validation: ["Include a regression checklist customized to this break type."]
    },
    gemini: {
      label: "Gemini",
      heading: "GEMINI — Diagnose the failing layer before suggesting code changes.",
      mode: "Diagnose",
      inspect: [
        "Use the exact error, symptom, and last change to classify the break layer.",
        "Separate UI symptoms from auth, database, env, and deploy causes.",
        "List missing evidence before guessing."
      ],
      fixRules: [
        "Propose one minimal fix path only.",
        "Do not suggest rebuilding the app.",
        "Preserve no-touch zones unless evidence proves otherwise."
      ],
      validation: ["Include a regression checklist customized to this break type."]
    },
    deepseek: {
      label: "DeepSeek",
      heading: "DEEPSEEK — Diagnose the failing layer before suggesting code changes.",
      mode: "Diagnose",
      inspect: [
        "Analyze the symptom, error, and last change to isolate the failing layer.",
        "Check for preview vs production, env, auth, and data mismatches.",
        "State assumptions clearly if evidence is missing."
      ],
      fixRules: [
        "Recommend the smallest safe fix only.",
        "Do not refactor unrelated code.",
        "Respect no-touch zones."
      ],
      validation: ["Include a regression checklist customized to this break type."]
    },
    other: {
      label: "AI builder",
      heading: "AI BUILDER — Diagnose before editing.",
      mode: "Diagnose",
      inspect: [
        "Reproduce the failing flow once.",
        "Inspect logs, console errors, and the last prompt/change.",
        "Classify the break layer before editing."
      ],
      fixRules: [
        "Make the smallest safe change.",
        "Do not rewrite the app.",
        "Preserve working features."
      ],
      validation: ["Verify the broken flow after the fix."]
    }
  };

  const SCANNER_BREAKS = {
    auth: {
      label: "auth/login/signup",
      task: "Auth flow diagnosis and minimal auth fix",
      diagnostics: [
        "Reproduce the failed signup, login, logout, session restore, or protected-route step.",
        "Inspect browser console and network calls for auth requests and responses.",
        "Verify redirect/callback URLs match preview and production domains.",
        "Check auth provider env vars, session/cookie handling, and route guards."
      ],
      fixes: [
        "Fix only auth-related code or config.",
        "Do not rewrite the whole auth system or database schema unless profile creation is proven to be the failure.",
        "If provider dashboard changes are required, list exact redirect URLs or env vars."
      ],
      validation: ["signup", "login", "logout", "session persistence", "protected route access"]
    },
    database: {
      label: "database/data not loading",
      task: "Database/data loading diagnosis and minimal data fix",
      diagnostics: [
        "Identify which screen, query, table, or API route fails to load data.",
        "Check network response and server logs for the exact failed request.",
        "Verify database URL, schema/table/column names, and migrations.",
        "If Supabase is used, inspect RLS policies and whether the current user role can read the data."
      ],
      fixes: [
        "Fix the exact failing query, request, or config.",
        "Do not rename tables/columns or rebuild the database unless code clearly uses the wrong name.",
        "Add error handling only after the root cause is identified."
      ],
      validation: ["data loads in preview", "data loads in production if relevant", "empty/error states behave correctly"]
    },
    deployment: {
      label: "deployment",
      task: "Deployment failure classification and minimal deploy fix",
      diagnostics: [
        "Read the exact deploy/build error first.",
        "Classify as install, build, runtime, env, or hosting config failure.",
        "Check build command, output directory, runtime, port/host, and package versions."
      ],
      fixes: [
        "Fix only the failing deploy cause.",
        "Do not change product behavior or UI to mask a deploy error.",
        "List exact env var or hosting setting if required."
      ],
      validation: ["build passes", "deploy succeeds", "app loads after deploy"]
    },
    previewProduction: {
      label: "preview works but production broken",
      task: "Preview vs production mismatch diagnosis",
      diagnostics: [
        "Compare preview behavior against the production URL for the same flow.",
        "Check production build/deploy logs and browser console on production.",
        "Verify every required env var exists in production scope.",
        "Check API base URLs, redirects, auth callbacks, and CORS on production."
      ],
      fixes: [
        "Fix only the production-specific config or code path.",
        "Do not hardcode production URLs as a shortcut.",
        "Document dashboard/hosting settings that must change."
      ],
      validation: ["preview still works", "production flow works", "auth/API/data use correct domain"]
    },
    ui: {
      label: "UI/layout",
      task: "UI/layout regression diagnosis",
      diagnostics: [
        "Identify which component, page, or layout broke and what changed before it.",
        "Compare last working UI state with the current broken render.",
        "Check whether CSS, props, shared component, or routing caused the visual break."
      ],
      fixes: [
        "Patch only the affected component/layout.",
        "Do not change backend, auth, database, or payment systems unless proven related.",
        "Avoid redesigning unrelated screens."
      ],
      validation: ["broken component renders", "previous working page still works", "mobile and desktop layouts"]
    },
    payment: {
      label: "payment/checkout",
      task: "Payment/checkout flow diagnosis",
      diagnostics: [
        "Classify failure as checkout creation, redirect, completion, webhook, or access unlock.",
        "Verify payment env vars, price/product IDs, and test/live mode.",
        "Check success/cancel URLs for preview and production.",
        "Verify webhook endpoint, signature handling, and event processing."
      ],
      fixes: [
        "Fix only the payment path that is failing.",
        "Never expose secret keys.",
        "Do not touch unrelated billing UI unless directly broken."
      ],
      validation: ["test checkout", "success page", "webhook/access unlock if used"]
    },
    envConfig: {
      label: "env/config",
      task: "Environment/config mismatch diagnosis",
      diagnostics: [
        "List env vars required by the failing flow and compare preview vs production.",
        "Check for missing Secrets, wrong API base URL, or build-time vs runtime env usage.",
        "Inspect deploy/hosting dashboard for config drift."
      ],
      fixes: [
        "Fix only the missing or incorrect config path.",
        "Document exact variable names and where they must be set.",
        "Do not change application logic until config parity is verified."
      ],
      validation: ["env vars match across environments", "failing flow works after config fix"]
    },
    routing: {
      label: "routing",
      task: "Routing/navigation diagnosis",
      diagnostics: [
        "Identify the broken route, redirect, or navigation path.",
        "Check route definitions, guards, dynamic segments, and 404 fallbacks.",
        "Verify auth guards or middleware are not blocking the route incorrectly."
      ],
      fixes: [
        "Fix only the affected route/guard/redirect.",
        "Do not restructure the whole router unless proven necessary.",
        "Preserve existing working routes."
      ],
      validation: ["broken route loads", "navigation from related pages", "direct URL access"]
    },
    api: {
      label: "API integration",
      task: "API integration diagnosis",
      diagnostics: [
        "Identify the failing endpoint, request payload, and response/error.",
        "Check auth headers, base URL, CORS, and env vars for the integration.",
        "Verify whether preview and production call different API hosts."
      ],
      fixes: [
        "Fix only the failing integration path.",
        "Do not rewrite unrelated API clients.",
        "Add logging only if needed to confirm the fix."
      ],
      validation: ["endpoint returns expected response", "error handling works", "dependent UI loads"]
    },
    fileUpload: {
      label: "file upload",
      task: "File upload/storage diagnosis",
      diagnostics: [
        "Reproduce the upload failure and capture the exact error.",
        "Check storage bucket permissions, size limits, MIME rules, and auth context.",
        "Verify signed URL or upload route configuration."
      ],
      fixes: [
        "Fix only upload/storage config or handler code.",
        "Do not change unrelated storage policies.",
        "Document any bucket/policy change required."
      ],
      validation: ["test file upload", "file appears in storage", "downstream use of file works"]
    },
    email: {
      label: "email",
      task: "Email delivery/integration diagnosis",
      diagnostics: [
        "Identify whether failure is send, template render, provider auth, or webhook.",
        "Check email provider API keys, domain verification, and env vars.",
        "Inspect server logs for the failed send attempt."
      ],
      fixes: [
        "Fix only the email integration path.",
        "Do not change unrelated notification flows.",
        "List exact provider setting if dashboard change is required."
      ],
      validation: ["test email sends", "template renders", "error path handled"]
    },
    dashboard: {
      label: "dashboard data",
      task: "Dashboard data loading diagnosis",
      diagnostics: [
        "Identify which widget, table, or query fails on the dashboard.",
        "Check whether auth context, RLS, or API route causes empty data.",
        "Compare last working dashboard state with current queries."
      ],
      fixes: [
        "Fix only the failing dashboard query/component.",
        "Do not rewrite the whole dashboard.",
        "Preserve unrelated widgets."
      ],
      validation: ["dashboard loads", "affected widget shows data", "other widgets still work"]
    },
    permissions: {
      label: "permissions",
      task: "Permissions/roles diagnosis",
      diagnostics: [
        "Identify which role or user type fails and what action is blocked.",
        "Inspect RLS, route guards, role checks, and admin permissions.",
        "Verify user context is available where permission checks run."
      ],
      fixes: [
        "Fix only the permission rule or guard implicated.",
        "Do not broaden access without explaining the risk.",
        "Do not rewrite the whole auth model."
      ],
      validation: ["affected role works", "other roles still restricted correctly", "admin paths safe"]
    },
    aiOveredit: {
      label: "AI changed unrelated files",
      task: "Unrelated-file change containment",
      diagnostics: [
        "List files changed in the last AI edit versus files tied to the symptom.",
        "Identify which unrelated changes are highest risk.",
        "Determine whether rollback of specific files is safer than another broad fix."
      ],
      fixes: [
        "Revert or isolate unrelated edits first if safe.",
        "Then patch only the proven failing layer.",
        "Do not allow another broad rewrite."
      ],
      validation: ["symptom flow", "previously working flows", "no new unrelated diffs"]
    },
    fixBreakLoop: {
      label: "fix-break loop",
      task: "Fix-break loop forensic recovery",
      diagnostics: [
        "Stop making fixes immediately.",
        "Summarize the last attempted fixes and why each likely failed.",
        "Inspect recent diffs and form one smallest root-cause hypothesis.",
        "If rollback/checkpoint exists, identify the safest restore point."
      ],
      fixes: [
        "Make one patch only after the forensic summary.",
        "Explain why this patch differs from failed attempts.",
        "Do not stack speculative fixes."
      ],
      validation: ["original broken flow", "flows touched by recent fixes", "no new regression"]
    },
    blankScreen: {
      label: "blank screen",
      task: "Blank screen / runtime crash diagnosis",
      diagnostics: [
        "Open browser console and identify the first runtime error.",
        "Check whether routing, auth guard, data fetch, or env causes a crash before render.",
        "Inspect recent component or layout changes tied to the route."
      ],
      fixes: [
        "Fix the first crash/error blocking render.",
        "Do not redesign the page unless the crash is UI-specific.",
        "Keep the patch minimal."
      ],
      validation: ["page renders", "console is clean for the route", "navigation works"]
    },
    other: {
      label: "other/unknown",
      task: "Break classification and minimal fix",
      diagnostics: [
        "Classify the bug as auth, database, deploy, env, payment, UI, routing, API, or unknown.",
        "Inspect logs and recent changes for that category.",
        "Identify the smallest likely root cause."
      ],
      fixes: [
        "Make the smallest safe fix after classification.",
        "If evidence is missing, ask for exact logs/errors instead of guessing."
      ],
      validation: ["classified broken flow works", "no related flow regressed"]
    }
  };

  function normalizeScannerTool(builder) {
    const key = String(builder || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const aliases = {
      lovable: "lovable",
      bolt: "bolt",
      cursor: "cursor",
      replit: "replit",
      v0: "v0",
      claudecode: "claudeCode",
      windsurf: "windsurf",
      chatgpt: "chatgpt",
      gemini: "gemini",
      deepseek: "deepseek"
    };
    return aliases[key] || "other";
  }

  function normalizeScannerBreak(breakType) {
    const value = String(breakType || "").toLowerCase();
    if (/auth|login|signup/.test(value)) return "auth";
    if (/database|data not loading/.test(value)) return "database";
    if (/^deployment$|deploy/.test(value) && !/preview/.test(value)) return "deployment";
    if (/preview/.test(value) && /production/.test(value)) return "previewProduction";
    if (/ui|layout/.test(value)) return "ui";
    if (/payment|checkout/.test(value)) return "payment";
    if (/env|config/.test(value)) return "envConfig";
    if (/routing/.test(value)) return "routing";
    if (/api integration/.test(value)) return "api";
    if (/file upload/.test(value)) return "fileUpload";
    if (/^email$|email/.test(value)) return "email";
    if (/dashboard/.test(value)) return "dashboard";
    if (/permissions/.test(value)) return "permissions";
    if (/unrelated files/.test(value)) return "aiOveredit";
    if (/fix-break/.test(value)) return "fixBreakLoop";
    if (/blank/.test(value)) return "blankScreen";
    return "other";
  }

  function numbered(items) {
    return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
  }

  function field(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function buildUniqueScannerPrompt(payload, result, toolOverride) {
    const toolKey = normalizeScannerTool(toolOverride || payload.builder);
    const breakKey = normalizeScannerBreak(payload.break_type);
    const tool = SCANNER_TOOLS[toolKey] || SCANNER_TOOLS.other;
    const breakProfile = SCANNER_BREAKS[breakKey] || SCANNER_BREAKS.other;
    const noTouchZones = Array.isArray(result?.noTouchZones) ? result.noTouchZones : [];
    const layer = result?.layer || "unknown";

    const symptom = field(payload.current_broken_behavior, "[describe current broken behavior]");
    const working = field(payload.last_working_state, "[describe last working state]");
    const lastChange = field(payload.last_prompt, "[paste last prompt or change]");
    const error = field(payload.error_message, "[paste exact error if available]");
    const issueLocation = field(payload.issue_location, "not sure");
    const timing = field(payload.break_timing, "not sure");
    const attempts = field(payload.fix_attempts, "0");
    const rollbackNote = result?.rollbackDirection || "Follow the rollback vs fix-forward guidance in the case file.";

    const loopNote = result?.loopDetected
      ? "\nLoop warning:\nThis case looks like a fix-break loop. Do not apply another broad fix. Forensic diagnosis first.\n"
      : "";

    const evidenceNote = (result?.confidence || "").toLowerCase() === "low"
      ? "\nMissing evidence note:\nConfidence is low. Before editing, collect exact errors, logs, screenshots, and the last prompt. If evidence is missing, ask for it instead of guessing.\n"
      : "";

    return `${tool.heading}

Task: ${breakProfile.task}
Mode: ${tool.mode}
Builder: ${tool.label}
Break type: ${breakProfile.label}

Case context:
- Current symptom: ${symptom}
- Last working state: ${working}
- Last prompt/change: ${lastChange}
- Exact error/log: ${error}
- Where it happens: ${issueLocation}
- When it broke: ${timing}
- Repair attempts so far: ${attempts}
- Likely break layer: ${layer}
- Prompt-again risk: ${result?.promptRisk || "unknown"}
- No-touch zones: ${noTouchZones.join(", ") || "working flows, auth, database, payments, env, deployment settings"}

Rollback vs fix-forward:
${rollbackNote}
${loopNote}
Hard constraints:
- Do not rewrite the whole app.
- Do not refactor unrelated files.
- Do not touch no-touch zones unless evidence proves they are the failing layer.
- Explain the likely root cause before editing.
- Make the smallest safe fix only.

${tool.label} inspect steps:
${numbered(tool.inspect)}

Break-specific diagnostics:
${numbered(breakProfile.diagnostics)}

Fix instructions:
${numbered([...breakProfile.fixes, ...tool.fixRules])}

Validation checklist:
${[...breakProfile.validation, ...tool.validation].map((item) => `- ${item}`).join("\n")}

Expected response:
- Root cause hypothesis
- Files/settings inspected
- Smallest safe fix
- What not to touch next
- Regression checklist${evidenceNote}`;
  }

  window.buildUniqueScannerPrompt = buildUniqueScannerPrompt;
  window.normalizeScannerTool = normalizeScannerTool;
  window.normalizeScannerBreak = normalizeScannerBreak;
})();
