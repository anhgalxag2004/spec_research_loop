import type { SpecCard } from "@/lib/api";

interface Props {
  cards: SpecCard[];
}

export function CardList({ cards }: Props) {
  return (
    <div className="grid two">
      {cards.map((card, index) => (
        <article className="card" key={`${card.type}-${index}`}>
          <h3>{card.type}</h3>
          <p>{card.content}</p>
          <span className="tag">{card.status}</span>
        </article>
      ))}
    </div>
  );
}
