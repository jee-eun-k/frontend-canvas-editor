import * as fabric from "fabric";
import { useRef } from "react";
import { CanvasObject } from "../types/canvas";
import {
  findMostParentObject,
  isPointNearObjectEdge,
} from "../utils/canvasObjectUtils";
import { useCanvasObjectManipulation } from "./useCanvasObjectManipulation";
import { useCanvasSelection } from "./useCanvasSelection";

export const useCanvasEvents = (
  objects: CanvasObject[],
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>,
  fabricObjectsRef: React.RefObject<Map<string, fabric.Rect>>,
) => {
  
  const selection = useCanvasSelection();
  
  const manipulation = useCanvasObjectManipulation(
    objects,
    setObjects,
    fabricObjectsRef,
  );

  const potentialDragStartRef = useRef<{
    x: number;
    y: number;
    target: any;
  } | null>(null);

  const clickStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    targetId: string;
  } | null>(null);

  const handleMouseDown = (canvas: fabric.Canvas) => (e: any) => {
    const target = e.target;
    const pointer = canvas.getPointer(e.e);

    potentialDragStartRef.current = { x: pointer.x, y: pointer.y, target };

    if (!target) {
      // Clear selection and start drag selection
      selection.clearSelection();
      selection.endSelection();
      canvas.discardActiveObject();

      // Lock all objects
      canvas.getObjects().forEach((obj: any) => {
        if (obj.id) {
          obj.set({ lockMovementX: true, lockMovementY: true });
        }
      });

      selection.startSelection(pointer.x, pointer.y);
      manipulation.currentOperationRef.current = "selecting";
      return;
    }

    const targetId = (target as any).id;
    if (targetId) {
      // Check if click is within 10px of object edge
      const targetObject = objects.find((obj) => obj.id === targetId);
      if (
        targetObject &&
        !isPointNearObjectEdge(pointer.x, pointer.y, targetObject, 10)
      ) {
        // Click is not near edge, treat as if no target was clicked
        // Clear selection and start drag selection
        selection.clearSelection();
        selection.endSelection();
        canvas.discardActiveObject();

        // Lock all objects
        canvas.getObjects().forEach((obj: any) => {
          if (obj.id) {
            obj.set({ lockMovementX: true, lockMovementY: true });
          }
        });

        selection.startSelection(pointer.x, pointer.y);
        manipulation.currentOperationRef.current = "selecting";
        return;
      }

      // First click: select object (only if near edge)
      if (selection.selectedObjectIdRef.current !== targetId) {
        // Lock all objects
        canvas.getObjects().forEach((obj: any) => {
          if (obj.id) {
            obj.set({ lockMovementX: true, lockMovementY: true });
          }
        });

        selection.selectObject(targetId, false);
        canvas.discardActiveObject();
        canvas.renderAll();
        manipulation.currentOperationRef.current = null;
        return;
      }

      // Second click: enable dragging and show resize handles
      if (
        selection.selectedObjectIdRef.current === targetId &&
        !selection.isDragReadyRef.current
      ) {
        selection.enableDragging();
        target.set({
          lockMovementX: false,
          lockMovementY: false,
          selectable: true,
          evented: true,
          hasControls: true,
          hasBorders: true,
          hasRotatingPoint: false,
          lockRotation: true,
          // Keep scaling enabled for proper cursors
        });

        // Ensure controls are visible (except rotation)
        target.setControlsVisibility({
          mtr: false, // no rotation handle
          mt: true, // middle top
          mb: true, // middle bottom
          ml: true, // middle left
          mr: true, // middle right
          tl: true, // top left
          tr: true, // top right
          bl: true, // bottom left
          br: true, // bottom right
        });
        // Also ensure rotation is locked at the object level
        target.set({
          hasRotatingPoint: false,
          lockRotation: true,
        });
        target.setCoords();

        // Set as active object to show resize handles
        canvas.discardActiveObject();
        canvas.setActiveObject(target);
        canvas.renderAll();
        return;
      }

      // Handle re-clicking on drag-ready object
      if (
        selection.selectedObjectIdRef.current === targetId &&
        selection.isDragReadyRef.current &&
        (target.lockMovementX || target.lockMovementY)
      ) {
        target.set({
          lockMovementX: false,
          lockMovementY: false,
          selectable: true,
        });
        target.setCoords();
        canvas.renderAll();
      }

      // Track click for deselection
      if (
        selection.selectedObjectIdRef.current === targetId &&
        selection.isDragReadyRef.current
      ) {
        clickStartRef.current = {
          x: pointer.x,
          y: pointer.y,
          time: Date.now(),
          targetId: targetId,
        };
      }
    }

    manipulation.currentOperationRef.current = null;
  };

  const handleMouseMove = (canvas: fabric.Canvas) => (e: any) => {
    const pointer = canvas.getPointer(e.e);
    // Custom resize: call updateCustomResize if scaling
    if (manipulation.currentOperationRef.current === "scaling") {
      manipulation.updateCustomResize(pointer);
    }

    // Check for edge proximity hover effects (only when not selecting or dragging)
    if (
      manipulation.currentOperationRef.current !== "selecting" &&
      manipulation.currentOperationRef.current !== "moving" &&
      manipulation.currentOperationRef.current !== "scaling" &&
      !selection.isSelectingRef.current
    ) {
      let hoveredObjectId: string | null = null;

      // Check all objects to see if mouse is near any edge (check in reverse order for proper layering)
      const canvasObjects = canvas.getObjects().reverse();
      for (const fabricObj of canvasObjects) {
        const objId = (fabricObj as any).id;
        if (objId) {
          const canvasObject = objects.find((obj) => obj.id === objId);
          if (
            canvasObject &&
            isPointNearObjectEdge(pointer.x, pointer.y, canvasObject, 10)
          ) {
            hoveredObjectId = objId;
            break; // Take the topmost object that matches
          }
        }
      }

      // Update hover state if it changed
      if (selection.objectState.hoveredObjectId !== hoveredObjectId) {
        selection.setHovered(hoveredObjectId);
      }

      // Set canvas cursor based on hover state
      if (hoveredObjectId) {
        const isSelectedAndReady =
          hoveredObjectId === selection.selectedObjectIdRef.current &&
          selection.isDragReadyRef.current;
        canvas.hoverCursor = isSelectedAndReady ? "move" : "pointer";
      } else {
        canvas.hoverCursor = "default";
      }
    }

    // Check if we should start drag selection
    if (
      !selection.selectionState.isSelecting &&
      potentialDragStartRef.current &&
      manipulation.currentOperationRef.current !== "moving" &&
      manipulation.currentOperationRef.current !== "scaling"
    ) {
      const dragDistance = Math.sqrt(
        Math.pow(pointer.x - potentialDragStartRef.current.x, 2) +
          Math.pow(pointer.y - potentialDragStartRef.current.y, 2),
      );

      if (dragDistance > 5) {
        const target = potentialDragStartRef.current.target;
        const targetId = target?.id;

        if (
          !target ||
          !targetId ||
          selection.selectedObjectIdRef.current !== targetId ||
          !selection.isDragReadyRef.current
        ) {
          // Clear selection and start drag selection
          selection.clearSelection();
          selection.endSelection();
          canvas.discardActiveObject();
          manipulation.currentOperationRef.current = null;

          // Lock all objects
          canvas.getObjects().forEach((obj: any) => {
            if (obj.id) {
              obj.set({ lockMovementX: true, lockMovementY: true });
            }
          });

          selection.startSelection(
            potentialDragStartRef.current.x,
            potentialDragStartRef.current.y,
          );
          selection.updateSelection(pointer.x, pointer.y);
          manipulation.currentOperationRef.current = "selecting";
          potentialDragStartRef.current = null;
        }
      }
    }

    if (
      !selection.isSelectingRef.current ||
      !selection.selectionStartRef.current ||
      manipulation.currentOperationRef.current !== "selecting"
    ) {
      return;
    }
    selection.updateSelection(pointer.x, pointer.y);

    // Visual feedback - highlight objects in selection
    const selectionBounds = {
      left: Math.min(selection.selectionStartRef.current.x, pointer.x),
      top: Math.min(selection.selectionStartRef.current.y, pointer.y),
      right: Math.max(selection.selectionStartRef.current.x, pointer.x),
      bottom: Math.max(selection.selectionStartRef.current.y, pointer.y),
    };

    // Clear previous highlights
    canvas.getObjects().forEach((obj: any) => {
      if (obj.id) {
        obj.set(
          "strokeWidth",
          obj.id === selection.objectState.hoveredObjectId ? 3 : 1,
        );
      }
    });

    // Highlight objects in selection
    const fabricObjects = canvas.getObjects();
    const objectsInSelection = fabricObjects
      .filter((fabricObj) => {
        if (!(fabricObj as any).id) return false;
        const objBounds = fabricObj.getBoundingRect();
        // Check for complete containment within selection bounds
        return (
          objBounds.left >= selectionBounds.left &&
          objBounds.top >= selectionBounds.top &&
          objBounds.left + objBounds.width <= selectionBounds.right &&
          objBounds.top + objBounds.height <= selectionBounds.bottom
        );
      })
      .map((fabricObj) =>
        objects.find((o: CanvasObject) => o.id === (fabricObj as any).id),
      )
      .filter(Boolean) as CanvasObject[];

    // Only highlight the object that will actually be selected
    const mostParentObject = findMostParentObject(objectsInSelection, objects);
    if (mostParentObject) {
      const fabricObj = fabricObjectsRef.current?.get(mostParentObject.id);
      if (fabricObj) {
        fabricObj.set("strokeWidth", 3);
        fabricObj.set(
          "stroke",
          (fabricObj as any).originalStroke || fabricObj.stroke || "#000",
        );
      }
    }

    canvas.renderAll();
  };

  const handleMouseUp = (canvas: fabric.Canvas) => (e: any) => {
    potentialDragStartRef.current = null;

    // End custom resize if it was in progress
    if (manipulation.currentOperationRef.current === "scaling") {
      manipulation.endCustomResize();
    }

    // Check for deselection
    if (clickStartRef.current) {
      const pointer = canvas.getPointer(e.e);

      if (
        selection.selectedObjectIdRef.current &&
        selection.isDragReadyRef.current
      ) {
        const distance = Math.sqrt(
          Math.pow(pointer.x - clickStartRef.current.x, 2) +
            Math.pow(pointer.y - clickStartRef.current.y, 2),
        );
        const timeDiff = Date.now() - clickStartRef.current.time;

        if (
          distance < 5 &&
          timeDiff < 300 &&
          clickStartRef.current.targetId ===
            selection.selectedObjectIdRef.current
        ) {
          selection.clearSelection();
          canvas.discardActiveObject();
          canvas.renderAll();
          clickStartRef.current = null;
          return;
        }
      }
    }

    // Handle drag selection completion
    if (
      selection.selectionStartRef.current &&
      selection.selectionEndRef.current
    ) {
      const pointer = canvas.getPointer(e.e);
      const selectionBounds = {
        left: Math.min(selection.selectionStartRef.current.x, pointer.x),
        top: Math.min(selection.selectionStartRef.current.y, pointer.y),
        right: Math.max(selection.selectionStartRef.current.x, pointer.x),
        bottom: Math.max(selection.selectionStartRef.current.y, pointer.y),
      };

      const fabricObjects = canvas.getObjects();
      const objectsInSelection = fabricObjects
        .filter((fabricObj) => {
          if (!(fabricObj as any).id) return false;
          const objBounds = fabricObj.getBoundingRect();
          return (
            objBounds.left >= selectionBounds.left &&
            objBounds.top >= selectionBounds.top &&
            objBounds.left + objBounds.width <= selectionBounds.right &&
            objBounds.top + objBounds.height <= selectionBounds.bottom
          );
        })
        .map((fabricObj) =>
          objects.find((o: CanvasObject) => o.id === (fabricObj as any).id),
        )
        .filter(Boolean) as CanvasObject[];

      const mostParentObject = findMostParentObject(
        objectsInSelection,
        objects,
      );

      if (mostParentObject) {
        // Select object and immediately enable dragging (skip two-step process for drag selection)
        selection.selectObject(mostParentObject.id, true);

        const fabricObj = fabricObjectsRef.current?.get(mostParentObject.id);
        if (fabricObj) {
          fabricObj.set({
            lockMovementX: false,
            lockMovementY: false,
            hasRotatingPoint: false,
            lockRotation: true,
          });
          fabricObj.setControlsVisibility({ mtr: false });
          canvas.setActiveObject(fabricObj);
        }
      }
    }

    clickStartRef.current = null;

    // Clear any remaining virtual highlights after drag selection
    if (manipulation.currentOperationRef.current === "selecting") {
      selection.setHovered(null);
      canvas.getObjects().forEach((obj: any) => {
        if ((obj as any).id) {
          const objData = objects.find((o) => o.id === (obj as any).id);
          if (objData) {
            obj.set("stroke", objData.stroke);
            obj.set("strokeWidth", 1);
          }
        }
      });
    }

    selection.endSelection();
    manipulation.currentOperationRef.current = null;
    canvas.renderAll();
  };

  const handleNativeMouseMove = (canvas: fabric.Canvas) => (e: MouseEvent) => {
    if (
      !selection.isSelectingRef.current ||
      !selection.selectionStartRef.current ||
      manipulation.currentOperationRef.current !== "selecting"
    )
      return;

    // Use canvas.getPointer to get coordinates relative to the canvas, accounting for zoom/pan
    const pointer = canvas.getPointer(e);
    selection.updateSelection(pointer.x, pointer.y);
  };

  return {
    selection,
    manipulation,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleNativeMouseMove,
  };
};
