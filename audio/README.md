# 读者唱片音频

这里托管原 `sharkpan.xyz` 外链失效的六首曲目。播放器沿用原歌单的显示名称与顺序，不读取文件名或音频标签来命名。

| 文件 | 专辑 | 显示名称 |
| --- | --- | --- |
| `music/four-little-swans.mp3` | 咖啡馆 | 四小天鹅 |
| `music/canon-in-d.mp3` | 咖啡馆 | D大调卡农 |
| `music/air-on-the-g-string.mp3` | 咖啡馆 | G弦上的咏叹调 |
| `music/dont-know-why.mp3` | 咖啡馆 | Don't Know Why |
| `music/fly-me-to-the-moon.mp3` | 咖啡馆 | Fly Me to the Moon |
| `music/page-ninety-nine.mp3` | 读者们 | 最初之歌 |

前五首从作者提供的 FLAC 转为 MP3（192 kbps、44.1 kHz、双声道），不保留原内嵌封面；「最初之歌」对应 `Page Ninety-Nine.mp3`，保留原文件，不重复有损压缩。原始下载文件不改动。

`source/booksea-album.js` 中的 `readerCatalog` 固定这些文件所在的完整提交 SHA、字节数和 SHA-256。仅播放当前单曲时下载并校验，raw 与 jsDelivr 使用同一固定提交，切歌及停止时回收 Blob。以后更换音频时先提交文件，再更新目录中的提交 SHA 和摘要，不改写旧提交。

旧用户保存的六个默认外链会按 URL 精确迁移到本仓库地址；保留玩家的曲名、顺序、自定义歌曲与空歌单。其余可用外链和「书海」专辑维持各自来源。
