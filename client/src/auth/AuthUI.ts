import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type OnSuccess = (session: Session) => void;

const CSS = `
  #auth-overlay {
    position: fixed;
    inset: 0;
    background: #1a1a2e;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', monospace;
    z-index: 1000;
  }
  #auth-card {
    width: 360px;
    background: #16213e;
    border: 2px solid #00ff88;
    padding: 2rem;
    color: #fff;
  }
  #auth-card h1 {
    text-align: center;
    letter-spacing: 8px;
    color: #00ff88;
    margin: 0 0 1.5rem;
    font-size: 2rem;
  }
  .auth-tabs {
    display: flex;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid #333;
  }
  .auth-tab {
    flex: 1;
    background: none;
    border: none;
    color: #666;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    padding: 0.5rem;
    cursor: pointer;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .auth-tab.active {
    color: #00ff88;
    border-bottom: 2px solid #00ff88;
  }
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .auth-form input {
    background: #0f3460;
    border: 1px solid #333;
    color: #fff;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    padding: 0.6rem 0.75rem;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }
  .auth-form input:focus { border-color: #00ff88; }
  .auth-form input::placeholder { color: #555; }
  .auth-form button[type="submit"] {
    background: #00ff88;
    border: none;
    color: #1a1a2e;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 2px;
    padding: 0.65rem;
    cursor: pointer;
    margin-top: 0.5rem;
    text-transform: uppercase;
    width: 100%;
  }
  .auth-form button[type="submit"]:hover { background: #00cc6a; }
  .auth-form button[type="submit"]:disabled { background: #333; color: #555; cursor: not-allowed; }
  #auth-error {
    color: #ff4444;
    font-size: 12px;
    text-align: center;
    margin-top: 0.75rem;
    min-height: 1rem;
  }
`;

const HTML = `
  <div id="auth-card">
    <h1>ONYX</h1>
    <div class="auth-tabs">
      <button class="auth-tab active" data-tab="login">Login</button>
      <button class="auth-tab" data-tab="register">Register</button>
    </div>

    <form id="login-form" class="auth-form">
      <input type="email" name="email" placeholder="Email" required />
      <input type="password" name="password" placeholder="Password" required />
      <button type="submit">Enter</button>
    </form>

    <form id="register-form" class="auth-form" style="display:none">
      <input type="text" name="username" placeholder="Username" required minlength="3" maxlength="20" />
      <input type="email" name="email" placeholder="Email" required />
      <input type="password" name="password" placeholder="Password" required minlength="6" />
      <button type="submit">Create Account</button>
    </form>

    <p id="auth-error"></p>
  </div>
`;

export class AuthUI {
  private overlay: HTMLDivElement;
  private styleEl: HTMLStyleElement;

  constructor(private onSuccess: OnSuccess) {
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    this.overlay = document.createElement("div");
    this.overlay.id = "auth-overlay";
    this.overlay.innerHTML = HTML;
    document.body.appendChild(this.overlay);

    this.attachListeners();
  }

  private attachListeners() {
    const loginForm = this.overlay.querySelector<HTMLFormElement>("#login-form")!;
    const registerForm = this.overlay.querySelector<HTMLFormElement>("#register-form")!;
    const tabs = this.overlay.querySelectorAll<HTMLButtonElement>(".auth-tab");
    const errorEl = this.overlay.querySelector<HTMLParagraphElement>("#auth-error")!;

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        errorEl.textContent = "";
        const isLogin = tab.dataset.tab === "login";
        loginForm.style.display = isLogin ? "flex" : "none";
        registerForm.style.display = isLogin ? "none" : "flex";
      });
    });

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      const btn = loginForm.querySelector<HTMLButtonElement>("button[type=submit]")!;
      btn.disabled = true;
      errorEl.textContent = "";

      const { data, error } = await supabase.auth.signInWithPassword({
        email: fd.get("email") as string,
        password: fd.get("password") as string,
      });

      if (error || !data.session) {
        errorEl.textContent = error?.message ?? "Login failed";
        btn.disabled = false;
        return;
      }

      this.destroy();
      this.onSuccess(data.session);
    });

    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(registerForm);
      const btn = registerForm.querySelector<HTMLButtonElement>("button[type=submit]")!;
      btn.disabled = true;
      errorEl.textContent = "";

      const { data, error } = await supabase.auth.signUp({
        email: fd.get("email") as string,
        password: fd.get("password") as string,
        options: { data: { username: (fd.get("username") as string).trim() } },
      });

      if (error || !data.session) {
        errorEl.textContent = error?.message ?? "Registration failed";
        btn.disabled = false;
        return;
      }

      this.destroy();
      this.onSuccess(data.session);
    });
  }

  destroy() {
    this.overlay.remove();
    this.styleEl.remove();
  }
}
