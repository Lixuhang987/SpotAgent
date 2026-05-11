export interface BubbleItem {
  id: string;
  text: string;
  kind?: "user" | "assistant";
}

interface BubbleListProps {
  items: BubbleItem[];
}

export function BubbleList({ items }: BubbleListProps) {
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
