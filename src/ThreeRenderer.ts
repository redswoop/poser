import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneSettings, GLTFModelSettings } from './types';
import { GLTFHumanRenderer } from './GLTFHumanRenderer';

export class ThreeRenderer {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private container: HTMLElement;
  
  // Scene objects
  private grid!: THREE.GridHelper;
  
  // GLTF renderer
  private gltfRenderer!: GLTFHumanRenderer;
  
  // Settings
  private settings: SceneSettings = {
    boneThickness: 3,
    jointSize: 0.15,
    gridVisible: true
  };

  // Bone control mode for direct GLB skeleton manipulation
  public boneControlMode: boolean = true;

  constructor(container: HTMLElement) {
    this.container = container;
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    
    this.initializeScene();
    this.setupLighting();
    this.setupControls();
    this.setupEventListeners();
    
    // Initialize GLTF renderer
    this.gltfRenderer = new GLTFHumanRenderer(this.scene);
    
    this.animate();
  }

  private initializeScene(): void {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Improve lighting and color rendering
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    
    this.container.appendChild(this.renderer.domElement);

    // Grid
    this.grid = new THREE.GridHelper(20, 20, 0x888888, 0xcccccc);
    this.scene.add(this.grid);
  }

  private setupLighting(): void {
    // Ambient light - increased for better overall illumination
    const ambientLight = new THREE.AmbientLight(0x404040, 1.2);
    this.scene.add(ambientLight);

    // Main directional light - increased intensity
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);

    // Secondary directional light from opposite side for fill lighting
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight2.position.set(-10, 10, -5);
    this.scene.add(directionalLight2);

    // Point light for additional fill
    const pointLight = new THREE.PointLight(0xffffff, 0.6);
    pointLight.position.set(-10, 10, -5);
    this.scene.add(pointLight);
    
    // Additional point light from the front
    const frontLight = new THREE.PointLight(0xffffff, 0.4);
    frontLight.position.set(0, 5, 10);
    this.scene.add(frontLight);
  }

  private setupControls(): void {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.enableRotate = true;
    this.controls.maxDistance = 50;
    this.controls.minDistance = 2;
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private onWindowResize(): void {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  public raycastBoneControls(mouseX: number, mouseY: number): { bone: THREE.Bone; control: THREE.Object3D } | null {
    if (!this.boneControlMode || !this.gltfRenderer.boneController) {
      return null;
    }

    // Convert mouse coordinates to normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((mouseX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((mouseY - rect.top) / rect.height) * 2 + 1;

    // Set up raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Get all bone control objects that are visible
    const controls = this.gltfRenderer.boneController.controls;
    const visibleControls = controls.children.filter(child => child.visible);
    
    // For objects with depthTest: false, we need to sort intersections by distance
    const intersects = this.raycaster.intersectObjects(visibleControls, false);

    if (intersects.length > 0) {
      // Get the closest intersection
      const closestIntersect = intersects[0];
      const control = closestIntersect.object;
      const bone = this.gltfRenderer.boneController.getBoneFromControl(control);
      if (bone) {
        return { bone, control };
      }
    }

    return null;
  }

  public updateSettings(newSettings: Partial<SceneSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    
    if (newSettings.gridVisible !== undefined) {
      this.grid.visible = newSettings.gridVisible;
    }
  }

  public resetCamera(): void {
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  public setCameraView(view: string): void {
    const distance = 10;
    this.controls.target.set(0, 0, 0);
    
    switch (view) {
      case 'front':
        this.camera.position.set(0, 0, distance);
        break;
      case 'back':
        this.camera.position.set(0, 0, -distance);
        break;
      case 'left':
        this.camera.position.set(-distance, 0, 0);
        break;
      case 'right':
        this.camera.position.set(distance, 0, 0);
        break;
      case 'top':
        this.camera.position.set(0, distance, 0);
        break;
      case 'bottom':
        this.camera.position.set(0, -distance, 0);
        break;
    }
    
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  public getControls(): OrbitControls {
    return this.controls;
  }

  public setMovementPlane(plane: string): void {
    // This method sets the movement plane for bone controls
    // Implementation depends on how you want to handle different movement planes
    console.log(`Movement plane set to: ${plane}`);
  }

  public setIKMode(ikModeActive: boolean): void {
    if (this.gltfRenderer.boneController) {
      this.gltfRenderer.boneController.setIKMode(ikModeActive);
    }
  }

  public raycastIKControls(mouseX: number, mouseY: number): { targetName: string; control: THREE.Object3D } | null {
    if (!this.gltfRenderer.boneController) {
      return null;
    }

    // Convert mouse coordinates to normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((mouseX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((mouseY - rect.top) / rect.height) * 2 + 1;

    // Set up raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Get all IK control objects that are visible
    const ikControls = this.gltfRenderer.boneController.getIKControls();
    const visibleControls = ikControls.filter(child => child.visible);
    
    // Raycast against IK controls
    const intersects = this.raycaster.intersectObjects(visibleControls, false);

    if (intersects.length > 0) {
      // Get the closest intersection
      const closestIntersect = intersects[0];
      const control = closestIntersect.object;
      const targetName = this.gltfRenderer.boneController.getTargetNameFromIKControl(control);
      if (targetName) {
        return { targetName, control };
      }
    }

    return null;
  }

  public screenToWorldMovement(deltaX: number, deltaY: number, distance: number): THREE.Vector3 {
    // Convert screen movement to world movement based on camera
    const factor = distance * 0.001;
    
    // Get camera's right and up vectors
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    
    this.camera.getWorldDirection(cameraRight);
    cameraRight.cross(this.camera.up).normalize();
    cameraUp.copy(this.camera.up);
    
    // Apply movement in camera space
    const movement = new THREE.Vector3();
    movement.addScaledVector(cameraRight, deltaX * factor);
    movement.addScaledVector(cameraUp, deltaY * factor);
    
    return movement;
  }

  public async loadGLTFModel(modelPath: string): Promise<void> {
    await this.gltfRenderer.loadModel(modelPath);
  }

  public updateGLTFSettings(settings: any): void {
    this.gltfRenderer.updateSettings(settings);
  }

  public setGLTFVisible(visible: boolean): void {
    this.gltfRenderer.setVisible(visible);
  }

  public focusOnGLTFModel(): void {
    if (this.gltfRenderer.model) {
      // Get the bounding box of the model
      const box = new THREE.Box3().setFromObject(this.gltfRenderer.model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      // Move camera to look at the model
      const maxDimension = Math.max(size.x, size.y, size.z);
      const distance = maxDimension * 2;
      
      this.camera.position.set(distance, distance, distance);
      this.camera.lookAt(center);
      this.controls.target.copy(center);
      this.controls.update();
    }
  }

  public getBoneController(): any {
    return this.gltfRenderer.boneController;
  }

  public getBoneRotations(): Record<string, THREE.Euler> {
    const rotations: Record<string, THREE.Euler> = {};
    
    if (this.boneControlMode && this.gltfRenderer?.boneController) {
      const controls = this.gltfRenderer.boneController.controls;
      
      controls.children.forEach(control => {
        const bone = this.gltfRenderer!.boneController!.getBoneFromControl(control);
        if (bone) {
          rotations[bone.name] = bone.rotation.clone();
        }
      });
    }
    
    return rotations;
  }

  public setBoneRotations(rotations: Record<string, THREE.Euler>): void {
    if (this.boneControlMode && this.gltfRenderer?.boneController) {
      Object.entries(rotations).forEach(([boneName, rotation]) => {
        const controls = this.gltfRenderer!.boneController!.controls;
        
        controls.children.forEach(control => {
          const bone = this.gltfRenderer!.boneController!.getBoneFromControl(control);
          if (bone && bone.name === boneName) {
            bone.rotation.copy(rotation);
          }
        });
      });
      
      // Update the bone controller after setting rotations
      this.updateBoneController();
    }
  }

  public updateBoneController(): void {
    if (this.boneControlMode && this.gltfRenderer.boneController) {
      this.gltfRenderer.boneController.update();
    }
  }

  public setBoneDepthLimit(depthLimit: number): void {
    if (this.gltfRenderer?.boneController) {
      this.gltfRenderer.boneController.setDepthLimit(depthLimit);
    }
  }

  public getBoneDepthLimit(): number {
    if (this.gltfRenderer?.boneController) {
      return this.gltfRenderer.boneController.getDepthLimit();
    }
    return 3; // Default value
  }

  public getMaxBoneDepth(): number {
    if (this.gltfRenderer?.boneController) {
      return this.gltfRenderer.boneController.getMaxDepth();
    }
    return 10; // Default value
  }

  public getBoneDepths(): Map<string, number> {
    if (this.gltfRenderer?.boneController) {
      return this.gltfRenderer.boneController.getBoneDepths();
    }
    return new Map();
  }

  public getBoneByName(boneName: string): THREE.Bone | null {
    if (this.boneControlMode && this.gltfRenderer?.boneController) {
      const controls = this.gltfRenderer.boneController.controls;
      
      for (const control of controls.children) {
        const bone = this.gltfRenderer.boneController.getBoneFromControl(control);
        if (bone && bone.name === boneName) {
          return bone;
        }
      }
    }
    return null;
  }

  public highlightBoneControl(boneName: string | null): void {
    if (this.boneControlMode && this.gltfRenderer?.boneController) {
      const controls = this.gltfRenderer.boneController.controls;
      
      controls.children.forEach(control => {
        const bone = this.gltfRenderer!.boneController!.getBoneFromControl(control);
        if (bone) {
          const material = (control as THREE.Mesh).material as THREE.MeshBasicMaterial;
          if (boneName && bone.name === boneName) {
            // Highlight selected joint
            material.color.setHex(0x00ff00); // Green for selected
            material.opacity = 1.0; // Full opacity for selected
            (control as THREE.Mesh).renderOrder = 1001; // Even higher render order
          } else {
            // Default color for non-selected joints
            material.color.setHex(0xff0000); // Red for default
            material.opacity = 0.8; // Semi-transparent for default
            (control as THREE.Mesh).renderOrder = 1000; // Standard render order
          }
        }
      });
    }
  }

  public getGLTFSettings(): GLTFModelSettings {
    return this.gltfRenderer.getSettings();
  }

  public getGLTFModel(): THREE.Group | null {
    return this.gltfRenderer.getModel();
  }

  public getGLTFSkeleton(): THREE.Skeleton | null {
    return this.gltfRenderer.getSkeleton();
  }

  public getGLTFSkinnedMesh(): THREE.SkinnedMesh | null {
    return this.gltfRenderer.getSkinnedMesh();
  }

  public getSettings(): SceneSettings {
    return { ...this.settings };
  }

  private animate(): void {
    requestAnimationFrame(this.animate.bind(this));
    
    // Update orbit controls
    this.controls.update();
    
    // Update GLTF renderer to keep IK targets synchronized
    this.gltfRenderer.update();
    
    this.renderer.render(this.scene, this.camera);
  }
}
