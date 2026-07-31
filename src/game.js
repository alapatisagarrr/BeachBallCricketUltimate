import * as THREE from 'three'
import * as CANNON from 'cannon-es'

export function startGame(container, { onScore } = {}) {
  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.outputEncoding = THREE.sRGBEncoding
  container.appendChild(renderer.domElement)

  // Scene + Camera
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87ceeb) // sky blue

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  )
  camera.position.set(0, 4, 8)

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambient)
  const dir = new THREE.DirectionalLight(0xffffff, 0.6)
  dir.position.set(5, 10, 7)
  scene.add(dir)

  // Ground (Three)
  const groundGeo = new THREE.PlaneGeometry(50, 50)
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xeedc9a })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // Visual markers for scoring zones
  const farZoneGeo = new THREE.RingGeometry(8.5, 9.5, 32)
  const farZoneMat = new THREE.MeshBasicMaterial({ color: 0x00b894, opacity: 0.25, transparent: true })
  const farZone = new THREE.Mesh(farZoneGeo, farZoneMat)
  farZone.rotation.x = -Math.PI / 2
  farZone.position.y = 0.01
  scene.add(farZone)

  // Ball (Three)
  const ballGeo = new THREE.SphereGeometry(0.3, 32, 32)
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xff4500 })
  const ballMesh = new THREE.Mesh(ballGeo, ballMat)
  ballMesh.castShadow = true
  scene.add(ballMesh)

  // Physics world (cannon-es)
  const world = new CANNON.World()
  world.gravity.set(0, -9.82, 0)
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.allowSleep = true

  // Ground body (Cannon)
  const groundBody = new CANNON.Body({ mass: 0 })
  const groundShape = new CANNON.Plane()
  groundBody.addShape(groundShape)
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(groundBody)

  // Ball body (Cannon)
  const radius = 0.3
  const ballBody = new CANNON.Body({ mass: 1 })
  ballBody.addShape(new CANNON.Sphere(radius))
  ballBody.position.set(0, 2, 0)
  ballBody.linearDamping = 0.01
  ballBody.angularDamping = 0.4
  world.addBody(ballBody)

  // Game state
  let lastTime
  let maxHeight = ballBody.position.y
  let hasScoredThisShot = false

  function animate(time) {
    requestAnimationFrame(animate)
    if (lastTime !== undefined) {
      const dt = Math.min((time - lastTime) / 1000, 1 / 30)
      world.step(1 / 60, dt, 3)
    }
    lastTime = time

    // Track peak height for scoring
    maxHeight = Math.max(maxHeight, ballBody.position.y)

    // Scoring logic: if ball passes a far z threshold and hasn't scored yet
    if (!hasScoredThisShot && ballBody.position.z < -20) {
      hasScoredThisShot = true
      const points = maxHeight > 3 ? 6 : 4
      if (typeof onScore === 'function') onScore(points)
      // small delay then reset ball to start
      setTimeout(() => resetBall(), 900)
    }

    // If ball comes to rest near batter (play ends) -> no score and reset
    if (!hasScoredThisShot) {
      const speed = ballBody.velocity.length()
      if (speed < 0.15 && ballBody.position.y < 0.6 && Math.abs(ballBody.position.z) < 10) {
        // consider the play finished
        hasScoredThisShot = true
        setTimeout(() => resetBall(), 900)
      }
    }

    // Copy physics -> three
    ballMesh.position.copy(ballBody.position)
    ballMesh.quaternion.copy(ballBody.quaternion)

    renderer.render(scene, camera)
  }
  requestAnimationFrame(animate)

  // Resize handling
  function onResize() {
    const w = container.clientWidth
    const h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  // Controls: pointer drag to set hit direction/strength
  let dragging = false
  let dragStart = null
  let dragEnd = null

  function getPointerPos(evt) {
    const rect = container.getBoundingClientRect()
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top }
  }

  container.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    dragging = true
    dragStart = getPointerPos(e)
    dragEnd = dragStart
  })

  container.addEventListener('pointermove', (e) => {
    if (!dragging) return
    dragEnd = getPointerPos(e)
  })

  container.addEventListener('pointerup', (e) => {
    if (!dragging) return
    dragging = false
    dragEnd = getPointerPos(e)

    // Compute drag vector
    const dx = dragEnd.x - dragStart.x
    const dy = dragEnd.y - dragStart.y

    // Map screen drag to world impulse
    // Vertical drag (dy negative when dragging up) gives upward + forward power
    const power = Math.min(Math.hypot(dx, dy) / 200, 3)
    const side = (dx / container.clientWidth) * 2 // -1..1

    // Reset maxHeight/state
    maxHeight = ballBody.position.y
    hasScoredThisShot = false

    // Place ball near the batter if it's resting
    if (ballBody.position.y < 0.7 && ballBody.position.z > -3) {
      ballBody.position.set(0, 1.1, 0.5)
      ballBody.velocity.set(0, 0, 0)
      ballBody.angularVelocity.set(0, 0, 0)
    }

    // Apply impulse: sideways, up, forward (negative Z)
    const impulse = new CANNON.Vec3(side * power * 3, 1 + power * 3, -power * 8)
    ballBody.applyImpulse(impulse, ballBody.position)
  })

  // Simple serve function
  function serve() {
    resetBall()
    // small serve impulse
    ballBody.applyImpulse(new CANNON.Vec3(0, 0.5, -6), ballBody.position)
    maxHeight = ballBody.position.y
    hasScoredThisShot = false
  }

  function resetBall() {
    ballBody.position.set(0, 2, 2)
    ballBody.velocity.set(0, 0, 0)
    ballBody.angularVelocity.set(0, 0, 0)
    maxHeight = ballBody.position.y
    hasScoredThisShot = false
  }

  // initial reset
  resetBall()

  // Return API to caller
  return { serve, world, ballBody }
}
