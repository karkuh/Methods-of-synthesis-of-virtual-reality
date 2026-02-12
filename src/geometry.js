// geometry.js

/**
 * Обчислює центр мас параметричної поверхні на основі масиву її вершин.
 * Необхідно для виконання завдання з обертання моделі навколо її центру мас.
 */
function calculateCenterOfMass(vertices) {
    let sumX = 0, sumY = 0, sumZ = 0;
    const count = vertices.length / 3;

    for (let i = 0; i < vertices.length; i += 3) {
        sumX += vertices[i];
        sumY += vertices[i + 1];
        sumZ += vertices[i + 2];
    }

    return [sumX / count, sumY / count, sumZ / count];
}

/**
 * Реалізує параметричні рівняння Циклічної поверхні Віріха.
 * Обчислює позицію, нормаль, тангенс та бітангенс для параметрів u, v.
 */
function computeSurfacePoint(a, b, c, d, u, v) {
    function f(v) {
        let s = Math.sin(v), co = Math.cos(v);
        return (a * b) / Math.sqrt(a * a * s * s + b * b * co * co);
    }
    
    let fv = f(v);
    let common = 0.5 * (fv * (1 + Math.cos(u)) + (d * d - c * c) * (1 - Math.cos(u)) / fv);
    let x = common * Math.cos(v);
    let y = common * Math.sin(v);
    let z = 0.5 * (fv - (d * d - c * c) / fv) * Math.sin(u);
    let position = [x, y, z];

    function df(v) {
        let s = Math.sin(v), c0 = Math.cos(v); // Тут визначено c0
        let numerator = - (a * a - b * b) * s * c0 * (a * b);
        // Помилка була тут: замість co має бути c0
        let denom = Math.pow(a * a * s * s + b * b * c0 * c0, 1.5); 
        return numerator / denom;
    }
    
    let dfv = df(v);
    let dCommon_du = -0.5 * Math.sin(u) * (fv - (d * d - c * c) / fv);
    let dx_du = dCommon_du * Math.cos(v);
    let dy_du = dCommon_du * Math.sin(v);
    let dz_du = 0.5 * (fv - (d * d - c * c) / fv) * Math.cos(u);
    let Pu = [dx_du, dy_du, dz_du]; 

    let dCommon_dv = 0.5 * (dfv * (1 + Math.cos(u)) - (d * d - c * c) * dfv * (1 - Math.cos(u)) / (fv * fv));
    let dx_dv = dCommon_dv * Math.cos(v) - Math.sin(v) * (0.5 * (fv * (1 + Math.cos(u)) + (d * d - c * c) * (1 - Math.cos(u)) / fv));
    let dy_dv = dCommon_dv * Math.sin(v) + Math.cos(v) * (0.5 * (fv * (1 + Math.cos(u)) + (d * d - c * c) * (1 - Math.cos(u)) / fv));
    let dz_dv = 0.5 * (dfv - (-(d * d - c * c) * dfv) / (fv * fv)) * Math.sin(u);
    let Pv = [dx_dv, dy_dv, dz_dv]; 

    let N_raw = m4.cross(Pu, Pv);
    let N = m4.normalize(m4.scaleVector(N_raw, -1)); 
    let T = m4.normalize(Pu);
    let T_ortho = m4.normalize(m4.subtractVectors(T, m4.scaleVector(N, m4.dot(T, N))));
    let B_ortho = m4.normalize(m4.cross(N, T_ortho));

    return { position: position, normal: N, tangent: T_ortho, bitangent: B_ortho };
}

/**
 * Генерує масиви даних для буферів WebGL (вершини, нормалі, UV, тангенти).
 */
function CreateVirichSurfaceData(a, b, c, d, uSteps, vSteps, uMax, vMax) {
    let verts = [], normals = [], uvs = [], tangents = [], bitangents = [];
    for (let i = 0; i <= uSteps; i++) {
        let u = uMax * i / uSteps;
        for (let j = 0; j <= vSteps; j++) {
            let v = vMax * j / vSteps;
            let data = computeSurfacePoint(a, b, c, d, u, v);
            verts.push(...data.position);
            normals.push(...data.normal);
            tangents.push(...data.tangent);
            bitangents.push(...data.bitangent);
            uvs.push(j / vSteps, i / uSteps);
        }
    }
    return { verts: verts, normals: normals, uvs: uvs, tangents: tangents, bitangents: bitangents };
}

/**
 * Генерує індекси для рендерингу трикутниками (Fill).
 */
function generateIndices(uSteps, vSteps) {
    let indices = [];
    for (let i = 0; i < uSteps; i++) {
        for (let j = 0; j < vSteps; j++) {
            let idx = i * (vSteps + 1) + j;
            let idxNextU = (i + 1) * (vSteps + 1) + j;
            let idxNextV = i * (vSteps + 1) + (j + 1);
            let idxDiag = (i + 1) * (vSteps + 1) + (j + 1);

            indices.push(idx, idxNextU, idxDiag);
            indices.push(idx, idxDiag, idxNextV);
        }
    }
    return indices;
}

/**
 * Генерує індекси для рендерингу лініями (Wireframe).
 */
function generateLineIndices(uSteps, vSteps) {
    let indices = [];
    for (let i = 0; i <= uSteps; i++) {
        for (let j = 0; j <= vSteps; j++) {
            let idx = i * (vSteps + 1) + j;
            if (j < vSteps) indices.push(idx, i * (vSteps + 1) + (j + 1));
            if (i < uSteps) indices.push(idx, (i + 1) * (vSteps + 1) + j);
        }
    }
    return indices;
}