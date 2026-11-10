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
  /** Lists and switches the sub-pages draw (filled by the switch layer from the same legacy getters). */
  personas: { id: string; name: string; hint: string }[];
  appearances: { id: string; name: string }[];
  eggs: EggState;
}

export interface EggState {
  display: string; unseal: boolean; silent: boolean; beautify: boolean; letterLimit: boolean; hideFloat: boolean; legacyUi: boolean;
  yuan: boolean; yuanStream: boolean; yuanPref: string; api: string;
  /** Which folds are open (legacy dlbEggOpen). */
  open: { theme?: boolean; yuan?: boolean; disc?: boolean; font?: boolean; fsz?: boolean };
}

/** Legacy HTML fragments a sub-page embeds as-is (their own click handlers are bound by dlbAfterRender). */
export interface Fragments { decouple?: string; disc?: string; font?: string; fsz?: string }

export type PageId = 'persona' | 'tuning' | 'decouple' | 'template' | 'eggs';

/** What one theme says and shows on the sub-pages; the markup is shared, the look is the theme's CSS. */
export interface PageSkin {
  /** Landmark object per page (a two-frame prop id without -f1/-f2) and the page's words. */
  pages: Record<PageId, { prop: string; title: string; lede: string }>;
  /** Group headings, e.g. { who: '她是谁', look: '今天的打扮', … }, and the order slip's receiptShop/receiptVerb/receiptCancel. */
  words: Record<string, string>;
  /** Optional ornament markup placed inside the sheet (tape, rods, seals). */
  ornament?: (page: PageId) => string;
}

export interface Hooks {
  /** Re-read the current state from the legacy globals. */
  state(): LobbyState;
}

export interface ThemeKit {
  id: Theme;
  /** The lobby, sub-page and window sheets are packed by build.mjs (core/theme-css.ts); only this one is inline. */
  envelopeCss: string;
  scene(s: LobbyState): string;
  top(page: string, s: LobbyState): string;
  main(s: LobbyState): string;
  greetings(s: LobbyState, hour: number): string[];
  date(d: Date): string;
  /** Theme-specific dynamic bits after the shared sync ran. */
  sync?(root: HTMLElement, kind: string, s: LobbyState): void;
  skin: PageSkin;
  /** Success animation after a paid order went through. */
  celebrate?(root: HTMLElement, kind: string, s: LobbyState): void;
}
