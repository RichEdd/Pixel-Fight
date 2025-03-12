// Get the canvas and context
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Check for Safari browser
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Game variables
const player = {
    x: canvas.width / 2,
    y: canvas.height - 50,
    width: 32,
    height: 32,
    color: "#3498db",
    speed: 5,
    // Modified dash properties
    dashSpeed: 15,
    dashDistance: 100,
    dashDuration: 10,
    dashCooldown: 30,
    isDashing: false,
    dashDirection: {x: 0, y: 0}, // Now using x,y coordinates for direction
    dashTimer: 0,
    dashCooldownTimer: 0,
    dashesAvailable: 2 // NEW: Player can now dash twice before cooldown
};

const balls = [];
const particles = [];
let score = 0;
let gameOver = false;
let paused = false;
let consecutiveBlueHits = 0;
let bombAvailable = false;

// Controls
const keys = {};
window.addEventListener("keydown", function(e) {
    keys[e.key] = true;
});
window.addEventListener("keyup", function(e) {
    keys[e.key] = false;
});

// Gamepad support with Safari checks
let gamepads = {};
let gamepadConnected = false;
let previousButtonStates = {};

// Safe gamepad getter function
function getGamepads() {
    try {
        if (navigator.getGamepads) {
            return navigator.getGamepads();
        } else if (navigator.webkitGetGamepads) {
            return navigator.webkitGetGamepads();
        }
        return [];
    } catch (e) {
        console.warn('Error accessing gamepads:', e);
        return [];
    }
}

// Event listener for gamepad connection with error handling
window.addEventListener("gamepadconnected", function(e) {
    try {
        console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
            e.gamepad.index, e.gamepad.id,
            e.gamepad.buttons.length, e.gamepad.axes.length);
        
        gamepads[e.gamepad.index] = e.gamepad;
        gamepadConnected = true;
        previousButtonStates[e.gamepad.index] = Array(e.gamepad.buttons.length).fill(false);
    } catch (error) {
        console.warn('Error in gamepad connection:', error);
    }
});

// Event listener for gamepad disconnection
window.addEventListener("gamepaddisconnected", function(e) {
    console.log("Gamepad disconnected from index %d: %s",
        e.gamepad.index, e.gamepad.id);
    
    delete gamepads[e.gamepad.index];
    delete previousButtonStates[e.gamepad.index];
    if (Object.keys(gamepads).length === 0) {
        gamepadConnected = false;
    }
});

// Function to check for button press (not just held down)
function isButtonPressed(gamepad, buttonIndex, gamepadIndex) {
    if (!gamepad.buttons[buttonIndex]) return false;
    
    const isPressed = gamepad.buttons[buttonIndex].pressed;
    const wasPressed = previousButtonStates[gamepadIndex][buttonIndex];
    
    // Update the previous state
    previousButtonStates[gamepadIndex][buttonIndex] = isPressed;
    
    // Only return true on the initial press (not while held)
    return isPressed && !wasPressed;
}

// *** SEPARATE PAUSE DETECTION FUNCTION ***
function checkPauseInput() {
    // Check gamepad pause button (button 9)
    if (gamepadConnected) {
        const gamepadsArray = navigator.getGamepads ? navigator.getGamepads() : 
                             (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : []);
        
        for (const gamepadId in gamepads) {
            const gamepad = gamepadsArray[gamepadId];
            if (!gamepad) continue;
            
            // Only check for pause button press
            if (isButtonPressed(gamepad, 9, gamepadId)) {
                console.log("Pause button pressed, toggling pause state");
                paused = !paused;
                return; // Exit after toggling pause to prevent multiple toggles
            }
        }
    }
    
    // Check keyboard Escape key for pause
    if (keys["Escape"] && !gameOver) {
        // Only toggle once per keypress
        if (!keys.escapePrevState) {
            paused = !paused;
            console.log("Escape key pressed, toggling pause state to:", paused);
            keys.escapePrevState = true;
        }
    } else {
        keys.escapePrevState = false;
    }
}

// Modified gamepad input function with Safari checks
function getGamepadInput() {
    if (paused || !gamepadConnected) return;
    
    try {
        const gamepadsArray = getGamepads();
        if (!gamepadsArray) return;
        
        // Process first connected gamepad
        for (const gamepadId in gamepads) {
            const gamepad = gamepadsArray[gamepadId];
            if (!gamepad) continue;
            
            // Verify gamepad properties exist before using them
            if (!gamepad.axes || !gamepad.buttons) {
                console.warn('Invalid gamepad structure');
                continue;
            }
            
            // Left stick for movement
            // Xbox controller left stick horizontal (X) axis is typically index 0
            const leftStickX = gamepad.axes[0];
            // Xbox controller left stick vertical (Y) axis is typically index 1
            const leftStickY = gamepad.axes[1];
            
            // Apply deadzone to avoid drift (adjust as needed)
            const deadzone = 0.15;
            
            // Skip movement input if player is dashing
            if (!player.isDashing) {
                // Horizontal movement
                if (Math.abs(leftStickX) > deadzone) {
                    player.x += player.speed * leftStickX;
                    // Keep player within boundaries
                    if (player.x < 0) player.x = 0;
                    if (player.x > canvas.width - player.width) player.x = canvas.width - player.width;
                }
                
                // Vertical movement
                if (Math.abs(leftStickY) > deadzone) {
                    player.y += player.speed * leftStickY; // Note: Y-axis is usually inverted
                    // Keep player within boundaries
                    if (player.y < 0) player.y = 0;
                    if (player.y > canvas.height - player.height) player.y = canvas.height - player.height;
                }
                
                // D-pad support (alternative to analog stick)
                // D-pad buttons are typically 14 (up), 15 (down), 16 (left), 17 (right)
                if (gamepad.buttons[14].pressed) { // D-pad up
                    player.y -= player.speed;
                }
                if (gamepad.buttons[15].pressed) { // D-pad down
                    player.y += player.speed;
                }
                if (gamepad.buttons[16].pressed) { // D-pad left
                    player.x -= player.speed;
                }
                if (gamepad.buttons[17].pressed) { // D-pad right
                    player.x += player.speed;
                }
            }
            
            // Check for dash input (LB and RB buttons, typically 4 and 5)
            if (!player.isDashing && player.dashesAvailable > 0) {
                // Get direction for potential dash
                let dashX = 0;
                let dashY = 0;
                
                // Get direction from left stick
                if (Math.abs(leftStickX) > deadzone) {
                    dashX = leftStickX > 0 ? 1 : -1;
                }
                
                if (Math.abs(leftStickY) > deadzone) {
                    dashY = leftStickY > 0 ? 1 : -1;  // Note: Positive Y is down
                }
                
                // Alternative: Get direction from D-pad
                if (gamepad.buttons[14].pressed) dashY = -1;  // Up
                if (gamepad.buttons[15].pressed) dashY = 1;   // Down
                if (gamepad.buttons[16].pressed) dashX = -1;  // Left
                if (gamepad.buttons[17].pressed) dashX = 1;   // Right
                
                // If there's a direction and a dash button is pressed
                if ((dashX !== 0 || dashY !== 0) && (gamepad.buttons[4].pressed || gamepad.buttons[5].pressed)) {
                    startDash(dashX, dashY);
                }
                // Keep old controls as fallbacks if no direction is given
                else if (gamepad.buttons[4].pressed) {
                    startDash(-1, 0); // Left dash with LB
                }
                else if (gamepad.buttons[5].pressed) {
                    startDash(1, 0);  // Right dash with RB
                }
            }
            
            // Restart game with A button (typically button 0)
            if (gameOver && gamepad.buttons[0].pressed) {
                restartGame();
            }
            
            // Use bomb with X button (typically button 2)
            if (bombAvailable && isButtonPressed(gamepad, 2, gamepadId)) {
                activateBomb();
            }
            
            break; // Only process the first connected gamepad
        }
    } catch (error) {
        console.warn('Error processing gamepad input:', error);
    }
}

// Function to start a dash (now with x,y direction)
function startDash(directionX, directionY) {
    player.isDashing = true;
    player.dashDirection = {x: directionX, y: directionY};
    player.dashTimer = player.dashDuration;
    player.dashesAvailable--; // Decrement available dashes
    
    // Normalize diagonal movement for consistent speed
    if (directionX !== 0 && directionY !== 0) {
        const normalizer = 1 / Math.sqrt(directionX * directionX + directionY * directionY);
        player.dashDirection.x *= normalizer;
        player.dashDirection.y *= normalizer;
    }
    
    // Create dash effect particles
    createDashEffect(
        player.x + player.width / 2, 
        player.y + player.height / 2, 
        player.dashDirection.x, 
        player.dashDirection.y
    );
}

// Function to update dash state
function updateDash() {
    // Update dash cooldown timer
    if (player.dashCooldownTimer > 0) {
        player.dashCooldownTimer--;
        
        // Replenish dashes when cooldown completes
        if (player.dashCooldownTimer === 0) {
            player.dashesAvailable = 2;
        }
    }
    
    // If player is dashing
    if (player.isDashing) {
        // Move player in dash direction
        player.x += player.dashSpeed * player.dashDirection.x;
        player.y += player.dashSpeed * player.dashDirection.y;
        
        // Create trail effect
        if (player.dashTimer % 2 === 0) {
            createDashTrail(player.x + player.width / 2, player.y + player.height / 2);
        }
        
        // Keep player within boundaries
        if (player.x < 0) player.x = 0;
        if (player.x > canvas.width - player.width) player.x = canvas.width - player.width;
        if (player.y < 0) player.y = 0;
        if (player.y > canvas.height - player.height) player.y = canvas.height - player.height;
        
        // Decrement dash timer
        player.dashTimer--;
        
        // End dash when timer reaches 0
        if (player.dashTimer <= 0) {
            player.isDashing = false;
            
            // Only start cooldown when out of dashes
            if (player.dashesAvailable <= 0) {
                player.dashCooldownTimer = player.dashCooldown;
            }
        }
    }
}

// Function to create dash effect particles (updated for diagonal dashing)
function createDashEffect(x, y, directionX, directionY) {
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: x,
            y: y,
            size: Math.random() * 4 + 2,
            speedX: -directionX * (Math.random() * 4 + 2), // Particles go opposite way of dash
            speedY: -directionY * (Math.random() * 4 + 2),
            color: '#3498db',
            life: 15 + Math.random() * 10
        });
    }
}

// Function to create dash trail
function createDashTrail(x, y) {
    particles.push({
        x: x,
        y: y,
        size: player.width / 2,
        speedX: 0,
        speedY: 0,
        color: 'rgba(52, 152, 219, 0.5)',
        life: 10,
        isTrail: true
    });
}

// Bomb functionality
function activateBomb() {
    // Separate balls into red and blue for different effects
    const redBalls = balls.filter(ball => !ball.isBonus);
    const blueBalls = balls.filter(ball => ball.isBonus);
    
    // Create explosion effect for all red balls
    redBalls.forEach(ball => {
        const centerX = ball.x + ball.width / 2;
        const centerY = ball.y + ball.height / 2;
        createExplosion(centerX, centerY);
        score -= 5; // Half penalty for clearing red balls with bomb
    });
    
    // Create gather effect for all blue balls
    blueBalls.forEach(ball => {
        createGatherEffect(ball.x + ball.width / 2, ball.y + ball.height / 2, player.x + player.width / 2, player.y + player.height / 2);
        score += 3; // Slightly reduced bonus for gathering blue balls with bomb
    });
    
    // Clear all balls
    balls.length = 0;
    
    // Reset bomb status
    bombAvailable = false;
    consecutiveBlueHits = 0;
}

// Particle effects
function createGatherEffect(startX, startY, endX, endY) {
    const particleCount = 15;
    const colors = ['#3498db', '#2ecc71', '#f1c40f', '#e74c3c', '#9b59b6', '#1abc9c'];
    
    for (let i = 0; i < particleCount; i++) {
        // Calculate direction vector to player
        const dx = endX - startX;
        const dy = endY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Normalize direction and add some randomness
        const dirX = (dx / distance) + (Math.random() - 0.5) * 0.5;
        const dirY = (dy / distance) + (Math.random() - 0.5) * 0.5;
        
        particles.push({
            x: startX,
            y: startY,
            size: Math.random() * 4 + 2,
            speedX: dirX * (2 + Math.random() * 3),
            speedY: dirY * (2 + Math.random() * 3),
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 40 + Math.random() * 20,
            type: 'gather',
            targetX: endX,
            targetY: endY,
            acceleration: 1.05  // Speed increases as it approaches player
        });
    }
}

function createExplosion(x, y) {
    const particleCount = 30;
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: x,
            y: y,
            size: Math.random() * 5 + 2,
            speedX: (Math.random() - 0.5) * 8,
            speedY: (Math.random() - 0.5) * 8,
            color: `rgb(${200 + Math.random() * 55}, ${100 + Math.random() * 50}, ${Math.random() * 50})`,
            life: 30 + Math.random() * 20
        });
    }
}

function createConfetti(x, y) {
    const particleCount = 40;
    const colors = ['#3498db', '#2ecc71', '#f1c40f', '#e74c3c', '#9b59b6', '#1abc9c'];
    
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: x,
            y: y,
            size: Math.random() * 6 + 2,
            speedX: (Math.random() - 0.5) * 6,
            speedY: (Math.random() * -6) - 2, // Mostly upward
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 40 + Math.random() * 20,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        
        // Special handling for gathering particles
        if (p.type === 'gather') {
            // Get direction to target
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If very close to target, remove particle
            if (distance < 10) {
                particles.splice(i, 1);
                continue;
            }
            
            // Accelerate towards target
            p.speedX *= p.acceleration;
            p.speedY *= p.acceleration;
            
            // Limit max speed
            const maxSpeed = 10;
            const currentSpeed = Math.sqrt(p.speedX * p.speedX + p.speedY * p.speedY);
            if (currentSpeed > maxSpeed) {
                p.speedX = (p.speedX / currentSpeed) * maxSpeed;
                p.speedY = (p.speedY / currentSpeed) * maxSpeed;
            }
        }
        
        // Update position
        p.x += p.speedX;
        p.y += p.speedY;
        
        // Add gravity to confetti
        if (p.rotationSpeed) {
            p.speedY += 0.15;
            p.rotation += p.rotationSpeed;
        }
        
        // Reduce life
        p.life--;
        
        // Remove dead particles
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    for (const p of particles) {
        ctx.save();
        
        // For confetti (particles with rotation)
        if (p.rotation !== undefined) {
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size/2);
        } 
        // For dash trail particles
        else if (p.isTrail) {
            ctx.globalAlpha = p.life / 10; // Fade out
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        // For gathering particles (make them fade as they get closer to player)
        else if (p.type === 'gather') {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life / 60; // Fade out as it approaches player
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        // For explosion particles
        else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}

// Game functions
function spawnBall() {
    if (Math.random() < 0.02) {
        // Determine if it's a red (penalty) or blue (bonus) ball
        const isBonus = Math.random() < 0.3; // 30% chance for bonus balls
        
        const ball = {
            x: Math.random() * (canvas.width - 20),
            y: 0,
            width: 20,
            height: 20,
            color: isBonus ? "#3498db" : "#e74c3c", // Blue for bonus, Red for penalty
            speed: 2 + Math.random() * 3,
            isBonus: isBonus
        };
        balls.push(ball);
    }
}

function movePlayer() {
    // Update dash state
    updateDash();
    
    // Skip regular movement if player is dashing
    if (player.isDashing) return;
    
    // Keyboard controls for left-right movement
    if (keys["ArrowLeft"] && player.x > 0) {
        player.x -= player.speed;
    }
    if (keys["ArrowRight"] && player.x < canvas.width - player.width) {
        player.x += player.speed;
    }
    
    // Keyboard controls for up-down movement
    if (keys["ArrowUp"] && player.y > 0) {
        player.y -= player.speed;
    }
    if (keys["ArrowDown"] && player.y < canvas.height - player.height) {
        player.y += player.speed;
    }
    
    // Keyboard dash controls (now with diagonal dash support)
    if (!player.isDashing && player.dashesAvailable > 0) {
        let dashX = 0;
        let dashY = 0;
        
        // Get direction from arrow keys
        if (keys["ArrowLeft"]) dashX = -1;
        if (keys["ArrowRight"]) dashX = 1;
        if (keys["ArrowUp"]) dashY = -1;
        if (keys["ArrowDown"]) dashY = 1;
        
        // If there's a direction and a dash key is pressed
        if ((dashX !== 0 || dashY !== 0) && (keys["q"] || keys["e"])) {
            startDash(dashX, dashY);
        }
        // Keep old controls as fallbacks
        else if (keys["q"]) {
            startDash(-1, 0); // Left dash with Q key
        } else if (keys["e"]) {
            startDash(1, 0); // Right dash with E key
        }
    }
    
    // Get gamepad input (if connected)
    getGamepadInput();
}

function moveBalls() {
    for (let i = balls.length - 1; i >= 0; i--) {
        balls[i].y += balls[i].speed;
        
        // Check if ball is off screen
        if (balls[i].y > canvas.height) {
            balls.splice(i, 1);
        }
        // Check collision with player
        else if (collision(player, balls[i])) {
            // Calculate center of the ball for particle effect
            const ballCenterX = balls[i].x + balls[i].width / 2;
            const ballCenterY = balls[i].y + balls[i].height / 2;
            
            // Apply score changes based on ball type and create appropriate effect
            if (balls[i].isBonus) {
                score += 5; // Blue ball gives 5 points
                createConfetti(ballCenterX, ballCenterY);
                
                // Increment consecutive blue hits counter
                consecutiveBlueHits++;
                
                // Check if we've reached 10 blue hits in a row
                if (consecutiveBlueHits >= 10 && !bombAvailable) {
                    bombAvailable = true;
                }
            } else {
                score -= 10; // Red ball deducts 10 points
                createExplosion(ballCenterX, ballCenterY);
                
                // Reset consecutive blue hits counter
                consecutiveBlueHits = 0;
            }
            
            balls.splice(i, 1); // Remove the ball after collision
        }
    }
}

function collision(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw player (pulse effect if bomb is available)
    if (bombAvailable) {
        // Create pulsing effect for player when bomb is available
        const pulseSize = 4 * Math.sin(Date.now() / 200) + 4;
        
        // Draw glowing halo
        ctx.fillStyle = "rgba(52, 152, 219, 0.3)";
        ctx.beginPath();
        ctx.arc(player.x + player.width/2, player.y + player.height/2, 
                player.width/2 + pulseSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Change player color during dash
    if (player.isDashing) {
        ctx.fillStyle = "#2ecc71"; // Green color during dash
    } else {
        ctx.fillStyle = player.color;
    }
    
    // Draw player
    ctx.fillRect(player.x, player.y, player.width, player.height);
    
    // Draw balls
    for (const ball of balls) {
        ctx.fillStyle = ball.color;
        ctx.fillRect(ball.x, ball.y, ball.width, ball.height);
    }
    
    // Draw particles
    drawParticles();
    
    // Draw score
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px Arial";
    ctx.fillText("Score: " + score, 10, 30);
    
    // Draw controller status
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.fillText(gamepadConnected ? "Controller: Connected" : "Controller: Not Connected", 10, 60);
    
    // Draw bomb status
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    if (bombAvailable) {
        ctx.fillText("BOMB READY! Press X button to use", 10, 90);
    } else {
        ctx.fillText(`Blue streak: ${consecutiveBlueHits}/10`, 10, 90);
    }
    
    // Draw dash status (updated to show available dashes)
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    if (player.dashCooldownTimer > 0) {
        ctx.fillText(`Dash cooldown: ${Math.ceil(player.dashCooldownTimer / 60 * 100) / 100}s`, 10, 120);
    } else {
        ctx.fillText(`Dash READY: ${player.dashesAvailable} remaining (LB/RB or Q/E)`, 10, 120);
    }
    
    // Draw pause screen
    if (paused) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "40px Arial";
        ctx.fillText("PAUSED", canvas.width/2 - 80, canvas.height/2);
        ctx.font = "20px Arial";
        ctx.fillText("Press button 9 to resume", canvas.width/2 - 120, canvas.height/2 + 40);
    }
    
    // Game over message
    if (gameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "40px Arial";
        ctx.fillText("GAME OVER", canvas.width/2 - 100, canvas.height/2);
        ctx.font = "20px Arial";
        ctx.fillText("Press R or A button to restart", canvas.width/2 - 120, canvas.height/2 + 40);
    }
}

// Modified update function with error handling
function update() {
    try {
        // Always check for pause input, even when game is paused or over
        checkPauseInput();
        
        // Only update game state if not paused and not game over
        if (!gameOver && !paused) {
            spawnBall();
            movePlayer();
            moveBalls();
            updateParticles();
        } else if (gameOver && keys["r"]) {
            restartGame();
        }
        
        draw();
        requestAnimationFrame(update);
    } catch (error) {
        console.error('Error in game update:', error);
        // Attempt to recover
        setTimeout(() => requestAnimationFrame(update), 1000);
    }
}

function restartGame() {
    balls.length = 0;
    particles.length = 0;
    score = 0;
    gameOver = false;
    paused = false;
    consecutiveBlueHits = 0;
    bombAvailable = false;
    player.isDashing = false;
    player.dashTimer = 0;
    player.dashCooldownTimer = 0;
    player.dashesAvailable = 2; // Reset available dashes
    player.x = canvas.width / 2;
    player.y = canvas.height - 50;
}

// Start the game
update(); 