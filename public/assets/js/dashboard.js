const toolField = document.querySelector('[data-name="tool"]');
const breakField = document.querySelector('[data-name="breakTypes"]');
const form = document.querySelector("#ai-form");
const outputPanel = document.querySelector("#output-panel");
const likelyCause = document.querySelector("#likely-cause");
const notTouch = document.querySelector("#not-touch");
const fixTitle = document.querySelector("#fix-title");
const fixPrompt = document.querySelector("#fix-prompt");
const typing = document.querySelector("#typing");
const usageCounter = document.querySelector("#usage-counter");
const foundersHelped = document.querySelector("#founders-helped");
const confidenceBadge = document.querySelector("#confidence-badge");
const upgradeGate = document.querySelector("#upgrade-gate");
const copyButton = document.querySelector("#copy-prompt");
const fileInput = document.querySelector("#screenshot");
const uploadZone = document.querySelector("#upload-zone");
const uploadPreview = document.querySelector("#upload-preview");
const PAYMENT_URL = "https://rzp.io/rzp/bM3R4oPl";
const PROMPT_HISTORY_KEY = "vibefix_prompt_history";
const PROMPT_ATTEMPT_KEY = "vibefix_prompt_attempt_count";

normalizePaymentLinks();

document.querySelectorAll(".pill-field").forEach((field) => {
  const multi = field.dataset.multi === "true";
  field.querySelectorAll(".select-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      if (multi) {
        pill.classList.toggle("is-selected");
        return;
      }

      field.querySelectorAll(".select-pill").forEach((item) => item.classList.remove("is-selected"));
      pill.classList.add("is-selected");
    });
  });
});

if (fileInput) {
  ["dragenter", "dragover"].forEach((eventName) => {
    uploadZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.remove("is-dragging");
    });
  });

  uploadZone?.addEventListener("drop", (event) => {
    fileInput.files = event.dataTransfer.files;
    previewImage();
  });

  fileInput.addEventListener("change", previewImage);
}

if (form) {
  hydrateUsage();
  hydrateFoundersHelped();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = fileInput.files[0];

    if (file && file.size > 5 * 1024 * 1024) {
      alert("Upload a screenshot under 5MB.");
      return;
    }

    const payload = {
      tool: selectedValues(toolField)[0] || "Other",
      breakTypes: selectedValues(breakField),
      description: document.querySelector("#description").value.trim(),
      image: file ? await fileToPayload(file) : null
    };

    updateConfidence(payload);

    if (!payload.description) {
      alert("Describe what broke first.");
      return;
    }

    await generatePrompts(payload);
  });
}

async function hydrateFoundersHelped() {
  if (!foundersHelped) return;
  try {
    const response = await fetch("/api/ai-helper-count", { cache: "no-store" });
    const data = await response.json();
    foundersHelped.textContent = `${Number(data.count || 0)} founders helped so far`;
  } catch (error) {
    foundersHelped.textContent = "0 founders helped so far";
  }
}

if (copyButton) {
  copyButton.dataset.copyBound = "true";
  copyButton.addEventListener("click", async () => {
    await copyText(fixPrompt?.textContent || "", copyButton);
  });
}

async function hydrateUsage() {
  const response = await fetch("/api/me", { cache: "no-store" });
  const user = await response.json();
  if (!user || !usageCounter) return;
  usageCounter.textContent = `${user.remaining} of ${user.freeLimit} free uses remaining`;
  if (user.remaining <= 0) showUpgradeGate(user.freeLimit);
}

async function generatePrompts(payload) {
  const promptHistory = readPromptHistory();
  const attemptCount = nextPromptAttemptCount();

  if (typing) typing.hidden = false;
  if (upgradeGate) upgradeGate.hidden = true;
  outputPanel?.classList.remove("is-gated");
  if (likelyCause) likelyCause.textContent = "";
  if (notTouch) notTouch.innerHTML = "<li>Generating...</li>";
  if (fixPrompt) fixPrompt.textContent = "";
  if (fixTitle) fixTitle.textContent = `Paste this into ${payload.tool}`;

  const response = await fetch("/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool: payload.tool,
      breakType: payload.breakTypes[0] || "Other",
      breakTypes: payload.breakTypes,
      description: payload.description,
      attemptCount,
      lastGeneratedPrompt: promptHistory[0] || "",
      recentGeneratedPrompts: promptHistory
    })
  });

  if (!response.ok) {
    if (typing) typing.hidden = true;
    if (likelyCause) likelyCause.textContent = "The AI helper could not start. Sign in again and retry.";
    return;
  }

  const data = await response.json();
  const raw = data.result || "Could not generate diagnosis.";
  if (!data.gated && raw.trim()) storePromptHistory(raw);
  renderStructured(raw);
  if (data.gated) showUpgradeGate(data.limit);
  else if (usageCounter && Number.isFinite(Number(data.remaining)) && Number.isFinite(Number(data.limit))) {
    usageCounter.textContent = `${data.remaining} of ${data.limit} free uses remaining`;
  }
  const confidence = section(raw, "CONFIDENCE", "REASON").replace(/[\[\]]/g, "").trim();
  if (confidence && confidenceBadge) confidenceBadge.textContent = `Confidence: ${confidence}`;
  hydrateFoundersHelped();
  hydrateUsage();
  if (typing) typing.hidden = true;
}

function readPromptHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROMPT_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 5) : [];
  } catch (error) {
    return [];
  }
}

function storePromptHistory(prompt) {
  const history = readPromptHistory().filter((item) => item !== prompt);
  history.unshift(prompt);
  localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
}

function nextPromptAttemptCount() {
  const current = Number(localStorage.getItem(PROMPT_ATTEMPT_KEY) || "0");
  const next = Number.isFinite(current) ? current + 1 : 1;
  localStorage.setItem(PROMPT_ATTEMPT_KEY, String(next));
  return next;
}

function updateConfidence(payload) {
  if (!confidenceBadge) return;
  const hasError = /(error|exception|failed|denied|unauthorized|timeout|stack|console|log)/i.test(payload.description);
  let level = "Low";
  if (payload.image && hasError && payload.description.length > 120) level = "High";
  else if (payload.image || hasError || payload.description.length > 80) level = "Medium";
  confidenceBadge.textContent = `Confidence: ${level}`;
}

function showUpgradeGate(limit = 3) {
  outputPanel?.classList.add("is-gated");
  if (upgradeGate) upgradeGate.hidden = false;
  normalizePaymentLinks();
  if (likelyCause) likelyCause.textContent = `You have used all ${limit} free prompt generations.`;
  if (notTouch) notTouch.innerHTML = "<li>Free prompt generation is finished for this browser session.</li><li>Continue with the paid diagnosis to generate or improve more prompts.</li>";
  if (fixTitle) fixTitle.textContent = "Payment required";
  if (fixPrompt) fixPrompt.textContent = "Your free VibeFix AI Helper limit is finished. Use the payment option below to continue.";
}

function normalizePaymentLinks() {
  document.querySelectorAll("#upgrade-gate a, .upgrade-gate a, .empty-state a.btn-primary").forEach((link) => {
    link.href = PAYMENT_URL;
    link.textContent = "Get Beta Diagnosis - Rs 7,530 (~$90 USD)";
  });
}

function renderStructured(text) {
  const likely = section(text, "LIKELY CAUSE", "WHAT NOT TO TOUCH");
  const avoid = section(text, "WHAT NOT TO TOUCH", text.toUpperCase().includes("PASTE THIS INTO YOUR TOOL") ? "PASTE THIS INTO YOUR TOOL" : "FIX PROMPT FOR");
  const prompt = text.toUpperCase().includes("PASTE THIS INTO YOUR TOOL")
    ? section(text, "PASTE THIS INTO YOUR TOOL", "CONFIDENCE")
    : section(text, "FIX PROMPT FOR", null);

  if (likelyCause) likelyCause.textContent = likely || "Reading your details...";
  if (notTouch) notTouch.innerHTML = toList(avoid || "Do not rewrite the whole app.");
  if (fixPrompt) fixPrompt.textContent = prompt || text || "Preparing prompt...";
}

function section(text, start, end) {
  const upper = text.toUpperCase();
  const startIndex = upper.indexOf(start);
  if (startIndex === -1) return "";
  const bodyStart = startIndex + start.length;
  const endIndex = end ? upper.indexOf(end, bodyStart) : text.length;
  return text.slice(bodyStart, endIndex === -1 ? text.length : endIndex).replace(/^[\s:.-]+/, "").trim();
}

function toList(text) {
  const lines = text.split(/\n+/).map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
  return lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
}

function parseEvent(eventText) {
  const type = eventText.split("\n").find((line) => line.startsWith("event: "))?.slice(7);
  const dataLine = eventText.split("\n").find((line) => line.startsWith("data: "));
  if (!type || !dataLine) return null;
  return { type, data: JSON.parse(dataLine.slice(6)) };
}

function selectedValues(field) {
  if (!field) return [];
  return [...field.querySelectorAll(".select-pill.is-selected")].map((pill) => pill.dataset.value);
}

function previewImage() {
  const file = fileInput.files[0];
  if (!file) return;
  if (!uploadPreview) return;
  uploadPreview.src = URL.createObjectURL(file);
  uploadPreview.hidden = false;
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const [meta, base64] = reader.result.split(",");
      const mediaType = meta.match(/data:(.*);base64/)?.[1] || file.type;
      resolve({ mediaType, base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

document.querySelectorAll(".copy-btn, [data-copy]").forEach((btn) => {
  if (btn.dataset.copyBound === "true") return;
  btn.dataset.copyBound = "true";
  btn.addEventListener("click", async () => {
    const target = btn.dataset.copy
      ? document.querySelector(btn.dataset.copy)
      : btn.previousElementSibling;
    const text = target?.textContent || target?.value || fixPrompt?.textContent || "";
    await copyText(text, btn);
  });
});

async function copyText(text, btn) {
  if (!btn) return;
  const original = btn.textContent;
  if (!text.trim()) {
    btn.textContent = "Nothing to copy";
    setTimeout(() => { btn.textContent = original; }, 1600);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Copied!";
  } catch (error) {
    btn.textContent = "Copy unavailable";
  }
  setTimeout(() => { btn.textContent = original; }, 1600);
}
