import { EventPayload } from './types';

/**
 * 중앙 집중식 이벤트 버스
 * - 모든 컴포넌트 간 느슨한 결합 제공
 * - 확장성과 유지보수성 향상
 * - 디버깅 및 로깅 기능 내장
 */
export class EventBus {
  private listeners = new Map<string, Set<Function>>();
  private eventHistory: EventPayload[] = [];
  private debugging = false;

  /**
   * 이벤트 발생
   * @param event - 이벤트 이름
   * @param data - 이벤트 데이터
   * @param source - 이벤트 발생원 (디버깅용)
   */
  emit(event: string, data: any, source: string = 'unknown'): void {
    const payload: EventPayload = {
      timestamp: new Date(),
      source,
      data
    };

    // 디버깅 모드에서 로깅
    if (this.debugging) {
      console.log(`[EventBus] ${event}:`, payload);
    }

    // 이벤트 히스토리 저장
    this.eventHistory.push(payload);
    if (this.eventHistory.length > 1000) {
      this.eventHistory.shift(); // 메모리 관리
    }

    // 리스너들에게 이벤트 전달
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[EventBus] Error in listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * 이벤트 리스너 등록
   * @param event - 이벤트 이름
   * @param listener - 리스너 함수
   * @returns 구독 해제 함수
   */
  on(event: string, listener: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // 구독 해제 함수 반환
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  /**
   * 한 번만 실행되는 이벤트 리스너
   */
  once(event: string, listener: Function): () => void {
    const onceWrapper = (data: any) => {
      listener(data);
      this.listeners.get(event)?.delete(onceWrapper);
    };
    return this.on(event, onceWrapper);
  }

  /**
   * 모든 리스너 제거
   */
  off(event: string, listener?: Function): void {
    if (!listener) {
      this.listeners.delete(event);
      return;
    }

    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * 디버깅 모드 토글
   */
  enableDebugging(enable: boolean = true): void {
    this.debugging = enable;
  }

  /**
   * 이벤트 히스토리 조회
   */
  getEventHistory(): EventPayload[] {
    return [...this.eventHistory];
  }

  /**
   * 특정 이벤트의 최근 항목 조회
   */
  getRecentEvents(event: string, limit: number = 10): EventPayload[] {
    return this.eventHistory
      .filter(payload => payload.source === event)
      .slice(-limit);
  }

  /**
   * 이벤트 히스토리 초기화
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * 모든 리스너 제거
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * 디버깅 정보 출력
   */
  getDebugInfo(): {
    totalListeners: number;
    eventsWithListeners: string[];
    historySize: number;
  } {
    return {
      totalListeners: Array.from(this.listeners.values()).reduce(
        (sum, listeners) => sum + listeners.size, 0
      ),
      eventsWithListeners: Array.from(this.listeners.keys()),
      historySize: this.eventHistory.length
    };
  }
}