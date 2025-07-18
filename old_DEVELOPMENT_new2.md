# DEVELOPMENT.md

## 📋 과제 요구사항

### 필수 구현 사항

  * [cite\_start]**계층적 사각형 구조:** 파란색(부모) → 주황색(자식) → 보라색(손자)의 3개 사각형을 렌더링하며, 모두 `1px` 검은 테두리를 가집니다[cite: 10, 11].
  * **Edge 기반 상호작용:**
      * [cite\_start]사각형의 **모서리 `10px`** 안쪽 영역에서만 호버 및 선택이 가능합니다[cite: 31, 32, 35].
      * [cite\_start]호버 시 테두리가 `3px`로 변경됩니다[cite: 33].
  * **선택 시스템:**
      * [cite\_start]선택된 사각형의 테두리는 `3px`로 변경됩니다[cite: 23].
      * 겹치는 영역에서는 렌더링 순서(z-index)가 가장 높은 객체가 우선적으로 선택됩니다.
      * 캔버스의 빈 공간을 클릭하면 현재 선택이 해제됩니다.
  * [cite\_start]**계층적 이동:** 부모 사각형 이동 시 모든 자식 사각형이 함께 이동합니다[cite: 12, 17].
  * [cite\_start]**이동 제약 조건:** 자식 사각형은 부모 사각형의 경계를 벗어날 수 없습니다[cite: 19, 22].
  * **리사이즈 기능:**
      * [cite\_start]선택된 사각형에만 리사이즈 핸들이 표시되며 크기 조절이 가능합니다[cite: 25, 28].
      * [cite\_start]부모 크기가 변경되어도 자식의 크기는 유지됩니다[cite: 27].
      * [cite\_start]**리사이즈 제약 조건:** 부모보다 커질 수 없으며, \*\*모든 직계 자식들을 감싸는 최소 경계 상자(Bounding Box)\*\*보다 작아질 수 없습니다[cite: 29].
  * **드래그 선택:**
      * [cite\_start]드래그하여 생성된 선택 영역 안에 사각형의 **네 꼭짓점이 모두 포함되면** 해당 사각형을 선택 후보로 지정합니다[cite: 36, 37].
      * [cite\_start]선택 후보 중 가장 상위 부모가 최종 선택됩니다[cite: 38].
  * **사용자 피드백 (커서):** 상호작용 상태에 따라 마우스 커서 모양이 변경되어야 합니다.

### 기술 스택

  * **런타임**: Bun
  * [cite\_start]**프레임워크**: React + TypeScript [cite: 40]
  * [cite\_start]**캔버스**: Fabric.js [cite: 40]
  * **빌드 도구**: Vite

-----

## 🏗 기술 아키텍처

### 데이터 구조 설계 (`HierarchicalElement`)

```typescript
interface HierarchicalElement {
  id: string;
  type: 'rectangle';
  parentId?: string;
  childIds: string[];
  depth: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
  };
  selected: boolean;
  hovered: boolean;
  constraints: {
    stayWithinParent: boolean;
    minSize: { width: number; height: number };
    maxSize: { width: number; height: number };
  };
  fabricObject?: fabric.Rect;
}
```

### 핵심 시스템

#### 1\. `HierarchyManager` - 트리 데이터 관리

```typescript
class HierarchyManager {
  private elements = new Map<string, HierarchicalElement>();

  createElement(id: string, parentId: string | null, props: Partial<HierarchicalElement>): HierarchicalElement {
    // ... id, parentId, depth 등 계층 정보 설정 후 elements.set() ...
  }

  getElement(id: string): HierarchicalElement | undefined {
    return this.elements.get(id);
  }

  getAllElements(): IterableIterator<HierarchicalElement> {
    return this.elements.values();
  }

  getParent(id: string): HierarchicalElement | null {
    // ... parentId로 부모 탐색 ...
  }
  
  getChildren(id: string): HierarchicalElement[] {
    // ... childIds로 자식들 탐색 ...
  }
  
  getDescendants(id: string): HierarchicalElement[] {
    // ... 재귀적으로 모든 후손 탐색 ...
  }

  updateElementPosition(id: string, x: number, y: number): void {
    const el = this.getElement(id);
    if (el) el.position = { x, y };
  }
  
  updateElementSize(id: string, width: number, height: number): void {
    const el = this.getElement(id);
    if (el) el.size = { width, height };
  }

  updateElementState(id: string, state: Partial<{ selected: boolean; hovered: boolean }>): void {
    const el = this.getElement(id);
    // ... selected, hovered 상태 업데이트 ...
  }
}
```

#### 2\. `EdgeDetector` - 모서리 감지

```typescript
class EdgeDetector {
  private readonly EDGE_THRESHOLD = 10;

  isPointOnEdge(x: number, y: number, element: HierarchicalElement): boolean {
    const { position, size } = element;
    const { x: rectX, y: rectY } = position;
    const { width, height } = size;

    const isInside = x >= rectX && x <= rectX + width && y >= rectY && y <= rectY + height;
    if (!isInside) return false;

    const isOutsideInnerBox = 
      x < rectX + this.EDGE_THRESHOLD ||
      x > rectX + width - this.EDGE_THRESHOLD ||
      y < rectY + this.EDGE_THRESHOLD ||
      y > rectY + height - this.EDGE_THRESHOLD;

    return isOutsideInnerBox;
  }
}
```

#### 3\. `SelectionManager` - 선택 로직 관리

```typescript
class SelectionManager {
  private selectedElementId: string | null = null;

  constructor(
    private hierarchyManager: HierarchyManager,
    private edgeDetector: EdgeDetector,
  ) {}

  getSelectedElement(): HierarchicalElement | null {
    // ... selectedElementId로 요소 반환 ...
  }

  selectAtPoint(x: number, y: number, allElements: HierarchicalElement[]): HierarchicalElement | null {
    // 1. z-index(렌더링 순서) 역순으로 정렬된 요소들 순회
    // 2. EdgeDetector로 클릭 가능한 요소(후보) 찾기
    const candidate = allElements.find(el => this.edgeDetector.isPointOnEdge(x, y, el));

    // 3. 기존 선택 해제 및 신규 선택 처리
    this.deselectAll();
    if (candidate) {
      this.selectedElementId = candidate.id;
      this.hierarchyManager.updateElementState(candidate.id, { selected: true });
      return candidate;
    }
    return null;
  }

  selectByDrag(selectionRect: { left, top, width, height }): HierarchicalElement | null {
    const containedElements = [];
    // 1. 모든 요소 순회하며 네 꼭짓점이 selectionRect 안에 완전히 포함되는지 확인
    // 2. 포함된 요소(후보)들 중 depth가 가장 낮은 최상위 부모 찾기
    // 3. 기존 선택 해제 및 신규 선택 처리
    // ...
  }

  handleHover(x: number, y: number, allElements: HierarchicalElement[]): HierarchicalElement | null {
    // 1. 모든 요소의 hovered 상태 초기화
    // 2. z-index 역순으로 순회하며 hover된 요소 찾기
    // 3. 해당 요소의 hovered 상태를 true로 변경하고 반환
    // ...
  }
  
  deselectAll(): void {
    if (this.selectedElementId) {
      this.hierarchyManager.updateElementState(this.selectedElementId, { selected: false });
    }
    this.selectedElementId = null;
  }
}
```

#### 4\. `TransformManager` - 변환 및 제약 조건 관리

```typescript
class TransformManager {
  constructor(private hierarchyManager: HierarchyManager) {}

  moveElementWithChildren(id: string, deltaX: number, deltaY: number): void {
    const element = this.hierarchyManager.getElement(id);
    if (!element) return;

    // 1. 이동 제약 조건 적용하여 실제 이동할 delta 계산
    const constrainedDelta = this.applyMovementConstraints(element, deltaX, deltaY);

    // 2. 자신과 모든 자손들에게 동일한 delta를 재귀적으로 적용
    const descendants = this.hierarchyManager.getDescendants(id);
    [element, ...descendants].forEach(el => {
      const newPos = { x: el.position.x + constrainedDelta.x, y: el.position.y + constrainedDelta.y };
      this.hierarchyManager.updateElementPosition(el.id, newPos.x, newPos.y);
    });
  }

  resizeElement(id: string, newWidth: number, newHeight: number): void {
    // 1. 리사이즈 제약 조건(부모 경계, 자식 경계 상자)에 따라 최종 크기 계산
    // 2. hierarchyManager.updateElementSize()로 크기 업데이트
    // ...
  }

  private applyMovementConstraints(element: HierarchicalElement, deltaX: number, deltaY: number): { x, y } {
    // ... 부모 경계 내에서만 이동하도록 deltaX, deltaY 계산 ...
  }
  
  private applyResizeConstraints(element: HierarchicalElement, newWidth: number, newHeight: number): { width, height } {
    // ... 부모 경계 및 자식 경계 상자 조건에 맞는 최종 크기 계산 ...
  }
}
```

-----

## 🎨 메인 React 컴포넌트 (`CanvasEditor.tsx`)

```typescript
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { fabric } from 'fabric';
// ... Manager 클래스들 import

export const CanvasEditor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [managers, setManagers] = useState<{...}>();
  // ... isDragging, dragStart 등 상호작용 상태 관리 ...

  // 데이터 모델을 Fabric 캔버스에 렌더링하는 함수
  const renderHierarchy = useCallback((hierarchy: HierarchyManager, fabricCanvas: fabric.Canvas) => {
    // 1. HierarchyManager의 모든 요소를 가져옴
    // 2. 각 요소에 대해 fabricObject가 있으면 속성 업데이트, 없으면 새로 생성하여 추가
    // 3. selected, hovered 상태에 따라 stroke, strokeWidth, hasControls 등 업데이트
    // 4. fabricCanvas.renderAll() 호출
  }, []);

  // 초기화
  useEffect(() => {
    // ... 캔버스 및 매니저 초기화 ...
    // ... 초기 사각형 데이터 생성 ...
    // ... 이벤트 핸들러 설정 ...
  }, []);

  // 이벤트 핸들러 설정 함수
  const setupEventHandlers = (fabricCanvas, managers) => {
    let isDragging = false;
    let isDragSelecting = false;
    let dragStart = null;
    let selectionRect = null; // 드래그 선택용 사각형

    fabricCanvas.on('mouse:down', (event) => {
      const pointer = fabricCanvas.getPointer(event.e);
      const allElements = Array.from(managers.hierarchy.getAllElements())
          .sort((a,b) => b.depth - a.depth); // z-index 고려
      
      const target = managers.selection.selectAtPoint(pointer.x, pointer.y, allElements);
      
      if (target) {
        isDragging = true;
      } else {
        managers.selection.deselectAll();
        isDragSelecting = true;
        // ... selectionRect 생성 및 캔버스에 추가 ...
      }
      dragStart = pointer;
      renderHierarchy(managers.hierarchy, fabricCanvas);
    });
    
    fabricCanvas.on('mouse:move', (event) => {
      const pointer = fabricCanvas.getPointer(event.e);
      // ... 커서 모양 기본값으로 초기화 ...

      if (isDragging) {
        const selected = managers.selection.getSelectedElement();
        // ... 커서를 'move'로 변경 ...
        // ... TransformManager.moveElementWithChildren 호출 ...
      } else if (isDragSelecting) {
        // ... 커서를 'crosshair'로 변경 ...
        // ... selectionRect 크기 업데이트 ...
      } else {
        const hovered = managers.selection.handleHover(pointer.x, pointer.y, allElements);
        if (hovered) { // ... 커서를 'move'로 변경 ... }
      }
      renderHierarchy(managers.hierarchy, fabricCanvas);
    });

    fabricCanvas.on('mouse:up', () => {
      if (isDragSelecting) {
        managers.selection.selectByDrag(selectionRect);
      }
      isDragging = false;
      isDragSelecting = false;
      dragStart = null;
      // ... selectionRect 제거 ...
      renderHierarchy(managers.hierarchy, fabricCanvas);
    });
    
    fabricCanvas.on('object:scaling', (event) => {
        // ... TransformManager.resizeElement 호출하여 제약조건 적용 ...
        // ... Fabric 객체 스케일 초기화 및 크기 재설정 ...
    });
  };

  return (
    // ... JSX 템플릿 ...
  );
};
```