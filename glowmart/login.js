import { sb, initPage, showMsg, $ } from "./app.js";

const { user } = await initPage();

// Only allow redirects to our own pages
const rawNext = new URLSearchParams(location.search).get("next") || "";
const next = /^[a-z0-9_-]+\.html(\?[\w=&%-]*)?$/i.test(rawNext) ? rawNext : "index.html";

if (user) {
  location.replace(next);
} else {
  const loginForm = $("#loginForm");
  const signupForm = $("#signupForm");
  const tabLogin = $("#tabLogin");
  const tabSignup = $("#tabSignup");
  const msg = $("#msg");
  const waWrap = $("#waWrap");

  function showTab(which) {
    const login = which === "login";
    loginForm.hidden = !login;
    signupForm.hidden = login;
    tabLogin.setAttribute("aria-selected", String(login));
    tabSignup.setAttribute("aria-selected", String(!login));
    msg.hidden = true;
  }
  tabLogin.addEventListener("click", () => showTab("login"));
  tabSignup.addEventListener("click", () => showTab("signup"));
  if (location.hash === "#signup") showTab("signup");

  $("#role").addEventListener("change", (e) => {
    waWrap.hidden = e.target.value !== "seller";
    signupForm.elements.whatsapp.required = e.target.value === "seller";
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const fd = new FormData(loginForm);
    const { error } = await sb.auth.signInWithPassword({
      email: fd.get("email").trim(),
      password: fd.get("password")
    });
    if (error) showMsg(msg, error.message);
    else location.replace(next);
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const fd = new FormData(signupForm);
    const { data, error } = await sb.auth.signUp({
      email: fd.get("email").trim(),
      password: fd.get("password"),
      options: {
        data: {
          name: fd.get("name").trim(),
          role: fd.get("role"),
          whatsapp: (fd.get("whatsapp") || "").trim()
        },
        emailRedirectTo: new URL("index.html", location.href).href
      }
    });
    if (error) {
      showMsg(msg, error.message);
    } else if (data.session) {
      location.replace(next);
    } else {
      showMsg(msg, "Account created. Open the confirmation email we sent, then log in.", "ok");
    }
  });
}
