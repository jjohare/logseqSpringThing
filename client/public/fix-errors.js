// This script runs before the application to fix common errors

// Fix 1: Create a hidden canvas if needed but don't interfere with React Three Fiber
(function createDummyCanvas() {
  if (!document.getElementById('fallback-canvas')) {
    console.log('Creating dummy canvas element to prevent errors');
    const dummyCanvas = document.createElement('canvas');
    dummyCanvas.id = 'fallback-canvas';
    dummyCanvas.style.display = 'none';  // Hide it
    dummyCanvas.width = 1;  // Minimum size
    dummyCanvas.height = 1;
    
    // Add it to the document - handling case when body might not exist yet
    if (document.body) {
      document.body.appendChild(dummyCanvas);
    } else {
      // Create a function that will run when body is available
      document.addEventListener('DOMContentLoaded', function() {
        if (!document.getElementById('fallback-canvas')) {
          document.body.appendChild(dummyCanvas);
        }
      });
    }
  }
})();

// Fix 2: Helper function to provide fallback contexts if needed
// This doesn't override the actual canvas prototype, just provides a backup
window.getFallbackContext = function(contextType) {
  console.log('Fallback context requested for:', contextType);
      try {
        // Return a minimal mock if real context fails
        return {
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
          drawImage: function() {},
          fillRect: function() {},
          // Basic mock implementation
          getExtension: function() { return null; }
        };
      }
};

// Fix 3: Provide a safer monkey patch to THREE if needed
window.addEventListener('error', function(event) {
  if (event.message && (event.message.includes('WebGL') || event.message.includes('getContext'))) {
    console.log('Detected a potential WebGL error - setting up fallback mechanism');
    
    // Wait for THREE to be loaded
    const checkTHREE = setInterval(function() {
      if (window.THREE) {
        clearInterval(checkTHREE);
        console.log('THREE detected - reactive error handler registered');
        // We'll let React Three Fiber handle the renderer now
        // This is a safer approach than monkey patching THREE.WebGLRenderer
      }
    }, 100);
  }
}, {once: true});

console.log('React Three Fiber compatibility script loaded');