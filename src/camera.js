let webcamVideo = null;
let webcamTexture = null;
let isWebcamPlaying = false;

/**
 * Ініціалізує доступ до веб-камери та створює WebGL текстуру.
 * @param {WebGLRenderingContext} gl - Контекст WebGL.
 */
async function initWebcam(gl) {
    webcamVideo = document.getElementById("webcam");

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720 }, 
            audio: false 
        });
        
        webcamVideo.srcObject = stream;
        webcamVideo.onloadedmetadata = () => {
            webcamVideo.play();
            isWebcamPlaying = true;
            console.log("Webcam stream started successfully.");
        };
        
        webcamTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, webcamTexture);
        
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
    } catch (err) {
        console.error("Error accessing webcam: ", err);
        alert("Could not access webcam. Please ensure you have given permissions.");
    }
}

/**
 * Оновлює дані текстури камери поточним кадром відео.
 * @param {WebGLRenderingContext} gl - Контекст WebGL.
 */
function updateWebcamTexture(gl) {
    if (isWebcamPlaying && webcamTexture) {
        gl.bindTexture(gl.TEXTURE_2D, webcamTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, webcamVideo);
    }
}

/**
 * Створює буфери WebGL для фонового прямокутника.
 * @param {WebGLRenderingContext} gl 
 */
function createBackgroundBuffers(gl) {
    const data = createBackgroundQuad();
    
    const vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.vertices), gl.STATIC_DRAW);
    
    const uBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.uvs), gl.STATIC_DRAW);
    
    return { vBuffer, uBuffer };
}

/**
 * Повертає геометрію для прямокутника (NDC: від -1 до 1).
 */
function createBackgroundQuad() {
    const vertices = [
        -1.0,  1.0,  0.0,
        -1.0, -1.0,  0.0,
         1.0,  1.0,  0.0,
         1.0, -1.0,  0.0
    ];
    
    const uvs = [
        0.0, 0.0,
        0.0, 1.0,
        1.0, 0.0,
        1.0, 1.0
    ];
    
    return { vertices, uvs };
}

/**
 * Перевіряє стан чекбокса в інтерфейсі.
 */
function isWebcamEnabled() {
    const checkbox = document.getElementById("enableWebcam");
    return checkbox ? checkbox.checked : false;
}