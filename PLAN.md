# 🚀 Frontend Canvas Assignment - 구현 계획

## 개요
기본적인 계층 구조를 가진 캔버스에서 객체 선택 기능을 구현하는 4일 과제입니다.

## Phase 1: 프로젝트 초기 설정 (Day 1 - 2시간)

### Step 1: GitHub Repository 생성

```bash
git clone https://github.com/[username]/frontend-canvas-editor.git
cd frontend-canvas-editor
```

### Step 2: Bun 프로젝트 초기화

```bash
# 1. Bun 설치 (없다면)
curl -fsSL https://bun.sh/install | bash

# 2. React + TypeScript 프로젝트 생성
bun create react-app . --template typescript

# 또는 직접 초기화
bun init -y
bun add react react-dom
bun add -D @types/react @types/react-dom typescript
```

### Step 3: 필요한 라이브러리 설치

```bash
# 메인 라이브러리
bun add fabric
bun add @types/fabric
bun add styled-components
bun add @types/styled-components

# 개발 도구
bun add -D prettier eslint-config-prettier
bun add -D @typescript-eslint/eslint-plugin @typescript-eslint/parser
bun add -D vite @vitejs/plugin-react  # Vite 사용 권장
```

### Step 4: Vite 설정 (Bun과 잘 호환됨)

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
  },
})
```

```json
// package.json 스크립트 수정
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext ts,tsx",
    "format": "prettier --write src/**/*.{ts,tsx}"
  }
}
```

## Phase 2: 핵심 기능 구현 (Day 1-2)

### Step 5: Fabric.js 기본 설정

```typescript
// src/components/Canvas.tsx
import React, { useRef, useEffect, useState } from 'react';
import { fabric } from 'fabric';

interface RectangleData {
  id: string;
  color: string;
  parentId?: string;
  fabricObject?: fabric.Rect;
}

const Canvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [rectangles, setRectangles] = useState<RectangleData[]>([]);
  
  // Fabric.js 캠버스 초기화
  useEffect(() => {
    if (canvasRef.current) {
      const fabricCanvas = new fabric.Canvas(canvasRef.current, {
        width: 800,
        height: 600,
        backgroundColor: '#ffffff'
      });
      setCanvas(fabricCanvas);
      
      return () => {
        fabricCanvas.dispose();
      };
    }
  }, []);
  
  // 초기 사각형 생성
  useEffect(() => {
    if (canvas) {
      createRectangles();
    }
  }, [canvas]);
  
  const createRectangles = () => {
    // 파란색 부모 사각형
    const blueRect = new fabric.Rect({
      left: 200,
      top: 100,
      width: 400,
      height: 400,
      fill: '#7FB3D3',
      stroke: '#000000',
      strokeWidth: 1,
      selectable: false // Fabric.js 기본 선택 비활성화
    });
    
    // 주황색 중간 사각형
    const orangeRect = new fabric.Rect({
      left: 275,
      top: 175,
      width: 250,
      height: 250,
      fill: '#FFB347',
      stroke: '#000000',
      strokeWidth: 1,
      selectable: false
    });
    
    // 보라색 자식 사각형
    const purpleRect = new fabric.Rect({
      left: 325,
      top: 225,
      width: 150,
      height: 150,
      fill: '#DDA0DD',
      stroke: '#000000',
      strokeWidth: 1,
      selectable: false
    });
    
    canvas.add(blueRect, orangeRect, purpleRect);
    
    setRectangles([
      { id: '1', color: '#7FB3D3', fabricObject: blueRect },
      { id: '2', color: '#FFB347', parentId: '1', fabricObject: orangeRect },
      { id: '3', color: '#DDA0DD', parentId: '2', fabricObject: purpleRect }
    ]);
  };
  
  return (
    <canvas ref={canvasRef} />
  );
};
```

### Step 6: 선택 기능 구현

```typescript
useEffect(() => {
  if (canvas) {
    // 마우스 클릭 이벤트 리스너
    canvas.on('mouse:down', handleCanvasClick);
    
    return () => {
      canvas.off('mouse:down', handleCanvasClick);
    };
  }
}, [canvas, rectangles]);

const handleCanvasClick = (event: fabric.IEvent) => {
  const pointer = canvas.getPointer(event.e);
  const clickedRectangle = findRectangleAtPoint(pointer.x, pointer.y);
  
  // 모든 사각형 선택 해제
  rectangles.forEach(rect => {
    if (rect.fabricObject) {
      rect.fabricObject.set({
        stroke: '#000000',
        strokeWidth: 1
      });
    }
  });
  
  // 선택된 사각형 강조
  if (clickedRectangle && clickedRectangle.fabricObject) {
    clickedRectangle.fabricObject.set({
      stroke: '#000000',
      strokeWidth: 3 // 또는 더 진한 색상
    });
  }
  
  canvas.renderAll();
};

const findRectangleAtPoint = (x: number, y: number): RectangleData | null => {
  // 가장 작은 사각형부터 확인 (역순으로 정렬)
  const sortedRectangles = [...rectangles].reverse();
  
  for (const rectangle of sortedRectangles) {
    if (rectangle.fabricObject && isPointInRectangle(x, y, rectangle.fabricObject)) {
      return rectangle;
    }
  }
  return null;
};

const isPointInRectangle = (x: number, y: number, rect: fabric.Rect): boolean => {
  const left = rect.left || 0;
  const top = rect.top || 0;
  const width = rect.width || 0;
  const height = rect.height || 0;
  
  return x >= left && x <= left + width &&
         y >= top && y <= top + height;
};
```

## Phase 3: 고급 기능 (Day 2-3)

### Step 7: 호버 효과 추가 (선택사항)

```typescript
useEffect(() => {
  if (canvas) {
    // 호버 이벤트 리스너
    canvas.on('mouse:move', handleMouseMove);
    
    return () => {
      canvas.off('mouse:move', handleMouseMove);
    };
  }
}, [canvas, rectangles]);

const handleMouseMove = (event: fabric.IEvent) => {
  const pointer = canvas.getPointer(event.e);
  const hoveredRectangle = findRectangleAtPoint(pointer.x, pointer.y);
  
  // 모든 사각형 호버 상태 제거
  rectangles.forEach(rect => {
    if (rect.fabricObject) {
      const currentStroke = rect.fabricObject.strokeWidth;
      if (currentStroke === 2) { // 호버 상태였다면
        rect.fabricObject.set({
          strokeWidth: 1
        });
      }
    }
  });
  
  // 호버된 사각형 강조
  if (hoveredRectangle && hoveredRectangle.fabricObject) {
    const currentStroke = hoveredRectangle.fabricObject.strokeWidth;
    if (currentStroke !== 3) { // 선택된 상태가 아니라면
      hoveredRectangle.fabricObject.set({
        strokeWidth: 2 // 호버 효과
      });
    }
  }
  
  canvas.renderAll();
};
```

### Step 8: 완성된 컴포넌트

```typescript
// src/components/Canvas.tsx - 완성된 코드
import React, { useRef, useEffect, useState } from 'react';
import { fabric } from 'fabric';

interface RectangleData {
  id: string;
  color: string;
  parentId?: string;
  fabricObject?: fabric.Rect;
}

const Canvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [rectangles, setRectangles] = useState<RectangleData[]>([]);
  
  // 모든 이벤트 핸들러와 초기화 로직...
  
  return (
    <div>
      <canvas ref={canvasRef} />
      <div>
        <p>사각형을 클릭하여 선택하세요</p>
        <p>겹치는 영역에서는 가장 작은 사각형이 선택됩니다</p>
      </div>
    </div>
  );
};

export default Canvas;
```

## Phase 4: 완성 및 배포 (Day 3-4)

### Step 9: 배포 설정

#### Vercel 배포 (Bun 지원)

```bash
bun add -g vercel
vercel --prod
```

```json
// vercel.json 설정
{
  "buildCommand": "bun run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

#### Netlify 배포

```bash
bun run build
# dist 폴더 업로드
```

```toml
# netlify.toml 설정
[build]
  command = "bun run build"
  publish = "dist"
```

#### GitHub Pages 배포

```bash
bun add -D gh-pages
```

```json
// package.json에 추가
{
  "homepage": "https://[username].github.io/frontend-canvas-editor",
  "scripts": {
    "predeploy": "bun run build",
    "deploy": "gh-pages -d dist"
  }
}

bun run deploy
```

## 핵심 구현 고려사항

### 1. 계층 선택 전략

```typescript
// 옵션 1: 가장 작은 사각형 우선
const findTopMostRectangle = (x: number, y: number) => {
  return rectangles
    .filter(r => isPointInRectangle(x, y, r))
    .sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
};

// 옵션 2: 계층 구조 고려
const findDeepestChild = (x: number, y: number) => {
  const candidates = rectangles.filter(r => isPointInRectangle(x, y, r));
  return candidates.find(r => !candidates.some(c => c.parentId === r.id)) || candidates[0];
};
```

### 2. 성능 최적화

```typescript
// 리렌더링 최적화
const renderCanvas = useCallback(() => {
  const canvas = canvasRef.current;
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  rectangles.forEach(rect => drawRectangle(ctx, rect));
}, [rectangles]);

useEffect(() => {
  renderCanvas();
}, [renderCanvas]);
```

### 3. 간단한 테스트

```typescript
// 기본 테스트 시나리오
const testSelectionLogic = () => {
  console.log('Testing selection logic...');
  
  // 1. 각 사각형 개별 선택 테스트
  // 2. 겹치는 영역 클릭 테스트  
  // 3. 빈 공간 클릭 테스트
};
```

## 최종 체크리스트

### 필수 구현 사항
- [ ] 3개의 중첩된 사각형 렌더링
- [ ] 클릭 이벤트 처리
- [ ] 선택 상태 시각적 표시
- [ ] 계층 구조 고려한 선택 로직
- [ ] 깔끔한 코드 구조

### 추가 고려사항
- [ ] 에러 처리 (캔버스 로드 실패 등)
- [ ] 반응형 캔버스 크기
- [ ] 간단한 문서화
- [ ] 코드 주석

### 배포 준비
- [ ] 빌드 테스트
- [ ] 다양한 브라우저 테스트
- [ ] README 업데이트

## 📝 README.md 예시

```markdown
# Frontend Canvas Assignment

## 📋 과제 설명
기본적인 계층 구조를 가진 캔버스에서 객체 선택 기능을 구현하는 과제입니다.

## 🚀 실행 방법

```bash
bun install
bun run dev
```

## 🎯 구현 내용
- 3개의 중첩된 사각형 렌더링
- 클릭을 통한 선택 기능
- 계층 구조를 고려한 선택 로직
- 선택 상태 시각적 피드백

## 🛠 기술 스택
- React + TypeScript
- HTML5 Canvas
- Bun (런타임)
- Vite (번들러)
```
