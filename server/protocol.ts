import { z } from "zod";
const id=z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const turnVersion=z.number().int().nonnegative();
const shot=z.object({angle:z.number().finite().min(-Math.PI*2).max(Math.PI*2),power:z.number().finite().gt(0).max(1),spin:z.number().finite().min(-1).max(1)}).strict();
export const joinOptions=z.object({
  nickname:z.string().trim().min(1).max(16).regex(/^[^\u0000-\u001f\u007f<>]+$/u),
  creatorKey:z.string().uuid().optional(),inviteCode:z.string().regex(/^[A-Z2-9]{8}$/).optional(),
  protocol:z.literal(1),
}).strict();
export const command=z.discriminatedUnion("type",[
  z.object({type:z.literal("sync"),requestId:id}).strict(),
  z.object({type:z.literal("ready"),requestId:id}).strict(),
  z.object({type:z.literal("shot"),requestId:id,turnVersion,shot}).strict(),
  z.object({type:z.literal("place"),requestId:id,turnVersion,position:z.object({x:z.number().finite(),y:z.number().finite()}).strict()}).strict(),
  z.object({type:z.literal("aim"),requestId:id,turnVersion,angle:z.number().finite().min(-Math.PI*2).max(Math.PI*2)}).strict(),
  z.object({type:z.literal("status"),requestId:id,operationId:id}).strict(),
  z.object({type:z.literal("resign"),requestId:id}).strict(),
  z.object({type:z.literal("rematch"),requestId:id}).strict(),
]);
export type Command=z.infer<typeof command>;
