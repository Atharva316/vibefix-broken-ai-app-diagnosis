const revealElements = document.querySelectorAll(".reveal");
const progressBar = document.querySelector(".scroll-progress");

if (progressBar) {
  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? (window.scrollY / max) * 100 : 0;
    progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  };
  updateProgress();
  window.addEventListener("scroll", updateProgress, { passive: true });
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
