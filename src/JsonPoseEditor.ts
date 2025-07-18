export interface JsonPoseEditorCallbacks {
  exportPoseAsJson(): any;
  importPoseFromJson(jsonData: any): Promise<void>;
  showMessage(message: string, type: 'success' | 'error' | 'info' | 'warning'): void;
}

export class JsonPoseEditor {
  private callbacks: JsonPoseEditorCallbacks;
  private modal: HTMLElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(callbacks: JsonPoseEditorCallbacks) {
    this.callbacks = callbacks;
    this.setupElements();
    this.setupEventListeners();
  }

  private setupElements(): void {
    this.modal = document.getElementById('json-pose-modal');
    this.textarea = document.getElementById('json-pose-textarea') as HTMLTextAreaElement;
  }

  private setupEventListeners(): void {
    const jsonPoseButton = document.getElementById('json-pose-editor');
    const closeBtn = document.getElementById('close-json-modal');
    const cancelBtn = document.getElementById('cancel-json-modal');
    const exportCurrentBtn = document.getElementById('export-current-pose');
    const importFromJsonBtn = document.getElementById('import-from-json');
    const saveBtn = document.getElementById('save-json-pose');

    // Open modal
    jsonPoseButton?.addEventListener('click', () => {
      this.openModal();
    });

    // Close modal
    closeBtn?.addEventListener('click', () => this.closeModal());
    cancelBtn?.addEventListener('click', () => this.closeModal());

    // Close modal when clicking outside
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });

    // Export current pose
    exportCurrentBtn?.addEventListener('click', () => {
      this.populateJsonTextarea();
    });

    // Import from JSON
    importFromJsonBtn?.addEventListener('click', () => {
      this.importFromFile();
    });

    // Save pose
    saveBtn?.addEventListener('click', async () => {
      await this.savePose();
    });

    // Set up escape key handler
    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.modal?.style.display === 'flex') {
        this.closeModal();
      }
    };
    document.addEventListener('keydown', this.escapeHandler);
  }

  private openModal(): void {
    if (this.modal) {
      this.modal.style.display = 'flex';
      this.populateJsonTextarea();
    }
  }

  private closeModal(): void {
    if (this.modal) {
      this.modal.style.display = 'none';
    }
  }

  private populateJsonTextarea(): void {
    if (this.textarea) {
      const poseData = this.callbacks.exportPoseAsJson();
      this.textarea.value = JSON.stringify(poseData, null, 2);
    }
  }

  private importFromFile(): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const jsonString = event.target?.result as string;
          if (this.textarea) {
            this.textarea.value = jsonString;
          }
        };
        reader.readAsText(file);
      }
    };
    fileInput.click();
  }

  private async savePose(): Promise<void> {
    if (this.textarea) {
      try {
        const jsonData = JSON.parse(this.textarea.value);
        await this.callbacks.importPoseFromJson(jsonData);
        this.closeModal();
        this.callbacks.showMessage('Pose imported successfully!', 'success');
      } catch (error) {
        this.callbacks.showMessage('Invalid JSON format', 'error');
        console.error('JSON parse error:', error);
      }
    }
  }

  public dispose(): void {
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }
  }
}
