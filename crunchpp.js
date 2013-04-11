/* 
Released under MIT License
Copyright (C) 2013, Greg Linden (glinden@gmail.com)

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation files
(the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// Constants
var numParticles = 5;
var maxParticles = 200;
var PI2 = Math.PI * 2;
var worldSize = {x: 100, z: 100};
var worldHalfSize = {x: worldSize.x / 2, z: worldSize.z / 2};
var waveSize = {x: 8 / worldSize.x, z: 12 / worldSize.z};
var waveHeight = 500 / worldSize.z;
var waveSpeed = 8 / worldSize.z;
var particleSize = worldSize.z / 50;
var friction = 0.98;
var repelStrength = 0.02;
var randomMoveLikelihood = 0.01;
var randomMoveVelocity = 0.01;
var ambientEnergy = 0.04, playerHunger = -ambientEnergy;
var attackDistance = 5;
var playerAttack = ambientEnergy * 50, playerAttackPain = 0.1, carcassEnergy = 15;
var mouseAttraction = 0.0005, mouseVmax = 0.01;

// Globals
var particles = [], playerParticle, waveTick = 0;
var useWebGL = hasWebGL();
var level = 1;

// UI globals
var mouseLocation = {x: 0, y: 0};
var windowHalf = {x: window.innerWidth / 2, y: window.innerHeight / 2};

// Three JS graphics globals
var camera, scene, renderer, canvas, projector, pointLight;

// Convenience functions
function sq(x) { return x * x; }
function sqrt(x) { return Math.sqrt(x); }
function rand(x) { return Math.random(); }
function randInt(limit) { return Math.floor(Math.random() * limit); }
String.prototype.commafy = function() {
    return this.replace(/(.)(?=(.{3})+$)/g, "$1,");
};
String.prototype.decommafy = function() {
        return this.replace(/,/g, "");
};
Array.prototype.shuffle = function () {
    for (var i = this.length - 1; i > 0; i--) {
        var j = randInt(i + 1);
        var tmp = this[i];
        this[i] = this[j];
        this[j] = tmp;
    }
    return this;
}


function init() {
	scene = new THREE.Scene();

	// Put a camera above the world plane 
	camera = new THREE.PerspectiveCamera( 15, window.innerWidth / window.innerHeight, 1, 10000 );
	camera.position.z = worldSize.z / 20;
	camera.position.y = worldSize.z * 4.2;
	camera.lookAt( scene.position );
	projector = new THREE.Projector();

	// Add all the initial particles
	for (var i = 0; i < numParticles; i++) {
		particles.push(createParticle());
	}
	playerParticle = createParticle();
	particles.push(playerParticle);
	playerParticle.isPlayer = true;
	playerParticle.energy = 100;

	// Create a div for the canvas
	var container = document.createElement( 'div' );
	document.body.appendChild( container );
	canvas = document.createElement('canvas');
	// Create a canvas the size of the window and put it in the div
	if (useWebGL) {
		renderer = new THREE.WebGLRenderer( { antialias: true, canvas: canvas } )
		
		// Also add some lighting
		scene.add(new THREE.AmbientLight(0x333333));
		pointLight = new THREE.PointLight(0xffffff, 1);
		pointLight.position.set(0, 20, 0);
		scene.add(pointLight);
	} else {
		renderer = new THREE.CanvasRenderer( { canvas: canvas } );
	}
	renderer.setSize( window.innerWidth, window.innerHeight );
	container.appendChild( renderer.domElement );

	// Event handlers
	document.addEventListener( 'mousemove', onDocumentMouseMove, false );
	document.addEventListener( 'touchstart', onDocumentTouchStart, false );
	document.addEventListener( 'touchmove', onDocumentTouchMove, false );
	window.addEventListener( 'resize', onWindowResize, false );
}

function createParticle(x, z, energy) {
	var material;
	if (useWebGL) {
		material = new THREE.MeshPhongMaterial( { 
			specular: 0x666666,
			emissive: 0x111111,
		});
	} else {
		material = new THREE.ParticleCanvasMaterial( {
			program: function ( context ) {
				context.beginPath();
				context.arc( 0, 0, 1, 0, PI2, true );
				context.fill();
			}
		} );
	}
	// Set the color initially.  This will get changed later in update().
	material.color.setRGB(.1, .1, .1);

	var particle;
	if (useWebGL) {
		// Torus looks a little better than spheres.
		//var geometry = new THREE.SphereGeometry(particleSize, 32, 16);
		var geometry = new THREE.TorusGeometry(particleSize/2, particleSize/2, 32, 32);
		particle = new THREE.Mesh(geometry, material);
		// The torus needs to be rotated (delete if you switch back to spheres)
		particle.rotation.x = Math.PI / 2;
	} else {
		particle = new THREE.Particle(material);
		particle.scale.x = particle.scale.y = particleSize;
	}
	particle.position.x = (rand() * 2 - 1) * worldHalfSize.x;
	particle.position.z = (rand() * 2 - 1) * worldHalfSize.z;
	if (x !== undefined) { particle.position.x = x; }
	if (z !== undefined) { particle.position.z = z; }

	scene.add( particle );

	// Extra variables used by the simulation.
	// We could create a new class that holds the particles or keep the data
	// here separately, which would be cleaner if this was going to be a big
	// game and get more complicated, but this is fine for this small demo
	particle.velocity = {x: 0, y: 0, z: 0};
	particle.distances = [];
	particle.energy = 30 + 40 * rand();
	if (energy !== undefined) { particle.energy = energy; }

	return particle;
}

function onDocumentMouseMove( event ) {
	// Track the mouse when it moves
	mouseLocation.x = event.clientX - windowHalf.x;
	mouseLocation.y = event.clientY - windowHalf.y;
}

// Try to support mobile devices
function onDocumentTouchMove( event ) {
	if ( event.touches.length === 1 ) {
		mouseLocation.x = event.touches[0].pageX - windowHalf.x;
		mouseLocation.y = event.touches[0].pageY - windowHalf.y;

		event.preventDefault();
	}
}
function onDocumentTouchStart( event ) {
	// Treat the same as a TouchMove
	return onDocumentTouchMove(event);
}

function onWindowResize() {
	// Changing the window size requires adjustments to the camera
	windowHalf.x = window.innerWidth / 2;
	windowHalf.y = window.innerHeight / 2;

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );
}


function animate() {
	// This only works in very recent browsers.  And it doesn't ensure constant speed.  
	// Maybe we should go old school and use setTimeout() instead?
	requestAnimationFrame(animate);
	update();
	render();
}

function update() {
	// Main update loop

	// Did the player win this level or lose the game?
	if (gameOrLevelOver()) {
		// When this returns true, we're supposed to pause the game, so skip 
		// all the rest
		return;
	}

	// Food particle breed and die depending on their energy
	birthAndDeath();

	// Re-compute all distances of all particles to each other (need this later)
	recomputeDistances();

	// Main loop for updating the velocities and energies of the particles
 	particles.forEach(function(p, i) {
		// Run a little constraint system to adjust velocities for all particles 
		// to keep them away from each other 
		for (var j = i + 1; j < particles.length; j++) {
			var p2 = particles[j];
			var dist = p.distances[j];
			if (dist < particleSize * 2.2) {  // 2.2 is twice radius plus a 10% fudge factor
				var vx = (p.position.x - p2.position.x) * repelStrength / particleSize;
				var vz = (p.position.z - p2.position.z) * repelStrength / particleSize;
				p.velocity.x += vx;
				p.velocity.z += vz;
				p2.velocity.x -= vx;
				p2.velocity.z -= vz;
			} 
		}

		// Update player energies, sizes, color, including allowing player to attack
		if (p.isPlayer) {
			// Player particle

			// Update player energy, starting with the cost of being alive
			p.energy += playerHunger;  // Negative ambient energy for player

			// Attack something nearby.  Player can only attack one enemy at a time,
			// which makes it hard to attack large groups (intentionally).
			var killedSomething = false;
			var preyCandidates = [];
			for (var j = 0; j < particles.length; j++) {
				if (i == j) { continue; }
				var dist = p.distances[j];
				// Find nearby prey
				if (dist < particleSize * attackDistance) {
					preyCandidates.push(j);
				}
			}
			if (preyCandidates.length > 0) {
				// Attack one nearby particle, picking it randomly
				preyCandidates.shuffle();
				
				var p2 = particles[preyCandidates[0]];
				// Hurt nearby prey, taking some damage for doing so.
				var attackStrength = playerAttack;
				p.energy -= attackStrength * playerAttackPain;
				p2.energy -=  attackStrength;
				if (p2.energy <= 0) {
					// Food has died, time to eat, give us a big boost in energy
					p.energy += carcassEnergy;
					p2.dead = true;
					killedSomething = true;
				}
			}
			if (killedSomething) {
				var sound = document.getElementById('audio-eating');
				sound.volume = 0.1;
				sound.currentTime = 0;
				sound.play();
			}

			// Max out player energy at 200
			p.energy = Math.min(p.energy, 200);

			// Move player toward mouse/touch
			// We need to convert from screen coordinates to game coordinates to do this
			// We can use unproject vector, but need a missing Z coordinate to use that.
			// The correct way is to pick an arbitrary Z value, unproject it, raycast from it
			// to the camera, find the intersection with the game plane, and then finally get
			// the correct transform.
			// But let's do this short cut and find the Z value by projecting the player (in
			// game coordinates) to the screen, getting a Z value from that, then unproject
			// the mouse (in screen coordinates) to the game using that Z value.
			var v2 = p.position.clone(); 
			projector.projectVector(v2, camera);
			var vector = new THREE.Vector3(mouseLocation.x / windowHalf.x,
										   -mouseLocation.y / windowHalf.y,
										   v2.z);
			projector.unprojectVector(vector, camera);
			// Now that we know the mouse position in game coordinates, accelerate the
			// player toward the mouse.  Vary the speed based on distance, but limit the 
			// max speed the player can go.
			var vx = (p.position.x - vector.x) * mouseAttraction;
			var vz = (p.position.z - vector.z) * mouseAttraction;
			vx = Math.max(Math.min(vx, mouseVmax), -mouseVmax);
			vz = Math.max(Math.min(vz, mouseVmax), -mouseVmax);
			p.velocity.x -= vx;
			p.velocity.z -= vz;

			// Set player color and size based on energy
			// Set player color based on energy in range [0, 100], getting dim as player is dying
			p.material.color.r = 0.1 + 0.9 * Math.max(Math.min(p.energy, 100), 0) / 100;
			// Player gets bigger as energy goes above 100 up to a maximum of 20% bigger at 200
			var scale = 1 + Math.min(Math.max(p.energy - 100, 0) / 100, 1) * .2;
			// Player gets smaller as energy goes below 40 to a maximum of 60% smaller
			scale -= .6 * Math.max(40 - p.energy, 0) / 40;
			if (useWebGL) {
				p.scale = new THREE.Vector3(scale, scale, scale);
			} else {
				p.scale.x = p.scale.y = particleSize * scale;
			}
			
		} else {
			// Food particles

			// Sometimes randomly move particles
			if (rand() < randomMoveLikelihood) {
				p.velocity.x += randomMoveVelocity * (rand() * 2 - 1);
				p.velocity.z += randomMoveVelocity * (rand() * 2 - 1);
			}

			// Update a particle's energy based on incoming sunlight
			p.energy += ambientEnergy;
			// Limit energy to the range [0, 100]
			p.energy = Math.max(Math.min(p.energy, 100), 0);

			// Set particle color based on its energy, getting much brighter when about
			// to reproduce
			p.material.color.g = 0.1 + 0.9 * sq(p.energy / 100);
			// Particles that are about to die get smaller (sometimes small enough they 
			// are hard to see and get away, which is intentional)
			var scale = Math.min(p.energy + 1, 20) / 20;
			if (useWebGL) {
				p.scale = new THREE.Vector3(scale, scale, scale);
			} else {
				p.scale.x = p.scale.y = particleSize * scale;
			}
		}
	});	
	
	// Finally run a little physics sim to move particles based on their new velocities
	updateParticlePositions();

	// Update the player score
	document.getElementById('score').textContent = 'Energy: ' + Math.ceil(playerParticle.energy);
}

function updateParticlePositions() {
	// Update x and z positions based on velocity
 	particles.forEach(function(p) {
		// Apply friction to velocity
		p.velocity.x *= friction;
		p.velocity.z *= friction;

		// Move based on velocity
		p.position.x += p.velocity.x;
		p.position.z += p.velocity.z;

		// Limit to edges of map
		p.position.x = Math.max(-worldHalfSize.x, Math.min(worldHalfSize.x, p.position.x));
		p.position.z = Math.max(-worldHalfSize.z, Math.min(worldHalfSize.z, p.position.z));
	});

	// Adjust the y positions to create the effect of being in waves on the water
 	particles.forEach(function(p) {
		p.position.y = waveHeight * ( Math.sin((p.position.x + waveTick) * waveSize.x) + Math.sin((p.position.z + waveTick) * waveSize.z));
	});
	waveTick += waveSpeed;
}

function recomputeDistances() {
	// Re-compute all distances between all particles (which we'll need later)
 	particles.forEach(function(p, i) {
		for (var j = i + 1; j < particles.length; j++) {
			var p2 = particles[j];
			var dist = sqrt(sq(p.position.x - p2.position.x) + sq(p.position.z - p2.position.z));
			p.distances[j] = p2.distances[i] = dist;
		}
	});
}

// Returns true if the caller should pause the game
function gameOrLevelOver() {
	// Check level over or game over conditions
	if (particles.length <= 1) {
		// Level is over when all the food has been eaten.  Put up congrats,
		// go to next level, increase difficulty
		
		var div = document.getElementById('complete');
		var opacity = Number(div.style.opacity);
		if (opacity >= 1) {
			// We just detected level is done.  Make the div visible
			div.style.display = "block";
			div.style.opacity = .99;
			document.getElementById('audio-complete').play();
		} else if (opacity <= .2) {
			// We're done displaying this.  Move on to the next level
			div.style.display = "none";
			div.style.opacity = 1;
			nextLevel();
		} else {
			div.style.opacity = opacity - .008;
		}

		return false;
	} else if (playerParticle.energy <= 0) {
		// Game is over when player runs out of energy.  Put up game over,
		// restart after a while

		var div = document.getElementById('gameover');
		var opacity = Number(div.style.opacity);
		if (opacity >= 1) {
			// We just detected game over.  Make the div visible
			div.style.display = "block";
			div.style.opacity = .99;
			document.getElementById('audio-game-over').play();
		} else if (opacity <= .2) {
			// We're done displaying this.  Restart the game from the beginning
			div.style.display = "none";
			div.style.opacity = 1;
			newGame();
		} else {
			div.style.opacity = opacity - .004;
		}

		return true;
	}
	return false;
}

function newGame() {
	// Update the level
	level = 1;
	document.getElementById('level').textContent = 'Level ' + level;

	// Reset the player
	playerParticle.energy = 100;

	// Delete all the old particles
 	particles.forEach(function(p) {
		if (p != playerParticle) {
			scene.remove(p);
		}
	});
	particles = [playerParticle];
		
	// Add new particles
	for (var i = 0; i < numParticles; i++) {
		particles.push(createParticle());
	}
}	


function nextLevel() {
	// Update the level
	level += 1;
	document.getElementById('level').textContent = 'Level ' + level;

	// Add new particles, more for each new level
	for (var i = 0; i < numParticles * level; i++) {
		particles.push(createParticle());
	}
}

function birthAndDeath() {
	// Time to be born or die

	// Here comes the Reaper...
	var i = 0;
	while (i < particles.length) {
		var p = particles[i];
		if (!p.isPlayer && p.dead) {
			particles.splice(i, 1);
			scene.remove(p);
		} else {
			i++;
		}
	}

	// And the Stork...
	var particlesToReplicate = [];
 	particles.forEach(function(p, i) {
		if (!p.isPlayer) {
			if (p.energy >= 100) {
				// Limit the maximum number of particles in the game
				if (particles.length + particlesToReplicate.length < maxParticles) {
					particlesToReplicate.push(i);
				}
			}
		}
	});
	if (particlesToReplicate.length > 0) {
		var sound = document.getElementById('audio-breed');
		sound.volume = 0.1;
		sound.currentTime = 0;
		sound.play();
	}
	particlesToReplicate.forEach(function(i) {
		var p = particles[i];
		// The mother particle loses some energy and moves a bit to the side
		p.energy = 70;
		var dx = (rand() * 2 - 1);
		if (dx < 0) { dx -= 0.9; } else { dx += 0.9; }
		dx *= particleSize;
		var dz = (rand() * 2 - 1);
		if (dz < 0) { dz -= 0.9; } else { dz += 0.9; }
		dz *= particleSize;
		p.position.x += dx;
		p.position.z += dz;
		// Create the child with part of the energy and off to the side of the mother
		particles.push(createParticle(p.position.x - dx, p.position.z - dz, 30));
	});
}

function render() {
	renderer.render( scene, camera );
}

function hasWebGL() {
	try { 
		return !!window.WebGLRenderingContext && !!document.createElement('canvas').getContext('experimental-webgl'); 
	} catch( e ) { 
		return false; 
	} 
}



// Start the game

init();
animate();

