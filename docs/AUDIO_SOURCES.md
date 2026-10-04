# 台球音效来源与处理

当前使用授权实录制作游戏音效，不使用腾讯桌球的原始音频文件，也不声称与腾讯桌球音效完全一致。

## 素材与授权

| 游戏文件 | 原录音 / 作者 | 许可 | 本项目处理 |
| --- | --- | --- | --- |
| `web/assets/audio/cue-{1,2,3}.wav` | [SPRTIndor-BILLIARDS_Billiard Ball Cue Hit 01_KVV AUDIO_FREE — KVV Audio（账号 KVV_Audio）](https://freesound.org/people/KVV_Audio/sounds/851086/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 从公开 MP3 预览的三次独立击杆中截取；合并单声道、移除直流偏置、对齐瞬态、淡入淡出、归一化；仅作为游戏内处理音效使用，不提供原始录音包 |
| `web/assets/audio/collision.wav` | [billiard ball clack — Za-Games](https://freesound.org/people/Za-Games/sounds/539854/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 公开预览转 PCM16、移除直流偏置、短淡入淡出、响度调整 |
| `web/assets/audio/cushion.wav` | 同上，Za-Games | CC0 1.0 | 从碰球实录制作的库边拟音：截取 160 ms、两级 650 Hz 低通、重新调节响度；**不是独立的库边现场录音** |
| `web/assets/audio/pocket.wav` | [Pool Ball in pocket.wav — jtroan](https://freesound.org/people/jtroan/sounds/241373/) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 公开预览转 PCM16，保留真实落袋与袋内碰撞的时间关系；移除直流偏置、淡入淡出、限制峰值 |

许可与页面核查日期：2026-10-04。上述录音的原作者不为本项目背书。音效沿用各自许可，不受业务代码“保留所有权利”的限制。署名同时放在 `THIRD_PARTY_NOTICES.md`，构建后随网页发布，菜单提供入口。

使用的是网站公开的压缩预览；没有绕过登录下载原始高分辨率录音，不能当作原始无损采样来描述。制作后编码为 WAV 也不会恢复有损预览丢失的信息。

## 可复现处理

公开预览来源：

- 击杆：https://cdn.freesound.org/previews/851/851086_12846320-lq.mp3
- 碰球：https://cdn.freesound.org/previews/539/539854_12029332-lq.mp3
- 落袋：https://cdn.freesound.org/previews/241/241373_4396563-lq.mp3

将上述预览分别转换成 PCM16 的 `cue.wav`、`collision.wav`、`pocket.wav`（macOS 可用 `afconvert -f WAVE -d LEI16 输入.mp3 输出.wav`），放到临时目录。然后执行：

```bash
python3 scripts/prepare-audio.py /absolute/path/to/source-directory
```

网页通过 Vite `?inline` 把六个短 WAV 编入脚本，同步解码 PCM，首次击球无需等待额外下载或异步音频解码。运行时不连接 Freesound。声音随撞击力度、左右位置变化；击杆随机选择三次实录，碰球/碰库只作轻微播放速率变化，不做电子滑音。菜单支持逐项试听。

## 腾讯桌球参考的边界

[腾讯游戏许可及服务协议](https://game.qq.com/contract.shtml) 第 7.1 条包括游戏音频的知识产权保护，并限制未经事先书面同意商业使用或通过信息网络传播游戏内容。本次没有找到可将腾讯桌球原音效用于本项目的公开复用授权，因此未提取、复制或发布腾讯原音频。

本次完成授权核查和实录替换，未完成腾讯桌球原音效与本版的逐项听感对比，不能宣称复刻了腾讯音效。
