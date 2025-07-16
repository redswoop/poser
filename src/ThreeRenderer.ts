import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Character, BoneConnection, SceneSettings, RaycastResult } from './types';

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
  private characterGroups: Map<number, THREE.Group> = new Map();
  
  // Settings
  private settings: SceneSettings = {
    boneThickness: 3,
    jointSize: 0.15, // Reduced from 0.5 to make joints much smaller
    gridVisible: true
  };

  // Bone connections for skeleton structure
  private boneConnections: BoneConnection[] = [
    { start: 'head', end: 'neck' },
    { start: 'neck', end: 'leftShoulder' },
    { start: 'neck', end: 'rightShoulder' },
    { start: 'leftShoulder', end: 'leftElbow' },
    { start: 'leftElbow', end: 'leftWrist' },
    { start: 'rightShoulder', end: 'rightElbow' },
    { start: 'rightElbow', end: 'rightWrist' },
    { start: 'neck', end: 'spine' },
    { start: 'spine', end: 'leftHip' },
    { start: 'spine', end: 'rightHip' },
    { start: 'leftHip', end: 'leftKnee' },
    { start: 'leftKnee', end: 'leftAnkle' },
    { start: 'rightHip', end: 'rightKnee' },
    { start: 'rightKnee', end: 'rightAnkle' }
  ];

  constructor(container: HTMLElement) {
    this.container = container;
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    
    this.initializeScene();
    this.setupLighting();
    this.setupControls();
    this.setupEventListeners();
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

  public addCharacter(character: Character): void {
    const group = new THREE.Group();
    group.name = `character-${character.id}`;
    
    this.characterGroups.set(character.id, group);
    this.scene.add(group);
    
    this.updateCharacter(character);
  }

  public updateCharacter(character: Character): void {
    const group = this.characterGroups.get(character.id);
    if (!group) return;

    // Store current highlight state if this character has a highlighted joint
    let shouldRestoreHighlight = false;
    let highlightedJointName = '';
    if (this.highlightedJoint && this.highlightedJoint.characterId === character.id) {
      shouldRestoreHighlight = true;
      highlightedJointName = this.highlightedJoint.jointName;
      // Temporarily clear the highlight reference to avoid issues during clear
      this.highlightedJoint = null;
    }

    // Clear existing meshes
    group.clear();
    
    if (!character.visible) return;

    const color = new THREE.Color(character.color);
    
    // Create joints
    Object.entries(character.keypoints).forEach(([jointName, position]) => {
      const jointMesh = this.createJoint(position, color, jointName === 'head');
      jointMesh.name = `joint-${character.id}-${jointName}`;
      jointMesh.userData = { characterId: character.id, jointName, type: 'joint' };
      group.add(jointMesh);
    });

    // Create bones
    this.boneConnections.forEach(({ start, end }) => {
      const startPos = character.keypoints[start];
      const endPos = character.keypoints[end];
      
      if (startPos && endPos) {
        const boneMesh = this.createBone(startPos, endPos, color);
        boneMesh.name = `bone-${character.id}-${start}-${end}`;
        boneMesh.userData = { characterId: character.id, type: 'bone' };
        group.add(boneMesh);
      }
    });

    // Restore highlight if it was present
    if (shouldRestoreHighlight) {
      this.highlightJoint(character.id, highlightedJointName);
    }
  }

  private createJoint(position: { x: number; y: number; z: number }, color: THREE.Color, isHead: boolean = false): THREE.Mesh {
    const radius = isHead ? this.settings.jointSize * 2.0 : this.settings.jointSize;
    const geometry = new THREE.SphereGeometry(radius, 16, 12);
    const material = new THREE.MeshLambertMaterial({ color });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Add face features to the head to show orientation
    if (isHead) {
      console.log('Creating face for head with radius:', radius); // Debug log
      
      // Create eyes (larger black spheres)
      const eyeRadius = radius * 0.2; // Much larger eyes
      const eyeGeometry = new THREE.SphereGeometry(eyeRadius, 8, 6);
      const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
      
      const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      leftEye.position.set(-radius * 0.4, radius * 0.3, radius * 0.9); // Further out and forward
      leftEye.castShadow = true;
      leftEye.receiveShadow = true;
      
      const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      rightEye.position.set(radius * 0.4, radius * 0.3, radius * 0.9); // Further out and forward
      rightEye.castShadow = true;
      rightEye.receiveShadow = true;
      
      // Create nose (bright red for visibility)
      const noseGeometry = new THREE.SphereGeometry(radius * 0.15, 8, 6);
      const noseMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 }); // Bright red
      const nose = new THREE.Mesh(noseGeometry, noseMaterial);
      nose.position.set(0, 0, radius * 1.1); // Further forward
      nose.castShadow = true;
      nose.receiveShadow = true;
      
      // Create mouth (bright blue for visibility)
      const mouthGeometry = new THREE.SphereGeometry(radius * 0.2, 8, 6);
      mouthGeometry.scale(1.5, 0.3, 0.5); // Elliptical mouth
      const mouthMaterial = new THREE.MeshLambertMaterial({ color: 0x0000ff }); // Bright blue
      const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
      mouth.position.set(0, -radius * 0.4, radius * 0.9);
      mouth.castShadow = true;
      mouth.receiveShadow = true;
      
      // Add face features directly to head mesh
      mesh.add(leftEye);
      mesh.add(rightEye);
      mesh.add(nose);
      mesh.add(mouth);
      
      console.log('Face features added to head'); // Debug log
    }
    
    return mesh;
  }

  private createBone(start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }, color: THREE.Color): THREE.Mesh {
    const startVec = new THREE.Vector3(start.x, start.y, start.z);
    const endVec = new THREE.Vector3(end.x, end.y, end.z);
    const direction = new THREE.Vector3().subVectors(endVec, startVec);
    const length = direction.length();
    
    const geometry = new THREE.CylinderGeometry(
      this.settings.boneThickness * 0.01,
      this.settings.boneThickness * 0.01,
      length,
      8
    );
    
    const material = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position and orient the bone
    mesh.position.copy(startVec).add(direction.multiplyScalar(0.5));
    mesh.lookAt(endVec);
    mesh.rotateX(Math.PI / 2);
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  public removeCharacter(character: Character): void {
    const group = this.characterGroups.get(character.id);
    if (group) {
      this.scene.remove(group);
      this.characterGroups.delete(character.id);
    }
  }

  public clear(): void {
    this.characterGroups.forEach(group => {
      this.scene.remove(group);
    });
    this.characterGroups.clear();
  }

  public raycastJoints(mouseX: number, mouseY: number): RaycastResult | null {
    // Convert mouse coordinates to normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((mouseX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((mouseY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Get all joint meshes
    const jointMeshes: THREE.Mesh[] = [];
    this.characterGroups.forEach(group => {
      group.children.forEach(child => {
        if (child.userData.type === 'joint') {
          jointMeshes.push(child as THREE.Mesh);
        }
      });
    });

    const intersects = this.raycaster.intersectObjects(jointMeshes);
    
    if (intersects.length > 0) {
      const intersection = intersects[0];
      const mesh = intersection.object as THREE.Mesh;
      
      return {
        character: { id: mesh.userData.characterId } as Character,
        jointName: mesh.userData.jointName,
        point: intersection.point,
        distance: intersection.distance
      };
    }
    
    return null;
  }

  public updateSettings(newSettings: Partial<SceneSettings>): void {
    Object.assign(this.settings, newSettings);
    
    if ('gridVisible' in newSettings) {
      this.grid.visible = this.settings.gridVisible;
    }
    
    // Update all character visuals if bone thickness or joint size changed
    if ('boneThickness' in newSettings || 'jointSize' in newSettings) {
      // Note: Would need to re-render all characters
      console.log('Settings updated - characters should be re-rendered');
    }
  }

  public resetCamera(): void {
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);
    this.controls.reset();
  }

  public setCameraView(view: string): void {
    const distance = 8; // Distance from center
    const target = new THREE.Vector3(0, 2, 0); // Look at center of figure (slightly up)
    
    switch (view) {
      case 'front':
        this.camera.position.set(0, 2, distance);
        break;
      case 'back':
        this.camera.position.set(0, 2, -distance);
        break;
      case 'left':
        this.camera.position.set(-distance, 2, 0);
        break;
      case 'right':
        this.camera.position.set(distance, 2, 0);
        break;
      case 'top':
        this.camera.position.set(0, distance, 0);
        target.set(0, 0, 0); // Look straight down
        break;
      case 'bottom':
        this.camera.position.set(0, -distance, 0);
        target.set(0, 0, 0); // Look straight up
        break;
      default:
        this.resetCamera();
        return;
    }
    
    this.camera.lookAt(target);
    this.controls.target.copy(target);
    this.controls.update();
  }

  public getControls(): OrbitControls {
    return this.controls;
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  public screenToWorldMovement(deltaX: number, deltaY: number, distance: number): THREE.Vector3 {
    // Convert screen space movement to world space
    const vector = new THREE.Vector3();
    
    // Get the camera's right and up vectors
    const cameraMatrix = this.camera.matrixWorld;
    const right = new THREE.Vector3().setFromMatrixColumn(cameraMatrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cameraMatrix, 1);
    
    // Scale the movement based on distance to camera
    const scaleFactor = distance * 0.001; // Adjust this value to control sensitivity
    
    // Calculate world space movement
    vector.add(right.multiplyScalar(deltaX * scaleFactor));
    vector.add(up.multiplyScalar(-deltaY * scaleFactor)); // Negative for correct direction
    
    return vector;
  }

  private highlightedJoint: { characterId: number; jointName: string } | null = null;
  private currentMovementPlane: string = 'camera-relative';

  public setMovementPlane(plane: string): void {
    console.log(`Setting movement plane to: ${plane}`);
    this.currentMovementPlane = plane;
    
    // Update existing highlight if there is one
    if (this.highlightedJoint) {
      console.log(`Updating highlight for plane change: ${this.highlightedJoint.jointName}`);
      // Clear current highlight visuals and recreate with new plane
      const { characterId, jointName } = this.highlightedJoint;
      const group = this.characterGroups.get(characterId);
      if (group) {
        this.clearHighlightFromJoint(group, jointName);
      }
      // Recreate with new plane
      this.updateHighlightForPlane();
    }
  }

  private getPlaneColor(plane: string): { primary: number; secondary: number; label: string } {
    switch (plane) {
      case 'xy':
        return { primary: 0xff4444, secondary: 0xff8888, label: 'XY' }; // Red for front/back view
      case 'xz':
        return { primary: 0x44ff44, secondary: 0x88ff88, label: 'XZ' }; // Green for top-down view
      case 'yz':
        return { primary: 0x4444ff, secondary: 0x8888ff, label: 'YZ' }; // Blue for side view
      case 'camera-relative':
      default:
        return { primary: 0x00ff88, secondary: 0x44ffaa, label: 'CAM' }; // Cyan for camera-relative
    }
  }

  private createPlaneRing(plane: string, innerRadius: number, outerRadius: number, opacity: number): THREE.Mesh {
    const { primary } = this.getPlaneColor(plane);
    
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 32);
    const material = new THREE.MeshBasicMaterial({
      color: primary,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(geometry, material);
    
    // Orient the ring based on the movement plane
    switch (plane) {
      case 'xy':
        // XY plane - ring lies flat in XY, normal points along Z
        // No rotation needed, this is the default orientation
        break;
      case 'xz':
        // XZ plane - ring lies flat in XZ, normal points along Y
        ring.rotation.x = Math.PI / 2;
        break;
      case 'yz':
        // YZ plane - ring lies flat in YZ, normal points along X
        ring.rotation.z = Math.PI / 2;
        break;
      case 'camera-relative':
        // Camera-relative - always face camera (handled in animation loop)
        break;
    }
    
    return ring;
  }

  private createPlaneLabel(plane: string): THREE.Sprite {
    const { label } = this.getPlaneColor(plane);
    
    // Create canvas for text
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    
    // Draw background
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw text
    context.fillStyle = '#ffffff';
    context.font = 'bold 24px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, canvas.width / 2, canvas.height / 2);
    
    // Create sprite
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    
    // Scale and position
    sprite.scale.set(0.8, 0.4, 1);
    sprite.position.set(0, this.settings.jointSize * 3, 0); // Position above the joint
    
    return sprite;
  }

  public highlightJoint(characterId: number, jointName: string): void {
    // Always clear any existing highlight first, even if it's the same joint
    this.clearJointHighlight();
    
    // Set new highlight
    this.highlightedJoint = { characterId, jointName };
    
    console.log(`Highlighting joint: ${jointName} for character ${characterId} in ${this.currentMovementPlane} plane`);
    
    // Create the highlight for the current plane
    this.updateHighlightForPlane();
  }

  private updateHighlightForPlane(): void {
    if (!this.highlightedJoint) return;
    
    const { characterId, jointName } = this.highlightedJoint;
    const group = this.characterGroups.get(characterId);
    if (!group) return;
    
    const jointMesh = group.children.find(child => 
      child.userData.type === 'joint' && child.userData.jointName === jointName
    ) as THREE.Mesh;
    
    if (!jointMesh) return;
    
    const { primary } = this.getPlaneColor(this.currentMovementPlane);
    
    // Create plane-oriented rings
    const outerRing = this.createPlaneRing(
      this.currentMovementPlane,
      this.settings.jointSize * 1.8,
      this.settings.jointSize * 2.2,
      0.6
    );
    outerRing.name = 'joint-highlight-outer';
    
    const innerRing = this.createPlaneRing(
      this.currentMovementPlane,
      this.settings.jointSize * 1.4,
      this.settings.jointSize * 1.6,
      0.8
    );
    innerRing.name = 'joint-highlight-inner';
    
    // Create glowing outline sphere (always present)
    const outlineGeometry = jointMesh.geometry.clone();
    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: primary,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    });
    const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
    outline.scale.multiplyScalar(1.4);
    outline.name = 'joint-highlight-outline';
    
    // Create plane label
    const label = this.createPlaneLabel(this.currentMovementPlane);
    label.name = 'joint-highlight-label';
    
    // Add all highlight elements
    jointMesh.add(outline);
    jointMesh.add(outerRing);
    jointMesh.add(innerRing);
    jointMesh.add(label);
    
    console.log(`Highlighted joint: ${jointName} for character ${characterId} in ${this.currentMovementPlane} plane`);
  }

  public clearJointHighlight(): void {
    // Clear tracked highlight
    if (this.highlightedJoint) {
      const group = this.characterGroups.get(this.highlightedJoint.characterId);
      if (group) {
        this.clearHighlightFromJoint(group, this.highlightedJoint.jointName);
      }
      this.highlightedJoint = null;
    }
    
    // Also do a comprehensive cleanup of any stray highlights in all characters
    this.characterGroups.forEach(group => {
      group.children.forEach(child => {
        if (child.userData.type === 'joint') {
          this.clearHighlightFromJoint(group, child.userData.jointName);
        }
      });
    });
    
    console.log('Cleared all joint highlights');
  }

  private clearHighlightFromJoint(group: THREE.Group, jointName: string): void {
    const jointMesh = group.children.find(child => 
      child.userData.type === 'joint' && 
      child.userData.jointName === jointName
    ) as THREE.Mesh;
    
    if (jointMesh) {
      // Remove all highlight elements
      const highlightNames = ['joint-highlight-outer', 'joint-highlight-inner', 'joint-highlight-outline', 'joint-highlight-label', 'joint-highlight'];
      highlightNames.forEach(name => {
        const highlight = jointMesh.children.find(child => child.name === name);
        if (highlight) {
          jointMesh.remove(highlight);
          // Dispose geometry and material to prevent memory leaks
          if (highlight instanceof THREE.Mesh) {
            highlight.geometry.dispose();
            if (Array.isArray(highlight.material)) {
              highlight.material.forEach(mat => mat.dispose());
            } else {
              highlight.material.dispose();
            }
          } else if (highlight instanceof THREE.Sprite) {
            if (highlight.material.map) {
              highlight.material.map.dispose();
            }
            highlight.material.dispose();
          }
        }
      });
    }
  }

  public debugHighlights(): void {
    console.log('=== Debug Highlights ===');
    console.log('Currently tracked highlight:', this.highlightedJoint);
    
    this.characterGroups.forEach((group, characterId) => {
      console.log(`Character ${characterId}:`);
      group.children.forEach(child => {
        if (child.userData.type === 'joint') {
          const jointMesh = child as THREE.Mesh;
          const highlights = jointMesh.children.filter(c => c.name.includes('highlight'));
          if (highlights.length > 0) {
            console.log(`  Joint ${child.userData.jointName} has ${highlights.length} highlights:`, 
              highlights.map(h => h.name));
          }
        }
      });
    });
    console.log('========================');
  }

  public getCameraState(): { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; zoom: number } {
    return {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z
      },
      target: {
        x: this.controls.target.x,
        y: this.controls.target.y,
        z: this.controls.target.z
      },
      zoom: this.camera.zoom
    };
  }

  public setCameraState(state: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; zoom: number }): void {
    this.camera.position.set(state.position.x, state.position.y, state.position.z);
    this.controls.target.set(state.target.x, state.target.y, state.target.z);
    this.camera.zoom = state.zoom;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  public getSceneSettings(): SceneSettings {
    return { ...this.settings };
  }

  public updateSceneSettings(newSettings: Partial<SceneSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    
    // Update grid visibility
    if (newSettings.gridVisible !== undefined) {
      this.grid.visible = newSettings.gridVisible;
    }
  }

  private animate(): void {
    requestAnimationFrame(this.animate.bind(this));
    
    // Update orbit controls
    this.controls.update();
    
    // Update camera-relative rings to always face camera
    if (this.highlightedJoint && this.currentMovementPlane === 'camera-relative') {
      const group = this.characterGroups.get(this.highlightedJoint.characterId);
      if (group) {
        const jointMesh = group.children.find(child => 
          child.userData.type === 'joint' && 
          child.userData.jointName === this.highlightedJoint!.jointName
        ) as THREE.Mesh;
        
        if (jointMesh) {
          const outerRing = jointMesh.children.find(child => child.name === 'joint-highlight-outer') as THREE.Mesh;
          const innerRing = jointMesh.children.find(child => child.name === 'joint-highlight-inner') as THREE.Mesh;
          
          if (outerRing && innerRing) {
            // Make rings face camera for camera-relative mode
            outerRing.lookAt(this.camera.position);
            innerRing.lookAt(this.camera.position);
          }
        }
      }
    }
    
    this.renderer.render(this.scene, this.camera);
  }
}
