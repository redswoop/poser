import './style.css';
import { CameraController } from './CameraController';
import * as THREE from 'three';
import { ThreeRenderer } from './ThreeRenderer';
import { UndoRedoManager } from './UndoRedoManager';
import { JointDetailBox } from './JointDetailBox';
import type { SceneSettings, GLTFModelSettings } from './types';

class StickFigureApp3D {
  private renderer!: ThreeRenderer;
  private undoRedoManager: UndoRedoManager;
  private isDragging = false;
  private dragTarget: { bone: THREE.Bone; control: THREE.Object3D; originalRotation: THREE.Euler } | null = null;
  private dragStartState: any = null;
  private selectedJoint: string | null = null;
  private currentModelPath: string | null = null;
  private currentModelSettings: GLTFModelSettings | null = null;
  private ikMode: boolean = false;
  private activeIKChain: string | null = null;
  
  // Interactive IK state
  private interactiveIKMode: boolean = false;
  private ikDragTarget: { targetName: string; control: THREE.Object3D; originalPosition: THREE.Vector3 } | null = null;
  private altPressed: boolean = false;
  
  // Store the default pose from when the model was first loaded
  private defaultPose: Record<string, THREE.Euler> | null = null;

  // UI Elements
  private canvasContainer: HTMLElement;
  private cameraController: CameraController;
  private jointDetailBox: JointDetailBox;
  
  // Debounced save function to prevent excessive saving
  private saveStateTimeout: number | null = null;
  private readonly SAVE_DEBOUNCE_DELAY = 2000; // 2 seconds

  constructor() {
    this.undoRedoManager = new UndoRedoManager();
    
    // Get UI elements
    this.canvasContainer = document.getElementById('three-canvas')!;
    // Remove old camera-controls div if present
    const oldControls = document.getElementById('camera-controls');
    if (oldControls && oldControls.parentNode) {
      oldControls.parentNode.removeChild(oldControls);
    }
    this.cameraController = new CameraController();
    this.jointDetailBox = new JointDetailBox();
    const container = document.querySelector('.container');
    const canvasContainer = container?.querySelector('.canvas-container');
    if (container && canvasContainer) {
      canvasContainer.insertAdjacentElement('afterend', this.jointDetailBox.rootElement);
      container.insertBefore(this.cameraController.rootElement, container.querySelector('.main-content'));
    }
    this.jointDetailBox.rootElement.addEventListener('reset-joint', () => {
      this.resetSelectedJoint();
    });

    this.initializeRenderer();
    this.setupEventListeners();
    this.setupUI();
    this.setupAutoSave();
    
    // Initialize rotation hints to show default mode
    this.updateRotationHints('camera-relative');
    
    // Debug: Check if there's already saved state
    const existingState = localStorage.getItem('poser3d-app-state');
    console.log('🔍 Initial state check:', existingState ? JSON.parse(existingState) : 'No saved state found');
    
    // Add debug methods to window for testing
    (window as any).debugIK = () => {
      const boneController = this.renderer.getBoneController();
      if (boneController) {
        console.log('🦾 IK Debug Info:');
        console.log('- IK Chains:', boneController.getIKChainNames());
        console.log('- IK Mode:', (boneController as any).ikMode);
        console.log('- IK Targets:', (boneController as any).ikTargets);
        console.log('- Interactive IK Mode:', this.interactiveIKMode);
        console.log('- Alt Pressed:', this.altPressed);
        
        // Debug IK targets
        const ikTargets = (boneController as any).ikTargets;
        if (ikTargets) {
          console.log('🎯 IK Target Details:');
          ikTargets.forEach((target: any, targetName: string) => {
            console.log(`  - ${targetName}:`, {
              boneName: target.userData?.boneName,
              chainName: target.userData?.chainName,
              boneIndex: target.userData?.boneIndex,
              visible: target.visible,
              position: target.position
            });
          });
        }
      }
    };
    
    (window as any).debugBones = () => {
      const boneController = this.renderer.getBoneController();
      if (boneController) {
        const skeleton = (boneController as any).skeleton;
        if (skeleton) {
          console.log('🦴 Available Bones:');
          skeleton.bones.forEach((bone: any, index: number) => {
            console.log(`  ${index}: ${bone.name}`);
          });
          
          // Specifically look for elbow and knee-like bones
          console.log('\n🔍 Looking for elbow-like bones:');
          const elbowBones = skeleton.bones.filter((bone: any) => {
            const name = bone.name.toLowerCase();
            return name.includes('elbow') || name.includes('forearm') || name.includes('lowerarm') || name.includes('lower_arm');
          });
          elbowBones.forEach((bone: any) => console.log(`  Found: ${bone.name}`));
          
          console.log('\n🔍 Looking for knee-like bones:');
          const kneeBones = skeleton.bones.filter((bone: any) => {
            const name = bone.name.toLowerCase();
            return name.includes('knee') || name.includes('leg') || name.includes('shin') || name.includes('calf') || name.includes('lowerleg') || name.includes('lower_leg');
          });
          kneeBones.forEach((bone: any) => console.log(`  Found: ${bone.name}`));
          
          console.log('\n🔍 Looking for all arm bones:');
          const armBones = skeleton.bones.filter((bone: any) => {
            const name = bone.name.toLowerCase();
            return name.includes('arm') || name.includes('hand') || name.includes('shoulder') || name.includes('elbow');
          });
          armBones.forEach((bone: any) => console.log(`  Found: ${bone.name}`));
          
          console.log('\n🔍 Looking for all leg bones:');
          const legBones = skeleton.bones.filter((bone: any) => {
            const name = bone.name.toLowerCase();
            return name.includes('leg') || name.includes('foot') || name.includes('thigh') || name.includes('knee') || name.includes('shin') || name.includes('calf');
          });
          legBones.forEach((bone: any) => console.log(`  Found: ${bone.name}`));
        }
      }
    };
    
    (window as any).testIKMode = () => {
      this.enterInteractiveIKMode();
    };
    
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
    // Listen for camera control actions from CameraController
    this.cameraController.rootElement.addEventListener('control-action', (e: Event) => {
      const action = (e as CustomEvent).detail.action;
      switch (action) {
        case 'reset-camera':
          this.renderer.resetCamera();
          this.saveCurrentStateDebounced();
          break;
        case 'undo-btn':
          this.undo();
          break;
        case 'redo-btn':
          this.redo();
          break;
        case 'view-front':
          this.renderer.setCameraView('front');
          this.saveCurrentStateDebounced();
          break;
        case 'view-back':
          this.renderer.setCameraView('back');
          this.saveCurrentStateDebounced();
          break;
        case 'view-left':
          this.renderer.setCameraView('left');
          this.saveCurrentStateDebounced();
          break;
        case 'view-right':
          this.renderer.setCameraView('right');
          this.saveCurrentStateDebounced();
          break;
        case 'view-top':
          this.renderer.setCameraView('top');
          this.saveCurrentStateDebounced();
          break;
        case 'view-bottom':
          this.renderer.setCameraView('bottom');
          this.saveCurrentStateDebounced();
          break;
      }
    });

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
        this.saveCurrentStateImmediate();
      } else if (e.key === 'l' || e.key === 'L') {
        this.loadSavedState();
      }
    });

    // Listen for camera changes from OrbitControls
    const controls = this.renderer.getControls();
    controls.addEventListener('end', () => {
      // Save camera position after user interaction ends
      this.saveCurrentStateDebounced();
    });

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

    // Clear state button
    const clearStateButton = document.getElementById('clear-state');
    clearStateButton?.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all saved state? This action cannot be undone.')) {
        this.clearSavedState();
      }
    });

    // JSON Pose Editor Modal
    this.setupJsonPoseEditor();

    // IK Panel
    this.setupIKPanel();
    
    // Pose Commands
    this.setupPoseCommands();

    // Mouse events for 3D bone control interaction
    this.setupMouseEventListeners();

    // Collapsible panels
    this.setupCollapsiblePanels();

    // Set up GLTF controls event listener
    window.addEventListener('gltfControlsReady', (event: Event) => {
      console.log('🎮 GLTF bone controls are ready');
      const customEvent = event as CustomEvent;
      this.setupBoneControlInteraction(customEvent.detail.controls);
      
      // Make sure bone controls are visible initially
      const boneController = this.renderer.getBoneController();
      if (boneController) {
        console.log('🔧 Setting up initial bone control visibility');
        this.renderer.boneControlMode = true;
        this.renderer.updateBoneController();
        
        // Apply saved bone depth limit if available
        this.applySavedBoneDepthLimit();
      }
      
      // Capture the default pose when model is first loaded
      setTimeout(() => {
        const currentBoneRotations = this.renderer.getBoneRotations();
        if (Object.keys(currentBoneRotations).length > 0) {
          // Clone the rotations to store as default pose
          const defaultRotations: Record<string, THREE.Euler> = {};
          Object.entries(currentBoneRotations).forEach(([boneName, euler]) => {
            defaultRotations[boneName] = euler.clone();
          });
          this.defaultPose = defaultRotations;
          console.log('💾 Default pose captured:', Object.keys(defaultRotations).length, 'bones');
        }
      }, 100);
      
      // Update IK chains list when model is loaded
      this.updateIKChainsList();
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
      if (e.key === 'Alt') {
        this.altPressed = true;
        this.enterInteractiveIKMode();
      }
      
      if (e.key === 'Escape') {
        this.clearSelection();
        return;
      }
      
      // Update movement mode based on modifier keys (only when not in IK mode)
      if (!this.interactiveIKMode) {
        const previousMode = movementMode;
        if (shiftPressed && ctrlPressed) {
          movementMode = 'yz';
        } else if (shiftPressed) {
          movementMode = 'xz';
        } else if (ctrlPressed) {
          movementMode = 'xy';
        } else {
          movementMode = 'camera-relative';
        }
        
        // Update hints whenever mode changes, even when not dragging
        if (movementMode !== previousMode) {
          this.updateRotationHints(movementMode);
          this.renderer.setMovementPlane(movementMode);
          
          // Show temporary plane indicator when switching modes (but not dragging)
          if (!this.isDragging && movementMode !== 'camera-relative') {
            this.showTemporaryModeIndicator(movementMode);
          }
        }
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') shiftPressed = false;
      if (e.key === 'Control') ctrlPressed = false;
      if (e.key === 'Alt') {
        this.altPressed = false;
        this.exitInteractiveIKMode();
      }
      
      // Update movement mode (only when not in IK mode)
      if (!this.interactiveIKMode) {
        const previousMode = movementMode;
        if (shiftPressed && ctrlPressed) {
          movementMode = 'yz';
        } else if (shiftPressed) {
          movementMode = 'xz';
        } else if (ctrlPressed) {
          movementMode = 'xy';
        } else {
          movementMode = 'camera-relative';
        }
        
        // Update hints whenever mode changes
        if (movementMode !== previousMode) {
          this.updateRotationHints(movementMode);
          this.renderer.setMovementPlane(movementMode);
          
          // Hide temporary indicator when returning to camera-relative mode
          if (!this.isDragging && movementMode === 'camera-relative') {
            this.hideTemporaryModeIndicator();
          }
        }
      }
    });

    this.canvasContainer.addEventListener('mousedown', (e) => {
      mouseDownPos = { x: e.clientX, y: e.clientY };
      
      console.log(`🖱️ Mouse down at: ${e.clientX}, ${e.clientY}`);
      console.log(`🖱️ IK Mode: ${this.interactiveIKMode}, Bone control mode: ${this.renderer.boneControlMode}`);
      
      // Check for IK control interaction first
      if (this.interactiveIKMode) {
        const ikControlResult = this.renderer.raycastIKControls(e.clientX, e.clientY);
        
        if (ikControlResult) {
          console.log(`🎯 Selected IK target: ${ikControlResult.targetName}`);
          
          // Save state for undo before starting IK drag
          this.dragStartState = this.getCurrentState();
          
          this.isDragging = true;
          this.ikDragTarget = {
            targetName: ikControlResult.targetName,
            control: ikControlResult.control,
            originalPosition: ikControlResult.control.position.clone()
          };
          
          // Disable orbit controls while dragging
          this.renderer.getControls().enabled = false;
          e.preventDefault();
          e.stopPropagation();
          
          // Show IK indicator
          this.showIKModeIndicator(ikControlResult.targetName);
          
          return;
        }
      } else {
        // Regular bone control interaction
        const boneControlResult = this.renderer.raycastBoneControls(e.clientX, e.clientY);
        
        if (boneControlResult) {
          console.log(`🎯 Selected bone: ${boneControlResult.bone.name}`);
          // Also select the joint so detail box shows and updates
          this.selectJoint(boneControlResult.bone);
          
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
      }
    });

    this.canvasContainer.addEventListener('click', (e) => {
      if (!this.isDragging) {
        // Check if we're in IK mode first
        if (this.ikMode && this.activeIKChain) {
          const worldPos = this.worldPositionFromMouse(e.clientX, e.clientY);
          this.handleIKClick(worldPos);
          return;
        }

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
      if (this.isDragging) {
        const deltaX = e.clientX - mouseDownPos.x;
        const deltaY = e.clientY - mouseDownPos.y;
        
        if (this.ikDragTarget) {
          // Handle IK dragging
          console.log(`🦾 IK dragging: ${this.ikDragTarget.targetName}`);
          
          // Convert mouse movement to world position
          const worldPos = this.worldPositionFromMouse(e.clientX, e.clientY);
          
          // Solve IK to move the specific joint to the new position
          const boneController = this.renderer.getBoneController();
          if (boneController) {
            const success = boneController.solveIKForJoint(this.ikDragTarget.targetName, worldPos);
            if (success) {
              // Update the visual IK target position
              this.ikDragTarget.control.position.copy(worldPos);
              
              // Update bone controller to refresh positions
              this.renderer.updateBoneController();
              
              // Force update of bone control positions after IK solve
              setTimeout(() => {
                boneController.update();
              }, 10);
            }
          }
          
        } else if (this.dragTarget) {
          // Handle regular bone rotation dragging
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
          
          // Update joint detail box in real-time if the selected joint is being dragged
          if (this.selectedJoint && this.dragTarget && this.dragTarget.bone.name === this.selectedJoint) {
            // Compute world position
            const worldPosition = new THREE.Vector3();
            this.dragTarget.bone.getWorldPosition(worldPosition);
            // Compute rotation in degrees
            const rotation = {
              x: this.dragTarget.bone.rotation.x * 180 / Math.PI,
              y: this.dragTarget.bone.rotation.y * 180 / Math.PI,
              z: this.dragTarget.bone.rotation.z * 180 / Math.PI,
            };
            this.jointDetailBox.show(this.dragTarget.bone.name, worldPosition, rotation, true);
          }
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
        if (this.dragStartState) {
          if (this.ikDragTarget) {
            // Save IK action
            const targetName = this.ikDragTarget.targetName;
            console.log(`=== SAVING IK MOVEMENT ===`);
            console.log(`Target: ${targetName}`);
            
            this.saveAction('ik-solve', `IK Solve: ${targetName}`, this.dragStartState);
            console.log(`=== END IK MOVEMENT SAVE ===`);
          } else if (this.dragTarget) {
            // Save bone rotation action
            const boneName = this.dragTarget.bone.name || 'Unknown Bone';
            console.log(`=== SAVING BONE MOVEMENT ===`);
            console.log(`Bone: ${boneName}`);
            
            this.saveAction('bone-move', `Moved ${boneName}`, this.dragStartState);
            console.log(`=== END BONE MOVEMENT SAVE ===`);
          }
          
          // Save the current state after movement
          this.saveCurrentStateDebounced();
        }
      }
      this.isDragging = false;
      this.dragTarget = null;
      this.ikDragTarget = null;
      this.dragStartState = null;
      this.hidePlaneIndicator();
      this.hideIKModeIndicator();
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
      this.saveCurrentStateDebounced();
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
          this.saveCurrentStateImmediate();
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
      this.saveCurrentStateDebounced();
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
      this.saveCurrentStateDebounced();
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
      this.saveCurrentStateDebounced();
    });

    showGltfModelCheckbox?.addEventListener('change', () => {
      this.renderer.setGLTFVisible(showGltfModelCheckbox.checked);
      
      // Update current model settings
      this.currentModelSettings = this.renderer.getGLTFSettings();
      
      // Save state after UI change
      this.saveCurrentStateDebounced();
    });
  }

  private setupCollapsiblePanels(): void {
    const panels = [
      { toggle: 'settings-toggle', container: 'settings-content' },
      { toggle: 'ik-toggle', container: 'ik-content' },
      { toggle: 'undo-redo-toggle', container: 'undo-redo-content' }
    ];

    panels.forEach(panel => {
      const toggle = document.getElementById(panel.toggle);
      const container = document.getElementById(panel.container);

      toggle?.addEventListener('click', () => {
        container?.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
        
        // Save state when panel state changes
        this.saveCurrentStateDebounced();
      });
    });
  }

  private setupUI(): void {
    this.updateUndoRedoUI();
    this.initializeSelectionPanel();
  }

  private initializeSelectionPanel(): void {
    // Set up reset joint button
    document.getElementById('reset-joint-btn-compact')?.addEventListener('click', () => {
      this.resetSelectedJoint();
    });
  }

  private async loadDefaultModel(): Promise<void> {
    const defaultModelPath = '/robot.glb';
    
    try {
      console.log('🎭 Loading default GLB model...');
      await this.loadModelFromPath(defaultModelPath);
      
      // Focus the camera on the loaded model
      console.log('📷 Focusing camera on loaded GLB model...');
      this.renderer.focusOnGLTFModel();
      
      console.log('✅ Default GLB model loaded successfully');
      this.showMessage('Default character model loaded automatically', 'success');
      
      // Save the state after loading the default model
      this.saveCurrentStateImmediate();
      
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
    // Update joint detail box
    const worldPosition = new THREE.Vector3();
    bone.getWorldPosition(worldPosition);
    const rotation = {
      x: bone.rotation.x * 180 / Math.PI,
      y: bone.rotation.y * 180 / Math.PI,
      z: bone.rotation.z * 180 / Math.PI
    };
    this.jointDetailBox.show(bone.name, worldPosition, rotation, true);
    this.renderer.highlightBoneControl(bone.name);
    
    // Make rotation hints more prominent when a joint is selected
    const rotationHints = document.querySelector('.rotation-hints') as HTMLElement;
    if (rotationHints) {
      rotationHints.style.background = 'rgba(74, 222, 128, 0.1)';
      rotationHints.style.borderRadius = '4px';
      rotationHints.style.padding = '6px';
      rotationHints.style.border = '1px solid rgba(74, 222, 128, 0.3)';
    }
    
    // Save the current state with the selected joint
    this.saveCurrentStateDebounced();
  }

  private clearSelection(): void {
    console.log('🔄 Clearing selection');
    this.selectedJoint = null;
    this.jointDetailBox.hide();
    this.renderer.highlightBoneControl(null);
    
    // Reset rotation hints styling when nothing is selected
    const rotationHints = document.querySelector('.rotation-hints') as HTMLElement;
    if (rotationHints) {
      rotationHints.style.background = '';
      rotationHints.style.borderRadius = '';
      rotationHints.style.padding = '';
      rotationHints.style.border = '';
    }
    
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
        
        // Update the joint detail box
        const worldPosition = new THREE.Vector3();
        bone.getWorldPosition(worldPosition);
        const rotation = {
          x: bone.rotation.x * 180 / Math.PI,
          y: bone.rotation.y * 180 / Math.PI,
          z: bone.rotation.z * 180 / Math.PI
        };
        this.jointDetailBox.show(bone.name, worldPosition, rotation, true);
        
        this.showMessage(`Reset ${this.selectedJoint} joint`, 'info');
        
        // Save the current state after reset
        this.saveCurrentStateImmediate();
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
      modelSettings: this.currentModelSettings,
      boneDepthLimit: this.renderer.getBoneDepthLimit()
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
    this.saveCurrentStateDebounced();
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
      indicator.classList.add('active');
      
      let modeText = '';
      switch (movementMode) {
        case 'camera-relative':
          modeText = '🎥 Camera-Relative Rotation';
          break;
        case 'xy':
          modeText = '🔒 XY Plane Lock (Ctrl)';
          break;
        case 'xz':
          modeText = '🔒 XZ Plane Lock (Shift)';
          break;
        case 'yz':
          modeText = '🔒 YZ Plane Lock (Shift+Ctrl)';
          break;
      }
      indicator.textContent = modeText;
    }
    
    // Update rotation hints to highlight current mode
    this.updateRotationHints(movementMode);
  }

  private hidePlaneIndicator(): void {
    const indicator = document.getElementById('plane-indicator');
    if (indicator) {
      indicator.style.display = 'none';
      indicator.classList.remove('active');
    }
    
    // Reset rotation hints to default state
    this.updateRotationHints('camera-relative');
  }

  private updateRotationHints(movementMode: string): void {
    // Clear all current mode classes
    const hints = document.querySelectorAll('.rotation-mode-hint');
    hints.forEach(hint => hint.classList.remove('current-mode'));
    
    // Highlight the current mode
    let currentModeId = '';
    switch (movementMode) {
      case 'camera-relative':
        currentModeId = 'rotation-mode-none';
        break;
      case 'xz':
        currentModeId = 'rotation-mode-shift';
        break;
      case 'xy':
        currentModeId = 'rotation-mode-ctrl';
        break;
      case 'yz':
        currentModeId = 'rotation-mode-shift-ctrl';
        break;
    }
    
    const currentHint = document.getElementById(currentModeId);
    if (currentHint) {
      currentHint.classList.add('current-mode');
    }
  }

  private showTemporaryModeIndicator(movementMode: string): void {
    const indicator = document.getElementById('plane-indicator');
    if (indicator) {
      indicator.style.display = 'block';
      indicator.classList.add('active');
      
      let modeText = '';
      switch (movementMode) {
        case 'xy':
          modeText = '🔒 XY Plane Ready (Ctrl)';
          break;
        case 'xz':
          modeText = '🔒 XZ Plane Ready (Shift)';
          break;
        case 'yz':
          modeText = '🔒 YZ Plane Ready (Shift+Ctrl)';
          break;
      }
      indicator.textContent = modeText;
      
      // Auto-hide after 2 seconds if not dragging
      setTimeout(() => {
        if (!this.isDragging && movementMode !== 'camera-relative') {
          this.hideTemporaryModeIndicator();
        }
      }, 2000);
    }
  }

  private hideTemporaryModeIndicator(): void {
    const indicator = document.getElementById('plane-indicator');
    if (indicator && !this.isDragging) {
      indicator.style.display = 'none';
      indicator.classList.remove('active');
    }
  }

  private enterInteractiveIKMode(): void {
    console.log('🦾 Entering Interactive IK Mode');
    this.interactiveIKMode = true;
    
    // Ensure IK chains are set up
    const boneController = this.renderer.getBoneController();
    if (boneController) {
      // Check if IK chains exist, if not create them
      const chainNames = boneController.getIKChainNames();
      console.log('🔍 Existing IK chains:', chainNames);
      
      if (chainNames.length === 0) {
        console.log('📝 No IK chains found, creating default chains...');
        this.setupIKChains();
        
        // Check again after setup
        const newChainNames = boneController.getIKChainNames();
        console.log('🔍 After setup, IK chains:', newChainNames);
      } else {
        console.log('✅ IK chains already exist, using existing ones');
      }
    } else {
      console.error('❌ No bone controller found!');
      return;
    }
    
    // Hide regular bone controls and show IK controls
    this.renderer.setIKMode(true);
    
    // Update UI to show IK mode
    this.showIKModeUI();
    
    // Update rotation hints to show IK mode
    this.updateRotationHintsForIK();
  }

  private exitInteractiveIKMode(): void {
    console.log('🔄 Exiting Interactive IK Mode');
    this.interactiveIKMode = false;
    this.altPressed = false; // Make sure we reset the alt pressed state
    
    // Show regular bone controls and hide IK controls
    this.renderer.setIKMode(false);
    
    // Reset UI
    this.hideIKModeUI();
    
    // Reset rotation hints
    this.updateRotationHints('camera-relative');
  }

  private showIKModeUI(): void {
    // Update the controls overlay to show IK mode
    const controlsOverlay = document.querySelector('.controls-overlay') as HTMLElement;
    if (controlsOverlay) {
      controlsOverlay.style.background = 'rgba(138, 43, 226, 0.8)'; // Purple background for IK mode
      controlsOverlay.style.border = '2px solid rgba(138, 43, 226, 0.6)';
    }
    
    // Show IK mode indicator
    const indicator = document.getElementById('plane-indicator');
    if (indicator) {
      indicator.style.display = 'block';
      indicator.style.background = 'rgba(138, 43, 226, 0.9)';
      indicator.textContent = '🦾 Interactive IK Mode - Drag End Effectors';
      indicator.classList.add('active');
    }
  }

  private hideIKModeUI(): void {
    // Reset controls overlay
    const controlsOverlay = document.querySelector('.controls-overlay') as HTMLElement;
    if (controlsOverlay) {
      controlsOverlay.style.background = 'rgba(0,0,0,0.7)';
      controlsOverlay.style.border = '';
      controlsOverlay.classList.remove('ik-mode');
    }
    
    // Restore original rotation hints structure
    const rotationHints = document.querySelector('.rotation-hints') as HTMLElement;
    if (rotationHints) {
      rotationHints.innerHTML = `
        <small><strong>Joint Rotation:</strong></small><br>
        <small id="rotation-mode-none" class="rotation-mode-hint">
          <span class="mode-key">None</span>: Camera-relative
        </small><br>
        <small id="rotation-mode-shift" class="rotation-mode-hint">
          <span class="mode-key">Shift</span>: XZ Plane Lock
        </small><br>
        <small id="rotation-mode-ctrl" class="rotation-mode-hint">
          <span class="mode-key">Ctrl</span>: XY Plane Lock
        </small><br>
        <small id="rotation-mode-shift-ctrl" class="rotation-mode-hint">
          <span class="mode-key">Shift+Ctrl</span>: YZ Plane Lock
        </small><br>
        <small class="ik-hint">
          <span class="mode-key">Alt</span>: Interactive IK Mode
        </small>
      `;
      rotationHints.style.background = '';
      rotationHints.style.border = '';
    }
  }

  private updateRotationHintsForIK(): void {
    // Clear all current mode classes
    const hints = document.querySelectorAll('.rotation-mode-hint');
    hints.forEach(hint => hint.classList.remove('current-mode'));
    
    // Update the rotation hints container to show IK info
    const rotationHints = document.querySelector('.rotation-hints') as HTMLElement;
    if (rotationHints) {
      rotationHints.innerHTML = `
        <small><strong>🦾 IK Mode Active:</strong></small><br>
        <small class="ik-mode-hint current-mode">
          <span class="mode-key">Alt</span>: Interactive Kinematics
        </small><br>
        <small>Drag end effectors to pose limbs</small><br>
        <small>Release Alt to return to joint mode</small>
      `;
      rotationHints.style.background = 'rgba(138, 43, 226, 0.1)';
      rotationHints.style.border = '1px solid rgba(138, 43, 226, 0.3)';
    }
  }

  private showIKModeIndicator(chainName: string): void {
    const indicator = document.getElementById('plane-indicator');
    if (indicator) {
      indicator.style.display = 'block';
      indicator.style.background = 'rgba(138, 43, 226, 0.9)';
      indicator.textContent = `🦾 Solving IK: ${chainName}`;
      indicator.classList.add('active');
    }
  }

  private hideIKModeIndicator(): void {
    if (this.interactiveIKMode) {
      // Return to general IK mode indicator
      this.showIKModeUI();
    } else {
      const indicator = document.getElementById('plane-indicator');
      if (indicator) {
        indicator.style.display = 'none';
        indicator.classList.remove('active');
      }
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
      
      // Restore default pose
      if (state.defaultPose) {
        const defaultRotations: Record<string, THREE.Euler> = {};
        Object.entries(state.defaultPose).forEach(([name, rotData]: [string, any]) => {
          defaultRotations[name] = new THREE.Euler(rotData.x, rotData.y, rotData.z, rotData.order as THREE.EulerOrder);
        });
        this.defaultPose = defaultRotations;
        console.log('🔄 Default pose restored:', Object.keys(defaultRotations).length, 'bones');
      }
      
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
          console.log('🔄 Clearing problematic model path from state');
          
          // Clear the problematic model path to prevent repeated failures
          this.currentModelPath = null;
          this.currentModelSettings = null;
          
          // Show user-friendly message
          this.showMessage('Saved model could not be loaded. Continuing without it.', 'warning');
          
          // Don't save this broken state - let the app load the default model instead
          console.log('💡 Will load default model instead');
        }
      }
      
      // Restore camera position
      if (state.cameraPosition && state.cameraTarget) {
        const camera = this.renderer.getCamera();
        const controls = this.renderer.getControls();
        
        camera.position.set(state.cameraPosition.x, state.cameraPosition.y, state.cameraPosition.z);
        controls.target.set(state.cameraTarget.x, state.cameraTarget.y, state.cameraTarget.z);
        controls.update();
        console.log('📷 Camera position restored');
      }
      
      // Restore scene settings
      if (state.sceneSettings) {
        console.log('🎨 Restoring scene settings:', state.sceneSettings);
        this.renderer.updateSettings(state.sceneSettings);
        
        // Update UI to reflect scene settings
        const gridVisibleCheckbox = document.getElementById('grid-visible') as HTMLInputElement;
        if (gridVisibleCheckbox && state.sceneSettings.gridVisible !== undefined) {
          gridVisibleCheckbox.checked = state.sceneSettings.gridVisible;
        }
      }
      
      // Restore panel states
      if (state.panelStates) {
        console.log('📂 Restoring panel states:', state.panelStates);
        
        // Settings panel
        const settingsContent = document.getElementById('settings-content');
        const settingsToggle = document.getElementById('settings-toggle');
        if (settingsContent && settingsToggle) {
          if (state.panelStates.settingsExpanded) {
            settingsContent.classList.remove('collapsed');
            settingsToggle.classList.remove('collapsed');
          } else {
            settingsContent.classList.add('collapsed');
            settingsToggle.classList.add('collapsed');
          }
        }
        
        // IK panel
        const ikContent = document.getElementById('ik-content');
        const ikToggle = document.getElementById('ik-toggle');
        if (ikContent && ikToggle) {
          if (state.panelStates.ikExpanded) {
            ikContent.classList.remove('collapsed');
            ikToggle.classList.remove('collapsed');
          } else {
            ikContent.classList.add('collapsed');
            ikToggle.classList.add('collapsed');
          }
        }
        
        // Undo/Redo panel
        const undoRedoContent = document.getElementById('undo-redo-content');
        const undoRedoToggle = document.getElementById('undo-redo-toggle');
        if (undoRedoContent && undoRedoToggle) {
          if (state.panelStates.undoRedoExpanded) {
            undoRedoContent.classList.remove('collapsed');
            undoRedoToggle.classList.remove('collapsed');
          } else {
            undoRedoContent.classList.add('collapsed');
            undoRedoToggle.classList.add('collapsed');
          }
        }
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
    console.log('💾 === ACTUALLY SAVING STATE NOW ===');
    
    try {
      const camera = this.renderer.getCamera();
      const controls = this.renderer.getControls();
      
      // Get current scene settings
      const sceneSettings = this.renderer.getSettings();
      
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
      
      // Get current UI panel states
      const panelStates = {
        settingsExpanded: !document.getElementById('settings-content')?.classList.contains('collapsed'),
        ikExpanded: !document.getElementById('ik-content')?.classList.contains('collapsed'),
        undoRedoExpanded: !document.getElementById('undo-redo-content')?.classList.contains('collapsed')
      };
      
      console.log('💾 Saving bone rotations:', Object.keys(serializedBoneRotations).length, 'bones');
      console.log('💾 Saving scene settings:', sceneSettings);
      console.log('💾 Saving panel states:', panelStates);
      
      // Complete state object
      const state = {
        timestamp: Date.now(),
        modelPath: this.currentModelPath,
        modelSettings: this.currentModelSettings,
        sceneSettings: sceneSettings,
        boneRotations: serializedBoneRotations,
        defaultPose: this.defaultPose ? Object.fromEntries(
          Object.entries(this.defaultPose).map(([name, euler]) => [
            name,
            { x: euler.x, y: euler.y, z: euler.z, order: euler.order }
          ])
        ) : null,
        selectedJoint: this.selectedJoint,
        boneDepthLimit: this.renderer.getBoneDepthLimit(),
        cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        cameraTarget: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
        panelStates: panelStates
      };
      
      // Save directly to localStorage
      localStorage.setItem('poser3d-simple-state', JSON.stringify(state));
      console.log('✅ State saved to localStorage at', new Date().toLocaleTimeString());
      
    } catch (error) {
      console.error('❌ Error saving state:', error);
    }
  }

  private saveCurrentStateDebounced(): void {
    console.log('⏰ Debounced save triggered - scheduling save in', this.SAVE_DEBOUNCE_DELAY, 'ms');
    
    // Clear existing timeout
    if (this.saveStateTimeout) {
      console.log('⏰ Clearing existing save timeout');
      clearTimeout(this.saveStateTimeout);
    }
    
    // Set new timeout
    this.saveStateTimeout = window.setTimeout(() => {
      console.log('⏰ Debounced save timeout expired - saving now');
      this.saveCurrentState();
      this.saveStateTimeout = null;
    }, this.SAVE_DEBOUNCE_DELAY);
  }

  private saveCurrentStateImmediate(): void {
    console.log('🚀 Immediate save triggered');
    
    // Clear any pending debounced save
    if (this.saveStateTimeout) {
      clearTimeout(this.saveStateTimeout);
      this.saveStateTimeout = null;
    }
    
    // Save immediately
    this.saveCurrentState();
  }

  private setupAutoSave(): void {
    // Save state when page is about to unload
    window.addEventListener('beforeunload', () => {
      this.saveCurrentStateImmediate();
    });
    
    // Don't mark state as dirty automatically - we'll handle our own debounced saving
    // this.stateManager.markDirty();
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
          this.saveCurrentStateImmediate();
          
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
        this.saveCurrentStateImmediate();
        
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

  private setupJsonPoseEditor(): void {
    const jsonPoseButton = document.getElementById('json-pose-editor');
    const modal = document.getElementById('json-pose-modal');
    const closeBtn = document.getElementById('close-json-modal');
    const cancelBtn = document.getElementById('cancel-json-modal');
    const exportCurrentBtn = document.getElementById('export-current-pose');
    const importFromJsonBtn = document.getElementById('import-from-json');
    const saveBtn = document.getElementById('save-json-pose');
    const textarea = document.getElementById('json-pose-textarea') as HTMLTextAreaElement;

    // Open modal
    jsonPoseButton?.addEventListener('click', () => {
      if (modal) {
        modal.style.display = 'flex';
        this.populateJsonTextarea();
      }
    });

    // Close modal
    const closeModal = () => {
      if (modal) {
        modal.style.display = 'none';
      }
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    // Close modal when clicking outside
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // Export current pose
    exportCurrentBtn?.addEventListener('click', () => {
      this.populateJsonTextarea();
    });

    // Import from JSON
    importFromJsonBtn?.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const jsonString = event.target?.result as string;
            if (textarea) {
              textarea.value = jsonString;
            }
          };
          reader.readAsText(file);
        }
      };
      fileInput.click();
    });

    // Save pose
    saveBtn?.addEventListener('click', () => {
      if (textarea) {
        try {
          const jsonData = JSON.parse(textarea.value);
          this.importPoseFromJson(jsonData);
          closeModal();
          this.showMessage('Pose imported successfully!', 'success');
        } catch (error) {
          this.showMessage('Invalid JSON format', 'error');
          console.error('JSON parse error:', error);
        }
      }
    });

    // Handle Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal?.style.display === 'flex') {
        closeModal();
      }
    });
  }

  private populateJsonTextarea(): void {
    const textarea = document.getElementById('json-pose-textarea') as HTMLTextAreaElement;
    if (textarea) {
      const poseData = this.exportPoseAsJson();
      textarea.value = JSON.stringify(poseData, null, 2);
    }
  }

  private setupIKPanel(): void {
    const setupBtn = document.getElementById('setup-ik-chains');
    const clearBtn = document.getElementById('clear-ik-chains');
    const testBtn = document.getElementById('test-ik');
    
    setupBtn?.addEventListener('click', () => {
      this.setupIKChains();
    });
    
    clearBtn?.addEventListener('click', () => {
      this.clearIKChains();
    });

    testBtn?.addEventListener('click', () => {
      this.testIK();
    });
  }

  private setupPoseCommands(): void {
    const resetToDefaultBtn = document.getElementById('reset-to-default-pose');
    
    resetToDefaultBtn?.addEventListener('click', () => {
      this.resetToDefaultPose();
    });
  }

  private setupIKChains(): void {
    const boneController = this.renderer.getBoneController();
    if (!boneController) {
      this.showMessage('No model loaded', 'error');
      return;
    }

    boneController.createCommonIKChains();
    this.updateIKChainsList();
    this.showMessage('IK chains created!', 'success');
  }

  private clearIKChains(): void {
    const boneController = this.renderer.getBoneController();
    if (boneController) {
      boneController.clearIKChains();
      this.updateIKChainsList();
      this.showMessage('IK chains cleared', 'info');
    }
  }

  private testIK(): void {
    const boneController = this.renderer.getBoneController();
    if (!boneController) {
      this.showMessage('No model loaded', 'error');
      return;
    }

    const chainNames = boneController.getIKChainNames();
    if (chainNames.length === 0) {
      this.showMessage('No IK chains found. Click "Setup IK Chains" first.', 'error');
      return;
    }

    // Test with the first available chain (usually leftArm)
    const testChain = chainNames[0];
    
    // Create a target position in front of the model
    const targetPos = new THREE.Vector3(1, 1, 1);
    
    const success = boneController.solveIK(testChain, targetPos);
    if (success) {
      this.showMessage(`IK test successful for ${testChain}!`, 'success');
    } else {
      this.showMessage(`IK test failed for ${testChain}`, 'error');
    }
  }

  private updateIKChainsList(): void {
    const chainsList = document.getElementById('ik-chains-list');
    if (!chainsList) return;

    const boneController = this.renderer.getBoneController();
    if (!boneController) {
      chainsList.innerHTML = '<p class="no-chains">No model loaded</p>';
      return;
    }

    const chainNames = boneController.getIKChainNames();
    
    if (chainNames.length === 0) {
      chainsList.innerHTML = '<p class="no-chains">No IK chains created yet</p>';
      return;
    }

    // Get the bones for each chain
    const chainData = chainNames.map((chainName: string) => {
      const bones = boneController.getIKChainBones(chainName);
      return { chainName, bones };
    });

    chainsList.innerHTML = chainData.map(({ chainName, bones }: {chainName: string, bones: string[]}) => `
      <div class="ik-chain-item">
        <div class="ik-chain-header" onclick="toggleIKChainDetails('${chainName}')">
          <span class="ik-chain-name">${chainName}</span>
          <span class="ik-chain-toggle" id="toggle-${chainName}">▼</span>
        </div>
        <div class="ik-chain-details" id="details-${chainName}" style="display: none;">
          <div class="ik-chain-bones">
            <strong>Bones (${bones.length}):</strong>
            <ul class="bone-list">
              ${bones.map((bone: string) => `<li class="bone-item">${bone}</li>`).join('')}
            </ul>
          </div>
          <div class="ik-chain-controls">
            <button class="ik-chain-btn target" data-chain="${chainName}" title="Toggle target visibility">👁️ Target</button>
            <button class="ik-chain-btn solve" data-chain="${chainName}" title="Test solve">🎯 Test</button>
          </div>
        </div>
      </div>
    `).join('');

    // Add event listeners for chain controls
    chainsList.querySelectorAll('.ik-chain-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const button = e.target as HTMLButtonElement;
        const chainName = button.getAttribute('data-chain');
        if (!chainName) return;

        if (button.classList.contains('target')) {
          this.toggleIKTarget(chainName);
        } else if (button.classList.contains('solve')) {
          this.activateIKSolving(chainName);
        }
      });
    });

    // Add the toggle function to the global scope so onclick can access it
    (window as any).toggleIKChainDetails = (chainName: string) => {
      const details = document.getElementById(`details-${chainName}`);
      const toggle = document.getElementById(`toggle-${chainName}`);
      
      if (details && toggle) {
        const isHidden = details.style.display === 'none';
        details.style.display = isHidden ? 'block' : 'none';
        toggle.textContent = isHidden ? '▲' : '▼';
      }
    };
  }

  private toggleIKTarget(chainName: string): void {
    const boneController = this.renderer.getBoneController();
    if (!boneController) return;

    // Toggle target visibility (this would need to be implemented in the bone controller)
    // For now, just show a message
    this.showMessage(`Toggle target for ${chainName}`, 'info');
  }

  private activateIKSolving(chainName: string): void {
    this.activeIKChain = chainName;
    this.ikMode = true;
    this.showMessage(`Click in 3D space to solve IK for ${chainName}`, 'info');
    
    // Change cursor to indicate IK mode
    this.canvasContainer.style.cursor = 'crosshair';
  }

  private handleIKClick(worldPosition: THREE.Vector3): void {
    if (!this.ikMode || !this.activeIKChain) return;

    const boneController = this.renderer.getBoneController();
    if (!boneController) return;

    const success = boneController.solveIK(this.activeIKChain, worldPosition);
    if (success) {
      this.showMessage(`IK solved for ${this.activeIKChain}!`, 'success');
      // Add to undo history
      const currentState = this.renderer.getBoneRotations();
      this.undoRedoManager.saveState(
        'ik-solve',
        `IK solved for ${this.activeIKChain}`,
        {}, // We don't have the before state here
        { boneRotations: currentState }
      );
    } else {
      this.showMessage(`IK solution failed for ${this.activeIKChain}`, 'error');
    }

    // Exit IK mode
    this.ikMode = false;
    this.activeIKChain = null;
    this.canvasContainer.style.cursor = 'default';
  }

  private worldPositionFromMouse(mouseX: number, mouseY: number): THREE.Vector3 {
    // Convert mouse coordinates to world position using camera-relative projection
    const rect = this.canvasContainer.getBoundingClientRect();
    const x = ((mouseX - rect.left) / rect.width) * 2 - 1;
    const y = -((mouseY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(x, y);
    raycaster.setFromCamera(mouse, this.renderer.getCamera());

    // If we have an IK drag target, use its current position to define the projection plane
    if (this.ikDragTarget) {
      const currentTargetPos = this.ikDragTarget.control.position.clone();
      const camera = this.renderer.getCamera();
      
      // Create a plane perpendicular to the camera direction passing through the target
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);
      const plane = new THREE.Plane(cameraDirection, -cameraDirection.dot(currentTargetPos));
      
      const intersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        return intersection;
      }
    }

    // Fallback: cast against a plane at a reasonable distance from camera
    const camera = this.renderer.getCamera();
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    // Use a plane 5 units away from camera in the direction it's looking
    const planePoint = camera.position.clone().add(cameraDirection.multiplyScalar(5));
    const plane = new THREE.Plane(cameraDirection, -cameraDirection.dot(planePoint));
    
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersection)) {
      return intersection;
    }
    
    // Final fallback: use a point along the ray
    return raycaster.ray.origin.clone().add(raycaster.ray.direction.multiplyScalar(5));
  }

  private exportPoseAsJson(): any {
    const boneRotations = this.renderer.getBoneRotations();
    const modelSettings = this.renderer.getGLTFSettings();
    
    return {
      timestamp: new Date().toISOString(),
      modelPath: this.currentModelPath,
      modelSettings: modelSettings,
      boneRotations: Object.fromEntries(
        Object.entries(boneRotations).map(([name, euler]) => [
          name,
          {
            x: euler.x,
            y: euler.y,
            z: euler.z,
            order: euler.order
          }
        ])
      ),
      metadata: {
        appVersion: '1.0.0',
        boneCount: Object.keys(boneRotations).length,
        description: 'Exported from 3D Character Poser'
      }
    };
  }

  private importPoseFromJson(jsonData: any): void {
    try {
      // Import model if different
      if (jsonData.modelPath && jsonData.modelPath !== this.currentModelPath) {
        this.loadModelFromPath(jsonData.modelPath, true);
      }

      // Import model settings
      if (jsonData.modelSettings) {
        this.renderer.updateGLTFSettings(jsonData.modelSettings);
        this.currentModelSettings = jsonData.modelSettings;
      }

      // Import bone rotations
      if (jsonData.boneRotations) {
        const rotations: Record<string, THREE.Euler> = {};
        Object.entries(jsonData.boneRotations).forEach(([name, rotData]: [string, any]) => {
          rotations[name] = new THREE.Euler(
            rotData.x,
            rotData.y,
            rotData.z,
            rotData.order
          );
        });
        this.renderer.setBoneRotations(rotations);
      }

      // Save the current state
      this.saveCurrentStateImmediate();

      console.log('✅ Pose imported successfully from JSON');
    } catch (error) {
      console.error('❌ Error importing pose from JSON:', error);
      throw error;
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
    
    // Test scene settings
    try {
      const sceneSettings = this.renderer.getSettings();
      console.log('🎨 Current scene settings:', sceneSettings);
    } catch (error) {
      console.error('❌ Error getting scene settings:', error);
    }
    
    // Test UI states
    const panelStates = {
      settingsExpanded: !document.getElementById('settings-content')?.classList.contains('collapsed'),
      ikExpanded: !document.getElementById('ik-content')?.classList.contains('collapsed'),
      undoRedoExpanded: !document.getElementById('undo-redo-content')?.classList.contains('collapsed')
       };
    console.log('📂 Current panel states:', panelStates);
    
    // Test default pose
    console.log('🎭 Default pose available:', this.defaultPose ? Object.keys(this.defaultPose).length + ' bones' : 'None');
  }

  // Debug method to clear saved state
  public clearSavedState(): void {
    localStorage.removeItem('poser3d-simple-state');
    console.log('🗑️ Cleared saved state');
    this.showMessage('Local state cleared successfully', 'success');
  }

  private resetToDefaultPose(): void {
    if (!this.defaultPose) {
      this.showMessage('No default pose available. Load a model first.', 'warning');
      return;
    }

    console.log('🔄 Resetting to default pose');
    
    // Save current state for undo
    const beforeState = this.getCurrentState();
    
    // Apply the default pose
    this.renderer.setBoneRotations(this.defaultPose);
    
    // Save action for undo/redo
    this.saveAction('reset-to-default', 'Reset to Default Pose', beforeState);
    
    // Update selection UI if a joint is selected
    if (this.selectedJoint) {
      const bone = this.renderer.getBoneByName(this.selectedJoint);
      if (bone) {
        this.updateSelectionUI(bone);
      }
    }
    
    this.showMessage('Reset to default pose', 'success');
    
    // Save the current state after reset
    this.saveCurrentStateImmediate();
  }

  private applySavedBoneDepthLimit(): void {
    try {
      const savedState = localStorage.getItem('poser3d-simple-state');
      if (savedState) {
        const state = JSON.parse(savedState);
        if (state.boneDepthLimit !== undefined) {
          console.log('🔍 Applying saved bone depth limit:', state.boneDepthLimit);
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
      }
    } catch (error) {
      console.warn('⚠️ Error applying saved bone depth limit:', error);
    }
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
