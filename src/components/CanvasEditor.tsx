import React, { useState, useEffect, useRef, useCallback } from 'react';
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
	const [dragCandidate, setDragCandidate] = useState<string | null>(null);
	const [clickOffset, setClickOffset] = useState<{ x: number; y: number }>({
		x: 0,
		y: 0,
	});

	// Store references to fabric objects for direct manipulation
	const fabricObjectsRef = useRef<Map<string, fabric.Rect>>(new Map());
	const originalPositionsRef = useRef<Map<string, { left: number; top: number }>>(
		new Map()
	);

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
		fabricObjectsRef.current.clear();

		objects.forEach((obj) => {
			const rect = new fabric.Rect({
				left: obj.left,
				top: obj.top,
				width: obj.width,
				height: obj.height,
				fill: obj.fill,
				stroke: obj.stroke,
				strokeWidth: selectedObjectId === obj.id || hoveredObjectId === obj.id ? 3 : 1,
				selectable: false,
				hasControls: false,
				id: obj.id, // Assign custom id to fabric object
			});

			// Store reference to fabric object
			fabricObjectsRef.current.set(obj.id, rect);
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

	const isValidMove = (
		objId: string,
		newX: number,
		newY: number,
		currentObjects: CanvasObject[]
	): boolean => {
		const obj = currentObjects.find((o) => o.id === objId);
		if (!obj) return false;

		// Check canvas boundaries
		if (newX < 0 || newY < 0 || newX + obj.width > 800 || newY + obj.height > 600) {
			return false;
		}

		// Check parent boundaries if parent exists
		if (obj.parentId) {
			const parent = currentObjects.find((o) => o.id === obj.parentId);
			if (parent) {
				if (
					newX < parent.left ||
					newY < parent.top ||
					newX + obj.width > parent.left + parent.width ||
					newY + obj.height > parent.top + parent.height
				) {
					return false;
				}
			}
		}

		return true;
	};

	// Throttled function to update visual feedback during drag
	const updateDragVisuals = useCallback(
		(draggedObjects: { id: string; newLeft: number; newTop: number }[]) => {
			draggedObjects.forEach(({ id, newLeft, newTop }) => {
				const fabricObj = fabricObjectsRef.current.get(id);
				if (fabricObj) {
					fabricObj.set({
						left: newLeft,
						top: newTop,
					});
				}
			});

			if (editor?.canvas) {
				editor.canvas.renderAll();
			}
		},
		[editor]
	);

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
			const clickedObj = objects.find((obj) => obj.id === newSelectedId);
			if (clickedObj) {
				// Calculate offset from object's top-left corner to click point
				const objClickOffset = {
					x: pointer.x - clickedObj.left,
					y: pointer.y - clickedObj.top,
				};
				setClickOffset(objClickOffset);
			}

			setDragCandidate(newSelectedId);
			setDragStartPos(pointer);
			setIsDragging(false);
		};

		const handleMouseMove = (e: fabric.TEvent) => {
			const pointer = canvas.getPointer(e.e);

			// Handle dragging logic
			if (dragCandidate && dragStartPos) {
				const dragDistance = Math.hypot(
					pointer.x - dragStartPos.x,
					pointer.y - dragStartPos.y
				);

				if (!isDragging && dragDistance > 3) {
					setIsDragging(true);
					// Store original positions when drag starts
					const selectedObj = objects.find((obj) => obj.id === dragCandidate);
					if (selectedObj) {
						const descendants = getAllDescendants(dragCandidate, objects);
						const objectsToMove = [selectedObj, ...descendants];

						originalPositionsRef.current.clear();
						objectsToMove.forEach((obj) => {
							originalPositionsRef.current.set(obj.id, { left: obj.left, top: obj.top });
						});
					}
				}

				if (isDragging) {
					const selectedObj = objects.find((obj) => obj.id === dragCandidate);
					if (selectedObj) {
						const newX = pointer.x - clickOffset.x;
						const newY = pointer.y - clickOffset.y;

						// Calculate offset from original position
						const offsetX = newX - selectedObj.left;
						const offsetY = newY - selectedObj.top;

						// Check if move is valid before applying
						if (isValidMove(dragCandidate, newX, newY, objects)) {
							// Get all objects to move (selected + descendants)
							const descendants = getAllDescendants(dragCandidate, objects);
							const objectsToMove = [selectedObj, ...descendants];

							// Prepare drag updates for direct fabric manipulation
							const draggedObjects = objectsToMove.map((obj) => ({
								id: obj.id,
								newLeft: obj.left + offsetX,
								newTop: obj.top + offsetY,
							}));

							// Update fabric objects directly (no React state update)
							updateDragVisuals(draggedObjects);
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
			if (isDragging && dragCandidate) {
				// Get final positions from fabric objects and update React state
				const selectedObj = objects.find((obj) => obj.id === dragCandidate);
				if (selectedObj) {
					const descendants = getAllDescendants(dragCandidate, objects);
					const objectsToMove = [selectedObj, ...descendants];

					// Check if any object actually moved
					let hasMoved = false;
					const updates = objectsToMove.map((obj) => {
						const fabricObj = fabricObjectsRef.current.get(obj.id);
						const originalPos = originalPositionsRef.current.get(obj.id);

						if (fabricObj && originalPos) {
							const newLeft = fabricObj.left || obj.left;
							const newTop = fabricObj.top || obj.top;

							if (
								Math.abs(newLeft - originalPos.left) > 1 ||
								Math.abs(newTop - originalPos.top) > 1
							) {
								hasMoved = true;
							}

							return {
								id: obj.id,
								left: newLeft,
								top: newTop,
							};
						}
						return { id: obj.id, left: obj.left, top: obj.top };
					});

					// Only update React state if objects actually moved
					if (hasMoved) {
						setObjects((prevObjects) =>
							prevObjects.map((obj) => {
								const update = updates.find((u) => u.id === obj.id);
								return update ? { ...obj, left: update.left, top: update.top } : obj;
							})
						);
					}
				}
			}

			setIsDragging(false);
			setDragCandidate(null);
			setDragStartPos(null);
			setClickOffset({ x: 0, y: 0 });
			originalPositionsRef.current.clear();
		};

		canvas.on('mouse:down', handleMouseDown);
		canvas.on('mouse:move', handleMouseMove);
		canvas.on('mouse:up', handleMouseUp);

		return () => {
			canvas.off('mouse:down', handleMouseDown);
			canvas.off('mouse:move', handleMouseMove);
			canvas.off('mouse:up', handleMouseUp);
		};
	}, [
		editor,
		objects,
		selectedObjectId,
		isDragging,
		dragStartPos,
		hoveredObjectId,
		dragCandidate,
		clickOffset,
	]);

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
				<FabricJSCanvas className='sample-canvas' onReady={handleReady} />
			</div>
		</div>
	);
};

export default CanvasEditor;
