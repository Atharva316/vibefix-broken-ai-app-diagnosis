(async () => {
  const status = document.getElementById("status");
  const signinTab = document.getElementById("signin-tab");
  const signupTab = document.getElementById("signup-tab");
  const signinForm = document.getElementById("signin-form");
  const signupForm = document.getElementById("signup-form");
  const googleButton = document.getElementById("google-button");

  const setStatus = (message, kind = "") => {
    if (!status) return;
    status.textContent = message;
    status.className = `status${kind ? ` ${kind}` : ""}`;
  };

  const setMode = (mode) => {
    const isSignup = mode === "signup";
    signinTab?.setAttribute("aria-selected", String(!isSignup));
    signupTab?.setAttribute("aria-selected", String(isSignup));
    signinForm?.classList.toggle("hidden", isSignup);
    signupForm?.classList.toggle("hidden", !isSignup);
    setStatus("");
  };

  signinTab?.addEventListener("click", () => setMode("signin"));
  signupTab?.addEventListener("click", () => setMode("signup"));

  const config = await fetch("/api/config", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);

  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    setStatus("Supabase config is missing. Please add the public URL and anon key first.", "error");
    googleButton?.setAttribute("disabled", "true");
    signinForm?.querySelector("button[type='submit']")?.setAttribute("disabled", "true");
    signupForm?.querySelector("button[type='submit']")?.setAttribute("disabled", "true");
    return;
  }

  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      flowType: "pkce"
    }
  });

  const exchangeSession = async (session) => {
    if (!session?.access_token) return false;

    const response = await fetch("/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: session.access_token })
    });

    return response.ok;
  };

  const redirectIfAuthed = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return false;

    setStatus("Syncing your session into VibeFix...", "success");
    const exchanged = await exchangeSession(data.session);
    if (exchanged) {
      window.location.href = "/dashboard";
      return true;
    }

    setStatus("Your login was created, but the app session sync failed. Try refreshing once.", "error");
    return false;
  };

  googleButton?.addEventListener("click", async () => {
    setStatus("Redirecting to Google...", "");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login`
      }
    });

    if (error) {
      setStatus(error.message || "Could not start Google sign-in.", "error");
    }
  });

  signinForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("signin-email").value.trim();
    const password = document.getElementById("signin-password").value;

    setStatus("Signing you in...", "");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus(error.message || "Could not sign you in.", "error");
      return;
    }

    if (data?.session && await exchangeSession(data.session)) {
      window.location.href = "/dashboard";
      return;
    }

    setStatus("You signed in, but the app session sync failed. Please refresh once.", "error");
  });

  signupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fullName = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;

    setStatus("Creating your account...", "");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/login`
      }
    });

    if (error) {
      setStatus(error.message || "Could not create your account.", "error");
      return;
    }

    if (data?.session && await exchangeSession(data.session)) {
      window.location.href = "/dashboard";
      return;
    }

    setStatus("Account created. Check your email if verification is enabled, then sign in here.", "success");
    setMode("signin");
  });

  if (window.location.hash === "#signup") {
    setMode("signup");
  }

  if (!(await redirectIfAuthed())) {
    setStatus("Sign in with email, create a new account, or continue with Google.", "");
  }
})();
