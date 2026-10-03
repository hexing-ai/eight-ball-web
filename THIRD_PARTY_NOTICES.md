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

web/render.ts 和 web/style.css 自行绘制球台、球体与控件；音效由 web/audio.ts 使用 Web Audio 合成。生成效果图仅作设计对照，不嵌入可玩页面。
