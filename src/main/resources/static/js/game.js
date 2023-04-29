document.addEventListener('DOMContentLoaded', function() {

    const gameContainer = document.getElementById('game-container');
    const player = document.getElementById('player');
    const scoreElement = document.getElementById('score');
    const levelElement = document.getElementById('level');
    const livesElement = document.getElementById('lives');
    const highScoreElement = document.getElementById('high-score');


    let playerX = gameContainer.clientWidth / 2;
    let playerY = 50;
    let paused = false;
    const fireRate = 200; // Time between shots in milliseconds
    let lastProjectileTime = 0;
    let lives = 3;
    let highScore = localStorage.getItem('highScore') ? parseInt(localStorage.getItem('highScore')) : 0;
    updateHighScore();



    const keysPressed = {};
    const pdfs = [];
    const projectiles = [];
    let score = 0;
    let level = 1;
    let pdfSpeed = 1;
    let gameOver = false;

    function handleKeys() {
	    if (keysPressed['ArrowLeft']) {
	        playerX -= 10;
	    }
	    if (keysPressed['ArrowRight']) {
	        playerX += 10;
	    }
	    if (keysPressed[' '] && !gameOver) {
	        const currentTime = new Date().getTime();
	        if (currentTime - lastProjectileTime >= fireRate) {
	            shootProjectile();
	            lastProjectileTime = currentTime;
	        }
	    }
	    updatePlayerPosition();
	}




    document.addEventListener('keydown', (event) => {
        keysPressed[event.key] = true;
        handleKeys();
    });

    document.addEventListener('keyup', (event) => {
        keysPressed[event.key] = false;
    });


    function updatePlayerPosition() {
        player.style.left = playerX + 'px';
        player.style.bottom = playerY + 'px';
    }

    function updateLives() {
        livesElement.textContent = 'Lives: ' + lives;
    }

    function updateHighScore() {
        highScoreElement.textContent = 'High Score: ' + highScore;
    }


    function shootProjectile() {
        const projectile = document.createElement('div');
        projectile.classList.add('projectile');
        projectile.style.backgroundColor = 'black';
        projectile.style.width = '5px';
        projectile.style.height = '10px';
        projectile.style.left = playerX + 20 + 'px';
        projectile.style.top = (gameContainer.clientHeight - playerY - 20) + 'px';
        gameContainer.appendChild(projectile);
        projectiles.push(projectile);
    }


    function spawnPdf() {
        const pdf = document.createElement('img');
        pdf.src = 'images/file-earmark-pdf.svg';
        pdf.classList.add('pdf');
        pdf.style.left = Math.floor(Math.random() * (gameContainer.clientWidth - 50)) + 'px';
        pdf.style.top = '0px';
        gameContainer.appendChild(pdf);
        pdfs.push(pdf);
    }

function resetEnemies() {
    pdfs.forEach((pdf) => gameContainer.removeChild(pdf));
    pdfs.length = 0;
}


    function updateGame() {
        if (gameOver || paused) return;

        pdfs.forEach((pdf, pdfIndex) => {
            const pdfY = parseInt(pdf.style.top) + pdfSpeed;
            if (pdfY + 50 > gameContainer.clientHeight) {
                gameContainer.removeChild(pdf);
                pdfs.splice(pdfIndex, 1);

                // Deduct 2 points when a PDF gets past the player
                score -= 0;
                updateScore();

                // Decrease lives and check if game over
                lives--;
                updateLives();
                if (lives <= 0) {
                    endGame();
                    return;
                }

            } else {
                pdf.style.top = pdfY + 'px';

                // Check for collision with player
                if (collisionDetected(player, pdf)) {
                    lives--;
                    updateLives();
                    resetEnemies();
                    if (lives <= 0) {
                        endGame();
                        return;
                    }
                }
            }
        });

        function resetGame() {
            playerX = gameContainer.clientWidth / 2;
            playerY = 50;
            updatePlayerPosition();

            pdfs.forEach((pdf) => gameContainer.removeChild(pdf));
            projectiles.forEach((projectile) => gameContainer.removeChild(projectile));

            pdfs.length = 0;
            projectiles.length = 0;

            score = 0;
            level = 1;
            lives = 3;
            pdfSpeed = 2;
            gameOver = false;

            updateScore();
            updateLevel();
            updateLives();

            setTimeout(updateGame, 1000 / 60);
            spawnPdfInterval();
        }



        projectiles.forEach((projectile, projectileIndex) => {
            const projectileY = parseInt(projectile.style.top) - 10;
            if (projectileY < 0) {
                gameContainer.removeChild(projectile);
                projectiles.splice(projectileIndex, 1);
            } else {
                projectile.style.top = projectileY + 'px';
            }

            for (let pdfIndex = 0; pdfIndex < pdfs.length; pdfIndex++) {
                const pdf = pdfs[pdfIndex];
                if (collisionDetected(projectile, pdf)) {
                    gameContainer.removeChild(pdf);
                    gameContainer.removeChild(projectile);
                    pdfs.splice(pdfIndex, 1);
                    projectiles.splice(projectileIndex, 1);
                    score = score + 10;
                    updateScore();
                    break;
                }
            }
        });

        setTimeout(updateGame, 1000 / 60);
    }




    function updateScore() {
	    scoreElement.textContent = 'Score: ' + score;
	    checkLevelUp();
	}



    function checkLevelUp() {
        const newLevel = Math.floor(score / 100) + 1;
        if (newLevel > level) {
            level = newLevel;
            levelElement.textContent = 'Level: ' + level;
            pdfSpeed += 1;
        }
    }

    function collisionDetected(a, b) {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return (
            rectA.left < rectB.right &&
            rectA.right > rectB.left &&
            rectA.top < rectB.bottom &&
            rectA.bottom > rectB.top
        );
    }

    function endGame() {
        gameOver = true;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('highScore', highScore);
            updateHighScore();
        }
        alert('Game Over! Your final score is: ' + score);
        resetGame();
    }




    let spawnPdfTimeout;

    function spawnPdfInterval() {
        if (gameOver || paused) {
            clearTimeout(spawnPdfTimeout);
            return;
        }
        spawnPdf();
        spawnPdfTimeout = setTimeout(spawnPdfInterval, 1000 - level * 50);
    }

    updatePlayerPosition();
    updateGame();
    spawnPdfInterval();


    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            paused = true;
        } else {
            paused = false;
            updateGame();
            spawnPdfInterval();
        }

    });

});