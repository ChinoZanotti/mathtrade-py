import type { ReactNode } from 'react';

// Formateo liviano de la descripción que escribe el admin (texto plano, sin markdown):
// - líneas que empiezan con "* ", "- " o "• " → lista
// - líneas cortas en MAYÚSCULAS (pueden empezar con emoji) → subtítulo
// - el resto → párrafo
// Todo se renderiza como nodos React (texto escapado), nunca con innerHTML.

const BULLET = /^\s*[*\-•]\s+(.*)$/;

function isHeading(line: string): boolean {
  return line.length <= 60 && /\p{L}/u.test(line) && line === line.toUpperCase();
}

export function renderDescription(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    out.push(
      <ul key={out.length}>
        {list.map((li, i) => (
          <li key={i}>{li}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushPara = () => {
    if (!para.length) return;
    out.push(<p key={out.length}>{para.join('\n')}</p>);
    para = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = BULLET.exec(raw);
    if (!line) {
      flushList();
      flushPara();
    } else if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (isHeading(line)) {
      flushList();
      flushPara();
      out.push(
        <h3 key={out.length} className="event-desc-h">
          {line}
        </h3>,
      );
    } else {
      flushList();
      para.push(line);
    }
  }
  flushList();
  flushPara();
  return out;
}

export default function EventDescription({ text, status }: { text: string; status: string }) {
  return (
    <section className={`card event-desc stage-${status}`} aria-labelledby="event-desc-title">
      <h2 id="event-desc-title">Sobre el evento</h2>
      {renderDescription(text)}
    </section>
  );
}
