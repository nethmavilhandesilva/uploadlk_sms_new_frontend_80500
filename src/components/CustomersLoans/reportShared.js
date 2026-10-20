// Shared helpers and styles for the customer opening balance section and the
// customer balance / statement reports.
import { useEffect } from 'react';

export const SHOP = {
    name: 'DUMINDA VEGETABLE & FRUITS SUPPLIER',
    address: 'Kalpitiya Road, Daluwa, Puttalam.',
    phones: '0725879432 / 0718989734',
};

export const money = (value) =>
    Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Colour for a balance: customers' positive balance is credit (green), negative is
// owed (red); suppliers' positive balance is owed (red).
export const balanceClass = (value, party) => {
    if (!value) return '';
    const good = party?.positiveIsCredit ? value > 0 : value < 0;
    return good ? 'cr-neg' : 'cr-pos';
};

export const todayLocal = () => new Date().toLocaleDateString('en-CA');

export const apiError = (err, fallback) => {
    const errors = err?.response?.data?.errors;
    if (errors) return Object.values(errors).flat().join(' ');
    return err?.response?.data?.message || fallback;
};

// body is a centring flexbox app-wide; stretch #root while a report page is open.
export const useFullWidthRoot = () => {
    useEffect(() => {
        const root = document.getElementById('root');
        if (!root) return undefined;
        const previous = root.style.width;
        root.style.width = '100%';
        return () => { root.style.width = previous; };
    }, []);
};

// Scoped to .cr-page / .cr-panel so the app's global green table styles don't leak in.
export const REPORT_CSS = `
.cr-page { background:#f1f5f9 !important; min-height:100vh; padding:20px; color:#1f2937; }
.cr-panel { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:16px; box-shadow:0 4px 14px rgba(15,23,42,.05); color:#1f2937; }
.cr-head { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }
.cr-title { font-size:1.4rem; font-weight:800; margin:0; color:#1f2937 !important; }
.cr-sub { color:#6b7280; font-size:.85rem; }
.cr-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:end; margin-bottom:12px; }
.cr-toolbar label { display:block; font-size:.72rem; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:.4px; margin-bottom:3px; }
.cr-input { border:1px solid #d1d5db !important; border-radius:8px !important; padding:7px 10px !important; background:#fff !important; color:#111827 !important; font-size:.95rem; }
.cr-input:focus { outline:none; border-color:#4f46e5 !important; box-shadow:0 0 0 3px rgba(79,70,229,.15) !important; }
.cr-btn { border:0 !important; border-radius:8px !important; padding:8px 14px !important; font-weight:700 !important; cursor:pointer; transition:filter .15s, transform .1s; }
.cr-btn:hover:not(:disabled) { filter:brightness(1.07); transform:translateY(-1px); }
.cr-btn:disabled { opacity:.55; cursor:not-allowed; }
.cr-btn.primary { background:#4f46e5 !important; color:#fff !important; }
.cr-btn.green { background:#16a34a !important; color:#fff !important; }
.cr-btn.ghost { background:#e5e7eb !important; color:#1f2937 !important; }
.cr-btn.dark { background:#1f2937 !important; color:#fff !important; }
.cr-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-bottom:12px; }
.cr-card { border:1px solid #e5e7eb; border-radius:12px; padding:10px 12px; background:#fff; }
.cr-card .lbl { font-size:.7rem; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; }
.cr-card .val { font-size:1.2rem; font-weight:800; font-variant-numeric:tabular-nums; }
.cr-table-wrap { overflow:auto; max-height:65vh; border:1px solid #e5e7eb; border-radius:10px; }
.cr-table { width:100%; border-collapse:collapse !important; background:#fff !important; }
.cr-table th { position:sticky; top:0; background:#f8fafc !important; color:#475569 !important; font-size:.72rem !important; text-transform:uppercase; letter-spacing:.5px;
  font-weight:800 !important; padding:9px 10px !important; border:0 !important; border-bottom:1px solid #e5e7eb !important; text-align:left; white-space:nowrap; z-index:1; }
.cr-table th.sortable { cursor:pointer; user-select:none; } .cr-table th.sortable:hover { color:#4f46e5 !important; }
.cr-table td { padding:8px 10px !important; border:0 !important; border-bottom:1px solid #f1f5f9 !important; color:#1f2937 !important; background:transparent !important; font-size:.92rem; vertical-align:middle; }
.cr-table tbody tr.click { cursor:pointer; } .cr-table tbody tr.click:hover td { background:#eef2ff !important; }
.cr-table tfoot td { font-weight:800; border-top:2px solid #cbd5e1 !important; background:#f8fafc !important; }
.cr-table .r { text-align:right; font-variant-numeric:tabular-nums; } .cr-table .c { text-align:center; }
.cr-pos { color:#dc2626 !important; font-weight:800; } .cr-neg { color:#16a34a !important; font-weight:800; } .cr-muted { color:#9ca3af !important; }
.cr-table td.cr-pos { color:#dc2626 !important; } .cr-table td.cr-neg { color:#16a34a !important; } .cr-table td.cr-muted, .cr-table .cr-muted { color:#9ca3af !important; }
.cr-pill { display:inline-block; border-radius:999px; padding:1px 9px; font-size:.72rem; font-weight:700; }
.cr-pill.blue { background:#e0e7ff; color:#4338ca; } .cr-pill.gray { background:#f1f5f9; color:#475569; } .cr-pill.amber { background:#fef3c7; color:#b45309; }
.cr-pill.green { background:#dcfce7; color:#15803d; } .cr-pill.red { background:#fee2e2; color:#b91c1c; }
.cr-print-head { display:none; text-align:center; margin-bottom:10px; }
.cr-print-head .shop { font-size:18px; font-weight:900; } .cr-print-head .line { font-size:12px; }
.cr-msg { border-radius:8px; padding:8px 12px; font-weight:600; margin-bottom:10px; }
.cr-msg.ok { background:#dcfce7; color:#15803d; } .cr-msg.err { background:#fee2e2; color:#b91c1c; }
@media print {
  @page { size:A4; margin:12mm; }
  body * { visibility:hidden; }
  .cr-printable, .cr-printable * { visibility:visible; }
  .cr-printable { position:absolute; left:0; top:0; width:100%; }
  .no-print { display:none !important; }
  .cr-print-head { display:block; }
  .cr-page { background:#fff !important; padding:0; }
  .cr-panel { border:0; box-shadow:none; padding:0; }
  .cr-table-wrap { max-height:none; overflow:visible; border:0; }
  .cr-table th { position:static; }
  .cr-table td, .cr-table th { font-size:11px !important; padding:4px 6px !important; border-bottom:1px solid #ddd !important; }
}
`;
