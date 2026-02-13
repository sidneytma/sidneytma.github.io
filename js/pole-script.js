import React, { useEffect, useRef, useState } from 'react';

const FallingPoleSimulation = () => {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const renderRef = useRef(null);
  const runnerRef = useRef(null);
  const audioContextRef = useRef(null);
  const lastSoundTimeRef = useRef(0);
  const activeNodesRef = useRef([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Create a synthetic impulse response for reverb
  const createReverbBuffer = (ctx, duration = 2, decay = 3) => {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const leftChannel = impulse.getChannelData(0);
    const rightChannel = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
      // Create decaying white noise for reverb tail
      const n = Math.random() * 2 - 1;
      const decayFactor = Math.exp(-i / (sampleRate * decay));
      leftChannel[i] = n * decayFactor;
      rightChannel[i] = n * decayFactor;
    }
    
    return impulse;
  };

  // Create a metallic impact sound using Web Audio API
  const playImpactSound = (velocity) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    const ctx = audioContextRef.current;
    const now = ctx.currentTime;

    // Stop all currently playing sounds (interrupt previous collision)
    activeNodesRef.current.forEach(node => {
      try {
        node.stop();
      } catch (e) {
        // Node might already be stopped
      }
    });
    activeNodesRef.current = [];

    // Calculate volume based on impact velocity
    const volume = Math.min(0.4, Math.sqrt(velocity) / 10);
    
    // Create multiple harmonic oscillators for metallic sound
    const fundamentalFreq = 180;
    const harmonics = [
      { freq: fundamentalFreq, gain: 1.0 },      // Fundamental
      { freq: fundamentalFreq * 2.3, gain: 0.6 }, // 2nd harmonic (slightly inharmonic)
      { freq: fundamentalFreq * 4.1, gain: 0.4 }, // 3rd harmonic
      { freq: fundamentalFreq * 6.7, gain: 0.25 } // 4th harmonic
    ];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, now);
    // Long decay - 2 seconds
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
    
    // Create convolver for reverb
    const convolver = ctx.createConvolver();
    convolver.buffer = createReverbBuffer(ctx, 2.5, 2);
    
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.4; // Reverb amount
    
    // Dry signal (direct)
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.7;
    masterGain.connect(dryGain);
    dryGain.connect(ctx.destination);
    
    // Wet signal (reverb)
    masterGain.connect(convolver);
    convolver.connect(reverbGain);
    reverbGain.connect(ctx.destination);

    // Create each harmonic oscillator
    harmonics.forEach(harmonic => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.frequency.setValueAtTime(harmonic.freq, now);
      gainNode.gain.setValueAtTime(harmonic.gain, now);
      
      osc.connect(gainNode);
      gainNode.connect(masterGain);
      
      osc.start(now);
      osc.stop(now + 2.0);
      activeNodesRef.current.push(osc);
    });

    // Add noise burst for initial impact
    const bufferSize = ctx.sampleRate * 0.3;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }
    
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(800, now);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    
    noiseSource.start(now);
    noiseSource.stop(now + 0.3);
    activeNodesRef.current.push(noiseSource);
  };

  const createSimulation = () => {
    if (!window.Matter || !canvasRef.current) return;

    const Matter = window.Matter;
    const { Engine, Render, Runner, Bodies, Composite, Body, Events } = Matter;

    // Clean up existing simulation
    if (engineRef.current) {
      Render.stop(renderRef.current);
      Runner.stop(runnerRef.current);
      Engine.clear(engineRef.current);
    }

    // Reset last sound time
    lastSoundTimeRef.current = 0;

    // Create engine
    const engine = Engine.create();
    engineRef.current = engine;

    // Create renderer
    const render = Render.create({
      canvas: canvasRef.current,
      engine: engine,
      options: {
        width: 800,
        height: 600,
        wireframes: false,
        background: '#1a1a2e'
      }
    });
    renderRef.current = render;

    // Room dimensions
    const wallThickness = 20;
    const roomWidth = 800;
    const roomHeight = 600;

    // Create walls
    const floor = Bodies.rectangle(
      roomWidth / 2,
      roomHeight - wallThickness / 2,
      roomWidth,
      wallThickness,
      { isStatic: true, render: { fillStyle: '#16213e' }, label: 'wall' }
    );

    const leftWall = Bodies.rectangle(
      wallThickness / 2,
      roomHeight / 2,
      wallThickness,
      roomHeight,
      { isStatic: true, render: { fillStyle: '#16213e' }, label: 'wall' }
    );

    const rightWall = Bodies.rectangle(
      roomWidth - wallThickness / 2,
      roomHeight / 2,
      wallThickness,
      roomHeight,
      { isStatic: true, render: { fillStyle: '#16213e' }, label: 'wall' }
    );

    const ceiling = Bodies.rectangle(
      roomWidth / 2,
      wallThickness / 2,
      roomWidth,
      wallThickness,
      { isStatic: true, render: { fillStyle: '#16213e' }, label: 'wall' }
    );

    // Create pole with random properties
    const poleWidth = 15;
    const poleLength = 200;
    
    const randomX = 200 + Math.random() * 400;
    const randomY = 100 + Math.random() * 200;
    const randomAngle = Math.random() * Math.PI * 2;
    const randomVelocityX = (Math.random() - 0.5) * 10;
    const randomVelocityY = Math.random() * 5;
    const randomAngularVelocity = (Math.random() - 0.5) * 0.3;

    const pole = Bodies.rectangle(randomX, randomY, poleLength, poleWidth, {
      restitution: 0.6,
      friction: 0.3,
      density: 0.002,
      render: {
        fillStyle: '#e94560'
      },
      label: 'pole'
    });

    Body.setVelocity(pole, { x: randomVelocityX, y: randomVelocityY });
    Body.setAngularVelocity(pole, randomAngularVelocity);
    Body.setAngle(pole, randomAngle);

    // Add all bodies to the world
    Composite.add(engine.world, [floor, leftWall, rightWall, ceiling, pole]);

    // Listen for collisions
    Events.on(engine, 'collisionStart', (event) => {
      const pairs = event.pairs;
      const currentTime = Date.now();
      
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        
        // Check if collision involves the pole and a wall
        const isPoleCollision = 
          (pair.bodyA.label === 'pole' && pair.bodyB.label === 'wall') ||
          (pair.bodyA.label === 'wall' && pair.bodyB.label === 'pole');
        
        if (isPoleCollision) {
          const poleBody = pair.bodyA.label === 'pole' ? pair.bodyA : pair.bodyB;
          
          // Calculate impact velocity magnitude
          const velocity = poleBody.velocity;
          const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
          const angularSpeed = Math.abs(poleBody.angularVelocity);
          const totalImpact = speed + angularSpeed * 50; // Weight angular velocity
          
          // Only play sound if impact is strong enough and enough time has passed
          const minImpact = 0.1;
          const minTimeBetweenSounds = 2; // milliseconds
          
          if (totalImpact > minImpact && (currentTime - lastSoundTimeRef.current) > minTimeBetweenSounds) {
            playImpactSound(totalImpact);
            lastSoundTimeRef.current = currentTime;
          }
        }
      }
    });

    // Run the engine and renderer
    const runner = Runner.create();
    runnerRef.current = runner;
    Runner.run(runner, engine);
    Render.run(render);
  };

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js';
    script.async = true;
    script.onload = () => {
      setIsLoaded(true);
      createSimulation();
    };
    document.body.appendChild(script);

    return () => {
      if (engineRef.current && renderRef.current && runnerRef.current) {
        window.Matter.Render.stop(renderRef.current);
        window.Matter.Runner.stop(runnerRef.current);
        window.Matter.Engine.clear(engineRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const handleRestart = () => {
    createSimulation();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-8">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-white mb-2">Falling Pole Simulation</h1>
        <p className="text-gray-400 text-center">Watch and listen as the metal pole falls with random initial conditions</p>
      </div>
      
      <div className="border-4 border-gray-700 rounded-lg overflow-hidden shadow-2xl mb-4">
        <canvas ref={canvasRef} />
      </div>
      
      <button
        onClick={handleRestart}
        disabled={!isLoaded}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold rounded-lg shadow-lg transition-colors duration-200"
      >
        Restart Simulation
      </button>
      
      <div className="mt-4 text-gray-400 text-sm text-center max-w-md">
        <p className="mb-2">Each restart randomizes starting conditions</p>
        <p className="text-xs">🔊 Sound plays on impact based on collision velocity</p>
      </div>
    </div>
  );
};
