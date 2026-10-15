import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { CONDITIONS, LANGUAGES } from '../lib/format';
import type { BggResult, EventItem, TradeEvent } from '../lib/types';
import BggSearch from '../components/BggSearch';
import ItemCard from '../components/ItemCard';

interface Draft {
  bgg_id: number;
  title: string;
  year_published: number | null;
  thumbnail_url: string | null;
  condition: string;
  language: string;
  notes: string;
}

export default function ListingStage({ event, userId }: { event: TradeEvent; userId: string }) {
  const [items, setItems] = useState<EventItem[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('event_items')
      .select('*')
      .eq('event_id', event.id)
      .eq('owner_id', userId)
      .order('created_at');
    if (error) return setError(error.message);
    setItems(data as EventItem[]);
  }, [event.id, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function pick(g: BggResult) {
    setEditingId(null);
    setDraft({
      bgg_id: g.id,
      title: g.name,
      year_published: g.year,
      thumbnail_url: g.thumbnail,
      condition: '',
      language: '',
      notes: '',
    });
  }

  function edit(it: EventItem) {
    setEditingId(it.id);
    setDraft({
      bgg_id: it.bgg_id,
      title: it.title,
      year_published: it.year_published,
      thumbnail_url: it.thumbnail_url,
      condition: it.condition,
      language: it.language,
      notes: it.notes,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    const { error } = editingId
      ? await supabase
          .from('event_items')
          .update({ condition: draft.condition, language: draft.language, notes: draft.notes.trim() })
          .eq('id', editingId)
      : await supabase.from('event_items').insert({
          event_id: event.id,
          owner_id: userId,
          bgg_id: draft.bgg_id,
          title: draft.title,
          year_published: draft.year_published,
          thumbnail_url: draft.thumbnail_url,
          condition: draft.condition,
          language: draft.language,
          notes: draft.notes.trim(),
        });
    setBusy(false);
    if (error) return setError(error.message);
    setDraft(null);
    setEditingId(null);
    await load();
  }

  async function remove(it: EventItem) {
    if (!confirm(`¿Quitar "${it.title}" de tu lista?`)) return;
    const { error } = await supabase.from('event_items').delete().eq('id', it.id);
    if (error) return setError(error.message);
    await load();
  }

  return (
    <section>
      <h2>Etapa 1 · Los juegos que ofrecés</h2>
      <p className="muted">
        Agregá cada juego que estés dispuesto a entregar. Indicá su estado y el idioma para que los demás sepan qué reciben. Podés editar tu lista hasta
        que cierre la etapa.
      </p>

      {error && <p className="alert error">{error}</p>}

      {draft ? (
        <form className="card form" onSubmit={save}>
          <div className="row gap">
            {draft.thumbnail_url && <img src={draft.thumbnail_url} alt="" className="thumb" />}
            <div>
              <h3>
                {draft.title} {draft.year_published ? <span className="muted">({draft.year_published})</span> : null}
              </h3>
              <p className="small muted">{editingId ? 'Editando tu publicación' : 'Completá los datos de tu ejemplar'}</p>
            </div>
          </div>
          <div className="grid two">
            <label className="field">
              <span>Estado *</span>
              <select value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: e.target.value })} required>
                <option value="" disabled>
                  Elegí el estado…
                </option>
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Idioma *</span>
              <select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })} required>
                <option value="" disabled>
                  Elegí el idioma…
                </option>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Observaciones (opcional)</span>
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              maxLength={500}
              rows={3}
              placeholder="Ej: caja con una esquina marcada, incluye expansión, fundas puestas…"
            />
          </label>
          <div className="row gap">
            <button className="btn primary" disabled={busy}>
              {editingId ? 'Guardar cambios' : 'Agregar a mi lista'}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setDraft(null);
                setEditingId(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="card">
          <BggSearch onPick={pick} />
        </div>
      )}

      <h3>Tu lista {items ? `(${items.length})` : ''}</h3>
      {!items && <p className="muted">Cargando…</p>}
      {items && items.length === 0 && <p className="muted">Todavía no cargaste ningún juego.</p>}
      <div className="stack">
        {items?.map((it) => (
          <ItemCard
            key={it.id}
            item={it}
            mine
            actions={
              <>
                <button className="btn ghost small" onClick={() => edit(it)}>
                  Editar
                </button>
                <button className="btn ghost small danger" onClick={() => void remove(it)}>
                  Quitar
                </button>
              </>
            }
          />
        ))}
      </div>
    </section>
  );
}
