import { HierarchicalElement } from './types';
import { StateManager } from './StateManager';
import { HierarchyManager } from './HierarchyManager.new';
import { EdgeDetector } from './EdgeDetector';
import { EventBus } from './EventBus';

/**
 * 선택 관리자
 * - 단일/다중 선택 지원
 * - 드래그 선택 구현
 * - 계층 구조 고려한 선택 로직
 */
export class SelectionManager {
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

  /**
   * 다중 선택 (Ctrl/Cmd + 클릭)
   */
  addToSelection(elementId: string): void {
    // 현재는 단일 선택만 지원
    // 추후 다중 선택 구현 시 확장 가능
    this.selectElement(elementId);
  }

  /**
   * 선택에서 제거
   */
  removeFromSelection(elementId: string): void {
    const state = this.stateManager.getState();
    if (state.selectedElementId === elementId) {
      this.deselectAll();
    }
  }

  /**
   * 선택 토글
   */
  toggleSelection(elementId: string): void {
    const state = this.stateManager.getState();
    if (state.selectedElementId === elementId) {
      this.deselectAll();
    } else {
      this.selectElement(elementId);
    }
  }

  /**
   * 모든 요소 선택
   */
  selectAll(): void {
    // 현재는 단일 선택만 지원
    // 추후 다중 선택 구현 시 확장 가능
    const elements = Array.from(this.hierarchyManager.getAllElements());
    if (elements.length > 0) {
      this.selectElement(elements[0].id);
    }
  }

  /**
   * 다음 요소 선택 (키보드 네비게이션)
   */
  selectNext(): void {
    const elements = this.hierarchyManager.getElementsInRenderOrder();
    const currentSelected = this.getSelectedElement();
    
    if (!currentSelected) {
      if (elements.length > 0) {
        this.selectElement(elements[0].id);
      }
      return;
    }
    
    const currentIndex = elements.findIndex(el => el.id === currentSelected.id);
    const nextIndex = (currentIndex + 1) % elements.length;
    this.selectElement(elements[nextIndex].id);
  }

  /**
   * 이전 요소 선택 (키보드 네비게이션)
   */
  selectPrevious(): void {
    const elements = this.hierarchyManager.getElementsInRenderOrder();
    const currentSelected = this.getSelectedElement();
    
    if (!currentSelected) {
      if (elements.length > 0) {
        this.selectElement(elements[elements.length - 1].id);
      }
      return;
    }
    
    const currentIndex = elements.findIndex(el => el.id === currentSelected.id);
    const prevIndex = currentIndex === 0 ? elements.length - 1 : currentIndex - 1;
    this.selectElement(elements[prevIndex].id);
  }

  /**
   * 부모 요소 선택
   */
  selectParent(): void {
    const currentSelected = this.getSelectedElement();
    if (!currentSelected) return;
    
    const parent = this.hierarchyManager.getParent(currentSelected.id);
    if (parent) {
      this.selectElement(parent.id);
    }
  }

  /**
   * 첫 번째 자식 요소 선택
   */
  selectFirstChild(): void {
    const currentSelected = this.getSelectedElement();
    if (!currentSelected) return;
    
    const children = this.hierarchyManager.getChildren(currentSelected.id);
    if (children.length > 0) {
      this.selectElement(children[0].id);
    }
  }

  /**
   * 선택 상태 검증
   */
  isSelected(elementId: string): boolean {
    const state = this.stateManager.getState();
    return state.selectedElementId === elementId;
  }

  /**
   * 호버 상태 검증
   */
  isHovered(elementId: string): boolean {
    const state = this.stateManager.getState();
    return state.hoveredElementId === elementId;
  }

  /**
   * 디버깅 정보
   */
  getDebugInfo(): {
    selectedElement: string | null;
    hoveredElement: string | null;
    totalElements: number;
    edgeThreshold: number;
  } {
    const state = this.stateManager.getState();
    return {
      selectedElement: state.selectedElementId,
      hoveredElement: state.hoveredElementId,
      totalElements: state.elements.size,
      edgeThreshold: this.edgeDetector.getEdgeThreshold()
    };
  }
}