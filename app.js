/**
 * YeongjuTRIG - Autonomous Driving Vision Mode
 * 삼각함수를 이용한 자율주행 거리 추정 교육용 시뮬레이터
 * 
 * 핵심 수학 개념:
 * - 삼각 측량: 두 카메라의 각도로 물체 위치 계산
 * - tan(θ₁) = y / x (Camera A 기준)
 * - tan(θ₂) = y / (baseline - x) (Camera B 기준)
 * - 연립방정식 해결: x = baseline * tan(θ₂) / (tan(θ₁) + tan(θ₂))
 */

// ============================================
// Three.js 다중 렌더러 설정
// ============================================
let mainScene, cameraAScene, cameraBScene;
let mainCamera, cameraA, cameraB;
let mainRenderer, cameraARenderer, cameraBRenderer;
let mainControls;
let raycaster, mouse;

// 시뮬레이션 객체
let vehicle;
let cameraAObject, cameraBObject;
let targetObjects = [];
let selectedObject = null;
let sightLines = { lineA: null, lineB: null };
let angleArcs = { arcA: null, arcB: null };

// 인터랙션 상태
let isDraggingObject = false;
let dragPlane = null;
let dragOffset = new THREE.Vector3();

// 파라미터
let params = {
    baseline: 1.5,  // 카메라 간 거리 (m)
    cameraHeight: 1.5,  // 카메라 높이 (m)
    vehicleZ: 0  // 차량 Z 위치
};

// ============================================
// 초기화 함수
// ============================================
function init() {
    // Scene 생성 (공유)
    mainScene = new THREE.Scene();
    mainScene.background = new THREE.Color(0x0a0e14);
    mainScene.fog = new THREE.Fog(0x0a0e14, 20, 50);
    
    // 메인 카메라 (조감도)
    const mainContainer = document.getElementById('main-canvas-container');
    mainCamera = new THREE.PerspectiveCamera(
        60,
        mainContainer.clientWidth / mainContainer.clientHeight,
        0.1,
        100
    );
    mainCamera.position.set(0, 12, -8);
    mainCamera.lookAt(0, 0, 8);
    mainCamera.up.set(0, 1, 0);  // Set up vector before OrbitControls
    
    // 메인 렌더러
    mainRenderer = new THREE.WebGLRenderer({ antialias: true });
    mainRenderer.setSize(mainContainer.clientWidth, mainContainer.clientHeight);
    mainRenderer.setPixelRatio(window.devicePixelRatio);
    mainRenderer.shadowMap.enabled = true;
    mainContainer.appendChild(mainRenderer.domElement);
    
    // Orbit Controls (메인 뷰만) - camera 완전 초기화 후 생성
    mainControls = new THREE.OrbitControls(mainCamera, mainRenderer.domElement);
    mainControls.enableDamping = true;
    mainControls.dampingFactor = 0.05;
    mainControls.minDistance = 5;
    mainControls.maxDistance = 30;
    mainControls.maxPolarAngle = Math.PI / 2.2;
    mainControls.target.set(0, 0, 8);
    
    // 카메라 A 렌더러 (좌측 카메라 시점)
    const cameraAContainer = document.getElementById('camera-a-canvas-container');
    cameraARenderer = new THREE.WebGLRenderer({ antialias: true });
    cameraARenderer.setSize(cameraAContainer.clientWidth, cameraAContainer.clientHeight);
    cameraARenderer.setPixelRatio(window.devicePixelRatio);
    cameraAContainer.appendChild(cameraARenderer.domElement);
    
    // 카메라 B 렌더러 (우측 카메라 시점)
    const cameraBContainer = document.getElementById('camera-b-canvas-container');
    cameraBRenderer = new THREE.WebGLRenderer({ antialias: true });
    cameraBRenderer.setSize(cameraBContainer.clientWidth, cameraBContainer.clientHeight);
    cameraBRenderer.setPixelRatio(window.devicePixelRatio);
    cameraBContainer.appendChild(cameraBRenderer.domElement);
    
    // Raycaster (객체 선택용)
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // Scene 구성
    addLights();
    createRoad();
    createVehicle();
    createCameraObjects();
    createTargetObjects();
    
    // 이벤트 리스너
    setupEventListeners();
    
    // 드래그 평면 생성 (객체 드래그용)
    const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
    planeGeometry.rotateX(-Math.PI / 2);
    const planeMaterial = new THREE.MeshBasicMaterial({ visible: false });
    dragPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    dragPlane.position.y = 0.5; // 물체 높이에 맞춤
    mainScene.add(dragPlane);
    
    // UI 업데이트
    updateObjectsList();
    updateCalculations();
    
    // 애니메이션 시작
    animate();
}

// ============================================
// 조명 추가
// ============================================
function addLights() {
    // 환경광
    const ambientLight = new THREE.AmbientLight(0x404040, 1.2);
    mainScene.add(ambientLight);
    
    // 주 광원
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 15, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    mainScene.add(directionalLight);
    
    // 보조 광원
    const fillLight = new THREE.DirectionalLight(0x7BB3F0, 0.4);
    fillLight.position.set(-5, 10, -5);
    mainScene.add(fillLight);
}

// ============================================
// 도로 평면 생성
// ============================================
function createRoad() {
    // 도로 표면
    const roadGeometry = new THREE.PlaneGeometry(30, 40);
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.8,
        metalness: 0.2
    });
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.z = 10;
    road.receiveShadow = true;
    mainScene.add(road);
    
    // 차선
    const laneLineGeometry = new THREE.PlaneGeometry(0.15, 40);
    const laneLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    
    const centerLine = new THREE.Mesh(laneLineGeometry, laneLineMaterial);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, 0.01, 10);
    mainScene.add(centerLine);
    
    // 거리 마커
    for (let i = 5; i <= 20; i += 5) {
        addDistanceMarker(i);
    }
    
    // 그리드 (참고용)
    const gridHelper = new THREE.GridHelper(30, 30, 0x444444, 0x222222);
    gridHelper.position.y = 0;
    mainScene.add(gridHelper);
}

// ============================================
// 거리 마커 추가
// ============================================
function addDistanceMarker(distance) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 64;
    context.fillStyle = '#26C6DA';
    context.font = 'bold 36px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${distance}m`, 64, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.set(-5, 0.5, distance);
    sprite.scale.set(2, 1, 1);
    mainScene.add(sprite);
}

// ============================================
// 차량 객체 생성
// ============================================
function createVehicle() {
    const vehicleGroup = new THREE.Group();
    
    // 차체
    const bodyGeometry = new THREE.BoxGeometry(1.8, 0.8, 3.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.6,
        roughness: 0.4
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.4;
    body.castShadow = true;
    vehicleGroup.add(body);
    
    // 캐빈
    const cabinGeometry = new THREE.BoxGeometry(1.6, 0.6, 2.0);
    const cabinMaterial = new THREE.MeshStandardMaterial({
        color: 0x4A90E2,
        metalness: 0.7,
        roughness: 0.3
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.y = 1.0;
    cabin.position.z = -0.3;
    cabin.castShadow = true;
    vehicleGroup.add(cabin);
    
    vehicleGroup.position.set(0, 0, params.vehicleZ);
    mainScene.add(vehicleGroup);
    vehicle = vehicleGroup;
}

// ============================================
// 카메라 객체 생성
// ============================================
function createCameraObjects() {
    const cameraGeometry = new THREE.ConeGeometry(0.15, 0.4, 16);
    
    // Camera A (좌측)
    const cameraAMaterial = new THREE.MeshStandardMaterial({
        color: 0x4CAF50,
        emissive: 0x2E7D32,
        emissiveIntensity: 0.5
    });
    cameraAObject = new THREE.Mesh(cameraGeometry, cameraAMaterial);
    cameraAObject.rotation.x = Math.PI / 2;
    cameraAObject.position.set(-params.baseline / 2, params.cameraHeight, params.vehicleZ + 1.5);
    cameraAObject.castShadow = true;
    mainScene.add(cameraAObject);
    
    // Camera B (우측)
    const cameraBMaterial = new THREE.MeshStandardMaterial({
        color: 0x2196F3,
        emissive: 0x1565C0,
        emissiveIntensity: 0.5
    });
    cameraBObject = new THREE.Mesh(cameraGeometry, cameraBMaterial);
    cameraBObject.rotation.x = Math.PI / 2;
    cameraBObject.position.set(params.baseline / 2, params.cameraHeight, params.vehicleZ + 1.5);
    cameraBObject.castShadow = true;
    mainScene.add(cameraBObject);
    
    // 실제 렌더링용 카메라 생성
    cameraA = new THREE.PerspectiveCamera(
        75,
        document.getElementById('camera-a-canvas-container').clientWidth /
        document.getElementById('camera-a-canvas-container').clientHeight,
        0.1,
        100
    );
    cameraA.position.copy(cameraAObject.position);
    cameraA.lookAt(0, params.cameraHeight, 20);
    mainScene.add(cameraA);
    
    cameraB = new THREE.PerspectiveCamera(
        75,
        document.getElementById('camera-b-canvas-container').clientWidth /
        document.getElementById('camera-b-canvas-container').clientHeight,
        0.1,
        100
    );
    cameraB.position.copy(cameraBObject.position);
    cameraB.lookAt(0, params.cameraHeight, 20);
    mainScene.add(cameraB);
    
    updateCameraPositions();
}

// ============================================
// 목표 물체 생성(여러 개)
// ============================================
function createTargetObjects() {
    const objectsData = [
        { name: '물체 1', color: 0xFF5722, position: [2, 0.5, 6], icon: '🚗' },
        { name: '물체 2', color: 0xFF9800, position: [3, 0.5, 10], icon: '🚶' },
        { name: '물체 3', color: 0xFFC107, position: [4, 0.6, 15], icon: '🚧' },
        { name: '물체 4', color: 0xE91E63, position: [2.5, 0.5, 20], icon: '🛑' }
    ];
    
    objectsData.forEach((data, index) => {
        const geometry = new THREE.SphereGeometry(0.5, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: data.color,
            emissive: data.color,
            emissiveIntensity: 0.3,
            roughness: 0.4,
            metalness: 0.3
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...data.position);
        mesh.castShadow = true;
        mesh.userData = {
            name: data.name,
            icon: data.icon,
            index: index,
            selectable: true,
            originalColor: data.color
        };
        
        mainScene.add(mesh);
        targetObjects.push(mesh);
    });
}

// ============================================
// 카메라 위치 업데이트
// ============================================
function updateCameraPositions() {
    // X축: baseline에 따라 좌우 위치
    cameraAObject.position.x = -params.baseline / 2;
    cameraBObject.position.x = params.baseline / 2;
    
    // Z축: 차량과 함께 이동
    cameraAObject.position.z = params.vehicleZ + 1.5;
    cameraBObject.position.z = params.vehicleZ + 1.5;
    
    // 렌더링 카메라도 동일하게 위치 업데이트
    cameraA.position.copy(cameraAObject.position);
    cameraB.position.copy(cameraBObject.position);
    
    // 선택된 물체를 향하도록 시선 조정
    if (selectedObject) {
        cameraA.lookAt(selectedObject.position);
        cameraB.lookAt(selectedObject.position);
    }
}

// ============================================
// 시선 라인 생성/업데이트
// ============================================
function updateSightLines() {
    // 기존 라인 제거
    if (sightLines.lineA) mainScene.remove(sightLines.lineA);
    if (sightLines.lineB) mainScene.remove(sightLines.lineB);
    if (angleArcs.arcA) mainScene.remove(angleArcs.arcA);
    if (angleArcs.arcB) mainScene.remove(angleArcs.arcB);
    
    if (!selectedObject) return;
    
    // Camera A → 물체
    const lineAMaterial = new THREE.LineBasicMaterial({
        color: 0x4CAF50,
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });
    const lineAGeometry = new THREE.BufferGeometry().setFromPoints([
        cameraAObject.position,
        selectedObject.position
    ]);
    sightLines.lineA = new THREE.Line(lineAGeometry, lineAMaterial);
    mainScene.add(sightLines.lineA);
    
    // Camera B → 물체
    const lineBMaterial = new THREE.LineBasicMaterial({
        color: 0x2196F3,
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });
    const lineBGeometry = new THREE.BufferGeometry().setFromPoints([
        cameraBObject.position,
        selectedObject.position
    ]);
    sightLines.lineB = new THREE.Line(lineBGeometry, lineBMaterial);
    mainScene.add(sightLines.lineB);
    
    // 각도 호 추가
    createAngleArcs();
}

// ============================================
// 각도 호 생성
// ============================================
function createAngleArcs() {
    if (!selectedObject) return;
    
    const results = calculateTriangulation();
    
    // Camera A 각도 호
    const arcAGeometry = new THREE.BufferGeometry().setFromPoints(
        createArcPoints(
            cameraAObject.position,
            1.0,
            -Math.PI / 2,
            -Math.PI / 2 + results.thetaA,
            16
        )
    );
    const arcAMaterial = new THREE.LineBasicMaterial({ color: 0x4CAF50, linewidth: 2 });
    angleArcs.arcA = new THREE.Line(arcAGeometry, arcAMaterial);
    mainScene.add(angleArcs.arcA);
    
    // Camera B 각도 호
    const arcBGeometry = new THREE.BufferGeometry().setFromPoints(
        createArcPoints(
            cameraBObject.position,
            1.0,
            Math.PI / 2 - results.thetaB,
            Math.PI / 2,
            16
        )
    );
    const arcBMaterial = new THREE.LineBasicMaterial({ color: 0x2196F3, linewidth: 2 });
    angleArcs.arcB = new THREE.Line(arcBGeometry, arcBMaterial);
    mainScene.add(angleArcs.arcB);
}

// ============================================
// 호 포인트 생성 헬퍼
// ============================================
function createArcPoints(center, radius, startAngle, endAngle, segments) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (endAngle - startAngle) * (i / segments);
        const x = center.x + radius * Math.cos(angle);
        const z = center.z + radius * Math.sin(angle);
        points.push(new THREE.Vector3(x, center.y, z));
    }
    return points;
}

// ============================================
// 삼각 측량 계산
// ============================================
function calculateTriangulation() {
    if (!selectedObject) return null;
    
    /**
     * 삼각 측량 핵심 계산
     * 
     * 주어진 값:
     * - baseline (b): 카메라 간 거리
     * - Camera A 위치: (-b/2, h, z₀)
     * - Camera B 위치: (b/2, h, z₀)
     * - 물체 위치: (x, y, z)
     * 
     * 계산할 값:
     * - θ₁: Camera A에서 물체를 향한 수평 각도
     * - θ₂: Camera B에서 물체를 향한 수평 각도
     * - distance: 카메라로부터의 거리
     */
    
    const camAPos = cameraAObject.position;
    const camBPos = cameraBObject.position;
    const objPos = selectedObject.position;
    
    // 상대 위치 계산
    const dx_A = objPos.x - camAPos.x;
    const dy_A = objPos.y - camAPos.y;
    const dz_A = objPos.z - camAPos.z;
    
    const dx_B = objPos.x - camBPos.x;
    const dy_B = objPos.y - camBPos.y;
    const dz_B = objPos.z - camBPos.z;
    
    // 각도 계산 (수평 XZ 평면에서)
    // atan2(z, x)를 사용하여 정확한 사분면 각도 계산
    const thetaA = Math.atan2(dz_A, dx_A);
    const thetaB = Math.atan2(dz_B, dx_B);
    
    // 거리 계산 (3D 유클리드 거리)
    const distanceA = Math.sqrt(dx_A ** 2 + dy_A ** 2 + dz_A ** 2);
    const distanceB = Math.sqrt(dx_B ** 2 + dy_B ** 2 + dz_B ** 2);
    
    // 2D 수평 거리 (XZ 평면)
    const horizontalDistA = Math.sqrt(dx_A ** 2 + dz_A ** 2);
    const horizontalDistB = Math.sqrt(dx_B ** 2 + dz_B ** 2);
    
    // 삼각 측량으로 위치 역산 (교육용)
    // x = b * tan(θ₂) / (tan(θ₁) + tan(θ₂)) + camA.x
    const tanTheta1 = Math.tan(thetaA);
    const tanTheta2 = Math.tan(thetaB);
    
    return {
        thetaA: thetaA,
        thetaB: thetaB,
        thetaADeg: thetaA * 180 / Math.PI,
        thetaBDeg: thetaB * 180 / Math.PI,
        distanceA: distanceA,
        distanceB: distanceB,
        horizontalDistA: horizontalDistA,
        horizontalDistB: horizontalDistB,
        tanTheta1: tanTheta1,
        tanTheta2: tanTheta2,
        objectPos: objPos,
        baseline: params.baseline
    };
}

// ============================================
// 물체 선택 처리
// ============================================
function selectObject(object) {
    // 이전 선택 해제
    if (selectedObject) {
        selectedObject.material.emissiveIntensity = 0.3;
    }
    
    selectedObject = object;
    
    if (selectedObject) {
        selectedObject.material.emissiveIntensity = 0.8;
        
        // 카메라 시점 조정
        cameraA.lookAt(selectedObject.position);
        cameraB.lookAt(selectedObject.position);
    }
    
    updateSightLines();
    updateObjectsList();
    updateCalculations();
}

// ============================================
// 물체 리스트 UI 업데이트
// ============================================
function updateObjectsList() {
    const list = document.getElementById('objectsList');
    list.innerHTML = '';
    
    targetObjects.forEach(obj => {
        const item = document.createElement('div');
        item.className = 'object-item' + (obj === selectedObject ? ' selected' : '');
        
        const results = selectedObject === obj ? calculateTriangulation() : null;
        const distance = results ? results.distanceA.toFixed(1) : '—';
        
        item.innerHTML = `
            <div class="object-info">
                <div class="object-icon" style="background: #${obj.userData.originalColor.toString(16).padStart(6, '0')}">
                    ${obj.userData.icon}
                </div>
                <div class="object-name">${obj.userData.name}</div>
            </div>
            <div class="object-distance">${distance}m</div>
        `;
        
        item.addEventListener('click', () => selectObject(obj));
        list.appendChild(item);
    });
}

// ============================================
// 계산 과정 UI 업데이트
// ============================================
function updateCalculations() {
    const panel = document.getElementById('calculationSteps');
    
    if (!selectedObject) {
        panel.innerHTML = `
            <div class="no-selection-message">
                <i class="fas fa-info-circle"></i>
                <p>물체를 선택하면 계산 과정이 표시됩니다</p>
            </div>
        `;
        return;
    }
    
    const results = calculateTriangulation();
    
    panel.innerHTML = `
        <div class="calc-step">
            <div class="step-title">
                <i class="fas fa-arrow-right"></i> STEP 1: 알려진 값
            </div>
            <div class="step-content">
                카메라 간 거리 (baseline): <code>b = ${params.baseline.toFixed(2)}m</code><br>
                Camera A 위치: <code>(${cameraAObject.position.x.toFixed(2)}, ${cameraAObject.position.z.toFixed(2)})</code><br>
                Camera B 위치: <code>(${cameraBObject.position.x.toFixed(2)}, ${cameraBObject.position.z.toFixed(2)})</code>
            </div>
        </div>
        
        <div class="calc-step">
            <div class="step-title">
                <i class="fas fa-arrow-right"></i> STEP 2: 각도 측정
            </div>
            <div class="step-content">
                각 카메라에서 물체를 향한 수평 각도를 측정합니다.<br>
                <div class="step-formula">
                    θ₁ = atan2(Δz, Δx) = ${results.thetaADeg.toFixed(1)}°
                </div>
                <div class="step-formula">
                    θ₂ = atan2(Δz, Δx) = ${results.thetaBDeg.toFixed(1)}°
                </div>
                <small>atan2 함수는 4사분면을 모두 고려하여 정확한 각도를 계산합니다.</small>
            </div>
        </div>
        
        <div class="calc-step">
            <div class="step-title">
                <i class="fas fa-arrow-right"></i> STEP 3: 탄젠트 값 계산
            </div>
            <div class="step-content">
                탄젠트 함수는 각도로부터 거리 비율을 제공합니다.<br>
                <div class="step-formula">
                    tan(θ₁) = ${results.tanTheta1.toFixed(3)}
                </div>
                <div class="step-formula">
                    tan(θ₂) = ${results.tanTheta2.toFixed(3)}
                </div>
            </div>
        </div>
        
        <div class="calc-step">
            <div class="step-title">
                <i class="fas fa-arrow-right"></i> STEP 4: 위치 역산 (이론)
            </div>
            <div class="step-content">
                두 카메라의 각도와 baseline을 이용한 연립방정식:<br>
                <div class="step-formula">
                    tan(θ₁) = z / (x - camA.x)
                </div>
                <div class="step-formula">
                    tan(θ₂) = z / (camB.x - x)
                </div>
                <small>이 두 식을 연립하여 x와 z를 구할 수 있습니다.</small>
            </div>
        </div>
        
        <div class="calc-step final">
            <div class="step-title">
                <i class="fas fa-check-circle"></i> STEP 5: 최종 결과
            </div>
            <div class="step-content">
                <strong>물체 위치:</strong><br>
                <code>x = ${results.objectPos.x.toFixed(2)}m</code>,
                <code>z = ${results.objectPos.z.toFixed(2)}m</code><br><br>
                
                <strong>Camera A로부터의 거리:</strong><br>
                <div class="step-result">d = ${results.distanceA.toFixed(2)}m</div>
                
                <strong>Camera B로부터의 거리:</strong><br>
                <div class="step-result">d = ${results.distanceB.toFixed(2)}m</div>
                
                <small style="display: block; margin-top: 10px;">
                    💡 실제 자율주행 시스템은 이러한 계산을 초당 수십 번 수행하여
                    주변 물체의 위치를 실시간으로 파악합니다.
                </small>
            </div>
        </div>
    `;
}

// ============================================
// 이벤트 리스너 설정
// ============================================
function setupEventListeners() {
    // 슬라이더
    const baselineSlider = document.getElementById('baselineSlider');
    baselineSlider.addEventListener('input', (e) => {
        params.baseline = parseFloat(e.target.value);
        document.getElementById('baselineValue').textContent = params.baseline.toFixed(1);
        updateCameraPositions();
        updateSightLines();
        updateCalculations();
    });
    
    // 키보드 컨트롤 (차량 이동)
    window.addEventListener('keydown', onKeyDown);
    
    // 마우스 이벤트 (객체 드래그)
    mainRenderer.domElement.addEventListener('mousedown', onMouseDown);
    mainRenderer.domElement.addEventListener('mousemove', onMouseMove);
    mainRenderer.domElement.addEventListener('mouseup', onMouseUp);
    
    // 리셋 버튼
    document.getElementById('resetBtn').addEventListener('click', () => {
        params.baseline = 1.5;
        baselineSlider.value = 1.5;
        document.getElementById('baselineValue').textContent = '1.5';
        
        selectedObject = null;
        targetObjects.forEach(obj => {
            obj.material.emissiveIntensity = 0.3;
        });
        
        updateCameraPositions();
        updateSightLines();
        updateObjectsList();
        updateCalculations();
        
        mainCamera.position.set(0, 12, -8);
        mainControls.target.set(0, 0, 8);
    });
    
    // 윈도우 리사이즈
    window.addEventListener('resize', onWindowResize);
}

// ============================================
// 키보드 컨트롤 (차량 이동)
// ============================================
function onKeyDown(event) {
    const moveSpeed = 0.5; // 이동 속도
    const minZ = 0;        // 최소 Z (뒤)
    const maxZ = 30;       // 최대 Z (앞)
    
    switch(event.key) {
        case 'w':
        case 'W':
        case 'ArrowUp':
            // 앞으로 이동 (Z축 증가)
            params.vehicleZ = Math.min(params.vehicleZ + moveSpeed, maxZ);
            vehicle.position.z = params.vehicleZ;
            updateCameraPositions();
            updateSightLines();
            updateCalculations();
            break;
            
        case 's':
        case 'S':
        case 'ArrowDown':
            // 뒤로 이동 (Z축 감소)
            params.vehicleZ = Math.max(params.vehicleZ - moveSpeed, minZ);
            vehicle.position.z = params.vehicleZ;
            updateCameraPositions();
            updateSightLines();
            updateCalculations();
            break;
    }
}

// ============================================
// 마우스 이벤트 (객체 드래그)
// ============================================
function onMouseDown(event) {
    event.preventDefault();
    
    const rect = mainRenderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, mainCamera);
    
    const intersects = raycaster.intersectObjects(targetObjects);
    
    if (intersects.length > 0) {
        // 물체를 클릭한 경우
        const clickedObject = intersects[0].object;
        
        // 선택 (드래그 시작이 아닌 경우에만)
        if (!isDraggingObject) {
            selectObject(clickedObject);
            
            // 드래그 준비
            isDraggingObject = true;
            mainControls.enabled = false; // OrbitControls 비활성화
            
            // 드래그 평면과의 교차점 계산
            const planeIntersects = raycaster.intersectObject(dragPlane);
            if (planeIntersects.length > 0) {
                dragOffset.copy(planeIntersects[0].point).sub(clickedObject.position);
            }
        }
    }
}

function onMouseMove(event) {
    if (!isDraggingObject || !selectedObject) return;
    
    event.preventDefault();
    
    const rect = mainRenderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, mainCamera);
    
    const intersects = raycaster.intersectObject(dragPlane);
    
    if (intersects.length > 0) {
        const newPos = intersects[0].point.sub(dragOffset);
        
        // 맵 경계 제한 (도로 범위 내)
        newPos.x = Math.max(-14, Math.min(14, newPos.x));
        newPos.z = Math.max(0, Math.min(30, newPos.z));
        
        selectedObject.position.x = newPos.x;
        selectedObject.position.z = newPos.z;
        
        // 실시간 업데이트
        updateSightLines();
        updateCalculations();
        updateObjectsList();
    }
}

function onMouseUp(event) {
    if (isDraggingObject) {
        isDraggingObject = false;
        mainControls.enabled = true; // OrbitControls 재활성화
    }
}

// ============================================
// 윈도우 리사이즈
// ============================================
function onWindowResize() {
    const mainContainer = document.getElementById('main-canvas-container');
    const cameraAContainer = document.getElementById('camera-a-canvas-container');
    const cameraBContainer = document.getElementById('camera-b-canvas-container');
    
    mainCamera.aspect = mainContainer.clientWidth / mainContainer.clientHeight;
    mainCamera.updateProjectionMatrix();
    mainRenderer.setSize(mainContainer.clientWidth, mainContainer.clientHeight);
    
    cameraA.aspect = cameraAContainer.clientWidth / cameraAContainer.clientHeight;
    cameraA.updateProjectionMatrix();
    cameraARenderer.setSize(cameraAContainer.clientWidth, cameraAContainer.clientHeight);
    
    cameraB.aspect = cameraBContainer.clientWidth / cameraBContainer.clientHeight;
    cameraB.updateProjectionMatrix();
    cameraBRenderer.setSize(cameraBContainer.clientWidth, cameraBContainer.clientHeight);
}

// ============================================
// 애니메이션 루프
// ============================================
function animate() {
    requestAnimationFrame(animate);
    
    mainControls.update();
    
    // 3개의 렌더러로 각각 렌더링
    mainRenderer.render(mainScene, mainCamera);
    cameraARenderer.render(mainScene, cameraA);
    cameraBRenderer.render(mainScene, cameraB);
}

// ============================================
// 페이지 로드 시 초기화
// ============================================
window.addEventListener('DOMContentLoaded', init);

