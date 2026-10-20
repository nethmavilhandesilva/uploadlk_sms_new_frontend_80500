import React, { useState, useEffect } from "react";
import api from "../../api";
import { BASE_PATH } from '../../config';

const SHOP_NAME = "DUMINDA VEGETABLE & FRUITS SUPPLIER";

// Background vegetables that drift slowly behind the login card.
const FLOATERS = [
  { e: "🥕", top: "8%", left: "6%", size: 46, dur: 14, delay: 0 },
  { e: "🍅", top: "70%", left: "4%", size: 52, dur: 17, delay: 2 },
  { e: "🥬", top: "18%", left: "46%", size: 40, dur: 19, delay: 1 },
  { e: "🧅", top: "84%", left: "40%", size: 38, dur: 15, delay: 3 },
  { e: "🥔", top: "10%", left: "88%", size: 44, dur: 18, delay: 1.5 },
  { e: "🌶️", top: "55%", left: "92%", size: 40, dur: 13, delay: 0.5 },
  { e: "🍆", top: "88%", left: "80%", size: 48, dur: 20, delay: 2.5 },
  { e: "🥒", top: "40%", left: "2%", size: 36, dur: 16, delay: 4 },
  { e: "🍋", top: "4%", left: "64%", size: 34, dur: 21, delay: 3.5 },
];

const FEATURES = [
  { icon: "📦", title: "තොග / GRN", desc: "Stock in & GRN tracking" },
  { icon: "🧾", title: "විකුණුම් බිල්", desc: "Fast sales billing" },
  { icon: "🤝", title: "ණය ගිණුම්", desc: "Customer & supplier loans" },
  { icon: "📊", title: "දින වාර්තා", desc: "Day-end reports" },
];

// Hand-drawn market crate full of vegetables (inline so it works offline / on any host).
const VegetableCrate = () => (
  <svg className="vl-crate" viewBox="0 0 420 300" role="img" aria-label="Crate of fresh vegetables">
    <ellipse cx="210" cy="286" rx="185" ry="12" fill="rgba(0,0,0,.25)" />
    {/* carrots at the back */}
    <g className="vl-bob" style={{ animationDelay: "0s" }}>
      <path d="M92 150 L70 40 L112 142 Z" fill="#f97316" />
      <path d="M78 70 l14 -3 M82 92 l16 -3 M88 116 l14 -3" stroke="#c2410c" strokeWidth="3" strokeLinecap="round" />
      <path d="M70 40 q-14 -22 -4 -34 q6 14 10 26 q4 -18 16 -26 q0 18 -14 34 Z" fill="#16a34a" />
    </g>
    <g className="vl-bob" style={{ animationDelay: ".6s" }}>
      <path d="M318 150 L350 46 L334 152 Z" fill="#fb923c" />
      <path d="M345 70 l-13 -4 M341 94 l-14 -4" stroke="#c2410c" strokeWidth="3" strokeLinecap="round" />
      <path d="M350 46 q2 -24 18 -30 q-4 16 -10 28 q14 -10 26 -8 q-10 14 -34 10 Z" fill="#22c55e" />
    </g>
    {/* cabbage */}
    <g className="vl-bob" style={{ animationDelay: ".3s" }}>
      <circle cx="160" cy="132" r="54" fill="#4ade80" />
      <path d="M118 120 q42 -40 84 0 M124 146 q36 -30 72 0 M160 80 v104" stroke="#15803d" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M108 136 q-10 -44 30 -58 M212 136 q10 -44 -30 -58" stroke="#86efac" strokeWidth="5" fill="none" strokeLinecap="round" />
    </g>
    {/* eggplant */}
    <g className="vl-bob" style={{ animationDelay: ".9s" }}>
      <ellipse cx="268" cy="128" rx="30" ry="58" transform="rotate(28 268 128)" fill="#7c3aed" />
      <ellipse cx="258" cy="112" rx="8" ry="26" transform="rotate(28 258 112)" fill="#a78bfa" opacity=".55" />
      <path d="M292 76 l18 -26 M278 80 q16 -6 30 4 q-8 -16 -22 -16" fill="#15803d" stroke="#15803d" strokeWidth="5" strokeLinecap="round" />
    </g>
    {/* tomatoes in front */}
    {[{ x: 112, d: ".2s" }, { x: 210, d: ".7s" }, { x: 306, d: "1.1s" }].map((t) => (
      <g key={t.x} className="vl-bob" style={{ animationDelay: t.d }}>
        <circle cx={t.x} cy="176" r="34" fill="#ef4444" />
        <circle cx={t.x - 12} cy="164" r="9" fill="#fca5a5" opacity=".7" />
        <path d={`M${t.x} 146 l-12 -8 l10 2 l2 -10 l4 10 l10 -4 l-8 10 Z`} fill="#16a34a" />
      </g>
    ))}
    {/* chillies */}
    <path className="vl-bob" style={{ animationDelay: "1.4s" }} d="M150 196 q40 -14 70 14 q-36 -6 -64 4 Z" fill="#dc2626" />
    <path className="vl-bob" style={{ animationDelay: "1.6s" }} d="M244 198 q34 -18 68 4 q-32 0 -62 8 Z" fill="#16a34a" />
    {/* wooden crate */}
    <rect x="40" y="196" width="340" height="84" rx="8" fill="#a16207" />
    <rect x="40" y="196" width="340" height="18" rx="6" fill="#ca8a04" />
    <rect x="40" y="232" width="340" height="12" fill="#854d0e" />
    <rect x="56" y="214" width="14" height="66" fill="#854d0e" />
    <rect x="350" y="214" width="14" height="66" fill="#854d0e" />
    <rect x="160" y="250" width="100" height="24" rx="5" fill="#fef3c7" />
    <text x="210" y="267" textAnchor="middle" fontSize="14" fontWeight="800" fill="#854d0e">FRESH</text>
  </svg>
);

const LoginPage = () => {
  const [user_id, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [now, setNow] = useState(new Date());
  const [shakeKey, setShakeKey] = useState(0);

  // Sub-folder the app is served from (for full-page jumps) — see config.js.
  const basePath = BASE_PATH;

  useEffect(() => {
    const savedUserId = localStorage.getItem("remembered_user");
    if (savedUserId) {
      setUserId(savedUserId);
      setRememberMe(true);
    }
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await api.post("/login", {
        user_id,
        password,
      });

      if (response.data.token) {
        // Store token
        localStorage.setItem("token", response.data.token);

        // Store user data (important for role-based routing)
        if (response.data.user) {
          // Store user data in both formats for compatibility
          localStorage.setItem("user", JSON.stringify(response.data.user));
          localStorage.setItem("userData", JSON.stringify(response.data.user));
        }

        // Handle remember me
        if (rememberMe) {
          localStorage.setItem("remembered_user", user_id);
        } else {
          localStorage.removeItem("remembered_user");
        }

        // Redirect to root path so RootRedirect can handle role-based routing
        window.location.href = `${basePath}/`;
      } else {
        setError("Invalid credentials");
        setShakeKey((k) => k + 1);
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(err.response?.data?.message || "Login failed. Please check your credentials.");
      setShakeKey((k) => k + 1);
    } finally {
      setIsLoading(false);
    }
  };

  const checkCaps = (e) => setCapsOn(Boolean(e.getModifierState && e.getModifierState("CapsLock")));

  const hour = now.getHours();
  const greeting = hour < 12 ? "සුභ උදෑසනක්" : hour < 17 ? "සුභ දහවලක්" : "සුභ සන්ධ්‍යාවක්";
  const dateText = now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
  const timeText = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="vl-page">
      <style>{CSS}</style>

      {FLOATERS.map((f, i) => (
        <span
          key={i}
          className="vl-floater"
          aria-hidden="true"
          style={{ top: f.top, left: f.left, fontSize: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }}
        >
          {f.e}
        </span>
      ))}

      <div className="vl-card">
        {/* Left — market overview */}
        <section className="vl-brand">
          <div className="vl-brand-top">
            <span className="vl-badge">🌿 Stock Management System</span>
            <div className="vl-clock">
              <div className="vl-time">{timeText}</div>
              <div className="vl-date">{dateText}</div>
            </div>
          </div>

          <h1 className="vl-shop">{SHOP_NAME}</h1>
          <p className="vl-tag">එළවළු හා පළතුරු තොග කළමනාකරණ පද්ධතිය</p>

          <VegetableCrate />

          <div className="vl-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="vl-feature">
                <span className="vl-feature-icon">{f.icon}</span>
                <div>
                  <div className="vl-feature-title">{f.title}</div>
                  <div className="vl-feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right — sign in */}
        <section className="vl-form-side">
          <div className="vl-mobile-brand">
            <span className="vl-mobile-veg">🥕🍅🥬</span>
            <div className="vl-mobile-shop">{SHOP_NAME}</div>
          </div>

          <div className="vl-greet">{greeting} 👋</div>
          <h2 className="vl-welcome">Welcome back</h2>
          <p className="vl-sub">Sign in to manage today's stock, sales and loans.</p>

          {error && (
            <div key={shakeKey} className="vl-error" role="alert">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <label className="vl-label" htmlFor="vl-user">User ID</label>
            <div className="vl-field">
              <span className="vl-field-icon">👤</span>
              <input
                id="vl-user"
                type="text"
                className="vl-input"
                value={user_id}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Enter your user ID"
                autoComplete="username"
                autoFocus
                required
                disabled={isLoading}
              />
            </div>

            <label className="vl-label" htmlFor="vl-pass">Password</label>
            <div className="vl-field">
              <span className="vl-field-icon">🔒</span>
              <input
                id="vl-pass"
                type={showPassword ? "text" : "password"}
                className="vl-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={checkCaps}
                onKeyDown={checkCaps}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                disabled={isLoading}
              />
              <button type="button" className="vl-toggle" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {capsOn && <div className="vl-caps">⇪ Caps Lock is on</div>}

            <label className="vl-remember">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              <span>Remember me</span>
            </label>

            <button type="submit" className="vl-submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="vl-spinner" /> Signing in...
                </>
              ) : (
                <>Sign In <span className="vl-arrow">→</span></>
              )}
            </button>
          </form>

          <div className="vl-register">
            New user? <a href={`${basePath}/register`}>Create an account</a>
          </div>

          <div className="vl-foot">🌱 Fresh stock · Fair price · Fast billing</div>
        </section>
      </div>
    </div>
  );
};

const CSS = `
.vl-page {
  position: fixed; inset: 0; overflow: auto;
  display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box;
  font-family: 'Inter', 'Noto Sans Sinhala', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background:
    radial-gradient(circle at 15% 20%, rgba(250, 204, 21, .18), transparent 40%),
    radial-gradient(circle at 85% 80%, rgba(239, 68, 68, .14), transparent 40%),
    linear-gradient(135deg, #052e16 0%, #14532d 55%, #166534 100%);
}
.vl-page *, .vl-page *::before, .vl-page *::after { box-sizing: border-box; }
.vl-floater { position: absolute; opacity: .22; pointer-events: none; user-select: none;
  animation-name: vlDrift; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
@keyframes vlDrift {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  50% { transform: translate(18px, -26px) rotate(14deg); }
}

.vl-card { position: relative; z-index: 1; display: flex; width: 100%; max-width: 1040px; min-height: 620px;
  border-radius: 28px; overflow: hidden; box-shadow: 0 30px 80px rgba(0, 0, 0, .45); animation: vlRise .6s ease-out; }
@keyframes vlRise { from { opacity: 0; transform: translateY(24px) scale(.98); } to { opacity: 1; transform: none; } }

.vl-brand { flex: 1.15; padding: 32px 36px; color: #fff; display: flex; flex-direction: column;
  background: linear-gradient(160deg, #15803d 0%, #166534 60%, #14532d 100%); position: relative; }
.vl-brand::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(rgba(255,255,255,.08) 1.5px, transparent 1.5px); background-size: 22px 22px; }
.vl-brand > * { position: relative; z-index: 1; }
.vl-brand-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.vl-badge { background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.3); border-radius: 999px;
  padding: 6px 14px; font-size: 12px; font-weight: 700; letter-spacing: .4px; white-space: nowrap; }
.vl-clock { text-align: right; }
.vl-time { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; color: #fde047; }
.vl-date { font-size: 12px; opacity: .85; }
.vl-shop { font-size: 26px; font-weight: 900; line-height: 1.2; margin: 22px 0 6px; letter-spacing: .3px; color: #fff; }
.vl-tag { margin: 0; font-size: 15px; color: #bbf7d0; font-weight: 600; }
.vl-crate { width: 100%; max-width: 420px; margin: 14px auto 6px; display: block; }
.vl-bob { animation: vlBob 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes vlBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.vl-features { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: auto; }
.vl-feature { display: flex; gap: 10px; align-items: center; background: rgba(255,255,255,.1);
  border: 1px solid rgba(255,255,255,.16); border-radius: 14px; padding: 10px 12px; transition: transform .2s, background .2s; }
.vl-feature:hover { transform: translateY(-3px); background: rgba(255,255,255,.18); }
.vl-feature-icon { font-size: 24px; }
.vl-feature-title { font-weight: 800; font-size: 14px; }
.vl-feature-desc { font-size: 11.5px; opacity: .8; }

.vl-form-side { flex: 1; background: #fffdf5; padding: 44px 44px 28px; display: flex; flex-direction: column; justify-content: center; color: #1f2937; }
.vl-mobile-brand { display: none; text-align: center; margin-bottom: 18px; }
.vl-mobile-veg { font-size: 34px; letter-spacing: 6px; }
.vl-mobile-shop { font-weight: 900; color: #166534; font-size: 16px; margin-top: 4px; }
.vl-greet { display: inline-block; align-self: flex-start; background: #dcfce7; color: #166534; font-weight: 700;
  font-size: 13px; padding: 5px 12px; border-radius: 999px; }
.vl-welcome { font-size: 30px; font-weight: 900; margin: 12px 0 4px; color: #14532d; letter-spacing: -.5px; }
.vl-sub { margin: 0 0 22px; color: #6b7280; font-size: 14px; }
.vl-error { display: flex; gap: 8px; align-items: center; background: #fee2e2; color: #b91c1c; border-left: 4px solid #ef4444;
  border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 600; margin-bottom: 16px; animation: vlShake .4s; }
@keyframes vlShake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-8px); } 40%,80% { transform: translateX(8px); } }
.vl-label { display: block; font-size: 13px; font-weight: 700; color: #374151; margin: 0 0 6px; }
.vl-field { position: relative; margin-bottom: 16px; }
.vl-field-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 16px; pointer-events: none; }
.vl-input { width: 100%; padding: 13px 64px 13px 44px; font-size: 15px; border: 2px solid #e5e7eb; border-radius: 12px;
  background: #fff; color: #111827; outline: none; transition: border-color .2s, box-shadow .2s; font-family: inherit; }
.vl-input:focus { border-color: #16a34a; box-shadow: 0 0 0 4px rgba(22, 163, 74, .15); }
.vl-input:disabled { background: #f3f4f6; }
.vl-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); border: 0; background: #f0fdf4;
  color: #15803d; font-weight: 700; font-size: 12px; padding: 6px 10px; border-radius: 8px; cursor: pointer; }
.vl-toggle:hover { background: #dcfce7; }
.vl-caps { margin: -8px 0 12px; font-size: 12px; font-weight: 700; color: #b45309; }
.vl-remember { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #4b5563; cursor: pointer; margin-bottom: 20px; }
.vl-remember input { width: 16px; height: 16px; accent-color: #16a34a; cursor: pointer; }
.vl-submit { width: 100%; padding: 14px; border: 0; border-radius: 12px; cursor: pointer; font-size: 16px; font-weight: 800; color: #fff;
  background: linear-gradient(135deg, #16a34a, #15803d); box-shadow: 0 8px 20px rgba(22, 163, 74, .35);
  display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform .15s, box-shadow .15s, filter .15s; }
.vl-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(22, 163, 74, .45); filter: brightness(1.05); }
.vl-submit:hover:not(:disabled) .vl-arrow { transform: translateX(4px); }
.vl-submit:disabled { opacity: .75; cursor: not-allowed; }
.vl-arrow { display: inline-block; transition: transform .15s; }
.vl-spinner { width: 16px; height: 16px; border: 3px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: vlSpin .8s linear infinite; }
@keyframes vlSpin { to { transform: rotate(360deg); } }
.vl-register { text-align: center; margin-top: 18px; font-size: 13px; color: #6b7280; }
.vl-register a { color: #15803d; font-weight: 700; text-decoration: none; }
.vl-register a:hover { text-decoration: underline; }
.vl-foot { margin-top: 22px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px dashed #e5e7eb; padding-top: 14px; }

@media (max-width: 880px) {
  .vl-brand { display: none; }
  .vl-mobile-brand { display: block; }
  .vl-card { max-width: 460px; min-height: 0; }
  .vl-form-side { padding: 32px 24px 22px; }
}
@media (prefers-reduced-motion: reduce) {
  .vl-floater, .vl-bob, .vl-card, .vl-error { animation: none !important; }
}
`;

export default LoginPage;
