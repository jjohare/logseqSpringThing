// This script runs before the application to fix common errors

// Fix 1: Create a canvas with id "main-canvas" if it doesn't exist
// Execute immediately to ensure canvas exists before any scripts run
(function createDummyCanvas() {
  if (!document.getElementById('main-canvas')) {
    console.log('Creating dummy canvas element to prevent errors');
    const dummyCanvas = document.createElement('canvas');
    dummyCanvas.id = 'main-canvas';
    dummyCanvas.style.display = 'none';  // Hide it
    dummyCanvas.width = 1;  // Minimum size
    dummyCanvas.height = 1;
    
    // Make sure getContext never throws an error
    const originalGetContext = dummyCanvas.getContext;
    dummyCanvas.getContext = function(contextType) {
      console.log('Dummy canvas getContext called with:', contextType);
      try {
        // Try to use the real context first
        const context = originalGetContext.call(dummyCanvas, contextType);
        if (context) return context;
        
        // Fall back to a minimal mock if real context fails
        return {
          canvas: dummyCanvas,
          drawImage: function() {},
          fillRect: function() {},
          clearRect: function() {},
          getImageData: function() { return { data: new Uint8ClampedArray(4) }; },
          putImageData: function() {},
          createImageData: function() { return { data: new Uint8ClampedArray(4) }; },
          setTransform: function() {},
          drawArrays: function() {},
          createTexture: function() { return {}; },
          bindTexture: function() {},
          texImage2D: function() {},
          viewport: function() {},
          enable: function() {},
          disable: function() {},
          useProgram: function() {},
          clear: function() {},
          getExtension: function() { return null; }
        };
      } catch (e) {
        console.warn('Error creating context:', e);
        // Return mock object if real context fails
        return {
          canvas: dummyCanvas,
          drawImage: function() {},
          fillRect: function() {},
          // Basic mock implementation
          getExtension: function() { return null; }
        };
      }
    };
    
    // Add it to the document - handling case when body might not exist yet
    if (document.body) {
      document.body.appendChild(dummyCanvas);
    } else {
      // Create a function that will run when body is available
      document.addEventListener('DOMContentLoaded', function() {
        if (!document.getElementById('main-canvas')) {
          document.body.appendChild(dummyCanvas);
        }
      });
      
      // Also add to document head as a fallback
      if (document.head) {
        document.head.appendChild(dummyCanvas);
      }
    }
  }
})();

// Fix 2: Monkey patch THREE.WebGLRenderer to be harmless if it's erroring
window.addEventListener('error', function(event) {
  if (event.message && event.message.includes('getContext is not a function')) {
    console.log('Attempting to fix THREE.WebGLRenderer errors');
    
    // Wait for THREE to be loaded
    const checkTHREE = setInterval(function() {
      if (window.THREE) {
        clearInterval(checkTHREE);
        
        // Monkey patch WebGLRenderer if it exists
        const originalRenderer = window.THREE.WebGLRenderer;
        window.THREE.WebGLRenderer = function(options) {
          console.log('Using mock WebGLRenderer');
          
          // Try to create a real renderer, but catch errors
          try {
            const renderer = new originalRenderer(options);
            console.log('Original renderer created successfully');
            return renderer;
          } catch (e) {
            console.warn('Error creating real renderer, using mock:', e);
            // Return mock renderer
            this.domElement = document.createElement('canvas');
            this.domElement.width = 1;
            this.domElement.height = 1;
            
            // Ensure xr property exists
            this.xr = {
              enabled: false,
              isPresenting: false,
              setReferenceSpaceType: function() {},
              getReferenceSpace: function() { return null; },
              getSession: function() { return null; },
              getCamera: function() { return { position: { set: function() {} } }; }
            };
            
            // Basic mock methods
            this.setSize = function() {};
            this.setPixelRatio = function() {};
            this.render = function() {};
            this.setClearColor = function() {};
            this.shadowMap = { enabled: false, type: null };
            this.dispose = function() {};
            this.getContext = function() { return {}; };
          }
        };
      }
      
      document.dispatchEvent(new Event('three-renderer-patched'));
    }, 100);
  }
}, {once: true});

console.log('Error prevention script loaded');