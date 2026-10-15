export type EventStatus = 'upcoming' | 'listing' | 'wanting' | 'processing' | 'finished';

export interface Profile {
  id: string;
  display_name: string;
  is_admin: boolean;
}

export interface TradeEvent {
  id: string;
  title: string;
  description: string;
  status: EventStatus;
  listing_starts_at: string;
  listing_ends_at: string;
  wanting_ends_at: string;
}

export interface EventItem {
  id: string;
  event_id: string;
  owner_id: string;
  bgg_id: number;
  title: string;
  year_published: number | null;
  thumbnail_url: string | null;
  condition: string;
  language: string;
  notes: string;
  profiles?: { display_name: string } | null;
}

export interface Want {
  item_id: string;
  wanted_item_id: string;
  rank: number | null;
}

export interface Trade {
  event_id: string;
  item_id: string;
  receives_item_id: string;
  cycle_no: number;
  cycle_position: number;
}

export interface BggResult {
  id: number;
  name: string;
  year: number | null;
  thumbnail: string | null;
}
