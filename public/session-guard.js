// Paste this at the top of any protected page or include it as a script block.
(async () => {
  const SUPABASE_URL = "https://fraufatburxkfynjbidq.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyYXVmYXRidXJ4a2Z5bmpiaWRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NTU3NTgsImV4cCI6MjA5NjEzMTc1OH0.OXbuf7O9vbyYLaTKFZA99Rw3_j_E4-LqcXyRH3heQB0";
  const SUPABASE = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: "pkce" }
  });

  async function exchangeSession(session) {
    if (!session?.access_token) return false;
    const response = await fetch("/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: session.access_token })
    });
    return response.ok;
  }

  const { data } = await SUPABASE.auth.getSession();
  if (!data?.session) {
    window.location.replace("/login.html");
    return;
  }

  await exchangeSession(data.session);

  const userEmail = data.session.user?.email || "";
  const nav = document.querySelector(".site-nav, nav");
  if (nav) {
    let slot = nav.querySelector(".auth-slot");
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "auth-slot";
      nav.appendChild(slot);
    }
    slot.innerHTML = `
      <span class="nav-user-email">${userEmail}</span>
      <button type="button" class="logout-button">Logout</button>
    `;

    const logoutButton = slot.querySelector(".logout-button");
    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        await SUPABASE.auth.signOut();
        window.location.replace("/index.html");
      });
    }
  }
})();
