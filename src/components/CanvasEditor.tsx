import React, { useRef, useEffect, useState } from 'react';
import * as fabric from 'fabric';
import { HierarchyManager } from '../core/HierarchyManager';
import { SelectionManager } from '../core/SelectionManager';
import { TransformManager } from '../core/TransformManager';

export const CanvasEditor: React.FC = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
	const [hierarchyManager, setHierarchyManager] = useState<HierarchyManager | null>(null);
	const [selectionManager, setSelectionManager] = useState<SelectionManager | null>(null);
	const [transformManager, setTransformManager] = useState<TransformManager | null>(null);

	// Initialize editor
	useEffect(() => {
		if (!canvasRef.current) return;

		const fabricCanvas = new fabric.Canvas(canvasRef.current, {
			width: 800,
			height: 600,
			backgroundColor: '#ffffff',
		});

		const hierManager = new HierarchyManager();
		const transManager = new TransformManager(hierManager);
		const selManager = new SelectionManager(hierManager, fabricCanvas, transManager);

		setCanvas(fabricCanvas);
		setHierarchyManager(hierManager);
		setSelectionManager(selManager);
		setTransformManager(transManager);

		// Setup initial hierarchy
		hierManager.initializeThreeRectangles();
		renderElements(hierManager, fabricCanvas);

		// Setup event handlers
		setupEventHandlers(fabricCanvas, selManager);

		return () => fabricCanvas.dispose();
	}, []);

	const renderElements = (hierManager: HierarchyManager, fabricCanvas: fabric.Canvas) => {
		fabricCanvas.clear();

		// Render in depth order
		const elements = Array.from(hierManager.elements.values()).sort(
			(a, b) => a.depth - b.depth
		);

		elements.forEach((element) => {
			const rect = new fabric.Rect({
				left: element.position.x,
				top: element.position.y,
				width: element.size.width,
				height: element.size.height,
				fill: element.style.fill,
				stroke: element.style.stroke,
				strokeWidth: element.style.strokeWidth,
				selectable: false,
			});

			element.fabricObject = rect;
			fabricCanvas.add(rect);
		});

		fabricCanvas.renderAll();
	};

	const setupEventHandlers = (
		fabricCanvas: fabric.Canvas,
		selManager: SelectionManager
	) => {
		// Mouse events
		fabricCanvas.on('mouse:down', (event) => {
			const pointer = fabricCanvas.getPointer(event.e);
			selManager.onMouseDown(pointer.x, pointer.y);
			fabricCanvas.renderAll();
		});
		
		fabricCanvas.on('mouse:move', (event) => {
			const pointer = fabricCanvas.getPointer(event.e);
			selManager.onMouseMove(pointer.x, pointer.y);
			fabricCanvas.renderAll();
		});
		
		fabricCanvas.on('mouse:up', (event) => {
			selManager.onMouseUp();
			fabricCanvas.renderAll();
		});
	};

	return (
		<div style={{ padding: '20px' }}>
			<h1>Hierarchical Canvas Editor</h1>

			<canvas ref={canvasRef} style={{ border: '1px solid #ccc' }} />
		</div>
	);
};
