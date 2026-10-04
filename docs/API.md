# 前端接入协议 v1

使用 `@colyseus/sdk@0.17`，不是裸 WebSocket。所有时间戳为服务器 Unix 毫秒，球台坐标单位米，x 向右、y 向下；角度弧度，0 向右、π/2 向下。桌面鼠标和手机触摸最终发送相同击球参数。

## HTTP

| 方法 | 路径 | 返回 |
| --- | --- | --- |
| GET | `/healthz` | ok、physicsVersion、rulesVersion |
| GET | `/api/config` | protocol、版本、turnMs、reconnectMs |
| GET | `/api/rooms/:code` | roomId、status、full；不存在404，已结束／中断410 |

邀请码8位大写字母与数字。邀请码可授予好友席位，请勿公开发送。HTTP 每 TCP 对端每分钟120请求，健康检查除外。

## 建房与加入

```ts
import { Client } from '@colyseus/sdk';
const sdk = new Client(BACKEND_URL);
const host = await sdk.create('eightball', {
  nickname: '玩家一', creatorKey: crypto.randomUUID(), protocol: 1,
});
// 立即注册 welcome、snapshot、shot、ack、error、aim 的消息处理器。
// 注册后发 sync，避免建房期间错过初始消息。
host.send('command', { type: 'sync', requestId: crypto.randomUUID() });
// welcome 提供 seat、inviteCode、roomId。邀请链接由前端带上 inviteCode。

const lookup = await fetch(`${HTTP_URL}/api/rooms/${inviteCode}`).then(r => r.json());
const guest = await sdk.joinById(lookup.roomId, { nickname: '玩家二', inviteCode, protocol: 1 });
// 本地保存 room.reconnectionToken；意外断线在60秒内 sdk.reconnect(token)。
// 前端关闭 SDK 0.17 自动重连，统一使用自身的 token 重连流程，避免重复连接。
// token 是凭据，不写入日志或分享链接；重连后重新注册处理器并 sync。
```

等待室好友主动退出后可再次邀请，房主退出会关闭等待室。双方准备开始对局；满员房不接受第三人或旁观。

## command 消息

所有命令包含 `type`、唯一 `requestId`（1–64位字母数字下划线或连字符）。未知字段拒绝。单客户端每秒最多30消息，瞄准建议节流到10Hz。

| type | 附加字段 | 含义 |
| --- | --- | --- |
| sync | 无 | 重新取 welcome 与最新 snapshot |
| ready | 无 | 准备；双方均在线且准备后开球 |
| aim | turnVersion、angle | 仅向对手展示角度，不修改权威球位 |
| shot | turnVersion、shot:{angle,power,spin} | 提交击球，power∈(0,1]、spin∈[-1,1] |
| place | turnVersion、position:{x,y} | 自由球放置，检查范围／重叠／袋口 |
| status | operationId | 查询本人的击球操作状态 |
| resign | 无 | 认输 |
| rematch | 无 | 同意再来一局，双方同意后轮换开球方 |

`spin=-1` 最低杆、`0` 中杆、`+1` 最高杆。首版不支持左右偏杆。`angle` 限制在 [-2π,2π]。

桌面按住 W 本地蓄力，松开只提交一次 shot；失焦取消蓄力。手机右侧拉杆在松手时提交，取消触摸不提交。前端已按这些规则实现，并在浏览器中验证取消与松手行为。

`turnVersion` 来自最新 snapshot，自由球放好后也会变化。出杆重试须使用完全相同的 requestId／turnVersion／shot；服务端返回 duplicate，避免打两次。相同ID不同参数报 OPERATION_CONFLICT。查询 failed 后，新一次有效尝试用新ID。

## 服务端事件

- `welcome`：seat（0/1）、inviteCode、roomId、protocol。
- `snapshot`：matchId、revision、turnVersion、phase、players、balls、groups、current、breaker、breakShot、ballInHand、winner、reason、deadline、activeShot、serverTime、版本。
- `shot`：id、shooter、input、before、startsAt、duration。服务器完成模拟后发出；duration为秒。
- `ack`：requestId，可带 status／duplicate／operation。aim 只转发，不发 ack。
- `error`：code，合法解析后产生的错误还带 requestId；错误参数本身可能无ID。
- `aim`：seat、angle、turnVersion，只作对手视觉参考。

phase：waiting → aiming → simulating → animating → aiming/finished。动画尚未结束时不能出下一杆。snapshot 是权威数据；revision 用于忽略旧状态，不能用客户端发送的球位决定胜负。

## 播放与双准线

前端 Web Worker 调用共享 `simulate(before,input,{frames:true})` 重播，利用 `startsAt` 和服务器时间偏差估算动画进度；掉线重连 snapshot.activeShot 包含同一份重播输入。动画结束以服务器新快照校准球位。版本不兼容必须提示刷新。

瞄准期间调用共享 `predict(balls,shot)`，渲染 incoming、target、cue。预览受当前力度／击点影响；使用最近一次有效力度作为未蓄力时的参考并在蓄力时更新。无直接目标或先碰库时不伪造目标分支；`cueStops` 时白球显示停球点。短线在下一次碰撞／碰库／入袋处或8个球直径截断。

手机预测在 Worker 中执行，合并过时任务；不要每帧在 UI 线程跑完整模拟。前端已实现动画插值与授权实录音效，并完成Chromium双页面联调；实体手机帧率及跨浏览器一致性仍待真机验收。

## 异常与断线

常见错误：NOT_YOUR_TURN、STALE_TURN、WAITING_RECONNECT、NOT_AIMING、PLACE_CUE_FIRST、INVALID_PLACEMENT、INVALID_COMMAND、RATE_LIMITED、SIMULATION_FAILED。错误后用最新 snapshot 更新，必要时 sync。

意外断线暂停瞄准倒计时，但已经接受的球继续运动；60秒后单方断线判负，双方断线结束且无胜者。主动离开进行中的对局等于退出判负。服务器重启明确中断，不计虚假胜负，需新建房间；本版不承诺跨进程恢复续局。
