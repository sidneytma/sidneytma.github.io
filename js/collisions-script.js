
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // State
    let mode = 'mechanical'; // 'mechanical' or 'electromagnetic'
    let soundModel = 'energyless'; // 'realistic' or 'energyless'
    let inelasticity = 1.0; // coefficient of restitution for mechanical, drag for EM
    let timeSpeed = 1.0;
    let masterVolume = 1.0;
    let balls = [];
    let audioContext = null;

    const radius = 20;
    const charge = 1;
    const k = 30000;

    // C major scale
    const notes = [
        { name: 'C', freq: 261.63, color: '#FF0000' },
        { name: 'D', freq: 293.66, color: '#FF7F00' },
        { name: 'E', freq: 329.63, color: '#FFFF00' },
        { name: 'F', freq: 349.23, color: '#00FF00' },
        { name: 'G', freq: 392.00, color: '#0000FF' },
        { name: 'A', freq: 440.00, color: '#4B0082' },
        { name: 'B', freq: 493.88, color: '#9400D3' },
        { name: 'C2', freq: 523.25, color: '#FF0000' }
    ];

    // Initialize audio
    canvas.addEventListener('click', () => {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (mode === 'electromagnetic') {
                balls.forEach(ball => ball.startSound());
            }
        }
    }, { once: true });

    class Ball {
        constructor(x, y, vx, vy, note) {
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = vy;
            this.radius = radius;
            this.mass = radius * radius;
            this.charge = charge;
            this.note = note;
            this.color = note.color;
            this.frequency = note.freq;
            this.currentForce = 0;
            
            // Audio (for electromagnetic mode)
            this.oscillator = null;
            this.gainNode = null;
            this.panNode = null;
        }

        startSound() {
            if (!audioContext || this.oscillator || mode !== 'electromagnetic') return;
            
            this.oscillator = audioContext.createOscillator();
            this.gainNode = audioContext.createGain();
            this.panNode = audioContext.createStereoPanner();
            
            this.oscillator.connect(this.gainNode);
            this.gainNode.connect(this.panNode);
            this.panNode.connect(audioContext.destination);
            
            this.oscillator.frequency.value = this.frequency;
            this.oscillator.type = 'triangle';
            this.gainNode.gain.value = 0;
            
            this.oscillator.start();
        }

        stopSound() {
            if (this.oscillator) {
                this.oscillator.stop();
                this.oscillator = null;
                this.gainNode = null;
                this.panNode = null;
            }
        }

        updateSound() {
            if (!this.gainNode || !this.panNode) return;
            
            let volume;
            if (soundModel === 'realistic') {
                // Volume proportional to force AND drag (energy loss)
                volume = Math.min(0.5, this.currentForce * inelasticity) * masterVolume;
            } else {
                // Energyless: constant volume when force present
                volume = Math.min(0.5, (0.005 * this.currentForce) * masterVolume);
            }
            
            const now = audioContext.currentTime;
            this.gainNode.gain.linearRampToValueAtTime(volume, now + 0.05);
            
            const pan = (this.x / width) * 2 - 1;
            this.panNode.pan.value = pan;
        }

        applyForce(fx, fy) {
            this.currentForce = Math.sqrt(fx * fx + fy * fy);
            
            const ax = fx / this.mass;
            const ay = fy / this.mass;
            this.vx += ax * timeSpeed;
            this.vy += ay * timeSpeed;
            
            // Drag for electromagnetic mode (applies in both realistic and energyless)
            if (mode === 'electromagnetic' && inelasticity > 0) {
                const energyLoss = 1 - (this.currentForce * inelasticity);
                this.vx *= Math.max(0, energyLoss);
                this.vy *= Math.max(0, energyLoss);
            }
        }

        update() {
            this.x += this.vx * timeSpeed;
            this.y += this.vy * timeSpeed;

            // Wall bounces
            if (this.x - this.radius < 0) {
                this.x = this.radius;
                if (mode === 'mechanical') {
                    this.vx = Math.abs(this.vx);
                    if (soundModel === 'energyless') {
                        playPluck(this.frequency, this.x);
                    }
                } else {
                    this.vx = 0; // EM mode: stop at wall
                }
            }
            if (this.x + this.radius > width) {
                this.x = width - this.radius;
                if (mode === 'mechanical') {
                    this.vx = -Math.abs(this.vx);
                    if (soundModel === 'energyless') {
                        playPluck(this.frequency, this.x);
                    }
                } else {
                    this.vx = 0; // EM mode: stop at wall
                }
            }
            if (this.y - this.radius < 0) {
                this.y = this.radius;
                if (mode === 'mechanical') {
                    this.vy = Math.abs(this.vy);
                    if (soundModel === 'energyless') {
                        playPluck(this.frequency, this.x);
                    }
                } else {
                    this.vy = 0; // EM mode: stop at wall
                }
            }
            if (this.y + this.radius > height) {
                this.y = height - this.radius;
                if (mode === 'mechanical') {
                    this.vy = -Math.abs(this.vy);
                    if (soundModel === 'energyless') {
                        playPluck(this.frequency, this.x);
                    }
                } else {
                    this.vy = 0; // EM mode: stop at wall
                }
            }
            
            if (mode === 'electromagnetic') {
                this.updateSound();
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function playPluck(frequency, xPosition, volume = null) {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const finalVolume = volume !== null ? volume * masterVolume : 0.15 * masterVolume;
        if (finalVolume < 0.01) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const panNode = audioContext.createStereoPanner();
        
        const pan = (xPosition / width) * 2 - 1;
        panNode.pan.value = pan;
        
        oscillator.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'triangle';
        
        const now = audioContext.currentTime;
        gainNode.gain.setValueAtTime(finalVolume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        
        oscillator.start(now);
        oscillator.stop(now + 0.2);
    }

    function checkCollision(ball1, ball2) {
        const dx = ball2.x - ball1.x;
        const dy = ball2.y - ball1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < ball1.radius + ball2.radius;
    }

    function resolveCollision(ball1, ball2) {
        const dx = ball2.x - ball1.x;
        const dy = ball2.y - ball1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance === 0) return 0;
        
        const nx = dx / distance;
        const ny = dy / distance;
        const tx = -ny;
        const ty = nx;
        
        const overlap = (ball1.radius + ball2.radius - distance) / 2;
        ball1.x -= overlap * nx;
        ball1.y -= overlap * ny;
        ball2.x += overlap * nx;
        ball2.y += overlap * ny;
        
        const v1n = ball1.vx * nx + ball1.vy * ny;
        const v1t = ball1.vx * tx + ball1.vy * ty;
        const v2n = ball2.vx * nx + ball2.vy * ny;
        const v2t = ball2.vx * tx + ball2.vy * ty;
        
        const vRelBefore = v1n - v2n;
        
        const m1 = ball1.mass;
        const m2 = ball2.mass;
        const e = inelasticity;
        
        const v1nNew = (m1 * v1n + m2 * v2n + m2 * e * (v2n - v1n)) / (m1 + m2);
        const v2nNew = (m1 * v1n + m2 * v2n + m1 * e * (v1n - v2n)) / (m1 + m2);
        
        ball1.vx = v1nNew * nx + v1t * tx;
        ball1.vy = v1nNew * ny + v1t * ty;
        ball2.vx = v2nNew * nx + v2t * tx;
        ball2.vy = v2nNew * ny + v2t * ty;
        
        // Calculate volume for realistic mode
        const reducedMass = (m1 * m2) / (m1 + m2);
        const energyLossFactor = 1 - e * e;
        const impactSpeed = Math.abs(vRelBefore);
        const volume = Math.min(0.3, energyLossFactor * impactSpeed * reducedMass * 0.02);
        
        return volume;
    }

    function calculateCoulombForces() {
        const forces = balls.map(() => ({ fx: 0, fy: 0 }));

        // Ball-ball forces
        for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
                const dx = balls[j].x - balls[i].x;
                const dy = balls[j].y - balls[i].y;
                const distSq = dx * dx + dy * dy;
                const dist = Math.sqrt(distSq);

                const effectiveDist = Math.max(dist, radius * 0.5);
                const effectiveDistSq = effectiveDist * effectiveDist;

                const forceMag = k * balls[i].charge * balls[j].charge / effectiveDistSq;

                const fx = (dx / dist) * forceMag;
                const fy = (dy / dist) * forceMag;

                forces[i].fx -= fx;
                forces[i].fy -= fy;
                forces[j].fx += fx;
                forces[j].fy += fy;
            }
            
            // Wall forces
            const ball = balls[i];
            
            const distLeft = ball.x;
            const effectiveDistLeft = Math.max(distLeft, radius * 0.5);
            const forceLeft = k * ball.charge * charge / (effectiveDistLeft * effectiveDistLeft);
            forces[i].fx += forceLeft;
            
            const distRight = width - ball.x;
            const effectiveDistRight = Math.max(distRight, radius * 0.5);
            const forceRight = k * ball.charge * charge / (effectiveDistRight * effectiveDistRight);
            forces[i].fx -= forceRight;
            
            const distTop = ball.y;
            const effectiveDistTop = Math.max(distTop, radius * 0.5);
            const forceTop = k * ball.charge * charge / (effectiveDistTop * effectiveDistTop);
            forces[i].fy += forceTop;
            
            const distBottom = height - ball.y;
            const effectiveDistBottom = Math.max(distBottom, radius * 0.5);
            const forceBottom = k * ball.charge * charge / (effectiveDistBottom * effectiveDistBottom);
            forces[i].fy -= forceBottom;
        }

        for (let i = 0; i < balls.length; i++) {
            balls[i].applyForce(forces[i].fx, forces[i].fy);
        }
    }

    function reset() {
        balls.forEach(ball => ball.stopSound());
        balls = [];
        
        const count = parseInt(document.getElementById('ballCount').value);
        
        for (let i = 0; i < count; i++) {
            let x, y;
            let attempts = 0;
            
            do {
                x = radius + Math.random() * (width - 2 * radius);
                y = radius + Math.random() * (height - 2 * radius);
                attempts++;
            } while (attempts < 100 && balls.some(ball => {
                const dx = ball.x - x;
                const dy = ball.y - y;
                return Math.sqrt(dx * dx + dy * dy) < radius * 2 + 10;
            }));
            
            const speed = mode === 'mechanical' ? 4 : 2;
            const vx = (Math.random() - 0.5) * speed;
            const vy = (Math.random() - 0.5) * speed;
            
            const randomNote = notes[Math.floor(Math.random() * notes.length)];
            balls.push(new Ball(x, y, vx, vy, randomNote));
        }
        
        if (audioContext && mode === 'electromagnetic') {
            balls.forEach(ball => ball.startSound());
        }
    }

    function animate() {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        if (mode === 'mechanical') {
            for (let ball of balls) {
                ball.update();
            }

            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    if (checkCollision(balls[i], balls[j])) {
                        const volume = resolveCollision(balls[i], balls[j]);
                        if (soundModel === 'realistic') {
                            playPluck(balls[i].frequency, balls[i].x, volume);
                            playPluck(balls[j].frequency, balls[j].x, volume);
                        } else {
                            playPluck(balls[i].frequency, balls[i].x, 0.15);
                            playPluck(balls[j].frequency, balls[j].x, 0.15);
                        }
                    }
                }
            }
        } else {
            calculateCoulombForces();
            for (let ball of balls) {
                ball.update();
            }
        }

        for (let ball of balls) {
            ball.draw();
        }

        requestAnimationFrame(animate);
    }

    // UI Controls
    document.getElementById('mechanicalBtn').addEventListener('click', () => {
        if (mode === 'mechanical') return;
        mode = 'mechanical';
        document.getElementById('mechanicalBtn').classList.add('active');
        document.getElementById('electromagneticBtn').classList.remove('active');
        
        // Switch to CoR mode and set to 1
        inelasticity = 1.0;
        document.getElementById('inelasticity').value = 1.0;
        document.getElementById('inelasticity').min = 0;
        document.getElementById('inelasticity').max = 1;
        document.getElementById('inelasticity').step = 0.01;
        document.getElementById('inelasticityLabel').innerHTML = 'Coefficient of Restitution: <span class="value-display" id="inelasticityVal">1.00</span>';
        reset();
    });

    document.getElementById('electromagneticBtn').addEventListener('click', () => {
        if (mode === 'electromagnetic') return;
        mode = 'electromagnetic';
        document.getElementById('electromagneticBtn').classList.add('active');
        document.getElementById('mechanicalBtn').classList.remove('active');
        
        // Switch to drag mode and set to 0
        inelasticity = 0.0;
        document.getElementById('inelasticity').value = 0.0;
        document.getElementById('inelasticity').min = 0;
        document.getElementById('inelasticity').max = 0.01;
        document.getElementById('inelasticity').step = 0.0001;
        document.getElementById('inelasticityLabel').innerHTML = 'Drag: <span class="value-display" id="inelasticityVal">0.0000</span>';
        reset();
    });

    document.getElementById('realisticBtn').addEventListener('click', () => {
        soundModel = 'realistic';
        document.getElementById('realisticBtn').classList.add('active');
        document.getElementById('energylessBtn').classList.remove('active');
    });

    document.getElementById('energylessBtn').addEventListener('click', () => {
        soundModel = 'energyless';
        document.getElementById('energylessBtn').classList.add('active');
        document.getElementById('realisticBtn').classList.remove('active');
    });

    document.getElementById('inelasticity').addEventListener('input', (e) => {
        inelasticity = parseFloat(e.target.value);
        const valSpan = document.getElementById('inelasticityVal');
        if (mode === 'mechanical') {
            valSpan.textContent = inelasticity.toFixed(2);
        } else {
            valSpan.textContent = inelasticity.toFixed(4);
        }
    });

    document.getElementById('speed').addEventListener('input', (e) => {
        timeSpeed = parseFloat(e.target.value) * 3;
        document.getElementById('speedVal').textContent = e.target.value + 'x';
    });

    document.getElementById('ballCount').addEventListener('input', (e) => {
        document.getElementById('ballCountVal').textContent = e.target.value;
    });

    document.getElementById('volume').addEventListener('input', (e) => {
        masterVolume = parseFloat(e.target.value);
        document.getElementById('volumeVal').textContent = Math.round(masterVolume * 100) + '%';
    });

    document.getElementById('resetBtn').addEventListener('click', reset);

    reset();
    animate();
