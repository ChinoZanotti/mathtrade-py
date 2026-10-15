import type { ReactNode } from 'react';
import { conditionLabel } from '../lib/format';
import type { EventItem } from '../lib/types';

interface Props {
  item: EventItem;
  mine?: boolean;
  showOwner?: boolean;
  actions?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}

export default function ItemCard({ item, mine, showOwner = true, actions, onClick, selected }: Props) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`item ${selected ? 'selected' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
    >
      {item.thumbnail_url ? (
        <img src={item.thumbnail_url} alt="" loading="lazy" className="thumb" />
      ) : (
        <div className="thumb placeholder" aria-hidden>
          🎲
        </div>
      )}
      <div className="item-body">
        <div className="item-title">
          <a href={`https://boardgamegeek.com/boardgame/${item.bgg_id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            {item.title}
          </a>
          {item.year_published ? <span className="muted"> ({item.year_published})</span> : null}
        </div>
        <div className="chips">
          <span className="pill">{conditionLabel(item.condition)}</span>
          <span className="pill">{item.language}</span>
          {mine && <span className="pill mine">Tuyo</span>}
        </div>
        {item.notes && <p className="small muted">{item.notes}</p>}
        {showOwner && !mine && item.profiles?.display_name && <p className="small muted">de {item.profiles.display_name}</p>}
      </div>
      {actions && <div className="item-actions">{actions}</div>}
    </Tag>
  );
}
