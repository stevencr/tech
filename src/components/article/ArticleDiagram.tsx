type ArticleDiagramItem = {
  title: string;
  description: string;
};

type ArticleDiagramProps = {
  items: ArticleDiagramItem[];
};

export function ArticleDiagram({ items }: ArticleDiagramProps) {
  return (
    <div className="diagram">
      {items.map((item) => (
        <div key={item.title}>
          <strong>{item.title}</strong>
          <small>{item.description}</small>
        </div>
      ))}
    </div>
  );
}
