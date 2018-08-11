import { fromEvent, interval, Observable, animationFrameScheduler, merge, Subject } from 'rxjs';
import { map, scan, filter, mapTo, withLatestFrom, distinctUntilChanged, retryWhen, merge as mergeOpr, delay } from 'rxjs/operators';
// initialize canvas
var stage = document.querySelector('#stage');
var context = stage.getContext('2d');
context.fillStyle = 'green';
// constants 
var PADDLE_WIDTH = 200;
var PADDLE_HEIGHT = 20;
var PADDLE_SPEED = 240;
var BALL_RADIUS = 10;
var BALL_SPEED = 60;
var BRICK_ROWS = 5;
var BRICK_COLUMNS = 7;
var BRICK_HEIGHT = 20;
var BRICK_GAP = 3;
var TICKER_INTERVAL = Math.ceil(1000 / 60);
var ARROW_LEFT = -1;
var ARROW_RIGHT = 1;
// draw functions
function drawBall(ball) {
    context.beginPath();
    context.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.closePath();
}
function drawPaddle(paddle) {
    context.beginPath();
    context.rect(paddle - PADDLE_WIDTH / 2, context.canvas.height - PADDLE_HEIGHT, PADDLE_WIDTH, PADDLE_HEIGHT);
    context.fill();
    context.closePath();
}
function drawBrick(brick) {
    context.beginPath();
    context.rect(brick.x - brick.width / 2, brick.y - brick.height / 2, brick.width, brick.height);
    context.fill();
    context.closePath();
}
function drawBricks(bricks) {
    context.beginPath();
    bricks.forEach(drawBrick);
}
function drawScore(score) {
    context.textAlign = 'left';
    context.font = '16px Courier New';
    context.fillText("" + score, BRICK_GAP, 16);
}
function drawIntro() {
    context.clearRect(0, 0, stage.width, stage.height);
    context.textAlign = 'center';
    context.font = '24px Courier New';
    context.fillText('Press [<] and [>]', stage.width / 2, stage.height / 2);
}
function drawGameOver(message) {
    context.clearRect(0, 0, stage.width, stage.height);
    context.textAlign = 'center';
    context.font = '24px Courier New';
    context.fillText(message, stage.width / 2, stage.height / 2);
}
// collision function
function isHit(ball, paddle) {
    var _a = ball.position, x = _a.x, y = _a.y;
    return x > paddle - PADDLE_WIDTH / 2
        && x < paddle + PADDLE_WIDTH / 2
        && y > stage.height - PADDLE_HEIGHT - BALL_RADIUS;
}
function isCollision(ball, brick) {
    return ball.position.x + ball.direction.x > brick.x - brick.width / 2
        && ball.position.x + ball.direction.x < brick.x + brick.width / 2
        && ball.position.y + ball.direction.y > brick.y - brick.height / 2
        && ball.position.y + ball.direction.y < brick.y + brick.height / 2;
}
// stream declaration
var keyUp$ = fromEvent(document, 'keyup');
var keyDown$ = fromEvent(document, 'keydown');
var direction$ = merge(
// left move
keyDown$.pipe(filter(function (event) { return event.key === 'ArrowLeft'; }), mapTo(ARROW_LEFT)), 
// right move
keyDown$.pipe(filter(function (event) { return event.key === 'ArrowRight'; }), mapTo(ARROW_RIGHT)), keyUp$.pipe(mapTo(0)));
var ticker$ = interval(TICKER_INTERVAL, animationFrameScheduler).pipe(map(function () { return ({
    time: Date.now(),
    deltaTime: null
}); }), scan(function (previous, current) { return ({
    time: current.time,
    deltaTime: (current.time - previous.time) / 1000
}); }));
var createPaddle$ = function (ticker$) { return ticker$.pipe(withLatestFrom(direction$, function (ticker, direction) {
    return ticker.deltaTime * PADDLE_SPEED * direction;
}), scan(function (position, dist) {
    var nextPosistion = position + dist;
    return Math.max(Math.min(nextPosistion, stage.width - PADDLE_WIDTH / 2), PADDLE_WIDTH / 2);
}, stage.width / 2), distinctUntilChanged()); };
function createBricks() {
    var width = (stage.width - BRICK_GAP - BRICK_GAP * BRICK_COLUMNS) / BRICK_COLUMNS;
    var bricks = [];
    for (var i = 0; i < BRICK_ROWS; i++) {
        for (var j = 0; j < BRICK_COLUMNS; j++) {
            bricks.push({
                x: j * (width + BRICK_GAP) + width / 2 + BRICK_GAP,
                y: i * (BRICK_HEIGHT + BRICK_GAP) + BRICK_HEIGHT / 2 + BRICK_GAP + 20,
                width: width,
                height: BRICK_HEIGHT
            });
        }
    }
    return bricks;
}
// initialize state
var initialState = function () { return ({
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
}); };
var createState$ = function (ticker$, paddle$) { return ticker$.pipe(withLatestFrom(paddle$), scan(function (state, _a) {
    var ticker = _a[0], paddle = _a[1];
    var ball = state.ball, bricks = state.bricks, score = state.score;
    var remainingBricks = [];
    var collision = {
        paddle: false,
        floor: false,
        wall: false,
        ceiling: false,
        brick: false
    };
    // update ball position
    ball.position.x = ball.position.x + ball.direction.x * ticker.deltaTime * BALL_SPEED;
    ball.position.y = ball.position.y + ball.direction.y * ticker.deltaTime * BALL_SPEED;
    // brick collision 
    bricks.forEach(function (brick) {
        if (!isCollision(ball, brick)) {
            remainingBricks.push(brick);
        }
        else {
            score = score + 10;
            collision.brick = true;
        }
    });
    // paddle collistion
    collision.paddle = isHit(ball, paddle);
    // wall collisition
    if (ball.position.x < BALL_RADIUS || ball.position.x > stage.width - BALL_RADIUS) {
        // bounce x
        ball.direction.x = -ball.direction.x;
        collision.wall = true;
    }
    // ceiling collision
    collision.ceiling = ball.position.y < BALL_RADIUS;
    // bounce y
    if (collision.brick || collision.paddle || collision.ceiling) {
        ball.direction.y = -ball.direction.y;
    }
    return {
        ball: ball,
        bricks: remainingBricks,
        score: score
    };
}, initialState())); };
var restart$;
var game$ = Observable.create(function (observer) {
    drawIntro();
    restart$ = new Subject();
    var paddle$ = createPaddle$(ticker$);
    var state$ = createState$(ticker$, paddle$);
    ticker$.pipe(withLatestFrom(paddle$, state$), mergeOpr(restart$)).subscribe(observer);
});
game$.pipe(retryWhen(function (err$) { return err$.pipe(delay(1000)); })).subscribe(updateView);
// start game
function updateView(_a) {
    var ticker = _a[0], paddle = _a[1], _b = _a[2], ball = _b.ball, score = _b.score, bricks = _b.bricks;
    context.clearRect(0, 0, stage.width, stage.height);
    drawPaddle(paddle);
    drawBall(ball);
    drawBricks(bricks);
    drawScore(score);
    if (ball.position.y > stage.height - BALL_RADIUS) {
        drawGameOver('GAME OVER');
        restart$.error('game over');
    }
    if (bricks.length === 0) {
        drawGameOver('Congradulations!');
        restart$.error('cong');
    }
}
