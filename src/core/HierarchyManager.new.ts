import { HierarchicalElement } from './types';
import { EventBus } from './EventBus';
import { StateManager } from './StateManager';

/**
 * 계층적 요소 관리자
 * - 트리 구조 관리
 * - 효율적인 검색 및 순회
 * - 제약 조건 검증
 */
export class HierarchyManager {
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

  /**
   * 초기 3개 사각형 생성
   */
  initializeThreeRectangles(): void {
    // 파란색 부모 사각형
    this.createElement('blue-parent', null, {
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
    this.createElement('orange-child', 'blue-parent', {
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
    this.createElement('purple-grandchild', 'orange-child', {
      position: { x: 140, y: 140 },
      size: { width: 80, height: 60 },
      style: {
        fill: '#9013fe',
        stroke: '#000000',
        strokeWidth: 1,
        opacity: 1
      }
    });
  }

  /**
   * 디버깅 정보
   */
  getDebugInfo(): {
    totalElements: number;
    rootElements: number;
    maxDepth: number;
    elementsByDepth: { [depth: number]: number };
  } {
    const elements = Array.from(this.elements.values());
    const maxDepth = elements.reduce((max, el) => Math.max(max, el.depth), 0);
    const elementsByDepth: { [depth: number]: number } = {};
    
    elements.forEach(el => {
      elementsByDepth[el.depth] = (elementsByDepth[el.depth] || 0) + 1;
    });

    return {
      totalElements: elements.length,
      rootElements: this.rootElementIds.length,
      maxDepth,
      elementsByDepth
    };
  }
}