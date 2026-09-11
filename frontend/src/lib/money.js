/**
 * Rupee formatting shared by the finance screens. The Indian grouping puts the
 * first separator after three digits and every two after that, so 100000 reads
 * as 1,00,000 rather than 100,000.
 */
export const formatMoney = (value) =>
  Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

export const formatRupees = (value) => `₹${formatMoney(value)}`;

/** Compact form for headline figures, where the paise add noise. */
export const formatRupeesShort = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** 'YYYY-MM' to 'September 2026'. */
export const formatPeriod = (period) => {
  if (!period) return '';
  const [year, month] = String(period).slice(0, 7).split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

/** 'YYYY-MM-DD' to '10 Sep 2026'. Dates arrive as plain strings from the API. */
export const formatDay = (value) => {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** The current month as 'YYYY-MM'. */
export const currentPeriod = () => new Date().toISOString().slice(0, 7);
