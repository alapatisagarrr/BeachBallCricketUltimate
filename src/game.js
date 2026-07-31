import * as THREE from 'three'
import * as CANNON from 'cannon-es'

export function startGame(container) {
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
  const ballBody = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(radius) })
  ballBody.position.set(0, 2, 0)
  ballBody.linearDamping = 0.01
  world.addBody(ballBody)

  // Simple sync function
  let lastTime
  function animate(time) {
    requestAnimationFrame(animate)
    if (lastTime !== undefined) {
      const dt = Math.min((time - lastTime) / 1000, 1 / 30)
      world.step(1 / 60, dt, 3)
    }
    lastTime = time

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

  // Simple controls
  function serve() {
    // reset position
    ballBody.position.set(0, 2, 0)
    ballBody.velocity.set(0, 0, 0)
    ballBody.angularVelocity.set(0, 0, 0)
    // apply forward impulse towards -Z
    ballBody.applyImpulse(new CANNON.Vec3(0, 0.5, -6), ballBody.position)
  }

  // Click to "hit" the ball: apply a quick impulse from camera direction
  container.addEventListener('pointerdown', (e) => {
    // simple upward + forward impulse
    ballBody.applyImpulse(new CANNON.Vec3(0, 2, -3), ballBody.position)
  })

  // Initial serve so something is visible
  serve()

  // Return API to caller
  return { serve, world, ballBody }
}
