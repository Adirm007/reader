declare module '*.css' { const text: string; export default text; }
declare module '*.svg' { const text: string; export default text; }
declare module 'virtual:theme-css' { const packed: Record<string, string>; export default packed; }
