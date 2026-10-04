# 第三方代码与素材声明

业务代码未授予开源许可。依赖的宽松许可证不要求公开全部业务代码；分发时仍需保留相应许可和版权声明。

## pooltool — Apache License 2.0

来源：https://github.com/ekiefl/pooltool

固定参考提交：`81040e931facada508bbab2e53ab820295bbd90e`

源文件：`pooltool/physics/resolve/stick_ball/instantaneous_point/__init__.py` 中的 `cue_strike`。

使用位置：`shared/physics.ts` 的 `strike()`。

修改说明（2026-10-03）：将击球冲量方程简化为 TypeScript 平面标量版本；固定水平出杆，去掉侧向击点、偏转和跳球，保留竖向击点对应的平面旋转；添加 UI 力度到球杆速度的映射。没有移植 pooltool 的完整求解器。

原始 Apache-2.0 许可随附于 `licenses/pooltool-APACHE-2.0.txt`。项目名称及作者不构成对本产品的背书。

## 运行依赖

Colyseus core / WebSocket transport（MIT）、Express（MIT）、Zod（MIT）。各依赖及其传递依赖的原始 LICENSE 随 npm 安装包保留在 node_modules；以锁文件确定实际版本。前端构建运行 scripts/build-notices.mjs，将已安装依赖许可集合及 pooltool 许可写入 web-dist，保留分发声明。@colyseus/sdk 与 Vite 按 MIT 许可使用。

## 未复用的参考

Classic-8-Ball-Pool 用于功能研究，未复制代码或素材。tailuge/billiards 与 FooBillard++ 的 GPL 代码未引入。腾讯桌球只用作交互参考，不复制其商标、角色、球杆皮肤和美术资源。视觉效果图属于设计提案，不是最终生产素材。

## 前端原创素材

web/render.ts 和 web/style.css 自行绘制球台、球体与控件；音效使用下列授权实录及其加工版本，由 Web Audio 播放。生成效果图仅作设计对照，不嵌入可玩页面。

## 实录台球音效

以下第三方音效按各自许可分发，不适用业务代码的“保留所有权利”。这些作者不为本项目背书。未使用腾讯桌球音效。

- **“SPRTIndor-BILLIARDS_Billiard Ball Cue Hit 01_KVV AUDIO_FREE” — KVV Audio（Freesound 账号 KVV_Audio）**。
  来源：https://freesound.org/people/KVV_Audio/sounds/851086/
  许可：Creative Commons Attribution 4.0，https://creativecommons.org/licenses/by/4.0/ 。
  使用文件：`cue-1.wav`、`cue-2.wav`、`cue-3.wav`。从公开预览截取三次击杆，合并单声道、去直流、对齐起音、淡入淡出及峰值调整。仅用于游戏内处理音效，不随附原始录音包。
- **“billiard ball clack” — Za-Games**。
  来源：https://freesound.org/people/Za-Games/sounds/539854/
  许可：CC0 1.0，https://creativecommons.org/publicdomain/zero/1.0/ 。
  使用文件：`collision.wav`、`cushion.wav`。碰球实录经格式转换与响度调整；库边拟音另做截短和低通处理，并非独立库边实录。
- **“Pool Ball in pocket.wav” — jtroan**。
  来源：https://freesound.org/people/jtroan/sounds/241373/
  许可：Creative Commons Attribution 3.0，https://creativecommons.org/licenses/by/3.0/ 。
  使用文件：`pocket.wav`。公开预览转为 PCM16，去直流、短淡入淡出并调节峰值，保留袋内碰撞时间关系。

素材核查于 2026-10-04；详细处理过程和公开预览来源见 `docs/AUDIO_SOURCES.md`。以上 CC 许可未被本项目版权声明撤销或额外限制。
