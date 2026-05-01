AFRAME.registerComponent('surface-16', {
    init: function () {
        const el = this.el;

        const cubeGeom = new THREE.BoxGeometry(1, 1, 1);
        const cubeMat = new THREE.MeshNormalMaterial({
            transparent: true,
            opacity: 0.2,
            side: THREE.BackSide
        });
        const containerCube = new THREE.Mesh(cubeGeom, cubeMat);
        el.setObject3D('container', containerCube);

        const a = 1.5, b = 3, c = 2.0, d = 4;
        const uSteps = 60, vSteps = 60;
        const uMax = Math.PI * 2, vMax = Math.PI * 2;

        const surfaceData = CreateVirichSurfaceData(a, b, c, d, uSteps, vSteps, uMax, vMax);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(surfaceData.verts, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(surfaceData.normals, 3));
        const indices = generateIndices(uSteps, vSteps);
        geometry.setIndex(indices);

        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);

        const size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);

        const scaleFactor = 0.95 / maxDim;
        geometry.scale(scaleFactor, scaleFactor, scaleFactor);

        const material = new THREE.MeshPhongMaterial({
            color: 0xFF9900,
            wireframe: true,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });

        this.surfaceMesh = new THREE.Mesh(geometry, material);
        el.setObject3D('mesh', this.surfaceMesh);
        this.surfaceMesh.rotation.x = 1;
    },

    tick: function (time, timeDelta) {
        if (this.surfaceMesh) {
            this.surfaceMesh.rotation.y += 0.01;
        }
    }
});


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

    return { position: [x, y, z], normal: [0, 1, 0] };
}

function CreateVirichSurfaceData(a, b, c, d, uSteps, vSteps, uMax, vMax) {
    let verts = [], normals = [];
    for (let i = 0; i <= uSteps; i++) {
        let u = uMax * i / uSteps;
        for (let j = 0; j <= vSteps; j++) {
            let v = vMax * j / vSteps;
            let data = computeSurfacePoint(a, b, c, d, u, v);
            verts.push(...data.position);
            normals.push(...data.normal);
        }
    }
    return { verts: verts, normals: normals };
}

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