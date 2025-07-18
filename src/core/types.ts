import * as fabric from 'fabric';

/**
 * 계층적 요소의 핵심 데이터 구조
 * - 트리 구조를 효율적으로 표현
 * - 제약 조건과 스타일 정보 포함
 * - Fabric.js 객체와의 연결점 제공
 */
export interface HierarchicalElement {
  // 식별자 및 계층 정보
  id: string;
  type: 'rectangle';
  parentId?: string;
  childIds: string[];
  depth: number;              // 계층 깊이 (성능 최적화용)
  zIndex: number;            // 렌더링 순서

  // 기하학적 정보
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;          // 회전 각도 (확장성 고려)

  // 스타일 정보
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
  };

  // 상태 정보
  selected: boolean;
  hovered: boolean;
  dragging: boolean;
  resizing: boolean;

  // 제약 조건
  constraints: {
    stayWithinParent: boolean;
    maintainAspectRatio: boolean;
    minSize: { width: number; height: number };
    maxSize: { width: number; height: number };
  };

  // Fabric.js 연결점
  fabricObject?: fabric.Rect;
  
  // 메타데이터
  metadata: {
    createdAt: Date;
    lastModified: Date;
    version: number;         // 버전 관리 (실행 취소용)
  };
}

/**
 * 애플리케이션 전체 상태 정의
 * - 불변성 원칙 적용
 * - 예측 가능한 상태 변화
 * - 시간 여행 디버깅 지원
 */
export interface AppState {
  // 요소 관리
  elements: Map<string, HierarchicalElement>;
  elementOrder: string[];     // 렌더링 순서

  // 선택 상태
  selectedElementId: string | null;
  hoveredElementId: string | null;
  focusedElementId: string | null;

  // 상호작용 상태
  isDragging: boolean;
  isResizing: boolean;
  isDragSelecting: boolean;
  dragStartPoint: { x: number; y: number } | null;
  dragSelectionRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;

  // 커서 상태
  cursorType: 'default' | 'move' | 'resize' | 'crosshair' | 'not-allowed';

  // 캔버스 상태
  canvasSize: { width: number; height: number };
  canvasZoom: number;
  canvasOffset: { x: number; y: number };

  // 히스토리 (실행 취소/재실행용)
  history: {
    past: AppState[];
    present: AppState;
    future: AppState[];
  };

  // 성능 관련
  dirtyElements: Set<string>;
  renderQueued: boolean;
}

/**
 * 상태 변경 액션 정의
 */
export type Action = 
  | { type: 'CREATE_ELEMENT'; element: HierarchicalElement }
  | { type: 'DELETE_ELEMENT'; elementId: string }
  | { type: 'SELECT_ELEMENT'; elementId: string | null }
  | { type: 'HOVER_ELEMENT'; elementId: string | null }
  | { type: 'MOVE_ELEMENT'; elementId: string; deltaX: number; deltaY: number }
  | { type: 'RESIZE_ELEMENT'; elementId: string; newSize: { width: number; height: number } }
  | { type: 'START_DRAG'; startPoint: { x: number; y: number } }
  | { type: 'END_DRAG' }
  | { type: 'UPDATE_DRAG_SELECTION'; rect: { x: number; y: number; width: number; height: number } }
  | { type: 'SET_CURSOR'; cursorType: AppState['cursorType'] }
  | { type: 'MARK_DIRTY'; elementIds: string[] }
  | { type: 'CLEAR_DIRTY' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

/**
 * 이벤트 페이로드 정의
 */
export interface EventPayload {
  timestamp: Date;
  source: string;
  data: any;
}

/**
 * 커서 타입 정의
 */
export const CURSOR_TYPES = {
  DEFAULT: 'default',
  MOVE: 'move',
  RESIZE: 'nw-resize',
  CROSSHAIR: 'crosshair',
  NOT_ALLOWED: 'not-allowed'
} as const;