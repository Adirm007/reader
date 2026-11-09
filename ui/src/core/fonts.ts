/* Display faces (SIL OFL, subset to the fixed interface text, files in assets/ui/fonts/). Body text keeps
 * the system CJK stack. Each face falls back through every source, then to the theme's local stack. */
import { has, urls } from './assets';

export interface Face { family: string; id: string; weight: string; style?: string }

export const FACES: Record<string, Face[]> = {
  cafe: [
    { family: 'u4 Cafe Hand', id: 'font/cafe-hand', weight: '100 900' },
    { family: 'u4 Cafe Latin', id: 'font/cafe-latin', weight: '400 900' },
    { family: 'u4 Cafe Latin', id: 'font/cafe-latin-italic', weight: '400 900', style: 'italic' },
  ],
  summer: [
    { family: 'u4 Summer Display', id: 'font/summer-display', weight: '100 900', style: 'normal' },
    { family: 'u4 Summer Latin', id: 'font/summer-latin', weight: '100 900' },
  ],
  ink: [
    { family: 'u4 Ink Brush', id: 'font/ink-brush', weight: '100 900' },
  ],
};

export function fontFaceCss(theme: string): string {
  return (FACES[theme] || []).filter(face => has(face.id)).map(face =>
    `@font-face{font-family:"${face.family}";src:${urls(face.id).map(url => `url("${url}") format("woff2")`).join(',')};font-weight:${face.weight};font-style:${face.style || 'normal'};font-display:swap}`
  ).join('');
}
