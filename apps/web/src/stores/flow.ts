import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges
} from '@xyflow/react';

interface FlowState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  isAutoSaving: boolean;
  lastSaved: Date | null;

  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  addNode: (node: Node) => void;
  updateNode: (nodeId: string, data: Record<string, unknown>) => void;
  deleteNode: (nodeId: string) => void;
  addEdge: (edge: Edge) => void;
  deleteEdge: (edgeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  setAutoSaving: (isAutoSaving: boolean) => void;
  setLastSaved: (date: Date) => void;
  reset: () => void;
}

export const useFlowStore = create<FlowState>()(
  devtools(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      isAutoSaving: false,
      lastSaved: null,

      setNodes: (nodes) => set({ nodes }),

      setEdges: (edges) => set({ edges }),

      onNodesChange: (changes) => {
        set({
          nodes: applyNodeChanges(changes, get().nodes),
        });
      },

      onEdgesChange: (changes) => {
        set({
          edges: applyEdgeChanges(changes, get().edges),
        });
      },

      addNode: (node) => {
        set((state) => ({
          nodes: [...state.nodes, node],
        }));
      },

      updateNode: (nodeId, data) => {
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
          ),
        }));
      },

      deleteNode: (nodeId) => {
        set((state) => ({
          nodes: state.nodes.filter((node) => node.id !== nodeId),
          edges: state.edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId
          ),
          selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        }));
      },

      addEdge: (edge) => {
        set((state) => ({
          edges: [...state.edges, edge],
        }));
      },

      deleteEdge: (edgeId) => {
        set((state) => ({
          edges: state.edges.filter((edge) => edge.id !== edgeId),
        }));
      },

      selectNode: (nodeId) => {
        set({ selectedNodeId: nodeId });
      },

      setAutoSaving: (isAutoSaving) => {
        set({ isAutoSaving });
      },

      setLastSaved: (date) => {
        set({ lastSaved: date });
      },

      reset: () => {
        set({
          nodes: [],
          edges: [],
          selectedNodeId: null,
          isAutoSaving: false,
          lastSaved: null,
        });
      },
    }),
    { name: 'flow-store' }
  )
);
