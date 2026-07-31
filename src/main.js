import './style.css'
import { startGame } from './game.js'

const app = document.querySelector('#app')

app.innerHTML = `
<section id="center">
  <div id="game-wrapper">
    <div id="game-container" class="game-canvas"></div>
    <div id="game-ui">
      <button id="serve" class="button">Serve</button>
      <span id="hint">Click/tap the game area to hit the ball</span>
    </div>
  </div>
</section>
`

const game = startGame(document.querySelector('#game-container'))

document.getElementById('serve').addEventListener('click', () => {
  game.serve()
})
