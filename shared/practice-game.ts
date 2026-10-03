import { GameError, Match } from './match.js';
import { canPlace, rack } from './physics.js';
import type { LocalGame } from './local-game.js';
import type { Ball, Shot, Simulation } from './types.js';

type Snapshot = ReturnType<Match['snapshot']>;
/** Solo sandbox. Shares physics and snapshots, never invokes competitive rules. */
export class PracticeGame {
  private state!: Snapshot;
  private pending: Simulation | null = null;
  private generation = 0;
  private stopped = true;
  constructor(
    private simulate: (balls: Ball[], shot: Shot) => Promise<Simulation>,
    private onSnapshot: (state: Snapshot) => void,
    private onError: (message: string) => void,
    private now: () => number = Date.now,
  ) {}
  start() {
    this.generation++; this.stopped = false; this.pending = null;
    this.state = new Match().snapshot(this.now());
    Object.assign(this.state, {
      phase: 'aiming', turnVersion: 1, breakShot: false,
      balls: rack(1 + globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 0x7ffffffe),
      reason: '自由练习 · 不限时，任意顺序进球',
      players: [{name: '单人练习', connected: true, ready: true, rematch: false, disconnectedAt: null}, null],
    });
    this.emit();
  }
  stop() { this.stopped = true; this.generation++; this.pending = null; }
  private emit() {
    if (this.stopped) return;
    this.state.revision++; this.state.serverTime = this.now();
    this.onSnapshot(structuredClone(this.state));
  }
  tick() {
    if (this.stopped || !this.pending || !this.state.activeShot) return;
    const s = this.state;
    if (this.now() < s.activeShot!.startsAt + s.activeShot!.duration * 1000) return;
    s.balls = this.pending.balls; this.pending = null; s.activeShot = null;
    s.ballInHand = s.balls.find(b => b.id === 0)!.pocketed;
    const complete = s.balls.filter(b => b.id !== 0).every(b => b.pocketed);
    s.phase = complete ? 'finished' : 'aiming'; s.turnVersion++;
    s.reason = complete ? '15 颗目标球全部入袋，练习完成。' : s.ballInHand ? '白球入袋 · 重新放置后继续练习' : '继续练习 · 也可以自由摆放白球';
    this.emit();
  }
  async send(command: Parameters<LocalGame['send']>[0]) {
    if (this.stopped) return;
    const s = this.state, generation = this.generation;
    let computing = false;
    try {
      if (command.type === 'aim') return;
      if (command.type === 'rematch') {
        if (s.phase !== 'finished') throw new GameError('MATCH_NOT_FINISHED');
        this.start(); return;
      }
      if (['shot', 'place', 'practice-place'].includes(command.type)) {
        if (s.phase !== 'aiming') throw new GameError('NOT_AIMING');
        if (command.turnVersion !== s.turnVersion) throw new GameError('STALE_TURN');
      }
      if (command.type === 'practice-place') {
        s.ballInHand = true; s.turnVersion++;
      } else if (command.type === 'place') {
        if (!s.ballInHand) throw new GameError('NO_BALL_IN_HAND');
        if (!command.position || !canPlace(s.balls, command.position)) throw new GameError('INVALID_PLACEMENT');
        Object.assign(s.balls.find(b => b.id === 0)!, command.position, {pocketed: false, vx: 0, vy: 0, wx: 0, wy: 0});
        s.ballInHand = false; s.turnVersion++;
      } else if (command.type === 'shot') {
        if (s.ballInHand) throw new GameError('PLACE_CUE_FIRST');
        if (!command.shot || !command.requestId) return;
        s.activeShot = {id: command.requestId, shooter: 0, input: structuredClone(command.shot), before: structuredClone(s.balls), startsAt: this.now(), duration: 0};
        computing = true; s.phase = 'simulating'; this.emit();
        const result = await this.simulate(structuredClone(s.balls), command.shot);
        if (this.stopped || generation !== this.generation) return;
        this.pending = result; s.activeShot!.startsAt = this.now(); s.activeShot!.duration = result.duration; s.phase = 'animating';
      }
      this.emit();
    } catch (error) {
      if (this.stopped || generation !== this.generation) return;
      if (computing && s.phase === 'simulating') {
        s.phase = 'aiming'; s.activeShot = null; this.pending = null; s.turnVersion++;
      }
      this.onError(error instanceof Error ? error.message : String(error)); this.emit();
    }
  }
}
