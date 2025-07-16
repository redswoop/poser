import * as THREE from 'three';
import { CCDIKSolver } from 'three/examples/jsm/animation/CCDIKSolver.js';

export class ThreeJSIKController {
    private scene: THREE.Scene;
    private mesh: THREE.SkinnedMesh;
    private ikSolver: CCDIKSolver | null = null;
    private ikTargets: Map<string, THREE.Mesh> = new Map();
    private ikChains: Array<any> = [];
    private ikTargetPositions: Map<string, THREE.Vector3> = new Map();

    constructor(scene: THREE.Scene, mesh: THREE.SkinnedMesh) {
        this.scene = scene;
        this.mesh = mesh;
        this.setupIKChains();
        this.createIKTargets();
    }

    private setupIKChains(): void {
        // Analyze the skeleton to find IK chains
        const bones = this.mesh.skeleton.bones;
        const boneNameMap = new Map<string, number>();
        
        // Create a map of bone names to indices
        bones.forEach((bone, index) => {
            boneNameMap.set(bone.name, index);
        });

        // Look for common humanoid bone patterns
        const ikConfigs = this.discoverIKChains(boneNameMap);
        
        if (ikConfigs.length === 0) {
            console.warn('⚠️ No IK chains could be configured for this skeleton');
            return;
        }

        console.log(`🎯 Setting up ${ikConfigs.length} IK chains with Three.js CCDIKSolver`);
        this.ikChains = ikConfigs;
        
        // Create the CCDIKSolver
        this.ikSolver = new CCDIKSolver(this.mesh, ikConfigs);
        
        console.log('✅ Three.js CCDIKSolver initialized successfully');
    }

    private discoverIKChains(boneNameMap: Map<string, number>): Array<any> {
        const ikConfigs: Array<any> = [];
        
        // Helper function to find bone index by name patterns
        const findBoneIndex = (patterns: string[]): number | null => {
            for (const pattern of patterns) {
                const index = boneNameMap.get(pattern);
                if (index !== undefined) {
                    return index;
                }
            }
            return null;
        };

        // Left arm chain
        const leftArmIndex = findBoneIndex([
            'mixamorigLeftArm', 'LeftArm', 'LeftUpperArm', 'Left_Arm', 'l_arm'
        ]);
        const leftForeArmIndex = findBoneIndex([
            'mixamorigLeftForeArm', 'LeftForeArm', 'LeftLowerArm', 'Left_ForeArm', 'l_forearm'
        ]);
        const leftHandIndex = findBoneIndex([
            'mixamorigLeftHand', 'LeftHand', 'Left_Hand', 'l_hand'
        ]);

        if (leftArmIndex !== null && leftForeArmIndex !== null && leftHandIndex !== null) {
            // Use the hand bone itself as the target by creating a temporary target
            const leftHandTargetIndex = this.createVirtualTargetBone('leftHandTarget', leftHandIndex);
            
            ikConfigs.push({
                target: leftHandTargetIndex,
                effector: leftHandIndex,
                links: [
                    { index: leftForeArmIndex },
                    { index: leftArmIndex }
                ],
                iteration: 5,  // Reduced for better performance
                minAngle: 0.01,
                maxAngle: Math.PI / 3  // Reduced for more natural movement
            });
            
            console.log(`✅ Left arm IK chain: ${leftArmIndex} → ${leftForeArmIndex} → ${leftHandIndex} (target: ${leftHandTargetIndex})`);
        }

        // Right arm chain
        const rightArmIndex = findBoneIndex([
            'mixamorigRightArm', 'RightArm', 'RightUpperArm', 'Right_Arm', 'r_arm'
        ]);
        const rightForeArmIndex = findBoneIndex([
            'mixamorigRightForeArm', 'RightForeArm', 'RightLowerArm', 'Right_ForeArm', 'r_forearm'
        ]);
        const rightHandIndex = findBoneIndex([
            'mixamorigRightHand', 'RightHand', 'Right_Hand', 'r_hand'
        ]);

        if (rightArmIndex !== null && rightForeArmIndex !== null && rightHandIndex !== null) {
            // Use the hand bone itself as the target by creating a temporary target
            const rightHandTargetIndex = this.createVirtualTargetBone('rightHandTarget', rightHandIndex);
            
            ikConfigs.push({
                target: rightHandTargetIndex,
                effector: rightHandIndex,
                links: [
                    { index: rightForeArmIndex },
                    { index: rightArmIndex }
                ],
                iteration: 5,  // Reduced for better performance
                minAngle: 0.01,
                maxAngle: Math.PI / 3  // Reduced for more natural movement
            });
            
            console.log(`✅ Right arm IK chain: ${rightArmIndex} → ${rightForeArmIndex} → ${rightHandIndex} (target: ${rightHandTargetIndex})`);
        }

        // Left leg chain
        const leftThighIndex = findBoneIndex([
            'mixamorigLeftUpLeg', 'LeftUpLeg', 'LeftThigh', 'Left_UpLeg', 'l_thigh'
        ]);
        const leftShinIndex = findBoneIndex([
            'mixamorigLeftLeg', 'LeftLeg', 'LeftShin', 'Left_Leg', 'l_shin'
        ]);
        const leftFootIndex = findBoneIndex([
            'mixamorigLeftFoot', 'LeftFoot', 'Left_Foot', 'l_foot'
        ]);

        if (leftThighIndex !== null && leftShinIndex !== null && leftFootIndex !== null) {
            // Use the foot bone itself as the target by creating a temporary target
            const leftFootTargetIndex = this.createVirtualTargetBone('leftFootTarget', leftFootIndex);
            
            ikConfigs.push({
                target: leftFootTargetIndex,
                effector: leftFootIndex,
                links: [
                    { index: leftShinIndex },
                    { index: leftThighIndex }
                ],
                iteration: 5,  // Reduced for better performance
                minAngle: 0.01,
                maxAngle: Math.PI / 3  // Reduced for more natural movement
            });
            
            console.log(`✅ Left leg IK chain: ${leftThighIndex} → ${leftShinIndex} → ${leftFootIndex} (target: ${leftFootTargetIndex})`);
        }

        // Right leg chain
        const rightThighIndex = findBoneIndex([
            'mixamorigRightUpLeg', 'RightUpLeg', 'RightThigh', 'Right_UpLeg', 'r_thigh'
        ]);
        const rightShinIndex = findBoneIndex([
            'mixamorigRightLeg', 'RightLeg', 'RightShin', 'Right_Leg', 'r_shin'
        ]);
        const rightFootIndex = findBoneIndex([
            'mixamorigRightFoot', 'RightFoot', 'Right_Foot', 'r_foot'
        ]);

        if (rightThighIndex !== null && rightShinIndex !== null && rightFootIndex !== null) {
            // Use the foot bone itself as the target by creating a temporary target
            const rightFootTargetIndex = this.createVirtualTargetBone('rightFootTarget', rightFootIndex);
            
            ikConfigs.push({
                target: rightFootTargetIndex,
                effector: rightFootIndex,
                links: [
                    { index: rightShinIndex },
                    { index: rightThighIndex }
                ],
                iteration: 5,  // Reduced for better performance
                minAngle: 0.01,
                maxAngle: Math.PI / 3  // Reduced for more natural movement
            });
            
            console.log(`✅ Right leg IK chain: ${rightThighIndex} → ${rightShinIndex} → ${rightFootIndex} (target: ${rightFootTargetIndex})`);
        }

        return ikConfigs;
    }

    private createVirtualTargetBone(targetName: string, effectorIndex: number): number {
        // Create a virtual target bone positioned at the effector's location
        const effectorBone = this.mesh.skeleton.bones[effectorIndex];
        const targetBone = new THREE.Bone();
        targetBone.name = targetName;
        
        // Position the target bone at the effector's current world position
        const effectorWorldPos = new THREE.Vector3();
        effectorBone.getWorldPosition(effectorWorldPos);
        
        // Convert world position to local space of the skeleton
        const skeletonWorldMatrix = this.mesh.matrixWorld;
        const localPos = effectorWorldPos.clone();
        localPos.applyMatrix4(skeletonWorldMatrix.clone().invert());
        
        targetBone.position.copy(localPos);
        
        // Add to skeleton
        this.mesh.skeleton.bones.push(targetBone);
        
        // Store the target position
        this.ikTargetPositions.set(targetName, effectorWorldPos.clone());
        
        return this.mesh.skeleton.bones.length - 1;
    }

    private createIKTargets(): void {
        // Create visual targets for each IK chain
        const targetGeometry = new THREE.OctahedronGeometry(0.08);  // Smaller targets
        const targetMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x8A2BE2,  // Purple
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false
        });

        // Create targets for each IK chain
        this.ikChains.forEach((ikConfig, index) => {
            const targetBone = this.mesh.skeleton.bones[ikConfig.target];
            const effectorBone = this.mesh.skeleton.bones[ikConfig.effector];
            
            // Create visual target
            const targetMesh = new THREE.Mesh(targetGeometry, targetMaterial.clone());
            targetMesh.name = `IK_Target_${targetBone.name}`;
            targetMesh.renderOrder = 1001;
            
            // Position at effector location initially
            this.syncTargetToEffector(targetMesh, effectorBone);
            
            // Store target info
            targetMesh.userData = {
                ikChainIndex: index,
                targetBoneIndex: ikConfig.target,
                effectorBoneIndex: ikConfig.effector,
                targetName: targetBone.name,
                effectorBone: effectorBone  // Store reference for easy access
            };
            
            this.ikTargets.set(targetBone.name, targetMesh);
            this.scene.add(targetMesh);
            
            console.log(`🎯 Created IK target: ${targetBone.name} for effector: ${effectorBone.name}`);
        });
    }

    private syncTargetToEffector(targetMesh: THREE.Mesh, effectorBone: THREE.Bone): void {
        // Get the effector's world position
        const effectorWorldPos = new THREE.Vector3();
        effectorBone.getWorldPosition(effectorWorldPos);
        
        // Set target position to match effector
        targetMesh.position.copy(effectorWorldPos);
    }

    public setIKTargetPosition(targetName: string, position: THREE.Vector3): boolean {
        const targetMesh = this.ikTargets.get(targetName);
        if (!targetMesh) {
            console.warn(`⚠️ IK target "${targetName}" not found`);
            return false;
        }

        // Update visual target position with damping to reduce sensitivity
        const currentPos = targetMesh.position.clone();
        const dampingFactor = 0.3;  // Reduce sensitivity
        const newPos = currentPos.lerp(position, dampingFactor);
        targetMesh.position.copy(newPos);
        
        // Update target bone position
        const targetBoneIndex = targetMesh.userData.targetBoneIndex;
        const targetBone = this.mesh.skeleton.bones[targetBoneIndex];
        if (targetBone) {
            // Convert world position to local space of the mesh
            const localPos = newPos.clone();
            localPos.applyMatrix4(this.mesh.matrixWorld.clone().invert());
            targetBone.position.copy(localPos);
            targetBone.updateMatrixWorld(true);
        }
        
        // Store the position
        this.ikTargetPositions.set(targetName, newPos.clone());
        
        // Solve IK with reduced frequency to improve stability
        if (this.ikSolver) {
            this.ikSolver.update();
        }
        
        console.log(`🎯 Updated IK target "${targetName}" to position (${newPos.x.toFixed(2)}, ${newPos.y.toFixed(2)}, ${newPos.z.toFixed(2)})`);
        return true;
    }

    public getIKTargets(): THREE.Mesh[] {
        return Array.from(this.ikTargets.values());
    }

    public getIKTargetByName(targetName: string): THREE.Mesh | null {
        return this.ikTargets.get(targetName) || null;
    }

    public raycastIKTarget(raycaster: THREE.Raycaster): { targetName: string; target: THREE.Mesh } | null {
        const targets = Array.from(this.ikTargets.values());
        const intersects = raycaster.intersectObjects(targets, false);
        
        if (intersects.length > 0) {
            const target = intersects[0].object as THREE.Mesh;
            const targetName = target.userData.targetName;
            return { targetName, target };
        }
        
        return null;
    }

    public updateTargetPositions(): void {
        if (!this.ikSolver) return;
        
        // Sync all targets with their effector bones
        this.ikTargets.forEach(target => {
            // Use the stored effector bone from userData
            const effectorBone = target.userData.effectorBone;
            if (effectorBone) {
                this.syncTargetToEffector(target as THREE.Mesh, effectorBone);
            }
        });
    }

    public setVisible(visible: boolean): void {
        this.ikTargets.forEach(target => {
            target.visible = visible;
        });
    }

    public dispose(): void {
        // Clean up resources
        this.ikTargets.forEach(target => {
            this.scene.remove(target);
            target.geometry.dispose();
            (target.material as THREE.Material).dispose();
        });
        this.ikTargets.clear();
    }
}
