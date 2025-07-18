import React, { useState, useEffect } from 'react';
import { useFabricJSEditor, FabricJSCanvas } from 'fabricjs-react';
import * as fabric from 'fabric';


// 1. 데이터 구조 정의 (TypeScript Interface)
interface CanvasObject {
	id: string; // 고유 식별자
	parentId: string | null; // 부모 ID, 최상위 객체는 null
	left: number;
	top: number;
	width: number;
	height: number;
	fill: string; // 내부 색상
	stroke: string; // Border 색상
}

// 2. 초기 데이터 생성
const initialObjects: CanvasObject[] = [
	{
		id: 'parent',
		parentId: null,
		left: 100,
		top: 50,
		width: 600,
		height: 500,
		fill: 'rgba(0, 0, 255, 0.3)',
		stroke: 'blue',
	},
	{
		id: 'child',
		parentId: 'parent',
		left: 150,
		top: 100,
		width: 300,
		height: 250,
		fill: 'rgba(255, 165, 0, 0.3)',
		stroke: 'orange',
	},
	{
		id: 'grandchild',
		parentId: 'child',
		left: 200,
		top: 150,
		width: 150,
		height: 100,
		fill: 'rgba(128, 0, 128, 0.3)',
		stroke: 'purple',
	},
];

export const CanvasEditor = () => {
  const { editor, onReady } = useFabricJSEditor();
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragCandidate, setDragCandidate] = useState<string | null>(null);
  const [clickOffset, setClickOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [objects, setObjects] = useState<CanvasObject[]>(initialObjects);

  const handleReady = (canvas: fabric.Canvas) => {
    canvas.setDimensions({ width: 800, height: 600 });
    onReady(canvas);
  };

  // 3. React 상태와 Fabric.js 캔버스 동기화
  useEffect(() => {
    if (!editor?.canvas) {
      return;
    }

    // 캔버스를 비우고 상태 기반으로 다시 렌더링
    editor.canvas.clear();

    objects.forEach((obj) => {
      // Apply drag offset to selected object and its descendants during dragging
      let displayLeft = obj.left;
      let displayTop = obj.top;
      
      if (isDragging && dragCandidate) {
        const selectedObj = objects.find(o => o.id === dragCandidate);
        if (selectedObj) {
          const descendants = getAllDescendants(dragCandidate, objects);
          const objectsToMove = [selectedObj, ...descendants];
          
          if (objectsToMove.some(moveObj => moveObj.id === obj.id)) {
            displayLeft = obj.left + dragOffset.x;
            displayTop = obj.top + dragOffset.y;
          }
        }
      }

      const rect = new fabric.Rect({
        left: displayLeft,
        top: displayTop,
        width: obj.width,
        height: obj.height,
        fill: obj.fill,
        stroke: obj.stroke,
        strokeWidth: (selectedObjectId === obj.id || hoveredObjectId === obj.id) ? 3 : 1,
        selectable: false,
        hasControls: false,
        id: obj.id, // Assign custom id to fabric object
      });
      editor.canvas.add(rect);
    });

    editor.canvas.renderAll();
  }, [editor, objects, selectedObjectId, hoveredObjectId]);

  const getObjectDepth = (id: string, currentObjects: CanvasObject[]): number => {
    const obj = currentObjects.find((o) => o.id === id);
    if (!obj || !obj.parentId) {
      return 0;
    }
    return 1 + getObjectDepth(obj.parentId, currentObjects);
  };

  const getAllDescendants = (parentId: string, currentObjects: CanvasObject[]): CanvasObject[] => {
    const descendants: CanvasObject[] = [];
    const children = currentObjects.filter(obj => obj.parentId === parentId);
    
    for (const child of children) {
      descendants.push(child);
      descendants.push(...getAllDescendants(child.id, currentObjects));
    }
    
    return descendants;
  };

  const isValidMove = (objId: string, newX: number, newY: number, currentObjects: CanvasObject[]): boolean => {
    const obj = currentObjects.find(o => o.id === objId);
    if (!obj) return false;

    // Check canvas boundaries
    if (newX < 0 || newY < 0 || newX + obj.width > 800 || newY + obj.height > 600) {
      return false;
    }

    // Check parent boundaries if parent exists
    if (obj.parentId) {
      const parent = currentObjects.find(o => o.id === obj.parentId);
      if (parent) {
        if (newX < parent.left || newY < parent.top || 
            newX + obj.width > parent.left + parent.width || 
            newY + obj.height > parent.top + parent.height) {
          return false;
        }
      }
    }

    return true;
  };

  useEffect(() => {
    const canvas = editor?.canvas;
    if (!canvas) return;

    // Disable default drag selection box
    canvas.selection = false;

    const handleMouseDown = (e: fabric.TEvent) => {
      const pointer = canvas.getPointer(e.e);
      const clickedObjects = canvas.getObjects().filter((obj) => {
        return obj.containsPoint(pointer);
      });

      if (clickedObjects.length === 0) {
        setSelectedObjectId(null);
        return;
      }

      // Find the object with the greatest depth (the descendant-most)
      const descendantMostObject = clickedObjects.reduce((prev, current) => {
        const prevDepth = getObjectDepth(prev.id, objects);
        const currentDepth = getObjectDepth(current.id, objects);
        return prevDepth > currentDepth ? prev : current;
      });

      const newSelectedId = descendantMostObject.id;

      // Always select the clicked object (no deselection on re-click)
      setSelectedObjectId(newSelectedId);

      // Prepare for potential dragging
      const clickedObj = objects.find(obj => obj.id === newSelectedId);
      if (clickedObj) {
        // Calculate offset from object's top-left corner to click point
        const objClickOffset = {
          x: pointer.x - clickedObj.left,
          y: pointer.y - clickedObj.top
        };
        setClickOffset(objClickOffset);
      }
      
      setDragCandidate(newSelectedId);
      setDragStartPos(pointer);
      setDragOffset({ x: 0, y: 0 });
    };

    const handleMouseMove = (e: fabric.TEvent) => {
      const pointer = canvas.getPointer(e.e);

      // Handle dragging logic
      if (dragCandidate && dragStartPos) {
        const dragDistance = Math.hypot(pointer.x - dragStartPos.x, pointer.y - dragStartPos.y);

        if (!isDragging && dragDistance > 3) {
          setIsDragging(true);
        }

        if (isDragging) {
          const selectedObj = objects.find(obj => obj.id === dragCandidate);
          if (selectedObj) {
            const newX = pointer.x - clickOffset.x;
            const newY = pointer.y - clickOffset.y;

            const actualOffset = {
              x: newX - selectedObj.left,
              y: newY - selectedObj.top,
            };

            if (isValidMove(dragCandidate, newX, newY, objects)) {
              setDragOffset(actualOffset);
            }
          }
          return;
        }
      }

      // Handle hover effect when not dragging
      const hoveredObjects = canvas.getObjects().filter((obj) => {
        return obj.containsPoint(pointer);
      });

      if (hoveredObjects.length === 0) {
        setHoveredObjectId(null);
        return;
      }

      // Find the object with the greatest depth (the descendant-most)
      const descendantMostObject = hoveredObjects.reduce((prev, current) => {
        const prevDepth = getObjectDepth(prev.id, objects);
        const currentDepth = getObjectDepth(current.id, objects);
        return prevDepth > currentDepth ? prev : current;
      });

      const newHoveredId = descendantMostObject.id;
      setHoveredObjectId(newHoveredId);
    };

    const handleMouseUp = () => {
      if (isDragging && dragCandidate && (dragOffset.x !== 0 || dragOffset.y !== 0)) {
        // Apply the drag offset to selected object and all descendants
        const selectedObj = objects.find(obj => obj.id === dragCandidate);
        if (selectedObj && dragCandidate) {
          const descendants = getAllDescendants(dragCandidate, objects);
          const objectsToMove = [selectedObj, ...descendants];

          setObjects(prevObjects => 
            prevObjects.map(obj => {
              if (objectsToMove.some(moveObj => moveObj.id === obj.id)) {
                return {
                  ...obj,
                  left: obj.left + dragOffset.x,
                  top: obj.top + dragOffset.y
                };
              }
              return obj;
            })
          );
        }
      }

      setIsDragging(false);
      setDragCandidate(null);
      setDragStartPos(null);
      setDragOffset({ x: 0, y: 0 });
      setClickOffset({ x: 0, y: 0 });
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [editor, objects, selectedObjectId, isDragging, dragStartPos, dragOffset, hoveredObjectId, dragCandidate, clickOffset]);

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2>Canvas Editor</h2>
      <div
        style={{
          display: 'inline-block',
          border: '1px solid #ccc',
          borderRadius: '4px',
        }}
      >
        <FabricJSCanvas className="sample-canvas" onReady={handleReady} />
      </div>
    </div>
  );
};

export default CanvasEditor;
