export interface CanvasObject {
  id: string;
  parentId: string | null;
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
}

export interface SelectionState {
  isSelecting: boolean;
  selectionStart: { x: number; y: number } | null;
  selectionEnd: { x: number; y: number } | null;
}

export interface ObjectState {
  selectedObjectId: string | null;
  isDragReady: boolean;
  hoveredObjectId: string | null;
}

export type OperationType = 'moving' | 'scaling' | 'selecting' | null;