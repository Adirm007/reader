/** 读者里的入口：定义 window.ReaderGacha（见 gacha-reader.ts）。与读者其他模块一样挂在 window 上。
 *  脚本版装在读者控制器里；旧完整版装在每封信自己的页面里。页面卸下时（停止读者、信被重绘）面板随之撤掉，不留下无主的浮层。 */
import {createReaderGacha} from './gacha-reader';
type Root = {ReaderGacha?: unknown; addEventListener?: (type: string, fn: () => void) => void};
const root = (typeof window !== 'undefined' ? window : globalThis) as unknown as Root;
const api = createReaderGacha();
root.ReaderGacha = api;
try {root.addEventListener?.('pagehide', () => api.dispose());} catch {/* 没有页面事件的环境（测试）不需要 */}
