const revealElements = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        animateCounters(entry.target);
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
  animateCounters(document);
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

function animateCounters(scope) {
  const counters = scope.querySelectorAll ? scope.querySelectorAll("[data-counter]") : [];
  counters.forEach((counter) => {
    if (counter.dataset.animated === "true") return;
    counter.dataset.animated = "true";

    const target = Number(counter.dataset.counter || "0");
    const suffix = counter.dataset.suffix || "";
    const duration = Number(counter.dataset.duration || "1400");
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      counter.textContent = `${value}${suffix}`;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        counter.textContent = `${target}${suffix}`;
      }
    };

    requestAnimationFrame(step);
  });
}

const nav = document.querySelector(".site-nav");

if (nav) {
  initAuthNav(nav).catch(() => {
    renderAuthSlot(nav, null, null);
  });
}

async function initAuthNav(navElement) {
  const config = await fetch("/api/config", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);

  let supabase = null;
  let workerUser = null;

  if (config?.supabaseUrl && config?.supabaseAnonKey) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        flowType: "pkce"
      }
    });

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.access_token) {
      await syncWorkerSession(sessionData.session.access_token);
    }
  }

  workerUser = await fetch("/api/me", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);

  if (!workerUser && supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    workerUser = sessionData?.session ? mapSupabaseUser(sessionData.session.user) : null;
  }

  renderAuthSlot(navElement, workerUser, supabase);

  if (supabase) {
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.access_token) {
        await syncWorkerSession(session.access_token);
      } else {
        await fetch("/auth/signout", { cache: "no-store" }).catch(() => {});
      }

      const refreshedUser = await fetch("/api/me", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null);

      renderAuthSlot(navElement, refreshedUser || (session?.user ? mapSupabaseUser(session.user) : null), supabase);
    });
  }
}

function renderAuthSlot(navElement, user, supabase) {
  let slot = navElement.querySelector(".auth-slot");
  if (!slot) {
    slot = document.createElement("div");
    slot.className = "auth-slot";
    navElement.appendChild(slot);
  }

  if (!user) {
    slot.innerHTML = `<a class="nav-auth-link" href="/login">Sign In</a>`;
    return;
  }

  const avatarLabel = escapeHtml((user.name || user.email || "VibeFix User").slice(0, 1).toUpperCase());
  const avatarMarkup = user.avatar
    ? `<img src="${escapeAttr(user.avatar)}" alt="" />`
    : `<span class="avatar-fallback">${avatarLabel}</span>`;

  slot.innerHTML = `
    <button class="avatar-button" type="button" aria-expanded="false" aria-label="Open account menu">
      ${avatarMarkup}
    </button>
    <div class="avatar-menu" hidden>
      <a href="/dashboard">Dashboard</a>
      <button type="button" class="menu-action signout-action">Sign out</button>
    </div>
  `;

  const button = slot.querySelector(".avatar-button");
  const menu = slot.querySelector(".avatar-menu");
  const signOut = slot.querySelector(".signout-action");

  if (button && menu) {
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      menu.hidden = expanded;
    });
  }

  if (signOut) {
    signOut.addEventListener("click", async () => {
      if (supabase) {
        await supabase.auth.signOut().catch(() => {});
      }

      window.location.href = "/auth/signout";
    });
  }
}

async function syncWorkerSession(accessToken) {
  await fetch("/api/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken })
  }).catch(() => {});
}

function mapSupabaseUser(user) {
  return {
    googleId: user.id,
    email: user.email || "",
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "VibeFix User",
    avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || ""
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
