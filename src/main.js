'use strict';

let gl;                         // Контекст WebGL
let surfaceProgram;             // Основна шейдерна програма
let surfaceBufferData;          // Буфери моделі
let quadBufferData;             // Буфери для фону камери
let rotator;                    // Об'єкт TrackballRotator
let centerOfMass = [0, 0, 0];   // Центр мас моделі
let textures = {};              // Об'єкт для збереження текстур (виправлено: додано ініціалізацію)
let startTime = Date.now();

// Об'єкт для збереження стану інтерфейсу
let renderSettings = {
    enableLighting: true,
    useDiffuse: true,
    useNormal: true
};

/**
 * Ініціалізація додатка
 */
/**
 * Ініціалізація додатка
 */
async function init() {
    try {
        const canvas = document.getElementById("webglcanvas");
        
        gl = canvas.getContext("webgl");
        if (!gl) throw new Error("WebGL не підтримується");

        // Ініціалізація часу для динамічного освітлення
        window.startTime = Date.now(); // Використовуємо глобальну змінну для доступу в draw()

        // Завантаження текстур
        textures.diffuse = loadTexture(gl, './textures/Stone_Floor_002_DIFFUSE.jpg');
        textures.normal = loadTexture(gl, './textures/Stone_Floor_002_NORM.jpg');
        textures.specular = loadTexture(gl, './textures/Stone_Floor_002_SPEC.jpg');

        // Створення програми шейдерів
        surfaceProgram = createProgram(gl, vertexShaderSource, fragmentShaderSource);
        
        // Ініціалізація TrackballRotator
        rotator = new TrackballRotator(canvas, null, 15);

        // Ініціалізація буферів для фону камери (з camera.js)
        quadBufferData = createBackgroundBuffers(gl);

        // Початкова побудова поверхні
        updateSurface();

        // Налаштування кнопки камери
        document.getElementById("btnToggleCam").onclick = () => {
            initWebcam(gl);
        };

        // --- ДОДАНО: Керування FOV коліщатком миші ---
        canvas.addEventListener("wheel", (event) => {
            event.preventDefault(); // Запобігаємо прокрутці сторінки

            const fovInput = document.getElementById("fov");
            const fovLabel = document.getElementById("valFOV");
            
            if (fovInput) {
                let currentFov = parseFloat(fovInput.value);
                
                // Зміна FOV (deltaY < 0 - вперед/зум, deltaY > 0 - назад)
                const step = 2;
                if (event.deltaY < 0) {
                    currentFov = Math.max(currentFov - step, 10);  // Мінімум 10 градусів
                } else {
                    currentFov = Math.min(currentFov + step, 120); // Максимум 120 градусів
                }

                fovInput.value = currentFov;
                if (fovLabel) fovLabel.innerText = currentFov;
            }
        }, { passive: false });

        // Запуск циклу рендерингу
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

    const eyes = [
        { id: -1, mask: [true, false, false, true] }, // Red
        { id: 1, mask: [false, true, true, true] }    // Cyan
    ];

    eyes.forEach(eye => {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.colorMask(...eye.mask);

        const stereo = getStereoMatrices(eye.id, eyeSep, convergence, fov, aspect, near, far);
        const baseViewMatrix = rotator.getViewMatrix();
        const modelMatrix = m4.translation(-centerOfMass[0], -centerOfMass[1], -centerOfMass[2]);
        const eyeViewMatrix = m4.multiply(stereo.eyeTranslation, baseViewMatrix);

        renderObject(stereo.projection, eyeViewMatrix, modelMatrix);
    });

    gl.colorMask(true, true, true, true);
    requestAnimationFrame(draw);
}

/**
 * Рендеринг моделі (Полігони + Сітка)
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
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uEnableLighting"), renderSettings.enableLighting ? 1 : 0);
        // Розрахунок часу в секундах
    const currentTime = (Date.now() - startTime) * 0.001;
    const radius = 15.0; // Радіус обертання світла

    // Світло буде рухатися по колу в площині XZ
    const lightX = Math.cos(currentTime) * radius;
    const lightZ = Math.sin(currentTime) * radius;
    const lightY = 10.0; // Висота світла залишається сталою

    gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uLightPosition"), [lightX, lightY, lightZ]);
    //  gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uLightPosition"), [10, 10, 10]);
    gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uAmbientColor"), [0.2, 0.2, 0.2]);
    gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uDiffuseColor"), [1.0, 1.0, 1.0]);

    // --- ПРИВ'ЯЗКА ТЕКСТУР ДЛЯ ПОЛІГОНІВ (виправлено: перенесено сюди) ---
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.diffuse);
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uDiffuseMap"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.normal);
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uNormalMap"), 1);

    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uUseDiffuseMap"), renderSettings.useDiffuse ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uUseNormalMap"), renderSettings.useNormal ? 1 : 0);

    // --- Малювання заповнених полігонів (Fill) ---
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uIsLight"), 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surfaceBufferData.fillIndices);
    gl.drawElements(gl.TRIANGLES, surfaceBufferData.fillCount, gl.UNSIGNED_SHORT, 0);

    // --- Малювання каркаса (Wireframe) ---
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 1.0);
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uIsLight"), 1); 
    gl.uniform4f(gl.getUniformLocation(surfaceProgram, "uColor"), 1.0, 1.0, 1.0, 1.0);
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
    gl.uniform1i(gl.getUniformLocation(surfaceProgram, "uIsLight"), 0); // Виправлено: 0 для відображення текстури камери
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