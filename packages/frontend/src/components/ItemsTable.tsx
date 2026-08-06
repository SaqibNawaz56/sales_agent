import type { DraftItem } from "../api";

/**
 * The line items of a sale awaiting confirmation.
 *
 * Every figure comes from the server's draft. Nothing is computed here: a total
 * calculated in the browser could disagree with the one about to be written,
 * and the owner would be approving the wrong number.
 */
export function ItemsTable({ items }: { items: DraftItem[] }) {
  return (
    <table className="items">
      <thead>
        <tr>
          <th>Item</th>
          <th className="num">Qty</th>
          <th className="num">Price</th>
          <th className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={`${item.product}-${index}`}>
            <td>{item.product}</td>
            <td className="num">
              {item.quantity ?? "—"} {item.unit ?? ""}
            </td>
            <td className="num">{item.unitPrice ?? "—"}</td>
            <td className="num">{item.lineTotal ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
