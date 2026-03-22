'use strict';

let gl;                        
let surfaceProgram;            
let surfaceBufferData;          
let quadBufferData;             
let rotator;                    
let centerOfMass = [0, 0, 0];   
let textures = {};              
let startTime = Date.now();
let phoneRotationMatrix = m4.identity(); // Глобальна матриця обертання

let renderSettings = {
    enableLighting: true,
    useDiffuse: true,
    useNormal: true
};


/**
 * Ініціалізація додатка
 */
async function init() {
    try {
        const canvas = document.getElementById("webglcanvas");
        
        gl = canvas.getContext("webgl");
        if (!gl) throw new Error("WebGL не підтримується");

        window.startTime = Date.now(); 

        textures.diffuse = loadTexture(gl, './textures/Stone_Floor_002_DIFFUSE.jpg');
        textures.normal = loadTexture(gl, './textures/Stone_Floor_002_NORM.jpg');
        textures.specular = loadTexture(gl, './textures/Stone_Floor_002_SPEC.jpg');

        surfaceProgram = createProgram(gl, vertexShaderSource, fragmentShaderSource);
        
        rotator = new TrackballRotator(canvas, null, 15);

        quadBufferData = createBackgroundBuffers(gl);

        updateSurface();

        document.getElementById("btnToggleCam").onclick = () => {
            initWebcam(gl);
        };

        canvas.addEventListener("wheel", (event) => {
            event.preventDefault(); 

            const fovInput = document.getElementById("fov");
            const fovLabel = document.getElementById("valFOV");
            
            if (fovInput) {
                let currentFov = parseFloat(fovInput.value);
                
                const step = 2;
                if (event.deltaY < 0) {
                    currentFov = Math.max(currentFov - step, 10);  
                } else {
                    currentFov = Math.min(currentFov + step, 120); 
                }

                fovInput.value = currentFov;
                if (fovLabel) fovLabel.innerText = currentFov;
            }
        }, { passive: false });

        requestAnimationFrame(draw);
    } catch (e) {
        console.error("Помилка ініціалізації: ", e);
    }
}

/**
 * Перебудова геометрії та розрахунок центру мас
 */
function updateSurface() {
    const a = parseFloat(document.getElementById("paramA").value);
    const b = parseFloat(document.getElementById("paramB").value);
    const c = parseFloat(document.getElementById("paramC").value);
    const d = parseFloat(document.getElementById("paramD").value);
    const uSteps = parseInt(document.getElementById("paramU").value);
    const vSteps = parseInt(document.getElementById("paramV").value);

    const data = CreateVirichSurfaceData(a, b, c, d, uSteps, vSteps, 2 * Math.PI, 2 * Math.PI);
    const fillIndices = generateIndices(uSteps, vSteps);
    const lineIndices = generateLineIndices(uSteps, vSteps);

    centerOfMass = calculateCenterOfMass(data.verts);

    surfaceBufferData = {
        vertices: createBuffer(gl, new Float32Array(data.verts)),
        normals: createBuffer(gl, new Float32Array(data.normals)),
        uvs: createBuffer(gl, new Float32Array(data.uvs)),
        tangents: createBuffer(gl, new Float32Array(data.tangents)),
        bitangents: createBuffer(gl, new Float32Array(data.bitangents)),
        fillIndices: createIndexBuffer(gl, new Uint16Array(fillIndices)),
        fillCount: fillIndices.length,
        lineIndices: createIndexBuffer(gl, new Uint16Array(lineIndices)),
        lineCount: lineIndices.length
    };
}

/**
 * Головний цикл малювання
 */
/**
 * Головний цикл малювання з підтримкою вибору режиму керування
 */
function draw() {
    const canvas = gl.canvas;
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = canvas.width / canvas.height;
    
    const eyeSep = parseFloat(document.getElementById("eyeSep").value);
    const convergence = parseFloat(document.getElementById("convergence").value);
    const fov = degToRad(parseFloat(document.getElementById("fov").value));
    const near = parseFloat(document.getElementById("near").value);
    const far = 100.0;

    if (isWebcamEnabled()) {
        updateWebcamTexture(gl);
        drawBackground();
    }

    // ВИБІР РЕЖИМУ КЕРУВАННЯ
    const usePhone = document.getElementById("usePhoneTUI") && document.getElementById("usePhoneTUI").checked;
    let baseViewMatrix;

    if (usePhone) {
        // Режим TUI (iPhone): копіюємо матрицю повороту та додаємо дистанцію перегляду
        baseViewMatrix = m4.copy(phoneRotationMatrix);
        baseViewMatrix[14] -= 15; // Відсуваємо камеру на 15 одиниць, щоб бачити фігуру
    } else {
        // Режим PA1: використовуємо стандартний трекбол-ротатор (мишка)
        baseViewMatrix = rotator.getViewMatrix();
    }

    const eyes = [
        { id: -1, mask: [true, false, false, true] }, 
        { id: 1, mask: [false, true, true, true] }    
    ];

    eyes.forEach(eye => {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.colorMask(...eye.mask);

        const stereo = getStereoMatrices(eye.id, eyeSep, convergence, fov, aspect, near, far);
        
        // Модельна матриця зміщує об'єкт так, щоб обертання йшло навколо центру мас
        const modelMatrix = m4.translation(-centerOfMass[0], -centerOfMass[1], -centerOfMass[2]);
        
        // eyeTranslation додає зміщення для лівого/правого ока поверх основної матриці вигляду
        const eyeViewMatrix = m4.multiply(stereo.eyeTranslation, baseViewMatrix);

        renderObject(stereo.projection, eyeViewMatrix, modelMatrix);
    });

    gl.colorMask(true, true, true, true);
    requestAnimationFrame(draw);
}

/**
 * Рендеринг моделі 
 */
function renderObject(projection, view, model) {
    gl.useProgram(surfaceProgram);

    const locs = {
        vertex: gl.getAttribLocation(surfaceProgram, "vertex"),
        normal: gl.getAttribLocation(surfaceProgram, "normal"),
        uv: gl.getAttribLocation(surfaceProgram, "uv"),
        tangent: gl.getAttribLocation(surfaceProgram, "tangent"),
        bitangent: gl.getAttribLocation(surfaceProgram, "bitangent")
    };

    bindAttr(locs.vertex, surfaceBufferData.vertices, 3);
    bindAttr(locs.normal, surfaceBufferData.normals, 3);
    bindAttr(locs.uv, surfaceBufferData.uvs, 2);
    bindAttr(locs.tangent, surfaceBufferData.tangents, 3);
    bindAttr(locs.bitangent, surfaceBufferData.bitangents, 3);

    gl.uniformMatrix4fv(gl.getUniformLocation(surfaceProgram, "ProjectionMatrix"), false, projection);
    gl.uniformMatrix4fv(gl.getUniformLocation(surfaceProgram, "ViewMatrix"), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(surfaceProgram, "ModelMatrix"), false, model);

    const normalMatrix = m4.transpose(m4.inverse(model));
    const normalMatrix3 = new Float32Array([
        normalMatrix[0], normalMatrix[1], normalMatrix[2],
        normalMatrix[4], normalMatrix[5], normalMatrix[6],
        normalMatrix[8], normalMatrix[9], normalMatrix[10]
    ]);
    gl.uniformMatrix3fv(gl.getUniformLocation(surfaceProgram, "NormalMatrix"), false, normalMatrix3);

    updateRenderSettings();
    const uColorLoc = gl.getUniformLocation(surfaceProgram, "uColor");
    const uIsLightLoc = gl.getUniformLocation(surfaceProgram, "uIsLight");

    const currentTime = (Date.now() - startTime) * 0.001;
    const radius = 15.0;
    const lightX = Math.cos(currentTime) * radius;
    const lightZ = Math.sin(currentTime) * radius;
    const lightY = 10.0;

    gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uLightPosition"), [lightX, lightY, lightZ]);
    gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uAmbientColor"), [0.2, 0.2, 0.2]);
    gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uDiffuseColor"), [1.0, 1.0, 1.0]);
    gl.uniform1f(gl.getUniformLocation(surfaceProgram, "uShininess"), 32.0);

    gl.uniform1i(uIsLightLoc, 0); 
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uEnableLighting"), renderSettings.enableLighting ? 1 : 0);
    
    gl.uniform4f(uColorLoc, 0.3, 0.3, 0.3, 1.0); 

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.diffuse);
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uDiffuseMap"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.normal);
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uNormalMap"), 1);

    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uUseDiffuseMap"), renderSettings.useDiffuse ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uUseNormalMap"), renderSettings.useNormal ? 1 : 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surfaceBufferData.fillIndices);
    gl.drawElements(gl.TRIANGLES, surfaceBufferData.fillCount, gl.UNSIGNED_SHORT, 0);

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 1.0); 

    gl.uniform1i(uIsLightLoc, 1); 
    gl.uniform4f(uColorLoc, 1.0, 1.0, 1.0, 1.0); 
    
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surfaceBufferData.lineIndices);
    gl.drawElements(gl.LINES, surfaceBufferData.lineCount, gl.UNSIGNED_SHORT, 0);

    gl.disable(gl.POLYGON_OFFSET_FILL);
}

/**
 * Рендеринг відеопотоку як фону
 */
function drawBackground() {
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(surfaceProgram);

    const identity = m4.identity();
    gl.uniformMatrix4fv(gl.getUniformLocation(surfaceProgram, "ProjectionMatrix"), false, identity);
    gl.uniformMatrix4fv(gl.getUniformLocation(surfaceProgram, "ViewMatrix"), false, identity);
    gl.uniformMatrix4fv(gl.getUniformLocation(surfaceProgram, "ModelMatrix"), false, identity);

    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uEnableLighting"), 0);
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uIsLight"), 0); 
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uUseDiffuseMap"), 1);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, webcamTexture);
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uDiffuseMap"), 0);

    const locPos = gl.getAttribLocation(surfaceProgram, "vertex");
    const locUV = gl.getAttribLocation(surfaceProgram, "uv");
    bindAttr(locPos, quadBufferData.vBuffer, 3);
    bindAttr(locUV, quadBufferData.uBuffer, 2);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.DEPTH_TEST);
}

/**
 * Допоміжні функції
 */
function bindAttr(loc, buffer, size) {
    if (loc >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(loc);
    }
}

function createBuffer(gl, data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
}

function createIndexBuffer(gl, data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
}


function updateRenderSettings() {
    const lightingCheck = document.getElementById("enableLighting");
    if (lightingCheck) {
        renderSettings.enableLighting = lightingCheck.checked;
    }

    const diffCheck = document.getElementById("useDiffuseMap");
    if (diffCheck) {
        renderSettings.useDiffuse = diffCheck.checked;
    }
    
    const normalCheck = document.getElementById("useNormalMap");
    if (normalCheck) {
        renderSettings.useNormal = normalCheck.checked;
    }
}

function createProgram(gl, vSrc, fSrc) {
    const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
        return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fSrc));
    gl.linkProgram(prog);
    return prog;
}

function loadTexture(gl, url) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 200, 200, 255]));
    
    const image = new Image();
    image.onload = function() {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
    };
    image.src = url;
    return texture;
}

function resetView() {
    rotator = new TrackballRotator(gl.canvas, null, 15);
}

function connectToPhone() {
    const socket = new WebSocket('ws://192.168.0.103:8080');
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Кути від сервера:", data);
        const a = degToRad(data.alpha); // Кут навколо Z
        const b = degToRad(data.beta);  // Кут навколо X
        const g = degToRad(data.gamma); // Кут навколо Y

        let m = m4.identity();
        m = m4.zRotate(m, a);
        m = m4.xRotate(m, b);
        m = m4.yRotate(m, g);

        phoneRotationMatrix = m;
    };

    socket.onopen = () => console.log("Підключено до сенсорів!");
    socket.onerror = (err) => console.error("Помилка WebSocket:", err);
}