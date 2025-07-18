import './style.css';
import { CameraController } from './CameraController';
import { SettingsControls } from './SettingsControls';
import { IKControls } from './IKControls';
import * as THREE from 'three';
import { PoseCommands } from './PoseCommands';
import { ThreeRenderer } from './ThreeRenderer';
import { UndoRedoManager } from './UndoRedoManager';
import { UndoRedoControls } from './UndoRedoControls';
import { JointDetailBox } from './JointDetailBox';
import { Character3D } from './Character3D';
import { ModelManager } from './ModelManager';
import { DebugManager } from './DebugManager';
import { JsonPoseEditor } from './JsonPoseEditor';
import type { GLTFModelSettings } from './types';

class StickFigureApp3D {
  private renderer!: ThreeRenderer;
  private modelManager!: ModelManager;
  private debugManager!: DebugManager;
  private undoRedoManager: UndoRedoManager;
  private undoRedoControls: UndoRedoControls;
  private character: Character3D;
  private isDragging = false;
  private dragTarget: { bone: THREE.Bone; control: THREE.Object3D; originalRotation: THREE.Euler } | null = null;
  private dragStartState: any = null;
  private selectedJoint: string | null = null;
  private ikMode: boolean = false;
  private activeIKChain: string | null = null;
  
  // Interactive IK state
  private interactiveIKMode: boolean = false;
  private ikDragTarget: { targetName: string; control: THREE.Object3D; originalPosition: THREE.Vector3 } | null = null;
  private altPressed: boolean = false;

  // UI Elements
  private canvasContainer: HTMLElement;
  private cameraController: CameraController;
  private jointDetailBox: JointDetailBox;
  private poseCommands: PoseCommands;
  private settingsControls: SettingsControls;
  private ikControls: IKControls;
  
  // Debounced save function to prevent excessive saving
  private saveStateTimeout: number | null = null;
  private readonly SAVE_DEBOUNCE_DELAY = 2000; // 2 seconds

  constructor() {
    this.undoRedoManager = new UndoRedoManager();
    this.character = new Character3D();
    
    // Get UI elements
    this.canvasContainer = document.getElementById('three-canvas')!;
    // Remove old camera-controls div if present
    const oldControls = document.getElementById('camera-controls');
    if (oldControls && oldControls.parentNode) {
      oldControls.parentNode.removeChild(oldControls);
    }
    this.cameraController = new CameraController();
    this.jointDetailBox = new JointDetailBox();
    this.poseCommands = new PoseCommands();
    this.settingsControls = new SettingsControls();
    this.ikControls = new IKControls();
    this.undoRedoControls = new UndoRedoControls(this.undoRedoManager);
    const container = document.querySelector('.container');
    const canvasContainer = container?.querySelector('.canvas-container');
    if (container && canvasContainer) {
      canvasContainer.insertAdjacentElement('afterend', this.jointDetailBox.rootElement);
      container.insertBefore(this.cameraController.rootElement, container.querySelector('.main-content'));
      // Insert pose commands below canvas
      canvasContainer.insertAdjacentElement('afterend', this.poseCommands.rootElement);
      // Insert settings controls into settings panel
      const settingsContent = document.getElementById('settings-content');
      if (settingsContent) {
        settingsContent.innerHTML = '';
        settingsContent.appendChild(this.settingsControls.rootElement);
      }
      // Insert IK controls into IK panel
      const ikContent = document.getElementById('ik-content');
      if (ikContent) {
        ikContent.innerHTML = '';
        ikContent.appendChild(this.ikControls.rootElement);
        this.ikControls.rootElement.addEventListener('setup-ik-chains', () => this.setupIKChains());
        this.ikControls.rootElement.addEventListener('clear-ik-chains', () => this.clearIKChains());
        this.ikControls.rootElement.addEventListener('test-ik', () => this.testIK());
        this.ikControls.rootElement.addEventListener('toggle-ik-target', (e: Event) => {
          const chain = (e as CustomEvent<string>).detail;
          this.toggleIKTarget(chain);
        });
        this.ikControls.rootElement.addEventListener('activate-ik-solving', (e: Event) => {
          const chain = (e as CustomEvent<string>).detail;
          this.activateIKSolving(chain);
        });
      }
      // Insert UndoRedo controls into undo-redo panel
      const undoRedoContent = document.getElementById('undo-redo-content');
      if (undoRedoContent) {
        undoRedoContent.innerHTML = '';
        undoRedoContent.appendChild(this.undoRedoControls.rootElement);
        this.undoRedoControls.rootElement.addEventListener('undo-requested', () => this.undo());
        this.undoRedoControls.rootElement.addEventListener('redo-requested', () => this.redo());
      }
      // Listen for reset-pose events
      this.poseCommands.rootElement.addEventListener('reset-pose', () => this.resetToDefaultPose());
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
    
    // Initialize debug manager and setup debug commands
    this.debugManager = new DebugManager(this);
    this.debugManager.setupDebugCommands();
    
    // Load saved state before auto-loading default model
    this.loadSavedState().then(() => {
      // Auto-load the default GLB model if no saved state or model
      setTimeout(() => {
        if (!this.character.modelPath) {
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
    
    // Initialize ModelManager after renderer is ready
    this.modelManager = new ModelManager(this.renderer);
    this.setupModelManagerEvents();
  }

  private setupModelManagerEvents(): void {
    // Listen for model loading events
    this.modelManager.addEventListener('model-loaded', (e: Event) => {
      const event = e as CustomEvent;
      this.character = event.detail.character;
      this.onModelLoaded();
    });

    this.modelManager.addEventListener('model-load-failed', (e: Event) => {
      const event = e as CustomEvent;
      this.showMessage(`Model loading failed: ${event.detail.error}`, 'error');
    });

    this.modelManager.addEventListener('loading-started', (e: Event) => {
      const event = e as CustomEvent;
      console.log(`🔄 Loading model: ${event.detail.path}`);
    });
  }

  private onModelLoaded(): void {
    // Centralized post-loading setup
    this.renderer.focusOnGLTFModel();
    this.updateIKChainsList();
    this.updateBoneDepthSlider();
    this.saveCurrentStateImmediate();
    this.showMessage('Model loaded successfully', 'success');
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

    // Other keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 't' || e.key === 'T') {
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

    // Settings controls events
    this.settingsControls.rootElement.addEventListener('toggle-grid', (e) => {
      const visible = (e as CustomEvent<boolean>).detail;
      this.renderer.updateSettings({ gridVisible: visible });
      this.saveCurrentStateDebounced();
    });
    this.settingsControls.rootElement.addEventListener('load-model', async (e) => {
      const file = (e as CustomEvent<File>).detail;
      const url = URL.createObjectURL(file);
      
      const result = await this.modelManager.loadModel(url);
      if (result.success) {
        this.character = result.character;
        this.showMessage(`Loaded 3D model: ${file.name}`, 'success');
        this.saveCurrentStateImmediate();
      } else {
        this.showMessage(`Error loading model: ${result.error}`, 'error');
      }
    });
    this.settingsControls.rootElement.addEventListener('toggle-model-visibility', (e) => {
      const visible = (e as CustomEvent<boolean>).detail;
      this.character.updateSettings({ showModel: visible });
      this.renderer.setGLTFVisible(visible);
      this.saveCurrentStateDebounced();
    });
    this.settingsControls.rootElement.addEventListener('model-opacity-change', (e) => {
      const value = (e as CustomEvent<number>).detail;
      this.character.updateSettings({ modelOpacity: value });
      this.renderer.updateGLTFSettings({ modelOpacity: value });
      this.saveCurrentStateDebounced();
    });
    this.settingsControls.rootElement.addEventListener('model-scale-change', (e) => {
      const value = (e as CustomEvent<number>).detail;
      this.character.updateSettings({ modelScale: value });
      this.renderer.updateGLTFSettings({ modelScale: value });
      this.saveCurrentStateDebounced();
    });
    this.settingsControls.rootElement.addEventListener('bone-depth-limit-change', (e) => {
      const value = (e as CustomEvent<number>).detail;
      this.renderer.setBoneDepthLimit(value);
      this.saveCurrentStateDebounced();
    });

    // Export/Import character state
    const exportButton = document.getElementById('export-character');
    const importButton = document.getElementById('import-character');
    const importFileInput = document.getElementById('import-file') as HTMLInputElement;
    
    exportButton?.addEventListener('click', () => {
      const characterState = JSON.stringify(this.character.exportCharacterState(), null, 2);
      
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
        reader.onload = async (e) => {
          const jsonString = e.target?.result as string;
          try {
            const characterState = JSON.parse(jsonString);
            
            // Check if this includes a model path that needs loading
            if (characterState.modelPath && characterState.modelPath !== this.character.modelPath) {
              const result = await this.modelManager.loadModel(characterState.modelPath);
              if (result.success) {
                this.character = result.character;
                // Apply the character state to the newly loaded character
                const importResult = await this.character.importCharacterState(characterState);
                if (importResult.success) {
                  this.renderer.updateBoneController();
                  this.saveCurrentStateImmediate();
                  this.showMessage('Character state imported successfully', 'success');
                } else {
                  this.showMessage(`Error importing character state: ${importResult.error}`, 'error');
                }
              } else {
                this.showMessage(`Error loading model: ${result.error}`, 'error');
              }
            } else {
              // No model loading needed, just import state
              const importResult = await this.character.importCharacterState(characterState);
              if (importResult.success) {
                this.renderer.updateBoneController();
                this.saveCurrentStateImmediate();
                this.showMessage('Character state imported successfully', 'success');
              } else {
                this.showMessage(`Error importing character state: ${importResult.error}`, 'error');
              }
            }
          } catch (error) {
            this.showMessage(`Error parsing character state: ${error}`, 'error');
          }
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

    // Initialize JSON Pose Editor
    new JsonPoseEditor({
      exportPoseAsJson: () => this.character.exportPose(),
      importPoseFromJson: async (jsonData: any) => {
        const result = await this.character.importPose(jsonData);
        if (result.success) {
          // Update renderer to reflect the imported pose
          this.renderer.updateBoneController();
          // Save the current state after import
          this.saveCurrentStateImmediate();
        } else {
          throw new Error(result.error || 'Unknown import error');
        }
      },
      showMessage: (message: string, type: 'success' | 'error' | 'info' | 'warning') => this.showMessage(message, type)
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
      
      // Set up character with bone controller and GLTF objects
      const boneController = this.renderer.getBoneController();
      const gltfModel = this.renderer.getGLTFModel();
      const skeleton = this.renderer.getGLTFSkeleton();
      const skinnedMesh = this.renderer.getGLTFSkinnedMesh();
      
      if (boneController) {
        this.character.setBoneController(boneController);
      }
      
      if (gltfModel && skeleton && skinnedMesh) {
        this.character.setModel(gltfModel, skeleton, skinnedMesh);
        console.log('🎭 Character model objects set successfully');
      }
      
      console.log('🔧 Setting up initial bone control visibility');
      this.renderer.boneControlMode = true;
      this.renderer.updateBoneController();
      
      // Apply saved bone depth limit if available
      this.applySavedBoneDepthLimit();
      
      // Capture the default pose when model is first loaded
      setTimeout(() => {
        this.character.captureDefaultPose();
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

  // Find a bone by name via the renderer
  private findBoneByName(boneName: string): THREE.Bone | null {
    return this.renderer.getBoneByName(boneName);
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
    try {
      console.log('🎭 Loading default model via ModelManager...');
      const result = await this.modelManager.loadDefaultModel();
      
      if (result.success) {
        this.character = result.character;
        console.log('✅ Default model loaded successfully via ModelManager');
      } else {
        console.warn('⚠️ Could not load default model:', result.error);
        console.log('ℹ️ Continuing without default model - you can load one manually');
      }
    } catch (error) {
      console.warn('⚠️ Error loading default model:', error);
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

  private undo(): void {
    console.log('🔄 Undo requested');
    const beforeState = this.undoRedoManager.undo();
    if (beforeState) {
      console.log(`Undoing bone movement`);
      this.restoreState(beforeState).catch(error => {
        console.warn('⚠️ Error during undo:', error);
      });
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
      this.restoreState(afterState).catch(error => {
        console.warn('⚠️ Error during redo:', error);
      });
      this.showMessage(`Redid bone movement`, 'info');
    } else {
      this.showMessage('Nothing to redo', 'warning');
    }
    this.updateUndoRedoUI();
  }

  private async restoreState(state: any): Promise<void> {
    console.log('🔄 Restoring state', state);
    
    if (state.boneRotations) {
      this.renderer.setBoneRotations(state.boneRotations);
    }
    
    // Restore model if it has changed
    if (state.modelPath && state.modelPath !== this.character.modelPath) {
      const result = await this.modelManager.loadModel(state.modelPath);
      if (result.success) {
        this.character = result.character;
        if (state.modelSettings) {
          this.character.updateSettings(state.modelSettings);
          this.renderer.updateGLTFSettings(state.modelSettings);
        }
      } else {
        console.warn('⚠️ Could not restore model during undo/redo:', result.error);
      }
    }
    
    // Save the current state to keep it in sync
    this.saveCurrentStateDebounced();
  }

  private updateUndoRedoUI(): void {
    this.undoRedoControls.updateUI();
  }

  public showMessage(message: string, type: 'success' | 'error' | 'info' | 'warning'): void {
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
  
  private getCurrentState(): any {
    return {
      timestamp: Date.now(),
      boneRotations: this.renderer.getBoneRotations(),
      modelPath: this.character.modelPath,
      modelSettings: this.character.getSettings(),
      boneDepthLimit: this.renderer.getBoneDepthLimit()
    };
  }

  private saveAction(type: string, description: string, beforeState: any): void {
    const afterState = this.getCurrentState();
    this.undoRedoManager.saveState(type as any, description, beforeState, afterState);
    this.updateUndoRedoUI();
  }

  private updateSelectionUI(bone: THREE.Bone): void {
    const worldPosition = new THREE.Vector3();
    bone.getWorldPosition(worldPosition);
    const rotation = {
      x: bone.rotation.x * 180 / Math.PI,
      y: bone.rotation.y * 180 / Math.PI,
      z: bone.rotation.z * 180 / Math.PI
    };
    this.jointDetailBox.show(bone.name, worldPosition, rotation, true);
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
      
      console.groupCollapsed('📦 Processing Saved State');
      const state = JSON.parse(savedState);
      console.log('📥 Parsed saved state:', state);
      console.groupEnd();
      
      // Restore model path and settings to character
      if (state.modelPath) {
        this.character.modelPath = state.modelPath;
      }
      if (state.modelSettings) {
        this.character.updateSettings(state.modelSettings);
      }
      
      // Restore default pose
      if (state.defaultPose) {
        const defaultRotations: Record<string, THREE.Euler> = {};
        Object.entries(state.defaultPose).forEach(([name, rotData]: [string, any]) => {
          defaultRotations[name] = new THREE.Euler(rotData.x, rotData.y, rotData.z, rotData.order as THREE.EulerOrder);
        });
        this.character.defaultPose = defaultRotations;
        console.log('🔄 Default pose restored:', Object.keys(defaultRotations).length, 'bones');
      }
      
      // Load model if we have one
      if (this.character.modelPath) {
        console.log('🔄 Loading saved model:', this.character.modelPath);
        try {
          const result = await this.modelManager.loadModel(this.character.modelPath);
          if (result.success) {
            this.character = result.character;
            
            // Apply model settings after model is loaded (with a small delay to ensure model is ready)
            setTimeout(() => {
              const savedSettings = this.character.getSettings();
              if (savedSettings) {
                console.log('🎛️ Applying saved model settings:', savedSettings);
                
                // Apply to renderer
                this.renderer.updateGLTFSettings(savedSettings);
                
                // Update UI to reflect the loaded settings
                this.updateModelSettingsUI(savedSettings);
                
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
          } else {
            console.warn('⚠️ Could not load saved model:', result.error);
            console.log('🔄 Clearing problematic model path from state');
            
            // Clear the problematic model path to prevent repeated failures
            this.character.modelPath = '';
            this.character.updateSettings({ modelPath: '' });
            
            // Show user-friendly message
            this.showMessage('Saved model could not be loaded. Continuing without it.', 'warning');
            
            // Don't save this broken state - let the app load the default model instead
            console.log('💡 Will load default model instead');
          }
          
        } catch (error) {
          console.warn('⚠️ Could not load saved model:', error);
          console.log('🔄 Clearing problematic model path from state');
          
          // Clear the problematic model path to prevent repeated failures
          this.character.modelPath = '';
          this.character.updateSettings({ modelPath: '' });
          
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
        modelPath: this.character.modelPath,
        modelSettings: this.character.getSettings(),
        sceneSettings: sceneSettings,
        boneRotations: serializedBoneRotations,
        defaultPose: this.character.defaultPose ? Object.fromEntries(
          Object.entries(this.character.defaultPose).map(([name, euler]) => [
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

  private setupIKChains(): void {
    if (!this.character.isLoaded()) {
      this.showMessage('No model loaded', 'error');
      return;
    }

    const success = this.character.setupIKChains();
    if (success) {
      this.updateIKChainsList();
      this.showMessage('IK chains created!', 'success');
    } else {
      this.showMessage('Failed to setup IK chains', 'error');
    }
  }

  private clearIKChains(): void {
    this.character.clearIKChains();
    this.updateIKChainsList();
    this.showMessage('IK chains cleared', 'info');
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
    // Build chain data using character's IK chains
    const chainNames = this.character.getIKChainNames();
    const chains = chainNames.map((name: string) => {
      const bones = this.character.boneController?.getIKChainBones(name) || [];
      return { chainName: name, bones };
    });
    this.ikControls.updateChainsList(chains);
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

    const success = this.character.solveIK(this.activeIKChain, worldPosition);
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
    console.log('🎭 Default pose available:', this.character.defaultPose ? Object.keys(this.character.defaultPose).length + ' bones' : 'None');
  }

  // Debug method to clear saved state
  public clearSavedState(): void {
    localStorage.removeItem('poser3d-simple-state');
    console.log('🗑️ Cleared saved state');
    this.showMessage('Local state cleared successfully', 'success');
  }

  private resetToDefaultPose(): void {
    console.log('🔄 resetToDefaultPose called');
    console.log('🔍 character.defaultPose:', this.character.defaultPose);
    console.log('🔍 defaultPose keys:', Object.keys(this.character.defaultPose || {}));
    
    if (!this.character.defaultPose || Object.keys(this.character.defaultPose).length === 0) {
      console.warn('⚠️ No default pose available');
      this.showMessage('No default pose available. Load a model first.', 'warning');
      return;
    }

    console.log('🔄 Resetting to default pose');
    
    // Save current state for undo
    const beforeState = this.getCurrentState();
    
    // Apply the default pose
    this.character.resetToDefault();
    
    // Update the renderer to reflect the changes
    this.renderer.updateBoneController();
    
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

  // Getter methods for DebugManager access
  public getInteractiveIKMode(): boolean { return this.interactiveIKMode; }
  public getAltPressed(): boolean { return this.altPressed; }
  public getSelectedJoint(): string | null { return this.selectedJoint; }
  public getRenderer(): ThreeRenderer { return this.renderer; }
  public getCharacter(): Character3D { return this.character; }
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
