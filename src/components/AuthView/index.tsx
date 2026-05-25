import { useState } from "react";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader } from "lucide-react";
import { supabase } from "../../utils/supabase";
import LogoMark from "../LogoMark";
import "./style.scss";

type Mode = "signin" | "signup";

export default function AuthView() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = (nextMode: Mode) => {
    setMode(nextMode);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setNotice("Check your email and click the confirmation link to finish signing up.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        // App.tsx onAuthStateChange will detect SIGNED_IN and unmount this view
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <LogoMark size={48} variant="lg" />
          <h1 className="auth__title">
            ChatMyDocs<span className="auth__title-accent">.ai</span>
          </h1>
          <p className="auth__tagline">Chat with your documents. Get smart, cited answers.</p>
        </div>

        <div className="auth__tabs">
          <button
            className={`auth__tab${mode === "signin" ? " auth__tab--active" : ""}`}
            onClick={() => reset("signin")}
          >
            Sign in
          </button>
          <button
            className={`auth__tab${mode === "signup" ? " auth__tab--active" : ""}`}
            onClick={() => reset("signup")}
          >
            Create account
          </button>
        </div>

        <form className="auth__form" onSubmit={handleSubmit} noValidate>
          <div className="auth__field">
            <label className="auth__label" htmlFor="auth-email">Email</label>
            <div className="auth__input-wrap">
              <Mail size={15} className="auth__input-icon" />
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="auth__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="auth__field">
            <label className="auth__label" htmlFor="auth-password">Password</label>
            <div className="auth__input-wrap">
              <Lock size={15} className="auth__input-icon" />
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                placeholder={mode === "signup" ? "Min. 6 characters" : "Your password"}
                className="auth__input auth__input--password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="auth__password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && <p className="auth__error">{error}</p>}
          {notice && <p className="auth__notice">{notice}</p>}

          <button type="submit" className="auth__submit" disabled={loading}>
            {loading
              ? <Loader size={16} className="auth__spinner" />
              : <><span>{mode === "signin" ? "Sign in" : "Create account"}</span><ArrowRight size={15} /></>
            }
          </button>
        </form>

        <p className="auth__footer">
          {mode === "signin" ? (
            <>{"Don't have an account? "}<button className="auth__footer-link" onClick={() => reset("signup")}>Sign up free</button></>
          ) : (
            <>{"Already have an account? "}<button className="auth__footer-link" onClick={() => reset("signin")}>Sign in</button></>
          )}
        </p>
      </div>
    </div>
  );
}
