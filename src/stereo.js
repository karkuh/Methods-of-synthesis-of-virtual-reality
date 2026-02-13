/**
 * Обчислює матриці проекції та вигляду для стереоскопічного рендерингу.
 * Використовує алгоритм Off-axis projection для коректного стереоефекту.
 * * @param {number} eye - Сторона ока: -1 для лівого, 1 для правого.
 * @param {number} eyeSep - Відстань між очима (Eye Separation).
 * @param {number} convergence - Відстань до площини нульового паралакса (Convergence Distance).
 * @param {number} fov - Кут огляду у радіанах (Field of View).
 * @param {number} aspect - Співвідношення сторін екрана (width/height).
 * @param {number} near - Відстань до ближньої площини відсікання.
 * @param {number} far - Відстань до дальньої площини відсікання.
 * @returns {Object} Об'єкт з матрицями projection та eyeTranslation.
 */
function getStereoMatrices(eye, eyeSep, convergence, fov, aspect, near, far) {
    const top = near * Math.tan(fov / 2);
    const bottom = -top;
    
    const a = aspect * Math.tan(fov / 2) * convergence;
    
    const offset = (eye * eyeSep / 2);
    
    const left = -(a - offset) * near / convergence;
    const right = (a + offset) * near / convergence;
    
    const projection = m4.frustum(left, right, bottom, top, near, far);
    
    const eyeTranslation = m4.translation(-offset, 0, 0);
    
    return {
        projection: projection,
        eyeTranslation: eyeTranslation
    };
}

/**
 * Допоміжна функція для конвертації градусів у радіани.
 */
function degToRad(degrees) {
    return degrees * Math.PI / 180;
}