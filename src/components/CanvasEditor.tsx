import * as fabric from 'fabric';
import { FabricJSCanvas, useFabricJSEditor } from 'fabricjs-react';
import { useEffect, useRef, useState } from 'react';

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
	const [objects, setObjects] = useState<CanvasObject[]>(initialObjects);
	const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);

	// Store references to fabric objects for direct manipulation
	const fabricObjectsRef = useRef<Map<string, fabric.Rect>>(new Map());

	// Track current operation to prevent conflicts
	const currentOperationRef = useRef<'moving' | 'scaling' | 'selecting' | null>(null);
	// Track if mouse is over the canvas
	const mouseIsOverCanvas = useRef(true);
	// Track which corner is being used for scaling
	const scalingCornerRef = useRef<string | null>(null);

	// Drag selection state - using refs for immediate synchronous access
	const isSelectingRef = useRef<boolean>(false);
	const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
	const selectionEndRef = useRef<{ x: number; y: number } | null>(null);
	const [isSelecting, setIsSelecting] = useState<boolean>(false);
	const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(
		null
	);
	const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);

	// Two-step selection state - using refs for immediate synchronous access
	const selectedObjectIdRef = useRef<string | null>(null);
	const isDragReadyRef = useRef<boolean>(false);


	// Track potential drag selection start
	const potentialDragStartRef = useRef<{ x: number; y: number; target: any } | null>(
		null
	);

	// Track click start for deselection detection
	const clickStartRef = useRef<{
		x: number;
		y: number;
		time: number;
		targetId: string;
	} | null>(null);

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

		objects.forEach((obj) => {
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
	}, [editor, objects]);

	// Effect to handle hover highlights
	useEffect(() => {
		const canvas = editor?.canvas;
		if (!canvas) return;

		canvas.getObjects().forEach((obj: any) => {
			const isHovered = obj.id === hoveredObjectId;
			obj.set('strokeWidth', isHovered ? 3 : 1);
		});

		canvas.renderAll();
	}, [editor, hoveredObjectId]);

	const getObjectDepth = (id: string, currentObjects: CanvasObject[]): number => {
		const obj = currentObjects.find((o) => o.id === id);
		if (!obj || !obj.parentId) {
			return 0;
		}
		return 1 + getObjectDepth(obj.parentId, currentObjects);
	};

	const getAllDescendants = (
		parentId: string,
		currentObjects: CanvasObject[]
	): CanvasObject[] => {
		const descendants: CanvasObject[] = [];
		const children = currentObjects.filter((obj) => obj.parentId === parentId);

		for (const child of children) {
			descendants.push(child);
			descendants.push(...getAllDescendants(child.id, currentObjects));
		}

		return descendants;
	};

	// Common boundary checking function for both moving and scaling
	const getBoundaryConstraints = (targetObj: CanvasObject) => {
		const parentObj =
			targetObj.parentId ? objects.find((o) => o.id === targetObj.parentId) : null;

		if (parentObj) {
			// Constrain within parent boundaries
			return {
				minLeft: parentObj.left,
				minTop: parentObj.top,
				maxRight: parentObj.left + parentObj.width,
				maxBottom: parentObj.top + parentObj.height,
			};
		} else {
			// Constrain within canvas boundaries
			return {
				minLeft: 0,
				minTop: 0,
				maxRight: 800,
				maxBottom: 600,
			};
		}
	};

	useEffect(() => {
		const canvas = editor?.canvas;
		if (!canvas) return;

		// Disable native Fabric.js selection to implement custom selection
		canvas.selection = false;

		// Handle mouse down to detect control handle interactions and start drag selection
		const handleMouseDown = (e: any) => {
			const target = e.target;
			const pointer = canvas.getPointer(e.e);

			// Always track potential drag selection start
			potentialDragStartRef.current = { x: pointer.x, y: pointer.y, target };

			// If clicking on empty canvas, immediately start drag selection
			if (!target) {
				// Clear any existing selection and lock all objects
				selectedObjectIdRef.current = null;
				isDragReadyRef.current = false;
				isSelectingRef.current = false;
				selectionStartRef.current = null;
				setIsSelecting(false);
				setSelectionStart(null);
				setSelectionEnd(null);
				canvas.discardActiveObject();

				// Lock movement for all objects
				canvas.getObjects().forEach((obj: any) => {
					if (obj.id) {
						obj.set({ lockMovementX: true, lockMovementY: true });
					}
				});

				setIsSelecting(true);
				setSelectionStart({ x: pointer.x, y: pointer.y });
				setSelectionEnd({ x: pointer.x, y: pointer.y });
				currentOperationRef.current = 'selecting';
				return;
			}

			// Handle object interaction with two-step selection
			const targetId = (target as any).id;
			if (targetId) {


				// First click: select the object but lock movement (don't show resize handles yet)
				if (selectedObjectIdRef.current !== targetId) {

					// Lock movement for all objects first
					canvas.getObjects().forEach((obj: any) => {
						if (obj.id) {
							obj.set({ lockMovementX: true, lockMovementY: true });
						}
					});

					// Update refs immediately
					selectedObjectIdRef.current = targetId;
					isDragReadyRef.current = false;

					// Don't set active object yet - wait for mouseup
					canvas.discardActiveObject();
					canvas.renderAll();
					currentOperationRef.current = null;

					return;
				}

				// Second mousedown: enable dragging for this object
				if (selectedObjectIdRef.current === targetId && !isDragReadyRef.current) {

					// Update refs immediately
					isDragReadyRef.current = true;

					// Unlock movement for this specific object immediately
					target.set({
						lockMovementX: false,
						lockMovementY: false,
						selectable: true,
						evented: true,
					});
					target.setCoords();
					canvas.renderAll();

					// Don't return here - allow the drag to start
				}

				// Handle case where object is drag-ready but still locked (after canvas deselection)
				if (
					selectedObjectIdRef.current === targetId &&
					isDragReadyRef.current &&
					(target.lockMovementX || target.lockMovementY)
				) {

					// Unlock movement for this specific object
					target.set({
						lockMovementX: false,
						lockMovementY: false,
						selectable: true,
						evented: true,
					});
					target.setCoords();
					canvas.renderAll();

				}

				// Track click start for potential deselection (when object is already selected and drag-ready)
				if (selectedObjectIdRef.current === targetId && isDragReadyRef.current) {
					clickStartRef.current = {
						x: pointer.x,
						y: pointer.y,
						time: Date.now(),
						targetId: targetId,
					};

				}
			}

			// Reset operation state
			currentOperationRef.current = null;
		};

		// Handle mouse move for drag selection
		const handleMouseMove = (e: any) => {
			// Check if we should start drag selection when dragging on unselected area
			if (
				!isSelecting &&
				potentialDragStartRef.current &&
				currentOperationRef.current !== 'moving' &&
				currentOperationRef.current !== 'scaling'
			) {
				const pointer = canvas.getPointer(e.e);
				const dragDistance = Math.sqrt(
					Math.pow(pointer.x - potentialDragStartRef.current.x, 2) +
						Math.pow(pointer.y - potentialDragStartRef.current.y, 2)
				);

				// If dragging more than 5 pixels and not on a drag-ready object, start drag selection
				if (dragDistance > 5) {
					const target = potentialDragStartRef.current.target;
					const targetId = target?.id;

					// Start drag selection if:
					// 1. No target (empty space), OR
					// 2. Target exists but is not selected and drag-ready
					if (
						!target ||
						!targetId ||
						selectedObjectIdRef.current !== targetId ||
						!isDragReadyRef.current
					) {

						// Clear any existing selection and lock all objects
						selectedObjectIdRef.current = null;
						isDragReadyRef.current = false;
						isSelectingRef.current = false;
						selectionStartRef.current = null;
						setIsSelecting(false);
						setSelectionStart(null);
						setSelectionEnd(null);
						canvas.discardActiveObject();
						currentOperationRef.current = null;

						// Lock movement for all objects
						canvas.getObjects().forEach((obj: any) => {
							if (obj.id) {
								obj.set({ lockMovementX: true, lockMovementY: true });
							}
						});

						// Start drag selection - update refs immediately
						isSelectingRef.current = true;
						selectionStartRef.current = {
							x: potentialDragStartRef.current.x,
							y: potentialDragStartRef.current.y,
						};
						// Update state for UI
						setIsSelecting(true);
						setSelectionStart({
							x: potentialDragStartRef.current.x,
							y: potentialDragStartRef.current.y,
						});
						setSelectionEnd({ x: pointer.x, y: pointer.y });
						currentOperationRef.current = 'selecting';

						// Clear the potential drag start
						potentialDragStartRef.current = null;
					}
				}
			}

			if (
				!isSelectingRef.current ||
				!selectionStartRef.current ||
				currentOperationRef.current !== 'selecting'
			) {
				return;
			}

			const pointer = canvas.getPointer(e.e);
			selectionEndRef.current = { x: pointer.x, y: pointer.y };
			setSelectionEnd({ x: pointer.x, y: pointer.y });

			// Visual feedback - highlight objects that would be selected
			const selectionBounds = {
				left: Math.min(selectionStartRef.current.x, pointer.x),
				top: Math.min(selectionStartRef.current.y, pointer.y),
				right: Math.max(selectionStartRef.current.x, pointer.x),
				bottom: Math.max(selectionStartRef.current.y, pointer.y),
			};

			// Clear previous highlights
			canvas.getObjects().forEach((obj: any) => {
				if (obj.id) {
					obj.set('strokeWidth', obj.id === hoveredObjectId ? 3 : 1);
				}
			});

			// Show 3px border hover effect for objects inside selection area
			objects.forEach((obj) => {
				const objBounds = {
					left: obj.left,
					top: obj.top,
					right: obj.left + obj.width,
					bottom: obj.top + obj.height,
				};

				// Check if object is completely inside selection bounds
				if (
					objBounds.left >= selectionBounds.left &&
					objBounds.top >= selectionBounds.top &&
					objBounds.right <= selectionBounds.right &&
					objBounds.bottom <= selectionBounds.bottom
				) {
					const fabricObj = fabricObjectsRef.current.get(obj.id);
					if (fabricObj) {
						// Apply 3px border hover effect
						fabricObj.set('strokeWidth', 3);
						fabricObj.set(
							'stroke',
							(fabricObj as any).originalStroke || fabricObj.stroke || '#000'
						);
					}
				}
			});

			canvas.renderAll();
		};

		// Handle mouse up to finalize drag selection
		const handleMouseUp = (e: any) => {
			// Clear potential drag start
			potentialDragStartRef.current = null;

			// Check for deselection (click vs drag detection)
			if (
				clickStartRef.current &&
				selectedObjectIdRef.current &&
				isDragReadyRef.current
			) {
				const pointer = canvas.getPointer(e.e);
				const distance = Math.sqrt(
					Math.pow(pointer.x - clickStartRef.current.x, 2) +
						Math.pow(pointer.y - clickStartRef.current.y, 2)
				);
				const timeDiff = Date.now() - clickStartRef.current.time;

				// If minimal movement and quick click, deselect
				if (
					distance < 5 &&
					timeDiff < 300 &&
					clickStartRef.current.targetId === selectedObjectIdRef.current
				) {

					// Deselect the object
					selectedObjectIdRef.current = null;
					isDragReadyRef.current = false;
					canvas.discardActiveObject();
					canvas.renderAll();
					// Clear click tracking
					clickStartRef.current = null;
					return;
				}
			}
			// Clear click tracking after processing
			clickStartRef.current = null;

			// Handle showing resize handles for selected object after first click
			if (selectedObjectIdRef.current && !isDragReadyRef.current && !isSelecting) {
				const selectedObj = canvas
					.getObjects()
					.find((obj: any) => obj.id === selectedObjectIdRef.current);
				if (selectedObj && !canvas.getActiveObject()) {

					canvas.setActiveObject(selectedObj);
					canvas.renderAll();
				}
			}

			// Drag selection is now handled by the native mouseup handler
			// This ensures object selection happens before state is cleared
			setIsSelecting(false);
			setSelectionStart(null);
			setSelectionEnd(null);
			currentOperationRef.current = null;
			canvas.renderAll();
		};

		// Handle when scaling starts
		const handleScalingStart = (e: any) => {
			currentOperationRef.current = 'scaling';
			if (e.transform && e.transform.corner) {
				scalingCornerRef.current = e.transform.corner;
			}
		};

		// Comprehensive scaling constraints using events
		const handleObjectScaling = (e: any) => {
			const target = e.target;
			if (!target || !target.id) return;

			const targetId = target.id;
			const targetObj = objects.find((obj: CanvasObject) => obj.id === targetId);
			if (!targetObj) return;

			// Get current transform info
			const transform = e.transform;
			if (!transform) return;

			// Get the scaling corner/edge being used
			const corner = transform.corner || scalingCornerRef.current;

			// Calculate the object's bounding box after scaling
			const scaledWidth = target.width * target.scaleX;
			const scaledHeight = target.height * target.scaleY;

			// Calculate the bounds of the scaled object
			const objectBounds = {
				left: target.left,
				top: target.top,
				right: target.left + scaledWidth,
				bottom: target.top + scaledHeight,
			};

			// 1. MAX SCALING CONSTRAINT: Can't scale bigger than parent/canvas
			const parentConstraints = getBoundaryConstraints(targetObj);

			// Calculate maximum scale factors based on which corner is being dragged
			let maxScaleX = Infinity;
			let maxScaleY = Infinity;

			// For X scaling constraints
			if (corner && (corner.includes('l') || corner === 'ml')) {
				// Scaling from left side - constrain by left boundary
				const availableWidth = objectBounds.right - parentConstraints.minLeft;
				maxScaleX = availableWidth / target.width;
			} else if (corner && (corner.includes('r') || corner === 'mr')) {
				// Scaling from right side - constrain by right boundary
				const availableWidth = parentConstraints.maxRight - objectBounds.left;
				maxScaleX = availableWidth / target.width;
			} else {
				// Center scaling or uniform - constrain by both sides
				const availableWidthLeft = objectBounds.right - parentConstraints.minLeft;
				const availableWidthRight = parentConstraints.maxRight - objectBounds.left;
				maxScaleX = Math.min(availableWidthLeft, availableWidthRight) / target.width;
			}

			// For Y scaling constraints
			if (corner && (corner.includes('t') || corner === 'mt')) {
				// Scaling from top side - constrain by top boundary
				const availableHeight = objectBounds.bottom - parentConstraints.minTop;
				maxScaleY = availableHeight / target.height;
			} else if (corner && (corner.includes('b') || corner === 'mb')) {
				// Scaling from bottom side - constrain by bottom boundary
				const availableHeight = parentConstraints.maxBottom - objectBounds.top;
				maxScaleY = availableHeight / target.height;
			} else {
				// Center scaling or uniform - constrain by both sides
				const availableHeightTop = objectBounds.bottom - parentConstraints.minTop;
				const availableHeightBottom = parentConstraints.maxBottom - objectBounds.top;
				maxScaleY = Math.min(availableHeightTop, availableHeightBottom) / target.height;
			}

			// 2. MIN SCALING CONSTRAINT: Can't scale smaller than largest child
			const children = objects.filter((obj: CanvasObject) => obj.parentId === targetId);
			let minScaleX = target.minScaleLimit || 0.1;
			let minScaleY = target.minScaleLimit || 0.1;

			if (children.length > 0) {
				// Find the child that requires the most space relative to the parent's original size
				let maxRequiredWidth = 0;
				let maxRequiredHeight = 0;

				children.forEach((child) => {
					// Calculate child position relative to parent's original position
					const relativeLeft = child.left - targetObj.left;
					const relativeTop = child.top - targetObj.top;

					// Calculate required parent dimensions to contain this child
					const requiredWidth = relativeLeft + child.width;
					const requiredHeight = relativeTop + child.height;

					maxRequiredWidth = Math.max(maxRequiredWidth, requiredWidth);
					maxRequiredHeight = Math.max(maxRequiredHeight, requiredHeight);
				});

				// Calculate minimum scale needed to contain all children
				if (maxRequiredWidth > 0) {
					minScaleX = Math.max(minScaleX, maxRequiredWidth / targetObj.width);
				}
				if (maxRequiredHeight > 0) {
					minScaleY = Math.max(minScaleY, maxRequiredHeight / targetObj.height);
				}
			}

			// 3. APPLY CONSTRAINTS
			let constrainedScaleX = target.scaleX;
			let constrainedScaleY = target.scaleY;
			let wasConstrained = false;

			// Apply maximum constraints
			if (target.scaleX > maxScaleX) {
				constrainedScaleX = maxScaleX;
				wasConstrained = true;
			}
			if (target.scaleY > maxScaleY) {
				constrainedScaleY = maxScaleY;
				wasConstrained = true;
			}

			// Apply minimum constraints
			if (target.scaleX < minScaleX) {
				constrainedScaleX = minScaleX;
				wasConstrained = true;
			}
			if (target.scaleY < minScaleY) {
				constrainedScaleY = minScaleY;
				wasConstrained = true;
			}

			// Apply constraints if needed
			if (wasConstrained) {
				target.set({
					scaleX: constrainedScaleX,
					scaleY: constrainedScaleY,
				});
				target.setCoords();
				canvas.renderAll();
			}
		};

		// Handle object moving (during drag)
		const handleObjectMoving = (e: any) => {
			if (!mouseIsOverCanvas.current) return;
			const target = e.target;
			if (!target || !(target as any).id) return;

			// Set operation state to moving
			currentOperationRef.current = 'moving';

			const movingTargetId = (target as any).id;

			const targetObj = objects.find((o: CanvasObject) => o.id === movingTargetId);
			if (!targetObj) return;

			// Apply boundary constraints to the target object using common function
			const constraints = getBoundaryConstraints(targetObj);
			const constrainedLeft = Math.max(
				constraints.minLeft,
				Math.min(target.left, constraints.maxRight - targetObj.width)
			);
			const constrainedTop = Math.max(
				constraints.minTop,
				Math.min(target.top, constraints.maxBottom - targetObj.height)
			);

			// Update target position if it was constrained
			if (constrainedLeft !== target.left || constrainedTop !== target.top) {
				target.set({
					left: constrainedLeft,
					top: constrainedTop,
				});
				target.setCoords();
			}

			// Recalculate delta based on constrained position
			const finalDeltaX = constrainedLeft - targetObj.left;
			const finalDeltaY = constrainedTop - targetObj.top;

			// Move all descendants with the parent using the same delta
			const descendants = getAllDescendants(movingTargetId, objects);
			descendants.forEach((descendant) => {
				const fabricObj = fabricObjectsRef.current.get(descendant.id);
				if (fabricObj && fabricObj !== target) {
					const newLeft = descendant.left + finalDeltaX;
					const newTop = descendant.top + finalDeltaY;

					fabricObj.set({
						left: newLeft,
						top: newTop,
					});
					fabricObj.setCoords();
				}
			});

			canvas.renderAll();
		};

		// Handle object moved (after drag completes)
		const handleObjectModified = (e: any) => {
			if (!mouseIsOverCanvas.current) return;
			const target = e.target;
			if (!target || !(target as any).id) return;

			// Always bake in scale if not 1
			let updatedWidth = target.width;
			let updatedHeight = target.height;
			if (Math.abs(target.scaleX - 1) > 0.001 || Math.abs(target.scaleY - 1) > 0.001) {
				updatedWidth = target.width * target.scaleX;
				updatedHeight = target.height * target.scaleY;

				target.set({
					width: updatedWidth,
					height: updatedHeight,
					scaleX: 1,
					scaleY: 1,
				});
				target.setCoords();
			}

			// Clear operation state
			currentOperationRef.current = null;
			scalingCornerRef.current = null;

			const targetId = (target as any).id;
			const descendants = getAllDescendants(targetId, objects);

			const updates = [targetId, ...descendants.map((d) => d.id)]
				.map((id) => {
					const fabricObj = fabricObjectsRef.current.get(id);
					if (!fabricObj) return null;
					if (id === targetId) {
						return {
							id,
							left: fabricObj.left || 0,
							top: fabricObj.top || 0,
							width: fabricObj.width,
							height: fabricObj.height,
						};
					}
					return {
						id,
						left: fabricObj.left || 0,
						top: fabricObj.top || 0,
					};
				})
				.filter(Boolean);

			setObjects((prevObjects) =>
				prevObjects.map((obj) => {
					const update = updates.find((u: any) => u.id === obj.id);
					if (!update) return obj;
					return {
						...obj,
						left: update.left,
						top: update.top,
						width: update.width !== undefined ? update.width : obj.width,
						height: update.height !== undefined ? update.height : obj.height,
					};
				})
			);
		};

		// Handle mouse over for hover effects
		const handleMouseOver = (e: any) => {
			const target = e.target;
			if (target && (target as any).id) {
				setHoveredObjectId((target as any).id);
			}
		};

		// Handle mouse out
		const handleMouseOut = () => {
			setHoveredObjectId(null);
		};

		canvas.on('mouse:down', handleMouseDown);
		canvas.on('mouse:move', handleMouseMove);
		canvas.on('mouse:up', handleMouseUp);
		canvas.on('object:scaling', handleScalingStart);
		canvas.on('object:scaling', handleObjectScaling);
		canvas.on('object:moving', handleObjectMoving);
		canvas.on('object:modified', handleObjectModified);
		canvas.on('mouse:over', handleMouseOver);
		canvas.on('mouse:out', handleMouseOut);

		// Native DOM mouse move handler for reliable selection box updates
		const handleNativeMouseMove = (e: MouseEvent) => {
			if (
				!isSelectingRef.current ||
				!selectionStartRef.current ||
				currentOperationRef.current !== 'selecting'
			)
				return;

			// Get canvas bounds for coordinate conversion
			const canvasRect = canvasElement.getBoundingClientRect();
			const x = e.clientX - canvasRect.left;
			const y = e.clientY - canvasRect.top;

			selectionEndRef.current = { x, y };
			setSelectionEnd({ x, y });
		};

		// Native DOM mouse up handler for reliable selection clearing
		const handleNativeMouseUp = () => {
			if (isSelectingRef.current && currentOperationRef.current === 'selecting') {
				// Process object selection BEFORE clearing state
				if (selectionStartRef.current && selectionEndRef.current) {
					const selectionBounds = {
						left: Math.min(selectionStartRef.current.x, selectionEndRef.current.x),
						top: Math.min(selectionStartRef.current.y, selectionEndRef.current.y),
						right: Math.max(selectionStartRef.current.x, selectionEndRef.current.x),
						bottom: Math.max(selectionStartRef.current.y, selectionEndRef.current.y),
					};

					// Find objects completely inside selection bounds
					const objectsInSelection: CanvasObject[] = [];
					objects.forEach((obj) => {
						const objBounds = {
							left: obj.left,
							top: obj.top,
							right: obj.left + obj.width,
							bottom: obj.top + obj.height,
						};



						// Check if object is completely inside selection bounds
						if (
							objBounds.left >= selectionBounds.left &&
							objBounds.top >= selectionBounds.top &&
							objBounds.right <= selectionBounds.right &&
							objBounds.bottom <= selectionBounds.bottom
						) {
							objectsInSelection.push(obj);

						}
					});

					// Find the most parent object (lowest depth) among selected objects
					if (objectsInSelection.length > 0) {
						let mostParentObject: CanvasObject | null = null;
						let lowestDepth = Infinity;

						objectsInSelection.forEach((obj: CanvasObject) => {
							const depth = getObjectDepth(obj.id, objects);
							if (depth < lowestDepth) {
								lowestDepth = depth;
								mostParentObject = obj;
							}
						});

						if (mostParentObject) {
							const selectedObject = mostParentObject as CanvasObject;
							// Update selection state - drag-selected objects are immediately ready to drag
							selectedObjectIdRef.current = selectedObject.id;
							isDragReadyRef.current = true;

							// Show resize handles immediately and unlock for dragging
							const fabricObj = fabricObjectsRef.current.get(selectedObject.id);
							if (fabricObj) {
								// Unlock the object for immediate dragging
								fabricObj.set({
									lockMovementX: false,
									lockMovementY: false,
								});

								// Set as active object to show resize handles
								canvas.setActiveObject(fabricObj);

							}
						}
					}
				}

				// Clear ALL hover effects - reset all object strokes to normal
				canvas.getObjects().forEach((obj: any) => {
					if (obj.id) {
						const objData = objects.find((o) => o.id === obj.id);
						if (objData) {
							obj.set('stroke', objData.stroke);
							obj.set('strokeWidth', 1); // Remove all hover effects
						}
					}
				});

				canvas.renderAll();


				// Clear selection state after processing
				isSelectingRef.current = false;
				selectionStartRef.current = null;
				selectionEndRef.current = null;
				currentOperationRef.current = null;
				// Update UI state
				setIsSelecting(false);
				setSelectionStart(null);
				setSelectionEnd(null);
				console.log('[DEBUG] Native mouse up - selection cleared');
			}
		};

		// Mouse enter/leave tracking for canvas
		const canvasElement = canvas.getElement ? canvas.getElement() : canvas.lowerCanvasEl;
		const handleMouseLeave = () => {
			mouseIsOverCanvas.current = false;
			if (
				currentOperationRef.current === 'scaling' ||
				currentOperationRef.current === 'moving'
			) {
				// Force operation to stop by firing object:modified
				const activeObj = canvas.getActiveObject();
				if (activeObj) {
					canvas.fire('object:modified', { target: activeObj });
					canvas.discardActiveObject();
				}
				currentOperationRef.current = null;
			} else if (currentOperationRef.current === 'selecting') {
				// Clean up drag selection
				// Reset all object strokes to normal
				canvas.getObjects().forEach((obj: any) => {
					if (obj.id) {
						const objData = objects.find((o: CanvasObject) => o.id === obj.id);
						if (objData) {
							obj.set('stroke', objData.stroke);
							obj.set('strokeWidth', obj.id === hoveredObjectId ? 3 : 1);
						}
					}
				});

				setIsSelecting(false);
				setSelectionStart(null);
				setSelectionEnd(null);
				currentOperationRef.current = null;
				canvas.renderAll();
			}
		};

		const handleMouseEnter = () => {
			mouseIsOverCanvas.current = true;
		};

		canvasElement.addEventListener('mouseleave', handleMouseLeave);
		canvasElement.addEventListener('mouseenter', handleMouseEnter);
		// Add native DOM mouse move listener for reliable selection updates
		document.addEventListener('mousemove', handleNativeMouseMove);
		// Add native DOM mouse up listener for reliable selection clearing
		document.addEventListener('mouseup', handleNativeMouseUp);



		return () => {
			canvas.off('mouse:down', handleMouseDown);
			canvas.off('mouse:move', handleMouseMove);
			canvas.off('mouse:up', handleMouseUp);
			canvas.off('object:scaling', handleScalingStart);
			canvas.off('object:scaling', handleObjectScaling);
			canvas.off('object:moving', handleObjectMoving);
			canvas.off('object:modified', handleObjectModified);
			canvas.off('mouse:over', handleMouseOver);
			canvas.off('mouse:out', handleMouseOut);
			const canvasElement =
				canvas.getElement ? canvas.getElement() : canvas.lowerCanvasEl;
			canvasElement.removeEventListener('mouseleave', handleMouseLeave);
			canvasElement.removeEventListener('mouseenter', handleMouseEnter);
			// Remove native DOM mouse move listener
			document.removeEventListener('mousemove', handleNativeMouseMove);
			// Remove native DOM mouse up listener
			document.removeEventListener('mouseup', handleNativeMouseUp);

		};
	}, [editor, objects]);

	return (
		<div style={{ padding: '20px', textAlign: 'center' }}>
			<h2>Canvas Editor</h2>
			<div
				style={{
					display: 'inline-block',
					border: '1px solid #ccc',
					borderRadius: '4px',
					position: 'relative',
				}}
			>
				<FabricJSCanvas className='sample-canvas' onReady={handleReady} />

				{/* Drag Selection Box Overlay */}
				{isSelecting && selectionStart && selectionEnd && (
					<div
						style={{
							position: 'absolute',
							left: Math.min(selectionStart.x, selectionEnd.x),
							top: Math.min(selectionStart.y, selectionEnd.y),
							width: Math.abs(selectionEnd.x - selectionStart.x),
							height: Math.abs(selectionEnd.y - selectionStart.y),
							border: '2px solid rgba(0, 123, 255, 0.8)',
							backgroundColor: 'rgba(0, 123, 255, 0.1)',
							pointerEvents: 'none',
							zIndex: 1000,
						}}
					/>
				)}
			</div>
		</div>
	);
};

export default CanvasEditor;
