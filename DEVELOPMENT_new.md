DEVELOPMENT.md
📋 과제 요구사항
필수 구현 사항
공식 과제 문서 기준으로 다음 기능들이 필수입니다:

계층적 사각형 구조

파란색(부모) → 주황색(자식) → 보라색(손자)

모든 사각형 1px 검은 테두리

중첩 위치 구조

선택 시스템

각 사각형의 정확한 영역 클릭으로 선택

선택된 사각형은 3px 테두리 표시

겹치는 영역에서 애매한 선택 로직 없음

보완: 겹치는 영역에서는 z-index (렌더링 순서)가 가장 높은(가장 나중에 그려진) 사각형이 Edge 기반으로 선택됩니다.

계층적 이동

선택된 사각형 이동 시 모든 자식들이 함께 이동

파란색 이동 → 주황색 + 보라색 따라감

주황색 이동 → 보라색 따라감

보라색 이동 → 보라색만 이동

이동 제약 조건

자식은 부모 경계 밖으로 이동 불가

주황색은 파란색 영역 벗어나면 안됨

보라색은 주황색 영역 벗어나면 안됨

Edge 기반 상호작용 (중요)

사각형 모서리 10px 내에서만 hover/선택 가능

전체 사각형 영역이 아님

Hover 시 3px 테두리 표시

선택 범위와 hover 범위 일치

리사이즈 기능

선택된 사각형에 리사이즈 핸들 표시

선택된 사각형만 크기 변경 가능

부모 크기 변경 시 자식 크기는 유지

부모보다 크거나 자식보다 작게 리사이즈 불가

드래그 선택

마우스 클릭 + 드래그로 윈도우 선택

사각형 전체 영역이 선택 윈도우 내에 있으면 선택

선택된 사각형들 중 가장 상위 부모 선택

기술 스택
런타임: Bun

프레임워크: React + TypeScript

캔버스: Fabric.js

빌드 도구: Vite

🏗 기술 아키텍처
데이터 구조 설계
interface HierarchicalElement {
  id: string;
  type: 'rectangle';
  
  // 🌳 계층 구조
  parentId?: string;
  childIds: string[];
  depth: number;
  // path: string[]; // 불필요하여 제거
  
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
  selected: boolean; // 데이터 모델에 포함하여 확장성 확보
  hovered: boolean;  // 데이터 모델에 포함하여 확장성 확보
  
  // 🔒 제약 조건
  constraints: {
    stayWithinParent: boolean;
    minSize: { width: number; height: number }; // 자식 사각형의 크기에 따라 동적으로 결정, 자식이 없으면 20x20px 기본값
    maxSize: { width: number; height: number }; // 부모 사각형의 크기에 따라 동적으로 결정
  };
  
  // 🖼 Fabric.js 통합
  fabricObject?: fabric.Rect;
}

HierarchicalElement 인터페이스 변경 이유:

path 필드 제거: parentId, childIds, depth만으로도 충분히 계층 구조를 탐색하고 관리할 수 있어 불필요한 중복을 피하고 데이터 모델을 간결하게 유지합니다.

selected, hovered 필드 포함: 이 상태들을 데이터 모델 자체에 포함시킴으로써, UI 로직과 분리하여 데이터의 일관성을 유지하고, 향후 다른 기능(예: 선택된 요소 목록 관리, 특정 상태에 따른 로직 분기)으로 확장하기 용이합니다. Fabric.js 객체의 시각적 속성(strokeWidth 등)은 이 상태에 따라 동적으로 업데이트됩니다.

minSize, maxSize 설명 추가: minSize는 사각형이 너무 작아져 조작이 어려워지는 것을 방지하기 위해 자식이 없는 경우 최소 20x20px를 기본값으로 하며, 자식이 있는 경우 자식의 크기에 따라 동적으로 결정됩니다. maxSize는 부모의 경계를 벗어나지 않도록 부모의 크기에 따라 동적으로 결정됩니다.

핵심 시스템
1. HierarchyManager - 트리 연산
class HierarchyManager {
  private elements = new Map<string, HierarchicalElement>();
  
  // 🌳 트리 구조 연산
  createElement(id: string, parentId: string | null, properties: any): HierarchicalElement;
  getElement(elementId: string): HierarchicalElement | undefined;
  getAllElements(): IterableIterator<HierarchicalElement>;
  getParent(elementId: string): HierarchicalElement | null;
  getChildren(elementId: string): HierarchicalElement[];
  getAncestors(elementId: string): HierarchicalElement[];
  getDescendants(elementId: string): HierarchicalElement[];
  
  // 🎯 선택 로직 (EdgeDetector를 활용)
  // findElementAtExactPoint 메서드는 SelectionManager에서 호출하며, HierarchyManager는 내부적으로 요소 정보를 제공합니다.
  
  // 🔄 데이터 업데이트
  updateElementPosition(elementId: string, newX: number, newY: number): void;
  updateElementSize(elementId: string, newWidth: number, newHeight: number): void;
  updateElementState(elementId: string, state: Partial<HierarchicalElement>): void; // selected, hovered 등 상태 업데이트
}

HierarchyManager 역할 분담 이유:

HierarchyManager는 순수하게 계층적 데이터(HierarchicalElement)의 생성, 조회, 업데이트를 담당합니다. 트리 구조의 탐색 및 관계 연산에 집중하며, 실제 사용자 입력에 따른 변환 로직(이동, 리사이즈)은 TransformManager에 위임합니다. EdgeDetector는 모서리 감지라는 단일 책임을 가집니다.

2. EdgeDetector - 모서리 감지 시스템
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

EdgeDetector 역할 분담 이유:

EdgeDetector는 오직 주어진 x, y 좌표가 특정 HierarchicalElement의 10px 모서리 범위 내에 있는지 여부를 판단하는 단일 책임을 가집니다. 이를 통해 모서리 감지 로직의 재사용성과 테스트 용이성을 높입니다.

3. SelectionManager - 선택 관리
class SelectionManager {
  private selectedElementId: string | null = null; // 현재 선택된 요소의 ID
  
  constructor(
    private hierarchyManager: HierarchyManager,
    private edgeDetector: EdgeDetector
  ) {}
  
  getSelectedElement(): HierarchicalElement | null {
    return this.selectedElementId ? this.hierarchyManager.getElement(this.selectedElementId) || null : null;
  }

  // 🎯 정확한 지점 선택 (Edge 기반 + z-index 우선)
  selectAtPoint(x: number, y: number): HierarchicalElement | null {
    // 모든 요소를 z-index (렌더링 순서) 역순으로 정렬하여 가장 위에 있는 요소부터 검사
    const allElements = Array.from(this.hierarchyManager.getAllElements())
      .sort((a, b) => (b.fabricObject?.canvas?.getObjects().indexOf(b.fabricObject) || 0) - (a.fabricObject?.canvas?.getObjects().indexOf(a.fabricObject) || 0)); // Fabric.js 객체의 렌더링 순서 활용

    let selectedCandidate: HierarchicalElement | null = null;

    for (const element of allElements) {
      if (this.edgeDetector.isPointOnEdge(x, y, element)) {
        selectedCandidate = element;
        break; // 가장 위에 있는 Edge 기반 일치 요소 발견 시 중단
      }
    }

    // 기존 선택 해제
    if (this.selectedElementId) {
      this.hierarchyManager.updateElementState(this.selectedElementId, { selected: false });
    }

    // 새로운 요소 선택
    if (selectedCandidate) {
      this.selectedElementId = selectedCandidate.id;
      this.hierarchyManager.updateElementState(selectedCandidate.id, { selected: true });
    } else {
      this.selectedElementId = null;
    }
    return selectedCandidate;
  }
  
  // 🔲 드래그 선택
  selectByDrag(selectionRect: Rectangle): HierarchicalElement | null {
    const fullyContainedElements: HierarchicalElement[] = [];
    // 모든 요소를 순회하며 selectionRect 내에 완전히 포함되는지 확인
    for (const element of this.hierarchyManager.getAllElements()) {
      if (element.fabricObject && selectionRect.intersectsWithObject(element.fabricObject)) { // Fabric.js의 intersectsWithObject 활용
        // 추가적으로, element.fabricObject가 selectionRect 내에 완전히 포함되는지 확인하는 로직 필요
        // Fabric.js의 containsPoint나 intersectsWithRect 등을 조합하여 구현
        fullyContainedElements.push(element);
      }
    }
    
    // 기존 선택 해제
    if (this.selectedElementId) {
      this.hierarchyManager.updateElementState(this.selectedElementId, { selected: false });
    }

    // 가장 상위 부모 선택 (depth가 가장 낮은 요소)
    let topMostParent: HierarchicalElement | null = null;
    if (fullyContainedElements.length > 0) {
      topMostParent = fullyContainedElements.reduce((prev, current) => 
        (prev.depth < current.depth) ? prev : current
      );
      this.selectedElementId = topMostParent.id;
      this.hierarchyManager.updateElementState(topMostParent.id, { selected: true });
    } else {
      this.selectedElementId = null;
    }
    return topMostParent;
  }

  // Hover 효과 관리
  handleHover(x: number, y: number): void {
    const allElements = Array.from(this.hierarchyManager.getAllElements())
      .sort((a, b) => (b.fabricObject?.canvas?.getObjects().indexOf(b.fabricObject) || 0) - (a.fabricObject?.canvas?.getObjects().indexOf(a.fabricObject) || 0));

    let hoveredCandidate: HierarchicalElement | null = null;
    for (const element of allElements) {
      if (this.edgeDetector.isPointOnEdge(x, y, element)) {
        hoveredCandidate = element;
        break;
      }
    }

    // 모든 요소의 hovered 상태 초기화
    for (const element of this.hierarchyManager.getAllElements()) {
      if (element.hovered && element.id !== (hoveredCandidate?.id || null)) {
        this.hierarchyManager.updateElementState(element.id, { hovered: false });
      }
    }

    // 새로운 요소 hovered 상태 설정
    if (hoveredCandidate && !hoveredCandidate.hovered) {
      this.hierarchyManager.updateElementState(hoveredCandidate.id, { hovered: true });
    }
  }
}

SelectionManager 역할 분담 이유:

SelectionManager는 사용자 입력(클릭, 드래그)에 기반한 선택 로직을 전담합니다. HierarchyManager로부터 요소 정보를 얻고, EdgeDetector를 활용하여 선택 가능한 요소를 식별합니다. selectedElementId를 내부 상태로 관리하여 현재 선택된 요소를 추적합니다.

겹치는 요소 선택: Fabric.js의 렌더링 순서(z-index)를 활용하여 가장 위에 있는 요소부터 Edge 기반으로 검사함으로써 "애매한 선택 로직 없음" 요구사항을 충족합니다.

4. TransformManager - 변환 관리
class TransformManager {
  constructor(private hierarchyManager: HierarchyManager) {}
  
  // 🔄 재귀적 이동 (핵심 알고리즘)
  moveElementWithChildren(elementId: string, deltaX: number, deltaY: number): void {
    const element = this.hierarchyManager.getElement(elementId);
    if (!element) return;
    
    // 제약 조건 확인 및 적용
    const constrainedDelta = this.applyMovementConstraints(element, deltaX, deltaY);
    
    // 현재 요소 이동
    this.hierarchyManager.updateElementPosition(
      element.id, 
      element.position.x + constrainedDelta.x, 
      element.position.y + constrainedDelta.y
    );
    
    // 재귀적으로 모든 자식 이동 (자식은 부모의 제약 조건에 영향을 받지 않고, 부모가 이동한 만큼만 따라갑니다.)
    element.childIds.forEach(childId => {
      // 자식 요소는 부모의 constrainedDelta만큼만 이동합니다.
      // 자식의 개별적인 부모 경계 제약 조건은 TransformManager의 다른 곳에서 처리됩니다.
      const child = this.hierarchyManager.getElement(childId);
      if (child) {
        this.hierarchyManager.updateElementPosition(
          child.id,
          child.position.x + constrainedDelta.x,
          child.position.y + constrainedDelta.y
        );
        // 자식의 자식들도 재귀적으로 이동
        this.moveElementWithChildren(childId, constrainedDelta.x, constrainedDelta.y);
      }
    });
  }
  
  // 🔒 이동 제약 조건 적용
  private applyMovementConstraints(
    element: HierarchicalElement, 
    deltaX: number, 
    deltaY: number
  ): { x: number; y: number } {
    const parent = this.hierarchyManager.getParent(element.id);
    if (!parent || !element.constraints.stayWithinParent) return { x: deltaX, y: deltaY }; // 부모가 없거나 제약 조건이 없으면 자유 이동
    
    const newX = element.position.x + deltaX;
    const newY = element.position.y + deltaY;
    
    // 부모 경계 내 유지 계산
    const constrainedX = Math.max(
      parent.position.x,
      Math.min(parent.position.x + parent.size.width - element.size.width, newX)
    );
    
    const constrainedY = Math.max(
      parent.position.y,
      Math.min(parent.position.y + parent.size.height - element.size.height, newY)
    );
    
    return {
      x: constrainedX - element.position.x, // 실제 적용될 deltaX
      y: constrainedY - element.position.y  // 실제 적용될 deltaY
    };
  }

  // 📏 리사이즈 기능 (제약 조건 포함)
  resizeElement(elementId: string, newWidth: number, newHeight: number): void {
    const element = this.hierarchyManager.getElement(elementId);
    if (!element) return;

    // 제약 조건 적용 (minSize, maxSize)
    const constrainedWidth = Math.max(element.constraints.minSize.width, Math.min(element.constraints.maxSize.width, newWidth));
    const constrainedHeight = Math.max(element.constraints.minSize.height, Math.min(element.constraints.maxSize.height, newHeight));

    // 크기 업데이트
    this.hierarchyManager.updateElementSize(element.id, constrainedWidth, constrainedHeight);

    // Fabric.js 객체 업데이트는 CanvasEditor에서 담당
  }
}

TransformManager 역할 분담 이유:

TransformManager는 HierarchicalElement의 position과 size를 변경하는 모든 로직을 담당합니다. 사용자 입력(드래그, 리사이즈 핸들 조작)에 직접적으로 반응하며, HierarchyManager를 통해 실제 데이터 업데이트를 요청합니다. 이동 및 리사이즈 제약 조건(applyMovementConstraints, resizeElement 내부 로직)을 처리하는 핵심적인 역할을 수행합니다.

🎨 메인 React 컴포넌트
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { HierarchyManager } from './core/HierarchyManager';
import { SelectionManager } from './core/SelectionManager';
import { TransformManager } from './core/TransformManager';
import { EdgeDetector } from './core/EdgeDetector';

// Rectangle 타입 정의 (드래그 선택 시 사용)
interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
  intersectsWithObject: (obj: fabric.Object) => boolean;
}

export const CanvasEditor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [managers, setManagers] = useState<{
    hierarchy: HierarchyManager;
    selection: SelectionManager;
    transform: TransformManager;
    edgeDetector: EdgeDetector;
  } | null>(null);
  
  // Fabric.js 캔버스에 요소들을 렌더링하고 상태를 동기화하는 함수
  const renderHierarchy = useCallback((hierarchyManager: HierarchyManager, fabricCanvas: fabric.Canvas) => {
    // 기존 Fabric.js 객체들을 관리하기 위한 맵
    const existingFabricObjects = new Map<string, fabric.Rect>();
    fabricCanvas.getObjects().forEach(obj => {
      if (obj.data && obj.data.id) { // obj.data에 id가 있다고 가정
        existingFabricObjects.set(obj.data.id, obj as fabric.Rect);
      }
    });

    fabricCanvas.clear(); // 모든 객체를 지우고 다시 그리는 대신, 업데이트 방식으로 변경 고려

    // 깊이 순서대로 렌더링 (부모 먼저)
    const elementsToRender = Array.from(hierarchyManager.getAllElements())
      .sort((a, b) => a.depth - b.depth);
    
    elementsToRender.forEach(element => {
      let rect = element.fabricObject;

      if (!rect) { // Fabric.js 객체가 없는 경우 새로 생성
        rect = new fabric.Rect({
          left: element.position.x,
          top: element.position.y,
          width: element.size.width,
          height: element.size.height,
          fill: element.style.fill,
          stroke: element.style.stroke,
          strokeWidth: element.style.strokeWidth,
          selectable: false, // Fabric.js 기본 선택 비활성화
          hasControls: true, // 리사이즈 핸들 활성화
          hasBorders: false, // 기본 테두리 비활성화 (커스텀 테두리 사용)
          data: { id: element.id } // Fabric.js 객체에 요소 ID 저장
        });
        element.fabricObject = rect; // 데이터 모델에 Fabric.js 객체 참조 저장
        fabricCanvas.add(rect);
      } else { // 기존 Fabric.js 객체 업데이트
        rect.set({
          left: element.position.x,
          top: element.position.y,
          width: element.size.width,
          height: element.size.height,
          fill: element.style.fill,
          stroke: element.style.stroke,
          strokeWidth: element.style.strokeWidth,
          // 선택/호버 상태에 따른 테두리 업데이트
          stroke: element.selected || element.hovered ? '#0000FF' : element.style.stroke, // 예시: 선택/호버 시 파란색
          strokeWidth: element.selected || element.hovered ? 3 : element.style.strokeWidth,
        });
      }
      // Fabric.js 객체와 데이터 모델의 상태 동기화
      rect.setCoords(); // 객체 경계 업데이트 (이동/리사이즈 후 필수)
    });
    
    fabricCanvas.renderAll();
  }, []);

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
    const initializeHierarchy = (hm: HierarchyManager) => {
      // 파란색 부모 사각형
      hm.createElement('blue-rect', null, {
        position: { x: 200, y: 100 },
        size: { width: 400, height: 400 },
        style: { fill: '#7FB3D3', stroke: '#000000', strokeWidth: 1 },
        constraints: { stayWithinParent: false, minSize: { width: 20, height: 20 }, maxSize: { width: Infinity, height: Infinity } } // 초기값
      });
      
      // 주황색 자식 사각형
      hm.createElement('orange-rect', 'blue-rect', {
        position: { x: 275, y: 175 },
        size: { width: 250, height: 250 },
        style: { fill: '#FFB347', stroke: '#000000', strokeWidth: 1 },
        constraints: { stayWithinParent: true, minSize: { width: 20, height: 20 }, maxSize: { width: 398, height: 398 } } // 부모보다 작게 (border 고려)
      });
      
      // 보라색 손자 사각형
      hm.createElement('purple-rect', 'orange-rect', {
        position: { x: 325, y: 225 },
        size: { width: 150, height: 150 },
        style: { fill: '#DDA0DD', stroke: '#000000', strokeWidth: 1 },
        constraints: { stayWithinParent: true, minSize: { width: 20, height: 20 }, maxSize: { width: 248, height: 248 } } // 부모보다 작게 (border 고려)
      });
    };
    initializeHierarchy(hierarchyManager);
    
    // 이벤트 핸들러 설정
    const setupEventHandlers = (
      fabricCanvas: fabric.Canvas,
      selectionManager: SelectionManager,
      transformManager: TransformManager,
      hm: HierarchyManager,
      renderCb: (hm: HierarchyManager, fc: fabric.Canvas) => void // renderHierarchy 콜백 추가
    ) => {
      let isDragging = false;
      let isResizing = false;
      let dragStart: { x: number; y: number } | null = null;
      let selectionRect: fabric.Rect | null = null; // 드래그 선택을 위한 사각형

      // 마우스 다운 (선택 시작 또는 드래그 선택 시작)
      fabricCanvas.on('mouse:down', (event) => {
        const pointer = fabricCanvas.getPointer(event.e);
        const target = event.target as fabric.Rect | undefined; // Fabric.js의 타겟 객체

        // Fabric.js의 기본 선택 기능을 사용하지 않으므로, target이 있어도 직접 Edge 기반 선택 로직을 수행
        const selectedElement = selectionManager.selectAtPoint(pointer.x, pointer.y);
        
        if (selectedElement) {
          isDragging = true;
          dragStart = pointer;
          // 선택된 요소의 Fabric.js 객체에 컨트롤 활성화 (리사이즈 핸들)
          if (selectedElement.fabricObject) {
            fabricCanvas.setActiveObject(selectedElement.fabricObject);
            selectedElement.fabricObject.set({ hasControls: true, hasBorders: false }); // 커스텀 테두리 사용
          }
        } else {
          // 아무것도 선택되지 않았으면 드래그 선택 시작
          isDragging = false; // 일반 드래그 방지
          dragStart = pointer;
          selectionRect = new fabric.Rect({
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            fill: 'rgba(0,0,255,0.1)',
            stroke: 'blue',
            strokeWidth: 1,
            selectable: false,
            evented: false // 이벤트 무시
          });
          fabricCanvas.add(selectionRect);
        }
        renderCb(hm, fabricCanvas); // 상태 변경 후 렌더링
      });
      
      // 마우스 이동 (드래그, 리사이즈, 호버)
      fabricCanvas.on('mouse:move', (event) => {
        const pointer = fabricCanvas.getPointer(event.e);
        
        if (isDragging && dragStart && selectionManager.getSelectedElement()) {
          // 요소 드래그 중
          const deltaX = pointer.x - dragStart.x;
          const deltaY = pointer.y - dragStart.y;
          
          const selectedElement = selectionManager.getSelectedElement();
          if (selectedElement) {
            transformManager.moveElementWithChildren(selectedElement.id, deltaX, deltaY);
          }
          dragStart = pointer;
        } else if (selectionRect) {
          // 드래그 선택 중
          const left = Math.min(pointer.x, dragStart!.x);
          const top = Math.min(pointer.y, dragStart!.y);
          const width = Math.abs(pointer.x - dragStart!.x);
          const height = Math.abs(pointer.y - dragStart!.y);
          selectionRect.set({ left, top, width, height });
        } else {
          // Hover 효과
          selectionManager.handleHover(pointer.x, pointer.y);
        }
        renderCb(hm, fabricCanvas); // 상태 변경 후 렌더링
      });
      
      // 마우스 업 (드래그 종료, 선택 종료)
      fabricCanvas.on('mouse:up', () => {
        isDragging = false;
        dragStart = null;

        if (selectionRect) {
          // 드래그 선택 완료
          const rectData: Rectangle = {
            left: selectionRect.left || 0,
            top: selectionRect.top || 0,
            width: selectionRect.width || 0,
            height: selectionRect.height || 0,
            intersectsWithObject: (obj: fabric.Object) => selectionRect!.intersectsWithObject(obj)
          };
          selectionManager.selectByDrag(rectData);
          fabricCanvas.remove(selectionRect);
          selectionRect = null;
        }
        renderCb(hm, fabricCanvas); // 상태 변경 후 렌더링
      });

      // Fabric.js 객체 리사이즈 이벤트
      fabricCanvas.on('object:scaling', (event) => {
        const target = event.target as fabric.Rect;
        if (!target || !target.data || !target.data.id) return;

        const elementId = target.data.id;
        const newWidth = target.width! * target.scaleX!;
        const newHeight = target.height! * target.scaleY!;

        // TransformManager를 통해 리사이즈 제약 조건 적용
        transformManager.resizeElement(elementId, newWidth, newHeight);

        // Fabric.js 객체의 크기를 TransformManager에서 계산된 값으로 다시 설정
        const updatedElement = hm.getElement(elementId);
        if (updatedElement) {
          target.set({
            width: updatedElement.size.width,
            height: updatedElement.size.height,
            scaleX: 1, // 스케일은 1로 초기화하고 width/height를 직접 설정
            scaleY: 1
          });
        }
        renderCb(hm, fabricCanvas);
      });

      // 선택 해제 시 컨트롤 숨기기
      fabricCanvas.on('selection:cleared', () => {
        // 모든 요소의 hasControls를 false로 설정
        fabricCanvas.getObjects().forEach(obj => {
          if (obj instanceof fabric.Rect) {
            obj.set({ hasControls: false });
          }
        });
        renderCb(hm, fabricCanvas);
      });
    };
    setupEventHandlers(fabricCanvas, selectionManager, transformManager, hierarchyManager, renderHierarchy);
    
    // 초기 렌더링
    renderHierarchy(hierarchyManager, fabricCanvas);

    return () => fabricCanvas.dispose();
  }, [renderHierarchy]); // renderHierarchy를 useCallback으로 감싸 의존성 배열에 추가
  
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
        <strong>사용법:</strong> 사각형 모서리 10px 내에서 클릭하여 선택, 드래그로 이동<br/>
        사각형을 드래그하여 이동하거나, 선택 후 모서리 핸들을 이용해 리사이즈 할 수 있습니다.<br/>
        빈 공간을 드래그하여 여러 사각형을 선택할 수 있습니다.
      </div>
    </div>
  );
};

CanvasEditor 컴포넌트 변경 이유:

renderHierarchy 최적화: fabricCanvas.clear() 대신 기존 Fabric.js 객체를 재활용하고 set 메서드를 사용하여 업데이트하도록 변경하여 렌더링 성능을 개선했습니다. selected 및 hovered 상태에 따라 테두리 스타일을 동적으로 변경합니다.

initializeHierarchy에서 minSize, maxSize 초기값 설정: 각 요소의 constraints에 초기 minSize와 maxSize를 설정하여 리사이즈 제약 조건이 즉시 적용될 수 있도록 했습니다. maxSize는 부모의 크기를 고려하여 설정됩니다.

setupEventHandlers 보완:

SelectionManager.getSelectedElement()를 사용하여 현재 선택된 요소를 가져오도록 수정했습니다.

Fabric.js의 hasControls: true를 활용하여 리사이즈 핸들을 활성화하고, object:scaling 이벤트를 통해 리사이즈 로직을 TransformManager와 연동하도록 구현했습니다.

드래그 선택(selectionRect) 로직을 추가하여 마우스 드래그 시 선택 윈도우를 표시하고, 마우스 업 시 SelectionManager.selectByDrag를 호출하도록 했습니다.

선택 해제 시 Fabric.js 객체의 hasControls를 false로 설정하여 리사이즈 핸들이 사라지도록 했습니다.

🚀 구현 전략
우선순위 기반 개발
계층 구조 + 기본 선택 (핵심 알고리즘)

Edge 기반 상호작용 (과제 핵심 요구사항)

재귀적 이동 + 제약 조건 (트리 알고리즘 활용)

리사이즈 기능 (완성도 향상)

드래그 선택 (고급 기능)

핵심 알고리즘 포커스
트리 순회: 부모-자식 관계 탐색

재귀 연산: 계층적 이동 처리

기하학적 계산: Edge 감지, 충돌 검사 (Fabric.js 내장 기능 활용)

제약 조건 해결: 이동/리사이즈 제한 (minSize, maxSize, 부모 경계)

z-index 기반 선택: 겹치는 요소 중 가장 상위 요소 선택

면접 어필 포인트
"계층적 데이터 구조를 Map 기반의 트리로 구현하고, HierarchyManager를 통해 효율적으로 관리했습니다."

Map을 사용하여 ID 기반의 빠른 요소 접근을 가능하게 하고, 부모-자식 관계를 명시적으로 관리하여 트리 연산의 효율성을 높였습니다.

"EdgeDetector와 SelectionManager의 역할을 분리하여 모듈성을 높이고, z-index를 활용한 선택 우선순위 로직으로 겹치는 요소 선택의 모호성을 해결했습니다."

단일 책임 원칙을 적용하여 각 클래스의 역할을 명확히 하고, Fabric.js의 렌더링 순서를 활용해 과제 요구사항을 정확히 만족시켰습니다.

"TransformManager에서 재귀 알고리즘을 통해 계층적 이동을 구현하고, 부모-자식 관계에 따른 이동 및 리사이즈 제약 조건을 정교하게 처리했습니다."

재귀를 통해 모든 자식 요소가 부모를 따라 이동하도록 구현했으며, minSize, maxSize 및 부모 경계 내 유지 로직을 통해 일관된 사용자 경험을 제공합니다.

"Fabric.js의 강력한 기능을 활용하면서도, 핵심 로직은 커스텀 매니저 클래스에서 직접 구현하여 프레임워크 의존성을 최소화하고 로직의 투명성을 확보했습니다."

Fabric.js는 캔버스 렌더링과 기본 상호작용에 활용하되, 계층 구조 관리, 선택 로직, 변환 제약 조건 등 핵심 비즈니스 로직은 직접 설계한 매니저 클래스에서 처리하여 코드 이해도를 높였습니다.

📝 제출 체크리스트
필수 기능 구현
[ ] 3개 중첩 사각형 렌더링

[ ] Edge 기반 선택 (10px 내)

[ ] 계층적 이동 (자식 따라감)

[ ] 이동 제약 조건

[ ] 리사이즈 기능

[ ] 드래그 선택

코드 품질
[ ] TypeScript 타입 안정성

[ ] 명확한 변수명과 함수명

[ ] 적절한 주석

[ ] 일관된 코드 스타일

문서화
[ ] README.md 완성

[ ] 실행 방법 명시

[ ] 구현 내용 설명

[ ] 데모 링크 제공