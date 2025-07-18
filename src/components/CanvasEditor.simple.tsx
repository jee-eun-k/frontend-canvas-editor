import React, { useRef, useEffect, useState } from 'react';
import * as fabric from 'fabric';

interface Rectangle {
  id: string;
  parentId?: string;
  childIds: string[];
  position: { x: number; y: number };
  size: { width: number; height: number };
  color: string;
  selected: boolean;
  hovered: boolean;
  fabricObject?: fabric.Rect;
}

export const CanvasEditor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const [rectangles, setRectangles] = useState<Rectangle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [lastHoverUpdate, setLastHoverUpdate] = useState(0);

  // Initialize canvas and rectangles
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff',
      selection: false
    });

    setFabricCanvas(canvas);

    // Create initial rectangles
    const initialRectangles: Rectangle[] = [
      {
        id: 'blue-parent',
        childIds: ['orange-child'],
        position: { x: 100, y: 100 },
        size: { width: 300, height: 200 },
        color: '#4a90e2',
        selected: false,
        hovered: false
      },
      {
        id: 'orange-child',
        parentId: 'blue-parent',
        childIds: ['purple-grandchild'],
        position: { x: 130, y: 130 },
        size: { width: 150, height: 100 },
        color: '#f5a623',
        selected: false,
        hovered: false
      },
      {
        id: 'purple-grandchild',
        parentId: 'orange-child',
        childIds: [],
        position: { x: 160, y: 160 },
        size: { width: 80, height: 60 },
        color: '#9013fe',
        selected: false,
        hovered: false
      }
    ];

    setRectangles(initialRectangles);
    renderRectangles(canvas, initialRectangles);

    return () => canvas.dispose();
  }, []);

  // Render rectangles on canvas
  const renderRectangles = (canvas: fabric.Canvas, rects: Rectangle[]) => {
    canvas.clear();
    
    rects.forEach(rect => {
      const fabricRect = new fabric.Rect({
        left: rect.position.x,
        top: rect.position.y,
        width: rect.size.width,
        height: rect.size.height,
        fill: rect.color,
        stroke: '#000000',
        strokeWidth: rect.selected || rect.hovered ? 3 : 1,
        selectable: rect.selected, // Enable selection only for selected rectangles
        evented: rect.selected,    // Enable events only for selected rectangles
        hasControls: rect.selected,
        hasBorders: rect.selected,
        cornerStyle: 'circle',
        cornerSize: 8,
        transparentCorners: false,
        cornerColor: '#007acc'
      });

      rect.fabricObject = fabricRect;
      canvas.add(fabricRect);
    });

    canvas.renderAll();
  };

  // Check if point is within 10px edge area
  const isPointInEdge = (x: number, y: number, rect: Rectangle): boolean => {
    const { position, size } = rect;
    const edgeThreshold = 10;
    
    // Check if point is inside rectangle
    if (x < position.x || x > position.x + size.width ||
        y < position.y || y > position.y + size.height) {
      return false;
    }

    // Check if point is in edge area (not in inner area)
    const innerLeft = position.x + edgeThreshold;
    const innerRight = position.x + size.width - edgeThreshold;
    const innerTop = position.y + edgeThreshold;
    const innerBottom = position.y + size.height - edgeThreshold;

    // If inner area is too small, entire rectangle is edge
    if (innerLeft >= innerRight || innerTop >= innerBottom) {
      return true;
    }

    // Point is in edge if not in inner area
    return !(x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom);
  };

  // Find topmost rectangle at point
  const findRectangleAtPoint = (x: number, y: number): Rectangle | null => {
    // Check in reverse order (topmost first)
    for (let i = rectangles.length - 1; i >= 0; i--) {
      if (isPointInEdge(x, y, rectangles[i])) {
        return rectangles[i];
      }
    }
    return null;
  };

  // Get all descendants of a rectangle
  const getDescendants = (rect: Rectangle): Rectangle[] => {
    const descendants: Rectangle[] = [];
    
    rect.childIds.forEach(childId => {
      const child = rectangles.find(r => r.id === childId);
      if (child) {
        descendants.push(child);
        descendants.push(...getDescendants(child));
      }
    });
    
    return descendants;
  };

  // Move rectangle with constraints
  const moveRectangle = (rect: Rectangle, deltaX: number, deltaY: number) => {
    const parent = rectangles.find(r => r.id === rect.parentId);
    
    let newX = rect.position.x + deltaX;
    let newY = rect.position.y + deltaY;

    // Apply parent boundary constraints
    if (parent) {
      newX = Math.max(parent.position.x, 
        Math.min(newX, parent.position.x + parent.size.width - rect.size.width));
      newY = Math.max(parent.position.y, 
        Math.min(newY, parent.position.y + parent.size.height - rect.size.height));
    }

    const actualDeltaX = newX - rect.position.x;
    const actualDeltaY = newY - rect.position.y;

    // Move rectangle
    rect.position.x = newX;
    rect.position.y = newY;

    // Move all descendants
    const descendants = getDescendants(rect);
    descendants.forEach(desc => {
      desc.position.x += actualDeltaX;
      desc.position.y += actualDeltaY;
    });
  };

  // Smooth movement using Fabric.js objects directly
  const moveRectangleSmooth = (rect: Rectangle, deltaX: number, deltaY: number) => {
    const parent = rectangles.find(r => r.id === rect.parentId);
    
    let newX = rect.position.x + deltaX;
    let newY = rect.position.y + deltaY;

    // Apply parent boundary constraints
    if (parent) {
      newX = Math.max(parent.position.x, 
        Math.min(newX, parent.position.x + parent.size.width - rect.size.width));
      newY = Math.max(parent.position.y, 
        Math.min(newY, parent.position.y + parent.size.height - rect.size.height));
    }

    const actualDeltaX = newX - rect.position.x;
    const actualDeltaY = newY - rect.position.y;

    // Skip if no actual movement
    if (actualDeltaX === 0 && actualDeltaY === 0) {
      return;
    }

    // Collect all objects that need updating
    const objectsToUpdate: fabric.Rect[] = [];

    // Update data model and collect Fabric objects
    rect.position.x = newX;
    rect.position.y = newY;
    if (rect.fabricObject) {
      rect.fabricObject.set({
        left: newX,
        top: newY
      });
      objectsToUpdate.push(rect.fabricObject);
    }

    // Move all descendants
    const descendants = getDescendants(rect);
    descendants.forEach(desc => {
      desc.position.x += actualDeltaX;
      desc.position.y += actualDeltaY;
      
      if (desc.fabricObject) {
        desc.fabricObject.set({
          left: desc.position.x,
          top: desc.position.y
        });
        objectsToUpdate.push(desc.fabricObject);
      }
    });

    // Update only the changed objects
    if (fabricCanvas && objectsToUpdate.length > 0) {
      // Use requestAnimationFrame for smooth updates
      requestAnimationFrame(() => {
        objectsToUpdate.forEach(obj => {
          obj.setCoords(); // Update object coordinates for hit detection
        });
        fabricCanvas.renderAll();
      });
    }
  };

  // Handle mouse events
  useEffect(() => {
    if (!fabricCanvas) return;

    const handleMouseDown = (e: fabric.IEvent) => {
      const pointer = fabricCanvas.getPointer(e.e);
      const clickedRect = findRectangleAtPoint(pointer.x, pointer.y);

      if (clickedRect) {
        setSelectedId(clickedRect.id);
        setIsDragging(true);
        setDragStart({ x: pointer.x, y: pointer.y });
      } else {
        setSelectedId(null);
        setIsDragSelecting(true);
        setDragStart({ x: pointer.x, y: pointer.y });
      }
    };

    const handleMouseMove = (e: fabric.IEvent) => {
      const pointer = fabricCanvas.getPointer(e.e);
      
      if (isDragging && selectedId && dragStart) {
        const selectedRect = rectangles.find(r => r.id === selectedId);
        if (selectedRect) {
          const deltaX = pointer.x - dragStart.x;
          const deltaY = pointer.y - dragStart.y;
          
          // Update positions without re-rendering entire canvas
          moveRectangleSmooth(selectedRect, deltaX, deltaY);
          setDragStart({ x: pointer.x, y: pointer.y });
        }
      } else if (isDragSelecting && dragStart) {
        // Handle drag selection (simplified)
        const selectionRect = {
          x: Math.min(dragStart.x, pointer.x),
          y: Math.min(dragStart.y, pointer.y),
          width: Math.abs(pointer.x - dragStart.x),
          height: Math.abs(pointer.y - dragStart.y)
        };
        
        // Find rectangles fully contained in selection
        const contained = rectangles.filter(rect => {
          const corners = [
            { x: rect.position.x, y: rect.position.y },
            { x: rect.position.x + rect.size.width, y: rect.position.y },
            { x: rect.position.x + rect.size.width, y: rect.position.y + rect.size.height },
            { x: rect.position.x, y: rect.position.y + rect.size.height }
          ];
          
          return corners.every(corner => 
            corner.x >= selectionRect.x &&
            corner.x <= selectionRect.x + selectionRect.width &&
            corner.y >= selectionRect.y &&
            corner.y <= selectionRect.y + selectionRect.height
          );
        });
        
        // Select topmost parent
        if (contained.length > 0) {
          const topmost = contained.reduce((top, current) => 
            (!current.parentId || (top.parentId && current.parentId)) ? current : top
          );
          setSelectedId(topmost.id);
        }
      } else {
        // Handle hover with throttling
        const now = Date.now();
        if (now - lastHoverUpdate > 16) { // ~60fps throttling
          const hoveredRect = findRectangleAtPoint(pointer.x, pointer.y);
          const newHoveredId = hoveredRect?.id || null;
          
          // Only update if hover actually changed
          if (newHoveredId !== hoveredId) {
            setHoveredId(newHoveredId);
          }
          setLastHoverUpdate(now);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsDragSelecting(false);
      setDragStart(null);
    };

    fabricCanvas.on('mouse:down', handleMouseDown);
    fabricCanvas.on('mouse:move', handleMouseMove);
    fabricCanvas.on('mouse:up', handleMouseUp);

    return () => {
      fabricCanvas.off('mouse:down', handleMouseDown);
      fabricCanvas.off('mouse:move', handleMouseMove);
      fabricCanvas.off('mouse:up', handleMouseUp);
    };
  }, [fabricCanvas, rectangles, selectedId, isDragging, isDragSelecting, dragStart]);

  // Update visual state when selection/hover changes
  useEffect(() => {
    if (!fabricCanvas) return;

    const changedObjects: fabric.Rect[] = [];

    // Update stroke width only for changed objects
    rectangles.forEach(rect => {
      if (rect.fabricObject) {
        const wasSelected = rect.selected;
        const wasHovered = rect.hovered;
        const isSelected = rect.id === selectedId;
        const isHovered = rect.id === hoveredId;
        
        // Only update if state actually changed
        if (wasSelected !== isSelected || wasHovered !== isHovered) {
          const strokeWidth = (isSelected || isHovered) ? 3 : 1;
          rect.fabricObject.set('strokeWidth', strokeWidth);
          rect.selected = isSelected;
          rect.hovered = isHovered;
          changedObjects.push(rect.fabricObject);
        }
      }
    });

    // Only render if something actually changed
    if (changedObjects.length > 0) {
      requestAnimationFrame(() => {
        changedObjects.forEach(obj => {
          obj.setCoords();
        });
        fabricCanvas.renderAll();
      });
    }
  }, [selectedId, hoveredId, fabricCanvas]);

  // Set cursor based on interaction state
  useEffect(() => {
    if (!fabricCanvas) return;

    if (isDragging) {
      fabricCanvas.defaultCursor = 'grabbing';
    } else if (isDragSelecting) {
      fabricCanvas.defaultCursor = 'crosshair';
    } else if (hoveredId) {
      fabricCanvas.defaultCursor = 'grab';
    } else {
      fabricCanvas.defaultCursor = 'default';
    }
  }, [isDragging, isDragSelecting, hoveredId, fabricCanvas]);

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2>Hierarchical Canvas Editor</h2>
      <div style={{ 
        display: 'inline-block', 
        border: '1px solid #ccc', 
        borderRadius: '4px' 
      }}>
        <canvas ref={canvasRef} />
      </div>
      
      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <p>• Click rectangle edges (10px area) to select</p>
        <p>• Drag to move (children follow parents)</p>
        <p>• Drag empty space to select multiple</p>
        <p>• Children stay within parent boundaries</p>
      </div>
      
      {process.env.NODE_ENV === 'development' && (
        <div style={{ 
          marginTop: '20px', 
          padding: '10px', 
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <div>Selected: {selectedId || 'None'}</div>
          <div>Hovered: {hoveredId || 'None'}</div>
          <div>Dragging: {isDragging ? 'Yes' : 'No'}</div>
          <div>Drag Selecting: {isDragSelecting ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  );
};

export default CanvasEditor;