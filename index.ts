import { fromEvent, interval, Observable, animationFrameScheduler, merge, Subject } from 'rxjs'
import { map, scan, takeUntil, filter, mapTo, withLatestFrom, distinctUntilChanged, retryWhen, merge as mergeOpr, delay } from 'rxjs/operators'

// initialize canvas
const stage = <HTMLCanvasElement> document.querySelector('#stage')
const context = stage.getContext('2d')
context.fillStyle = 'green'

// type declaration
interface Point {
  x: number,
  y: number
}

interface Ball {
  position: Point,
  direction: Point
}

interface Brick {
  x: number,
  y: number,
  height: number,
  width: number
}

interface Ticker {
  time: number,
  deltaTime: number
}

interface State {
  ball: Ball,
  bricks: Brick[],
  score: number
}

interface Collision {
  paddle: boolean,
  floor: boolean,
  wall: boolean,
  ceiling: boolean,
  brick: boolean
}

type Ticker$ = Observable<Ticker>
type Paddle$ = Observable<number>
type State$ = Observable<State>

// constants 
const PADDLE_WIDTH = 200
const PADDLE_HEIGHT = 20
const PADDLE_SPEED = 240

const BALL_RADIUS = 10
const BALL_SPEED = 60

const BRICK_ROWS =  5
const BRICK_COLUMNS = 7
const BRICK_HEIGHT = 20
const BRICK_GAP = 3
const TICKER_INTERVAL = Math.ceil(1000 / 60)

const ARROW_LEFT = -1
const ARROW_RIGHT = 1 

// draw functions
function drawBall (ball: Ball) : void {
  context.beginPath()
  context.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2)
  context.fill()
  context.closePath()
}

function drawPaddle(paddle: number) {
  context.beginPath()
  context.rect(
    paddle - PADDLE_WIDTH / 2,
    context.canvas.height - PADDLE_HEIGHT,
    PADDLE_WIDTH,
    PADDLE_HEIGHT
  )
  context.fill()
  context.closePath()
}

function drawBrick(brick: Brick) {
  context.beginPath()
  context.rect(
    brick.x - brick.width / 2,
    brick.y - brick.height / 2,
    brick.width,
    brick.height
  )
  context.fill()
  context.closePath()
}

function drawBricks(bricks: Brick[]) {
  context.beginPath()
  bricks.forEach(drawBrick)
}

function drawScore(score: number) {
  context.textAlign = 'left'
  context.font = '16px Courier New'
  context.fillText(`${score}`, BRICK_GAP, 16)
}

function drawIntro() {
  context.clearRect(0, 0, stage.width, stage.height)
  context.textAlign = 'center'
  context.font = '24px Courier New'
  context.fillText('Press [<] and [>]', stage.width / 2, stage.height / 2)
}

function drawGameOver(message: string) {
  context.clearRect(0, 0, stage.width, stage.height)
  context.textAlign = 'center'
  context.font = '24px Courier New'
  context.fillText(message, stage.width / 2, stage.height / 2)
}

// collision function

function isHit(ball: Ball, paddle: number): boolean {
  const { x, y } = ball.position
  return x > paddle - PADDLE_WIDTH / 2
   && x < paddle + PADDLE_WIDTH / 2
   && y > stage.height - PADDLE_HEIGHT - BALL_RADIUS
}

function isCollision(ball: Ball, brick: Brick): boolean {
  return ball.position.x + ball.direction.x > brick.x - brick.width / 2
    && ball.position.x + ball.direction.x < brick.x + brick.width / 2
    && ball.position.y + ball.direction.y > brick.y - brick.height / 2
    && ball.position.y + ball.direction.y < brick.y + brick.height / 2
}

// stream declaration
const keyUp$ = fromEvent<KeyboardEvent>(document, 'keyup')
const keyDown$ = fromEvent<KeyboardEvent>(document, 'keydown')

const direction$: Observable<number> = merge(
  // left move
  keyDown$.pipe(filter(event => event.key === 'ArrowLeft'), mapTo(ARROW_LEFT)),
  // right move
  keyDown$.pipe(filter(event => event.key === 'ArrowRight'), mapTo(ARROW_RIGHT)),
  keyUp$.pipe(mapTo(0))
)

const ticker$: Ticker$ = interval(TICKER_INTERVAL, animationFrameScheduler).pipe(
  map(() => ({
    time: Date.now(),
    deltaTime: null
  })),
  scan((previous, current) => ({
    time: current.time,
    deltaTime: (current.time - previous.time) / 1000
  }))
)

const createPaddle$ = (ticker$: Ticker$): Paddle$ => ticker$.pipe(
  withLatestFrom(direction$, (ticker, direction) => {
    return ticker.deltaTime * PADDLE_SPEED * direction
  }),
  scan((position, dist) => {
    const nextPosistion = position + dist
    return Math.max(
      Math.min(nextPosistion, stage.width - PADDLE_WIDTH / 2),
      PADDLE_WIDTH / 2
    )
  }, stage.width / 2),
  distinctUntilChanged()
)


function createBricks(): Brick[] {
 const width = (stage.width - BRICK_GAP - BRICK_GAP * BRICK_COLUMNS) / BRICK_COLUMNS
 const bricks: Brick[] = []
 for (let i = 0; i < BRICK_ROWS; i++) {
   for (let j = 0; j < BRICK_COLUMNS; j++) {
     bricks.push({
       x: j * (width + BRICK_GAP) + width / 2 + BRICK_GAP,
       y: i * (BRICK_HEIGHT + BRICK_GAP) + BRICK_HEIGHT / 2 + BRICK_GAP + 20,
       width,
       height: BRICK_HEIGHT
     })
   }
 }
 return bricks
}

// initialize state
const initialState = (): State => ({
  ball: {
    position: {
      x: stage.width / 2,
      y: stage.height / 2
    },
    direction: {
      x: 2,
      y: 2
    }
  },
  bricks: createBricks(),
  score: 0
})

const createState$ = (ticker$: Ticker$, paddle$: Paddle$): State$ => ticker$.pipe(
  withLatestFrom(paddle$),
  scan((state:State, [ticker, paddle]: [Ticker, number]) => {
    let { ball, bricks, score } = state
    const remainingBricks = []
    const collision: Collision = {
      paddle: false,
      floor: false,
      wall: false,
      ceiling: false,
      brick: false
    }

    // update ball position
    ball.position.x = ball.position.x + ball.direction.x * ticker.deltaTime * BALL_SPEED
    ball.position.y = ball.position.y + ball.direction.y * ticker.deltaTime * BALL_SPEED

    // brick collision 
    bricks.forEach(brick => {
      if (!isCollision(ball, brick)) {
        remainingBricks.push(brick)
      } else {
        score = score + 10
        collision.brick = true
      }
    })
    
    // paddle collistion
    collision.paddle = isHit(ball, paddle)

    // wall collisition
    if (ball.position.x < BALL_RADIUS || ball.position.x > stage.width - BALL_RADIUS) {
      // bounce x
      ball.direction.x = -ball.direction.x
      collision.wall = true
    }

    // ceiling collision
    collision.ceiling = ball.position.y < BALL_RADIUS

    // bounce y
    if (collision.brick || collision.paddle || collision.ceiling) {
      ball.direction.y = -ball.direction.y
    }

    return {
      ball,
      bricks: remainingBricks,
      score
    }

  }, initialState())
)

let restart$

const game$ = Observable.create(observer => {
  drawIntro()

  restart$ = new Subject()

  const paddle$ = createPaddle$(ticker$)
  const state$ = createState$(ticker$, paddle$)

  ticker$.pipe(
    withLatestFrom(paddle$, state$),
    mergeOpr(restart$)
  ).subscribe(observer)
}) 

game$.pipe(
  retryWhen(err$ => err$.pipe(delay(1000)))
).subscribe(updateView)

// start game
function updateView([ticker, paddle, {ball, score, bricks}]: [Ticker, number, State]) {
  context.clearRect(0, 0, stage.width, stage.height)

  drawPaddle(paddle)
  drawBall(ball)
  drawBricks(bricks)
  drawScore(score)

  if (ball.position.y > stage.height - BALL_RADIUS) {
    drawGameOver('GAME OVER')
    restart$.error('game over')
  }

  if (bricks.length === 0) {
    drawGameOver('Congradulations!')
    restart$.error('cong')
  }
}