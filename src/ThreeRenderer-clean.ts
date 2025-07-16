import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneSettings } from './types';
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
    this.container.appendChild(this.renderer.domElement);

    // Grid
    this.grid = new THREE.GridHelper(20, 20, 0x888888, 0xcccccc);
    this.scene.add(this.grid);
  }

  private setupLighting(): void {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);

    // Directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);

    // Point light for fill
    const pointLight = new THREE.PointLight(0xffffff, 0.3);
    pointLight.position.set(-10, 10, -5);
    this.scene.add(pointLight);
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

    // Get all bone control objects
    const controls = this.gltfRenderer.boneController.controls;
    const intersects = this.raycaster.intersectObjects(controls.children, true);

    if (intersects.length > 0) {
      const control = intersects[0].object;
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

  public getBonePositions(): Record<string, THREE.Vector3> {
    const positions: Record<string, THREE.Vector3> = {};
    
    if (this.boneControlMode && this.gltfRenderer?.boneController) {
      const controls = this.gltfRenderer.boneController.controls;
      
      controls.children.forEach(control => {
        const bone = this.gltfRenderer!.boneController!.getBoneFromControl(control);
        if (bone) {
          positions[bone.name] = bone.position.clone();
        }
      });
    }
    
    return positions;
  }

  public setBonePositions(positions: Record<string, THREE.Vector3>): void {
    if (this.boneControlMode && this.gltfRenderer?.boneController) {
      Object.entries(positions).forEach(([boneName, position]) => {
        const controls = this.gltfRenderer!.boneController!.controls;
        
        controls.children.forEach(control => {
          const bone = this.gltfRenderer!.boneController!.getBoneFromControl(control);
          if (bone && bone.name === boneName) {
            bone.position.copy(position);
          }
        });
      });
      
      // Update the bone controller after setting positions
      this.updateBoneController();
    }
  }

  public updateBoneController(): void {
    if (this.boneControlMode && this.gltfRenderer.boneController) {
      this.gltfRenderer.boneController.update();
    }
  }

  private animate(): void {
    requestAnimationFrame(this.animate.bind(this));
    
    // Update orbit controls
    this.controls.update();
    
    this.renderer.render(this.scene, this.camera);
  }
}
