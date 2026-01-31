import type { NodeTypes } from '@xyflow/react';
import { AIBlockNode } from './AIBlockNode';
import { FunctionBlockNode } from './FunctionBlockNode';
import { RouterNode } from './RouterNode';
import { ParallelNode } from './ParallelNode';
import { LoopNode } from './LoopNode';
import { SourceNode } from './SourceNode';
import { SinkNode } from './SinkNode';

export const nodeTypes: NodeTypes = {
  aiBlock: AIBlockNode,
  functionBlock: FunctionBlockNode,
  router: RouterNode,
  parallel: ParallelNode,
  loop: LoopNode,
  source: SourceNode,
  sink: SinkNode,
};

export {
  AIBlockNode,
  FunctionBlockNode,
  RouterNode,
  ParallelNode,
  LoopNode,
  SourceNode,
  SinkNode,
};
