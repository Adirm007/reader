export type Theme = 'cafe' | 'summer' | 'ink';

export interface DailyOpt { k: string; nm: string; pr: number }

/** Everything the lobby shows, read by the switch layer from the same legacy getters the old HTML used. */
export interface LobbyState {
  theme: Theme;
  /** Formatted FP ("12,480"), or "——" while loading. */
  fp: string;
  /** Selected daily key, e.g. "日常:一日". */
  daily: string;
  dailyOpts: DailyOpt[];
  persona: { id: string; label: string };
  appearance: { id: string; label: string };
  /** User address; empty means the default form of address. */
  address: string;
  /** Bookshelf: -2 loading, -1 not created, 0 empty, N books. */
  books: number;
  juke: { playing: boolean; title: string; no: string; album: string; mode: string };
  gachaPrice: string;
  /** Legacy (external) art, used only when the bundled manifest has no entry. */
  standing: string;
  avatar: string;
}

export interface Hooks {
  /** Re-read the current state from the legacy globals. */
  state(): LobbyState;
}

export interface ThemeKit {
  id: Theme;
  css: string;
  envelopeCss: string;
  scene(s: LobbyState): string;
  top(page: string, s: LobbyState): string;
  main(s: LobbyState): string;
  greetings(s: LobbyState, hour: number): string[];
  date(d: Date): string;
  /** Theme-specific dynamic bits after the shared sync ran. */
  sync?(root: HTMLElement, kind: string, s: LobbyState): void;
  /** Success animation after a paid order went through. */
  celebrate?(root: HTMLElement, kind: string, s: LobbyState): void;
}
