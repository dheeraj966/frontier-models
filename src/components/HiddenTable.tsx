/**
 * Screen-reader-accessible data table mirroring what an SVG chart shows.
 * Charts are invisible to assistive tech; this is the textual alternative.
 *
 * The clip lives on a wrapping <div>: tables ignore `width: 1px` / `overflow`,
 * so a visually-hidden <table> still lays out at full width and widened the
 * page (the horizontal "slide" on Bars / Scatter / Radar on narrow screens).
 */
export default function HiddenTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: (string | number | null)[][];
}) {
  return (
    <div className="visually-hidden">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {cell ?? '—'}
                  </th>
                ) : (
                  <td key={j}>{cell ?? '—'}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
