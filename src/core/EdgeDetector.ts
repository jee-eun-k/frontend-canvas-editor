import { HierarchicalElement } from './types';

/**
 * 기하학적 계산 유틸리티
 */
export class GeometryUtils {
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
export class EdgeDetector {
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
   * Edge threshold 설정
   */
  setEdgeThreshold(threshold: number): void {
    if (threshold < 0) {
      throw new Error('Edge threshold must be non-negative');
    }
    // readonly 속성을 우회하여 설정
    (this as any).EDGE_THRESHOLD = threshold;
    this.clearCache();
  }

  /**
   * 현재 edge threshold 조회
   */
  getEdgeThreshold(): number {
    return this.EDGE_THRESHOLD;
  }

  /**
   * 특정 요소의 edge 영역 경계박스 계산
   */
  getEdgeBounds(element: HierarchicalElement): {
    outer: { x: number; y: number; width: number; height: number };
    inner: { x: number; y: number; width: number; height: number } | null;
  } {
    const { position, size } = element;
    const threshold = this.EDGE_THRESHOLD;

    const outer = {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height
    };

    const innerWidth = Math.max(0, size.width - 2 * threshold);
    const innerHeight = Math.max(0, size.height - 2 * threshold);

    const inner = innerWidth > 0 && innerHeight > 0 ? {
      x: position.x + threshold,
      y: position.y + threshold,
      width: innerWidth,
      height: innerHeight
    } : null;

    return { outer, inner };
  }

  /**
   * 캐시 정리
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 캐시 통계 정보
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    maxSize: number;
  } {
    // 간단한 구현 - 실제로는 hit/miss 카운터 필요
    return {
      size: this.cache.size,
      hitRate: 0, // 실제 구현에서는 계산 필요
      maxSize: 1000
    };
  }
}