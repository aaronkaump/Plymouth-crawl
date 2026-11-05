export type Vibe = 'pub' | 'cocktails' | 'bar' | 'food';
export type District = 'downtown' | 'between' | 'old-village';
export type Shape = 'old-village' | 'downtown';
export type Person = 'aaron' | 'john';
export type View = 'timeline' | 'map' | 'stop';

export interface Venue {
  id: string;
  name: string;
  short: string;
  vibe: Vibe;
  district: District;
  lat: number;
  lon: number;
}

/** One stop of the night. The last stop in the list is the current one. */
export interface Stop {
  venueId: string;
  /** Set by the planner when the venue's vibe differs from the vibe it was planned under. */
  closestMatch: boolean;
  /** null while walking to it. */
  arrivedAt: number | null;
  /** Set by Let's go (or That's the night). */
  leftAt: number | null;
  aaron: number | null;
  john: number | null;
  photo: boolean;
}

export interface Night {
  id: string;
  startedAt: number;
  vibe: Vibe;
  shape: Shape;
  /** Stop index where the night crosses to Old Village, when "Head to Old Village" moved it. */
  crossAt: number | null;
  stops: Stop[];
  /** The last name tapped, so "Not yet" can un-tap it. */
  lastTapped: Person | null;
  endedAt: number | null;
  /** True once the "That's the night" card has been dismissed into the recap. */
  recapSeen: boolean;
}

export interface PlannedStop {
  venue: Venue;
  closestMatch: boolean;
}
