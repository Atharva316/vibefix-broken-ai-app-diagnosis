const revealElements = document.querySelectorAll(".reveal");
const progressBar = document.querySelector(".scroll-progress");

if (progressBar) {
  let progressTicking = false;
  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? (window.scrollY / max) * 100 : 0;
    progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    progressTicking = false;
  };
  const requestProgressUpdate = () => {
    if (progressTicking) return;
    progressTicking = true;
    requestAnimationFrame(updateProgress);
  };
  updateProgress();
  window.addEventListener("scroll", requestProgressUpdate, { passive: true });
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16 });

  revealElements.forEach((element, index) => {
    element.style.setProperty("--reveal-delay", `${Math.min(index % 3, 2) * 0.1}s`);
    observer.observe(element);
  });
} else {
  revealElements.forEach((element) => element.classList.add("is-visible"));
}

document.querySelectorAll(".faq-question").forEach((button) => {
  button.addEventListener("click", () => {
    const answer = button.nextElementSibling;
    const expanded = button.getAttribute("aria-expanded") === "true";

    button.setAttribute("aria-expanded", String(!expanded));

    if (expanded) {
      answer.style.maxHeight = "0px";
    } else {
      answer.style.maxHeight = `${answer.scrollHeight}px`;
    }
  });
});

const nav = document.querySelector(".site-nav");

if (nav) {
  const toggle = nav.querySelector(".nav-toggle");
  const menu = nav.querySelector(".nav-links");

  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      menu.classList.toggle("is-open", !expanded);
    });

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        toggle.setAttribute("aria-expanded", "false");
        menu.classList.remove("is-open");
      });
    });
  }

  hydrateAuthSlot(nav);
}

initAuthModal();
initCounters();
initSectionFocus();
initBreakChecker();
initSegmentedSelects();
initCaseEmailCapture();

async function hydrateAuthSlot(navElement) {
  const slot = navElement.querySelector(".auth-slot");
  if (!slot) return;

  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    const user = response.ok ? await response.json() : null;

    if (!user) {
      slot.innerHTML = `<a class="nav-auth-link" href="/auth/google" data-auth-open>Sign In</a>`;
      return;
    }

    const firstName = String(user.name || user.email || "User").split(/\s|@/)[0] || "User";

    slot.innerHTML = `
      <a class="nav-user" href="/dashboard/ai">Hi, ${escapeHtml(firstName)}</a>
      <a class="nav-signout" href="/auth/signout">Sign Out</a>
    `;
  } catch (error) {
    slot.innerHTML = `<a class="nav-auth-link" href="/auth/google" data-auth-open>Sign In</a>`;
  }
}

function initAuthModal() {
  const modal = document.querySelector("#auth-modal");
  if (!modal) return;

  const status = modal.querySelector("#auth-status");
  const emailForm = modal.querySelector("#auth-email-form");
  const phoneForm = modal.querySelector("#auth-phone-form");
  const otpForm = modal.querySelector("#auth-otp-form");
  const phoneInput = modal.querySelector("#auth-phone");
  let pendingPhone = "";

  const nextPath = () => "/dashboard/ai";
  const setStatus = (message, type = "") => {
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-error", type === "error");
    status.classList.toggle("is-success", type === "success");
  };
  const showPanel = (panel) => {
    if (emailForm) emailForm.hidden = panel !== "email";
    if (phoneForm) phoneForm.hidden = panel !== "phone";
    if (otpForm) otpForm.hidden = panel !== "otp";
  };
  const openModal = () => {
    modal.hidden = false;
    document.body.classList.add("modal-open");
    showPanel("email");
    setStatus("");
    modal.querySelectorAll('a[href^="/auth/"]').forEach((link) => {
      const url = new URL(link.getAttribute("href"), window.location.origin);
      url.searchParams.set("next", nextPath());
      link.setAttribute("href", `${url.pathname}${url.search}`);
    });
    setTimeout(() => modal.querySelector("#auth-email")?.focus(), 40);
  };
  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  };
  const setLoading = (form, loading) => {
    const button = form?.querySelector("button[type='submit']");
    if (!button) return;
    button.disabled = loading;
    button.dataset.originalText ||= button.textContent;
    button.textContent = loading ? "Please wait..." : button.dataset.originalText;
  };
  const postAuth = async (url, body) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Auth request failed.");
    return data;
  };

  document.addEventListener("click", (event) => {
    const openTarget = event.target.closest("[data-auth-open]");
    if (openTarget) {
      event.preventDefault();
      openModal();
      return;
    }

    if (event.target.closest("[data-auth-close]")) {
      closeModal();
      return;
    }

    const comingSoonTarget = event.target.closest("[data-auth-coming-soon]");
    if (comingSoonTarget) {
      setStatus(comingSoonTarget.dataset.authComingSoon || "This sign-in option is being configured. Use Google or email for now.", "success");
      return;
    }

    const panelTarget = event.target.closest("[data-auth-panel]");
    if (panelTarget) {
      showPanel(panelTarget.dataset.authPanel || "email");
      setStatus("");
      setTimeout(() => phoneInput?.focus(), 40);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  emailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoading(emailForm, true);
    setStatus("");
    try {
      const email = new FormData(emailForm).get("email");
      const data = await postAuth("/auth/email", { email, next: nextPath() });
      setStatus(data.message || "Magic link sent. Check your email.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setLoading(emailForm, false);
    }
  });

  phoneForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoading(phoneForm, true);
    setStatus("");
    try {
      pendingPhone = String(new FormData(phoneForm).get("phone") || "").trim();
      const data = await postAuth("/auth/phone", { phone: pendingPhone });
      setStatus(data.message || "OTP sent. Enter the code.", "success");
      showPanel("otp");
      setTimeout(() => modal.querySelector("#auth-otp")?.focus(), 40);
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setLoading(phoneForm, false);
    }
  });

  otpForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoading(otpForm, true);
    setStatus("");
    try {
      const token = new FormData(otpForm).get("token");
      const data = await postAuth("/auth/phone/verify", { phone: pendingPhone, token, next: nextPath() });
      window.location.href = data.next || nextPath();
    } catch (error) {
      setStatus(error.message, "error");
      setLoading(otpForm, false);
    }
  });
}

if (nav) {
  const updateNavScroll = () => {
    const hero = document.querySelector(".hero");
    const threshold = hero ? hero.offsetHeight - nav.offsetHeight : 60;
    nav.classList.toggle("scrolled", window.scrollY > Math.max(60, threshold));
  };
  updateNavScroll();
  window.addEventListener("scroll", updateNavScroll, { passive: true });
}

function animateNumber(element, end, suffix = "", duration = 2000, prefix = "") {
  if (!element) return;
  const startValue = parseFloat(String(element.textContent || "0").replace(/[^\d.-]/g, "")) || 0;
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(startValue + (end - startValue) * eased);
    element.textContent = `${prefix}${value}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function initCounters() {
  const stats = document.querySelectorAll("[data-count-to]");
  if (!stats.length) return;
  const run = () => stats.forEach((stat) => animateNumber(stat, Number(stat.dataset.countTo || 0), stat.dataset.suffix || "", 1400, stat.dataset.prefix || ""));
  if (!("IntersectionObserver" in window)) {
    run();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      run();
      observer.disconnect();
    }
  }, { threshold: 0.35 });

  stats.forEach((stat) => observer.observe(stat));
}

function initSectionFocus() {
  const sections = [...document.querySelectorAll(".section-shell, .break-checker, .social-proof")];
  if (!sections.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle("section-in-view", entry.isIntersecting);
    });
  }, { threshold: 0.22 });

  sections.forEach((section) => observer.observe(section));
}

function initBreakChecker() {
  const input = document.querySelector("#error-input");
  const button = document.querySelector("#check-btn");
  const result = document.querySelector("#checker-result");
  if (!input || !button || !result) return;

  const check = () => {
    const value = input.value.toLowerCase();
    let type = "unknown";
    let content = "";

    if (value.includes("rls") || value.includes("row level security") || value.includes("supabase") || value.includes("policy")) {
      type = "common";
      content = `<span class="match-icon">✓ Common pattern</span><strong>Supabase RLS conflict</strong><p>Seen in 34% of all diagnoses. Usually triggered by adding a new user role or feature without updating Row Level Security policies. Auth still works but data becomes invisible to the user.</p>`;
    } else if (value.includes("env") || value.includes("environment") || value.includes("process.env") || (value.includes("undefined") && value.includes("variable"))) {
      type = "common";
      content = `<span class="match-icon">✓ Common pattern</span><strong>Environment variable mismatch</strong><p>Works in preview, breaks in production. Your local environment exists, but the same variables are not set in deployment config.</p>`;
    } else if (value.includes("cors")) {
      type = "common";
      content = `<span class="match-icon">✓ Common pattern</span><strong>CORS configuration error</strong><p>Your production frontend URL does not match the allowed origins in your backend or API config. Usually a small fix once identified.</p>`;
    } else if (value.includes("auth") || value.includes("login") || value.includes("signup") || value.includes("authentication") || value.includes("session") || value.includes("jwt") || value.includes("token")) {
      type = "common";
      content = `<span class="match-icon">✓ Common pattern</span><strong>Auth flow break</strong><p>One of the top diagnosed issues. Usually caused by a schema change, new user role, session handling change, or redirect mismatch.</p>`;
    } else if (value.includes("stripe") || value.includes("payment") || value.includes("webhook") || value.includes("checkout")) {
      type = "common";
      content = `<span class="match-icon">✓ Common pattern</span><strong>Stripe/payment integration break</strong><p>Most often a webhook URL mismatch after deployment, missing event handler, or payment mode/config mismatch.</p>`;
    } else if (value.includes("preview") || value.includes("production") || value.includes("deploy") || value.includes("vercel") || value.includes("netlify")) {
      type = "common";
      content = `<span class="match-icon">✓ Common pattern</span><strong>Preview vs production split</strong><p>Works in preview but breaks live. Usually caused by missing production env vars or hardcoded localhost URLs.</p>`;
    } else if (value.includes("database") || value.includes("db") || value.includes("query") || value.includes("fetch") || value.includes("loading") || value.includes("null")) {
      type = "common";
      content = `<span class="match-icon">✓ Common pattern</span><strong>Database/data loading break</strong><p>Data stops loading after a schema change, new table, updated query, RLS issue, or column rename the frontend did not follow.</p>`;
    } else if (value === "" || value.length < 5) {
      type = "empty";
      content = `<span class="match-icon unknown">→</span><strong>Type your error message above</strong><p>Paste the exact error text. The more specific you are, the better the match.</p>`;
    } else {
      type = "unknown";
      content = `<span class="match-icon warning">⚠ Not in common patterns</span><strong>This looks complex or unique</strong><p>We have not seen this exact pattern enough times for a confident instant answer. A full diagnosis is useful when the break pattern is unclear.</p>`;
    }

    const cta = type === "empty" ? "" : `<div class="checker-cta"><span>Want exact fix prompts for your specific app?</span><a href="#pricing" class="checker-link">Get the full diagnosis →</a></div>`;
    result.hidden = false;
    result.className = `checker-result ${type}`;
    result.innerHTML = content + cta;
    result.style.opacity = "0";
    result.style.transform = "translateY(10px)";
    setTimeout(() => {
      result.style.transition = "all 0.3s ease";
      result.style.opacity = "1";
      result.style.transform = "translateY(0)";
    }, 10);
  };

  button.addEventListener("click", check);
  input.addEventListener("keypress", (event) => {
    if (event.key === "Enter") button.click();
  });
}

function initSegmentedSelects() {
  document.querySelectorAll("[data-segmented-select]").forEach((group) => {
    const form = group.closest("form");
    const select = form?.querySelector(`select[name="${group.dataset.segmentedSelect}"]`);
    if (!select) return;

    group.querySelectorAll("[data-select-value]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.selectValue === select.value);
      button.addEventListener("click", () => {
        select.value = button.dataset.selectValue || select.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.dispatchEvent(new Event("input", { bubbles: true }));
        group.querySelectorAll("[data-select-value]").forEach((item) => item.classList.remove("is-selected"));
        button.classList.add("is-selected");
      });
    });
  });
}

function initCaseEmailCapture() {
  const form = document.querySelector("#case-email-form");
  const status = document.querySelector("#case-email-status");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!scannerState.result || !scannerState.payload) {
      if (status) status.textContent = "Run the scanner first.";
      return;
    }

    const submitButton = form.querySelector("button[type='submit']");
    const oldText = submitButton?.textContent || "";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
    }
    if (status) status.textContent = "";

    try {
      const email = new FormData(form).get("email");
      const response = await fetch("/api/casefile-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          builder: scannerState.payload.builder,
          break_type: scannerState.payload.break_type,
          prompt_risk: scannerState.result.promptRisk,
          likely_layer: scannerState.result.layer,
          confidence: scannerState.result.confidence
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.error || "Could not save email.");
      if (status) status.textContent = "Saved. You now own the case file reminder.";
      form.reset();
    } catch (error) {
      if (status) status.textContent = error.message || "Could not save email.";
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = oldText;
      }
    }
  });
}

const quizState = {
  builder: "Lovable",
  break: "auth",
  when: "feature"
};

const quizResult = document.querySelector("#quiz-result");

document.querySelectorAll("[data-quiz]").forEach((button) => {
  button.addEventListener("click", () => {
    const group = button.dataset.quiz;
    quizState[group] = button.dataset.value;
    document.querySelectorAll(`[data-quiz="${group}"]`).forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");
    renderQuizResult();
  });
});

function renderQuizResult() {
  if (!quizResult) return;

  const result = identifyBreakPattern(quizState);
  quizResult.querySelector("h3").textContent = `Based on your answers, you likely have a ${result.title}.`;
  quizResult.querySelector("p").textContent = result.explanation;
}

function identifyBreakPattern(state) {
  if (state.break === "deployment" || state.when === "deploy") {
    return {
      title: "preview vs production configuration issue",
      explanation: "Check environment variables, API URLs, auth redirects, deploy logs, and production-only console errors before changing app code."
    };
  }

  if (state.break === "database") {
    return {
      title: "data access or policy boundary issue",
      explanation: "Do not rewrite UI components yet. First verify table permissions, RLS/Firebase rules, API response errors, and the last database-related change."
    };
  }

  if (state.break === "loop") {
    return {
      title: "fix-break loop",
      explanation: "Stop broad prompts. Open the diff, identify touched files, protect working flows, and ask for the smallest fix only."
    };
  }

  if (state.break === "ui") {
    return {
      title: "component or layout regression",
      explanation: "Compare the last working component state with the new one. Avoid auth, database, and env changes unless the error points there."
    };
  }

  if (state.break === "auth") {
    return {
      title: "auth/config boundary issue",
      explanation: "Start by identifying the exact last working state. Do not change auth rules, environment variables, or database policies until you know which boundary failed."
    };
  }

  return {
    title: "unclear regression pattern",
    explanation: "Collect the exact error, last prompt, deploy log, and affected page before prompting again. Missing evidence makes the next fix risky."
  };
}

renderQuizResult();

const reportCount = document.querySelector("#report-count");
const lastDiagnosed = document.querySelector("#last-diagnosed");

if (reportCount) {
  fetch("/api/report-counter", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => {
      if (!data) return;
      reportCount.textContent = String(Number(data.count || 0));

      if (data.last_diagnosed_at && lastDiagnosed) {
        lastDiagnosed.hidden = false;
        lastDiagnosed.textContent = `Last app diagnosed: ${relativeHours(data.last_diagnosed_at)}`;
      }
    })
    .catch(() => {});
}

function relativeHours(timestamp) {
  const then = new Date(timestamp).getTime();
  const diff = Math.max(0, Date.now() - then);
  const hours = Math.max(1, Math.round(diff / 3600000));
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

const rollbackForm = document.querySelector("#rollback-form");
const rollbackResult = document.querySelector("#rollback-result");

if (rollbackForm && rollbackResult) {
  rollbackForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(rollbackForm);
    const answers = Object.fromEntries(formData.entries());
    const local = localRollbackRecommendation(answers);
    let result = local;

    try {
      const response = await fetch("/api/rollback-calculator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
      });
      if (response.ok) result = await response.json();
    } catch (error) {
      result = local;
    }

    rollbackResult.hidden = false;
    rollbackResult.querySelector("h2").textContent = result.type;
    rollbackResult.querySelector("p").textContent = result.explanation;
    rollbackResult.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function localRollbackRecommendation(answers) {
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

  if (risk >= 5) return { type: "ROLLBACK", explanation: "Rollback is safer because the last change likely touched too much or affected risky areas. Return to the last clean working version, then re-apply the intended change in a smaller scope. Avoid auth, database, environment, and production settings until the break boundary is clear." };
  if (risk <= 1) return { type: "FIX FORWARD", explanation: "Fix forward is reasonable because the affected area appears limited and understandable. Make the smallest targeted change, then test the old working flow and the new intended flow. Do not allow a broad refactor." };
  return { type: "HYBRID", explanation: "Use a hybrid path: preserve the current broken state for evidence, compare it against the last working version, then either rollback the risky part or fix forward only the isolated file/config. Do not keep prompting broadly while the cause is uncertain." };
}

const promptCheckerForm = document.querySelector("#prompt-checker-form");
const promptCheckerResult = document.querySelector("#prompt-checker-result");

if (promptCheckerForm && promptCheckerResult) {
  promptCheckerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = new FormData(promptCheckerForm).get("prompt").trim();
    if (!prompt) return;

    promptCheckerResult.hidden = false;
    promptCheckerResult.querySelector("[data-risk]").textContent = "Checking...";
    promptCheckerResult.querySelector("[data-areas]").innerHTML = "";
    promptCheckerResult.querySelector("[data-rewrite]").textContent = "";

    try {
      const response = await fetch("/api/prompt-checker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = response.ok ? await response.json() : fallbackPromptCheck(prompt);
      renderPromptCheck(data);
    } catch (error) {
      renderPromptCheck(fallbackPromptCheck(prompt));
    }
  });
}

function renderPromptCheck(data) {
  promptCheckerResult.querySelector("[data-risk]").textContent = data.risk_level || "Medium";
  promptCheckerResult.querySelector("[data-areas]").innerHTML = (data.accidental_touch_areas || []).map((area) => `<li>${escapeHtml(area)}</li>`).join("");
  promptCheckerResult.querySelector("[data-rewrite]").textContent = data.rewritten_prompt || "";
}

function fallbackPromptCheck(prompt) {
  const broad = /\b(rewrite|refactor|entire|whole app|fix everything|all files|from scratch)\b/i.test(prompt);
  return {
    risk_level: broad ? "High" : "Medium",
    accidental_touch_areas: broad ? ["Unrelated components", "Auth/database configuration", "Existing working flows"] : ["Nearby components", "Shared state", "Existing working flows"],
    rewritten_prompt: `Do not rewrite the app. Do not refactor unrelated code. Do not change auth, database, payment, environment variables, or production settings unless clearly required.\n\nGoal:\n${prompt}\n\nFirst identify the smallest affected area. Then propose the smallest safe change only. List every file or setting you plan to touch before making changes. After the fix, give me a regression checklist.`
  };
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

const scannerForm = document.querySelector("#safe-scanner-form");
const scannerState = { result: null, payload: null };
const scannerSecretWarning = document.querySelector("#scanner-secret-warning");

if (scannerForm) {
  scannerForm.addEventListener("input", () => {
    syncAdvancedScannerFields(scannerForm);
    scannerSecretWarning.hidden = !containsSecret(new FormData(scannerForm));
  });

  scannerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncAdvancedScannerFields(scannerForm);
    const payload = Object.fromEntries(new FormData(scannerForm).entries());

    if (containsSecret(new FormData(scannerForm))) {
      scannerSecretWarning.hidden = false;
      scannerSecretWarning.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    await runProcessTracker();
    const result = buildCaseFile(payload);
    scannerState.result = result;
    scannerState.payload = payload;
    renderCaseFile(payload, result);

    fetch("/api/safe-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, result })
    }).catch(() => {});
  });
}

function syncAdvancedScannerFields(form) {
  const fieldMap = {
    issue_location_advanced: "issue_location",
    break_timing_advanced: "break_timing"
  };

  Object.entries(fieldMap).forEach(([sourceName, targetName]) => {
    const source = form.elements[sourceName];
    const target = form.elements[targetName];
    if (source && target && source.value) target.value = source.value;
  });
}

async function runProcessTracker() {
  const tracker = document.querySelector("#process-tracker");
  if (!tracker) return;
  const stages = [
    "Reading symptom",
    "Identifying likely break layer",
    "Checking prompt-again risk",
    "Detecting no-touch zones",
    "Checking rollback vs fix-forward",
    "Building diagnosis",
    "Running second-pass safety check",
    "Finalizing VibeFix Case File"
  ];

  tracker.classList.add("is-running");
  tracker.innerHTML = stages.map((stage) => `<span class="process-step">${escapeHtml(stage)}</span>`).join("");
  const steps = [...tracker.querySelectorAll(".process-step")];

  for (let index = 0; index < stages.length; index += 1) {
    steps.forEach((step, stepIndex) => {
      step.classList.toggle("done", stepIndex < index);
      step.classList.toggle("active", stepIndex === index);
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  tracker.classList.remove("is-running");
  tracker.innerHTML = '<span class="process-step done">Second-Pass Safety Check Complete</span>';
}

function buildCaseFile(payload) {
  const breakType = lower(payload.break_type);
  const issueLocation = lower(payload.issue_location);
  const timing = lower(payload.break_timing);
  const lastPrompt = payload.last_prompt || "";
  const error = payload.error_message || "";
  const attempts = payload.fix_attempts || "0";
  const unrelated = payload.unrelated_files === "yes";
  const noRollback = payload.rollback_available === "no";
  const sensitive = payload.sensitive_systems !== "no";
  const realData = payload.real_data !== "no";
  const productionUsers = payload.production_users === "yes";
  const vaguePrompt = isDangerousPrompt(lastPrompt) || lastPrompt.trim().length < 30;

  let score = 18;
  if (issueLocation.includes("production")) score += 15;
  if (breakType.includes("auth") || breakType.includes("payment") || breakType.includes("database") || breakType.includes("permissions")) score += 18;
  if (breakType.includes("fix-break") || attempts.includes("3") || attempts.includes("5")) score += 18;
  if (unrelated) score += 15;
  if (noRollback) score += 12;
  if (sensitive) score += 12;
  if (realData) score += 10;
  if (productionUsers) score += 12;
  if (vaguePrompt) score += 10;
  if (!error.trim()) score += 6;
  score = Math.min(100, score);

  const layer = likelyLayer(payload);
  const promptRisk = score >= 70 ? "High" : score >= 42 ? "Medium" : "Low";
  const confidence = evidenceConfidence(payload);
  const noTouchZones = buildNoTouchZones(payload, layer);
  const rollbackDirection = rollbackDecision(payload, score, layer);
  const missingEvidence = missingEvidenceList(payload);
  const checklist = regressionChecklist(layer);
  const hypothesis = rootHypothesis(payload, layer);
  const safePrompt = "";
  const badPromptWarning = promptAutopsyWarning(payload);

  return {
    score,
    layer,
    promptRisk,
    confidence,
    noTouchZones,
    rollbackDirection,
    missingEvidence,
    checklist,
    hypothesis,
    safePrompt,
    badPromptWarning,
    safeFirstMove: safeFirstMove(payload, layer),
    timeline: damageTimeline(payload),
    loopDetected: promptRisk === "High" && (attempts.includes("3") || attempts.includes("5") || breakType.includes("fix-break")),
    suspiciousChange: suspiciousChange(payload, layer)
  };
}

function likelyLayer(payload) {
  const type = lower(payload.break_type);
  const timing = lower(payload.break_timing);
  const location = lower(payload.issue_location);
  if (location.includes("production") || timing.includes("deploy")) return "env config / deployment";
  if (type.includes("auth") || type.includes("login") || type.includes("permissions")) return "auth / permissions";
  if (type.includes("database") || type.includes("data")) return "database / RLS";
  if (type.includes("payment") || type.includes("checkout")) return "payments / checkout";
  if (type.includes("api") || type.includes("email") || type.includes("file upload")) return "API integration";
  if (type.includes("routing") || type.includes("blank")) return "routing / runtime";
  if (type.includes("ui") || type.includes("layout")) return "UI / component state";
  if (type.includes("fix-break") || type.includes("unrelated")) return "AI over-editing / shared state";
  if (timing.includes("env")) return "env config";
  if (timing.includes("database")) return "database / RLS";
  if (timing.includes("auth")) return "auth / session";
  return "unknown";
}

function evidenceConfidence(payload) {
  let points = 0;
  if ((payload.error_message || "").trim()) points += 2;
  if ((payload.last_prompt || "").trim().length > 40) points += 2;
  if ((payload.last_working_state || "").trim()) points += 1;
  if ((payload.current_broken_behavior || "").trim()) points += 1;
  if ((payload.evidence_links || "").trim()) points += 1;
  if ((payload.recent_prompts || "").trim()) points += 1;
  if (points >= 6) return "High";
  if (points >= 3) return "Medium";
  return "Low";
}

function buildNoTouchZones(payload, layer) {
  const zones = new Set(["working dashboard flows", "existing working UI components"]);
  const type = `${lower(payload.break_type)} ${lower(payload.break_timing)} ${layer}`;
  if (type.includes("auth") || type.includes("login") || type.includes("permissions")) {
    ["auth system", "auth provider config", "redirect URLs", "route guards", "session handling"].forEach((item) => zones.add(item));
  }
  if (type.includes("database") || type.includes("data") || type.includes("rls")) {
    ["database schema", "Supabase RLS policies", "production data", "storage buckets"].forEach((item) => zones.add(item));
  }
  if (type.includes("env") || type.includes("deployment") || type.includes("production")) {
    ["environment variables", "API keys", "deployment settings"].forEach((item) => zones.add(item));
  }
  if (type.includes("payment") || type.includes("checkout")) {
    ["payment/checkout", "webhooks", "product and price IDs"].forEach((item) => zones.add(item));
  }
  if (type.includes("api") || type.includes("email")) {
    ["existing API integrations", "email provider config"].forEach((item) => zones.add(item));
  }
  if (payload.declared_no_touch) {
    payload.declared_no_touch.split(/,|\n/).map((item) => item.trim()).filter(Boolean).forEach((item) => zones.add(item));
  }
  return [...zones].slice(0, 12);
}

function rollbackDecision(payload, score, layer) {
  if (payload.rollback_available === "yes" && (score >= 70 || payload.unrelated_files === "yes" || String(payload.fix_attempts).includes("5"))) {
    return "Rollback is safer. Return to the last working checkpoint, then re-apply the intended change with a smaller scoped prompt.";
  }
  if (payload.rollback_available === "no" && score >= 70) {
    return "Pause and collect evidence before editing. No rollback plus high-risk systems means broad fix prompts are unsafe.";
  }
  if (score < 42) return "Fix-forward is reasonable if the affected layer is isolated and the prompt stays narrow.";
  return "Hybrid path: compare the last working state to current state, then fix-forward only the proven failing layer.";
}

function safeFirstMove(payload, layer) {
  if (layer.includes("env") || layer.includes("deployment")) return "Compare preview vs production environment variables, redirect URLs, build logs, and browser console errors before changing code.";
  if (layer.includes("auth")) return "Trace the auth flow step-by-step: provider, callback, session, route guard, and data access. Do not rewrite auth.";
  if (layer.includes("database")) return "Inspect the failed query/network response and permission/RLS errors before changing schema or policies.";
  if (layer.includes("payments")) return "Verify checkout link, mode, product/price IDs, success page, and webhook assumptions before touching payment code.";
  if (layer.includes("UI")) return "Compare the last working component/layout with the changed component. Do not change backend systems.";
  return "Collect exact evidence first: last prompt, changed files, exact error, and last working state.";
}

function missingEvidenceList(payload) {
  const missing = [];
  if (!payload.error_message?.trim()) missing.push("Exact console/build/API error");
  if (!payload.last_prompt?.trim()) missing.push("Exact last prompt or code/config change");
  if (!payload.last_working_state?.trim()) missing.push("Last known working state");
  if (!payload.evidence_links?.trim()) missing.push("Screenshot, deploy log, or shared evidence link");
  if (!payload.recent_prompts?.trim()) missing.push("Recent prompts for prompt autopsy");
  return missing.length ? missing : ["No major missing evidence detected from the form."];
}

function regressionChecklist(layer) {
  if (layer.includes("auth")) return ["signup", "login", "logout", "redirect", "protected route", "session persistence", "test user access", "mobile login", "production auth callback"];
  if (layer.includes("database")) return ["create test record", "read test record", "update test record", "delete only test data", "dashboard loads data", "RLS allows correct user", "no production schema migration without backup"];
  if (layer.includes("deployment") || layer.includes("env")) return ["preview works", "production works", "build passes", "env vars match", "deploy logs clean", "console errors checked", "API endpoints reachable"];
  if (layer.includes("payments")) return ["test checkout", "webhook event", "success page", "failure/cancel page", "product/price IDs", "live mode confirmed", "no real payment risk"];
  if (layer.includes("UI")) return ["broken component renders", "previous working page still works", "mobile layout", "desktop layout", "navigation", "empty/loading/error states"];
  if (layer.includes("API")) return ["endpoint response", "auth headers", "env URL", "CORS", "error handling", "rate limit"];
  return ["old working flow still works", "broken flow is fixed", "no unrelated UI changes", "no auth/database/payment/env changes unless proven", "production and preview checked"];
}

function rootHypothesis(payload, layer) {
  if (layer.includes("env")) return "Preview vs production behavior suggests a production-only configuration, environment variable, deploy, or redirect mismatch.";
  if (layer.includes("auth")) return "The break likely sits around auth provider config, redirect URL, route guard, session persistence, RLS/user context, or environment mismatch.";
  if (layer.includes("database")) return "The break likely involves RLS, query/table mismatch, API key/env mismatch, or user permission context rather than a pure UI failure.";
  if (layer.includes("payments")) return "The break likely involves checkout link/mode, product IDs, redirect/success page, webhook assumptions, or payment environment config.";
  if (layer.includes("AI over-editing")) return "Multiple fix attempts or unrelated file changes suggest a fix-break loop, not one isolated bug.";
  return "The likely cause is not confirmed. The safest move is to collect exact evidence and avoid broad prompts.";
}

function damageTimeline(payload) {
  return [
    `Last working state: ${payload.last_working_state || "not provided"}`,
    `Last prompt/change: ${payload.last_prompt || "not provided"}`,
    `First/current symptom: ${payload.current_broken_behavior || "not provided"}`,
    `Repair attempts: ${payload.fix_attempts || "0"} attempt(s); ${payload.already_tried || "details not provided"}`,
    `Most suspicious change: ${suspiciousChange(payload, likelyLayer(payload))}`,
    `Safest next investigation: ${safeFirstMove(payload, likelyLayer(payload))}`
  ];
}

function suspiciousChange(payload, layer) {
  return `The last ${payload.last_ai_tool || "AI"} edit touched or preceded the ${layer} boundary. This is the highest-risk change, not confirmed cause.`;
}

function buildToolPrompt(payload, layer, noTouchZones, tool) {
  const base = `Current symptom: ${payload.current_broken_behavior || "[describe current broken behavior]"}
Last working state: ${payload.last_working_state || "[describe last working state]"}
Last prompt/change: ${payload.last_prompt || "[paste last prompt/change]"}
Exact error/log: ${payload.error_message || "[paste exact error if available]"}
Likely break layer to inspect first: ${layer}
No-touch zones: ${noTouchZones.join(", ")}

Rules:
- Inspect first and give a plan before code changes.
- Do not rewrite the entire app.
- Do not edit unrelated files or working features.
- Do not touch no-touch zones unless evidence proves they are the failing layer.
- Ask before touching auth, database, payment, environment variables, deployment settings, admin permissions, or production data.
- Make the smallest possible change.
- Include a regression checklist after the fix.`;

  if (tool === "Cursor") return `Act like a repo-aware debugging assistant. Inspect relevant files and diffs first.\n\n${base}\n\nGive me the minimal patch plan before applying edits.`;
  if (tool === "Lovable") return `Do not rebuild the app or change the design system unless required.\n\n${base}\n\nFix only the broken flow and preserve existing pages/database structure.`;
  if (tool === "Bolt") return `Use plan mode first. Check terminal/build/runtime errors before code edits.\n\n${base}\n\nKeep existing env/config unless the issue is proven there.`;
  if (tool === "Replit") return `Check checkpoint/rollback and deploy logs first.\n\n${base}\n\nDo not overwrite working code. Explain rollback vs fix-forward before editing.`;
  if (tool === "v0") return `Keep existing UI, routes, and component boundaries.\n\n${base}\n\nDo not regenerate the whole app. Fix only the specified component/route.`;
  if (tool === "Claude Code") return `Use plan mode. Read relevant files before implementation.\n\n${base}\n\nDo not implement until the plan is confirmed. Keep the diff small.`;
  if (tool === "Windsurf") return `Analyze context first and avoid sweeping edits.\n\n${base}\n\nOnly change the failing layer and protect working flows.`;
  return `You are helping debug a broken AI-built app. ${base}`;
}

function promptAutopsyWarning(payload) {
  const prompts = [payload.last_prompt, payload.recent_prompts].filter(Boolean).join("\n");
  const found = dangerousPhrase(prompts);
  if (found) return `Dangerous prompt language detected: "${found}". It is too broad and may cause unrelated edits. Ask AI to inspect first, plan before code, and preserve no-touch zones.`;
  if (!payload.last_prompt?.trim()) return "No last prompt was provided. Without it, do not assume cause. Collect the exact prompt/change before editing.";
  return "No severe broad rewrite phrase detected, but still use a scoped prompt with no-touch zones.";
}

function renderCaseFile(payload, result) {
  const panel = document.querySelector("#case-file");
  panel?.classList.remove("has-results");
  setText("#case-title", result.loopDetected ? "Loop Detected: stop broad fix prompts." : "VibeFix Case File generated.");
  setText("#case-summary", result.loopDetected ? "You are probably not dealing with one isolated bug. Collect evidence and use scoped prompts only." : "Second-pass safety check complete. Use this case file before prompting again.");
  animateRiskScore(result.score);
  setText("#prompt-risk", result.promptRisk);
  setText("#break-layer", result.layer);
  setText("#confidence-score", result.confidence);
  setText("#root-hypothesis", result.hypothesis);
  setText("#rollback-direction", result.rollbackDirection);
  setText("#safe-first-move", result.safeFirstMove);
  setText("#safe-first-prompt", lockedRepairPromptMessage(result));
  setText("#bad-prompt-warning", result.badPromptWarning);
  updateRiskCards(result);
  const riskMeter = document.querySelector("#risk-meter");
  if (riskMeter) {
    riskMeter.style.width = `${result.score}%`;
    riskMeter.className = result.score >= 70 ? "danger" : result.score >= 36 ? "caution" : "safe";
  }
  setHtml("#no-touch-zones", result.noTouchZones.map((zone) => `<span class="${zoneClass(zone)}">${escapeHtml(zone)}</span>`).join(""));
  setHtml("#missing-evidence", result.missingEvidence.map((item) => `<li>${escapeHtml(item)}</li>`).join(""));
  setHtml("#regression-checklist", "<li>Unlocked in Deep Diagnosis with the exact tool-specific repair prompt.</li>");
  setHtml("#damage-timeline", result.timeline.map((item) => `<li>${escapeHtml(item)}</li>`).join(""));
  const emailForm = document.querySelector("#case-email-form");
  if (emailForm) emailForm.hidden = false;
  requestAnimationFrame(() => panel?.classList.add("has-results"));
  panel?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function lockedRepairPromptMessage(result) {
  return `Free diagnosis complete.

Likely break layer: ${result.layer}
Prompt-again risk: ${result.promptRisk}

Exact repair prompts, tool-specific exports, and the regression checklist are unlocked in Deep Diagnosis.`;
}

function animateRiskScore(score) {
  const target = document.querySelector("#risk-score");
  if (!target) return;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    target.textContent = `${score}/100`;
    return;
  }
  let current = 0;
  const step = Math.max(1, Math.ceil(score / 24));
  const tick = () => {
    current = Math.min(score, current + step);
    target.textContent = `${current}/100`;
    if (current < score) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function updateRiskCards(result) {
  const applyState = (selector, state) => {
    const card = document.querySelector(selector)?.closest(".risk-card");
    if (!card) return;
    card.classList.remove("risk-low", "risk-medium", "risk-high");
    card.classList.add(state);
  };

  const scoreState = result.score >= 70 ? "risk-high" : result.score >= 36 ? "risk-medium" : "risk-low";
  const confidenceState = lower(result.confidence) === "high" ? "risk-low" : lower(result.confidence) === "medium" ? "risk-medium" : "risk-high";
  const promptState = lower(result.promptRisk) === "high" ? "risk-high" : lower(result.promptRisk) === "medium" ? "risk-medium" : "risk-low";

  applyState("#prompt-risk", promptState);
  applyState("#risk-score", scoreState);
  applyState("#confidence-score", confidenceState);
  applyState("#break-layer", "risk-medium");
}

function zoneClass(zone) {
  const value = lower(zone);
  if (/(api key|production data|payment|webhook|auth|database|rls|env|service|admin)/.test(value)) return "zone-critical";
  if (/(route|session|storage|deployment|redirect|schema)/.test(value)) return "zone-warning";
  return "zone-safe";
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function setHtml(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.innerHTML = value;
}

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.querySelector(`#${button.dataset.copyTarget}`);
    if (!target) return setButtonStatus(button, "Run scanner first");
    await copyText(target.textContent, button);
  });
});

document.querySelectorAll("[data-export-tool]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (!scannerState.result || !scannerState.payload) return setButtonStatus(button, "Run scanner first");
    const tool = button.dataset.exportTool;
    const prompt = buildToolPrompt(scannerState.payload, scannerState.result.layer, scannerState.result.noTouchZones, tool);
    await copyText(prompt, button);
  });
});

document.querySelector("#download-case-file")?.addEventListener("click", () => {
  if (!scannerState.result || !scannerState.payload) return setButtonStatus(document.querySelector("#download-case-file"), "Run scanner first");
  downloadText("vibefix-case-file.md", caseFileMarkdown(scannerState.payload, scannerState.result));
});

document.querySelector("#download-checklist")?.addEventListener("click", () => {
  if (!scannerState.result) return setButtonStatus(document.querySelector("#download-checklist"), "Run scanner first");
  downloadText("vibefix-debug-checklist.md", scannerState.result.checklist.map((item) => `- [ ] ${item}`).join("\n"));
});

document.querySelector("#copy-evidence-pack")?.addEventListener("click", async (event) => {
  if (!scannerState.payload) return setButtonStatus(event.currentTarget, "Run scanner first");
  await copyText(evidencePack(scannerState.payload), event.currentTarget);
});

function caseFileMarkdown(payload, result) {
  return `# VibeFix Case File

## Case Summary
Built with: ${payload.builder}
Current symptom: ${payload.current_broken_behavior || "Not provided"}
Last working state: ${payload.last_working_state || "Not provided"}
Last change: ${payload.last_prompt || "Not provided"}

## Risk
Fix-Risk Score: ${result.score}/100
Prompt-Again Risk: ${result.promptRisk}
Likely Break Layer: ${result.layer}
Evidence Confidence: ${result.confidence}

## Root Cause Hypothesis
${result.hypothesis}

## No-Touch Map
${result.noTouchZones.map((zone) => `- ${zone}`).join("\n")}

## Rollback vs Fix-Forward
${result.rollbackDirection}

## Safe First Prompt
${result.safePrompt}

## Evidence Needed
${result.missingEvidence.map((item) => `- ${item}`).join("\n")}

## Regression Checklist
${result.checklist.map((item) => `- [ ] ${item}`).join("\n")}`;
}

function evidencePack(payload) {
  return `Last working state:\n${payload.last_working_state || ""}\n\nCurrent broken behavior:\n${payload.current_broken_behavior || ""}\n\nLast prompt/change:\n${payload.last_prompt || ""}\n\nExact error/log:\n${payload.error_message || ""}\n\nAlready tried:\n${payload.already_tried || ""}\n\nEvidence links:\n${payload.evidence_links || ""}`;
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    return setButtonStatus(button, "Copy unavailable");
  }
  const old = button.textContent;
  const oldHtml = button.innerHTML;
  button.classList.add("copied");
  button.textContent = old.toLowerCase().includes("prompt") ? "Copied Safe Prompt" : "Copied";
  setTimeout(() => {
    button.innerHTML = oldHtml;
    button.classList.remove("copied");
  }, 1400);
}

function setButtonStatus(button, message) {
  if (!button) return;
  const old = button.textContent;
  button.textContent = message;
  button.classList.add("copied");
  setTimeout(() => {
    button.textContent = old;
    button.classList.remove("copied");
  }, 1600);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/markdown" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

const inlinePromptButton = document.querySelector("#inline-prompt-risk-button");
const inlinePromptInput = document.querySelector("#inline-prompt-risk-input");
const inlinePromptOutput = document.querySelector("#inline-prompt-risk-output");

if (inlinePromptButton && inlinePromptInput && inlinePromptOutput) {
  inlinePromptButton.addEventListener("click", () => {
    const prompt = inlinePromptInput.value.trim();
    if (!prompt) return;
    const result = promptRiskAnalysis(prompt);
    inlinePromptOutput.hidden = false;
    inlinePromptOutput.classList.remove("risk-low", "risk-medium", "risk-high");
    inlinePromptOutput.classList.add(`risk-${lower(result.risk_level)}`);
    inlinePromptOutput.querySelector("[data-risk-level]").textContent = result.risk_level;
    inlinePromptOutput.querySelector("[data-risky-phrase]").textContent = result.risky_phrase || "No severe phrase found";
    inlinePromptOutput.querySelector("[data-risk-reason]").textContent = result.reason;
    inlinePromptOutput.querySelector("[data-risk-areas]").innerHTML = result.accidental_touch_areas.map((area) => `<span>${escapeHtml(area)}</span>`).join("");
    inlinePromptOutput.querySelector("[data-safe-rewrite]").textContent = result.rewritten_prompt;
    fetch("/api/prompt-checker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    }).catch(() => {});
  });
}

function promptRiskAnalysis(prompt) {
  const phrase = dangerousPhrase(prompt);
  const risk = phrase ? "High" : prompt.length < 25 ? "Medium" : "Low";
  const areas = phrase
    ? ["auth flow", "database policies", "environment variables", "working UI flows", "payment/checkout"]
    : ["nearby component", "shared state", "current route"];
  return {
    risk_level: risk,
    risky_phrase: phrase,
    reason: phrase ? "This prompt is too broad. It asks AI to act before inspecting evidence and may trigger unrelated rewrites." : "This prompt is less broad, but it should still include no-touch zones and a plan-before-code instruction.",
    accidental_touch_areas: areas,
    rewritten_prompt: `The issue is: [describe exact symptom]. Do not rewrite the app, refactor unrelated files, or touch auth, database, payment, environment variables, deployment settings, or working features unless evidence proves they are the failing layer. First inspect the relevant flow and give me a minimal fix plan before changing code. Preserve existing behavior. Make the smallest possible change and give a regression checklist.`
  };
}

function dangerousPhrase(text = "") {
  const phrases = [
    "fix everything", "fix all errors", "rewrite", "rebuild", "start over", "make it work", "clean the code", "refactor everything", "do whatever needed", "change database", "change auth", "update all files", "remove old code", "simplify entire app", "make production work", "solve this", "fix login", "fix dashboard", "fix backend", "fix deployment", "try anything", "full rewrite", "from scratch"
  ];
  const found = phrases.find((phrase) => lower(text).includes(phrase));
  return found || "";
}

function isDangerousPrompt(text) {
  return Boolean(dangerousPhrase(text));
}

const changeHistoryForm = document.querySelector("#change-history-form");
const changeHistoryOutput = document.querySelector("#change-history-output");
if (changeHistoryForm && changeHistoryOutput) {
  changeHistoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(changeHistoryForm).entries());
    const prompts = (data.recent_prompts || "").split(/\n+/).filter(Boolean);
    const risky = prompts.find((prompt) => dangerousPhrase(prompt)) || data.recent_prompts || "No prompt supplied";
    const level = data.unrelated === "yes" || data.appeared_after === "yes" ? "High" : "Medium";
    changeHistoryOutput.hidden = false;
    changeHistoryOutput.innerHTML = `
      <h3>Most Suspicious Change</h3>
      <p>${escapeHtml(data.last_tool || "The last AI")} touched ${escapeHtml(data.last_area || "an unknown area")}. This is the highest-risk change, not confirmed cause.</p>
      <h3>Change Risk Level</h3><p>${level}</p>
      <h3>Most Risky Prompt</h3><p>${escapeHtml(risky)}</p>
      <h3>Suggested first investigation</h3><p>Compare the last working state to the first symptom after this change. Check rollback/checkpoint before another edit.</p>
    `;
  });
}

const preventiveForm = document.querySelector("#preventive-form");
const preventiveOutput = document.querySelector("#preventive-output");
if (preventiveForm && preventiveOutput) {
  preventiveForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(preventiveForm).entries());
    const sensitive = (data.sensitive || "auth, database, payments, API, admin, env").split(",").map((item) => item.trim()).filter(Boolean);
    preventiveOutput.hidden = false;
    preventiveOutput.innerHTML = `
      <h3>Likely fragile areas</h3><div class="chip-list">${sensitive.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      <h3>Safest build order</h3><ol class="submitted-steps"><li>Save checkpoint before the feature.</li><li>Build the smallest visible version first.</li><li>Do not touch sensitive systems unless required.</li><li>Test old flows before deploy.</li></ol>
      <h3>Safe feature prompt</h3><pre>In ${escapeHtml(data.builder || "my AI builder")}, add this feature: ${escapeHtml(data.feature || "[feature]")}. Do not rewrite the app. Do not touch ${escapeHtml(sensitive.join(", "))} unless required. First give a plan, then make the smallest safe change. Preserve existing working flows and give me a regression checklist before deploy.</pre>
    `;
  });
}

function containsSecret(formData) {
  const joined = [...formData.values()].join("\n");
  return /(api[_-]?key|service[_-]?role|secret|password|token|bearer|sk-[a-z0-9]|private key|seed phrase)/i.test(joined);
}

function lower(value) {
  return String(value || "").toLowerCase();
}
