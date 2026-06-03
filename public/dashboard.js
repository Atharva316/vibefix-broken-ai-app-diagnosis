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
const upgradeGate = document.querySelector("#upgrade-gate");
const copyButton = document.querySelector("#copy-prompt");
const fileInput = document.querySelector("#screenshot");
const uploadZone = document.querySelector("#upload-zone");
const uploadPreview = document.querySelector("#upload-preview");
const PAYMENT_URL = "/payment.html";

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
    uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.remove("is-dragging");
    });
  });

  uploadZone.addEventListener("drop", (event) => {
    fileInput.files = event.dataTransfer.files;
    previewImage();
  });

  fileInput.addEventListener("change", previewImage);
}

if (form) {
  hydrateUsage();

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

    if (!payload.description) {
      alert("Describe what broke first.");
      return;
    }

    await generatePrompts(payload);
  });
}

if (copyButton) {
  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(fixPrompt.textContent);
    copyButton.textContent = "Copied";
    setTimeout(() => { copyButton.textContent = "Copy"; }, 1200);
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
  typing.hidden = false;
  upgradeGate.hidden = true;
  outputPanel.classList.remove("is-gated");
  likelyCause.textContent = "";
  notTouch.innerHTML = "<li>Generating...</li>";
  fixPrompt.textContent = "";
  fixTitle.textContent = `Paste this into ${payload.tool}`;

  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok || !response.body) {
    typing.hidden = true;
    likelyCause.textContent = "The AI helper could not start. Sign in again and retry.";
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventText of events) {
      const event = parseEvent(eventText);
      if (!event) continue;

      if (event.type === "token") {
        raw += event.data.text || "";
        renderStructured(raw);
      }

      if (event.type === "gate") {
        raw = event.data.text || "";
        renderStructured(raw);
        showUpgradeGate(event.data.limit);
        usageCounter.textContent = `0 of ${event.data.limit} free uses remaining`;
      }

      if (event.type === "done") {
        raw = event.data.text || raw;
        renderStructured(raw);
        usageCounter.textContent = `${event.data.remaining} of ${event.data.limit} free uses remaining`;
      }
    }
  }

  typing.hidden = true;
}

function showUpgradeGate(limit = 3) {
  outputPanel.classList.add("is-gated");
  upgradeGate.hidden = false;
  normalizePaymentLinks();
  likelyCause.textContent = `You have used all ${limit} free prompt generations.`;
  notTouch.innerHTML = "<li>Free prompt generation is finished for this browser session.</li><li>Continue with the paid diagnosis to generate or improve more prompts.</li>";
  fixTitle.textContent = "Payment required";
  fixPrompt.textContent = "Your free VibeFix AI Helper limit is finished. Use the payment option below to continue.";
}

function normalizePaymentLinks() {
  document.querySelectorAll("#upgrade-gate a, .upgrade-gate a, .empty-state a.btn-primary").forEach((link) => {
    link.href = PAYMENT_URL;
    link.textContent = "Get Beta Diagnosis — ₹1 Test";
  });
}

function renderStructured(text) {
  const likely = section(text, "LIKELY CAUSE", "WHAT NOT TO TOUCH");
  const avoid = section(text, "WHAT NOT TO TOUCH", "FIX PROMPT FOR");
  const prompt = section(text, "FIX PROMPT FOR", null);

  likelyCause.textContent = likely || "Reading your details...";
  notTouch.innerHTML = toList(avoid || "Do not rewrite the whole app.");
  fixPrompt.textContent = prompt || text || "Preparing prompt...";
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
  return [...field.querySelectorAll(".select-pill.is-selected")].map((pill) => pill.dataset.value);
}

function previewImage() {
  const file = fileInput.files[0];
  if (!file) return;
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
