// BWS Visual Editor - Main JavaScript
class BWSEditor {
    constructor() {
        this.changes = [];
        this.currentEditingElement = null;
        this.originalContent = {};
        this.draggedElement = null;
        this.undoStack = [];
        this.redoStack = [];
        
        this.init();
    }
    
    init() {
        this.loadDemoSite();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.makeElementsEditable();
    }
    
    // Load the demo site content
    async loadDemoSite() {
        try {
            const response = await fetch('./index.html');
            const html = await response.text();
            
            // Parse the HTML to extract content and styles
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extract and inject inline styles
            const inlineStyles = doc.querySelector('style');
            if (inlineStyles) {
                document.getElementById('demo-styles').textContent = inlineStyles.textContent;
            }
            
            // Also load external stylesheets from the demo
            const linkTags = doc.querySelectorAll('link[rel="stylesheet"]');
            linkTags.forEach(link => {
                const newLink = document.createElement('link');
                newLink.rel = 'stylesheet';
                newLink.href = link.getAttribute('href');
                document.head.insertBefore(newLink, document.querySelector('#demo-styles'));
            });
            
            // Also load external scripts from the demo (non-blocking)
            const scriptTags = doc.querySelectorAll('script[src]');
            scriptTags.forEach(script => {
                const newScript = document.createElement('script');
                newScript.src = script.getAttribute('src');
                newScript.defer = true;
                document.body.appendChild(newScript);
            });
            
            // Extract and inject body content
            const bodyContent = doc.body.innerHTML;
            document.getElementById('site-container').innerHTML = bodyContent;
            
            // Store original content for change tracking
            this.storeOriginalContent();
            
            // Re-setup after content load
            setTimeout(() => {
                this.makeElementsEditable();
                this.addSectionHandles();
            }, 100);
            
        } catch (error) {
            console.error('Failed to load demo site:', error);
            // Fallback: show error message
            document.getElementById('site-container').innerHTML = `
                <div style="padding: 40px; text-align: center; color: #666;">
                    <h2>Demo Site Loading Error</h2>
                    <p>Unable to load demo.html. Please ensure the file exists.</p>
                </div>
            `;
        }
    }
    
    // Store original content for change tracking
    storeOriginalContent() {
        const elements = document.querySelectorAll('[data-editable], h1, h2, h3, p, button, a');
        elements.forEach(el => {
            this.originalContent[this.generateElementId(el)] = {
                content: el.innerHTML,
                text: el.textContent,
                src: el.src || null,
                href: el.href || null
            };
        });
    }
    
    // Generate unique ID for elements
    generateElementId(element) {
        return `${element.tagName.toLowerCase()}_${element.textContent.slice(0, 20).replace(/\s+/g, '_')}`;
    }
    
    // Setup all event listeners
    setupEventListeners() {
        // Toolbar buttons
        document.getElementById('preview-btn').addEventListener('click', () => this.togglePreview());
        document.getElementById('theme-btn').addEventListener('click', () => this.openThemePanel());
        document.getElementById('save-btn').addEventListener('click', () => this.saveChanges());
        document.getElementById('submit-btn').addEventListener('click', () => this.submitChanges());
        document.getElementById('undo-btn').addEventListener('click', () => this.undo());
        document.getElementById('redo-btn').addEventListener('click', () => this.redo());
        
        // Books toggle
        document.getElementById('books-toggle').addEventListener('change', (e) => {
            this.toggleBooks(e.target.checked);
        });
        
        // Panel controls
        document.getElementById('panel-close').addEventListener('click', () => this.closePanel());
        document.getElementById('panel-overlay').addEventListener('click', () => this.closePanel());
        
        // Text editing toolbar
        document.getElementById('text-done').addEventListener('click', () => this.finishTextEditing());
        
        // Modal controls
        document.getElementById('modal-close-btn').addEventListener('click', () => this.closeModal('success-modal'));
        document.getElementById('save-cancel').addEventListener('click', () => this.closeModal('save-modal'));
        document.getElementById('save-confirm').addEventListener('click', () => this.confirmSave());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }
    
    // Make elements editable
    makeElementsEditable() {
        // Text elements
        const textElements = document.querySelectorAll('h1, h2, h3, p, .hero-tagline, .hero-artist, .hero-location, button, a');
        textElements.forEach(el => {
            if (!el.closest('.editor-toolbar') && !el.closest('.side-panel')) {
                el.setAttribute('data-editable', 'text');
                el.addEventListener('click', (e) => this.startTextEditing(e));
            }
        });
        
        // Images
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            if (!img.closest('.editor-toolbar')) {
                this.makeImageEditable(img);
            }
        });
        
        // Sections for reordering
        const sections = document.querySelectorAll('section');
        sections.forEach(section => {
            section.setAttribute('data-section', section.id || section.className);
        });
    }
    
    // Make images editable
    makeImageEditable(img) {
        img.setAttribute('data-editable', 'image');
        
        // Create edit overlay
        const overlay = document.createElement('div');
        overlay.className = 'image-edit-overlay';
        overlay.innerHTML = '<span class="image-edit-icon">📷</span>';
        
        // Wrap image in container if not already
        if (!img.parentElement.classList.contains('image-container')) {
            const container = document.createElement('div');
            container.className = 'image-container';
            container.style.position = 'relative';
            container.style.display = 'inline-block';
            img.parentElement.insertBefore(container, img);
            container.appendChild(img);
            container.appendChild(overlay);
        }
        
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openImagePanel(img);
        });
    }
    
    // Add drag handles to sections
    addSectionHandles() {
        const sections = document.querySelectorAll('section');
        sections.forEach((section, index) => {
            if (!section.querySelector('.section-handle')) {
                const handle = document.createElement('div');
                handle.className = 'section-handle';
                handle.setAttribute('draggable', 'true');
                handle.setAttribute('data-section-index', index);
                section.style.position = 'relative';
                section.appendChild(handle);
            }
        });
    }
    
    // Text editing
    startTextEditing(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const element = event.target.closest('[data-editable="text"]');
        if (!element || element === this.currentEditingElement) return;
        
        // Finish any current editing
        if (this.currentEditingElement) {
            this.finishTextEditing();
        }
        
        this.currentEditingElement = element;
        element.classList.add('editing');
        element.contentEditable = true;
        element.focus();
        
        // Show text toolbar
        this.showTextToolbar(element);
        
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
    
    showTextToolbar(element) {
        const toolbar = document.getElementById('text-toolbar');
        const rect = element.getBoundingClientRect();
        
        toolbar.style.left = `${rect.left}px`;
        toolbar.style.top = `${rect.bottom + 10}px`;
        toolbar.classList.add('show');
        
        // Setup toolbar buttons
        const buttons = toolbar.querySelectorAll('.text-btn[data-action]');
        buttons.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const action = btn.dataset.action;
                document.execCommand(action, false, null);
                btn.classList.toggle('active');
            };
        });
    }
    
    finishTextEditing() {
        if (!this.currentEditingElement) return;
        
        const element = this.currentEditingElement;
        const elementId = this.generateElementId(element);
        const newContent = element.textContent;
        const originalContent = this.originalContent[elementId]?.text || '';
        
        if (newContent !== originalContent) {
            this.trackChange('text', elementId, originalContent, newContent, element);
        }
        
        element.classList.remove('editing');
        element.contentEditable = false;
        this.currentEditingElement = null;
        
        // Hide toolbar
        document.getElementById('text-toolbar').classList.remove('show');
    }
    
    // Theme panel
    openThemePanel() {
        const panel = document.getElementById('side-panel');
        const title = document.getElementById('panel-title');
        const content = document.getElementById('panel-content');
        
        title.textContent = 'Theme Settings';
        content.innerHTML = `
            <div class="color-picker">
                <label for="primary-color">Primary Color</label>
                <input type="color" id="primary-color" value="#000000">
            </div>
            <div class="color-picker">
                <label for="accent-color">Accent Color</label>
                <input type="color" id="accent-color" value="#ff6b35">
            </div>
            <div class="color-picker">
                <label for="background-color">Background Color</label>
                <input type="color" id="background-color" value="#ffffff">
            </div>
        `;
        
        // Setup color change listeners
        content.querySelectorAll('input[type="color"]').forEach(input => {
            input.addEventListener('change', (e) => this.updateThemeColor(e.target.id, e.target.value));
        });
        
        this.openPanel();
    }
    
    updateThemeColor(property, value) {
        const cssProperty = `--${property.replace('-', '-')}`;
        document.documentElement.style.setProperty(cssProperty, value);
        
        this.trackChange('theme', property, null, value);
    }
    
    // Image panel
    openImagePanel(img) {
        const panel = document.getElementById('side-panel');
        const title = document.getElementById('panel-title');
        const content = document.getElementById('panel-content');
        
        title.textContent = 'Edit Image';
        content.innerHTML = `
            <div class="image-upload-zone" id="image-upload">
                <div class="upload-icon">📷</div>
                <div class="upload-text">
                    <strong>Click to upload</strong> or drag image here<br>
                    <small>JPG, PNG, GIF up to 5MB</small>
                </div>
            </div>
            <div class="image-preview" id="image-preview" style="display: none;">
                <img class="preview-img" id="preview-img" src="">
                <div>
                    <button class="btn primary" id="apply-image">Apply Changes</button>
                </div>
            </div>
            <input type="file" id="image-input" accept="image/*" style="display: none;">
        `;
        
        const uploadZone = content.querySelector('#image-upload');
        const fileInput = content.querySelector('#image-input');
        const preview = content.querySelector('#image-preview');
        const previewImg = content.querySelector('#preview-img');
        const applyBtn = content.querySelector('#apply-image');
        
        // Click to select file
        uploadZone.addEventListener('click', () => fileInput.click());
        
        // File selection
        fileInput.addEventListener('change', (e) => {
            this.handleImageUpload(e.target.files[0], preview, previewImg);
        });
        
        // Drag and drop
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
        
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });
        
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            this.handleImageUpload(e.dataTransfer.files[0], preview, previewImg);
        });
        
        // Apply changes
        applyBtn.addEventListener('click', () => {
            const newSrc = previewImg.src;
            const originalSrc = img.src;
            img.src = newSrc;
            
            this.trackChange('image', this.generateElementId(img), originalSrc, newSrc, img);
            this.closePanel();
        });
        
        this.openPanel();
    }
    
    handleImageUpload(file, preview, previewImg) {
        if (!file || !file.type.startsWith('image/')) {
            alert('Please select a valid image file.');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            alert('Image size must be less than 5MB.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
    
    // Panel management
    openPanel() {
        document.getElementById('side-panel').classList.add('open');
        document.getElementById('panel-overlay').classList.add('show');
    }
    
    closePanel() {
        document.getElementById('side-panel').classList.remove('open');
        document.getElementById('panel-overlay').classList.remove('show');
    }
    
    // Books toggle
    toggleBooks(isOpen) {
        const banner = document.getElementById('books-banner');
        if (banner) {
            banner.textContent = isOpen ? 
                '📅 BOOKS OPEN - Accepting new clients' : 
                '❌ BOOKS CLOSED - Not accepting new clients';
            banner.style.background = isOpen ? 'var(--accent-color)' : '#dc2626';
        }
        
        this.trackChange('books', 'status', null, isOpen ? 'open' : 'closed');
    }
    
    // Drag and drop for sections
    setupDragAndDrop() {
        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('section-handle')) {
                this.draggedElement = e.target.closest('section');
                this.draggedElement.classList.add('section-dragging');
            }
        });
        
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (this.draggedElement) {
                const section = e.target.closest('section');
                if (section && section !== this.draggedElement) {
                    this.showDropZone(section);
                }
            }
        });
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            if (this.draggedElement) {
                const targetSection = e.target.closest('section');
                if (targetSection && targetSection !== this.draggedElement) {
                    this.reorderSections(this.draggedElement, targetSection);
                }
                this.cleanupDrag();
            }
        });
        
        document.addEventListener('dragend', () => {
            this.cleanupDrag();
        });
    }
    
    showDropZone(section) {
        document.querySelectorAll('.drop-zone').forEach(zone => zone.remove());
        
        const dropZone = document.createElement('div');
        dropZone.className = 'drop-zone';
        section.parentElement.insertBefore(dropZone, section);
    }
    
    reorderSections(draggedSection, targetSection) {
        const parent = draggedSection.parentElement;
        const draggedIndex = Array.from(parent.children).indexOf(draggedSection);
        const targetIndex = Array.from(parent.children).indexOf(targetSection);
        
        if (draggedIndex < targetIndex) {
            parent.insertBefore(draggedSection, targetSection.nextSibling);
        } else {
            parent.insertBefore(draggedSection, targetSection);
        }
        
        this.trackChange('section-order', 'reorder', `${draggedIndex}`, `${targetIndex}`);
    }
    
    cleanupDrag() {
        if (this.draggedElement) {
            this.draggedElement.classList.remove('section-dragging');
            this.draggedElement = null;
        }
        document.querySelectorAll('.drop-zone').forEach(zone => zone.remove());
    }
    
    // Change tracking
    trackChange(type, id, oldValue, newValue, element = null) {
        const change = {
            type,
            id,
            oldValue,
            newValue,
            timestamp: Date.now(),
            element: element ? this.getElementSelector(element) : null
        };
        
        this.changes.push(change);
        this.undoStack.push(change);
        this.redoStack = []; // Clear redo stack on new change
        
        this.updateUndoRedoButtons();
    }
    
    getElementSelector(element) {
        if (element.id) return `#${element.id}`;
        if (element.className) return `.${element.className.split(' ')[0]}`;
        return element.tagName.toLowerCase();
    }
    
    // Undo/Redo
    undo() {
        if (this.undoStack.length === 0) return;
        
        const change = this.undoStack.pop();
        this.redoStack.push(change);
        this.applyChange(change, true);
        this.updateUndoRedoButtons();
    }
    
    redo() {
        if (this.redoStack.length === 0) return;
        
        const change = this.redoStack.pop();
        this.undoStack.push(change);
        this.applyChange(change, false);
        this.updateUndoRedoButtons();
    }
    
    applyChange(change, reverse) {
        const value = reverse ? change.oldValue : change.newValue;
        
        switch (change.type) {
            case 'text':
                const textElement = document.querySelector(change.element);
                if (textElement) textElement.textContent = value;
                break;
            case 'theme':
                const cssProperty = `--${change.id.replace('-', '-')}`;
                document.documentElement.style.setProperty(cssProperty, value);
                break;
            case 'books':
                const toggle = document.getElementById('books-toggle');
                toggle.checked = value === 'open';
                this.toggleBooks(toggle.checked);
                break;
            // Add more cases as needed
        }
    }
    
    updateUndoRedoButtons() {
        document.getElementById('undo-btn').disabled = this.undoStack.length === 0;
        document.getElementById('redo-btn').disabled = this.redoStack.length === 0;
    }
    
    // Preview mode
    togglePreview() {
        const body = document.body;
        const isPreview = body.classList.contains('preview-mode');
        
        if (isPreview) {
            body.classList.remove('preview-mode');
            document.getElementById('preview-btn').innerHTML = '<span class="btn-icon">👁</span> Preview';
        } else {
            body.classList.add('preview-mode');
            document.getElementById('preview-btn').innerHTML = '<span class="btn-icon">✏️</span> Edit';
            this.finishTextEditing();
            this.closePanel();
        }
    }
    
    // Save functionality
    saveChanges() {
        const changesPreview = this.generateChangesJSON();
        document.getElementById('changes-preview').textContent = JSON.stringify(changesPreview, null, 2);
        document.getElementById('save-modal').classList.add('show');
    }
    
    confirmSave() {
        const changes = this.generateChangesJSON();
        localStorage.setItem('bws-editor-changes', JSON.stringify(changes));
        localStorage.setItem('bws-editor-timestamp', Date.now().toString());
        
        this.closeModal('save-modal');
        
        // Show success feedback
        const saveBtn = document.getElementById('save-btn');
        const originalHTML = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="btn-icon">✓</span> Saved!';
        saveBtn.style.background = 'var(--editor-success)';
        
        setTimeout(() => {
            saveBtn.innerHTML = originalHTML;
            saveBtn.style.background = '';
        }, 2000);
    }
    
    submitChanges() {
        const changes = this.generateChangesJSON();
        
        // In production, this would send to BWS API
        console.log('Submitting changes to BWS:', changes);
        
        // Show success modal
        document.getElementById('success-modal').classList.add('show');
        
        // Reset changes after submission
        this.changes = [];
        this.undoStack = [];
        this.redoStack = [];
        this.updateUndoRedoButtons();
    }
    
    generateChangesJSON() {
        return {
            timestamp: Date.now(),
            site: 'tattoo-temple-houston',
            changes: this.changes.map(change => ({
                type: change.type,
                id: change.id,
                oldValue: change.oldValue,
                newValue: change.newValue,
                element: change.element,
                timestamp: change.timestamp
            })),
            metadata: {
                totalChanges: this.changes.length,
                booksStatus: document.getElementById('books-toggle').checked ? 'open' : 'closed',
                lastModified: new Date().toISOString()
            }
        };
    }
    
    // Modal management
    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }
    
    // Keyboard shortcuts
    handleKeyboard(event) {
        if (event.ctrlKey || event.metaKey) {
            switch (event.key) {
                case 'z':
                    event.preventDefault();
                    if (event.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                    break;
                case 's':
                    event.preventDefault();
                    this.saveChanges();
                    break;
                case 'p':
                    event.preventDefault();
                    this.togglePreview();
                    break;
            }
        }
        
        if (event.key === 'Escape') {
            if (this.currentEditingElement) {
                this.finishTextEditing();
            } else {
                this.closePanel();
            }
        }
    }
}

// Initialize the editor when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.bwsEditor = new BWSEditor();
});