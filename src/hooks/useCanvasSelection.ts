import { useRef, useState } from "react";
import { SelectionState, ObjectState } from "../types/canvas";

export const useCanvasSelection = () => {
  // Selection state - using refs for immediate synchronous access
  const isSelectingRef = useRef<boolean>(false);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionEndRef = useRef<{ x: number; y: number } | null>(null);
  const [selectionState, setSelectionState] = useState<SelectionState>({
    isSelecting: false,
    selectionStart: null,
    selectionEnd: null,
  });

  // Object selection state - using refs for immediate synchronous access
  const selectedObjectIdRef = useRef<string | null>(null);
  const isDragReadyRef = useRef<boolean>(false);
  const [objectState, setObjectState] = useState<ObjectState>({
    selectedObjectId: null,
    isDragReady: false,
    hoveredObjectId: null,
  });

  const startSelection = (x: number, y: number) => {
    isSelectingRef.current = true;
    selectionStartRef.current = { x, y };
    selectionEndRef.current = { x, y };

    setSelectionState({
      isSelecting: true,
      selectionStart: { x, y },
      selectionEnd: { x, y },
    });
  };

  const updateSelection = (x: number, y: number) => {
    if (!isSelectingRef.current || !selectionStartRef.current) return;

    selectionEndRef.current = { x, y };
    setSelectionState((prev) => ({
      ...prev,
      selectionEnd: { x, y },
    }));
  };

  const endSelection = () => {
    isSelectingRef.current = false;
    selectionStartRef.current = null;
    selectionEndRef.current = null;

    setSelectionState({
      isSelecting: false,
      selectionStart: null,
      selectionEnd: null,
    });
  };

  const selectObject = (objectId: string, dragReady = false) => {
    selectedObjectIdRef.current = objectId;
    isDragReadyRef.current = dragReady;

    setObjectState((prev) => ({
      ...prev,
      selectedObjectId: objectId,
      isDragReady: dragReady,
    }));
  };

  const clearSelection = () => {
    selectedObjectIdRef.current = null;
    isDragReadyRef.current = false;

    setObjectState((prev) => ({
      ...prev,
      selectedObjectId: null,
      isDragReady: false,
    }));
  };

  const setHovered = (objectId: string | null) => {
    setObjectState((prev) => ({
      ...prev,
      hoveredObjectId: objectId,
    }));
  };

  const enableDragging = () => {
    isDragReadyRef.current = true;
    setObjectState((prev) => ({
      ...prev,
      isDragReady: true,
    }));
  };

  return {
    // Refs for immediate access
    isSelectingRef,
    selectionStartRef,
    selectionEndRef,
    selectedObjectIdRef,
    isDragReadyRef,

    // State for React rendering
    selectionState,
    objectState,

    // Actions
    startSelection,
    updateSelection,
    endSelection,
    selectObject,
    clearSelection,
    setHovered,
    enableDragging,
  };
};
