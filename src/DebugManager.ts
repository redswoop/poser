/**
 * DebugManager handles all development-time debugging functionality.
 * Only active in development mode to avoid exposing debug methods in production.
 */
export class DebugManager {
  private app: any; // Will be properly typed when integrated
  private debugEnabled: boolean;

  constructor(app: any) {
    this.app = app;
    // Only enable debug in development mode (Vite sets this automatically)
    this.debugEnabled = import.meta.env.DEV;
  }

  /**
   * Sets up all debug commands by attaching them to the window object
   */
  public setupDebugCommands(): void {
    if (!this.debugEnabled) {
      console.log('🔧 Debug commands disabled in production mode');
      return;
    }

    console.log('🛠️ Setting up debug commands...');

    // Attach debug methods to window for easy access in browser console
    (window as any).debugIK = () => this.debugIK();
    (window as any).debugBones = () => this.debugBones();
    (window as any).testIKMode = () => this.testIKMode();
    (window as any).debugCharacter = () => this.debugCharacter();
    (window as any).debugRenderer = () => this.debugRenderer();

    console.log('✅ Debug commands available:');
    console.log('  - debugIK() - Show IK chain and target information');
    console.log('  - debugBones() - List and categorize all bones');
    console.log('  - testIKMode() - Enter interactive IK mode');
    console.log('  - debugCharacter() - Show character state information');
    console.log('  - debugRenderer() - Show renderer information');
  }

  /**
   * Debug IK chains and targets
   */
  private debugIK(): void {
    console.log('🦾 === IK DEBUG INFO ===');
    
    const boneController = this.app.getRenderer().getBoneController();
    if (!boneController) {
      console.warn('❌ No bone controller found!');
      return;
    }

    console.log('🦾 IK Debug Info:');
    console.log('- IK Chains:', boneController.getIKChainNames());
    console.log('- IK Mode:', (boneController as any).ikMode);
    console.log('- IK Targets:', (boneController as any).ikTargets);
    console.log('- Interactive IK Mode:', this.app.getInteractiveIKMode());
    console.log('- Alt Pressed:', this.app.getAltPressed());
    
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
    
    console.log('🦾 === END IK DEBUG ===');
  }

  /**
   * Debug and categorize all available bones
   */
  private debugBones(): void {
    console.log('🦴 === BONE DEBUG INFO ===');
    
    const boneController = this.app.getRenderer().getBoneController();
    if (!boneController) {
      console.warn('❌ No bone controller found!');
      return;
    }

    const skeleton = (boneController as any).skeleton;
    if (!skeleton) {
      console.warn('❌ No skeleton found!');
      return;
    }

    console.log('🦴 Available Bones:');
    skeleton.bones.forEach((bone: any, index: number) => {
      console.log(`  ${index}: ${bone.name}`);
    });
    
    // Categorize bones by type
    this.categorizeBones(skeleton.bones);
    
    console.log('🦴 === END BONE DEBUG ===');
  }

  /**
   * Categorize bones into different types (arms, legs, etc.)
   */
  private categorizeBones(bones: any[]): void {
    // Specifically look for elbow and knee-like bones
    console.log('\n🔍 Looking for elbow-like bones:');
    const elbowBones = bones.filter((bone: any) => {
      const name = bone.name.toLowerCase();
      return name.includes('elbow') || name.includes('forearm') || 
             name.includes('lowerarm') || name.includes('lower_arm');
    });
    elbowBones.forEach((bone: any) => console.log(`  Found: ${bone.name}`));
    
    console.log('\n🔍 Looking for knee-like bones:');
    const kneeBones = bones.filter((bone: any) => {
      const name = bone.name.toLowerCase();
      return name.includes('knee') || name.includes('leg') || 
             name.includes('shin') || name.includes('calf') || 
             name.includes('lowerleg') || name.includes('lower_leg');
    });
    kneeBones.forEach((bone: any) => console.log(`  Found: ${bone.name}`));
    
    console.log('\n🔍 Looking for all arm bones:');
    const armBones = bones.filter((bone: any) => {
      const name = bone.name.toLowerCase();
      return name.includes('arm') || name.includes('hand') || 
             name.includes('shoulder') || name.includes('elbow');
    });
    armBones.forEach((bone: any) => console.log(`  Found: ${bone.name}`));
    
    console.log('\n🔍 Looking for all leg bones:');
    const legBones = bones.filter((bone: any) => {
      const name = bone.name.toLowerCase();
      return name.includes('leg') || name.includes('foot') || 
             name.includes('thigh') || name.includes('knee') || 
             name.includes('shin') || name.includes('calf');
    });
    legBones.forEach((bone: any) => console.log(`  Found: ${bone.name}`));
  }

  /**
   * Test entering interactive IK mode
   */
  private testIKMode(): void {
    console.log('🧪 Testing IK Mode...');
    this.app.enterInteractiveIKMode();
  }

  /**
   * Debug character state information
   */
  private debugCharacter(): void {
    console.log('🎭 === CHARACTER DEBUG INFO ===');
    const character = this.app.getCharacter();
    console.log('Model Path:', character.modelPath);
    console.log('Settings:', character.getSettings());
    console.log('Default Pose:', Object.keys(character.defaultPose || {}).length, 'bones');
    console.log('Selected Joint:', this.app.getSelectedJoint());
    console.log('Has Skeleton:', !!character.skeleton);
    console.log('Has GLTF Model:', !!character.gltfModel);
    console.log('🎭 === END CHARACTER DEBUG ===');
  }

  /**
   * Debug renderer information
   */
  private debugRenderer(): void {
    console.log('🎨 === RENDERER DEBUG INFO ===');
    const renderer = this.app.getRenderer();
    console.log('Bone Control Mode:', renderer.boneControlMode);
    console.log('Settings:', renderer.getSettings());
    console.log('Camera Position:', renderer.getCamera().position);
    console.log('Has GLTF Model:', !!renderer.getGLTFModel());
    console.log('Has Bone Controller:', !!renderer.getBoneController());
    console.log('Bone Depth Limit:', renderer.getBoneDepthLimit());
    console.log('🎨 === END RENDERER DEBUG ===');
  }

  /**
   * Remove debug commands from window (cleanup)
   */
  public cleanup(): void {
    if (!this.debugEnabled) return;

    delete (window as any).debugIK;
    delete (window as any).debugBones;
    delete (window as any).testIKMode;
    delete (window as any).debugCharacter;
    delete (window as any).debugRenderer;
    
    console.log('🧹 Debug commands cleaned up');
  }
}
