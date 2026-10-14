import { C, INK_A, THR_A } from './palette';

/** Thousands of dots, a dozen fills: every dot is added to the path of its tone. */
export class Batch {
  ink: [Path2D, Path2D, Path2D, Path2D] = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  thr: [Path2D, Path2D, Path2D] = [new Path2D(), new Path2D(), new Path2D()];
  deep = new Path2D();
  grey = new Path2D();
  gold = new Path2D();

  reset(): void {
    this.ink = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    this.thr = [new Path2D(), new Path2D(), new Path2D()];
    this.deep = new Path2D();
    this.grey = new Path2D();
    this.gold = new Path2D();
  }

  flush(ctx: CanvasRenderingContext2D, dim: number): void {
    ctx.fillStyle = C.ink;
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = INK_A[i as 0 | 1 | 2 | 3] * dim;
      ctx.fill(this.ink[i as 0 | 1 | 2 | 3]);
    }
    ctx.fillStyle = C.ink2;
    ctx.globalAlpha = 0.42 * dim;
    ctx.fill(this.grey);
    ctx.fillStyle = C.thr;
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = THR_A[i as 0 | 1 | 2] * Math.max(dim, 0.85);
      ctx.fill(this.thr[i as 0 | 1 | 2]);
    }
    ctx.fillStyle = C.deep;
    ctx.globalAlpha = Math.max(dim, 0.85);
    ctx.fill(this.deep);
    ctx.fillStyle = C.gold;
    ctx.globalAlpha = 1;
    ctx.fill(this.gold);
    ctx.globalAlpha = 1;
  }
}
