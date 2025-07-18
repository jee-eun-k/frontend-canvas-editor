import { HierarchicalElement } from './types';
import { HierarchyManager } from './HierarchyManager.new';

/**
 * 제약 조건 계산기
 * - 이동 제약 조건
 * - 리사이즈 제약 조건
 * - 수학적으로 정확한 계산
 */
export class ConstraintCalculator {
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

    // 최소/최대 크기 검사
    if (element.size.width < element.constraints.minSize.width ||
        element.size.height < element.constraints.minSize.height) {
      violations.push('Element size is below minimum');
    }

    if (element.size.width > element.constraints.maxSize.width ||
        element.size.height > element.constraints.maxSize.height) {
      violations.push('Element size exceeds maximum');
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * 요소 위치 제약 조건 적용 (절대 위치)
   */
  constrainPosition(
    element: HierarchicalElement,
    newPosition: { x: number; y: number }
  ): { x: number; y: number } {
    const parent = this.hierarchyManager.getParent(element.id);
    if (!parent || !element.constraints.stayWithinParent) {
      return newPosition;
    }

    const constrainedX = Math.max(
      parent.position.x,
      Math.min(newPosition.x, parent.position.x + parent.size.width - element.size.width)
    );
    const constrainedY = Math.max(
      parent.position.y,
      Math.min(newPosition.y, parent.position.y + parent.size.height - element.size.height)
    );

    return { x: constrainedX, y: constrainedY };
  }

  /**
   * 자식 요소들의 위치 재계산 (부모 리사이즈 후)
   */
  recalculateChildrenPositions(
    parent: HierarchicalElement,
    oldSize: { width: number; height: number }
  ): { [childId: string]: { x: number; y: number } } {
    const children = this.hierarchyManager.getChildren(parent.id);
    const newPositions: { [childId: string]: { x: number; y: number } } = {};

    for (const child of children) {
      // 상대적 위치 계산
      const relativeX = (child.position.x - parent.position.x) / oldSize.width;
      const relativeY = (child.position.y - parent.position.y) / oldSize.height;

      // 새로운 절대 위치 계산
      const newX = parent.position.x + (relativeX * parent.size.width);
      const newY = parent.position.y + (relativeY * parent.size.height);

      // 제약 조건 적용
      const constrainedPosition = this.constrainPosition(child, { x: newX, y: newY });
      newPositions[child.id] = constrainedPosition;
    }

    return newPositions;
  }

  /**
   * 충돌 감지 (두 요소 간)
   */
  detectCollision(
    element1: HierarchicalElement,
    element2: HierarchicalElement
  ): boolean {
    return !(
      element1.position.x + element1.size.width <= element2.position.x ||
      element2.position.x + element2.size.width <= element1.position.x ||
      element1.position.y + element1.size.height <= element2.position.y ||
      element2.position.y + element2.size.height <= element1.position.y
    );
  }

  /**
   * 요소와 영역 간 충돌 감지
   */
  detectAreaCollision(
    element: HierarchicalElement,
    area: { x: number; y: number; width: number; height: number }
  ): boolean {
    return !(
      element.position.x + element.size.width <= area.x ||
      area.x + area.width <= element.position.x ||
      element.position.y + element.size.height <= area.y ||
      area.y + area.height <= element.position.y
    );
  }

  /**
   * 스냅 그리드 제약 조건 적용
   */
  applySnapToGrid(
    position: { x: number; y: number },
    gridSize: number = 10
  ): { x: number; y: number } {
    return {
      x: Math.round(position.x / gridSize) * gridSize,
      y: Math.round(position.y / gridSize) * gridSize
    };
  }

  /**
   * 가이드라인 스냅 제약 조건 적용
   */
  applySnapToGuidelines(
    element: HierarchicalElement,
    newPosition: { x: number; y: number },
    snapDistance: number = 5
  ): { x: number; y: number } {
    const siblings = this.getSiblings(element);
    let snappedX = newPosition.x;
    let snappedY = newPosition.y;

    for (const sibling of siblings) {
      // 좌측 정렬
      if (Math.abs(newPosition.x - sibling.position.x) < snapDistance) {
        snappedX = sibling.position.x;
      }
      // 우측 정렬
      if (Math.abs(newPosition.x + element.size.width - sibling.position.x - sibling.size.width) < snapDistance) {
        snappedX = sibling.position.x + sibling.size.width - element.size.width;
      }
      // 상단 정렬
      if (Math.abs(newPosition.y - sibling.position.y) < snapDistance) {
        snappedY = sibling.position.y;
      }
      // 하단 정렬
      if (Math.abs(newPosition.y + element.size.height - sibling.position.y - sibling.size.height) < snapDistance) {
        snappedY = sibling.position.y + sibling.size.height - element.size.height;
      }
    }

    return { x: snappedX, y: snappedY };
  }

  /**
   * 형제 요소들 조회
   */
  private getSiblings(element: HierarchicalElement): HierarchicalElement[] {
    const parent = this.hierarchyManager.getParent(element.id);
    if (!parent) {
      // 루트 요소들 중 자신을 제외한 나머지
      return Array.from(this.hierarchyManager.getAllElements())
        .filter(el => !el.parentId && el.id !== element.id);
    }

    // 같은 부모를 가진 형제들
    return this.hierarchyManager.getChildren(parent.id)
      .filter(child => child.id !== element.id);
  }

  /**
   * 디버깅 정보
   */
  getDebugInfo(): {
    totalElements: number;
    elementsWithConstraints: number;
    validationErrors: { [elementId: string]: string[] };
  } {
    const elements = Array.from(this.hierarchyManager.getAllElements());
    const elementsWithConstraints = elements.filter(el => 
      el.constraints.stayWithinParent || 
      el.constraints.maintainAspectRatio
    ).length;

    const validationErrors: { [elementId: string]: string[] } = {};
    elements.forEach(element => {
      const validation = this.validateConstraints(element);
      if (!validation.valid) {
        validationErrors[element.id] = validation.violations;
      }
    });

    return {
      totalElements: elements.length,
      elementsWithConstraints,
      validationErrors
    };
  }
}