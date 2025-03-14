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
    dashesAvailable: 2, // NEW: Player can now dash twice before cooldown
    lastX: 0,
    lastY: 0
};

const balls = [];
const particles = [];
let score = 0;
let gameOver = false;
let paused = false;
let consecutiveBlueHits = 0;
let bombAvailable = false;

// Combo system variables
let comboMultiplier = 1;
let comboTimer = 0;
const COMBO_TIME_LIMIT = 120; // 2 seconds at 60fps
const MAX_COMBO_MULTIPLIER = 8;
let comboAnimationScale = 1;

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
let safariGamepadUpdateInterval = null;
let safariConnectionCheckInterval = null;
let lastGamepadTimestamp = 0;

// Add to the top with other game variables
const TRAIL_COLORS = ['#3498db', '#2980b9', '#1abc9c', '#16a085'];
let lastTrailTime = 0;
const TRAIL_INTERVAL = 50; // ms between trail particles

// Add to the top with other game variables
let screenShake = {
    intensity: 0,
    duration: 0,
    offsetX: 0,
    offsetY: 0
};

let backgroundEffects = {
    pulseSize: 0,
    pulseOpacity: 0,
    hue: 220, // Start with blue
    lastComboTime: 0
};

// Add to the top with other game variables
const CHAIN_LIGHTNING_RANGE = 150; // Maximum distance for chain lightning
const CHAIN_LIGHTNING_DURATION = 20; // Frames the lightning effect lasts
let activeChainLightning = [];

// Score multiplier zone variables
const MULTIPLIER_ZONE = {
    active: false,
    x: 0,
    y: 0,
    radius: 80,
    multiplier: 2,
    duration: 300, // 5 seconds at 60fps
    timer: 0,
    pulseSize: 0
};

// Safe gamepad getter function with enhanced Safari support
function getGamepads() {
    try {
        // Safari-specific handling
        if (isSafari) {
            const pads = navigator.webkitGetGamepads?.() || [];
            // Convert to array and preserve non-null gamepads
            const validPads = Array.from(pads).filter(pad => pad !== null);
            
            // Update timestamp to track active gamepad
            if (validPads.length > 0) {
                const now = Date.now();
                // Only update if we have actual new data
                if (validPads[0].timestamp !== lastGamepadTimestamp) {
                    lastGamepadTimestamp = validPads[0].timestamp;
                }
            }
            
            return validPads;
        }
        // Chrome and other browsers
        return Array.from(navigator.getGamepads?.() || []).filter(pad => pad !== null);
    } catch (e) {
        console.warn('Error accessing gamepads:', e);
        return [];
    }
}

// Function to check for gamepad connections in Safari
function checkSafariGamepadConnection() {
    if (!isSafari) return;
    
    try {
        const pads = getGamepads();
        const now = Date.now();
        let hasConnectedGamepad = false;
        
        // Check if we have any valid gamepads
        if (pads.length > 0) {
            const pad = pads[0]; // Focus on first gamepad
            
            // Consider gamepad connected if we have recent input
            // or if any button is pressed or any axis is non-zero
            const hasInput = pad.buttons.some(btn => {
                const val = typeof btn === 'number' ? btn : btn.value;
                return val > 0.1;
            }) || pad.axes.some(axis => Math.abs(axis) > 0.1);
            
            if (hasInput || (now - lastGamepadTimestamp) < 1000) {
                hasConnectedGamepad = true;
                if (!gamepads[pad.index]) {
                    console.log("Safari: Found gamepad at index", pad.index);
                    gamepads[pad.index] = pad;
                    previousButtonStates[pad.index] = Array(pad.buttons.length).fill(false);
                }
            }
        }
        
        // Update connection status
        if (hasConnectedGamepad && !gamepadConnected) {
            console.log("Safari: Gamepad connected");
            gamepadConnected = true;
            startSafariGamepadPolling();
        } else if (!hasConnectedGamepad && gamepadConnected) {
            // Only disconnect if we haven't had input for a while
            if ((now - lastGamepadTimestamp) > 1000) {
                console.log("Safari: Gamepad disconnected");
                gamepadConnected = false;
                stopSafariGamepadPolling();
            }
        }
    } catch (e) {
        console.warn('Error checking Safari gamepad connection:', e);
    }
}

// Function to update Safari gamepad state
function updateSafariGamepadState() {
    if (!isSafari || !gamepadConnected) return;
    
    try {
        const pads = getGamepads();
        pads.forEach((pad, index) => {
            if (pad && pad.connected) {
                // Deep copy the gamepad state
                gamepads[index] = {
                    ...pad,
                    buttons: pad.buttons.map(btn => {
                        if (typeof btn === 'number') return btn;
                        return { 
                            pressed: btn.pressed, 
                            touched: btn.touched,
                            value: btn.value 
                        };
                    }),
                    axes: [...pad.axes]
                };
            }
        });
    } catch (e) {
        console.warn('Error updating Safari gamepad state:', e);
    }
}

// Start Safari gamepad polling with more frequent updates
function startSafariGamepadPolling() {
    if (isSafari && !safariGamepadUpdateInterval) {
        console.log("Starting Safari gamepad polling");
        safariGamepadUpdateInterval = setInterval(updateSafariGamepadState, 8); // ~120fps for more responsive input
    }
}

// Start Safari gamepad connection checking with more frequent checks
function startSafariConnectionChecking() {
    if (isSafari && !safariConnectionCheckInterval) {
        console.log("Starting Safari gamepad connection checking");
        safariConnectionCheckInterval = setInterval(checkSafariGamepadConnection, 100); // Check every 100ms
        // Initial check
        checkSafariGamepadConnection();
    }
}

// Event listener for gamepad connection with Safari support
window.addEventListener("gamepadconnected", function(e) {
    try {
        console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
            e.gamepad.index, e.gamepad.id,
            e.gamepad.buttons.length, e.gamepad.axes.length);
        
        gamepads[e.gamepad.index] = e.gamepad;
        gamepadConnected = true;
        previousButtonStates[e.gamepad.index] = Array(e.gamepad.buttons.length).fill(false);
        
        if (isSafari) {
            startSafariGamepadPolling();
        }
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
        if (isSafari) {
            stopSafariGamepadPolling();
        }
    }
});

// Stop Safari gamepad polling
function stopSafariGamepadPolling() {
    if (safariGamepadUpdateInterval) {
        clearInterval(safariGamepadUpdateInterval);
        safariGamepadUpdateInterval = null;
    }
}

// Stop Safari gamepad connection checking
function stopSafariConnectionChecking() {
    if (safariConnectionCheckInterval) {
        clearInterval(safariConnectionCheckInterval);
        safariConnectionCheckInterval = null;
    }
}

// Start Safari connection checking when the game starts
if (isSafari) {
    startSafariConnectionChecking();
}

// Function to safely check button state with Safari fixes
function getButtonState(button) {
    if (!button) return false;
    
    try {
        // Safari might return button as a number instead of an object
        if (typeof button === 'number') {
            return button > 0.5;
        }
        // Handle Safari's different button structure
        if (isSafari) {
            if (typeof button.value !== 'undefined') {
                return button.value > 0.5;
            }
            return button.pressed;
        }
        // Standard gamepad API
        return button.pressed || button.value > 0.5;
    } catch (e) {
        console.warn('Error checking button state:', e);
        return false;
    }
}

// Modified gamepad input function with enhanced Safari support
function getGamepadInput() {
    if (paused) return;
    
    try {
        // For Safari, use the stored gamepad references
        if (isSafari) {
            for (const gamepadId in gamepads) {
                const gamepad = gamepads[gamepadId];
                if (!gamepad || !gamepad.buttons || !gamepad.axes) continue;
                
                handleGamepadControls(gamepad, gamepadId);
                break; // Only process the first connected gamepad
            }
            return;
        }
        
        // For other browsers, use standard gamepad API
        const gamepadsArray = getGamepads();
        for (const gamepadId in gamepads) {
            const gamepad = gamepadsArray[gamepadId];
            if (!gamepad) continue;
            
            handleGamepadControls(gamepad, gamepadId);
            break; // Only process the first connected gamepad
        }
    } catch (error) {
        console.warn('Error processing gamepad input:', error);
    }
}

// Separate function to handle gamepad controls
function handleGamepadControls(gamepad, gamepadId) {
    // Left stick for movement
    const leftStickX = gamepad.axes[0] || 0;
    const leftStickY = gamepad.axes[1] || 0;
    const deadzone = 0.15;
    
    if (!player.isDashing) {
        // Horizontal movement
        if (Math.abs(leftStickX) > deadzone) {
            player.x += player.speed * leftStickX;
            // Wrap around horizontally
            if (player.x + player.width < 0) {
                player.x = canvas.width;
            } else if (player.x > canvas.width) {
                player.x = -player.width;
            }
        }
        
        // Vertical movement
        if (Math.abs(leftStickY) > deadzone) {
            player.y += player.speed * leftStickY;
            // Wrap around vertically
            if (player.y + player.height < 0) {
                player.y = canvas.height;
            } else if (player.y > canvas.height) {
                player.y = -player.height;
            }
        }
        
        // D-pad support with safe button checking and wrapping
        if (getButtonState(gamepad.buttons[12])) { // Up
            player.y -= player.speed;
            if (player.y + player.height < 0) {
                player.y = canvas.height;
            }
        }
        if (getButtonState(gamepad.buttons[13])) { // Down
            player.y += player.speed;
            if (player.y > canvas.height) {
                player.y = -player.height;
            }
        }
        if (getButtonState(gamepad.buttons[14])) { // Left
            player.x -= player.speed;
            if (player.x + player.width < 0) {
                player.x = canvas.width;
            }
        }
        if (getButtonState(gamepad.buttons[15])) { // Right
            player.x += player.speed;
            if (player.x > canvas.width) {
                player.x = -player.width;
            }
        }
    }
    
    // Handle dash, bomb, and other controls
    handleGamepadActions(gamepad, gamepadId, leftStickX, leftStickY, deadzone);
}

// Separate function to handle gamepad actions
function handleGamepadActions(gamepad, gamepadId, leftStickX, leftStickY, deadzone) {
    // Dash handling
    if (!player.isDashing && player.dashesAvailable > 0) {
        let dashX = 0;
        let dashY = 0;
        
        // Get direction from stick and d-pad
        if (Math.abs(leftStickX) > deadzone) dashX = leftStickX > 0 ? 1 : -1;
        if (Math.abs(leftStickY) > deadzone) dashY = leftStickY > 0 ? 1 : -1;
        
        // D-pad input
        if (getButtonState(gamepad.buttons[12])) dashY = -1; // Up
        if (getButtonState(gamepad.buttons[13])) dashY = 1;  // Down
        if (getButtonState(gamepad.buttons[14])) dashX = -1; // Left
        if (getButtonState(gamepad.buttons[15])) dashX = 1;  // Right
        
        // Trigger dash
        const lbPressed = getButtonState(gamepad.buttons[4]);
        const rbPressed = getButtonState(gamepad.buttons[5]);
        
        if ((dashX !== 0 || dashY !== 0) && (lbPressed || rbPressed)) {
            startDash(dashX, dashY);
        } else if (lbPressed) {
            startDash(-1, 0);
        } else if (rbPressed) {
            startDash(1, 0);
        }
    }
    
    // Bomb handling
    if (bombAvailable && isButtonPressed(gamepad, 2, gamepadId)) {
        activateBomb();
    }
    
    // Restart game handling
    if (gameOver && getButtonState(gamepad.buttons[0])) {
        restartGame();
    }
}

// Function to start a dash (now with x,y direction)
function startDash(directionX, directionY) {
    if (!player.dashesAvailable || player.isDashing) return; // Early return if can't dash
    
    addScreenShake(7, 7);
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
    
    // Add a small combo boost for dashing
    if (comboMultiplier > 1) {
        comboTimer = Math.min(comboTimer + 30, COMBO_TIME_LIMIT); // Add 0.5 seconds to combo timer
    }
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
        
        // Handle screen wrapping during dash
        if (player.x + player.width < 0) player.x = canvas.width;
        if (player.x > canvas.width) player.x = -player.width;
        if (player.y + player.height < 0) player.y = canvas.height;
        if (player.y > canvas.height) player.y = -player.height;
        
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
    if (!bombAvailable) return; // Early return if bomb is not available
    
    addScreenShake(15, 15);
    
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
        const centerX = ball.x + ball.width / 2;
        const centerY = ball.y + ball.height / 2;
        createGatherEffect(centerX, centerY, player.x + player.width / 2, player.y + player.height / 2);
        score += 3; // Slightly reduced bonus for gathering blue balls with bomb
        
        // Add combo for each blue ball gathered
        comboTimer = COMBO_TIME_LIMIT;
        comboMultiplier = Math.min(comboMultiplier + 0.2, MAX_COMBO_MULTIPLIER);
        createComboText(centerX, centerY, `Combo x${comboMultiplier.toFixed(1)}`);
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
        
        if (p.type === 'comboText') {
            p.y += p.speedY;
            p.opacity = p.life / 60;
            p.life--;
            if (p.life <= 0) {
                particles.splice(i, 1);
            }
            continue;
        }
        
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
    
    // Update combo timer
    if (comboTimer > 0) {
        comboTimer--;
        if (comboTimer === 0) {
            comboMultiplier = 1; // Reset combo when timer runs out
        }
    }
    
    // Update combo animation
    if (comboAnimationScale > 1) {
        comboAnimationScale = Math.max(1, comboAnimationScale - 0.05);
    }
}

function drawParticles() {
    for (const p of particles) {
        ctx.save();
        
        if (p.type === 'comboText') {
            ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
            ctx.font = "bold 20px Arial";
            ctx.textAlign = "center";
            ctx.fillText(p.text, p.x, p.y);
        }
        // For confetti (particles with rotation)
        else if (p.rotation !== undefined) {
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
    if (keys["ArrowLeft"]) {
        player.x -= player.speed;
        // Wrap around horizontally
        if (player.x + player.width < 0) {
            player.x = canvas.width;
        }
    }
    if (keys["ArrowRight"]) {
        player.x += player.speed;
        // Wrap around horizontally
        if (player.x > canvas.width) {
            player.x = -player.width;
        }
    }
    
    // Keyboard controls for up-down movement
    if (keys["ArrowUp"]) {
        player.y -= player.speed;
        // Wrap around vertically
        if (player.y + player.height < 0) {
            player.y = canvas.height;
        }
    }
    if (keys["ArrowDown"]) {
        player.y += player.speed;
        // Wrap around vertically
        if (player.y > canvas.height) {
            player.y = -player.height;
        }
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
            const ballCenterX = balls[i].x + balls[i].width / 2;
            const ballCenterY = balls[i].y + balls[i].height / 2;
            
            if (balls[i].isBonus) {
                // Check if in multiplier zone
                const scoreMultiplier = isInMultiplierZone(ballCenterX, ballCenterY) ? 
                    MULTIPLIER_ZONE.multiplier * comboMultiplier : comboMultiplier;
                
                // Blue ball hit effects
                addScreenShake(5, 5);
                backgroundEffects.pulseSize = Math.min(canvas.width / 3, backgroundEffects.pulseSize + 50);
                
                // Update combo system
                comboTimer = COMBO_TIME_LIMIT;
                comboMultiplier = Math.min(comboMultiplier + 0.5, MAX_COMBO_MULTIPLIER);
                const comboScore = Math.floor(5 * scoreMultiplier);
                score += comboScore;
                
                // Chain lightning effect
                createChainLightning(balls[i]);
                
                // Visual feedback
                comboAnimationScale = 1.5;
                createComboText(ballCenterX, ballCenterY, 
                    `${comboScore} pts! x${scoreMultiplier.toFixed(1)}`);
                createConfetti(ballCenterX, ballCenterY);
                
                // Increment consecutive blue hits
                consecutiveBlueHits++;
                if (consecutiveBlueHits >= 10 && !bombAvailable) {
                    bombAvailable = true;
                }
            } else {
                // Red ball effects (unchanged)
                addScreenShake(10, 10);
                score -= 10;
                createExplosion(ballCenterX, ballCenterY);
                comboMultiplier = 1;
                comboTimer = 0;
                consecutiveBlueHits = 0;
            }
            
            balls.splice(i, 1);
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
    
    // Apply screen shake
    ctx.save();
    if (screenShake.duration > 0) {
        screenShake.offsetX = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.offsetY = (Math.random() - 0.5) * screenShake.intensity;
        ctx.translate(screenShake.offsetX, screenShake.offsetY);
        screenShake.duration--;
        screenShake.intensity *= 0.9;
    }
    
    // Draw reactive background
    if (comboMultiplier > 1) {
        // Update background pulse
        backgroundEffects.pulseSize = Math.min(canvas.width / 2, backgroundEffects.pulseSize + 2);
        backgroundEffects.pulseOpacity = 0.1 + (comboMultiplier / MAX_COMBO_MULTIPLIER) * 0.2;
        // Shift hue based on combo
        backgroundEffects.hue = 220 + (comboMultiplier / MAX_COMBO_MULTIPLIER) * 60;
    } else {
        backgroundEffects.pulseSize *= 0.95;
        backgroundEffects.pulseOpacity *= 0.95;
    }
    
    // Draw background pulse
    if (backgroundEffects.pulseSize > 0) {
        const gradient = ctx.createRadialGradient(
            canvas.width/2, canvas.height/2, 0,
            canvas.width/2, canvas.height/2, backgroundEffects.pulseSize
        );
        const hue = backgroundEffects.hue;
        gradient.addColorStop(0, `hsla(${hue}, 70%, 50%, ${backgroundEffects.pulseOpacity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Draw player glow effect
    const glowSize = player.isDashing ? 20 : 15;
    const glowOpacity = player.isDashing ? 0.4 : 0.2;
    const gradient = ctx.createRadialGradient(
        player.x + player.width/2, player.y + player.height/2, 0,
        player.x + player.width/2, player.y + player.height/2, glowSize
    );
    gradient.addColorStop(0, `rgba(52, 152, 219, ${glowOpacity})`);
    gradient.addColorStop(1, 'rgba(52, 152, 219, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(
        player.x - glowSize + player.width/2, 
        player.y - glowSize + player.height/2,
        player.width + glowSize * 2,
        player.height + glowSize * 2
    );
    
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
    
    // Draw score with combo multiplier
    ctx.save();
    if (comboMultiplier > 1) {
        // Scale the score text based on combo animation
        ctx.translate(10, 30);
        ctx.scale(comboAnimationScale, comboAnimationScale);
        ctx.translate(-10, -30);
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px Arial";
    ctx.fillText("Score: " + score, 10, 30);
    ctx.restore();
    
    // Draw combo multiplier if active
    if (comboMultiplier > 1) {
        ctx.fillStyle = "#f1c40f"; // Yellow color for combo
        ctx.font = "bold 24px Arial";
        ctx.fillText(`Combo x${comboMultiplier.toFixed(1)}`, 10, 60);
        
        // Draw combo timer bar
        const barWidth = 100;
        const barHeight = 5;
        ctx.fillStyle = "#2ecc71";
        ctx.fillRect(10, 65, (comboTimer / COMBO_TIME_LIMIT) * barWidth, barHeight);
        ctx.strokeStyle = "#ffffff";
        ctx.strokeRect(10, 65, barWidth, barHeight);
    }
    
    // Draw controller status
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.fillText(gamepadConnected ? "Controller: Connected" : "Controller: Not Connected", 10, 90);
    
    // Draw bomb status
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    if (bombAvailable) {
        ctx.fillText("BOMB READY! Press X button to use", 10, 120);
    } else {
        ctx.fillText(`Blue streak: ${consecutiveBlueHits}/10`, 10, 120);
    }
    
    // Draw dash status
    if (player.dashCooldownTimer > 0) {
        ctx.fillText(`Dash cooldown: ${Math.ceil(player.dashCooldownTimer / 60 * 100) / 100}s`, 10, 150);
    } else {
        ctx.fillText(`Dash READY: ${player.dashesAvailable} remaining (LB/RB or Q/E)`, 10, 150);
    }
    
    // Draw pause screen
    if (paused) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "40px Arial";
        ctx.fillText("PAUSED", canvas.width/2 - 80, canvas.height/2);
        ctx.font = "20px Arial";
        ctx.fillText("Press Escape or Start to resume", canvas.width/2 - 120, canvas.height/2 + 40);
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
    
    // Draw multiplier zone
    if (MULTIPLIER_ZONE.active) {
        const gradient = ctx.createRadialGradient(
            MULTIPLIER_ZONE.x, MULTIPLIER_ZONE.y, 0,
            MULTIPLIER_ZONE.x, MULTIPLIER_ZONE.y, MULTIPLIER_ZONE.radius + MULTIPLIER_ZONE.pulseSize
        );
        gradient.addColorStop(0, 'rgba(241, 196, 15, 0.2)');
        gradient.addColorStop(0.7, 'rgba(241, 196, 15, 0.1)');
        gradient.addColorStop(1, 'rgba(241, 196, 15, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(MULTIPLIER_ZONE.x, MULTIPLIER_ZONE.y, 
                MULTIPLIER_ZONE.radius + MULTIPLIER_ZONE.pulseSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw multiplier text
        ctx.fillStyle = 'rgba(241, 196, 15, 0.8)';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${MULTIPLIER_ZONE.multiplier}x`, MULTIPLIER_ZONE.x, MULTIPLIER_ZONE.y);
    }
    
    // Draw chain lightning
    for (const lightning of activeChainLightning) {
        const alpha = lightning.duration / CHAIN_LIGHTNING_DURATION;
        ctx.strokeStyle = `rgba(52, 152, 219, ${alpha})`;
        ctx.lineWidth = 2;
        
        for (const segment of lightning.segments) {
            ctx.beginPath();
            ctx.moveTo(segment.x1, segment.y1);
            ctx.lineTo(segment.x2, segment.y2);
            ctx.stroke();
        }
    }
    
    ctx.restore(); // Restore after screen shake
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
            createMovementTrail(); // Add trail creation
            updateMultiplierZone(); // Add multiplier zone update
            moveBalls();
            updateParticles();
            updateChainLightning(); // Add chain lightning update
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
    // Reset combo system
    comboMultiplier = 1;
    comboTimer = 0;
    comboAnimationScale = 1;
}

// Add combo text particle function
function createComboText(x, y, text) {
    particles.push({
        x: x,
        y: y,
        text: text,
        life: 60,
        type: 'comboText',
        speedY: -2,
        opacity: 1
    });
}

// Function to check for button press with Safari fixes
function isButtonPressed(gamepad, buttonIndex, gamepadId) {
    if (!gamepad || !gamepad.buttons || buttonIndex >= gamepad.buttons.length) return false;
    
    try {
        const button = gamepad.buttons[buttonIndex];
        const isPressed = getButtonState(button);
        
        // Ensure we have a previous state array for this gamepad
        if (!previousButtonStates[gamepadId]) {
            previousButtonStates[gamepadId] = Array(gamepad.buttons.length).fill(false);
        }
        
        const wasPressed = previousButtonStates[gamepadId][buttonIndex];
        
        // Update the previous state
        previousButtonStates[gamepadId][buttonIndex] = isPressed;
        
        // Only return true on the initial press (not while held)
        return isPressed && !wasPressed;
    } catch (e) {
        console.warn('Error checking button press:', e);
        return false;
    }
}

// Separate pause detection function
function checkPauseInput() {
    // Check gamepad pause button (button 9)
    if (gamepadConnected) {
        const pads = getGamepads();
        
        for (const gamepadId in gamepads) {
            const gamepad = pads[gamepadId];
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

// Enhanced trail creation function
function createMovementTrail() {
    const now = Date.now();
    if (now - lastTrailTime < TRAIL_INTERVAL) return;
    lastTrailTime = now;
    
    const isMoving = 
        (Math.abs(player.x - player.lastX) > 0.1 || 
         Math.abs(player.y - player.lastY) > 0.1);
    
    if (!isMoving && !player.isDashing) return;
    
    const trailColor = TRAIL_COLORS[Math.floor(Math.random() * TRAIL_COLORS.length)];
    particles.push({
        x: player.x + player.width/2,
        y: player.y + player.height/2,
        size: player.isDashing ? 12 : 8,
        speedX: 0,
        speedY: 0,
        color: trailColor,
        life: player.isDashing ? 20 : 15,
        type: 'trail',
        opacity: 0.7
    });
    
    // Store current position for next frame
    player.lastX = player.x;
    player.lastY = player.y;
}

// Add screen shake function
function addScreenShake(intensity, duration) {
    screenShake.intensity = Math.max(screenShake.intensity, intensity);
    screenShake.duration = Math.max(screenShake.duration, duration);
}

// Add chain lightning functions
function createChainLightning(sourceBall) {
    const nearbyBlueBalls = balls.filter(ball => 
        ball.isBonus && 
        ball !== sourceBall &&
        !ball.hasLightning &&
        getDistance(sourceBall, ball) < CHAIN_LIGHTNING_RANGE
    );
    
    nearbyBlueBalls.forEach(targetBall => {
        activeChainLightning.push({
            sourceX: sourceBall.x + sourceBall.width/2,
            sourceY: sourceBall.y + sourceBall.height/2,
            targetX: targetBall.x + targetBall.width/2,
            targetY: targetBall.y + targetBall.height/2,
            duration: CHAIN_LIGHTNING_DURATION,
            segments: generateLightningSegments(
                sourceBall.x + sourceBall.width/2,
                sourceBall.y + sourceBall.height/2,
                targetBall.x + targetBall.width/2,
                targetBall.y + targetBall.height/2
            )
        });
        targetBall.hasLightning = true;
        // Chain to next ball
        createChainLightning(targetBall);
    });
}

function generateLightningSegments(x1, y1, x2, y2) {
    const segments = [];
    const numSegments = 8;
    const maxOffset = 15;
    
    let prevX = x1;
    let prevY = y1;
    
    for (let i = 1; i <= numSegments; i++) {
        const t = i / numSegments;
        const baseX = x1 + (x2 - x1) * t;
        const baseY = y1 + (y2 - y1) * t;
        
        // Add random offset except for the last point
        const x = i === numSegments ? x2 : baseX + (Math.random() - 0.5) * maxOffset;
        const y = i === numSegments ? y2 : baseY + (Math.random() - 0.5) * maxOffset;
        
        segments.push({x1: prevX, y1: prevY, x2: x, y2: y});
        prevX = x;
        prevY = y;
    }
    
    return segments;
}

function updateChainLightning() {
    for (let i = activeChainLightning.length - 1; i >= 0; i--) {
        activeChainLightning[i].duration--;
        if (activeChainLightning[i].duration <= 0) {
            activeChainLightning.splice(i, 1);
        }
    }
}

// Add multiplier zone functions
function spawnMultiplierZone() {
    if (!MULTIPLIER_ZONE.active && Math.random() < 0.005) { // 0.5% chance per frame
        MULTIPLIER_ZONE.active = true;
        MULTIPLIER_ZONE.x = Math.random() * (canvas.width - MULTIPLIER_ZONE.radius * 2) + MULTIPLIER_ZONE.radius;
        MULTIPLIER_ZONE.y = Math.random() * (canvas.height - MULTIPLIER_ZONE.radius * 2) + MULTIPLIER_ZONE.radius;
        MULTIPLIER_ZONE.timer = MULTIPLIER_ZONE.duration;
        MULTIPLIER_ZONE.pulseSize = 0;
    }
}

function updateMultiplierZone() {
    spawnMultiplierZone();
    
    if (MULTIPLIER_ZONE.active) {
        MULTIPLIER_ZONE.timer--;
        MULTIPLIER_ZONE.pulseSize = 10 * Math.sin(Date.now() / 200);
        
        if (MULTIPLIER_ZONE.timer <= 0) {
            MULTIPLIER_ZONE.active = false;
        }
    }
}

// Helper function to check if a point is in the multiplier zone
function isInMultiplierZone(x, y) {
    if (!MULTIPLIER_ZONE.active) return false;
    
    const dx = x - MULTIPLIER_ZONE.x;
    const dy = y - MULTIPLIER_ZONE.y;
    return (dx * dx + dy * dy) <= MULTIPLIER_ZONE.radius * MULTIPLIER_ZONE.radius;
}

// Helper function to calculate distance between two objects
function getDistance(obj1, obj2) {
    const dx = (obj1.x + obj1.width/2) - (obj2.x + obj2.width/2);
    const dy = (obj1.y + obj1.height/2) - (obj2.y + obj2.height/2);
    return Math.sqrt(dx * dx + dy * dy);
}

// Start the game
update(); 