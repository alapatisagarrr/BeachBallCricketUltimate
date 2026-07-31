import './style.css'
import { startGame } from './game.js'

const app = document.querySelector('#app')

app.innerHTML = `
<section id="center">
  <div id="game-wrapper">
    <div id="game-header">
      <div id="scoreboard">
        <div id="score-label">Score</div>
        <div id="score-value">0</div>
      </div>
      <div id="last-hit">Last hit: -</div>
    </div>

    <div id="game-container" class="game-canvas" tabindex="0"></div>

    <div id="game-ui">
      <button id="serve" class="button">Serve</button>
      <button id="reset" class="button">Reset</button>
      <span id="hint">Drag up on the scene to hit; click/tap to hit lightly</span>
    </div>
  </div>
</section>
`

let totalScore = 0
const scoreValueEl = document.getElementById('score-value')
const lastHitEl = document.getElementById('last-hit')

const game = startGame(document.querySelector('#game-container'), {
  onScore(points) {
    totalScore += points
    scoreValueEl.textContent = totalScore
    lastHitEl.textContent = `Last hit: +${points}`
    // flash indicator
    scoreValueEl.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }],
      { duration: 400 }
    )
  }
})

document.getElementById('serve').addEventListener('click', () => {
  game.serve()
})

document.getElementById('reset').addEventListener('click', () => {
  totalScore = 0
  scoreValueEl.textContent = totalScore
  lastHitEl.textContent = 'Last hit: -'
})
