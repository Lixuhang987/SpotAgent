export interface BubbleItem {
  id: string;
  text: string;
  kind: "user" | "assistant";
}

interface BubbleListProps {
  items: BubbleItem[];
}

export function BubbleList({ items }: BubbleListProps) {
  if (items.length === 0) {
    return (
      <section aria-label="bubbles">
        <p>按全局热键可唤起输入框</p>
      </section>
    );
  }

  return (
    <section aria-label="bubbles">
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.kind === "user" ? "你" : "Agent"}</strong>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
