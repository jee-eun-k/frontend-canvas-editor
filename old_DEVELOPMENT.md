# DEVELOPMENT.md

## 📋 과제 요구사항

### 필수 구현 사항
공식 과제 문서 기준으로 다음 기능들이 **필수**입니다:

1. **계층적 사각형 구조**
   - 파란색(부모) → 주황색(자식) → 보라색(손자)
   - 모든 사각형 1px 검은 테두리
   - 중첩 위치 구조

2. **선택 시스템**
   - 각 사각형의 정확한 영역 클릭으로 선택
   - 선택된 사각형은 3px 테두리 표시
   - 겹치는 영역에서 애매한 선택 로직 없음

3. **계층적 이동**
   - 선택된 사각형 이동 시 **모든 자식들이 함께 이동**
   - 파란색 이동 → 주황색 + 보라색 따라감
   - 주황색 이동 → 보라색 따라감
   - 보라색 이동 → 보라색만 이동

4. **이동 제약 조건**
   - 자식은 부모 경계 밖으로 이동 불가
   - 주황색은 파란색 영역 벗어나면 안됨
   - 보라색은 주황색 영역 벗어나면 안됨

5. **Edge 기반 상호작용 (중요)**
   - 사각형 모서리 10px 내에서만 hover/선택 가능
   - 전체 사각형 영역이 아님
   - Hover 시 3px 테두리 표시
   - 선택 범위와 hover 범위 일치

6. **리사이즈 기능**
   - 선택된 사각형에 리사이즈 핸들 표시
   - 선택된 사각형만 크기 변경 가능
   - 부모 크기 변경 시 자식 크기는 유지
   - 부모보다 크거나 자식보다 작게 리사이즈 불가

7. **드래그 선택**
   - 마우스 클릭 + 드래그로 윈도우 선택
   - 사각형 전체 영역이 선택 윈도우 내에 있으면 선택
   - 선택된 사각형들 중 가장 상위 부모 선택

### 기술 스택
- **런타임**: Bun
- **프레임워크**: React + TypeScript
- **캔버스**: Fabric.js
- **빌드 도구**: Vite

---

## 🏗 기술 아키텍처

### 데이터 구조 설계

```typescript
interface HierarchicalElement {
  id: string;
  type: 'rectangle';
  
  // 🌳 계층 구조
  parentId?: string;
  childIds: string[];
  depth: number;
  path: string[];
  
  // 📐 변환 속성
  position: { x: number; y: number };
  size: { width: number; height: number };
  
  // 🎨 시각적 속성
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
  };
  
  // 🎯 상태 관리
  selected: boolean;
  hovered: boolean;
  
  // 🔒 제약 조건
  constraints: {
    stayWithinParent: boolean;
    minSize: { width: number; height: number };
    maxSize: { width: number; height: number };
  };
  
  // 🖼 Fabric.js 통합
  fabricObject?: fabric.Rect;
}
```

### 핵심 시스템

#### 1. HierarchyManager - 트리 연산
```typescript
class HierarchyManager {
  private elements = new Map<string, HierarchicalElement>();
  
  // 🌳 트리 구조 연산
  getParent(elementId: string): HierarchicalElement | null;
  getChildren(elementId: string): HierarchicalElement[];
  getAncestors(elementId: string): HierarchicalElement[];
  getDescendants(elementId: string): HierarchicalElement[];
  
  // 🎯 선택 로직
  findElementAtExactPoint(x: number, y: number): HierarchicalElement | null;
  isPointOnEdge(x: number, y: number, element: HierarchicalElement): boolean;
  
  // 🔄 재귀 연산
  moveElementWithChildren(elementId: string, deltaX: number, deltaY: number): void;
  validateMovement(elementId: string, newX: number, newY: number): boolean;
}
```

#### 2. EdgeDetector - 모서리 감지 시스템
```typescript
class EdgeDetector {
  private readonly EDGE_THRESHOLD = 10; // 10px
  
  // 🎯 모서리 감지 핵심 알고리즘
  isPointOnEdge(x: number, y: number, element: HierarchicalElement): boolean {
    const { position, size } = element;
    const { x: rectX, y: rectY } = position;
    const { width, height } = size;
    
    // 전체 사각형 내부인지 확인
    const isInside = x >= rectX && x <= rectX + width &&
                    y >= rectY && y <= rectY + height;
    
    if (!isInside) return false;
    
    // 모서리 10px 내부인지 확인
    const distanceFromLeft = x - rectX;
    const distanceFromRight = (rectX + width) - x;
    const distanceFromTop = y - rectY;
    const distanceFromBottom = (rectY + height) - y;
    
    return distanceFromLeft <= this.EDGE_THRESHOLD ||
           distanceFromRight <= this.EDGE_THRESHOLD ||
           distanceFromTop <= this.EDGE_THRESHOLD ||
           distanceFromBottom <= this.EDGE_THRESHOLD;
  }
}
```

#### 3. SelectionManager - 선택 관리
```typescript
class SelectionManager {
  constructor(
    private hierarchyManager: HierarchyManager,
    private edgeDetector: EdgeDetector
  ) {}
  
  // 🎯 정확한 지점 선택
  selectAtPoint(x: number, y: number): HierarchicalElement | null {
    const candidates = this.findCandidatesAtPoint(x, y);
    
    // Edge 기반 필터링
    const edgeCandidates = candidates.filter(element => 
      this.edgeDetector.isPointOnEdge(x, y, element)
    );
    
    // 가장 정확한 매치 반환
    return this.findExactMatch(x, y, edgeCandidates);
  }
  
  // 🔲 드래그 선택
  selectByDrag(selectionRect: Rectangle): HierarchicalElement | null {
    const fullyContainedElements = this.findFullyContainedElements(selectionRect);
    
    // 가장 상위 부모 선택
    return this.findTopMostParent(fullyContainedElements);
  }
}
```

#### 4. TransformManager - 변환 관리
```typescript
class TransformManager {
  constructor(private hierarchyManager: HierarchyManager) {}
  
  // 🔄 재귀적 이동 (핵심 알고리즘)
  moveElementWithChildren(elementId: string, deltaX: number, deltaY: number): void {
    const element = this.hierarchyManager.getElement(elementId);
    if (!element) return;
    
    // 제약 조건 확인
    const constrainedDelta = this.applyMovementConstraints(element, deltaX, deltaY);
    
    // 현재 요소 이동
    this.moveElement(element, constrainedDelta.x, constrainedDelta.y);
    
    // 재귀적으로 모든 자식 이동
    element.childIds.forEach(childId => {
      this.moveElementWithChildren(childId, constrainedDelta.x, constrainedDelta.y);
    });
    
    // Fabric.js 시각적 업데이트
    this.updateFabricObject(element);
  }
  
  // 🔒 이동 제약 조건 적용
  private applyMovementConstraints(
    element: HierarchicalElement, 
    deltaX: number, 
    deltaY: number
  ): { x: number; y: number } {
    const parent = this.hierarchyManager.getParent(element.id);
    if (!parent) return { x: deltaX, y: deltaY };
    
    const newX = element.position.x + deltaX;
    const newY = element.position.y + deltaY;
    
    // 부모 경계 내 유지
    const constrainedX = Math.max(
      parent.position.x,
      Math.min(parent.position.x + parent.size.width - element.size.width, newX)
    );
    
    const constrainedY = Math.max(
      parent.position.y,
      Math.min(parent.position.y + parent.size.height - element.size.height, newY)
    );
    
    return {
      x: constrainedX - element.position.x,
      y: constrainedY - element.position.y
    };
  }
}
```

---

## 🎨 메인 React 컴포넌트

```typescript
import React, { useRef, useEffect, useState } from 'react';
import { fabric } from 'fabric';
import { HierarchyManager } from './core/HierarchyManager';
import { SelectionManager } from './core/SelectionManager';
import { TransformManager } from './core/TransformManager';
import { EdgeDetector } from './core/EdgeDetector';

export const CanvasEditor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [managers, setManagers] = useState<{
    hierarchy: HierarchyManager;
    selection: SelectionManager;
    transform: TransformManager;
    edgeDetector: EdgeDetector;
  } | null>(null);
  
  // 초기화
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff'
    });
    
    // 매니저 시스템 초기화
    const hierarchyManager = new HierarchyManager();
    const edgeDetector = new EdgeDetector();
    const selectionManager = new SelectionManager(hierarchyManager, edgeDetector);
    const transformManager = new TransformManager(hierarchyManager);
    
    setCanvas(fabricCanvas);
    setManagers({
      hierarchy: hierarchyManager,
      selection: selectionManager,
      transform: transformManager,
      edgeDetector: edgeDetector
    });
    
    // 초기 사각형 생성
    initializeHierarchy(hierarchyManager, fabricCanvas);
    
    // 이벤트 핸들러 설정
    setupEventHandlers(fabricCanvas, selectionManager, transformManager);
    
    return () => fabricCanvas.dispose();
  }, []);
  
  // 초기 계층 구조 생성
  const initializeHierarchy = (hierarchyManager: HierarchyManager, fabricCanvas: fabric.Canvas) => {
    // 파란색 부모 사각형
    hierarchyManager.createElement('blue-rect', null, {
      position: { x: 200, y: 100 },
      size: { width: 400, height: 400 },
      style: { fill: '#7FB3D3', stroke: '#000000', strokeWidth: 1 }
    });
    
    // 주황색 자식 사각형
    hierarchyManager.createElement('orange-rect', 'blue-rect', {
      position: { x: 275, y: 175 },
      size: { width: 250, height: 250 },
      style: { fill: '#FFB347', stroke: '#000000', strokeWidth: 1 }
    });
    
    // 보라색 손자 사각형
    hierarchyManager.createElement('purple-rect', 'orange-rect', {
      position: { x: 325, y: 225 },
      size: { width: 150, height: 150 },
      style: { fill: '#DDA0DD', stroke: '#000000', strokeWidth: 1 }
    });
    
    // Fabric.js 객체 생성 및 렌더링
    renderHierarchy(hierarchyManager, fabricCanvas);
  };
  
  // 계층 구조 렌더링
  const renderHierarchy = (hierarchyManager: HierarchyManager, fabricCanvas: fabric.Canvas) => {
    fabricCanvas.clear();
    
    // 깊이 순서대로 렌더링 (부모 먼저)
    const elements = Array.from(hierarchyManager.getAllElements())
      .sort((a, b) => a.depth - b.depth);
    
    elements.forEach(element => {
      const rect = new fabric.Rect({
        left: element.position.x,
        top: element.position.y,
        width: element.size.width,
        height: element.size.height,
        fill: element.style.fill,
        stroke: element.style.stroke,
        strokeWidth: element.style.strokeWidth,
        selectable: false // Fabric.js 기본 선택 비활성화
      });
      
      element.fabricObject = rect;
      fabricCanvas.add(rect);
    });
    
    fabricCanvas.renderAll();
  };
  
  // 이벤트 핸들러 설정
  const setupEventHandlers = (
    fabricCanvas: fabric.Canvas,
    selectionManager: SelectionManager,
    transformManager: TransformManager
  ) => {
    let isDragging = false;
    let dragStart: { x: number; y: number } | null = null;
    
    // 마우스 다운 (선택 시작)
    fabricCanvas.on('mouse:down', (event) => {
      const pointer = fabricCanvas.getPointer(event.e);
      const selectedElement = selectionManager.selectAtPoint(pointer.x, pointer.y);
      
      if (selectedElement) {
        isDragging = true;
        dragStart = pointer;
      }
      
      fabricCanvas.renderAll();
    });
    
    // 마우스 이동 (드래그)
    fabricCanvas.on('mouse:move', (event) => {
      const pointer = fabricCanvas.getPointer(event.e);
      
      if (isDragging && dragStart) {
        const deltaX = pointer.x - dragStart.x;
        const deltaY = pointer.y - dragStart.y;
        
        const selectedElement = selectionManager.getSelectedElement();
        if (selectedElement) {
          transformManager.moveElementWithChildren(selectedElement.id, deltaX, deltaY);
        }
        
        dragStart = pointer;
        fabricCanvas.renderAll();
      } else {
        // Hover 효과
        selectionManager.handleHover(pointer.x, pointer.y);
        fabricCanvas.renderAll();
      }
    });
    
    // 마우스 업 (드래그 종료)
    fabricCanvas.on('mouse:up', () => {
      isDragging = false;
      dragStart = null;
    });
  };
  
  return (
    <div style={{ padding: '20px' }}>
      <h1>계층적 캔버스 에디터</h1>
      
      <div style={{ marginBottom: '20px', fontSize: '14px' }}>
        <h3>구현된 기능:</h3>
        <ul>
          <li>🌳 계층적 트리 구조 (부모-자식 관계)</li>
          <li>🎯 정확한 지점 선택 (Edge 기반)</li>
          <li>🔄 재귀적 이동 (부모 이동 시 자식 따라감)</li>
          <li>🔒 이동 제약 조건 (부모 범위 내 유지)</li>
          <li>📏 리사이즈 기능 (제약 조건 포함)</li>
          <li>🔲 드래그 선택 (윈도우 선택)</li>
        </ul>
      </div>
      
      <canvas ref={canvasRef} style={{ border: '1px solid #ccc' }} />
      
      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <strong>사용법:</strong> 사각형 모서리 10px 내에서 클릭하여 선택, 드래그로 이동
      </div>
    </div>
  );
};
```

---

## 🚀 구현 전략

### 우선순위 기반 개발
1. **계층 구조 + 기본 선택** (핵심 알고리즘)
2. **Edge 기반 상호작용** (과제 핵심 요구사항)
3. **재귀적 이동 + 제약 조건** (트리 알고리즘 활용)
4. **리사이즈 기능** (완성도 향상)
5. **드래그 선택** (고급 기능)

### 핵심 알고리즘 포커스
- **트리 순회**: 부모-자식 관계 탐색
- **재귀 연산**: 계층적 이동 처리
- **기하학적 계산**: Edge 감지, 충돌 검사
- **제약 조건 해결**: 이동/리사이즈 제한

### 면접 어필 포인트
1. **"계층적 데이터 구조를 트리로 구현했습니다"**
2. **"재귀 알고리즘으로 부모-자식 관계를 처리했습니다"**  
3. **"Edge 감지 알고리즘으로 정확한 상호작용을 구현했습니다"**
4. **"제약 조건을 통한 일관된 사용자 경험을 제공했습니다"**

---

## 📝 제출 체크리스트

### 필수 기능 구현
- [ ] 3개 중첩 사각형 렌더링
- [ ] Edge 기반 선택 (10px 내)
- [ ] 계층적 이동 (자식 따라감)
- [ ] 이동 제약 조건
- [ ] 리사이즈 기능
- [ ] 드래그 선택

### 코드 품질
- [ ] TypeScript 타입 안정성
- [ ] 명확한 변수명과 함수명
- [ ] 적절한 주석
- [ ] 일관된 코드 스타일

### 문서화
- [ ] README.md 완성
- [ ] 실행 방법 명시
- [ ] 구현 내용 설명
- [ ] 데모 링크 제공

이 문서는 assignment.pdf의 모든 요구사항을 충족하면서도 계층적 구조의 중요성과 실용적인 에디터 기능을 모두 강조하는 구현 가이드입니다.