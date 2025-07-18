import * as fabric from 'fabric';
import { HierarchicalElement } from './types';
import { StateManager } from './StateManager';
import { HierarchyManager } from './HierarchyManager.new';
import { EventBus } from './EventBus';
import { ConstraintCalculator } from './ConstraintCalculator';

/**
 * 성능 최적화된 렌더링 관리자
 * - Dirty tracking으로 불필요한 렌더링 최소화
 * - 배치 처리로 성능 향상
 * - 메모리 효율적인 Fabric 객체 관리
 */
export class RenderManager {
  private fabricCanvas: fabric.Canvas;
  private stateManager: StateManager;
  private hierarchyManager: HierarchyManager;
  private constraintCalculator: ConstraintCalculator;
  private eventBus: EventBus;
  private animationFrameId: number | null = null;
  private renderPending = false;

  constructor(
    fabricCanvas: fabric.Canvas,
    stateManager: StateManager,
    hierarchyManager: HierarchyManager,
    constraintCalculator: ConstraintCalculator,
    eventBus: EventBus
  ) {
    this.fabricCanvas = fabricCanvas;
    this.stateManager = stateManager;
    this.hierarchyManager = hierarchyManager;
    this.constraintCalculator = constraintCalculator;
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
        selectable: true,         // 선택 활성화
        evented: true,           // 이벤트 활성화
        hoverCursor: 'move',
        moveCursor: 'move'
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
    const validation = this.constraintCalculator.validateConstraints(element);
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

    // 모든 요소의 선택 컨트롤 기본 설정
    this.fabricCanvas.getObjects().forEach(obj => {
      if (obj instanceof fabric.Rect) {
        obj.hasControls = true;
        obj.hasBorders = true;
        obj.cornerStyle = 'circle';
        obj.cornerSize = 6;
        obj.transparentCorners = false;
        obj.cornerColor = '#007acc';
        obj.selectable = true;
        obj.evented = true;
      }
    });

    // 선택된 요소에만 특별한 스타일 적용
    if (selectedElement && selectedElement.fabricObject) {
      selectedElement.fabricObject.cornerColor = '#ff6600';
      selectedElement.fabricObject.cornerSize = 8;
      selectedElement.fabricObject.borderColor = '#ff6600';
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
      (obj as any).data?.elementId === elementId
    );

    objectsToRemove.forEach(obj => {
      this.fabricCanvas.remove(obj);
    });
  }

  /**
   * 드래그 선택 영역 렌더링
   */
  renderDragSelection(selectionRect: { x: number; y: number; width: number; height: number } | null): void {
    // 기존 선택 영역 제거
    const existingSelection = this.fabricCanvas.getObjects().find(obj => 
      (obj as any).data?.type === 'drag-selection'
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
      } as any);

      this.fabricCanvas.add(dragSelectionRect);
    }

    this.fabricCanvas.renderAll();
  }

  /**
   * 캔버스 배경 설정
   */
  setCanvasBackground(color: string): void {
    this.fabricCanvas.setBackgroundColor(color, () => {
      this.fabricCanvas.renderAll();
    });
  }

  /**
   * 캔버스 크기 변경
   */
  resizeCanvas(width: number, height: number): void {
    this.fabricCanvas.setWidth(width);
    this.fabricCanvas.setHeight(height);
    this.fabricCanvas.renderAll();
  }

  /**
   * 캔버스 줌 설정
   */
  setZoom(zoom: number): void {
    this.fabricCanvas.setZoom(zoom);
    this.fabricCanvas.renderAll();
  }

  /**
   * 캔버스 중심점 설정
   */
  setViewport(x: number, y: number): void {
    this.fabricCanvas.absolutePan(new fabric.Point(x, y));
    this.fabricCanvas.renderAll();
  }

  /**
   * 모든 요소가 보이도록 뷰포트 조정
   */
  fitToContent(): void {
    const objects = this.fabricCanvas.getObjects();
    if (objects.length === 0) return;

    const group = new fabric.Group(objects);
    const boundingRect = group.getBoundingRect();
    
    const canvasWidth = this.fabricCanvas.getWidth();
    const canvasHeight = this.fabricCanvas.getHeight();
    
    const scaleX = canvasWidth / boundingRect.width;
    const scaleY = canvasHeight / boundingRect.height;
    const scale = Math.min(scaleX, scaleY) * 0.9; // 10% 여백

    this.fabricCanvas.setZoom(scale);
    this.fabricCanvas.absolutePan(new fabric.Point(
      -boundingRect.left * scale + (canvasWidth - boundingRect.width * scale) / 2,
      -boundingRect.top * scale + (canvasHeight - boundingRect.height * scale) / 2
    ));
    
    this.fabricCanvas.renderAll();
  }

  /**
   * 스크린샷 생성
   */
  exportAsImage(format: 'png' | 'jpeg' = 'png', quality: number = 1): string {
    return this.fabricCanvas.toDataURL({
      format,
      quality,
      multiplier: 1
    });
  }

  /**
   * 캔버스 데이터 내보내기
   */
  exportCanvasData(): string {
    return JSON.stringify(this.fabricCanvas.toJSON());
  }

  /**
   * 캔버스 데이터 불러오기
   */
  importCanvasData(data: string): void {
    this.fabricCanvas.loadFromJSON(data, () => {
      this.fabricCanvas.renderAll();
    });
  }

  /**
   * 성능 통계 조회
   */
  getPerformanceStats(): {
    totalObjects: number;
    renderingFPS: number;
    lastRenderTime: number;
    queuedRenders: number;
  } {
    return {
      totalObjects: this.fabricCanvas.getObjects().length,
      renderingFPS: 60, // 실제 구현에서는 측정 필요
      lastRenderTime: performance.now(),
      queuedRenders: this.renderPending ? 1 : 0
    };
  }

  /**
   * 렌더링 강제 실행
   */
  forceRender(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.renderPending = false;
    this.render();
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
    
    // 이벤트 리스너 제거
    this.eventBus.removeAllListeners();
  }

  /**
   * 디버깅 정보
   */
  getDebugInfo(): {
    totalObjects: number;
    dirtyElements: number;
    rendersPending: boolean;
    canvasSize: { width: number; height: number };
    zoom: number;
  } {
    const state = this.stateManager.getState();
    return {
      totalObjects: this.fabricCanvas.getObjects().length,
      dirtyElements: state.dirtyElements.size,
      rendersPending: this.renderPending,
      canvasSize: {
        width: this.fabricCanvas.getWidth(),
        height: this.fabricCanvas.getHeight()
      },
      zoom: this.fabricCanvas.getZoom()
    };
  }
}