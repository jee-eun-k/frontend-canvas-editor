import { HierarchicalElement } from './types';
import { HierarchyManager } from './HierarchyManager.new';
import { ConstraintCalculator } from './ConstraintCalculator';
import { StateManager } from './StateManager';
import { EventBus } from './EventBus';

/**
 * 변환 관리자
 * - 이동, 리사이즈 등 변환 작업 관리
 * - 제약 조건 적용
 * - 계층적 변환 지원
 */
export class TransformManager {
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

    const oldSize = { ...element.size };

    // 크기 업데이트
    this.stateManager.dispatch({
      type: 'RESIZE_ELEMENT',
      elementId,
      newSize: constrainedSize
    });

    // 자식 요소들의 위치 재계산
    this.repositionChildrenAfterResize(elementId, oldSize);

    // 이벤트 발생
    this.eventBus.emit('transform:resize', {
      elementId,
      oldSize,
      newSize: constrainedSize
    }, 'TransformManager');
  }

  /**
   * 부모 리사이즈 후 자식들의 위치 재계산
   */
  private repositionChildrenAfterResize(
    parentId: string,
    oldSize: { width: number; height: number }
  ): void {
    const parent = this.hierarchyManager.getElement(parentId);
    if (!parent) return;

    const newPositions = this.constraintCalculator.recalculateChildrenPositions(parent, oldSize);

    // 자식들의 위치 업데이트
    for (const [childId, newPosition] of Object.entries(newPositions)) {
      const child = this.hierarchyManager.getElement(childId);
      if (child) {
        const deltaX = newPosition.x - child.position.x;
        const deltaY = newPosition.y - child.position.y;
        
        this.stateManager.dispatch({
          type: 'MOVE_ELEMENT',
          elementId: childId,
          deltaX,
          deltaY
        });
      }
    }
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

    // 상태 업데이트를 위한 임시 해결책
    // 실제로는 ROTATE_ELEMENT 액션을 추가해야 함
    const updatedElement = {
      ...element,
      rotation: normalizedRotation,
      metadata: {
        ...element.metadata,
        lastModified: new Date(),
        version: element.metadata.version + 1
      }
    };

    // 직접 상태 업데이트 (임시)
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
   * 요소 위치 설정 (절대 위치)
   */
  setElementPosition(elementId: string, position: { x: number; y: number }): void {
    const element = this.hierarchyManager.getElement(elementId);
    if (!element) return;

    // 제약 조건 적용
    const constrainedPosition = this.constraintCalculator.constrainPosition(element, position);

    const deltaX = constrainedPosition.x - element.position.x;
    const deltaY = constrainedPosition.y - element.position.y;

    this.moveElementWithChildren(elementId, deltaX, deltaY);
  }

  /**
   * 요소 크기 설정 (절대 크기)
   */
  setElementSize(elementId: string, size: { width: number; height: number }): void {
    this.resizeElement(elementId, size);
  }

  /**
   * 요소 변환 (위치, 크기, 회전 동시 적용)
   */
  transformElement(
    elementId: string,
    transform: {
      position?: { x: number; y: number };
      size?: { width: number; height: number };
      rotation?: number;
    }
  ): void {
    // 순서가 중요: 회전 -> 크기 -> 위치 순으로 적용
    if (transform.rotation !== undefined) {
      this.rotateElement(elementId, transform.rotation);
    }

    if (transform.size) {
      this.resizeElement(elementId, transform.size);
    }

    if (transform.position) {
      this.setElementPosition(elementId, transform.position);
    }
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

  /**
   * 스냅 기능이 포함된 이동
   */
  moveElementWithSnap(
    elementId: string,
    deltaX: number,
    deltaY: number,
    snapToGrid: boolean = false,
    snapToGuidelines: boolean = false,
    gridSize: number = 10
  ): void {
    const element = this.hierarchyManager.getElement(elementId);
    if (!element) return;

    // 기본 이동 계산
    let newPosition = {
      x: element.position.x + deltaX,
      y: element.position.y + deltaY
    };

    // 스냅 적용
    if (snapToGrid) {
      newPosition = this.constraintCalculator.applySnapToGrid(newPosition, gridSize);
    }

    if (snapToGuidelines) {
      newPosition = this.constraintCalculator.applySnapToGuidelines(element, newPosition);
    }

    // 최종 위치 설정
    this.setElementPosition(elementId, newPosition);
  }

  /**
   * 여러 요소 동시 이동
   */
  moveMultipleElements(
    elementIds: string[],
    deltaX: number,
    deltaY: number
  ): void {
    for (const elementId of elementIds) {
      this.moveElementWithChildren(elementId, deltaX, deltaY);
    }

    // 배치 이벤트 발생
    this.eventBus.emit('transform:batch-move', {
      elementIds,
      deltaX,
      deltaY
    }, 'TransformManager');
  }

  /**
   * 요소 복제
   */
  duplicateElement(elementId: string, offset: { x: number; y: number } = { x: 10, y: 10 }): string | null {
    const element = this.hierarchyManager.getElement(elementId);
    if (!element) return null;

    const newId = `${element.id}_copy_${Date.now()}`;
    const newPosition = {
      x: element.position.x + offset.x,
      y: element.position.y + offset.y
    };

    try {
      const duplicatedElement = this.hierarchyManager.createElement(newId, element.parentId, {
        ...element,
        id: newId,
        position: newPosition,
        selected: false,
        hovered: false,
        metadata: {
          createdAt: new Date(),
          lastModified: new Date(),
          version: 1
        }
      });

      // 자식 요소들도 재귀적으로 복제
      this.duplicateChildren(element.id, newId, offset);

      // 이벤트 발생
      this.eventBus.emit('transform:duplicate', {
        originalElementId: elementId,
        newElementId: newId,
        offset
      }, 'TransformManager');

      return newId;
    } catch (error) {
      console.error('Failed to duplicate element:', error);
      return null;
    }
  }

  /**
   * 자식 요소들 재귀적 복제
   */
  private duplicateChildren(
    originalParentId: string,
    newParentId: string,
    offset: { x: number; y: number }
  ): void {
    const children = this.hierarchyManager.getChildren(originalParentId);

    for (const child of children) {
      const newChildId = `${child.id}_copy_${Date.now()}`;
      const newPosition = {
        x: child.position.x + offset.x,
        y: child.position.y + offset.y
      };

      this.hierarchyManager.createElement(newChildId, newParentId, {
        ...child,
        id: newChildId,
        position: newPosition,
        selected: false,
        hovered: false,
        metadata: {
          createdAt: new Date(),
          lastModified: new Date(),
          version: 1
        }
      });

      // 자식의 자식들도 재귀적으로 복제
      this.duplicateChildren(child.id, newChildId, offset);
    }
  }

  /**
   * 요소 정렬
   */
  alignElements(elementIds: string[], alignment: 'left' | 'right' | 'top' | 'bottom' | 'center-x' | 'center-y'): void {
    if (elementIds.length < 2) return;

    const elements = elementIds.map(id => this.hierarchyManager.getElement(id)).filter(Boolean) as HierarchicalElement[];
    if (elements.length < 2) return;

    let referenceValue: number;

    switch (alignment) {
      case 'left':
        referenceValue = Math.min(...elements.map(el => el.position.x));
        elements.forEach(el => this.setElementPosition(el.id, { x: referenceValue, y: el.position.y }));
        break;
      case 'right':
        referenceValue = Math.max(...elements.map(el => el.position.x + el.size.width));
        elements.forEach(el => this.setElementPosition(el.id, { x: referenceValue - el.size.width, y: el.position.y }));
        break;
      case 'top':
        referenceValue = Math.min(...elements.map(el => el.position.y));
        elements.forEach(el => this.setElementPosition(el.id, { x: el.position.x, y: referenceValue }));
        break;
      case 'bottom':
        referenceValue = Math.max(...elements.map(el => el.position.y + el.size.height));
        elements.forEach(el => this.setElementPosition(el.id, { x: el.position.x, y: referenceValue - el.size.height }));
        break;
      case 'center-x':
        referenceValue = elements.reduce((sum, el) => sum + el.position.x + el.size.width / 2, 0) / elements.length;
        elements.forEach(el => this.setElementPosition(el.id, { x: referenceValue - el.size.width / 2, y: el.position.y }));
        break;
      case 'center-y':
        referenceValue = elements.reduce((sum, el) => sum + el.position.y + el.size.height / 2, 0) / elements.length;
        elements.forEach(el => this.setElementPosition(el.id, { x: el.position.x, y: referenceValue - el.size.height / 2 }));
        break;
    }

    // 이벤트 발생
    this.eventBus.emit('transform:align', {
      elementIds,
      alignment
    }, 'TransformManager');
  }

  /**
   * 요소 분배
   */
  distributeElements(elementIds: string[], distribution: 'horizontal' | 'vertical'): void {
    if (elementIds.length < 3) return;

    const elements = elementIds.map(id => this.hierarchyManager.getElement(id)).filter(Boolean) as HierarchicalElement[];
    if (elements.length < 3) return;

    if (distribution === 'horizontal') {
      elements.sort((a, b) => a.position.x - b.position.x);
      const leftMost = elements[0].position.x;
      const rightMost = elements[elements.length - 1].position.x + elements[elements.length - 1].size.width;
      const totalWidth = rightMost - leftMost;
      const spacing = totalWidth / (elements.length - 1);

      elements.forEach((el, index) => {
        const newX = leftMost + (spacing * index);
        this.setElementPosition(el.id, { x: newX, y: el.position.y });
      });
    } else {
      elements.sort((a, b) => a.position.y - b.position.y);
      const topMost = elements[0].position.y;
      const bottomMost = elements[elements.length - 1].position.y + elements[elements.length - 1].size.height;
      const totalHeight = bottomMost - topMost;
      const spacing = totalHeight / (elements.length - 1);

      elements.forEach((el, index) => {
        const newY = topMost + (spacing * index);
        this.setElementPosition(el.id, { x: el.position.x, y: newY });
      });
    }

    // 이벤트 발생
    this.eventBus.emit('transform:distribute', {
      elementIds,
      distribution
    }, 'TransformManager');
  }

  /**
   * 디버깅 정보
   */
  getDebugInfo(): {
    totalElements: number;
    elementsWithConstraints: number;
    transformationHistory: number;
  } {
    const elements = Array.from(this.hierarchyManager.getAllElements());
    const elementsWithConstraints = elements.filter(el => 
      el.constraints.stayWithinParent || el.constraints.maintainAspectRatio
    ).length;

    return {
      totalElements: elements.length,
      elementsWithConstraints,
      transformationHistory: this.eventBus.getEventHistory().filter(
        event => event.source === 'TransformManager'
      ).length
    };
  }
}