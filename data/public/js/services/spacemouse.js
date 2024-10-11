// Spacemouse HID interface

const SPACEMOUSE_VENDOR_ID = 0x256F; // 3Dconnexion vendor ID
const SPACEMOUSE_PRODUCT_ID = 0xC635; // SpaceMouse Compact product ID (may vary for different models)

let spacemouseDevice = null;

async function requestHIDAccess() {
    try {
        const devices = await navigator.hid.requestDevice({
            filters: [{ vendorId: SPACEMOUSE_VENDOR_ID, productId: SPACEMOUSE_PRODUCT_ID }]
        });
        if (devices.length > 0) {
            spacemouseDevice = devices[0];
            await spacemouseDevice.open();
            console.log('HID device opened:', spacemouseDevice.productName);
            spacemouseDevice.addEventListener('inputreport', handleHIDInput);
        }
    } catch (error) {
        console.error('HID access denied:', error);
    }
}

function handleHIDInput(event) {
    const { data } = event;
    
    // Parse the input data
    const x = data.getInt16(1, true);
    const y = data.getInt16(3, true);
    const z = data.getInt16(5, true);

    // Normalize values (adjust as needed based on your Spacemouse model)
    const normalizedX = x / 350;
    const normalizedY = y / 350;
    const normalizedZ = z / 350;

    // Emit an event with the normalized values
    const spacemouseEvent = new CustomEvent('spacemouse-move', {
        detail: { x: normalizedX, y: normalizedY, z: normalizedZ }
    });
    window.dispatchEvent(spacemouseEvent);
}

// Function to be called when the "Enable Spacemouse" button is clicked
function enableSpacemouse() {
    if (navigator.hid) {
        requestHIDAccess();
    } else {
        console.error('WebHID is not supported in this browser');
        alert('WebHID is not supported in this browser. Please use a compatible browser like Chrome or Edge.');
    }
}

// Export the function to be used in Vue components
export { enableSpacemouse };