# voxpop-embed

众声 VoxPop 的官方嵌入脚本。把任意 VoxPop 问卷用一行代码嵌进网页（iframe，自适应高度）。

[众声 VoxPop](https://github.com/TNT-Likely/voxpop) 是跑在 Cloudflare 免费层上的开源投票站。

## 用法

```html
<script src="https://<你的 VoxPop 域名>/embed.js"></script>
<div class="voxpop-poll" data-poll="<问卷ID>"></div>
```

问卷 ID 从 VoxPop 后台的问卷详情页复制。

## npm / 打包器

```bash
npm install voxpop-embed
```

```js
import VoxPop from 'voxpop-embed';

VoxPop.mount(document.querySelector('#poll-box'), {
  host: 'https://voxpop.example.com',
  poll: '<问卷ID>',
});
```

## License

MIT © 2026 TNT-Likely
