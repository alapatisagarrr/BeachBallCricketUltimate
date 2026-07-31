import * as THREE from 'three'
import * as CANNON from 'cannon-es'

export function startGame(container, { onScore, onHit } = {}) {
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
  const cameraTarget = new THREE.Vector3(0, 1.5, 0)
  let cameraShake = 0

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

  // Simple particle pool for hit VFX
  const particles = []
  const particleGeo = new THREE.SphereGeometry(0.03, 6, 6)
  const particleMat = new THREE.MeshStandardMaterial({ color: 0xffd166 })

  function spawnParticles(position, normal, count = 10) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(particleGeo, particleMat)
      m.position.copy(position)
      // random velocity based on normal
      m.userData.vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2 + normal.x * 2,
        Math.random() * 2 + normal.y * 1,
        (Math.random() - 0.5) * 2 + normal.z * 2
      )
      m.userData.life = 0.8 + Math.random() * 0.6
      particles.push(m)
      scene.add(m)
    }
  }

  // WebAudio for hit sound (no external assets)
  let audioCtx = null
  function playHitSound(strength = 1) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const now = audioCtx.currentTime
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(400 + Math.random() * 400 * strength, now)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.15 * strength, now + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start(now)
      osc.stop(now + 0.3)
    } catch (e) {
      // ignore audio errors
      console.warn('Audio not available', e)
    }
  }

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
  ballBody.allowSleep = true
  world.addBody(ballBody)

  // Bat: more realistic with hinge constraint
  // We'll create a dynamic bat body and attach it to a static pivot using a hinge motor
  const batHalfExtents = new CANNON.Vec3(0.075, 0.45, 0.6)
  const batShape = new CANNON.Box(batHalfExtents)
  const batBody = new CANNON.Body({ mass: 0.8 })
  batBody.addShape(batShape)
  // position the handle near the batter and slightly forward
  batBody.position.set(0, 1, 0.6)
  batBody.allowSleep = false
  world.addBody(batBody)

  // Pivot (static) for hinge
  const pivot = new CANNON.Body({ mass: 0 })
  pivot.position.set(0, 1, 0.5) // handle location
  world.addBody(pivot)

  // Try to create a HingeConstraint if available
  let hinge = null
  try {
    if (typeof CANNON.HingeConstraint === 'function') {
      hinge = new CANNON.HingeConstraint(batBody, pivot, {
        pivotA: new CANNON.Vec3(0, -0.35, -0.4),
        axisA: new CANNON.Vec3(1, 0, 0),
        pivotB: new CANNON.Vec3(0, 0, 0),
        axisB: new CANNON.Vec3(1, 0, 0)
      })
      // enable motor for swings
      hinge.enableMotor()
      hinge.setMotorMaxForce(150)
      world.addConstraint(hinge)
    } else {
      hinge = null
    }
  } catch (e) {
    // If hinge not available, we'll fall back to kinematic/manual movement
    hinge = null
  }

  // Three bat mesh
  const batGeo = new THREE.BoxGeometry(0.15, 0.9, 1.2)
  const batMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
  const batMesh = new THREE.Mesh(batGeo, batMat)
  batMesh.castShadow = true
  batMesh.position.set(0, 1, 0.6)
  scene.add(batMesh)

  // Relay bat collisions to a callback (visual hit feedback)
  ballBody.addEventListener('collide', (evt) => {
    const other = evt.body
    if (!other) return
    // check collision with bat body by comparing ids
    if (other === batBody) {
      // derive contact normal if available
      let normal = { x: 0, y: 1, z: 0 }
      try {
        if (evt.contact && evt.contact.ni) {
          // contact normal points from body i to j; invert for outward normal from bat
          normal = { x: -evt.contact.ni.x, y: -evt.contact.ni.y, z: -evt.contact.ni.z }
        }
      } catch (e) {
        // ignore
      }

      // Spawn VFX at contact point (convert CANNON point to THREE)
      const cp = evt.contact ? evt.contact.rj : null
      let worldPoint = new THREE.Vector3()
      if (cp) {
        // contact point relative to body j (ball). We'll use ball position as base.
        worldPoint.set(ballBody.position.x, ballBody.position.y, ballBody.position.z)
      } else {
        worldPoint.set(ballBody.position.x, ballBody.position.y, ballBody.position.z)
      }

      spawnParticles(worldPoint, new THREE.Vector3(normal.x, normal.y, normal.z), 14)

      // play sound and camera shake
      playHitSound(1.2)
      cameraShake = Math.min(cameraShake + 0.6, 1.2)

      // callback for UI
      if (typeof onHit === 'function') onHit()
    }
  })

  // Game state
  let lastTime
  let maxHeight = ballBody.position.y
  let hasScoredThisShot = false

  function animate(time) {
    requestAnimationFrame(animate)
    if (lastTime !== undefined) {
      const dt = Math.min((time - lastTime) / 1000, 1 / 30)
      world.step(1 / 60, dt, 3)

      // update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.userData.life -= dt
        if (p.userData.life <= 0) {
          scene.remove(p)
          particles.splice(i, 1)
          continue
        }
        // integrate simple velocity
        p.position.addScaledVector(p.userData.vel, dt)
        // gravity on particles
        p.userData.vel.y -= 9.82 * dt * 0.4
        // fade
        const t = p.userData.life
        p.material.opacity = Math.max(0, Math.min(1, t))
        p.material.transparent = true
      }
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

    // Sync bat mesh: copy batBody -> batMesh
    batMesh.position.copy(batBody.position)
    batMesh.quaternion.copy(batBody.quaternion)

    // Camera follow with smoothing and optional shake
    const desiredPos = new THREE.Vector3(cameraTarget.x, cameraTarget.y, cameraTarget.z + 8)
    // If ball is far forward, shift camera slightly toward ball
    const ballOffsetZ = Math.max(0, -ballBody.position.z / 4)
    desiredPos.z = 8 + ballOffsetZ
    desiredPos.x = THREE.MathUtils.lerp(desiredPos.x, ballBody.position.x * 0.2, 0.05)

    // apply camera shake
    if (cameraShake > 0) {
      const s = cameraShake * 0.35
      desiredPos.x += (Math.random() - 0.5) * s
      desiredPos.y += (Math.random() - 0.5) * s
      cameraShake = Math.max(0, cameraShake - 0.02)
    }

    camera.position.lerp(desiredPos, 0.08)
    camera.lookAt(ballMesh.position.x, ballMesh.position.y + 0.6, ballMesh.position.z)

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

    // Compute swing impulse vector for the bat (world units)
    const swingSpeed = Math.min(12, power * 12)
    const swingAxis = new CANNON.Vec3(1, 0, 0) // hinge axis

    if (hinge) {
      // use motored hinge: set motor speed and let physics handle collision
      // Negative speed swings forward (toward -Z)
      hinge.enableMotor()
      hinge.setMotorSpeed(-swingSpeed)
      hinge.setMotorMaxForce(500)
      // stop motor after short duration
      setTimeout(() => {
        hinge.setMotorSpeed(0)
        hinge.disableMotor()
      }, 180)
    } else {
      // fallback: apply a kinematic-like velocity to bat body
      const swingVel = new CANNON.Vec3(side * power * 6, 1 + power * 5, -power * 18)
      batBody.velocity.set(swingVel.x, swingVel.y, swingVel.z)
      setTimeout(() => {
        batBody.velocity.set(0, 0, 0)
        batBody.position.set(0, 1, 0.6)
      }, 120)
    }

    // Also apply direct impulse to the ball as fallback for responsiveness
    const directImpulse = new CANNON.Vec3(side * power * 3, 1 + power * 3, -power * 8)
    ballBody.applyImpulse(directImpulse, ballBody.position)
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
