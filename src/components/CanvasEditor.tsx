import * as fabric from "fabric";
import { FabricJSCanvas, useFabricJSEditor } from "fabricjs-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasObject } from "../types/canvas";
import { useCanvasEvents } from "../hooks/useCanvasEvents";

// 2. 초기 데이터 생성
const initialObjects: CanvasObject[] = [
  {
    id: "parent",
    parentId: null,
    left: 100,
    top: 50,
    width: 600,
    height: 500,
    fill: "rgba(0, 0, 255, 0.3)",
    stroke: "blue",
  },
  {
    id: "child",
    parentId: "parent",
    left: 150,
    top: 100,
    width: 300,
    height: 250,
    fill: "rgba(255, 165, 0, 0.3)",
    stroke: "orange",
  },
  {
    id: "grandchild",
    parentId: "child",
    left: 200,
    top: 150,
    width: 150,
    height: 100,
    fill: "rgba(128, 0, 128, 0.3)",
    stroke: "purple",
  },
];

export const CanvasEditor = () => {
  const { editor, onReady } = useFabricJSEditor();
  const [objects, setObjects] = useState<CanvasObject[]>(initialObjects);
  const fabricObjectsRef = useRef<Map<string, fabric.Rect>>(new Map());

  const canvasEvents = useCanvasEvents(objects, setObjects, fabricObjectsRef);

  const handleReady = (canvas: fabric.Canvas) => {
    canvas.setDimensions({ width: 800, height: 600 });
    onReady(canvas);
  };

  // 3. React 상태와 Fabric.js 캔버스 동기화
  useEffect(() => {
    const canvas = editor?.canvas;
    if (!canvas) return;

    canvas.clear();
    fabricObjectsRef.current.clear();

    // Sort objects by hierarchy depth so descendants are always rendered on top of their parents
    // This ensures child objects can be selected over their parent objects
    const sortedObjects = [...objects].sort((a, b) => {
      // Calculate depth for each object (how many parents it has)
      const getDepth = (obj: any): number => {
        if (!obj.parentId) return 0;
        const parent = objects.find((o) => o.id === obj.parentId);
        return parent ? 1 + getDepth(parent) : 0;
      };

      const depthA = getDepth(a);
      const depthB = getDepth(b);

      // Sort by depth: parents first (depth 0), then children (depth 1), then grandchildren (depth 2), etc.
      return depthA - depthB;
    });

    sortedObjects.forEach((obj) => {
      const rect = new fabric.Rect({
        left: obj.left,
        top: obj.top,
        width: obj.width,
        height: obj.height,
        fill: obj.fill,
        stroke: obj.stroke,
        strokeWidth: 1,
        selectable: true,
        hasControls: true,
        hasBorders: true,
        // Remove rotation control completely
        hasRotatingPoint: false,
        lockRotation: true,
        // Two-step selection: start with movement locked
        lockMovementX: true,
        lockMovementY: true,
        // Basic scaling constraints
        minScaleLimit: 0.1,
        lockScalingFlip: true,
        id: obj.id,
      });

      // Explicitly hide the rotation control
      rect.setControlsVisibility({
        mtr: false, // mtr = middle top rotate
      });

      fabricObjectsRef.current.set(obj.id, rect);
      canvas.add(rect);
    });

    canvas.renderAll();

    // Force a re-render to ensure objects are visible on initial load
    setTimeout(() => {
      canvas.renderAll();
    }, 10);
  }, [editor, objects]);

  // Effect to handle hover highlights
  useEffect(() => {
    const canvas = editor?.canvas;
    if (!canvas) return;

    canvas.getObjects().forEach((obj: any) => {
      const isHovered =
        obj.id === canvasEvents.selection.objectState.hoveredObjectId;
      obj.set("strokeWidth", isHovered ? 3 : 1);
    });

    canvas.renderAll();
  }, [editor, canvasEvents.selection.objectState.hoveredObjectId]);

  useEffect(() => {
    const canvas = editor?.canvas;
    if (!canvas) return;

    // Enable canvas selection to allow resize handles, but we'll control selection behavior manually
    canvas.selection = true;
    // Ensure individual objects can still show controls when active
    canvas.preserveObjectStacking = true;

    // Create stable handler references
    const mouseDownHandler = canvasEvents.handleMouseDown(canvas);
    const mouseMoveHandler = canvasEvents.handleMouseMove(canvas);
    const mouseUpHandler = canvasEvents.handleMouseUp(canvas);

    const objectScalingHandler =
      canvasEvents.manipulation.handleObjectScaling(canvas);
    const objectMovingHandler =
      canvasEvents.manipulation.handleObjectMoving(canvas);
    const objectModifiedHandler =
      canvasEvents.manipulation.handleObjectModified(canvas);

    // Set up event handlers
    canvas.on("mouse:down", mouseDownHandler);
    canvas.on("mouse:move", mouseMoveHandler);
    canvas.on("mouse:up", mouseUpHandler);
    canvas.on("object:scaling", canvasEvents.manipulation.handleScalingStart);
    canvas.on("object:scaling", objectScalingHandler);
    canvas.on("object:moving", objectMovingHandler);
    canvas.on("object:modified", objectModifiedHandler);

    // Set up DOM event listeners
    const canvasElement = canvas.getElement
      ? canvas.getElement()
      : canvas.lowerCanvasEl;
    const handleMouseLeave = canvasEvents.manipulation.handleMouseLeave(canvas);
    const handleMouseEnter = canvasEvents.manipulation.handleMouseEnter;
    const handleNativeMouseMove = canvasEvents.handleNativeMouseMove(canvas);

    canvasElement.addEventListener("mouseleave", handleMouseLeave);
    canvasElement.addEventListener("mouseenter", handleMouseEnter);
    document.addEventListener("mousemove", handleNativeMouseMove);

    return () => {
      canvas.off("mouse:down", mouseDownHandler);
      canvas.off("mouse:move", mouseMoveHandler);
      canvas.off("mouse:up", mouseUpHandler);
      canvas.off(
        "object:scaling",
        canvasEvents.manipulation.handleScalingStart,
      );
      canvas.off("object:scaling", objectScalingHandler);
      canvas.off("object:moving", objectMovingHandler);
      canvas.off("object:modified", objectModifiedHandler);

      canvasElement.removeEventListener("mouseleave", handleMouseLeave);
      canvasElement.removeEventListener("mouseenter", handleMouseEnter);
      document.removeEventListener("mousemove", handleNativeMouseMove);
    };
  }, [editor, canvasEvents]);

  return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <h2>Canvas Editor</h2>
      <div
        style={{
          display: "inline-block",
          border: "1px solid #ccc",
          borderRadius: "4px",
          position: "relative",
          width: "800px",
          height: "600px",
          overflow: "hidden",
        }}
      >
        <FabricJSCanvas className="sample-canvas" onReady={handleReady} />

        {/* Drag Selection Box Overlay */}
        {canvasEvents.selection.selectionState.isSelecting &&
          canvasEvents.selection.selectionState.selectionStart &&
          canvasEvents.selection.selectionState.selectionEnd && (
            <div
              style={{
                position: "absolute",
                left: Math.min(
                  canvasEvents.selection.selectionState.selectionStart.x,
                  canvasEvents.selection.selectionState.selectionEnd.x,
                ),
                top: Math.min(
                  canvasEvents.selection.selectionState.selectionStart.y,
                  canvasEvents.selection.selectionState.selectionEnd.y,
                ),
                width: Math.abs(
                  canvasEvents.selection.selectionState.selectionEnd.x -
                    canvasEvents.selection.selectionState.selectionStart.x,
                ),
                height: Math.abs(
                  canvasEvents.selection.selectionState.selectionEnd.y -
                    canvasEvents.selection.selectionState.selectionStart.y,
                ),
                border: "3px solid #007bff",
                backgroundColor: "rgba(0, 123, 255, 0.15)",
                pointerEvents: "none",
                zIndex: 9999,
                boxSizing: "border-box",
              }}
            />
          )}
      </div>
    </div>
  );
};

export default CanvasEditor;
