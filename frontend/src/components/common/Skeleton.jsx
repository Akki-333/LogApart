/**
 * Placeholders in the shape of what is loading, so the page does not jump when
 * the data lands. They pulse unless the reader has asked for less motion, and a
 * screen reader hears one "Loading" instead of a row of empty boxes.
 */

const bar = 'bg-slate-200/80 rounded-md animate-pulse motion-reduce:animate-none';

export function SkeletonBlock({ className = '' }) {
  return <div aria-hidden="true" className={`${bar} ${className}`} />;
}

/** Rows for the inside of a <tbody>, one cell per column. */
export function SkeletonRows({ rows = 5, columns = 5, label = 'Loading' }) {
  return Array.from({ length: rows }, (_, row) => (
    <tr key={row}>
      {Array.from({ length: columns }, (_, column) => (
        <td key={column} className="px-6 py-4">
          {row === 0 && column === 0 && <span role="status" className="sr-only">{label}</span>}
          <div aria-hidden="true" className={`${bar} h-3.5 ${column === 0 ? 'w-3/4' : 'w-1/2'}`} />
          {column === 0 && <div aria-hidden="true" className={`${bar} h-2.5 w-1/3 mt-2`} />}
        </td>
      ))}
    </tr>
  ));
}

/** A stack of list rows or cards. */
export function SkeletonList({ rows = 4, label = 'Loading', className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      <span role="status" className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden="true" className="flex items-center gap-3">
          <div className={`${bar} w-10 h-10 rounded-xl shrink-0`} />
          <div className="flex-1 space-y-2">
            <div className={`${bar} h-3.5 w-2/3`} />
            <div className={`${bar} h-2.5 w-1/3`} />
          </div>
        </div>
      ))}
    </div>
  );
}
