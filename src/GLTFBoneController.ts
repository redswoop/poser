import * as THREE from 'three';

export class GLTFBoneController {
    private scene: THREE.Scene;
    private skeleton: THREE.Skeleton;
    public controls: THREE.Group;
    private boneControlMap: Map<THREE.Object3D, THREE.Bone> = new Map();
    private boneDepthMap: Map<THREE.Bone, number> = new Map();
    private currentScale: number = 1.0;
    private maxDepth: number = 10; // Default max depth
    private currentDepthLimit: number = 3; // Default visible depth

    constructor(scene: THREE.Scene, skeleton: THREE.Skeleton) {
        this.scene = scene;
        this.skeleton = skeleton;
        this.controls = new THREE.Group();
        this.controls.name = "GLTF_Bone_Controls";
        this.controls.renderOrder = 1000; // Ensure controls group renders on top
        
        // Create controls after a small delay to ensure skeleton is properly positioned
        setTimeout(() => {
            this.calculateBoneDepths();
            this.createControls();
            this.scene.add(this.controls);
            // Apply any pending scale after controls are created
            this.setScale(this.currentScale);
            this.updateVisibilityByDepth();
        }, 100);
    }

    private calculateBoneDepths(): void {
        console.log('🔍 Calculating bone hierarchy depths...');
        
        // Calculate depth for each bone based on its hierarchy
        this.skeleton.bones.forEach(bone => {
            const depth = this.getBoneDepth(bone);
            this.boneDepthMap.set(bone, depth);
            console.log(`🦴 Bone: ${bone.name} -> Depth: ${depth}`);
        });
        
        // Calculate max depth
        this.maxDepth = Math.max(...Array.from(this.boneDepthMap.values()));
        console.log(`📊 Max bone depth: ${this.maxDepth}`);
    }

    private getBoneDepth(bone: THREE.Bone): number {
        let depth = 0;
        let current = bone.parent;
        
        while (current) {
            if (current instanceof THREE.Bone) {
                depth++;
            }
            current = current.parent;
        }
        
        return depth;
    }

    private createControls(): void {
        const geometry = new THREE.SphereGeometry(0.08, 16, 16); // Reasonable size - not too big, not too small
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            transparent: true,
            opacity: 0.8,
            depthTest: false,    // Disable depth testing so they always appear on top
            depthWrite: false,   // Don't write to depth buffer
            side: THREE.DoubleSide  // Render both sides
        });

        console.log(`🎮 Creating bone controls for ${this.skeleton.bones.length} bones`);

        this.skeleton.bones.forEach(bone => {
            const control = new THREE.Mesh(geometry, material.clone());
            control.name = `ctrl_${bone.name}`;
            
            // Set render order to ensure controls render on top
            control.renderOrder = 1000;
            
            // Add a subtle outline effect by creating a slightly larger sphere with wireframe
            const outlineGeometry = new THREE.SphereGeometry(0.09, 16, 16);
            const outlineMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.3,
                wireframe: true,
                depthTest: false,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
            outline.renderOrder = 999; // Render outline behind the main control
            control.add(outline);
            
            // Position the control at the bone's world position
            const worldPos = new THREE.Vector3();
            bone.getWorldPosition(worldPos);
            control.position.copy(worldPos);

            // Store bone depth as user data for easy access
            const depth = this.boneDepthMap.get(bone) || 0;
            control.userData.depth = depth;
            control.userData.boneName = bone.name;

            this.controls.add(control);
            this.boneControlMap.set(control, bone);
            
            console.log(`🎮 Created control for bone: ${bone.name} at position: ${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}, depth: ${depth}`);
        });
        
        console.log(`🎮 Total bone controls created: ${this.controls.children.length}`);
    }

    public update(): void {
        // Update control positions to match bone positions
        this.boneControlMap.forEach((bone, control) => {
            const worldPos = new THREE.Vector3();
            bone.getWorldPosition(worldPos);
            control.position.copy(worldPos);
        });
    }

    public getBoneFromControl(control: THREE.Object3D): THREE.Bone | undefined {
        return this.boneControlMap.get(control);
    }

    public setScale(scale: number): void {
        this.currentScale = scale;
        
        // Only apply scale if controls are already created
        if (this.controls.children.length > 0) {
            // Reset both group and individual control scales to 1.0
            // We'll rely on the bone world positions to handle the scaling
            this.controls.scale.setScalar(1.0);
            
            this.controls.children.forEach(control => {
                if (control instanceof THREE.Mesh) {
                    control.scale.setScalar(1.0);
                }
            });
            
            // Update positions - the bone world positions should already be scaled
            this.update();
        }
    }

    public updateVisibilityByDepth(): void {
        console.log(`👁️ Updating visibility for depth limit: ${this.currentDepthLimit}`);
        
        this.controls.children.forEach(control => {
            if (control.userData.depth !== undefined) {
                const shouldBeVisible = control.userData.depth <= this.currentDepthLimit;
                control.visible = shouldBeVisible;
                
                if (!shouldBeVisible) {
                    console.log(`🙈 Hiding control: ${control.userData.boneName} (depth: ${control.userData.depth})`);
                }
            }
        });
        
        const visibleCount = this.controls.children.filter(c => c.visible).length;
        console.log(`👁️ Visible controls: ${visibleCount}/${this.controls.children.length}`);
    }

    public setDepthLimit(depthLimit: number): void {
        this.currentDepthLimit = Math.max(0, Math.min(depthLimit, this.maxDepth));
        console.log(`📊 Setting depth limit to: ${this.currentDepthLimit}`);
        this.updateVisibilityByDepth();
    }

    public getDepthLimit(): number {
        return this.currentDepthLimit;
    }

    public getMaxDepth(): number {
        return this.maxDepth;
    }

    public getBoneDepths(): Map<string, number> {
        const depths = new Map<string, number>();
        this.boneDepthMap.forEach((depth, bone) => {
            depths.set(bone.name, depth);
        });
        return depths;
    }
}
