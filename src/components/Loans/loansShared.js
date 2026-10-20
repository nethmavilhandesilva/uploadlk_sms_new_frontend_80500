// Styles and helpers shared by the loans dashboards and the supplier entry screen.

export const formatAmount = (value) =>
    Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Page-scoped styles. The app's global CSS paints tables/buttons on every page,
// so everything here is prefixed with .csl-dashboard and forced with !important.
export const SCOPED_CSS = `
.csl-dashboard { --csl-ink:#1f2937; --csl-muted:#6b7280; --csl-line:#e5e7eb; --csl-brand:#4f46e5; --csl-brand2:#06b6d4;
  --csl-green:#16a34a; --csl-amber:#d97706; --csl-red:#dc2626; background:linear-gradient(180deg,#eef2ff 0,#f8fafc 260px) !important;
  color:var(--csl-ink) !important; font-family:inherit; }
.csl-dashboard *, .csl-dashboard *::before, .csl-dashboard *::after { box-sizing:border-box; }

.csl-hero { background:linear-gradient(120deg,var(--csl-brand) 0%,#7c3aed 55%,var(--csl-brand2) 100%) !important; color:#fff !important;
  border-radius:18px; padding:22px 26px; box-shadow:0 12px 30px rgba(79,70,229,.25); position:relative; overflow:hidden; animation:csl-fade .4s ease both; }
.csl-hero::after { content:''; position:absolute; right:-60px; top:-60px; width:220px; height:220px; border-radius:50%; background:rgba(255,255,255,.12); }
.csl-hero h3 { color:#fff !important; margin:0 !important; font-weight:800 !important; letter-spacing:.2px; }
.csl-hero p { color:rgba(255,255,255,.85) !important; margin:4px 0 0 !important; font-size:.9rem; }
.csl-glass-btn { background:rgba(255,255,255,.18) !important; color:#fff !important; border:1px solid rgba(255,255,255,.45) !important;
  border-radius:999px !important; padding:6px 16px !important; font-weight:600 !important; transition:all .2s !important; position:relative; z-index:1; }
.csl-glass-btn:hover { background:#fff !important; color:var(--csl-brand) !important; transform:translateY(-1px); }
.csl-glass-btn.spinning .material-icons { animation:csl-spin .8s linear infinite; }

.csl-kpi { background:#fff !important; border:1px solid var(--csl-line) !important; border-radius:16px !important; padding:18px !important;
  height:100%; cursor:pointer; position:relative; overflow:hidden; transition:transform .2s, box-shadow .2s, border-color .2s !important;
  animation:csl-rise .45s ease both; }
.csl-kpi::before { content:''; position:absolute; inset:0 0 auto 0; height:4px; background:var(--tone); }
.csl-kpi:hover { transform:translateY(-4px); box-shadow:0 14px 28px rgba(15,23,42,.12) !important; }
.csl-kpi.active { border-color:var(--tone) !important; box-shadow:0 0 0 3px color-mix(in srgb,var(--tone) 25%,transparent) !important; }
.csl-kpi-icon { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center;
  background:color-mix(in srgb,var(--tone) 14%,#fff); color:var(--tone); transition:transform .3s; }
.csl-kpi:hover .csl-kpi-icon { transform:scale(1.12) rotate(-6deg); }
.csl-kpi-label { color:var(--csl-muted) !important; font-size:.8rem; text-transform:uppercase; letter-spacing:.6px; font-weight:600; }
.csl-kpi-value { color:var(--tone) !important; font-size:1.55rem; font-weight:800; line-height:1.2; margin-top:6px; font-variant-numeric:tabular-nums; }
.csl-kpi-sub { color:var(--csl-muted) !important; font-size:.8rem; margin-top:2px; }

.csl-tabs { display:inline-flex; gap:4px; background:#fff; border:1px solid var(--csl-line); border-radius:999px; padding:4px; }
.csl-tab { border:0 !important; background:transparent !important; color:var(--csl-muted) !important; border-radius:999px !important;
  padding:8px 18px !important; font-weight:600 !important; transition:all .2s !important; }
.csl-tab:hover { color:var(--csl-brand) !important; background:#eef2ff !important; }
.csl-tab.active { background:var(--csl-brand) !important; color:#fff !important; box-shadow:0 6px 14px rgba(79,70,229,.3); }

.csl-panel { background:#fff !important; border:1px solid var(--csl-line) !important; border-radius:16px !important;
  box-shadow:0 4px 18px rgba(15,23,42,.05); padding:16px; animation:csl-fade .3s ease both; }
.csl-search { border-radius:999px !important; border:1px solid var(--csl-line) !important; padding:8px 16px 8px 38px !important;
  background:#f9fafb url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%239ca3af' viewBox='0 0 16 16'%3E%3Cpath d='M11.7 10.3a6.5 6.5 0 1 0-1.4 1.4l3.7 3.7 1.4-1.4-3.7-3.7zM6.5 11a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z'/%3E%3C/svg%3E") no-repeat 14px center !important;
  transition:all .2s !important; min-width:240px; }
.csl-search:focus { background-color:#fff !important; border-color:var(--csl-brand) !important; box-shadow:0 0 0 4px rgba(79,70,229,.15) !important; outline:none !important; }
.csl-chip { border:1px solid var(--csl-line) !important; background:#fff !important; color:var(--csl-ink) !important; border-radius:999px !important;
  padding:6px 14px !important; font-size:.85rem !important; font-weight:600 !important; transition:all .18s !important; }
.csl-chip:hover { border-color:var(--csl-brand) !important; color:var(--csl-brand) !important; transform:translateY(-1px); }
.csl-chip.active { background:var(--csl-ink) !important; color:#fff !important; border-color:var(--csl-ink) !important; }
.csl-chip .count { background:rgba(127,127,127,.18); border-radius:999px; padding:0 7px; margin-left:6px; font-size:.75rem; }

.csl-dashboard table { border-collapse:separate !important; border-spacing:0 !important; width:100%; background:transparent !important; }
.csl-dashboard th { text-align:left; background:#f8fafc !important; color:var(--csl-muted) !important; font-size:.75rem !important;
  text-transform:uppercase; letter-spacing:.6px; font-weight:700 !important; border:0 !important; border-bottom:1px solid var(--csl-line) !important;
  padding:10px 12px !important; position:sticky; top:0; z-index:1; user-select:none; }
.csl-dashboard th.sortable { cursor:pointer; transition:color .15s; }
.csl-dashboard th.sortable:hover, .csl-dashboard th.sorted { color:var(--csl-brand) !important; }
.csl-dashboard td { border:0 !important; border-bottom:1px solid #f1f5f9 !important; padding:10px 12px !important; background:transparent !important;
  color:var(--csl-ink); vertical-align:middle; }
.csl-dashboard tbody tr { transition:background .15s, box-shadow .15s; animation:csl-row .35s ease both; }
.csl-dashboard tbody tr.clickable { cursor:pointer; }
.csl-dashboard tbody tr.clickable:hover td { background:#f5f3ff !important; }
.csl-dashboard tbody tr.clickable:hover td:first-child { box-shadow:inset 4px 0 0 var(--csl-brand); }
.csl-dashboard tbody tr.selected td { background:#eef2ff !important; }
.csl-dashboard tbody tr.selected td:first-child { box-shadow:inset 4px 0 0 var(--csl-brand); }
.csl-dashboard tbody tr.due td { background:#fffbeb !important; }
.csl-dashboard tfoot td { font-weight:800; border-top:2px solid var(--csl-line) !important; }

.csl-avatar { width:38px; height:38px; border-radius:12px; display:inline-flex; align-items:center; justify-content:center; color:#fff;
  font-weight:800; font-size:.85rem; flex-shrink:0; box-shadow:0 4px 10px rgba(0,0,0,.12); }
.csl-bar { height:6px; border-radius:999px; background:#eef2f7; overflow:hidden; display:flex; margin-top:6px; width:150px; }
.csl-bar span { display:block; height:100%; transition:width .8s cubic-bezier(.2,.8,.2,1); }
.csl-bar .paid { background:linear-gradient(90deg,#22c55e,#16a34a); }
.csl-bar .pend { background:repeating-linear-gradient(45deg,#fbbf24 0 6px,#f59e0b 6px 12px); animation:csl-stripes 1s linear infinite; background-size:17px 17px; }

.csl-pill { display:inline-flex; align-items:center; gap:4px; border-radius:999px; padding:3px 10px; font-size:.75rem; font-weight:700; }
.csl-pill.green { background:#dcfce7; color:#15803d; } .csl-pill.amber { background:#fef3c7; color:#b45309; }
.csl-pill.red { background:#fee2e2; color:#b91c1c; } .csl-pill.gray { background:#f1f5f9; color:#475569; }
.csl-pill.blue { background:#e0e7ff; color:#4338ca; }
.csl-amt-red { color:var(--csl-red) !important; font-weight:800; } .csl-amt-green { color:var(--csl-green) !important; font-weight:600; }
.csl-amt-amber { color:var(--csl-amber) !important; font-weight:600; }

.csl-detail { position:sticky; top:12px; animation:csl-slide .35s cubic-bezier(.2,.8,.2,1) both; }
.csl-detail-head { background:linear-gradient(120deg,#111827,#374151) !important; color:#fff !important; border-radius:16px 16px 0 0;
  padding:16px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
.csl-detail-head .muted { color:rgba(255,255,255,.7) !important; font-size:.85rem; }
.csl-detail-body { background:#fff; border:1px solid var(--csl-line); border-top:0; border-radius:0 0 16px 16px; padding:16px; }
.csl-mini { border:1px solid var(--csl-line); border-radius:12px; padding:10px; text-align:center; transition:transform .2s; background:#fff; }
.csl-mini:hover { transform:translateY(-2px); }
.csl-mini .lbl { font-size:.72rem; color:var(--csl-muted); text-transform:uppercase; letter-spacing:.5px; font-weight:600; }
.csl-mini .val { font-weight:800; font-variant-numeric:tabular-nums; margin-top:2px; }

.csl-btn { border-radius:10px !important; font-weight:700 !important; padding:8px 16px !important; border:0 !important; transition:all .18s !important; }
.csl-btn:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.05); }
.csl-btn:active:not(:disabled) { transform:translateY(0) scale(.98); }
.csl-btn.primary { background:linear-gradient(120deg,#22c55e,#16a34a) !important; color:#fff !important; box-shadow:0 6px 14px rgba(22,163,74,.3); }
.csl-btn.ghost { background:#f1f5f9 !important; color:var(--csl-ink) !important; }
.csl-btn.light { background:rgba(255,255,255,.15) !important; color:#fff !important; }
.csl-act { border-radius:8px !important; font-size:.75rem !important; font-weight:700 !important; padding:4px 10px !important; border:1px solid transparent !important;
  transition:all .15s !important; margin-left:4px; }
.csl-act.clear { background:#dcfce7 !important; color:#15803d !important; } .csl-act.clear:hover { background:#16a34a !important; color:#fff !important; }
.csl-act.bounce { background:#fee2e2 !important; color:#b91c1c !important; } .csl-act.bounce:hover { background:#dc2626 !important; color:#fff !important; }
.csl-act.pending { background:#f1f5f9 !important; color:#475569 !important; } .csl-act.pending:hover { background:#475569 !important; color:#fff !important; }
.csl-act.del { background:transparent !important; color:#9ca3af !important; } .csl-act.del:hover { background:#fee2e2 !important; color:#dc2626 !important; }

.csl-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55) !important; backdrop-filter:blur(3px); z-index:1050;
  display:flex; align-items:center; justify-content:center; padding:16px; animation:csl-fade .2s ease both; }
.csl-modal { background:#fff; border-radius:20px; width:100%; max-width:520px; max-height:92vh; overflow:auto;
  box-shadow:0 30px 60px rgba(0,0,0,.3); animation:csl-pop .28s cubic-bezier(.2,.9,.3,1.2) both; }
.csl-modal-head { padding:18px 22px; border-bottom:1px solid var(--csl-line); display:flex; justify-content:space-between; align-items:center; }
.csl-modal-body { padding:18px 22px; } .csl-modal-foot { padding:14px 22px; border-top:1px solid var(--csl-line); display:flex; justify-content:flex-end; gap:8px; }
.csl-method { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px; }
.csl-method button { border:2px solid var(--csl-line) !important; background:#fff !important; color:var(--csl-ink) !important; border-radius:14px !important;
  padding:12px 6px !important; font-weight:700 !important; display:flex; flex-direction:column; align-items:center; gap:4px; transition:all .18s !important; }
.csl-method button:hover { border-color:#c7d2fe !important; transform:translateY(-2px); }
.csl-method button.active { border-color:var(--csl-brand) !important; background:#eef2ff !important; color:var(--csl-brand) !important;
  box-shadow:0 6px 16px rgba(79,70,229,.18); }
.csl-dashboard .form-control, .csl-modal .form-control { border-radius:10px !important; border:1px solid var(--csl-line) !important; padding:8px 12px !important;
  background:#f9fafb !important; color:var(--csl-ink) !important; transition:all .15s !important; }
.csl-dashboard .form-control:focus, .csl-modal .form-control:focus { background:#fff !important; border-color:var(--csl-brand) !important;
  box-shadow:0 0 0 4px rgba(79,70,229,.15) !important; }
.csl-modal label { font-weight:600; color:var(--csl-muted); font-size:.8rem; margin-bottom:4px; }
.csl-quick { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
.csl-quick button { border:1px dashed #c7d2fe !important; background:#fff !important; color:var(--csl-brand) !important; border-radius:999px !important;
  font-size:.75rem !important; padding:2px 10px !important; font-weight:600 !important; }
.csl-quick button:hover { background:#eef2ff !important; }

.csl-toast { position:fixed; right:20px; bottom:20px; z-index:2000; background:#111827; color:#fff; padding:12px 18px; border-radius:12px;
  box-shadow:0 12px 30px rgba(0,0,0,.25); display:flex; align-items:center; gap:8px; animation:csl-toast .3s cubic-bezier(.2,.9,.3,1.2) both; }
.csl-empty { text-align:center; padding:36px 12px !important; color:var(--csl-muted) !important; }
.csl-empty .material-icons { font-size:42px; opacity:.4; display:block; margin-bottom:6px; }
.csl-skel { height:14px; border-radius:6px; background:linear-gradient(90deg,#eef2f7 25%,#f8fafc 50%,#eef2f7 75%); background-size:200% 100%;
  animation:csl-shimmer 1.2s infinite; }

@keyframes csl-fade { from { opacity:0 } to { opacity:1 } }
@keyframes csl-rise { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
@keyframes csl-row { from { opacity:0; transform:translateX(-6px) } to { opacity:1; transform:none } }
@keyframes csl-slide { from { opacity:0; transform:translateX(24px) } to { opacity:1; transform:none } }
@keyframes csl-pop { from { opacity:0; transform:scale(.92) translateY(10px) } to { opacity:1; transform:none } }
@keyframes csl-toast { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } }
@keyframes csl-spin { to { transform:rotate(360deg) } }
@keyframes csl-stripes { to { background-position:17px 0 } }
@keyframes csl-shimmer { to { background-position:-200% 0 } }
@media (prefers-reduced-motion: reduce) { .csl-dashboard *, .csl-overlay, .csl-modal, .csl-toast { animation:none !important; transition:none !important; } }
`;

const AVATAR_COLORS = ['#4f46e5', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#059669', '#2563eb', '#9333ea'];
export const avatarColor = (code = '') => AVATAR_COLORS[[...code].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];

export const errorMessage = (err, fallback) => {
    const errors = err?.response?.data?.errors;
    if (errors) return Object.values(errors).flat().join(' ');
    return err?.response?.data?.message || fallback;
};
