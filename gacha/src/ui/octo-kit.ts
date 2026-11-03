// 命运抽卡沿用《书海》的八角金线界面零件（取自书海 src/ui/octo-kit.ts，角饰颜色改为可按主题换色）：线描角饰与字体。
const svg = (body: string, box = '0 0 24 24') => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${box}'>${body}</svg>`)}")`;
const cornerBody = (transform: string, stroke: string, hi: string) => `<g transform='${transform}'><g fill='none' stroke='${stroke}' stroke-linecap='round'><path d='M1.5 22.5V8Q1.5 1.5 8 1.5h14.5' stroke-width='1.1'/><path d='M4.5 22.5v-12q0-6 6-6h12' stroke-width='.7' opacity='.55'/><path d='M1.5 13.5h3M13.5 1.5v3' stroke-width='.9'/></g><path d='M8.6 5.6l3 3-3 3-3-3z' fill='${hi}'/><circle cx='15.5' cy='8.6' r='.9' fill='${stroke}'/><circle cx='8.6' cy='15.5' r='.9' fill='${stroke}'/></g>`;
/** 四个角饰的背景层（不含底色），用于一条 background 声明：`${octoCorners(...)},${底色}`。 */
export function octoCorners(stroke = '#d8b978', hi = '#f0d99c', size = 22) {
  const c = (t: string) => svg(cornerBody(t, stroke, hi));
  return `${c('')} left 3px top 3px/${size}px ${size}px no-repeat,${c('matrix(-1 0 0 1 24 0)')} right 3px top 3px/${size}px ${size}px no-repeat,${c('matrix(1 0 0 -1 0 24)')} left 3px bottom 3px/${size}px ${size}px no-repeat,${c('matrix(-1 0 0 -1 24 24)')} right 3px bottom 3px/${size}px ${size}px no-repeat`;
}
export const OCTO_SERIF = `'Noto Serif SC','Source Han Serif SC','Source Han Serif CN','思源宋体','Songti SC','STSong','SimSun',serif`;
export const OCTO_SANS = `'Noto Sans SC','PingFang SC','Microsoft YaHei','Source Han Sans SC',system-ui,sans-serif`;
