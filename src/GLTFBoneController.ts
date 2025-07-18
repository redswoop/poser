import * as THREE from 'three';
import { InverseKinematics } from './InverseKinematics';
import { ThreeJSIKController } from './ThreeJSIKController';

export class GLTFBoneController {
    private scene: THREE.Scene;
    private skeleton: THREE.Skeleton;
    private mesh: THREE.SkinnedMesh | null = null;
    public controls: THREE.Group;
    private boneControlMap: Map<THREE.Object3D, THREE.Bone> = new Map();
    private boneDepthMap: Map<THREE.Bone, number> = new Map();
    private currentScale: number = 1.0;
    private maxDepth: number = 10; // Default max depth
    private currentDepthLimit: number = 3; // Default visible depth
    private ikSolver: InverseKinematics;
    private threeJSIKController: ThreeJSIKController | null = null;
    private ikTargets: Map<string, THREE.Mesh> = new Map(); // Visual IK targets
    private ikMode: boolean = false;
    private ikControlMap: Map<THREE.Object3D, string> = new Map(); // Map IK controls to chain names

    constructor(scene: THREE.Scene, skeleton: THREE.Skeleton, mesh?: THREE.SkinnedMesh) {
        this.scene = scene;
        this.skeleton = skeleton;
        this.mesh = mesh || null;
        this.controls = new THREE.Group();
        this.controls.name = "GLTF_Bone_Controls";
        this.ikSolver = new InverseKinematics();
        this.controls.renderOrder = 1000; // Ensure controls group renders on top
        
        // Create controls after a small delay to ensure skeleton is properly positioned
        setTimeout(() => {
            this.calculateBoneDepths();
            this.createControls();
            this.scene.add(this.controls);
            // Apply any pending scale after controls are created
            this.setScale(this.currentScale);
            this.updateVisibilityByDepth();
            
            // Initialize Three.js IK system if we have a mesh
            if (this.mesh) {
                this.initializeThreeJSIK();
            }
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
        
        // Update IK target positions if in IK mode
        if (this.ikMode && this.ikTargets.size > 0) {
            this.updateIKTargetPositions();
        }
        
        // Update Three.js IK targets to stay synchronized with bones
        if (this.ikMode && this.threeJSIKController) {
            this.threeJSIKController.updateTargetPositions();
        }
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

    public getSkeleton(): THREE.Skeleton {
        return this.skeleton;
    }

    public getSkinnedMesh(): THREE.SkinnedMesh | null {
        return this.mesh;
    }

    /**
     * Create an IK chain from bone names
     */
    public createIKChain(chainName: string, boneNames: string[]): boolean {
        const bones: THREE.Bone[] = [];
        
        // Find bones by name
        for (const boneName of boneNames) {
            const bone = this.skeleton.bones.find(b => b.name === boneName);
            if (!bone) {
                console.error(`❌ Bone "${boneName}" not found for IK chain "${chainName}"`);
                return false;
            }
            bones.push(bone);
        }

        try {
            this.ikSolver.createChain(chainName, bones);
            console.log(`✅ Created IK chain "${chainName}" with bones: ${boneNames.join(', ')}`);
            
            // Create individual IK targets for each joint (except the root)
            this.createIKTargetsForChain(chainName, bones);
            
            return true;
        } catch (error) {
            console.error(`❌ Failed to create IK chain "${chainName}":`, error);
            return false;
        }
    }

    /**
     * Create common IK chains for a humanoid skeleton
     */
    public createCommonIKChains(): void {
        // First, let's discover what bones are actually available
        const availableBones = this.skeleton.bones.map(bone => bone.name);
        console.log('🔍 Available bones:', availableBones);

        // Try to find arm chains by looking for patterns
        this.createArmChains(availableBones);
        this.createLegChains(availableBones);

        console.log(`🦴 Created IK chains: ${this.ikSolver.getChainNames().join(', ')}`);
        
        // Debug: Log what IK targets were created
        console.log('🎯 IK Targets created:', Array.from(this.ikTargets.keys()));
        this.ikTargets.forEach((target, targetName) => {
            if (target.userData) {
                console.log(`  - ${targetName}: bone=${target.userData.boneName}, chain=${target.userData.chainName}, index=${target.userData.boneIndex}`);
            }
        });
    }

    private createArmChains(availableBones: string[]): void {
        console.log('🦾 Creating arm chains from available bones...');
        
        // Look for left arm chain - comprehensive patterns including elbows
        const leftArmPatterns = [
            ['LeftArm', 'LeftForeArm', 'LeftHand'],
            ['mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand'],
            ['LeftUpperArm', 'LeftLowerArm', 'LeftHand'],
            ['LeftUpperArm', 'LeftElbow', 'LeftHand'],
            ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'], // Include shoulder if available
            ['LeftShoulder', 'LeftUpperArm', 'LeftElbow', 'LeftHand'],
            ['Left_Shoulder', 'Left_Arm', 'Left_ForeArm', 'Left_Hand'],
            ['Left_Shoulder', 'Left_UpperArm', 'Left_Elbow', 'Left_Hand'],
            ['Left_UpperArm', 'Left_ForeArm', 'Left_Hand'],
            ['Left_UpperArm', 'Left_Elbow', 'Left_Hand'],
            ['l_shoulder', 'l_arm', 'l_forearm', 'l_hand'],
            ['l_shoulder', 'l_upperarm', 'l_elbow', 'l_hand'],
            ['l_upperarm', 'l_forearm', 'l_hand'],
            ['l_upperarm', 'l_elbow', 'l_hand']
        ];

        const rightArmPatterns = [
            ['RightArm', 'RightForeArm', 'RightHand'],
            ['mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand'],
            ['RightUpperArm', 'RightLowerArm', 'RightHand'],
            ['RightUpperArm', 'RightElbow', 'RightHand'],
            ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'], // Include shoulder if available
            ['RightShoulder', 'RightUpperArm', 'RightElbow', 'RightHand'],
            ['Right_Shoulder', 'Right_Arm', 'Right_ForeArm', 'Right_Hand'],
            ['Right_Shoulder', 'Right_UpperArm', 'Right_Elbow', 'Right_Hand'],
            ['Right_UpperArm', 'Right_ForeArm', 'Right_Hand'],
            ['Right_UpperArm', 'Right_Elbow', 'Right_Hand'],
            ['r_shoulder', 'r_arm', 'r_forearm', 'r_hand'],
            ['r_shoulder', 'r_upperarm', 'r_elbow', 'r_hand'],
            ['r_upperarm', 'r_forearm', 'r_hand'],
            ['r_upperarm', 'r_elbow', 'r_hand']
        ];

        console.log('🔍 Trying left arm patterns...');
        let leftArmFound = false;
        // Try to find matching patterns
        for (const pattern of leftArmPatterns) {
            console.log(`  Testing pattern: [${pattern.join(', ')}]`);
            const matches = pattern.map(boneName => availableBones.includes(boneName));
            console.log(`  Matches: [${matches.join(', ')}]`);
            
            if (pattern.every(boneName => availableBones.includes(boneName))) {
                this.createIKChain('leftArm', pattern);
                console.log(`✅ Created left arm chain with ${pattern.length} bones:`, pattern);
                leftArmFound = true;
                break;
            }
        }

        console.log('🔍 Trying right arm patterns...');
        let rightArmFound = false;
        for (const pattern of rightArmPatterns) {
            console.log(`  Testing pattern: [${pattern.join(', ')}]`);
            const matches = pattern.map(boneName => availableBones.includes(boneName));
            console.log(`  Matches: [${matches.join(', ')}]`);
            
            if (pattern.every(boneName => availableBones.includes(boneName))) {
                this.createIKChain('rightArm', pattern);
                console.log(`✅ Created right arm chain with ${pattern.length} bones:`, pattern);
                rightArmFound = true;
                break;
            }
        }

        // If no exact patterns match, try to find bones by keywords
        if (!leftArmFound) {
            console.log('⚠️ No exact left arm pattern found, trying keyword search...');
            
            // Try to find specific bone sequences for Mixamo models
            const leftArm = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('left') && 
                name.toLowerCase().includes('arm') &&
                !name.toLowerCase().includes('fore') // Exclude ForeArm
            );
            const leftForeArm = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('left') && 
                name.toLowerCase().includes('forearm')
            );
            const leftHand = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('left') && 
                name.toLowerCase().includes('hand')
            );
            
            console.log('🔍 Found arm bones:', { leftArm, leftForeArm, leftHand });
            
            if (leftArm && leftHand) {
                const leftArmChain = leftForeArm ? [leftArm, leftForeArm, leftHand] : [leftArm, leftHand];
                console.log('🔍 Found left arm bones by specific search:', leftArmChain);
                this.createIKChain('leftArm', leftArmChain);
                console.log(`✅ Created left arm chain via specific search with ${leftArmChain.length} bones:`, leftArmChain);
                leftArmFound = true;
            }
            
            // Fall back to general keyword search if specific search failed
            if (!leftArmFound) {
                const leftArmChain = this.findBoneChainByKeywords(availableBones, 
                    ['left', 'shoulder', 'upper'], ['left', 'arm', 'upper'], ['left', 'forearm', 'elbow', 'lower'], ['left', 'hand']);
                console.log('🔍 Found left arm bones by keywords:', leftArmChain);
                if (leftArmChain.length >= 2) { // Reduced from 3 to 2 for flexibility
                    this.createIKChain('leftArm', leftArmChain);
                    console.log(`✅ Created left arm chain via keywords with ${leftArmChain.length} bones:`, leftArmChain);
                } else {
                    console.log('❌ Not enough bones found for left arm chain');
                }
            }
        }

        if (!rightArmFound) {
            console.log('⚠️ No exact right arm pattern found, trying keyword search...');
            
            // Try to find specific bone sequences for Mixamo models
            const rightArm = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('right') && 
                name.toLowerCase().includes('arm') &&
                !name.toLowerCase().includes('fore') // Exclude ForeArm
            );
            const rightForeArm = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('right') && 
                name.toLowerCase().includes('forearm')
            );
            const rightHand = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('right') && 
                name.toLowerCase().includes('hand')
            );
            
            console.log('🔍 Found arm bones:', { rightArm, rightForeArm, rightHand });
            
            if (rightArm && rightHand) {
                const rightArmChain = rightForeArm ? [rightArm, rightForeArm, rightHand] : [rightArm, rightHand];
                console.log('🔍 Found right arm bones by specific search:', rightArmChain);
                this.createIKChain('rightArm', rightArmChain);
                console.log(`✅ Created right arm chain via specific search with ${rightArmChain.length} bones:`, rightArmChain);
                rightArmFound = true;
            }
            
            // Fall back to general keyword search if specific search failed
            if (!rightArmFound) {
                const rightArmChain = this.findBoneChainByKeywords(availableBones, 
                    ['right', 'shoulder', 'upper'], ['right', 'arm', 'upper'], ['right', 'forearm', 'elbow', 'lower'], ['right', 'hand']);
                console.log('🔍 Found right arm bones by keywords:', rightArmChain);
                if (rightArmChain.length >= 2) { // Reduced from 3 to 2 for flexibility
                    this.createIKChain('rightArm', rightArmChain);
                    console.log(`✅ Created right arm chain via keywords with ${rightArmChain.length} bones:`, rightArmChain);
                } else {
                    console.log('❌ Not enough bones found for right arm chain');
                }
            }
        }
    }

    private createLegChains(availableBones: string[]): void {
        console.log('🦵 Creating leg chains from available bones...');
        
        // Look for left leg chain - comprehensive patterns including knees
        const leftLegPatterns = [
            ['LeftUpLeg', 'LeftLeg', 'LeftFoot'],
            ['mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot'],
            ['LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot'],
            ['LeftThigh', 'LeftShin', 'LeftFoot'],
            ['LeftThigh', 'LeftKnee', 'LeftFoot'],
            ['Left_UpLeg', 'Left_Leg', 'Left_Foot'],
            ['Left_Thigh', 'Left_Shin', 'Left_Foot'],
            ['Left_Thigh', 'Left_Knee', 'Left_Foot'],
            ['l_thigh', 'l_calf', 'l_foot'],
            ['l_thigh', 'l_knee', 'l_foot'],
            ['l_upperleg', 'l_lowerleg', 'l_foot']
        ];

        const rightLegPatterns = [
            ['RightUpLeg', 'RightLeg', 'RightFoot'],
            ['mixamorig:RightUpLeg', 'mixamorig:RightLeg', 'mixamorig:RightFoot'],
            ['RightUpperLeg', 'RightLowerLeg', 'RightFoot'],
            ['RightThigh', 'RightShin', 'RightFoot'],
            ['RightThigh', 'RightKnee', 'RightFoot'],
            ['Right_UpLeg', 'Right_Leg', 'Right_Foot'],
            ['Right_Thigh', 'Right_Shin', 'Right_Foot'],
            ['Right_Thigh', 'Right_Knee', 'Right_Foot'],
            ['r_thigh', 'r_calf', 'r_foot'],
            ['r_thigh', 'r_knee', 'r_foot'],
            ['r_upperleg', 'r_lowerleg', 'r_foot']
        ];

        console.log('🔍 Trying left leg patterns...');
        let leftLegFound = false;
        // Try to find matching patterns
        for (const pattern of leftLegPatterns) {
            console.log(`  Testing pattern: [${pattern.join(', ')}]`);
            const matches = pattern.map(boneName => availableBones.includes(boneName));
            console.log(`  Matches: [${matches.join(', ')}]`);
            
            if (pattern.every(boneName => availableBones.includes(boneName))) {
                this.createIKChain('leftLeg', pattern);
                console.log(`✅ Created left leg chain with ${pattern.length} bones:`, pattern);
                leftLegFound = true;
                break;
            }
        }

        console.log('🔍 Trying right leg patterns...');
        let rightLegFound = false;
        for (const pattern of rightLegPatterns) {
            console.log(`  Testing pattern: [${pattern.join(', ')}]`);
            const matches = pattern.map(boneName => availableBones.includes(boneName));
            console.log(`  Matches: [${matches.join(', ')}]`);
            
            if (pattern.every(boneName => availableBones.includes(boneName))) {
                this.createIKChain('rightLeg', pattern);
                console.log(`✅ Created right leg chain with ${pattern.length} bones:`, pattern);
                rightLegFound = true;
                break;
            }
        }

        // If no exact patterns match, try to find bones by keywords
        if (!leftLegFound) {
            console.log('⚠️ No exact left leg pattern found, trying keyword search...');
            
            // Try to find specific bone sequences for Mixamo models
            const leftUpLeg = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('left') && 
                name.toLowerCase().includes('upleg')
            );
            const leftLeg = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('left') && 
                name.toLowerCase().includes('leg') &&
                !name.toLowerCase().includes('upleg') // Exclude UpLeg
            );
            const leftFoot = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('left') && 
                name.toLowerCase().includes('foot')
            );
            
            if (leftUpLeg && leftFoot) {
                const leftLegChain = leftLeg ? [leftUpLeg, leftLeg, leftFoot] : [leftUpLeg, leftFoot];
                console.log('🔍 Found left leg bones by specific search:', leftLegChain);
                this.createIKChain('leftLeg', leftLegChain);
                console.log(`✅ Created left leg chain via specific search with ${leftLegChain.length} bones:`, leftLegChain);
                leftLegFound = true;
            }
            
            // Fall back to general keyword search if specific search failed
            if (!leftLegFound) {
                const leftLegChain = this.findBoneChainByKeywords(availableBones, 
                    ['left', 'leg', 'thigh', 'up'], ['left', 'leg', 'calf', 'shin', 'knee', 'lower'], ['left', 'foot']);
                console.log('🔍 Found left leg bones by keywords:', leftLegChain);
                if (leftLegChain.length >= 2) {
                    this.createIKChain('leftLeg', leftLegChain);
                    console.log(`✅ Created left leg chain via keywords with ${leftLegChain.length} bones:`, leftLegChain);
                } else {
                    console.log('❌ Not enough bones found for left leg chain');
                }
            }
        }

        if (!rightLegFound) {
            console.log('⚠️ No exact right leg pattern found, trying keyword search...');
            
            // Try to find specific bone sequences for Mixamo models
            const rightUpLeg = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('right') && 
                name.toLowerCase().includes('upleg')
            );
            const rightLeg = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('right') && 
                name.toLowerCase().includes('leg') &&
                !name.toLowerCase().includes('upleg') // Exclude UpLeg
            );
            const rightFoot = availableBones.find(name => 
                name.toLowerCase().includes('mixamorig') && 
                name.toLowerCase().includes('right') && 
                name.toLowerCase().includes('foot')
            );
            
            if (rightUpLeg && rightFoot) {
                const rightLegChain = rightLeg ? [rightUpLeg, rightLeg, rightFoot] : [rightUpLeg, rightFoot];
                console.log('🔍 Found right leg bones by specific search:', rightLegChain);
                this.createIKChain('rightLeg', rightLegChain);
                console.log(`✅ Created right leg chain via specific search with ${rightLegChain.length} bones:`, rightLegChain);
                rightLegFound = true;
            }
            
            // Fall back to general keyword search if specific search failed
            if (!rightLegFound) {
                const rightLegChain = this.findBoneChainByKeywords(availableBones, 
                    ['right', 'leg', 'thigh', 'up'], ['right', 'leg', 'calf', 'shin', 'knee', 'lower'], ['right', 'foot']);
                console.log('🔍 Found right leg bones by keywords:', rightLegChain);
                if (rightLegChain.length >= 2) {
                    this.createIKChain('rightLeg', rightLegChain);
                    console.log(`✅ Created right leg chain via keywords with ${rightLegChain.length} bones:`, rightLegChain);
                } else {
                    console.log('❌ Not enough bones found for right leg chain');
                }
            }
        }
    }

    private findBoneChainByKeywords(availableBones: string[], ...keywordSets: string[][]): string[] {
        const foundBones: string[] = [];
        
        console.log('🔍 Searching for bones with keyword sets:', keywordSets);

        for (const keywords of keywordSets) {
            console.log(`  Looking for bone with keywords: [${keywords.join(', ')}]`);
            let bestMatch = '';
            let bestScore = 0;

            for (const boneName of availableBones) {
                const lowerBoneName = boneName.toLowerCase();
                let score = 0;

                // Check if any of the keywords are present (more flexible)
                for (const keyword of keywords) {
                    if (lowerBoneName.includes(keyword.toLowerCase())) {
                        score++;
                    }
                }

                // Require at least one keyword match, prefer more matches
                if (score > 0 && score > bestScore) {
                    bestScore = score;
                    bestMatch = boneName;
                }
            }

            if (bestMatch) {
                console.log(`    Found: ${bestMatch} (score: ${bestScore})`);
                foundBones.push(bestMatch);
            } else {
                console.log(`    No match found for keywords: [${keywords.join(', ')}]`);
            }
        }

        console.log('🔍 Final bone chain:', foundBones);
        return foundBones;
    }

    /**
     * Solve IK for a chain to reach a target position
     */
    public solveIK(chainName: string, targetPosition: THREE.Vector3): boolean {
        const target = this.ikTargets.get(chainName);
        if (target) {
            target.position.copy(targetPosition);
            target.visible = true;
        }
        
        const success = this.ikSolver.solve(chainName, targetPosition);
        if (success) {
            console.log(`✅ IK solved for chain "${chainName}"`);
        }
        
        return success;
    }

    /**
     * Show/hide IK target for a chain
     */
    public showIKTarget(chainName: string, visible: boolean): void {
        const target = this.ikTargets.get(chainName);
        if (target) {
            target.visible = visible;
        }
    }

    /**
     * Get the current end effector position for an IK chain
     */
    public getIKEndEffectorPosition(chainName: string): THREE.Vector3 | null {
        return this.ikSolver.getEndEffectorPosition(chainName);
    }

    /**
     * Get all available IK chain names
     */
    public getIKChainNames(): string[] {
        return this.ikSolver.getChainNames();
    }

    /**
     * Get bone names for a specific IK chain
     */
    public getIKChainBones(chainName: string): string[] {
        return this.ikSolver.getChainBoneNames(chainName);
    }

    /**
     * Clear all IK chains and targets
     */
    public clearIKChains(): void {
        // Remove visual targets from scene
        this.ikTargets.forEach(target => {
            this.scene.remove(target);
        });
        this.ikTargets.clear();
        
        // Clear IK solver
        this.ikSolver.clear();
        
        console.log('🗑️ Cleared all IK chains');
    }

    /**
     * Set IK mode - show/hide appropriate controls
     */
    public setIKMode(ikModeActive: boolean): void {
        this.ikMode = ikModeActive;
        console.log(`🦾 IK Mode: ${ikModeActive ? 'ON' : 'OFF'}`);
        
        if (ikModeActive) {
            // Hide regular bone controls
            this.controls.children.forEach(control => {
                control.visible = false;
            });
            
            // Show Three.js IK targets
            if (this.threeJSIKController) {
                this.threeJSIKController.setVisible(true);
                console.log('🎯 Three.js IK targets visible');
            }
            
            // Show legacy IK targets (if any)
            this.ikTargets.forEach((target, targetName) => {
                target.visible = true;
                console.log(`👁️ Showing legacy IK target: ${targetName}`);
            });
            
            console.log(`🎯 IK Mode Active - Using Three.js CCDIKSolver`);
        } else {
            // Show regular bone controls (respecting depth limit)
            this.updateVisibilityByDepth();
            
            // Hide Three.js IK targets
            if (this.threeJSIKController) {
                this.threeJSIKController.setVisible(false);
                console.log('🙈 Three.js IK targets hidden');
            }
            
            // Hide legacy IK targets
            this.ikTargets.forEach((target, targetName) => {
                target.visible = false;
                console.log(`🙈 Hiding legacy IK target: ${targetName}`);
            });
        }
    }

    /**
     * Solve IK for a specific joint target
     */
    public solveIKForJoint(targetName: string, targetPosition: THREE.Vector3): boolean {
        // Try Three.js IK system first
        if (this.threeJSIKController) {
            const success = this.threeJSIKController.setIKTargetPosition(targetName, targetPosition);
            if (success) {
                console.log(`✅ Three.js IK solved for target "${targetName}"`);
                return true;
            }
        }
        
        // Fall back to legacy IK system
        const target = this.ikTargets.get(targetName);
        if (!target) {
            console.error(`❌ IK target "${targetName}" not found in both Three.js and legacy systems`);
            return false;
        }

        const chainName = target.userData.chainName;
        const boneIndex = target.userData.boneIndex;
        const boneName = target.userData.boneName;
        
        console.log(`🦾 Solving legacy IK for joint ${boneName} (index ${boneIndex}) in chain ${chainName}`);
        
        // Get the chain
        const chain = this.ikSolver.getChain(chainName);
        if (!chain) {
            console.error(`❌ Chain "${chainName}" not found`);
            return false;
        }
        
        // Update the target position
        target.position.copy(targetPosition);
        
        // Use a VERY simple approach - just point the bone at the target
        const success = this.solveSimplePointingIK(chain, boneIndex, targetPosition);
        
        if (success) {
            console.log(`✅ Legacy IK solved for joint "${boneName}"`);
            // Update positions of all targets in this chain after solving
            this.updateChainTargetPositions(chainName);
        } else {
            console.warn(`⚠️ Legacy IK solve failed for joint "${boneName}"`);
        }
        
        return success;
    }

    /**
     * Ultra-simple IK: just point the parent bone at the target
     */
    private solveSimplePointingIK(chain: any, targetBoneIndex: number, targetPosition: THREE.Vector3): boolean {
        const bones = chain.bones;
        
        if (targetBoneIndex === bones.length - 1) {
            // End effector - point the second-to-last bone at the target
            return this.pointBoneAtTarget(bones, bones.length - 2, targetPosition);
        } else {
            // Intermediate joint - point the parent bone at the target
            return this.pointBoneAtTarget(bones, targetBoneIndex - 1, targetPosition);
        }
    }

    /**
     * Point a specific bone at a target position
     */
    private pointBoneAtTarget(bones: THREE.Bone[], boneIndex: number, targetPosition: THREE.Vector3): boolean {
        if (boneIndex < 0 || boneIndex >= bones.length) return false;
        
        const bone = bones[boneIndex];
        const boneWorldPos = new THREE.Vector3();
        bone.getWorldPosition(boneWorldPos);
        
        // Calculate direction to target
        const toTarget = new THREE.Vector3().subVectors(targetPosition, boneWorldPos);
        if (toTarget.length() < 0.01) return true; // Too close, don't move
        
        // Get current direction (to next bone or default forward)
        let currentDirection = new THREE.Vector3(0, 1, 0); // Default up
        if (boneIndex < bones.length - 1) {
            const nextBone = bones[boneIndex + 1];
            const nextBonePos = new THREE.Vector3();
            nextBone.getWorldPosition(nextBonePos);
            currentDirection.subVectors(nextBonePos, boneWorldPos);
        }
        
        if (currentDirection.length() < 0.01) return true; // Invalid direction
        
        // Calculate rotation
        currentDirection.normalize();
        toTarget.normalize();
        
        const rotation = new THREE.Quaternion();
        rotation.setFromUnitVectors(currentDirection, toTarget);
        
        // Apply rotation VERY gradually to prevent jumping
        const dampingFactor = 0.1; // Very slow movement
        bone.quaternion.slerp(bone.quaternion.clone().premultiply(rotation), dampingFactor);
        
        return true;
    }

    /**
     * Solve IK for intermediate joints in a chain (e.g., elbows, knees)
     */
    /*
    // UNUSED - Kept for reference
    private solveMidChainIK(chain: any, targetBoneIndex: number, targetPosition: THREE.Vector3): boolean {
        const bones = chain.bones;
        
        if (targetBoneIndex <= 0 || targetBoneIndex >= bones.length) {
            console.error(`❌ Invalid bone index ${targetBoneIndex} for chain with ${bones.length} bones`);
            return false;
        }
        
        const targetBone = bones[targetBoneIndex];
        const parentBone = bones[targetBoneIndex - 1];
        
        // Get current positions
        const parentWorldPos = new THREE.Vector3();
        const targetCurrentPos = new THREE.Vector3();
        parentBone.getWorldPosition(parentWorldPos);
        targetBone.getWorldPosition(targetCurrentPos);
        
        // Calculate the desired direction from parent to target
        const desiredDirection = new THREE.Vector3().subVectors(targetPosition, parentWorldPos);
        const currentDirection = new THREE.Vector3().subVectors(targetCurrentPos, parentWorldPos);
        
        // Don't move if the movement is too small
        if (desiredDirection.length() < 0.01) return true;
        
        // Calculate the rotation needed for the parent bone
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(currentDirection.normalize(), desiredDirection.normalize());
        
        // Apply rotation with smoothing to prevent jumpiness
        const smoothingFactor = 0.4; // Moderate smoothing for responsiveness
        parentBone.quaternion.slerp(parentBone.quaternion.clone().premultiply(quaternion), smoothingFactor);
        
        // Update matrices
        parentBone.updateWorldMatrix(true, false);
        targetBone.updateWorldMatrix(true, false);
        
        // If there are more bones in the chain after the target, use stable end-effector IK
        if (targetBoneIndex < bones.length - 1) {
            const endBone = bones[bones.length - 1];
            const originalEndPos = new THREE.Vector3();
            endBone.getWorldPosition(originalEndPos);
            
            // Create a sub-chain from the target bone to the end
            const subChainBones = bones.slice(targetBoneIndex);
            
            // Use the stable end-effector IK for the remaining chain
            this.solveMultiBoneStable(subChainBones, originalEndPos);
        }
        
        return true;
    }

    /**
     * Simple two-bone IK solver for knee/elbow chains
     */
    /*
    // UNUSED - Kept for reference
    private solveTwoBoneIK(subChain: any): void {
        const bones = subChain.bones;
        if (bones.length < 2) return;
        
        const rootBone = bones[0];
        const middleBone = bones[1];
        const target = subChain.target;
        
        const rootPos = new THREE.Vector3();
        const middlePos = new THREE.Vector3();
        rootBone.getWorldPosition(rootPos);
        middleBone.getWorldPosition(middlePos);
        
        // Calculate bone lengths
        const upperLength = rootPos.distanceTo(middlePos);
        const lowerLength = bones.length > 2 ? 
            middlePos.distanceTo(target) : 
            middlePos.distanceTo(new THREE.Vector3().addVectors(middlePos, new THREE.Vector3(0, 1, 0)));
        
        // Simple analytic two-bone IK
        const targetDir = new THREE.Vector3().subVectors(target, rootPos);
        const targetDistance = targetDir.length();
        
        if (targetDistance > upperLength + lowerLength) {
            // Target too far, stretch
            targetDir.normalize();
            const newMiddlePos = rootPos.clone().add(targetDir.clone().multiplyScalar(upperLength));
            
            // Point first bone towards target
            const rootDirection = new THREE.Vector3().subVectors(newMiddlePos, rootPos).normalize();
            const currentDirection = new THREE.Vector3().subVectors(middlePos, rootPos).normalize();
            
            const rotation = new THREE.Quaternion();
            rotation.setFromUnitVectors(currentDirection, rootDirection);
            rootBone.quaternion.premultiply(rotation);
        }
    }

    /**
     * Stable end-effector IK solver that prevents jumping
     */
    /*
    // UNUSED - Kept for reference
    private solveStableEndEffectorIK(chain: any, targetPosition: THREE.Vector3): boolean {
        const bones = chain.bones;
        if (bones.length < 2) return false;
        
        // For 2-bone chains (like arms/legs), use analytic solution
        if (bones.length === 2) {
            return this.solveTwoBoneAnalytic(bones[0], bones[1], targetPosition);
        }
        
        // For longer chains, use iterative approach with smoothing
        return this.solveMultiBoneStable(bones, targetPosition);
    }

    /**
     * Analytic two-bone IK (very stable, no jumping)
     */
    /*
    // UNUSED - Kept for reference
    private solveTwoBoneAnalytic(rootBone: THREE.Bone, endBone: THREE.Bone, targetPosition: THREE.Vector3): boolean {
        const rootPos = new THREE.Vector3();
        const endPos = new THREE.Vector3();
        rootBone.getWorldPosition(rootPos);
        endBone.getWorldPosition(endPos);
        
        // Calculate bone lengths
        const upperLength = rootPos.distanceTo(endPos);
        const lowerLength = upperLength * 0.8; // Estimate lower segment
        
        // Vector from root to target
        const toTarget = new THREE.Vector3().subVectors(targetPosition, rootPos);
        const targetDistance = toTarget.length();
        
        // Clamp target distance to reachable range
        const maxReach = upperLength + lowerLength;
        const minReach = Math.abs(upperLength - lowerLength);
        const clampedDistance = Math.max(minReach, Math.min(maxReach, targetDistance));
        
        if (clampedDistance !== targetDistance) {
            // Adjust target position to be reachable
            toTarget.normalize().multiplyScalar(clampedDistance);
            targetPosition = rootPos.clone().add(toTarget);
        }
        
        // Calculate angles using law of cosines
        const a = upperLength;
        const b = lowerLength;
        const c = clampedDistance;
        
        // Angle at root joint
        const cosAngleA = (a * a + c * c - b * b) / (2 * a * c);
        // const angleA = Math.acos(Math.max(-1, Math.min(1, cosAngleA))); // Currently unused
        
        // Direction to target
        const targetDir = toTarget.normalize();
        
        // Calculate the rotation for the root bone
        const currentDir = new THREE.Vector3().subVectors(endPos, rootPos).normalize();
        const rotation = new THREE.Quaternion();
        rotation.setFromUnitVectors(currentDir, targetDir);
        
        // Apply rotation smoothly
        const smoothingFactor = 0.3; // Reduce for more stability, increase for more responsiveness
        rootBone.quaternion.slerp(rootBone.quaternion.clone().premultiply(rotation), smoothingFactor);
        
        return true;
    }

    /**
     * Stable multi-bone IK with smoothing
     */
    /*
    // UNUSED - Kept for reference
    private solveMultiBoneStable(bones: THREE.Bone[], targetPosition: THREE.Vector3): boolean {
        // Use a simplified CCD (Cyclic Coordinate Descent) approach with smoothing
        const maxIterations = 3; // Reduced iterations for stability
        const smoothingFactor = 0.2; // Heavy smoothing to prevent jumping
        
        for (let iteration = 0; iteration < maxIterations; iteration++) {
            // Work backwards through the chain
            for (let i = bones.length - 2; i >= 0; i--) {
                const bone = bones[i];
                const endEffector = bones[bones.length - 1];
                
                const bonePos = new THREE.Vector3();
                const endPos = new THREE.Vector3();
                bone.getWorldPosition(bonePos);
                endEffector.getWorldPosition(endPos);
                
                // Vectors from bone to end effector and bone to target
                const toEnd = new THREE.Vector3().subVectors(endPos, bonePos);
                const toTarget = new THREE.Vector3().subVectors(targetPosition, bonePos);
                
                // Skip if vectors are too small
                if (toEnd.length() < 0.001 || toTarget.length() < 0.001) continue;
                
                // Calculate rotation needed
                toEnd.normalize();
                toTarget.normalize();
                
                const rotation = new THREE.Quaternion();
                rotation.setFromUnitVectors(toEnd, toTarget);
                
                // Apply rotation with smoothing
                bone.quaternion.slerp(bone.quaternion.clone().premultiply(rotation), smoothingFactor);
            }
        }
        
        return true;
    }

    /**
     * Update all target positions for a specific chain
     */
    private updateChainTargetPositions(chainName: string): void {
        this.ikTargets.forEach((target) => {
            if (target.userData.chainName === chainName) {
                const bone = this.skeleton.bones.find(b => b.name === target.userData.boneName);
                if (bone) {
                    const worldPosition = new THREE.Vector3();
                    bone.getWorldPosition(worldPosition);
                    target.position.copy(worldPosition);
                }
            }
        });
    }

    /**
     * Update all IK target positions
     */
    public updateIKTargetPositions(): void {
        this.ikTargets.forEach((target) => {
            if (target.userData.boneName) {
                const bone = this.skeleton.bones.find(b => b.name === target.userData.boneName);
                if (bone) {
                    const worldPosition = new THREE.Vector3();
                    bone.getWorldPosition(worldPosition);
                    target.position.copy(worldPosition);
                }
            }
        });
    }

    /**
     * Get all IK control objects
     */
    public getIKControls(): THREE.Object3D[] {
        const controls: THREE.Object3D[] = [];
        
        // Add Three.js IK targets
        if (this.threeJSIKController) {
            controls.push(...this.threeJSIKController.getIKTargets());
        }
        
        // Add legacy IK targets (if any)
        controls.push(...Array.from(this.ikTargets.values()));
        
        return controls;
    }

    /**
     * Get target name from IK control object
     */
    public getTargetNameFromIKControl(control: THREE.Object3D): string | null {
        // Check if it's a Three.js IK target
        if (control.userData && control.userData.targetName) {
            return control.userData.targetName;
        }
        
        // Check legacy IK targets
        return this.ikControlMap.get(control) || null;
    }

    /**
     * Get chain name from IK control object (legacy method)
     */
    public getChainNameFromIKControl(control: THREE.Object3D): string | null {
        const targetName = this.ikControlMap.get(control);
        if (targetName && targetName.includes('_')) {
            return targetName.split('_')[0]; // Extract chain name from target name
        }
        return targetName || null;
    }

    /**
     * Create individual IK targets for each joint in a chain (except the root)
     */
    private createIKTargetsForChain(chainName: string, bones: THREE.Bone[]): void {
        // Skip the root bone (first one in the chain) - for arm chains, this would be the shoulder
        // Create targets for all other joints in the chain
        for (let i = 1; i < bones.length; i++) {
            const bone = bones[i];
            const targetName = `${chainName}_${bone.name}`;
            
            // Create octahedral geometry for IK targets (different from sphere bone controls)
            const geometry = new THREE.OctahedronGeometry(0.12, 0);
            const material = new THREE.MeshBasicMaterial({ 
                color: 0x8A2BE2, // Purple for IK targets
                transparent: true,
                opacity: 0.8,
                depthTest: false
            });
            
            const target = new THREE.Mesh(geometry, material);
            target.name = `IK_Target_${targetName}`;
            target.renderOrder = 1002; // Render above bone controls
            target.visible = false; // Hidden by default, shown in IK mode
            
            // Store metadata about which bone and chain this target controls
            target.userData = {
                chainName: chainName,
                boneName: bone.name,
                boneIndex: i,
                isIKTarget: true
            };
            
            // Position the target at the bone's world position
            const worldPosition = new THREE.Vector3();
            bone.getWorldPosition(worldPosition);
            target.position.copy(worldPosition);
            
            this.ikTargets.set(targetName, target);
            this.ikControlMap.set(target, targetName);
            this.scene.add(target);
            
            console.log(`🎯 Created IK target for ${bone.name} in chain ${chainName}`);
        }
    }

    private initializeThreeJSIK(): void {
        if (!this.mesh) {
            console.warn('⚠️ Cannot initialize Three.js IK without a mesh');
            return;
        }
        
        console.log('🎯 Initializing Three.js CCDIKSolver...');
        this.threeJSIKController = new ThreeJSIKController(this.scene, this.mesh);
        console.log('✅ Three.js IK system initialized');
    }

    public setMesh(mesh: THREE.SkinnedMesh): void {
        this.mesh = mesh;
        this.initializeThreeJSIK();
    }
}
