import { AppState, Action, HierarchicalElement } from './types';

/**
 * Redux-like 상태 관리자
 * - 불변성 보장
 * - 예측 가능한 상태 변화
 * - 미들웨어 시스템 지원
 */
export class StateManager {
  private state: AppState;
  private subscribers: Set<(state: AppState) => void> = new Set();
  private middlewares: Array<(action: Action, state: AppState) => Action> = [];

  constructor(initialState: AppState) {
    this.state = initialState;
  }

  /**
   * 액션 디스패치
   */
  dispatch(action: Action): void {
    // 미들웨어 적용
    let finalAction = action;
    for (const middleware of this.middlewares) {
      finalAction = middleware(finalAction, this.state);
    }

    // 상태 업데이트
    const newState = this.reducer(this.state, finalAction);
    
    // 상태가 실제로 변경되었을 때만 구독자들에게 알림
    if (newState !== this.state) {
      this.state = newState;
      this.notifySubscribers();
    }
  }

  /**
   * 상태 변경 로직
   */
  private reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
      case 'CREATE_ELEMENT':
        return {
          ...state,
          elements: new Map(state.elements).set(action.element.id, action.element),
          elementOrder: [...state.elementOrder, action.element.id],
          dirtyElements: new Set([...state.dirtyElements, action.element.id])
        };

      case 'DELETE_ELEMENT':
        const newElements = new Map(state.elements);
        newElements.delete(action.elementId);
        return {
          ...state,
          elements: newElements,
          elementOrder: state.elementOrder.filter(id => id !== action.elementId),
          selectedElementId: state.selectedElementId === action.elementId ? null : state.selectedElementId,
          hoveredElementId: state.hoveredElementId === action.elementId ? null : state.hoveredElementId,
          dirtyElements: new Set([...state.dirtyElements].filter(id => id !== action.elementId))
        };

      case 'SELECT_ELEMENT':
        if (state.selectedElementId === action.elementId) {
          return state; // 상태 변경 없음
        }
        return {
          ...state,
          selectedElementId: action.elementId,
          dirtyElements: new Set([
            ...state.dirtyElements,
            ...(state.selectedElementId ? [state.selectedElementId] : []),
            ...(action.elementId ? [action.elementId] : [])
          ])
        };

      case 'HOVER_ELEMENT':
        if (state.hoveredElementId === action.elementId) {
          return state; // 상태 변경 없음
        }
        return {
          ...state,
          hoveredElementId: action.elementId,
          dirtyElements: new Set([
            ...state.dirtyElements,
            ...(state.hoveredElementId ? [state.hoveredElementId] : []),
            ...(action.elementId ? [action.elementId] : [])
          ])
        };

      case 'MOVE_ELEMENT':
        const elementToMove = state.elements.get(action.elementId);
        if (!elementToMove) return state;

        const updatedElement = {
          ...elementToMove,
          position: {
            x: elementToMove.position.x + action.deltaX,
            y: elementToMove.position.y + action.deltaY
          },
          metadata: {
            ...elementToMove.metadata,
            lastModified: new Date(),
            version: elementToMove.metadata.version + 1
          }
        };

        return {
          ...state,
          elements: new Map(state.elements).set(action.elementId, updatedElement),
          dirtyElements: new Set([...state.dirtyElements, action.elementId])
        };

      case 'RESIZE_ELEMENT':
        const elementToResize = state.elements.get(action.elementId);
        if (!elementToResize) return state;

        const resizedElement = {
          ...elementToResize,
          size: action.newSize,
          metadata: {
            ...elementToResize.metadata,
            lastModified: new Date(),
            version: elementToResize.metadata.version + 1
          }
        };

        return {
          ...state,
          elements: new Map(state.elements).set(action.elementId, resizedElement),
          dirtyElements: new Set([...state.dirtyElements, action.elementId])
        };

      case 'START_DRAG':
        return {
          ...state,
          isDragging: true,
          dragStartPoint: action.startPoint
        };

      case 'END_DRAG':
        return {
          ...state,
          isDragging: false,
          isDragSelecting: false,
          dragStartPoint: null,
          dragSelectionRect: null
        };

      case 'UPDATE_DRAG_SELECTION':
        return {
          ...state,
          isDragSelecting: true,
          dragSelectionRect: action.rect
        };

      case 'SET_CURSOR':
        if (state.cursorType === action.cursorType) {
          return state;
        }
        return {
          ...state,
          cursorType: action.cursorType
        };

      case 'MARK_DIRTY':
        return {
          ...state,
          dirtyElements: new Set([...state.dirtyElements, ...action.elementIds])
        };

      case 'CLEAR_DIRTY':
        return {
          ...state,
          dirtyElements: new Set()
        };

      case 'UNDO':
        if (state.history.past.length === 0) return state;
        const previous = state.history.past[state.history.past.length - 1];
        const newPast = state.history.past.slice(0, state.history.past.length - 1);
        return {
          ...previous,
          history: {
            past: newPast,
            present: previous,
            future: [state.history.present, ...state.history.future]
          }
        };

      case 'REDO':
        if (state.history.future.length === 0) return state;
        const next = state.history.future[0];
        const newFuture = state.history.future.slice(1);
        return {
          ...next,
          history: {
            past: [...state.history.past, state.history.present],
            present: next,
            future: newFuture
          }
        };

      default:
        return state;
    }
  }

  /**
   * 상태 구독
   */
  subscribe(listener: (state: AppState) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  /**
   * 현재 상태 조회
   */
  getState(): AppState {
    return this.state;
  }

  /**
   * 미들웨어 추가
   */
  use(middleware: (action: Action, state: AppState) => Action): void {
    this.middlewares.push(middleware);
  }

  /**
   * 히스토리 스냅샷 저장
   */
  saveSnapshot(): void {
    const currentState = { ...this.state };
    this.state = {
      ...this.state,
      history: {
        past: [...this.state.history.past, currentState],
        present: currentState,
        future: []
      }
    };

    // 히스토리 크기 제한
    if (this.state.history.past.length > 50) {
      this.state.history.past = this.state.history.past.slice(-50);
    }
  }

  /**
   * 구독자들에게 상태 변경 알림
   */
  private notifySubscribers(): void {
    this.subscribers.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('[StateManager] Error in subscriber:', error);
      }
    });
  }

  /**
   * 특정 요소 조회
   */
  getElement(elementId: string): HierarchicalElement | undefined {
    return this.state.elements.get(elementId);
  }

  /**
   * 모든 요소 조회
   */
  getAllElements(): HierarchicalElement[] {
    return Array.from(this.state.elements.values());
  }

  /**
   * 선택된 요소 조회
   */
  getSelectedElement(): HierarchicalElement | null {
    return this.state.selectedElementId ? 
      this.state.elements.get(this.state.selectedElementId) || null : 
      null;
  }

  /**
   * 호버된 요소 조회
   */
  getHoveredElement(): HierarchicalElement | null {
    return this.state.hoveredElementId ? 
      this.state.elements.get(this.state.hoveredElementId) || null : 
      null;
  }

  /**
   * 디버깅 정보
   */
  getDebugInfo(): {
    totalElements: number;
    selectedElement: string | null;
    hoveredElement: string | null;
    dirtyElements: number;
    subscribers: number;
    middlewares: number;
  } {
    return {
      totalElements: this.state.elements.size,
      selectedElement: this.state.selectedElementId,
      hoveredElement: this.state.hoveredElementId,
      dirtyElements: this.state.dirtyElements.size,
      subscribers: this.subscribers.size,
      middlewares: this.middlewares.length
    };
  }
}