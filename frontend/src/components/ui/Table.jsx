/** Responsive data table. Wraps in a horizontal scroller on narrow screens. */
export function Table({ children, className = '' }) {
  return (
    <div className={`-mx-5 overflow-x-auto scroll-quiet px-5 ${className}`}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ columns }) {
  return (
    <thead>
      <tr className="border-b border-slate-200">
        {columns.map((col, i) => (
          <th
            key={col.key ?? i}
            scope="col"
            className={`px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide ${
              col.align === 'right' ? 'text-right' : 'text-left'
            }`}
          >
            {col.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function Td({ children, className = '', align = 'left' }) {
  return (
    <td
      className={`px-3 py-3 text-slate-700 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      {children}
    </td>
  );
}

export function TBody({ rows, renderRow, empty }) {
  if (!rows?.length) return null;
  return <tbody className="divide-y divide-slate-100">{rows.map(renderRow)}</tbody>;
}
