/** Placeholders con forma de tarjeta de juego mientras cargan los datos. */
export default function SkeletonItems({ count = 4, label = 'Cargando…' }: { count?: number; label?: string }) {
  return (
    <div className="stack" aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="item skeleton" aria-hidden>
          <div className="thumb sk" />
          <div className="item-body">
            <div className="sk sk-line" style={{ width: `${55 - (i % 3) * 10}%` }} />
            <div className="sk-pills">
              <span className="sk sk-pill" />
              <span className="sk sk-pill" />
            </div>
            <div className="sk sk-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}
