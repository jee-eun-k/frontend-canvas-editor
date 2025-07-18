import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as fabric from 'fabric';

// 새로운 아키텍처 매니저들 import
import { AppState, CURSOR_TYPES } from '../core/types';
import { EventBus } from '../core/EventBus';
import { StateManager } from '../core/StateManager';
import { HierarchyManager } from '../core/HierarchyManager.new';
import { EdgeDetector } from '../core/EdgeDetector';
import { SelectionManager } from '../core/SelectionManager.new';
import { ConstraintCalculator } from '../core/ConstraintCalculator';
import { TransformManager } from '../core/TransformManager.new';
import { RenderManager } from '../core/RenderManager';

interface ManagerInstances {
  eventBus: EventBus;
  stateManager: StateManager;
  hierarchyManager: HierarchyManager;
  edgeDetector: EdgeDetector;
  selectionManager: SelectionManager;
  constraintCalculator: ConstraintCalculator;
  transformManager: TransformManager;
  renderManager: RenderManager;
}

export const CanvasEditor: React.FC = () => {
  // 레퍼런스
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  
  // 매니저 인스턴스들
  const [managers, setManagers] = useState<ManagerInstances | null>(null);

  // 상호작용 상태
  const [interactionState, setInteractionState] = useState({
    isDragging: false,
    isDragSelecting: false,
    dragStart: null as { x: number; y: number } | null,
    lastMousePosition: null as { x: number; y: number } | null
  });

  // 디버깅 정보 상태
  const [debugInfo, setDebugInfo] = useState<any>(null);

  /**
   * 매니저들 초기화
   */
  const initializeManagers = useCallback((fabricCanvas: fabric.Canvas): ManagerInstances => {
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
    const renderManager = new RenderManager(fabricCanvas, stateManager, hierarchyManager, constraintCalculator, eventBus);

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
    hierarchyManager.createElement('blue-parent', null, {
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
    hierarchyManager.createElement('orange-child', 'blue-parent', {
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
    hierarchyManager.createElement('purple-grandchild', 'orange-child', {
      position: { x: 140, y: 140 },
      size: { width: 80, height: 60 },
      style: {
        fill: '#9013fe',
        stroke: '#000000',
        strokeWidth: 1,
        opacity: 1
      }
    });

    console.log('초기 요소들 생성 완료');
  }, []);

  /**
   * 이벤트 핸들러 설정
   */
  const setupEventHandlers = useCallback((fabricCanvas: fabric.Canvas, managers: ManagerInstances) => {
    const { selectionManager, transformManager, stateManager, eventBus } = managers;

    /**
     * 마우스 다운 이벤트
     */
    const handleMouseDown = (event: fabric.IEvent) => {
      const pointer = fabricCanvas.getPointer(event.e);
      const { x, y } = pointer;

      // Fabric 객체가 클릭되었는지 확인
      const fabricTarget = event.target;
      
      if (fabricTarget && fabricTarget.type === 'rect') {
        // Fabric 객체 직접 클릭 - 리사이즈 모드
        return; // Fabric의 기본 처리에 맡김
      }

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
        stateManager.dispatch({ type: 'SET_CURSOR', cursorType: 'move' });
      } else {
        // 빈 공간 클릭 - 드래그 선택 시작
        setInteractionState(prev => ({
          ...prev,
          isDragSelecting: true,
          dragStart: { x, y }
        }));

        stateManager.dispatch({ type: 'SET_CURSOR', cursorType: 'crosshair' });
      }

      // 기본 Fabric 이벤트 방지 (선택적)
      if (!fabricTarget) {
        event.e.preventDefault();
      }
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
          stateManager.dispatch({ type: 'SET_CURSOR', cursorType: 'move' });
        } else {
          stateManager.dispatch({ type: 'SET_CURSOR', cursorType: 'default' });
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
      stateManager.dispatch({ type: 'SET_CURSOR', cursorType: 'default' });
    };

    /**
     * 리사이즈 이벤트 (Fabric 내장 기능 사용)
     */
    const handleObjectScaling = (event: fabric.IEvent) => {
      const fabricObject = event.target as fabric.Rect;
      if (!fabricObject) return;

      // Fabric 객체에서 해당 요소 ID 찾기
      const state = stateManager.getState();
      const elementId = Array.from(state.elements.entries())
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

    /**
     * Fabric 객체 선택 이벤트
     */
    const handleObjectSelection = (event: fabric.IEvent) => {
      const fabricObject = event.target as fabric.Rect;
      if (!fabricObject) return;

      // Fabric 객체에서 해당 요소 ID 찾기
      const state = stateManager.getState();
      const elementId = Array.from(state.elements.entries())
        .find(([_, element]) => element.fabricObject === fabricObject)?.[0];

      if (elementId) {
        selectionManager.selectElement(elementId);
      }
    };

    /**
     * Fabric 객체 이동 이벤트
     */
    const handleObjectMoving = (event: fabric.IEvent) => {
      const fabricObject = event.target as fabric.Rect;
      if (!fabricObject) return;

      // Fabric 객체에서 해당 요소 ID 찾기
      const state = stateManager.getState();
      const elementId = Array.from(state.elements.entries())
        .find(([_, element]) => element.fabricObject === fabricObject)?.[0];

      if (elementId) {
        const element = state.elements.get(elementId);
        if (element) {
          const deltaX = fabricObject.left! - element.position.x;
          const deltaY = fabricObject.top! - element.position.y;
          
          transformManager.moveElementWithChildren(elementId, deltaX, deltaY);
        }
      }
    };

    // 이벤트 리스너 등록
    fabricCanvas.on('mouse:down', handleMouseDown);
    fabricCanvas.on('mouse:move', handleMouseMove);
    fabricCanvas.on('mouse:up', handleMouseUp);
    fabricCanvas.on('object:scaling', handleObjectScaling);
    fabricCanvas.on('selection:created', handleObjectSelection);
    fabricCanvas.on('selection:updated', handleObjectSelection);
    fabricCanvas.on('object:moving', handleObjectMoving);

    // 컨텍스트 메뉴 비활성화 - 일부 이벤트는 허용
    // fabricCanvas.on('before:selection:cleared', () => false);

    // 정리 함수 반환
    return () => {
      fabricCanvas.off('mouse:down', handleMouseDown);
      fabricCanvas.off('mouse:move', handleMouseMove);
      fabricCanvas.off('mouse:up', handleMouseUp);
      fabricCanvas.off('object:scaling', handleObjectScaling);
      fabricCanvas.off('selection:created', handleObjectSelection);
      fabricCanvas.off('selection:updated', handleObjectSelection);
      fabricCanvas.off('object:moving', handleObjectMoving);
    };
  }, [interactionState]);

  /**
   * 디버깅 정보 업데이트
   */
  const updateDebugInfo = useCallback(() => {
    if (!managers) return;

    const state = managers.stateManager.getState();
    const selectedElement = managers.selectionManager.getSelectedElement();
    const hoveredElement = managers.selectionManager.getHoveredElement();

    setDebugInfo({
      selectedElement: selectedElement?.id || 'None',
      hoveredElement: hoveredElement?.id || 'None',
      isDragging: interactionState.isDragging,
      isDragSelecting: interactionState.isDragSelecting,
      cursorType: state.cursorType,
      dirtyElements: state.dirtyElements.size,
      totalElements: state.elements.size,
      hierarchyInfo: managers.hierarchyManager.getDebugInfo(),
      edgeDetectorInfo: managers.edgeDetector.getCacheStats(),
      renderManagerInfo: managers.renderManager.getDebugInfo()
    });
  }, [managers, interactionState]);

  /**
   * 컴포넌트 초기화
   */
  useEffect(() => {
    if (!canvasRef.current) return;

    // Fabric 캔버스 생성
    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      selection: true,         // 기본 선택 기능 활성화
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
      managersInstance.renderManager.forceRender();
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
   * 디버깅 정보 주기적 업데이트
   */
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const interval = setInterval(updateDebugInfo, 1000);
    return () => clearInterval(interval);
  }, [updateDebugInfo]);

  /**
   * 키보드 이벤트 핸들러
   */
  useEffect(() => {
    if (!managers) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'z':
            event.preventDefault();
            managers.stateManager.dispatch({ type: 'UNDO' });
            break;
          case 'y':
            event.preventDefault();
            managers.stateManager.dispatch({ type: 'REDO' });
            break;
          case 'a':
            event.preventDefault();
            managers.selectionManager.selectAll();
            break;
          case 'd':
            event.preventDefault();
            const selected = managers.selectionManager.getSelectedElement();
            if (selected) {
              managers.transformManager.duplicateElement(selected.id);
            }
            break;
        }
      } else {
        switch (event.key) {
          case 'Delete':
          case 'Backspace':
            const selectedElement = managers.selectionManager.getSelectedElement();
            if (selectedElement) {
              managers.hierarchyManager.deleteElement(selectedElement.id);
            }
            break;
          case 'Escape':
            managers.selectionManager.deselectAll();
            break;
          case 'ArrowUp':
            managers.selectionManager.selectPrevious();
            break;
          case 'ArrowDown':
            managers.selectionManager.selectNext();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [managers]);

  /**
   * 디버깅 정보 표시 (개발 환경에서만)
   */
  const renderDebugInfo = () => {
    if (process.env.NODE_ENV !== 'development' || !debugInfo) return null;

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
        maxWidth: '300px',
        maxHeight: '500px',
        overflow: 'auto'
      }}>
        <div><strong>선택된 요소:</strong> {debugInfo.selectedElement}</div>
        <div><strong>호버된 요소:</strong> {debugInfo.hoveredElement}</div>
        <div><strong>드래그 중:</strong> {debugInfo.isDragging ? 'Yes' : 'No'}</div>
        <div><strong>드래그 선택 중:</strong> {debugInfo.isDragSelecting ? 'Yes' : 'No'}</div>
        <div><strong>커서:</strong> {debugInfo.cursorType}</div>
        <div><strong>Dirty 요소:</strong> {debugInfo.dirtyElements}</div>
        <div><strong>전체 요소 수:</strong> {debugInfo.totalElements}</div>
        
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #444' }}>
          <strong>계층 정보:</strong>
          <div>루트 요소: {debugInfo.hierarchyInfo?.rootElements}</div>
          <div>최대 깊이: {debugInfo.hierarchyInfo?.maxDepth}</div>
        </div>
        
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #444' }}>
          <strong>렌더 정보:</strong>
          <div>캔버스 객체: {debugInfo.renderManagerInfo?.totalObjects}</div>
          <div>렌더 대기: {debugInfo.renderManagerInfo?.rendersPending ? 'Yes' : 'No'}</div>
          <div>줌: {debugInfo.renderManagerInfo?.zoom?.toFixed(2)}</div>
        </div>
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
        bottom: -80,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: '14px',
        color: '#666'
      }}>
        <p>• 사각형 모서리 10px 영역에서 호버/선택 가능</p>
        <p>• 드래그로 이동, 선택 핸들로 리사이즈</p>
        <p>• 빈 공간 드래그로 다중 선택 가능</p>
        <p>• 키보드: Ctrl+Z/Y (실행취소/재실행), Del (삭제), Esc (선택해제)</p>
      </div>
    </div>
  );
};

export default CanvasEditor;