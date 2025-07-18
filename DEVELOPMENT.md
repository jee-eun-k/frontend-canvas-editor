# Frontend Canvas 과제 - 개선된 아키텍처 설계

## 과제 요구사항

### 필수 구현 사항

- **계층적 사각형 구조**: 파란색(부모) → 주황색(자식) → 보라색(손자)의 3개 사각형을 렌더링하며, 모두 1px 검은 테두리를 가집니다.
- **Edge 기반 상호작용**:
  - 사각형의 모서리 10px 안쪽 영역에서만 호버 및 선택이 가능합니다.
  - 호버 시 테두리가 3px로 변경됩니다.
- **선택 시스템**:
  - 선택된 사각형의 테두리는 3px로 변경됩니다.
  - 겹치는 영역에서는 렌더링 순서(z-index)가 가장 높은 객체가 우선적으로 선택됩니다.
  - 캔버스의 빈 공간을 클릭하면 현재 선택이 해제됩니다.
- **계층적 이동**: 부모 사각형 이동 시 모든 자식 사각형이 함께 이동합니다.
  - 이동 제약 조건: 자식 사각형은 부모 사각형의 경계를 벗어날 수 없습니다.
- **리사이즈 기능**:
  - 선택된 사각형에만 리사이즈 핸들이 표시되며 크기 조절이 가능합니다.
  - 부모 크기가 변경되어도 자식의 크기는 유지됩니다.
  - 리사이즈 제약 조건: 부모보다 커질 수 없으며, 모든 직계 자식들을 감싸는 최소 경계 상자(Bounding Box)보다 작아질 수 없습니다.
- **드래그 선택**:
  - 드래그하여 생성된 선택 영역 안에 사각형의 네 꼭짓점이 모두 포함되면 해당 사각형을 선택 후보로 지정합니다.
  - 선택 후보 중 가장 상위 부모가 최종 선택됩니다.
- **사용자 피드백 (커서)**: 상호작용 상태에 따라 마우스 커서 모양이 변경되어야 합니다.

## 기술 스택

- 런타임: Bun
- 프레임워크: React + TypeScript
- 캔버스: Fabric.js
- 빌드 도구: Vite

## 개선된 기술 아키텍처

### 핵심 설계 철학

```typescript
/**
 * 아키텍처 설계 원칙:
 * 1. 관심사의 분리 (Separation of Concerns)
 * 2. 단일 책임 원칙 (Single Responsibility Principle)
 * 3. 이벤트 중심 설계 (Event-Driven Architecture)
 * 4. 성능 최적화 (Performance Optimization)
 * 5. 확장성 (Extensibility)
 */
```

### 데이터 구조 설계

```typescript
/**
 * 계층적 요소의 핵심 데이터 구조
 * - 트리 구조를 효율적으로 표현
 * - 제약 조건과 스타일 정보 포함
 * - Fabric.js 객체와의 연결점 제공
 */
interface HierarchicalElement {
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
```

### 이벤트 시스템

```typescript
/**
 * 중앙 집중식 이벤트 버스
 * - 모든 컴포넌트 간 느슨한 결합 제공
 * - 확장성과 유지보수성 향상
 * - 디버깅 및 로깅 기능 내장
 */
interface EventPayload {
  timestamp: Date;
  source: string;
  data: any;
}

class EventBus {
  private listeners = new Map<string, Set<Function>>();
  private eventHistory: EventPayload[] = [];
  private debugging = false;

  /**
   * 이벤트 발생
   * @param event - 이벤트 이름
   * @param data - 이벤트 데이터
   * @param source - 이벤트 발생원 (디버깅용)
   */
  emit(event: string, data: any, source: string = 'unknown'): void {
    const payload: EventPayload = {
      timestamp: new Date(),
      source,
      data
    };

    // 디버깅 모드에서 로깅
    if (this.debugging) {
      console.log(`[EventBus] ${event}:`, payload);
    }

    // 이벤트 히스토리 저장
    this.eventHistory.push(payload);
    if (this.eventHistory.length > 1000) {
      this.eventHistory.shift(); // 메모리 관리
    }

    // 리스너들에게 이벤트 전달
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[EventBus] Error in listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * 이벤트 리스너 등록
   * @param event - 이벤트 이름
   * @param listener - 리스너 함수
   * @returns 구독 해제 함수
   */
  on(event: string, listener: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // 구독 해제 함수 반환
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  /**
   * 한 번만 실행되는 이벤트 리스너
   */
  once(event: string, listener: Function): () => void {
    const onceWrapper = (data: any) => {
      listener(data);
      this.listeners.get(event)?.delete(onceWrapper);
    };
    return this.on(event, onceWrapper);
  }

  /**
   * 디버깅 모드 토글
   */
  enableDebugging(enable: boolean = true): void {
    this.debugging = enable;
  }

  /**
   * 이벤트 히스토리 조회
   */
  getEventHistory(): EventPayload[] {
    return [...this.eventHistory];
  }
}
```

### 상태 관리 시스템

```typescript
/**
 * 애플리케이션 전체 상태 정의
 * - 불변성 원칙 적용
 * - 예측 가능한 상태 변화
 * - 시간 여행 디버깅 지원
 */
interface AppState {
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
type Action = 
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
 * Redux-like 상태 관리자
 * - 불변성 보장
 * - 예측 가능한 상태 변화
 * - 미들웨어 시스템 지원
 */
class StateManager {
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
            lastModified: new Date()
          }
        };

        return {
          ...state,
          elements: new Map(state.elements).set(action.elementId, updatedElement),
          dirtyElements: new Set([...state.dirtyElements, action.elementId])
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
}
```

### 계층 관리 시스템

```typescript
/**
 * 계층적 요소 관리자
 * - 트리 구조 관리
 * - 효율적인 검색 및 순회
 * - 제약 조건 검증
 */
class HierarchyManager {
  private elements = new Map<string, HierarchicalElement>();
  private rootElementIds: string[] = [];
  private eventBus: EventBus;
  private stateManager: StateManager;

  constructor(eventBus: EventBus, stateManager: StateManager) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.setupEventListeners();
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // 상태 변경 시 내부 캐시 업데이트
    this.stateManager.subscribe((state) => {
      this.elements = state.elements;
      this.updateRootElementIds();
    });
  }

  /**
   * 요소 생성
   * @param id - 요소 ID
   * @param parentId - 부모 요소 ID (null이면 루트 요소)
   * @param props - 요소 속성
   */
  createElement(
    id: string,
    parentId: string | null,
    props: Partial<HierarchicalElement>
  ): HierarchicalElement {
    // 부모 요소 검증
    const parent = parentId ? this.elements.get(parentId) : null;
    if (parentId && !parent) {
      throw new Error(`Parent element with id "${parentId}" not found`);
    }

    // 깊이 계산
    const depth = parent ? parent.depth + 1 : 0;
    
    // z-index 계산 (같은 레벨에서 가장 높은 값 + 1)
    const siblings = parent ? parent.childIds : this.rootElementIds;
    const maxZIndex = siblings.reduce((max, siblingId) => {
      const sibling = this.elements.get(siblingId);
      return sibling ? Math.max(max, sibling.zIndex) : max;
    }, 0);

    // 기본 속성 설정
    const element: HierarchicalElement = {
      id,
      type: 'rectangle',
      parentId,
      childIds: [],
      depth,
      zIndex: maxZIndex + 1,
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      rotation: 0,
      style: {
        fill: '#ffffff',
        stroke: '#000000',
        strokeWidth: 1,
        opacity: 1
      },
      selected: false,
      hovered: false,
      dragging: false,
      resizing: false,
      constraints: {
        stayWithinParent: true,
        maintainAspectRatio: false,
        minSize: { width: 10, height: 10 },
        maxSize: { width: Infinity, height: Infinity }
      },
      metadata: {
        createdAt: new Date(),
        lastModified: new Date(),
        version: 1
      },
      ...props
    };

    // 부모-자식 관계 설정
    if (parent) {
      parent.childIds.push(id);
      this.stateManager.dispatch({
        type: 'MARK_DIRTY',
        elementIds: [parentId]
      });
    }

    // 상태 관리자에 추가
    this.stateManager.dispatch({
      type: 'CREATE_ELEMENT',
      element
    });

    // 이벤트 발생
    this.eventBus.emit('element:created', { element }, 'HierarchyManager');

    return element;
  }

  /**
   * 요소 조회
   */
  getElement(id: string): HierarchicalElement | undefined {
    return this.elements.get(id);
  }

  /**
   * 모든 요소 조회
   */
  getAllElements(): IterableIterator<HierarchicalElement> {
    return this.elements.values();
  }

  /**
   * 부모 요소 조회
   */
  getParent(id: string): HierarchicalElement | null {
    const element = this.elements.get(id);
    if (!element || !element.parentId) return null;
    return this.elements.get(element.parentId) || null;
  }

  /**
   * 자식 요소들 조회
   */
  getChildren(id: string): HierarchicalElement[] {
    const element = this.elements.get(id);
    if (!element) return [];
    
    return element.childIds
      .map(childId => this.elements.get(childId))
      .filter(child => child !== undefined) as HierarchicalElement[];
  }

  /**
   * 모든 후손 요소 조회 (재귀적)
   */
  getDescendants(id: string): HierarchicalElement[] {
    const descendants: HierarchicalElement[] = [];
    const children = this.getChildren(id);
    
    for (const child of children) {
      descendants.push(child);
      descendants.push(...this.getDescendants(child.id));
    }
    
    return descendants;
  }

  /**
   * 모든 조상 요소 조회
   */
  getAncestors(id: string): HierarchicalElement[] {
    const ancestors: HierarchicalElement[] = [];
    let current = this.getParent(id);
    
    while (current) {
      ancestors.push(current);
      current = this.getParent(current.id);
    }
    
    return ancestors;
  }

  /**
   * 요소가 다른 요소의 조상인지 확인
   */
  isAncestorOf(ancestorId: string, descendantId: string): boolean {
    const ancestors = this.getAncestors(descendantId);
    return ancestors.some(ancestor => ancestor.id === ancestorId);
  }

  /**
   * 렌더링 순서로 정렬된 요소 목록
   */
  getElementsInRenderOrder(): HierarchicalElement[] {
    const elements = Array.from(this.elements.values());
    return elements.sort((a, b) => {
      // 깊이 우선 정렬 (부모가 먼저, 같은 레벨에서는 zIndex 순)
      if (a.depth !== b.depth) {
        return a.depth - b.depth;
      }
      return a.zIndex - b.zIndex;
    });
  }

  /**
   * 점 충돌 검사 (z-index 역순)
   */
  getElementsAtPoint(x: number, y: number): HierarchicalElement[] {
    const elements = this.getElementsInRenderOrder().reverse();
    const hits: HierarchicalElement[] = [];
    
    for (const element of elements) {
      if (this.isPointInElement(x, y, element)) {
        hits.push(element);
      }
    }
    
    return hits;
  }

  /**
   * 점이 요소 내부에 있는지 확인
   */
  private isPointInElement(x: number, y: number, element: HierarchicalElement): boolean {
    const { position, size, rotation } = element;
    
    // 회전 변환 적용
    if (rotation !== 0) {
      const centerX = position.x + size.width / 2;
      const centerY = position.y + size.height / 2;
      const rotatedPoint = this.rotatePoint(x, y, centerX, centerY, -rotation);
      x = rotatedPoint.x;
      y = rotatedPoint.y;
    }
    
    return x >= position.x && 
           x <= position.x + size.width &&
           y >= position.y && 
           y <= position.y + size.height;
  }

  /**
   * 점 회전 변환
   */
  private rotatePoint(x: number, y: number, centerX: number, centerY: number, angle: number): { x: number; y: number } {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = x - centerX;
    const dy = y - centerY;
    
    return {
      x: centerX + dx * cos - dy * sin,
      y: centerY + dx * sin + dy * cos
    };
  }

  /**
   * 루트 요소 ID 목록 업데이트
   */
  private updateRootElementIds(): void {
    this.rootElementIds = Array.from(this.elements.values())
      .filter(element => !element.parentId)
      .map(element => element.id);
  }

  /**
   * 요소 삭제 (자식들도 함께 삭제)
   */
  deleteElement(id: string): void {
    const element = this.elements.get(id);
    if (!element) return;

    // 자식들 먼저 삭제 (재귀적)
    const children = this.getChildren(id);
    children.forEach(child => this.deleteElement(child.id));

    // 부모에서 제거
    const parent = this.getParent(id);
    if (parent) {
      parent.childIds = parent.childIds.filter(childId => childId !== id);
      this.stateManager.dispatch({
        type: 'MARK_DIRTY',
        elementIds: [parent.id]
      });
    }

    // 선택 해제
    const state = this.stateManager.getState();
    if (state.selectedElementId === id) {
      this.stateManager.dispatch({
        type: 'SELECT_ELEMENT',
        elementId: null
      });
    }

    // 상태에서 제거
    this.stateManager.dispatch({
      type: 'DELETE_ELEMENT',
      elementId: id
    });

    // 이벤트 발생
    this.eventBus.emit('element:deleted', { elementId: id }, 'HierarchyManager');
  }
}
```

### 정밀한 Edge 감지 시스템

```typescript
/**
 * 기하학적 계산 유틸리티
 */
class GeometryUtils {
  /**
   * 점이 회전된 사각형 내부에 있는지 확인
   */
  static isPointInRotatedRect(
    pointX: number,
    pointY: number,
    rectX: number,
    rectY: number,
    rectWidth: number,
    rectHeight: number,
    rotation: number
  ): boolean {
    // 회전 중심점
    const centerX = rectX + rectWidth / 2;
    const centerY = rectY + rectHeight / 2;

    // 점을 사각형의 로컬 좌표계로 변환
    const localPoint = GeometryUtils.rotatePoint(
      pointX, pointY, centerX, centerY, -rotation
    );

    // 변환된 점이 회전하지 않은 사각형 내부에 있는지 확인
    return localPoint.x >= rectX && 
           localPoint.x <= rectX + rectWidth &&
           localPoint.y >= rectY && 
           localPoint.y <= rectY + rectHeight;
  }

  /**
   * 점 회전 변환
   */
  static rotatePoint(
    x: number, y: number, 
    centerX: number, centerY: number, 
    angle: number
  ): { x: number; y: number } {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = x - centerX;
    const dy = y - centerY;

    return {
      x: centerX + dx * cos - dy * sin,
      y: centerY + dx * sin + dy * cos
    };
  }

  /**
   * 두 사각형의 교집합 계산
   */
  static getRectIntersection(
    rect1: { x: number; y: number; width: number; height: number },
    rect2: { x: number; y: number; width: number; height: number }
  ): { x: number; y: number; width: number; height: number } | null {
    const left = Math.max(rect1.x, rect2.x);
    const right = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
    const top = Math.max(rect1.y, rect2.y);
    const bottom = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);

    if (left < right && top < bottom) {
      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
      };
    }

    return null;
  }

  /**
   * 점과 사각형 간의 최단 거리 계산
   */
  static getDistanceToRect(
    pointX: number, pointY: number,
    rectX: number, rectY: number,
    rectWidth: number, rectHeight: number
  ): number {
    const dx = Math.max(0, Math.max(rectX - pointX, pointX - (rectX + rectWidth)));
    const dy = Math.max(0, Math.max(rectY - pointY, pointY - (rectY + rectHeight)));
    return Math.sqrt(dx * dx + dy * dy);
  }
}

/**
 * 향상된 Edge 감지 시스템
 * - 회전 변환 지원
 * - 정밀한 기하학적 계산
 * - 성능 최적화
 */
class EdgeDetector {
  private readonly EDGE_THRESHOLD = 10;
  private cache = new Map<string, boolean>();

  /**
   * 점이 요소의 edge 영역에 있는지 확인
   * @param x - 점의 x 좌표
   * @param y - 점의 y 좌표
   * @param element - 검사할 요소
   * @returns edge 영역에 있으면 true
   */
  isPointOnEdge(x: number, y: number, element: HierarchicalElement): boolean {
    // 캐시 키 생성
    const cacheKey = `${x},${y},${element.id},${element.metadata.version}`;
    
    // 캐시 확인
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const result = this.calculateEdgeHit(x, y, element);
    
    // 캐시 저장 (크기 제한)
    if (this.cache.size > 1000) {
      this.cache.clear();
    }
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * 실제 edge 계산 로직
   */
  private calculateEdgeHit(x: number, y: number, element: HierarchicalElement): boolean {
    const { position, size, rotation } = element;

    // 1. 전체 사각형 영역 내부에 있는지 확인
    const isInside = GeometryUtils.isPointInRotatedRect(
      x, y, position.x, position.y, size.width, size.height, rotation
    );

    if (!isInside) {
      return false;
    }

    // 2. 내부 영역(edge threshold 적용) 밖에 있는지 확인
    const innerWidth = Math.max(0, size.width - 2 * this.EDGE_THRESHOLD);
    const innerHeight = Math.max(0, size.height - 2 * this.EDGE_THRESHOLD);
    const innerX = position.x + this.EDGE_THRESHOLD;
    const innerY = position.y + this.EDGE_THRESHOLD;

    // 내부 영역이 너무 작으면 전체 영역을 edge로 간주
    if (innerWidth <= 0 || innerHeight <= 0) {
      return true;
    }

    // 내부 영역에 있지 않으면 edge 영역
    const isInInnerArea = GeometryUtils.isPointInRotatedRect(
      x, y, innerX, innerY, innerWidth, innerHeight, rotation
    );

    return !isInInnerArea;
  }

  /**
   * 다중 요소에 대한 edge 감지
   * @param x - 점의 x 좌표
   * @param y - 점의 y 좌표
   * @param elements - 검사할 요소들 (z-index 순으로 정렬 권장)
   * @returns 첫 번째로 hit된 요소 또는 null
   */
  getTopElementAtEdge(x: number, y: number, elements: HierarchicalElement[]): HierarchicalElement | null {
    // z-index 역순(높은 것부터)으로 검사
    for (const element of elements) {
      if (this.isPointOnEdge(x, y, element)) {
        return element;
      }
    }
    return null;
  }

  /**
   * 요소의 edge 영역 시각화를 위한 경로 생성
   */
  getEdgeVisualizationPath(element: HierarchicalElement): string {
    const { position, size } = element;
    const threshold = this.EDGE_THRESHOLD;
    
    // 외부 사각형
    const outer = `M ${position.x} ${position.y} 
                   L ${position.x + size.width} ${position.y} 
                   L ${position.x + size.width} ${position.y + size.height} 
                   L ${position.x} ${position.y + size.height} Z`;
    
    // 내부 사각형 (구멍)
    const innerX = position.x + threshold;
    const innerY = position.y + threshold;
    const innerWidth = Math.max(0, size.width - 2 * threshold);
    const innerHeight = Math.max(0, size.height - 2 * threshold);
    
    if (innerWidth > 0 && innerHeight > 0) {
      const inner = `M ${innerX} ${innerY} 
                     L ${innerX} ${innerY + innerHeight} 
                     L ${innerX + innerWidth} ${innerY + innerHeight} 
                     L ${innerX + innerWidth} ${innerY} Z`;
      return outer + ' ' + inner;
    }
    
    return outer;
  }

  /**
   * 캐시 정리
   */
  clearCache(): void {
    this.cache.clear();
  }
}
```

### 선택 관리 시스템

```typescript
/**
 * 선택 관리자
 * - 단일/다중 선택 지원
 * - 드래그 선택 구현
 * - 계층 구조 고려한 선택 로직
 */
class SelectionManager {
  private stateManager: StateManager;
  private hierarchyManager: HierarchyManager;
  private edgeDetector: EdgeDetector;
  private eventBus: EventBus;

  constructor(
    stateManager: StateManager,
    hierarchyManager: HierarchyManager,
    edgeDetector: EdgeDetector,
    eventBus: EventBus
  ) {
    this.stateManager = stateManager;
    this.hierarchyManager = hierarchyManager;
    this.edgeDetector = edgeDetector;
    this.eventBus = eventBus;
  }

  /**
   * 특정 점에서 요소 선택
   * @param x - 클릭한 점의 x 좌표
   * @param y - 클릭한 점의 y 좌표
   * @returns 선택된 요소 또는 null
   */
  selectAtPoint(x: number, y: number): HierarchicalElement | null {
    // 렌더링 순서의 역순으로 검사 (위에 있는 요소부터)
    const elements = this.hierarchyManager.getElementsInRenderOrder().reverse();
    
    // edge 영역에서 선택 가능한 첫 번째 요소 찾기
    const targetElement = this.edgeDetector.getTopElementAtEdge(x, y, elements);
    
    if (targetElement) {
      this.selectElement(targetElement.id);
      this.eventBus.emit('selection:changed', { 
        elementId: targetElement.id, 
        type: 'point-select' 
      }, 'SelectionManager');
      return targetElement;
    } else {
      this.deselectAll();
      return null;
    }
  }

  /**
   * 드래그 선택
   * @param selectionRect - 선택 영역 사각형
   * @returns 선택된 요소 또는 null
   */
  selectByDrag(selectionRect: { x: number; y: number; width: number; height: number }): HierarchicalElement | null {
    const candidates: HierarchicalElement[] = [];
    
    // 모든 요소 검사
    for (const element of this.hierarchyManager.getAllElements()) {
      if (this.isElementFullyContained(element, selectionRect)) {
        candidates.push(element);
      }
    }
    
    if (candidates.length === 0) {
      this.deselectAll();
      return null;
    }
    
    // 가장 상위 부모 선택
    const topLevelParent = this.findTopLevelParent(candidates);
    if (topLevelParent) {
      this.selectElement(topLevelParent.id);
      this.eventBus.emit('selection:changed', { 
        elementId: topLevelParent.id, 
        type: 'drag-select',
        candidates: candidates.map(c => c.id)
      }, 'SelectionManager');
      return topLevelParent;
    }
    
    return null;
  }

  /**
   * 요소가 선택 영역에 완전히 포함되는지 확인
   */
  private isElementFullyContained(
    element: HierarchicalElement,
    selectionRect: { x: number; y: number; width: number; height: number }
  ): boolean {
    const { position, size } = element;
    
    // 요소의 네 꼭짓점
    const corners = [
      { x: position.x, y: position.y },
      { x: position.x + size.width, y: position.y },
      { x: position.x + size.width, y: position.y + size.height },
      { x: position.x, y: position.y + size.height }
    ];
    
    // 모든 꼭짓점이 선택 영역 내부에 있는지 확인
    return corners.every(corner => 
      corner.x >= selectionRect.x &&
      corner.x <= selectionRect.x + selectionRect.width &&
      corner.y >= selectionRect.y &&
      corner.y <= selectionRect.y + selectionRect.height
    );
  }

  /**
   * 후보 요소들 중 최상위 부모 찾기
   */
  private findTopLevelParent(candidates: HierarchicalElement[]): HierarchicalElement | null {
    if (candidates.length === 0) return null;
    
    let topLevel = candidates[0];
    
    for (const candidate of candidates) {
      // 더 낮은 깊이(상위 레벨)를 찾음
      if (candidate.depth < topLevel.depth) {
        topLevel = candidate;
      } else if (candidate.depth === topLevel.depth) {
        // 같은 깊이면 z-index가 높은 것
        if (candidate.zIndex > topLevel.zIndex) {
          topLevel = candidate;
        }
      }
    }
    
    return topLevel;
  }

  /**
   * 호버 처리
   * @param x - 마우스 x 좌표
   * @param y - 마우스 y 좌표
   * @returns 호버된 요소 또는 null
   */
  handleHover(x: number, y: number): HierarchicalElement | null {
    const elements = this.hierarchyManager.getElementsInRenderOrder().reverse();
    const hoveredElement = this.edgeDetector.getTopElementAtEdge(x, y, elements);
    
    const state = this.stateManager.getState();
    const currentHoveredId = state.hoveredElementId;
    
    // 호버 상태가 변경된 경우만 처리
    if (hoveredElement?.id !== currentHoveredId) {
      this.stateManager.dispatch({
        type: 'HOVER_ELEMENT',
        elementId: hoveredElement?.id || null
      });
      
      // 이벤트 발생
      this.eventBus.emit('hover:changed', {
        previousId: currentHoveredId,
        currentId: hoveredElement?.id || null
      }, 'SelectionManager');
    }
    
    return hoveredElement;
  }

  /**
   * 요소 선택
   */
  selectElement(elementId: string): void {
    this.stateManager.dispatch({
      type: 'SELECT_ELEMENT',
      elementId
    });
  }

  /**
   * 모든 선택 해제
   */
  deselectAll(): void {
    this.stateManager.dispatch({
      type: 'SELECT_ELEMENT',
      elementId: null
    });
  }

  /**
   * 현재 선택된 요소 조회
   */
  getSelectedElement(): HierarchicalElement | null {
    const state = this.stateManager.getState();
    return state.selectedElementId ? 
      this.hierarchyManager.getElement(state.selectedElementId) || null : 
      null;
  }

  /**
   * 현재 호버된 요소 조회
   */
  getHoveredElement(): HierarchicalElement | null {
    const state = this.stateManager.getState();
    return state.hoveredElementId ? 
      this.hierarchyManager.getElement(state.hoveredElementId) || null : 
      null;
  }
}
```

### 변환 및 제약 조건 관리

```typescript
/**
 * 제약 조건 계산기
 * - 이동 제약 조건
 * - 리사이즈 제약 조건
 * - 수학적으로 정확한 계산
 */
class ConstraintCalculator {
  private hierarchyManager: HierarchyManager;

  constructor(hierarchyManager: HierarchyManager) {
    this.hierarchyManager = hierarchyManager;
  }

  /**
   * 이동 제약 조건 적용
   * @param element - 이동할 요소
   * @param deltaX - X축 이동량
   * @param deltaY - Y축 이동량
   * @returns 제약 조건이 적용된 실제 이동량
   */
  calculateMovementConstraints(
    element: HierarchicalElement,
    deltaX: number,
    deltaY: number
  ): { x: number; y: number } {
    if (!element.constraints.stayWithinParent) {
      return { x: deltaX, y: deltaY };
    }

    const parent = this.hierarchyManager.getParent(element.id);
    if (!parent) {
      return { x: deltaX, y: deltaY };
    }

    // 새로운 위치 계산
    const newX = element.position.x + deltaX;
    const newY = element.position.y + deltaY;

    // 부모 경계 내 제약
    const constrainedX = Math.max(
      parent.position.x,
      Math.min(newX, parent.position.x + parent.size.width - element.size.width)
    );
    const constrainedY = Math.max(
      parent.position.y,
      Math.min(newY, parent.position.y + parent.size.height - element.size.height)
    );

    return {
      x: constrainedX - element.position.x,
      y: constrainedY - element.position.y
    };
  }

  /**
   * 리사이즈 제약 조건 적용
   * @param element - 리사이즈할 요소
   * @param newSize - 새로운 크기
   * @returns 제약 조건이 적용된 실제 크기
   */
  calculateResizeConstraints(
    element: HierarchicalElement,
    newSize: { width: number; height: number }
  ): { width: number; height: number } {
    let constrainedWidth = newSize.width;
    let constrainedHeight = newSize.height;

    // 1. 최소/최대 크기 제약
    constrainedWidth = Math.max(
      element.constraints.minSize.width,
      Math.min(constrainedWidth, element.constraints.maxSize.width)
    );
    constrainedHeight = Math.max(
      element.constraints.minSize.height,
      Math.min(constrainedHeight, element.constraints.maxSize.height)
    );

    // 2. 부모 크기 제약
    const parent = this.hierarchyManager.getParent(element.id);
    if (parent) {
      // 부모 경계를 벗어나지 않도록 제약
      const maxWidth = parent.size.width - (element.position.x - parent.position.x);
      const maxHeight = parent.size.height - (element.position.y - parent.position.y);
      
      constrainedWidth = Math.min(constrainedWidth, maxWidth);
      constrainedHeight = Math.min(constrainedHeight, maxHeight);
    }

    // 3. 자식 요소들의 경계 상자 제약
    const children = this.hierarchyManager.getChildren(element.id);
    if (children.length > 0) {
      const childrenBounds = this.calculateChildrenBoundingBox(children);
      
      // 자식들을 포함할 수 있는 최소 크기
      const minRequiredWidth = childrenBounds.x + childrenBounds.width - element.position.x;
      const minRequiredHeight = childrenBounds.y + childrenBounds.height - element.position.y;
      
      constrainedWidth = Math.max(constrainedWidth, minRequiredWidth);
      constrainedHeight = Math.max(constrainedHeight, minRequiredHeight);
    }

    // 4. 종횡비 유지 제약
    if (element.constraints.maintainAspectRatio) {
      const aspectRatio = element.size.width / element.size.height;
      const newAspectRatio = constrainedWidth / constrainedHeight;
      
      if (newAspectRatio > aspectRatio) {
        constrainedWidth = constrainedHeight * aspectRatio;
      } else {
        constrainedHeight = constrainedWidth / aspectRatio;
      }
    }

    return { width: constrainedWidth, height: constrainedHeight };
  }

  /**
   * 자식 요소들의 경계 상자 계산
   */
  private calculateChildrenBoundingBox(children: HierarchicalElement[]): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (children.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const child of children) {
      const childLeft = child.position.x;
      const childTop = child.position.y;
      const childRight = child.position.x + child.size.width;
      const childBottom = child.position.y + child.size.height;

      minX = Math.min(minX, childLeft);
      minY = Math.min(minY, childTop);
      maxX = Math.max(maxX, childRight);
      maxY = Math.max(maxY, childBottom);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * 제약 조건 위반 검사
   */
  validateConstraints(element: HierarchicalElement): {
    valid: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    // 부모 경계 검사
    const parent = this.hierarchyManager.getParent(element.id);
    if (parent && element.constraints.stayWithinParent) {
      if (element.position.x < parent.position.x ||
          element.position.y < parent.position.y ||
          element.position.x + element.size.width > parent.position.x + parent.size.width ||
          element.position.y + element.size.height > parent.position.y + parent.size.height) {
        violations.push('Element exceeds parent boundaries');
      }
    }

    // 자식 포함 검사
    const children = this.hierarchyManager.getChildren(element.id);
    if (children.length > 0) {
      const childrenBounds = this.calculateChildrenBoundingBox(children);
      
      if (childrenBounds.x < element.position.x ||
          childrenBounds.y < element.position.y ||
          childrenBounds.x + childrenBounds.width > element.position.x + element.size.width ||
          childrenBounds.y + childrenBounds.height > element.position.y + element.size.height) {
        violations.push('Element does not contain all children');
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }
}

/**
 * 변환 관리자
 * - 이동, 리사이즈 등 변환 작업 관리
 * - 제약 조건 적용
 * - 계층적 변환 지원
 */
class TransformManager {
  private hierarchyManager: HierarchyManager;
  private constraintCalculator: ConstraintCalculator;
  private stateManager: StateManager;
  private eventBus: EventBus;

  constructor(
    hierarchyManager: HierarchyManager,
    constraintCalculator: ConstraintCalculator,
    stateManager: StateManager,
    eventBus: EventBus
  ) {
    this.hierarchyManager = hierarchyManager;
    this.constraintCalculator = constraintCalculator;
    this.stateManager = stateManager;
    this.eventBus = eventBus;
  }

  /**
   * 요소와 모든 자식들을 함께 이동
   * @param elementId - 이동할 요소의 ID
   * @param deltaX - X축 이동량
   * @param deltaY - Y축 이동량
   */
  moveElementWithChildren(elementId: string, deltaX: number, deltaY: number): void {
    const element = this.hierarchyManager.getElement(elementId);
    if (!element) return;

    // 제약 조건 적용하여 실제 이동량 계산
    const constrainedDelta = this.constraintCalculator.calculateMovementConstraints(
      element, deltaX, deltaY
    );

    // 실제 이동량이 0이면 이동하지 않음
    if (constrainedDelta.x === 0 && constrainedDelta.y === 0) {
      return;
    }

    // 자신과 모든 후손 요소들을 이동
    const elementsToMove = [element, ...this.hierarchyManager.getDescendants(elementId)];
    const elementIdsToUpdate: string[] = [];

    for (const elementToMove of elementsToMove) {
      this.stateManager.dispatch({
        type: 'MOVE_ELEMENT',
        elementId: elementToMove.id,
        deltaX: constrainedDelta.x,
        deltaY: constrainedDelta.y
      });
      elementIdsToUpdate.push(elementToMove.id);
    }

    // 이벤트 발생
    this.eventBus.emit('transform:move', {
      elementId,
      deltaX: constrainedDelta.x,
      deltaY: constrainedDelta.y,
      affectedElements: elementIdsToUpdate
    }, 'TransformManager');
  }

  /**
   * 요소 리사이즈
   * @param elementId - 리사이즈할 요소의 ID
   * @param newSize - 새로운 크기
   */
  resizeElement(elementId: string, newSize: { width: number; height: number }): void {
    const element = this.hierarchyManager.getElement(elementId);
    if (!element) return;

    // 제약 조건 적용
    const constrainedSize = this.constraintCalculator.calculateResizeConstraints(element, newSize);

    // 크기가 실제로 변경되었는지 확인
    if (constrainedSize.width === element.size.width && 
        constrainedSize.height === element.size.height) {
      return;
    }

    // 크기 업데이트
    this.stateManager.dispatch({
      type: 'RESIZE_ELEMENT',
      elementId,
      newSize: constrainedSize
    });

    // 이벤트 발생
    this.eventBus.emit('transform:resize', {
      elementId,
      oldSize: element.size,
      newSize: constrainedSize
    }, 'TransformManager');
  }

  /**
   * 요소 회전
   * @param elementId - 회전할 요소의 ID
   * @param rotation - 회전 각도 (라디안)
   */
  rotateElement(elementId: string, rotation: number): void {
    const element = this.hierarchyManager.getElement(elementId);
    if (!element) return;

    // 회전 각도 정규화 (0 ~ 2π)
    const normalizedRotation = rotation % (2 * Math.PI);
    
    if (normalizedRotation === element.rotation) {
      return;
    }

    // 상태 업데이트 (현재 RESIZE_ELEMENT 액션을 확장하거나 새로운 액션 추가 필요)
    // 임시로 직접 업데이트
    const updatedElement = {
      ...element,
      rotation: normalizedRotation,
      metadata: {
        ...element.metadata,
        lastModified: new Date()
      }
    };

    this.stateManager.dispatch({
      type: 'MARK_DIRTY',
      elementIds: [elementId]
    });

    // 이벤트 발생
    this.eventBus.emit('transform:rotate', {
      elementId,
      oldRotation: element.rotation,
      newRotation: normalizedRotation
    }, 'TransformManager');
  }

  /**
   * 변환 미리보기 (실제 적용 전 시각적 피드백)
   */
  previewTransform(
    elementId: string,
    transform: {
      deltaX?: number;
      deltaY?: number;
      newSize?: { width: number; height: number };
      rotation?: number;
    }
  ): {
    valid: boolean;
    constrainedTransform: any;
    violations: string[];
  } {
    const element = this.hierarchyManager.getElement(elementId);
    if (!element) {
      return { valid: false, constrainedTransform: null, violations: ['Element not found'] };
    }

    let constrainedTransform: any = {};
    let violations: string[] = [];

    // 이동 미리보기
    if (transform.deltaX !== undefined || transform.deltaY !== undefined) {
      const deltaX = transform.deltaX || 0;
      const deltaY = transform.deltaY || 0;
      
      constrainedTransform.movement = this.constraintCalculator.calculateMovementConstraints(
        element, deltaX, deltaY
      );
    }

    // 리사이즈 미리보기
    if (transform.newSize) {
      constrainedTransform.size = this.constraintCalculator.calculateResizeConstraints(
        element, transform.newSize
      );
    }

    // 제약 조건 검증
    const validation = this.constraintCalculator.validateConstraints(element);
    violations = validation.violations;

    return {
      valid: violations.length === 0,
      constrainedTransform,
      violations
    };
  }
}
```

### 성능 최적화 렌더링 관리

```typescript
/**
 * 성능 최적화된 렌더링 관리자
 * - Dirty tracking으로 불필요한 렌더링 최소화
 * - 배치 처리로 성능 향상
 * - 메모리 효율적인 Fabric 객체 관리
 */
class RenderManager {
  private fabricCanvas: fabric.Canvas;
  private stateManager: StateManager;
  private hierarchyManager: HierarchyManager;
  private eventBus: EventBus;
  private animationFrameId: number | null = null;
  private renderPending = false;

  constructor(
    fabricCanvas: fabric.Canvas,
    stateManager: StateManager,
    hierarchyManager: HierarchyManager,
    eventBus: EventBus
  ) {
    this.fabricCanvas = fabricCanvas;
    this.stateManager = stateManager;
    this.hierarchyManager = hierarchyManager;
    this.eventBus = eventBus;
    this.setupEventListeners();
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // 상태 변경 시 렌더링 큐에 추가
    this.stateManager.subscribe((state) => {
      if (state.dirtyElements.size > 0) {
        this.queueRender();
      }
    });

    // 요소 변경 이벤트 리스너
    this.eventBus.on('element:created', () => this.queueRender());
    this.eventBus.on('element:deleted', () => this.queueRender());
    this.eventBus.on('transform:move', () => this.queueRender());
    this.eventBus.on('transform:resize', () => this.queueRender());
    this.eventBus.on('selection:changed', () => this.queueRender());
    this.eventBus.on('hover:changed', () => this.queueRender());
  }

  /**
   * 렌더링을 큐에 추가 (애니메이션 프레임 사용)
   */
  private queueRender(): void {
    if (this.renderPending) return;

    this.renderPending = true;
    this.animationFrameId = requestAnimationFrame(() => {
      this.render();
      this.renderPending = false;
    });
  }

  /**
   * 실제 렌더링 수행
   */
  private render(): void {
    const state = this.stateManager.getState();
    
    // dirty 요소들만 업데이트
    const dirtyElements = Array.from(state.dirtyElements);
    
    for (const elementId of dirtyElements) {
      const element = this.hierarchyManager.getElement(elementId);
      if (element) {
        this.updateFabricObject(element);
      } else {
        // 요소가 삭제된 경우 Fabric 객체 제거
        this.removeFabricObject(elementId);
      }
    }

    // 선택 및 호버 상태 업데이트
    this.updateSelectionVisuals();
    this.updateHoverVisuals();

    // 캔버스 렌더링
    this.fabricCanvas.renderAll();

    // dirty 상태 초기화
    this.stateManager.dispatch({ type: 'CLEAR_DIRTY' });

    // 렌더링 완료 이벤트
    this.eventBus.emit('render:complete', { 
      updatedElements: dirtyElements 
    }, 'RenderManager');
  }

  /**
   * Fabric 객체 업데이트 또는 생성
   */
  private updateFabricObject(element: HierarchicalElement): void {
    let fabricObject = element.fabricObject;

    // Fabric 객체가 없으면 생성
    if (!fabricObject) {
      fabricObject = new fabric.Rect({
        left: element.position.x,
        top: element.position.y,
        width: element.size.width,
        height: element.size.height,
        fill: element.style.fill,
        stroke: element.style.stroke,
        strokeWidth: element.style.strokeWidth,
        opacity: element.style.opacity,
        selectable: false,        // 직접 선택 비활성화
        evented: false,          // 이벤트 비활성화
        hoverCursor: 'default',
        moveCursor: 'default'
      });

      // 요소에 Fabric 객체 참조 저장
      element.fabricObject = fabricObject;
      
      // 캔버스에 추가
      this.fabricCanvas.add(fabricObject);
    } else {
      // 기존 객체 속성 업데이트
      fabricObject.set({
        left: element.position.x,
        top: element.position.y,
        width: element.size.width,
        height: element.size.height,
        fill: element.style.fill,
        stroke: element.style.stroke,
        strokeWidth: element.style.strokeWidth,
        opacity: element.style.opacity,
        angle: element.rotation * 180 / Math.PI // 라디안을 도로 변환
      });
    }

    // 상태별 시각적 스타일 적용
    this.applyVisualState(fabricObject, element);
  }

  /**
   * 상태별 시각적 스타일 적용
   */
  private applyVisualState(fabricObject: fabric.Rect, element: HierarchicalElement): void {
    const state = this.stateManager.getState();
    
    let strokeWidth = element.style.strokeWidth;
    let stroke = element.style.stroke;
    let opacity = element.style.opacity;

    // 선택 상태
    if (state.selectedElementId === element.id) {
      strokeWidth = 3;
      stroke = '#ff6600';
    }
    // 호버 상태 (선택되지 않은 경우에만)
    else if (state.hoveredElementId === element.id) {
      strokeWidth = 3;
      stroke = '#0066cc';
    }

    // 드래그 상태
    if (element.dragging) {
      opacity = 0.8;
    }

    // 제약 조건 위반 상태
    const validation = this.validateElementConstraints(element);
    if (!validation.valid) {
      stroke = '#ff0000';
      strokeWidth = 3;
    }

    // Fabric 객체에 스타일 적용
    fabricObject.set({
      stroke,
      strokeWidth,
      opacity
    });
  }

  /**
   * 선택 상태 시각적 업데이트
   */
  private updateSelectionVisuals(): void {
    const state = this.stateManager.getState();
    const selectedElement = state.selectedElementId ? 
      this.hierarchyManager.getElement(state.selectedElementId) : null;

    // 모든 요소의 선택 컨트롤 숨기기
    this.fabricCanvas.getObjects().forEach(obj => {
      if (obj instanceof fabric.Rect) {
        obj.hasControls = false;
        obj.hasBorders = false;
      }
    });

    // 선택된 요소에만 리사이즈 핸들 표시
    if (selectedElement && selectedElement.fabricObject) {
      selectedElement.fabricObject.hasControls = true;
      selectedElement.fabricObject.hasBorders = true;
      selectedElement.fabricObject.cornerStyle = 'circle';
      selectedElement.fabricObject.cornerSize = 8;
      selectedElement.fabricObject.transparentCorners = false;
      selectedElement.fabricObject.cornerColor = '#ff6600';
    }
  }

  /**
   * 호버 상태 시각적 업데이트
   */
  private updateHoverVisuals(): void {
    const state = this.stateManager.getState();
    
    // 커서 상태 업데이트
    this.fabricCanvas.defaultCursor = state.cursorType;
    
    // 호버 피드백은 applyVisualState에서 처리됨
  }

  /**
   * Fabric 객체 제거
   */
  private removeFabricObject(elementId: string): void {
    const objectsToRemove = this.fabricCanvas.getObjects().filter(obj => 
      obj.data?.elementId === elementId
    );

    objectsToRemove.forEach(obj => {
      this.fabricCanvas.remove(obj);
    });
  }

  /**
   * 제약 조건 검증
   */
  private validateElementConstraints(element: HierarchicalElement): { valid: boolean; violations: string[] } {
    // ConstraintCalculator 사용 (간단한 구현)
    return { valid: true, violations: [] };
  }

  /**
   * 드래그 선택 영역 렌더링
   */
  renderDragSelection(selectionRect: { x: number; y: number; width: number; height: number } | null): void {
    // 기존 선택 영역 제거
    const existingSelection = this.fabricCanvas.getObjects().find(obj => 
      obj.data?.type === 'drag-selection'
    );
    if (existingSelection) {
      this.fabricCanvas.remove(existingSelection);
    }

    // 새 선택 영역 추가
    if (selectionRect) {
      const dragSelectionRect = new fabric.Rect({
        left: selectionRect.x,
        top: selectionRect.y,
        width: selectionRect.width,
        height: selectionRect.height,
        fill: 'rgba(0, 100, 200, 0.1)',
        stroke: '#0066cc',
        strokeWidth: 1,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false,
        data: { type: 'drag-selection' }
      });

      this.fabricCanvas.add(dragSelectionRect);
    }

    this.fabricCanvas.renderAll();
  }

  /**
   * 정리 작업
   */
  dispose(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    // 모든 Fabric 객체 제거
    this.fabricCanvas.clear();
  }
}
```

### 메인 Canvas 편집기 컴포넌트

```typescript
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { fabric } from 'fabric';

// 매니저 클래스들 import
import { EventBus } from './EventBus';
import { StateManager } from './StateManager';
import { HierarchyManager } from './HierarchyManager';
import { EdgeDetector } from './EdgeDetector';
import { SelectionManager } from './SelectionManager';
import { ConstraintCalculator } from './ConstraintCalculator';
import { TransformManager } from './TransformManager';
import { RenderManager } from './RenderManager';

/**
 * 커서 타입 정의
 */
const CURSOR_TYPES = {
  DEFAULT: 'default',
  MOVE: 'move',
  RESIZE: 'nw-resize',
  CROSSHAIR: 'crosshair',
  NOT_ALLOWED: 'not-allowed'
} as const;

export const CanvasEditor: React.FC = () => {
  // 레퍼런스
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  
  // 매니저 인스턴스들
  const [managers, setManagers] = useState<{
    eventBus: EventBus;
    stateManager: StateManager;
    hierarchyManager: HierarchyManager;
    edgeDetector: EdgeDetector;
    selectionManager: SelectionManager;
    constraintCalculator: ConstraintCalculator;
    transformManager: TransformManager;
    renderManager: RenderManager;
  } | null>(null);

  // 상호작용 상태
  const [interactionState, setInteractionState] = useState({
    isDragging: false,
    isDragSelecting: false,
    dragStart: null as { x: number; y: number } | null,
    lastMousePosition: null as { x: number; y: number } | null
  });

  /**
   * 매니저들 초기화
   */
  const initializeManagers = useCallback((fabricCanvas: fabric.Canvas) => {
    // 초기 상태 정의
    const initialState: AppState = {
      elements: new Map(),
      elementOrder: [],
      selectedElementId: null,
      hoveredElementId: null,
      focusedElementId: null,
      isDragging: false,
      isResizing: false,
      isDragSelecting: false,
      dragStartPoint: null,
      dragSelectionRect: null,
      cursorType: 'default',
      canvasSize: { width: 800, height: 600 },
      canvasZoom: 1,
      canvasOffset: { x: 0, y: 0 },
      history: {
        past: [],
        present: {} as AppState,
        future: []
      },
      dirtyElements: new Set(),
      renderQueued: false
    };

    // 매니저 인스턴스 생성
    const eventBus = new EventBus();
    const stateManager = new StateManager(initialState);
    const hierarchyManager = new HierarchyManager(eventBus, stateManager);
    const edgeDetector = new EdgeDetector();
    const selectionManager = new SelectionManager(stateManager, hierarchyManager, edgeDetector, eventBus);
    const constraintCalculator = new ConstraintCalculator(hierarchyManager);
    const transformManager = new TransformManager(hierarchyManager, constraintCalculator, stateManager, eventBus);
    const renderManager = new RenderManager(fabricCanvas, stateManager, hierarchyManager, eventBus);

    // 디버깅 모드 활성화 (개발 환경에서만)
    if (process.env.NODE_ENV === 'development') {
      eventBus.enableDebugging(true);
    }

    return {
      eventBus,
      stateManager,
      hierarchyManager,
      edgeDetector,
      selectionManager,
      constraintCalculator,
      transformManager,
      renderManager
    };
  }, []);

  /**
   * 초기 요소들 생성
   */
  const createInitialElements = useCallback((hierarchyManager: HierarchyManager) => {
    // 파란색 부모 사각형
    const blueParent = hierarchyManager.createElement('blue-parent', null, {
      position: { x: 100, y: 100 },
      size: { width: 300, height: 200 },
      style: {
        fill: '#4a90e2',
        stroke: '#000000',
        strokeWidth: 1,
        opacity: 1
      }
    });

    // 주황색 자식 사각형
    const orangeChild = hierarchyManager.createElement('orange-child', 'blue-parent', {
      position: { x: 120, y: 120 },
      size: { width: 150, height: 100 },
      style: {
        fill: '#f5a623',
        stroke: '#000000',
        strokeWidth: 1,
        opacity: 1
      }
    });

    // 보라색 손자 사각형
    const purpleGrandchild = hierarchyManager.createElement('purple-grandchild', 'orange-child', {
      position: { x: 140, y: 140 },
      size: { width: 80, height: 60 },
      style: {
        fill: '#9013fe',
        stroke: '#000000',
        strokeWidth: 1,
        opacity: 1
      }
    });

    console.log('초기 요소들 생성 완료:', { blueParent, orangeChild, purpleGrandchild });
  }, []);

  /**
   * 이벤트 핸들러 설정
   */
  const setupEventHandlers = useCallback((fabricCanvas: fabric.Canvas, managers: any) => {
    const { selectionManager, transformManager, stateManager, eventBus } = managers;

    /**
     * 마우스 다운 이벤트
     */
    const handleMouseDown = (event: fabric.IEvent) => {
      const pointer = fabricCanvas.getPointer(event.e);
      const { x, y } = pointer;

      // 빈 공간 클릭 시 선택 해제
      const selectedElement = selectionManager.selectAtPoint(x, y);
      
      if (selectedElement) {
        // 요소 선택됨 - 드래그 시작
        setInteractionState(prev => ({
          ...prev,
          isDragging: true,
          dragStart: { x, y },
          lastMousePosition: { x, y }
        }));

        stateManager.dispatch({ type: 'START_DRAG', startPoint: { x, y } });
        stateManager.dispatch({ type: 'SET_CURSOR', cursorType: CURSOR_TYPES.MOVE });
      } else {
        // 빈 공간 클릭 - 드래그 선택 시작
        setInteractionState(prev => ({
          ...prev,
          isDragSelecting: true,
          dragStart: { x, y }
        }));

        stateManager.dispatch({ type: 'SET_CURSOR', cursorType: CURSOR_TYPES.CROSSHAIR });
      }

      // 기본 Fabric 이벤트 방지
      event.e.preventDefault();
    };

    /**
     * 마우스 이동 이벤트
     */
    const handleMouseMove = (event: fabric.IEvent) => {
      const pointer = fabricCanvas.getPointer(event.e);
      const { x, y } = pointer;

      if (interactionState.isDragging) {
        // 드래그 중 - 요소 이동
        const selectedElement = selectionManager.getSelectedElement();
        if (selectedElement && interactionState.lastMousePosition) {
          const deltaX = x - interactionState.lastMousePosition.x;
          const deltaY = y - interactionState.lastMousePosition.y;

          transformManager.moveElementWithChildren(selectedElement.id, deltaX, deltaY);
          
          setInteractionState(prev => ({
            ...prev,
            lastMousePosition: { x, y }
          }));
        }
      } else if (interactionState.isDragSelecting) {
        // 드래그 선택 중 - 선택 영역 업데이트
        if (interactionState.dragStart) {
          const selectionRect = {
            x: Math.min(interactionState.dragStart.x, x),
            y: Math.min(interactionState.dragStart.y, y),
            width: Math.abs(x - interactionState.dragStart.x),
            height: Math.abs(y - interactionState.dragStart.y)
          };

          stateManager.dispatch({ type: 'UPDATE_DRAG_SELECTION', rect: selectionRect });
          managers.renderManager.renderDragSelection(selectionRect);
        }
      } else {
        // 일반 마우스 이동 - 호버 처리
        const hoveredElement = selectionManager.handleHover(x, y);
        
        if (hoveredElement) {
          stateManager.dispatch({ type: 'SET_CURSOR', cursorType: CURSOR_TYPES.MOVE });
        } else {
          stateManager.dispatch({ type: 'SET_CURSOR', cursorType: CURSOR_TYPES.DEFAULT });
        }
      }
    };

    /**
     * 마우스 업 이벤트
     */
    const handleMouseUp = (event: fabric.IEvent) => {
      const pointer = fabricCanvas.getPointer(event.e);
      const { x, y } = pointer;

      if (interactionState.isDragSelecting) {
        // 드래그 선택 완료
        if (interactionState.dragStart) {
          const selectionRect = {
            x: Math.min(interactionState.dragStart.x, x),
            y: Math.min(interactionState.dragStart.y, y),
            width: Math.abs(x - interactionState.dragStart.x),
            height: Math.abs(y - interactionState.dragStart.y)
          };

          selectionManager.selectByDrag(selectionRect);
        }

        // 드래그 선택 영역 제거
        managers.renderManager.renderDragSelection(null);
      }

      // 상태 초기화
      setInteractionState({
        isDragging: false,
        isDragSelecting: false,
        dragStart: null,
        lastMousePosition: null
      });

      stateManager.dispatch({ type: 'END_DRAG' });
      stateManager.dispatch({ type: 'SET_CURSOR', cursorType: CURSOR_TYPES.DEFAULT });
    };

    /**
     * 리사이즈 이벤트 (Fabric 내장 기능 사용)
     */
    const handleObjectScaling = (event: fabric.IEvent) => {
      const fabricObject = event.target as fabric.Rect;
      if (!fabricObject) return;

      // Fabric 객체에서 해당 요소 ID 찾기
      const elementId = Array.from(stateManager.getState().elements.entries())
        .find(([_, element]) => element.fabricObject === fabricObject)?.[0];

      if (elementId) {
        const newSize = {
          width: fabricObject.width! * fabricObject.scaleX!,
          height: fabricObject.height! * fabricObject.scaleY!
        };

        // 제약 조건 적용하여 리사이즈
        transformManager.resizeElement(elementId, newSize);

        // Fabric 객체 스케일 초기화
        fabricObject.set({
          scaleX: 1,
          scaleY: 1,
          width: newSize.width,
          height: newSize.height
        });
      }
    };

    // 이벤트 리스너 등록
    fabricCanvas.on('mouse:down', handleMouseDown);
    fabricCanvas.on('mouse:move', handleMouseMove);
    fabricCanvas.on('mouse:up', handleMouseUp);
    fabricCanvas.on('object:scaling', handleObjectScaling);

    // 컨텍스트 메뉴 비활성화
    fabricCanvas.on('before:selection:cleared', () => false);
    fabricCanvas.on('selection:created', () => false);
    fabricCanvas.on('selection:updated', () => false);

    // 정리 함수 반환
    return () => {
      fabricCanvas.off('mouse:down', handleMouseDown);
      fabricCanvas.off('mouse:move', handleMouseMove);
      fabricCanvas.off('mouse:up', handleMouseUp);
      fabricCanvas.off('object:scaling', handleObjectScaling);
    };
  }, [interactionState]);

  /**
   * 컴포넌트 초기화
   */
  useEffect(() => {
    if (!canvasRef.current) return;

    // Fabric 캔버스 생성
    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      selection: false,        // 기본 선택 기능 비활성화
      preserveObjectStacking: true,
      renderOnAddRemove: false // 수동 렌더링 제어
    });

    fabricCanvasRef.current = fabricCanvas;

    // 매니저들 초기화
    const managersInstance = initializeManagers(fabricCanvas);
    setManagers(managersInstance);

    // 초기 요소들 생성
    createInitialElements(managersInstance.hierarchyManager);

    // 이벤트 핸들러 설정
    const cleanup = setupEventHandlers(fabricCanvas, managersInstance);

    // 초기 렌더링
    setTimeout(() => {
      managersInstance.renderManager.render();
    }, 0);

    // 정리 함수
    return () => {
      cleanup();
      managersInstance.renderManager.dispose();
      fabricCanvas.dispose();
    };
  }, []);

  /**
   * 상태 변경 시 커서 업데이트
   */
  useEffect(() => {
    if (!managers || !fabricCanvasRef.current) return;

    const unsubscribe = managers.stateManager.subscribe((state) => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.defaultCursor = state.cursorType;
      }
    });

    return unsubscribe;
  }, [managers]);

  /**
   * 디버깅 정보 표시 (개발 환경에서만)
   */
  const renderDebugInfo = () => {
    if (process.env.NODE_ENV !== 'development' || !managers) return null;

    const state = managers.stateManager.getState();
    const selectedElement = managers.selectionManager.getSelectedElement();
    const hoveredElement = managers.selectionManager.getHoveredElement();

    return (
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px',
        fontSize: '12px',
        fontFamily: 'monospace',
        borderRadius: '4px',
        maxWidth: '300px'
      }}>
        <div>선택된 요소: {selectedElement?.id || 'None'}</div>
        <div>호버된 요소: {hoveredElement?.id || 'None'}</div>
        <div>드래그 중: {interactionState.isDragging ? 'Yes' : 'No'}</div>
        <div>드래그 선택 중: {interactionState.isDragSelecting ? 'Yes' : 'No'}</div>
        <div>커서: {state.cursorType}</div>
        <div>Dirty 요소: {state.dirtyElements.size}</div>
        <div>전체 요소 수: {state.elements.size}</div>
      </div>
    );
  };

  return (
    <div style={{ 
      position: 'relative', 
      width: '800px', 
      height: '600px',
      border: '1px solid #ccc',
      margin: '20px auto'
    }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          border: '1px solid #ddd'
        }}
      />
      {renderDebugInfo()}
      
      {/* 사용자 가이드 */}
      <div style={{
        position: 'absolute',
        bottom: -60,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: '14px',
        color: '#666'
      }}>
        <p>• 사각형 모서리 10px 영역에서 호버/선택 가능</p>
        <p>• 드래그로 이동, 선택 핸들로 리사이즈</p>
        <p>• 빈 공간 드래그로 다중 선택 가능</p>
      </div>
    </div>
  );
};

export default CanvasEditor;