// Shared class strings so buttons, inputs and cards stay consistent across
// server and client components. Keep this file free of React code: client
// components import these constants directly.

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-50 disabled:text-slate-500";

export const inputErrorClass = "border-red-300 focus:border-red-500";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60";

export const btnPrimary = `${base} bg-primary text-white shadow-sm hover:bg-primary-hover focus-visible:ring-primary`;

export const btnSecondary = `${base} border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:text-slate-900 focus-visible:ring-slate-900`;

export const btnDanger = `${base} bg-red-600 text-white shadow-sm hover:bg-red-500 focus-visible:ring-red-500`;

export const btnDangerOutline = `${base} border border-red-300 bg-white text-red-700 hover:border-red-400 hover:bg-red-50 focus-visible:ring-red-500`;

export const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8";

export const emptyStateClass =
  "rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center";
