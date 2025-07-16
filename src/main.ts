import './style.css';
import * as THREE from 'three';
import { ThreeRenderer } from './ThreeRenderer';
import { UndoRedoManager } from './UndoRedoManager';
import { BrowserStateManager } from './BrowserStateManager';
import type { SceneSettings, GLTFModelSettings } from './types';

class StickFigureApp3D {
  private renderer!: ThreeRenderer;
  private undoRedoManager: UndoRedoManager;
  private stateManager: BrowserStateManager;
  private isDragging = false;
  private dragTarget: { bone: THREE.Bone; control: THREE.Object3D; originalRotation: THREE.Euler } | null = null;
  private dragStartState: any = null;
  private selectedJoint: string | null = null;
  private currentModelPath: string | null = null;
  private currentModelSettings: GLTFModelSettings | null = null;

  // UI Elements
  private canvasContainer: HTMLElement;
  private compactSelectionBox: HTMLElement | null = null;

  constructor() {
    this.undoRedoManager = new UndoRedoManager();
    this.stateManager = new BrowserStateManager();
    
    // Get UI elements
    this.canvasContainer = document.getElementById('three-canvas')!;

    this.initializeRenderer();
    this.setupEventListeners();
    this.setupUI();
    this.setupAutoSave();
    
    // Debug: Check if there's already saved state
    const existingState = localStorage.getItem('poser3d-app-state');
    console.log('🔍 Initial state check:', existingState ? JSON.parse(existingState) : 'No saved state found');
    
    // Load saved state before auto-loading default model
    this.loadSavedState().then(() => {
      // Auto-load the default GLB model if no saved state or model
      setTimeout(() => {
        if (!this.currentModelPath) {
          console.log('🎭 No saved model found, loading default model');
          this.loadDefaultModel();
        } else {
          console.log('🎯 Saved model found, skipping default model load');
        }
      }, 100);
    });
  }

  private initializeRenderer(): void {
    this.renderer = new ThreeRenderer(this.canvasContainer);
    this.renderer.setMovementPlane('camera-relative');
  }

  private setupEventListeners(): void {
    // Toolbar buttons
    document.getElementById('reset-camera')?.addEventListener('click', () => this.renderer.resetCamera());

    // Undo/Redo buttons
    document.getElementById('undo-btn')?.addEventListener('click', () => this.undo());
    document.getElementById('redo-btn')?.addEventListener('click', () => this.redo());

    // Keyboard shortcuts for undo/redo
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
      } else if (e.key === 't' || e.key === 'T') {
        this.testStateSaving();
      } else if (e.key === 's' || e.key === 'S') {
        this.saveCurrentState();
      } else if (e.key === 'l' || e.key === 'L') {
        this.loadSavedState();
      }
    });

    // Camera view buttons
    document.getElementById('view-front')?.addEventListener('click', () => this.renderer.setCameraView('front'));
    document.getElementById('view-back')?.addEventListener('click', () => this.renderer.setCameraView('back'));
    document.getElementById('view-left')?.addEventListener('click', () => this.renderer.setCameraView('left'));
    document.getElementById('view-right')?.addEventListener('click', () => this.renderer.setCameraView('right'));
    document.getElementById('view-top')?.addEventListener('click', () => this.renderer.setCameraView('top'));
    document.getElementById('view-bottom')?.addEventListener('click', () => this.renderer.setCameraView('bottom'));

    // Settings
    this.setupSettingsEventListeners();

    // Export/Import character state
    const exportButton = document.getElementById('export-character');
    const importButton = document.getElementById('import-character');
    const importFileInput = document.getElementById('import-file') as HTMLInputElement;
    
    exportButton?.addEventListener('click', () => {
      const characterState = this.exportCharacterState();
      
      // Create a downloadable file
      const blob = new Blob([characterState], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `character-pose-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      this.showMessage('Character state exported successfully', 'success');
    });
    
    importButton?.addEventListener('click', () => {
      importFileInput.click();
    });
    
    importFileInput?.addEventListener('change', (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const jsonString = e.target?.result as string;
          this.importCharacterState(jsonString);
        };
        reader.readAsText(file);
        
        // Reset the file input
        (event.target as HTMLInputElement).value = '';
      }
    });

    // Mouse events for 3D bone control interaction
    this.setupMouseEventListeners();

    // Collapsible panels
    this.setupCollapsiblePanels();

    // Set up GLTF controls event listener
    window.addEventListener('gltfControlsReady', (event: Event) => {
      console.log('🎮 GLTF bone controls are ready');
      const customEvent = event as CustomEvent;
      this.setupBoneControlInteraction(customEvent.detail.controls);
    });
  }

  private setupMouseEventListeners(): void {
    let mouseDownPos = { x: 0, y: 0 };
    let movementMode = 'camera-relative';

    // Track keyboard state for movement mode switching
    let shiftPressed = false;
    let ctrlPressed = false;

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') shiftPressed = true;
      if (e.key === 'Control') ctrlPressed = true;
      
      if (e.key === 'Escape') {
        this.clearSelection();
        return;
      }
      
      // Update movement mode based on modifier keys
      if (shiftPressed && ctrlPressed) {
        movementMode = 'yz';
      } else if (shiftPressed) {
        movementMode = 'xz';
      } else if (ctrlPressed) {
        movementMode = 'xy';
      } else {
        movementMode = 'camera-relative';
      }
      
      this.updatePlaneIndicator(movementMode);
      this.renderer.setMovementPlane(movementMode);
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') shiftPressed = false;
      if (e.key === 'Control') ctrlPressed = false;
      
      // Update movement mode
      if (shiftPressed && ctrlPressed) {
        movementMode = 'yz';
      } else if (shiftPressed) {
        movementMode = 'xz';
      } else if (ctrlPressed) {
        movementMode = 'xy';
      } else {
        movementMode = 'camera-relative';
      }
      this.updatePlaneIndicator(movementMode);
      this.renderer.setMovementPlane(movementMode);
    });

    this.canvasContainer.addEventListener('mousedown', (e) => {
      mouseDownPos = { x: e.clientX, y: e.clientY };
      
      console.log(`🖱️ Mouse down at: ${e.clientX}, ${e.clientY}`);
      console.log(`🖱️ Bone control mode: ${this.renderer.boneControlMode}`);
      
      // Check for bone control interaction
      const boneControlResult = this.renderer.raycastBoneControls(e.clientX, e.clientY);
      
      if (boneControlResult) {
        console.log(`🎯 Selected bone: ${boneControlResult.bone.name}`);
        
        // Save state for undo before starting drag
        this.dragStartState = this.getCurrentState();
        
        this.isDragging = true;
        this.dragTarget = {
          bone: boneControlResult.bone,
          control: boneControlResult.control,
          originalRotation: boneControlResult.bone.rotation.clone()
        };
        
        // Disable orbit controls while dragging
        this.renderer.getControls().enabled = false;
        e.preventDefault();
        e.stopPropagation();
        
        // Show plane indicator
        this.updatePlaneIndicator(movementMode);
        this.renderer.setMovementPlane(movementMode);
        
        return;
      }
    });

    this.canvasContainer.addEventListener('click', (e) => {
      if (!this.isDragging) {
        const boneControlResult = this.renderer.raycastBoneControls(e.clientX, e.clientY);
        
        if (boneControlResult) {
          console.log(`🎯 Clicked bone: ${boneControlResult.bone.name}`);
          this.selectJoint(boneControlResult.bone);
          return;
        } else {
          // Click on empty space, clear selection
          this.clearSelection();
        }
      }
    });

    this.canvasContainer.addEventListener('mousemove', (e) => {
      if (this.isDragging && this.dragTarget) {
        const deltaX = e.clientX - mouseDownPos.x;
        const deltaY = e.clientY - mouseDownPos.y;
        
        // Handle bone control rotation
        const rotationSensitivity = 0.01;
        let deltaRotation = { x: 0, y: 0, z: 0 };
        
        switch (movementMode) {
          case 'camera-relative':
            // For camera-relative, convert mouse movement to rotation around appropriate axes
            deltaRotation = {
              x: -deltaY * rotationSensitivity, // Mouse up/down -> rotate around X axis
              y: deltaX * rotationSensitivity,  // Mouse left/right -> rotate around Y axis
              z: 0
            };
            break;
          case 'xy':
            deltaRotation = {
              x: -deltaY * rotationSensitivity,
              y: deltaX * rotationSensitivity,
              z: 0
            };
            break;
          case 'xz':
            deltaRotation = {
              x: 0,
              y: deltaX * rotationSensitivity,
              z: deltaY * rotationSensitivity
            };
            break;
          case 'yz':
            deltaRotation = {
              x: -deltaY * rotationSensitivity,
              y: 0,
              z: deltaX * rotationSensitivity
            };
            break;
        }
        
        // Apply rotation to bone
        this.dragTarget.bone.rotation.x += deltaRotation.x;
        this.dragTarget.bone.rotation.y += deltaRotation.y;
        this.dragTarget.bone.rotation.z += deltaRotation.z;
        
        // Update bone controller
        this.renderer.updateBoneController();
        
        // Update selection UI if a joint is selected
        if (this.selectedJoint && this.dragTarget && this.dragTarget.bone.name === this.selectedJoint) {
          this.updateSelectionUI(this.dragTarget.bone);
        }
        
        // Update mouse position for next delta calculation
        mouseDownPos = { x: e.clientX, y: e.clientY };
      }
    });

    this.canvasContainer.addEventListener('mouseup', () => {
      if (this.isDragging) {
        // Re-enable orbit controls when dragging stops
        this.renderer.getControls().enabled = true;
        
        // Save action to history if we actually dragged something
        if (this.dragStartState && this.dragTarget) {
          const boneName = this.dragTarget.bone.name || 'Unknown Bone';
          console.log(`=== SAVING BONE MOVEMENT ===`);
          console.log(`Bone: ${boneName}`);
          
          this.saveAction('bone-move', `Moved ${boneName}`, this.dragStartState);
          console.log(`=== END BONE MOVEMENT SAVE ===`);
          
          // Save the current state after bone movement
          this.saveCurrentState();
        }
      }
      this.isDragging = false;
      this.dragTarget = null;
      this.dragStartState = null;
      this.hidePlaneIndicator();
    });
  }

  private setupSettingsEventListeners(): void {
    const gridVisibleCheckbox = document.getElementById('grid-visible') as HTMLInputElement;
    
    gridVisibleCheckbox?.addEventListener('change', () => {
      const settings: Partial<SceneSettings> = {
        gridVisible: gridVisibleCheckbox.checked
      };
      this.renderer.updateSettings(settings);
      
      // Save state after UI change
      this.saveCurrentState();
    });

    // glTF model controls
    const gltfFileInput = document.getElementById('gltf-file') as HTMLInputElement;
    const modelOpacitySlider = document.getElementById('model-opacity') as HTMLInputElement;
    const modelScaleSlider = document.getElementById('model-scale') as HTMLInputElement;
    const showGltfModelCheckbox = document.getElementById('show-gltf-model') as HTMLInputElement;

    gltfFileInput?.addEventListener('change', async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        try {
          await this.loadModelFromPath(url);
          this.showMessage(`Loaded 3D model: ${file.name}`, 'success');
          
          // Save the state after loading a new model
          this.saveCurrentState();
        } catch (error) {
          this.showMessage(`Error loading model: ${error}`, 'error');
        }
      }
    });

    modelOpacitySlider?.addEventListener('input', () => {
      console.log('🎛️ Model opacity slider changed');
      const settings = {
        modelOpacity: parseFloat(modelOpacitySlider.value)
      };
      this.renderer.updateGLTFSettings(settings);
      
      // Update current model settings
      this.currentModelSettings = this.renderer.getGLTFSettings();
      
      // Update value display
      const valueDisplay = modelOpacitySlider.parentElement?.querySelector('.value-display');
      if (valueDisplay) {
        valueDisplay.textContent = parseFloat(modelOpacitySlider.value).toFixed(1);
      }
      
      // Save state after UI change
      console.log('🔄 Triggering save after opacity change');
      this.saveCurrentState();
    });

    modelScaleSlider?.addEventListener('input', () => {
      const settings = {
        modelScale: parseFloat(modelScaleSlider.value)
      };
      this.renderer.updateGLTFSettings(settings);
      
      // Update current model settings
      this.currentModelSettings = this.renderer.getGLTFSettings();
      
      // Update value display
      const valueDisplay = modelScaleSlider.parentElement?.querySelector('.value-display');
      if (valueDisplay) {
        valueDisplay.textContent = parseFloat(modelScaleSlider.value).toFixed(1);
      }
      
      // Save state after UI change
      this.saveCurrentState();
    });

    // Bone depth limit slider
    const boneDepthSlider = document.getElementById('bone-depth-limit') as HTMLInputElement;
    boneDepthSlider?.addEventListener('input', () => {
      const depthLimit = parseInt(boneDepthSlider.value);
      this.renderer.setBoneDepthLimit(depthLimit);
      
      // Update value display
      const valueDisplay = boneDepthSlider.parentElement?.querySelector('.value-display');
      if (valueDisplay) {
        valueDisplay.textContent = depthLimit.toString();
      }
      
      console.log(`🔍 Bone depth limit set to: ${depthLimit}`);
      
      // Save state after UI change
      this.saveCurrentState();
    });

    showGltfModelCheckbox?.addEventListener('change', () => {
      this.renderer.setGLTFVisible(showGltfModelCheckbox.checked);
      
      // Update current model settings
      this.currentModelSettings = this.renderer.getGLTFSettings();
      
      // Save state after UI change
      this.saveCurrentState();
    });
  }

  private setupCollapsiblePanels(): void {
    const panels = [
      { toggle: 'settings-toggle', container: 'settings-content' },
      { toggle: 'undo-redo-toggle', container: 'undo-redo-content' }
    ];

    panels.forEach(panel => {
      const toggle = document.getElementById(panel.toggle);
      const container = document.getElementById(panel.container);

      toggle?.addEventListener('click', () => {
        container?.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
      });
    });
  }

  private setupUI(): void {
    this.updateUndoRedoUI();
    this.initializeSelectionPanel();
  }

  private initializeSelectionPanel(): void {
    this.compactSelectionBox = document.getElementById('compact-selection-box');
    
    // Set up reset joint button
    document.getElementById('reset-joint-btn-compact')?.addEventListener('click', () => {
      this.resetSelectedJoint();
    });
  }

  private async loadDefaultModel(): Promise<void> {
    const defaultModelPath = '/womenfemale_body_base_rigged.glb';
    
    try {
      console.log('🎭 Loading default GLB model...');
      await this.loadModelFromPath(defaultModelPath);
      
      // Focus the camera on the loaded model
      console.log('📷 Focusing camera on loaded GLB model...');
      this.renderer.focusOnGLTFModel();
      
      console.log('✅ Default GLB model loaded successfully');
      this.showMessage('Default character model loaded automatically', 'success');
      
      // Save the state after loading the default model
      this.saveCurrentState();
      
    } catch (error) {
      console.warn('⚠️ Could not load default GLB model:', error);
      console.log('ℹ️ Continuing without default model - you can load one manually');
    }
  }

  private setupBoneControlInteraction(_controls: THREE.Group): void {
    console.log('🎮 Setting up bone control interaction');
    // The bone controls are already handled by the mouse event listeners
    // This method can be used for any additional setup if needed
  }

  private selectJoint(bone: THREE.Bone): void {
    console.log(`🎯 Selecting joint: ${bone.name}`);
    this.selectedJoint = bone.name;
    this.updateSelectionUI(bone);
    this.showSelectionPanel();
    this.renderer.highlightBoneControl(bone.name);
    
    // Save the current state with the selected joint
    this.saveCurrentState();
  }

  private clearSelection(): void {
    console.log('🔄 Clearing selection');
    this.selectedJoint = null;
    this.hideSelectionPanel();
    this.renderer.highlightBoneControl(null);
    
    // Reset selection UI elements
    const nameElement = document.getElementById('selected-joint-name-compact');
    if (nameElement) {
      nameElement.textContent = 'None';
      nameElement.classList.add('none');
    }
    
    const positionElements = ['position-x-compact', 'position-y-compact', 'position-z-compact'];
    positionElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = '0.00';
    });
    
    const rotationElements = ['rotation-x-compact', 'rotation-y-compact', 'rotation-z-compact'];
    rotationElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = '0.00°';
    });
  }

  private resetSelectedJoint(): void {
    if (this.selectedJoint) {
      // Find the selected bone and reset its rotation
      const bone = this.findBoneByName(this.selectedJoint);
      if (bone) {
        const beforeState = this.getCurrentState();
        
        // Reset rotation to identity
        bone.rotation.set(0, 0, 0);
        
        // Save the action for undo/redo
        this.saveAction('bone_reset', `Reset ${this.selectedJoint} joint`, beforeState);
        
        // Update the UI
        this.updateSelectionUI(bone);
        
        this.showMessage(`Reset ${this.selectedJoint} joint`, 'info');
        
        // Save the current state after reset
        this.saveCurrentState();
      }
    }
  }

  private updateSelectionUI(bone: THREE.Bone): void {
    const nameElement = document.getElementById('selected-joint-name-compact');
    const xPosElement = document.getElementById('position-x-compact');
    const yPosElement = document.getElementById('position-y-compact');
    const zPosElement = document.getElementById('position-z-compact');
    const xRotElement = document.getElementById('rotation-x-compact');
    const yRotElement = document.getElementById('rotation-y-compact');
    const zRotElement = document.getElementById('rotation-z-compact');
    
    if (nameElement) {
      nameElement.textContent = bone.name;
      nameElement.classList.remove('none');
    }
    
    // Get the world position of the bone
    const worldPosition = new THREE.Vector3();
    bone.getWorldPosition(worldPosition);
    
    // Update position display
    if (xPosElement) xPosElement.textContent = worldPosition.x.toFixed(2);
    if (yPosElement) yPosElement.textContent = worldPosition.y.toFixed(2);
    if (zPosElement) zPosElement.textContent = worldPosition.z.toFixed(2);
    
    // Update rotation display (convert from radians to degrees)
    if (xRotElement) xRotElement.textContent = `${(bone.rotation.x * 180 / Math.PI).toFixed(2)}°`;
    if (yRotElement) yRotElement.textContent = `${(bone.rotation.y * 180 / Math.PI).toFixed(2)}°`;
    if (zRotElement) zRotElement.textContent = `${(bone.rotation.z * 180 / Math.PI).toFixed(2)}°`;
  }

  private showSelectionPanel(): void {
    const selectionDetails = document.getElementById('selection-details');
    const resetBtn = document.getElementById('reset-joint-btn-compact');
    
    if (selectionDetails) {
      selectionDetails.style.display = 'flex';
    }
    
    if (resetBtn) {
      resetBtn.style.display = 'block';
    }
  }

  private hideSelectionPanel(): void {
    const selectionDetails = document.getElementById('selection-details');
    const resetBtn = document.getElementById('reset-joint-btn-compact');
    
    if (selectionDetails) {
      selectionDetails.style.display = 'none';
    }
    
    if (resetBtn) {
      resetBtn.style.display = 'none';
    }
  }

  private findBoneByName(boneName: string): THREE.Bone | null {
    return this.renderer.getBoneByName(boneName);
  }

  private getCurrentState(): any {
    // Return current state for undo/redo functionality
    return {
      timestamp: Date.now(),
      boneRotations: this.renderer.getBoneRotations(),
      modelPath: this.currentModelPath,
      modelSettings: this.currentModelSettings
    };
  }

  private saveAction(type: string, description: string, beforeState: any): void {
    console.log(`Saving action: ${type} - ${description}`);
    const afterState = this.getCurrentState();
    
    // Create a simplified app state structure for the undo manager
    const beforeAppState: any = {
      boneRotations: beforeState.boneRotations || {},
      timestamp: beforeState.timestamp || Date.now()
    };
    
    const afterAppState: any = {
      boneRotations: afterState.boneRotations || {},
      timestamp: afterState.timestamp || Date.now()
    };
    
    this.undoRedoManager.saveState(
      type as any,
      description,
      beforeAppState,
      afterAppState
    );
    
    this.updateUndoRedoUI();
  }

  private undo(): void {
    console.log('🔄 Undo requested');
    const beforeState = this.undoRedoManager.undo();
    if (beforeState) {
      console.log(`Undoing bone movement`);
      this.restoreState(beforeState);
      this.showMessage(`Undid bone movement`, 'info');
    } else {
      this.showMessage('Nothing to undo', 'warning');
    }
    this.updateUndoRedoUI();
  }

  private redo(): void {
    console.log('🔄 Redo requested');
    const afterState = this.undoRedoManager.redo();
    if (afterState) {
      console.log(`Redoing bone movement`);
      this.restoreState(afterState);
      this.showMessage(`Redid bone movement`, 'info');
    } else {
      this.showMessage('Nothing to redo', 'warning');
    }
    this.updateUndoRedoUI();
  }

  private restoreState(state: any): void {
    console.log('🔄 Restoring state', state);
    
    if (state.boneRotations) {
      this.renderer.setBoneRotations(state.boneRotations);
    }
    
    // Restore model if it has changed
    if (state.modelPath && state.modelPath !== this.currentModelPath) {
      this.loadModelFromPath(state.modelPath).then(() => {
        if (state.modelSettings) {
          this.renderer.updateGLTFSettings(state.modelSettings);
        }
      }).catch(error => {
        console.warn('⚠️ Could not restore model during undo/redo:', error);
      });
    }
    
    // Save the current state to keep it in sync
    this.saveCurrentState();
  }

  private updateUndoRedoUI(): void {
    const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
    const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;
    
    if (undoBtn) {
      undoBtn.disabled = !this.undoRedoManager.canUndo();
    }
    
    if (redoBtn) {
      redoBtn.disabled = !this.undoRedoManager.canRedo();
    }
  }

  private showMessage(message: string, type: 'success' | 'error' | 'info' | 'warning'): void {
    console.log(`📢 ${type.toUpperCase()}: ${message}`);
    
    // Create or update message element
    let messageEl = document.getElementById('message-display');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.id = 'message-display';
      messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 4px;
        color: white;
        font-weight: bold;
        z-index: 1000;
        max-width: 300px;
        word-wrap: break-word;
      `;
      document.body.appendChild(messageEl);
    }
    
    // Set message and styling based on type
    messageEl.textContent = message;
    const colors = {
      success: '#4CAF50',
      error: '#f44336',
      info: '#2196F3',
      warning: '#FF9800'
    };
    messageEl.style.backgroundColor = colors[type];
    messageEl.style.display = 'block';
    
    // Hide after 3 seconds
    setTimeout(() => {
      if (messageEl) {
        messageEl.style.display = 'none';
      }
    }, 3000);
  }

  private updatePlaneIndicator(movementMode: string): void {
    const indicator = document.getElementById('plane-indicator');
    if (indicator) {
      indicator.style.display = 'block';
      indicator.textContent = `Movement Mode: ${movementMode.toUpperCase()}`;
    }
  }

  private hidePlaneIndicator(): void {
    const indicator = document.getElementById('plane-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  private async loadSavedState(): Promise<void> {
    console.log('📥 === LOAD SAVED STATE CALLED ===');
    
    try {
      const savedState = localStorage.getItem('poser3d-simple-state');
      
      if (!savedState) {
        console.log('📁 No saved state found');
        return;
      }
      
      console.log('📦 Raw saved state:', savedState);
      const state = JSON.parse(savedState);
      console.log('📥 Parsed saved state:', state);
      
      // Restore model path and settings
      this.currentModelPath = state.modelPath || null;
      this.currentModelSettings = state.modelSettings || null;
      
      // Load model if we have one
      if (this.currentModelPath) {
        console.log('🔄 Loading saved model:', this.currentModelPath);
        try {
          await this.loadModelFromPath(this.currentModelPath, true); // Preserve settings
          
          // Apply model settings after model is loaded (with a small delay to ensure model is ready)
          setTimeout(() => {
            if (this.currentModelSettings) {
              console.log('🎛️ Applying saved model settings:', this.currentModelSettings);
              
              // Apply to renderer
              this.renderer.updateGLTFSettings(this.currentModelSettings);
              
              // Update UI to reflect the loaded settings
              this.updateModelSettingsUI(this.currentModelSettings);
              
              // Verify the settings were applied
              const appliedSettings = this.renderer.getGLTFSettings();
              console.log('✅ Settings applied. Current renderer settings:', appliedSettings);
            }
          }, 100);
          
          // Restore bone rotations
          if (state.boneRotations && Object.keys(state.boneRotations).length > 0) {
            console.log('🦴 Restoring bone rotations:', Object.keys(state.boneRotations).length, 'bones');
            
            // Wait for model to be fully loaded
            setTimeout(() => {
              const rotationsToApply: Record<string, THREE.Euler> = {};
              Object.entries(state.boneRotations).forEach(([key, rotation]: [string, any]) => {
                rotationsToApply[key] = new THREE.Euler(rotation.x, rotation.y, rotation.z, rotation.order as THREE.EulerOrder);
              });
              
              this.renderer.setBoneRotations(rotationsToApply);
              console.log('✅ Bone rotations restored');
            }, 1000);
          }
          
        } catch (error) {
          console.warn('⚠️ Could not load saved model:', error);
        }
      }
      
      // Restore camera position
      if (state.cameraPosition && state.cameraTarget) {
        const camera = this.renderer.getCamera();
        const controls = this.renderer.getControls();
        
        camera.position.set(state.cameraPosition.x, state.cameraPosition.y, state.cameraPosition.z);
        controls.target.set(state.cameraTarget.x, state.cameraTarget.y, state.cameraTarget.z);
        controls.update();
      }
      
      // Restore selected joint
      if (state.selectedJoint) {
        this.selectedJoint = state.selectedJoint;
      }
      
      // Restore bone depth limit
      if (state.boneDepthLimit !== undefined) {
        console.log('🔍 Restoring bone depth limit:', state.boneDepthLimit);
        this.renderer.setBoneDepthLimit(state.boneDepthLimit);
        
        // Update the UI slider
        const boneDepthSlider = document.getElementById('bone-depth-limit') as HTMLInputElement;
        if (boneDepthSlider) {
          boneDepthSlider.value = state.boneDepthLimit.toString();
          
          // Update value display
          const valueDisplay = boneDepthSlider.parentElement?.querySelector('.value-display');
          if (valueDisplay) {
            valueDisplay.textContent = state.boneDepthLimit.toString();
          }
        }
      }
      
      console.log('✅ State loaded successfully');
      
    } catch (error) {
      console.error('❌ Error loading state:', error);
    }
  }

  private async loadModelFromPath(modelPath: string, preserveSettings: boolean = false): Promise<void> {
    try {
      console.log(`🎭 Loading model from path: ${modelPath}`);
      await this.renderer.loadGLTFModel(modelPath);
      
      // Update current model info
      this.currentModelPath = modelPath;
      
      if (!preserveSettings) {
        // Normal loading - get current settings and enable model
        this.currentModelSettings = this.renderer.getGLTFSettings();
        
        // Enable the GLTF model display
        this.renderer.updateGLTFSettings({ showModel: true });
        
        // Update the UI checkbox
        const showGltfModelCheckbox = document.getElementById('show-gltf-model') as HTMLInputElement;
        if (showGltfModelCheckbox) {
          showGltfModelCheckbox.checked = true;
        }
      }
      
      // Initialize bone depth slider after model is loaded
      setTimeout(() => {
        this.updateBoneDepthSlider();
      }, 200);
      
      console.log('✅ Model loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load model:', error);
      throw error;
    }
  }

  private saveCurrentState(): void {
    console.log('💾 === SAVE CURRENT STATE CALLED ===');
    
    try {
      const camera = this.renderer.getCamera();
      const controls = this.renderer.getControls();
      
      // Get current bone rotations and convert to plain objects
      const currentBoneRotations = this.renderer.getBoneRotations();
      const serializedBoneRotations: Record<string, any> = {};
      
      Object.entries(currentBoneRotations).forEach(([key, euler]) => {
        serializedBoneRotations[key] = {
          x: euler.x,
          y: euler.y,
          z: euler.z,
          order: euler.order
        };
      });
      
      console.log('💾 Saving bone rotations:', Object.keys(serializedBoneRotations).length, 'bones');
      
      // Simple state object
      const state = {
        timestamp: Date.now(),
        modelPath: this.currentModelPath,
        modelSettings: this.currentModelSettings,
        boneRotations: serializedBoneRotations,
        selectedJoint: this.selectedJoint,
        boneDepthLimit: this.renderer.getBoneDepthLimit(),
        cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        cameraTarget: { x: controls.target.x, y: controls.target.y, z: controls.target.z }
      };
      
      // Save directly to localStorage
      localStorage.setItem('poser3d-simple-state', JSON.stringify(state));
      console.log('✅ State saved to localStorage');
      
    } catch (error) {
      console.error('❌ Error saving state:', error);
    }
  }

  private setupAutoSave(): void {
    // Set up auto-save event listener
    document.addEventListener('poser3d-auto-save', () => {
      this.saveCurrentState();
    });
    
    // Save state when page is about to unload
    window.addEventListener('beforeunload', () => {
      this.saveCurrentState();
    });
    
    // Mark state as dirty when changes occur
    this.stateManager.markDirty();
  }

  public exportCharacterState(): string {
    const characterState = {
      modelPath: this.currentModelPath,
      modelSettings: this.currentModelSettings,
      boneRotations: this.renderer.getBoneRotations(),
      selectedJoint: this.selectedJoint,
      timestamp: Date.now(),
      version: '1.0.0'
    };
    
    return JSON.stringify(characterState, null, 2);
  }

  public importCharacterState(jsonString: string): void {
    try {
      const characterState = JSON.parse(jsonString);
      
      // Validate the imported state
      if (!characterState || typeof characterState !== 'object') {
        throw new Error('Invalid character state format');
      }
      
      console.log('📥 Importing character state:', characterState);
      
      // Load the model if specified
      if (characterState.modelPath) {
        this.loadModelFromPath(characterState.modelPath).then(() => {
          // Apply model settings
          if (characterState.modelSettings) {
            this.renderer.updateGLTFSettings(characterState.modelSettings);
          }
          
          // Apply bone rotations
          if (characterState.boneRotations) {
            this.renderer.setBoneRotations(characterState.boneRotations);
          }
          
          // Restore selected joint
          if (characterState.selectedJoint) {
            this.selectedJoint = characterState.selectedJoint;
            const bone = this.renderer.getBoneByName(characterState.selectedJoint);
            if (bone) {
              this.updateSelectionUI(bone);
              this.showSelectionPanel();
              this.renderer.highlightBoneControl(characterState.selectedJoint);
            }
          }
          
          // Save the imported state
          this.saveCurrentState();
          
          this.showMessage('Character state imported successfully', 'success');
        }).catch(error => {
          this.showMessage(`Error loading model: ${error}`, 'error');
        });
      } else {
        // No model specified, just apply bone rotations
        if (characterState.boneRotations) {
          this.renderer.setBoneRotations(characterState.boneRotations);
        }
        
        // Restore selected joint
        if (characterState.selectedJoint) {
          this.selectedJoint = characterState.selectedJoint;
          const bone = this.renderer.getBoneByName(characterState.selectedJoint);
          if (bone) {
            this.updateSelectionUI(bone);
            this.showSelectionPanel();
            this.renderer.highlightBoneControl(characterState.selectedJoint);
          }
        }
        
        // Save the imported state
        this.saveCurrentState();
        
        this.showMessage('Character pose imported successfully', 'success');
      }
      
    } catch (error) {
      this.showMessage(`Error importing character state: ${error}`, 'error');
    }
  }

  private updateModelSettingsUI(modelSettings: GLTFModelSettings): void {
    // Update opacity slider
    const modelOpacitySlider = document.getElementById('model-opacity') as HTMLInputElement;
    if (modelOpacitySlider && modelSettings.modelOpacity !== undefined) {
      modelOpacitySlider.value = modelSettings.modelOpacity.toString();
      
      // Update value display
      const valueDisplay = modelOpacitySlider.parentElement?.querySelector('.value-display');
      if (valueDisplay) {
        valueDisplay.textContent = modelSettings.modelOpacity.toFixed(1);
      }
    }
    
    // Update scale slider
    const modelScaleSlider = document.getElementById('model-scale') as HTMLInputElement;
    if (modelScaleSlider && modelSettings.modelScale !== undefined) {
      modelScaleSlider.value = modelSettings.modelScale.toString();
      
      // Update value display
      const valueDisplay = modelScaleSlider.parentElement?.querySelector('.value-display');
      if (valueDisplay) {
        valueDisplay.textContent = modelSettings.modelScale.toFixed(1);
      }
    }
    
    // Update show model checkbox
    const showGltfModelCheckbox = document.getElementById('show-gltf-model') as HTMLInputElement;
    if (showGltfModelCheckbox && modelSettings.showModel !== undefined) {
      showGltfModelCheckbox.checked = modelSettings.showModel;
    }
    
    // Update bone depth slider range and current value
    this.updateBoneDepthSlider();
  }

  private updateBoneDepthSlider(): void {
    const boneDepthSlider = document.getElementById('bone-depth-limit') as HTMLInputElement;
    if (boneDepthSlider) {
      const maxDepth = this.renderer.getMaxBoneDepth();
      const currentDepth = this.renderer.getBoneDepthLimit();
      
      // Update slider range
      boneDepthSlider.max = maxDepth.toString();
      boneDepthSlider.value = currentDepth.toString();
      
      // Update value display
      const valueDisplay = boneDepthSlider.parentElement?.querySelector('.value-display');
      if (valueDisplay) {
        valueDisplay.textContent = currentDepth.toString();
      }
      
      console.log(`🔍 Updated bone depth slider: max=${maxDepth}, current=${currentDepth}`);
    }
  }

  // Debug method to test state saving manually
  public testStateSaving(): void {
    console.log('🧪 Manual state saving test');
    
    // Test save
    this.saveCurrentState();
    
    // Test load
    const savedState = localStorage.getItem('poser3d-simple-state');
    console.log('💾 Saved state:', savedState ? JSON.parse(savedState) : 'null');
    
    // Test bone rotations
    const boneRotations = this.renderer.getBoneRotations();
    console.log('🦴 Current bone rotations:', Object.keys(boneRotations).length, 'bones');
    
    // Test model settings
    try {
      const modelSettings = this.renderer.getGLTFSettings();
      console.log('🎛️ Current model settings:', modelSettings);
    } catch (error) {
      console.error('❌ Error getting model settings:', error);
    }
  }

  // Debug method to clear saved state
  public clearSavedState(): void {
    localStorage.removeItem('poser3d-app-state');
    console.log('🗑️ Cleared saved state');
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const app = new StickFigureApp3D();
  
  // Add app to window for debugging
  (window as any).app = app;
  
  // Add test function to window
  (window as any).testState = () => {
    console.log('🧪 Running state test from window...');
    app.testStateSaving();
  };
  
  console.log('🚀 App initialized and available as window.app');
  console.log('🧪 Test function available as window.testState()');
});
