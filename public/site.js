const revealElements = document.querySelectorAll(".reveal");

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
  fetch("/api/me", { cache: "no-store" })
    .then((response) => response.json())
    .then((user) => {
      const slot = nav.querySelector(".auth-slot") || document.createElement("div");
      slot.className = "auth-slot";

      if (!user) {
        slot.innerHTML = `<a class="nav-auth-link" href="/auth/google">Sign In</a>`;
      } else {
        slot.innerHTML = `
          <button class="avatar-button" type="button" aria-expanded="false">
            <img src="${user.avatar}" alt="" />
          </button>
          <div class="avatar-menu" hidden>
            <a href="/dashboard">Dashboard</a>
            <a href="/auth/signout">Sign out</a>
          </div>
        `;
      }

      if (!slot.parentElement) nav.appendChild(slot);

      const button = slot.querySelector(".avatar-button");
      const menu = slot.querySelector(".avatar-menu");
      if (button && menu) {
        button.addEventListener("click", () => {
          const expanded = button.getAttribute("aria-expanded") === "true";
          button.setAttribute("aria-expanded", String(!expanded));
          menu.hidden = expanded;
        });
      }
    })
    .catch(() => {});
}
